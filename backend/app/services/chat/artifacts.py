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
        return "nexora-artifact"
    cleaned = "".join(c if c.isalnum() or c in {"-", "_"} else "-" for c in value.strip())
    cleaned = "-".join(filter(None, cleaned.split("-")))
    return (cleaned or "nexora-artifact")[:64]


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
) -> dict:
    """Write ``blob`` to the artifact store and return its metadata.

    Returned dict shape:
        {
          "artifact_id": str,
          "filename":    str,    # human-readable, safe for Content-Disposition
          "format":      str,    # echo of fmt
          "size_bytes":  int,
          "created_at":  ISO8601 string,
          "download_url": str,   # ``/api/chat/artifacts/{id}?token=...``
          "expires_at":   ISO8601 string,
        }
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
    }
    meta_path.write_text(json.dumps(meta), encoding="utf-8")

    token, exp = issue_download_token(
        artifact_id=artifact_id, tenant_key=tenant_key, owner_email=owner_email,
    )
    return {
        "artifact_id": artifact_id,
        "filename": filename,
        "format": fmt,
        "size_bytes": len(blob),
        "created_at": created_at,
        "download_url": f"/api/chat/artifacts/{artifact_id}?token={token}",
        "expires_at": exp.isoformat(),
    }


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
        "``chart`` code-fences are all supported (charts render as their "
        "title only since live chart images aren't available in this path; "
        "tables and prose render natively in every format). "
        "For pptx, each top-level heading becomes a slide title and each "
        "table/chart gets its own slide. "
        "Returns ``download_url`` (short-lived) and ``filename`` — quote "
        "the URL back to the user as a Markdown link so they can click to "
        "download."
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
            "content_markdown": {
                "type": "string",
                "description": (
                    "The full document body as Markdown. Include headings, "
                    "tables, lists, and any chart blocks. The user does not "
                    "see this text — it goes straight into the file."
                ),
            },
        },
        "required": ["format", "content_markdown"],
    },
}


# Short hint appended to the workbook / dataset system prompts so the model
# learns the tool is available without having to re-discover it each turn.
BUILD_ARTIFACT_PROMPT_HINT = (
    "\n\nWhen the user asks to export, download, save, or otherwise produce "
    "a file (PowerPoint deck, Word document, PDF) from the analysis, call "
    "the `build_artifact` tool. Pass the full document body as Markdown in "
    "`content_markdown` (headings, tables, bullet lists, and chart blocks "
    "are all supported). After the tool returns, include the `download_url` "
    "in your reply as a Markdown link so the user can click to download."
)
