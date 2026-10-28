"""Chat artifact store + ``build_artifact`` tool definition.

The chat assistant can produce binary outputs (PPTX/DOCX/PDF) mid-conversation
by calling the ``build_artifact`` tool. The tool handler renders the bytes
using the existing exporters in ``services/chat/export.py``, persists them
to disk under a per-tenant / per-user directory, and returns a short-lived
signed download URL the assistant can hand back to the user.

Ownership model mirrors workbooks:

    {CHAT_ARTIFACT_DIR}/{tenant_key}/{sha256(owner_email)}/{artifact_id}.{ext}
    {CHAT_ARTIFACT_DIR}/{tenant_key}/{sha256(owner_email)}/{artifact_id}.meta.json

* Tenant boundary: directory is keyed by ``tenant_key`` — two tenants
  cannot reach into each other's artifacts even with a forged id.
* User boundary: the second segment is the sha256 of the owner's email,
  so a leaked id from one user is useless to another.
* Bound on disk usage: per-user count cap + per-artifact byte cap, plus
  a TTL sweep on every new write.

Download tokens are JWTs signed with ``settings.SECRET_KEY`` using the
``JWT_ALGORITHM`` already in use for login. Reusing the platform secret means
deployments don't need to rotate a second key — and the artifact tokens
become invalid the moment the platform secret is rotated, which matches
how the rest of the auth surface behaves.
"""
from __future__ import annotations

import hashlib
import io
import json
import logging
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import jwt

from ...core.config import settings


logger = logging.getLogger("nexora.chat.artifacts")


class ArtifactError(Exception):
    """Base class for artifact-layer failures."""


class ArtifactNotFound(ArtifactError):
    """Artifact id doesn't exist, expired, or doesn't belong to the caller."""


class ArtifactTokenInvalid(ArtifactError):
    """Download token failed signature, expiry, or audience checks."""


class ArtifactQuotaExceeded(ArtifactError):
    """Per-user artifact count or size cap would be exceeded."""


# ── Format registry ─────────────────────────────────────────────────────────

# Single source of truth for the formats the build_artifact tool accepts.
# Keep this aligned with the literal in the tool's input_schema below — the
# Anthropic API enforces the enum on the model's side, but the handler
# re-validates so a stale schema can't crash the export.
ARTIFACT_FORMATS: dict[str, dict[str, str]] = {
    "pptx": {
        "ext": "pptx",
        "mime": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    },
    "docx": {
        "ext": "docx",
        "mime": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    },
    "pdf": {
        "ext": "pdf",
        "mime": "application/pdf",
    },
}


# ── Paths ───────────────────────────────────────────────────────────────────

def _data_root() -> Path:
    return Path(settings.CHAT_ARTIFACT_DIR).resolve()


def _owner_dir(tenant_key: str, owner_email: str) -> Path:
    digest = hashlib.sha256(owner_email.encode("utf-8")).hexdigest()
    return _data_root() / tenant_key / digest


def _artifact_paths(tenant_key: str, owner_email: str, artifact_id: str, ext: str) -> tuple[Path, Path]:
    base = _owner_dir(tenant_key, owner_email)
    return base / f"{artifact_id}.{ext}", base / f"{artifact_id}.meta.json"


# ── Signed download tokens ──────────────────────────────────────────────────

# The JWT carries everything the download endpoint needs to authorise without
# a DB lookup: who, what, where (tenant), and when it expires. The endpoint
# still re-checks ownership on disk so a forged token signed with the right
# key (impossible without leaking SECRET_KEY) still can't escalate.
_TOKEN_TYPE = "chat_artifact_download"


def issue_download_token(
    *, artifact_id: str, tenant_key: str, owner_email: str
) -> tuple[str, datetime]:
    """Mint a short-lived JWT scoped to a single artifact + owner.

    Returns (token, expiry). The expiry datetime is informational — the
    actual enforcement happens inside the JWT ``exp`` claim.
    """
    now = int(time.time())
    exp = now + settings.CHAT_ARTIFACT_DOWNLOAD_TTL_SECONDS
    payload = {
        "typ": _TOKEN_TYPE,
        "aid": artifact_id,
        "tk": tenant_key,
        "sub": owner_email,
        "iat": now,
        "exp": exp,
    }
    token = jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return token, datetime.fromtimestamp(exp, tz=timezone.utc)


def verify_download_token(token: str, *, expected_artifact_id: str) -> tuple[str, str]:
    """Decode a download token and return ``(tenant_key, owner_email)``.

    Raises ``ArtifactTokenInvalid`` on any signature/expiry/scope mismatch.
    The expected_artifact_id is matched against the token's ``aid`` claim so
    a token issued for artifact A cannot be replayed to fetch artifact B.
    """
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except jwt.ExpiredSignatureError as exc:
        raise ArtifactTokenInvalid("Download link expired.") from exc
    except jwt.InvalidTokenError as exc:
        raise ArtifactTokenInvalid("Invalid download link.") from exc

    if payload.get("typ") != _TOKEN_TYPE:
        raise ArtifactTokenInvalid("Token is not a download token.")
    if payload.get("aid") != expected_artifact_id:
        raise ArtifactTokenInvalid("Token does not match artifact.")
    tenant_key = payload.get("tk")
    owner_email = payload.get("sub")
    if not tenant_key or not owner_email:
        raise ArtifactTokenInvalid("Token missing required claims.")
    return tenant_key, owner_email


# ── Filenames ───────────────────────────────────────────────────────────────

def _safe_filename_slug(value: Optional[str]) -> str:
    """Reduce ``value`` to a filename-safe slug. Mirrors the chat export
    sanitizer — kept independent so this module doesn't depend on routes."""
    if not value:
        return "arc8-artifact"
    cleaned = "".join(c if c.isalnum() or c in {"-", "_"} else "-" for c in value.strip())
    cleaned = "-".join(filter(None, cleaned.split("-")))
    return (cleaned or "arc8-artifact")[:64]


# ── Quota + cleanup ─────────────────────────────────────────────────────────

def _list_artifact_files(owner_dir: Path) -> list[Path]:
    if not owner_dir.exists():
        return []
    return [p for p in owner_dir.iterdir() if p.is_file() and p.suffix != ".json"]


def _delete_artifact_files(owner_dir: Path, artifact_id: str) -> None:
    for path in owner_dir.glob(f"{artifact_id}.*"):
        try:
            path.unlink()
        except FileNotFoundError:
            pass
        except OSError as exc:
            logger.warning("artifact_unlink_failed", extra={"path": str(path), "error": str(exc)})


def _cleanup_expired(owner_dir: Path) -> None:
    """Best-effort TTL sweep over a single owner's directory.

    Called opportunistically from ``persist_artifact`` so disk doesn't fill
    in the absence of a dedicated cleanup worker. Failures here never
    propagate to callers — a stuck file is preferable to a failed export.
    """
    cutoff = time.time() - settings.CHAT_ARTIFACT_TTL_SECONDS
    for path in _list_artifact_files(owner_dir):
        try:
            if path.stat().st_mtime < cutoff:
                aid = path.stem
                _delete_artifact_files(owner_dir, aid)
        except OSError as exc:
            logger.warning("artifact_cleanup_failed", extra={"path": str(path), "error": str(exc)})


def _enforce_count_quota(owner_dir: Path) -> None:
    cap = settings.CHAT_ARTIFACT_MAX_PER_USER
    files = _list_artifact_files(owner_dir)
    if len(files) < cap:
        return
    # Evict oldest first so the user always has room for a new export.
    files.sort(key=lambda p: p.stat().st_mtime)
    overflow = len(files) - cap + 1
    for path in files[:overflow]:
        _delete_artifact_files(owner_dir, path.stem)


# ── Persistence ─────────────────────────────────────────────────────────────

def persist_artifact(
    *,
    tenant_key: str,
    owner_email: str,
    fmt: str,
    blob: bytes,
    title: Optional[str],
    stats: Optional[dict] = None,
    thumbnail_png: Optional[bytes] = None,
) -> dict:
    """Write ``blob`` (and optional sidecar thumbnail) to the artifact store
    and return its metadata.

    ``stats`` is a free-form dict the caller may use to record build telemetry
    (slide count, chart count, render duration, template name). It's stored
    verbatim on the meta sidecar and surfaced by ``load_meta`` so the
    frontend artifact card can show it without re-parsing the file.

    ``thumbnail_png`` is an optional preview tile written next to the
    artifact under ``{id}.thumb.png``. The download endpoint serves it via
    a separate token-gated URL.
    """
    if fmt not in ARTIFACT_FORMATS:
        raise ArtifactError(f"Unsupported format: {fmt!r}")
    if len(blob) > settings.CHAT_ARTIFACT_MAX_BYTES:
        raise ArtifactQuotaExceeded(
            f"Artifact exceeds {settings.CHAT_ARTIFACT_MAX_BYTES // (1024 * 1024)} MB cap."
        )

    spec = ARTIFACT_FORMATS[fmt]
    owner_dir = _owner_dir(tenant_key, owner_email)
    owner_dir.mkdir(parents=True, exist_ok=True)

    _cleanup_expired(owner_dir)
    _enforce_count_quota(owner_dir)

    artifact_id = uuid.uuid4().hex
    bin_path, meta_path = _artifact_paths(tenant_key, owner_email, artifact_id, spec["ext"])

    bin_path.write_bytes(blob)

    has_thumbnail = False
    if thumbnail_png:
        try:
            thumb_path = owner_dir / f"{artifact_id}.thumb.png"
            thumb_path.write_bytes(thumbnail_png)
            has_thumbnail = True
        except OSError as exc:
            logger.warning("artifact_thumbnail_write_failed", extra={
                "artifact_id": artifact_id, "error": str(exc),
            })

    slug = _safe_filename_slug(title)
    filename = f"{slug}.{spec['ext']}"
    created_at = datetime.now(timezone.utc).isoformat()
    meta = {
        "artifact_id": artifact_id,
        "tenant_key": tenant_key,
        "owner_email": owner_email,
        "format": fmt,
        "mime": spec["mime"],
        "filename": filename,
        "title": (title or "").strip()[:200],
        "size_bytes": len(blob),
        "created_at": created_at,
        "has_thumbnail": has_thumbnail,
        "stats": stats or {},
    }
    meta_path.write_text(json.dumps(meta), encoding="utf-8")

    token, exp = issue_download_token(
        artifact_id=artifact_id, tenant_key=tenant_key, owner_email=owner_email,
    )
    base_url = f"/api/chat/artifacts/{artifact_id}"
    return {
        "artifact_id": artifact_id,
        "filename": filename,
        "format": fmt,
        "size_bytes": len(blob),
        "created_at": created_at,
        "download_url": f"{base_url}?token={token}",
        "meta_url": f"{base_url}/meta?token={token}",
        "thumbnail_url": f"{base_url}/thumbnail.png?token={token}" if has_thumbnail else None,
        "expires_at": exp.isoformat(),
        "stats": stats or {},
    }


def load_thumbnail(
    *, tenant_key: str, owner_email: str, artifact_id: str
) -> bytes:
    """Return the sidecar thumbnail PNG for an artifact. Raises
    ``ArtifactNotFound`` if no thumbnail was persisted."""
    owner_dir = _owner_dir(tenant_key, owner_email)
    thumb_path = owner_dir / f"{artifact_id}.thumb.png"
    meta_path = owner_dir / f"{artifact_id}.meta.json"
    if not meta_path.exists() or not thumb_path.exists():
        raise ArtifactNotFound("Thumbnail not found.")
    # Enforce TTL via the binary's mtime (the binary, not the thumb, is the
    # source of truth for the artifact's age).
    try:
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        spec = ARTIFACT_FORMATS.get(meta.get("format") or "")
        if spec:
            bin_path = owner_dir / f"{artifact_id}.{spec['ext']}"
            if bin_path.exists():
                age = time.time() - bin_path.stat().st_mtime
                if age > settings.CHAT_ARTIFACT_TTL_SECONDS:
                    raise ArtifactNotFound("Artifact expired.")
    except (OSError, json.JSONDecodeError):
        pass
    return thumb_path.read_bytes()


def load_meta(
    *, tenant_key: str, owner_email: str, artifact_id: str
) -> dict:
    """Return the metadata sidecar for an artifact (without the bytes).

    Useful for the frontend artifact card, which needs title / slide count /
    file size to render but doesn't want to download the full file.
    """
    owner_dir = _owner_dir(tenant_key, owner_email)
    meta_path = owner_dir / f"{artifact_id}.meta.json"
    if not meta_path.exists():
        raise ArtifactNotFound("Artifact not found.")
    try:
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ArtifactNotFound("Artifact metadata unreadable.") from exc
    return meta


# ── Refining an existing artifact ───────────────────────────────────────────

def overwrite_artifact_blob(
    *,
    tenant_key: str,
    owner_email: str,
    artifact_id: str,
    new_blob: bytes,
    stats_patch: Optional[dict] = None,
    thumbnail_png: Optional[bytes] = None,
) -> dict:
    """Replace the bytes of an existing artifact in-place.

    Used by the ``refine_artifact_slide`` tool to avoid spawning a fresh
    artifact_id (and a fresh download URL) for every revision — the model
    can iteratively improve a deck while the user keeps the original link.
    Size/quota checks still apply.

    Returns the same shape as ``persist_artifact`` minus a fresh
    download_url (the existing token continues to work).
    """
    if len(new_blob) > settings.CHAT_ARTIFACT_MAX_BYTES:
        raise ArtifactQuotaExceeded(
            f"Artifact exceeds {settings.CHAT_ARTIFACT_MAX_BYTES // (1024 * 1024)} MB cap."
        )

    meta = load_meta(tenant_key=tenant_key, owner_email=owner_email, artifact_id=artifact_id)
    spec = ARTIFACT_FORMATS.get(meta.get("format") or "")
    if not spec:
        raise ArtifactNotFound("Artifact format unrecognised.")

    owner_dir = _owner_dir(tenant_key, owner_email)
    bin_path = owner_dir / f"{artifact_id}.{spec['ext']}"
    if not bin_path.exists():
        raise ArtifactNotFound("Artifact body missing.")
    bin_path.write_bytes(new_blob)

    if thumbnail_png:
        try:
            (owner_dir / f"{artifact_id}.thumb.png").write_bytes(thumbnail_png)
            meta["has_thumbnail"] = True
        except OSError as exc:
            logger.warning("artifact_thumbnail_update_failed", extra={
                "artifact_id": artifact_id, "error": str(exc),
            })

    meta["size_bytes"] = len(new_blob)
    meta["updated_at"] = datetime.now(timezone.utc).isoformat()
    existing_stats = meta.get("stats") or {}
    if stats_patch:
        existing_stats.update(stats_patch)
        existing_stats["revisions"] = (existing_stats.get("revisions", 0) or 0) + 1
        meta["stats"] = existing_stats

    meta_path = owner_dir / f"{artifact_id}.meta.json"
    meta_path.write_text(json.dumps(meta), encoding="utf-8")

    # Re-issue a token so the model gets a fresh URL even though the
    # artifact_id is unchanged. Cheap to mint and aligns expiry with the
    # new revision rather than the original create.
    token, exp = issue_download_token(
        artifact_id=artifact_id, tenant_key=tenant_key, owner_email=owner_email,
    )
    base_url = f"/api/chat/artifacts/{artifact_id}"
    return {
        "artifact_id": artifact_id,
        "filename": meta.get("filename"),
        "format": meta.get("format"),
        "size_bytes": len(new_blob),
        "created_at": meta.get("created_at"),
        "updated_at": meta.get("updated_at"),
        "download_url": f"{base_url}?token={token}",
        "meta_url": f"{base_url}/meta?token={token}",
        "thumbnail_url": (
            f"{base_url}/thumbnail.png?token={token}" if meta.get("has_thumbnail") else None
        ),
        "expires_at": exp.isoformat(),
        "stats": meta.get("stats") or {},
    }


# ── Thumbnail renderer ──────────────────────────────────────────────────────

def render_thumbnail_png(
    *,
    title: str,
    fmt: str,
    slide_count: int,
    chart_count: int,
    primary_color: tuple[int, int, int] = (0xD9, 0x77, 0x06),
    eyebrow: str = "ARC-8",
) -> Optional[bytes]:
    """Compose a small preview tile for the chat artifact card.

    This is a *synthesised* preview — we don't try to rasterise the real
    pptx (which would require LibreOffice or a similar headless office
    runtime). Instead we draw a tile that resembles a slide thumbnail:
    coloured accent bar, eyebrow label, big title text, a faint horizontal
    rule, and a metadata strip. It reads as "a deck preview" without
    needing 200 MB of LibreOffice in the container image.

    Returns ``None`` on any rendering failure so a thumbnail miss doesn't
    block the artifact save.
    """
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:  # pragma: no cover
        return None

    try:
        width, height = 640, 360  # 16:9 at low DPI; CSS scales to display
        img = Image.new("RGB", (width, height), color=(255, 255, 255))
        draw = ImageDraw.Draw(img)

        # Accent stripe (top).
        draw.rectangle([(0, 0), (width, 10)], fill=primary_color)

        # Eyebrow label.
        eyebrow_font = _load_font(["arialbd.ttf", "DejaVuSans-Bold.ttf"], size=18) or ImageFont.load_default()
        draw.text((28, 40), eyebrow.upper(), fill=primary_color, font=eyebrow_font)

        # Title — wrap to two lines max so very long titles don't overflow.
        title_font = _load_font(["arialbd.ttf", "DejaVuSans-Bold.ttf"], size=34) or ImageFont.load_default()
        wrapped = _wrap_for_pil(title or "Untitled", title_font, max_width=width - 56, max_lines=2)
        y = 80
        for line in wrapped:
            draw.text((28, y), line, fill=(17, 24, 39), font=title_font)
            y += 42

        # Accent rule under the title.
        draw.rectangle([(28, max(y + 4, 175)), (28 + 80, max(y + 4, 175) + 4)], fill=primary_color)

        # Metadata strip — slides, charts, format chip.
        meta_font = _load_font(["arial.ttf", "DejaVuSans.ttf"], size=16) or ImageFont.load_default()
        meta = f"{slide_count} slide" + ("s" if slide_count != 1 else "")
        if chart_count:
            meta += f"  ·  {chart_count} chart" + ("s" if chart_count != 1 else "")
        meta += f"  ·  .{fmt}"
        draw.text((28, height - 56), meta, fill=(75, 85, 99), font=meta_font)

        # Bottom themed band, mirroring the cover slide's signature element.
        draw.rectangle([(0, height - 22), (width, height)], fill=primary_color)

        buf = io.BytesIO()
        img.save(buf, format="PNG", optimize=True)
        return buf.getvalue()
    except Exception as exc:  # noqa: BLE001
        logger.warning("artifact_thumbnail_render_failed: %s: %s", type(exc).__name__, exc)
        return None


def _load_font(candidates: list[str], *, size: int):
    """Try a list of well-known font filenames in order, returning the first
    that PIL can resolve. PIL searches common system font directories on
    Windows / Linux / macOS so we don't need explicit paths."""
    try:
        from PIL import ImageFont
    except ImportError:  # pragma: no cover
        return None
    for name in candidates:
        try:
            return ImageFont.truetype(name, size=size)
        except (OSError, IOError):
            continue
    return None


def _wrap_for_pil(text: str, font, *, max_width: int, max_lines: int) -> list[str]:
    """Greedy line wrap that respects the font's pixel width. PIL's
    ``textbbox`` measures the actual rendered width so titles in narrow
    fonts (Verdana) and wide fonts (Arial Black) both wrap cleanly."""
    from PIL import ImageDraw, Image

    measurer = ImageDraw.Draw(Image.new("RGB", (1, 1)))

    def width_of(s: str) -> int:
        box = measurer.textbbox((0, 0), s, font=font)
        return box[2] - box[0]

    words = text.split()
    lines: list[str] = []
    current = ""
    for w in words:
        candidate = (current + " " + w).strip()
        if width_of(candidate) <= max_width:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = w
        if len(lines) >= max_lines:
            break
    if current and len(lines) < max_lines:
        lines.append(current)
    if not lines:
        lines = [text]
    # Truncate the last line if we exhausted the line budget mid-text.
    if len(words) > sum(len(line.split()) for line in lines):
        last = lines[-1]
        while width_of(last + "…") > max_width and last:
            last = last[:-1]
        lines[-1] = last + "…"
    return lines


def load_artifact(
    *, tenant_key: str, owner_email: str, artifact_id: str
) -> tuple[bytes, dict]:
    """Read an artifact's bytes + metadata. Raises ``ArtifactNotFound`` if
    the id doesn't exist for this (tenant, owner) pair, or if it expired and
    has been swept."""
    owner_dir = _owner_dir(tenant_key, owner_email)
    if not owner_dir.exists():
        raise ArtifactNotFound("Artifact not found.")

    meta_path = owner_dir / f"{artifact_id}.meta.json"
    if not meta_path.exists():
        raise ArtifactNotFound("Artifact not found.")

    try:
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ArtifactNotFound("Artifact metadata unreadable.") from exc

    spec = ARTIFACT_FORMATS.get(meta.get("format") or "")
    if not spec:
        raise ArtifactNotFound("Artifact format unrecognised.")

    bin_path = owner_dir / f"{artifact_id}.{spec['ext']}"
    if not bin_path.exists():
        raise ArtifactNotFound("Artifact body missing.")

    # Reject after TTL even if the cleanup sweep hasn't run yet.
    age = time.time() - bin_path.stat().st_mtime
    if age > settings.CHAT_ARTIFACT_TTL_SECONDS:
        raise ArtifactNotFound("Artifact expired.")

    return bin_path.read_bytes(), meta


# ── build_artifact tool ─────────────────────────────────────────────────────

BUILD_ARTIFACT_TOOL = {
    "name": "build_artifact",
    "description": (
        "Render a downloadable PowerPoint (pptx), Word (docx), or PDF file "
        "from Markdown content. Use this when the user asks to 'export', "
        "'download', 'save', 'create a deck/slides/report/document', or "
        "otherwise wants the result as a file rather than chat text. "
        "Provide the full content as Markdown in ``content_markdown`` — "
        "headings, paragraphs, bullet lists, GitHub-flavored tables, and "
        "``chart`` code-fences are all supported. Charts are rendered "
        "server-side from the chart-block JSON spec (matplotlib), so they "
        "appear as real images in the file, not placeholders. "
        "For pptx: each top-level heading becomes a slide title; tables "
        "and charts each get their own slide; speaker notes can be "
        "attached by inserting an HTML comment of the form "
        "``<!-- notes: ... -->`` directly under the heading they belong "
        "to (the note text lands in the slide's notes pane, never on the "
        "visible slide). "
        "Pick ``template`` to match the audience: ``executive_summary`` "
        "for board-ready decks, ``dashboard`` for KPI tile decks, "
        "``roadmap`` for timeline/milestone decks, ``analysis`` for "
        "longer-form analytical decks, ``default`` otherwise. "
        "Returns ``download_url`` (short-lived), ``filename``, "
        "``thumbnail_url``, and ``stats`` (slide_count, chart_count, "
        "render_ms). Quote the download_url back to the user as a Markdown "
        "link so they can click to download."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "format": {
                "type": "string",
                "enum": ["pptx", "docx", "pdf"],
                "description": "Output file format.",
            },
            "title": {
                "type": "string",
                "description": (
                    "Human-readable document title. Used as the cover-slide "
                    "title (pptx), document title (docx/pdf), and the basis "
                    "of the download filename."
                ),
            },
            "template": {
                "type": "string",
                "enum": ["default", "executive_summary", "dashboard", "roadmap", "analysis"],
                "description": (
                    "Visual + structural template. Defaults to 'default'. "
                    "Pick to match the audience and content shape — see "
                    "tool description for guidance."
                ),
            },
            "content_markdown": {
                "type": "string",
                "description": (
                    "The full document body as Markdown. Include headings, "
                    "tables, lists, and any chart blocks. Use HTML comments "
                    "``<!-- notes: ... -->`` to attach speaker notes to a "
                    "section (pptx only). The user does not see this text — "
                    "it goes straight into the file."
                ),
            },
        },
        "required": ["format", "content_markdown"],
    },
}


REVISE_ARTIFACT_TOOL = {
    "name": "revise_artifact",
    "description": (
        "Update an existing artifact you previously created via "
        "``build_artifact``. The full revised markdown is re-rendered and "
        "overwrites the artifact in place — the download URL the user "
        "already has is reissued with a fresh expiry but the artifact_id "
        "and filename are preserved. Use this when the user asks to "
        "tweak / edit / fix / rerun a previous deck or document rather "
        "than producing a brand new one, so they don't end up with two "
        "near-duplicate links."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "artifact_id": {
                "type": "string",
                "description": (
                    "The ``artifact_id`` returned by an earlier "
                    "``build_artifact`` call in this conversation."
                ),
            },
            "title": {
                "type": "string",
                "description": "Optional updated document title.",
            },
            "template": {
                "type": "string",
                "enum": ["default", "executive_summary", "dashboard", "roadmap", "analysis"],
                "description": "Optional new template. Omit to keep the original.",
            },
            "content_markdown": {
                "type": "string",
                "description": (
                    "Full revised Markdown body. The file is rebuilt from "
                    "this content — do not send only a diff."
                ),
            },
        },
        "required": ["artifact_id", "content_markdown"],
    },
}


# Short hint appended to the workbook / dataset system prompts so the model
# learns the tool is available without having to re-discover it each turn.
BUILD_ARTIFACT_PROMPT_HINT = (
    "\n\nWhen the user asks to export, download, save, or otherwise produce "
    "a file (PowerPoint deck, Word document, PDF) from the analysis, call "
    "the `build_artifact` tool. Pass the full document body as Markdown in "
    "`content_markdown`. Charts render server-side as real images, so "
    "include any data visualisations as ```chart {...}``` blocks. Add "
    "speaker notes as `<!-- notes: ... -->` directly under the heading "
    "they describe (pptx only). Pick a `template` that matches the "
    "audience (executive_summary, dashboard, roadmap, analysis, default). "
    "After the tool returns, include the `download_url` in your reply "
    "as a Markdown link so the user can click to download. "
    "If the user then asks to edit or revise that deck, call "
    "`revise_artifact` with the same `artifact_id` rather than building "
    "a brand new one — the user's existing link will start serving the "
    "updated version."
)
