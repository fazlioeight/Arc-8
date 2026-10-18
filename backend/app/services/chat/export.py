"""Chat conversation → Word/PDF export.

Renders a conversation (user prompts + assistant replies) into a downloadable
document. Markdown is the source of truth — we parse it with the standard
``markdown`` package, walk the resulting HTML with BeautifulSoup, and emit
two format-specific outputs:

  * **DOCX** — ``python-docx`` (already a dependency for upload handling).
  * **PDF**  — ``reportlab`` (pure Python, no system libraries required so
    the slim container image stays slim).

Chart code blocks (```` ```chart {...} ```` ) are special-cased: the frontend
captures each rendered Chart.js canvas as a base64 PNG and sends a map of
``{chart_id: data_url}``. When the renderer hits a chart block, it inserts
the corresponding image; if the client forgot to capture it (or capture
failed), it falls back to a textual placeholder so the export never crashes.

Design choices:
  - **Two parallel walkers, not a shared builder abstraction.** docx + pdf
    diverge enough on layout primitives (page break, table cell styling,
    image sizing) that a "DocBuilder" interface would leak both APIs.
    Two ~200 LOC functions are easier to maintain than one 400 LOC builder
    plus two adapters.
  - **No external markdown extensions beyond stdlib.** The chat output is
    GitHub-flavored markdown; the standard ``markdown.extensions.tables`` +
    ``fenced_code`` covers what users see in practice.
"""
from __future__ import annotations

import base64
import io
import logging
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Iterable, Optional, Sequence

from . import chart_renderer


log = logging.getLogger("nexora.chat.export")


# ── Theming ─────────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class ExportTheme:
    """Visual theme applied to a render pass.

    Carries per-tenant branding (palette + accent colour + optional caption)
    and the structural template selector. Defaults reproduce the original
    Nexora orange look so call sites that don't pass a theme keep working
    unchanged.

    ``template`` controls *structural* variations (cover slide layout, slide
    grammar, default body density), while ``palette`` controls *colour*. The
    two are deliberately orthogonal — a tenant with their own colours can use
    any template, and a template renders consistently across palettes.
    """

    palette: tuple[str, ...] = chart_renderer.DEFAULT_PALETTE
    primary_color: tuple[int, int, int] = (0xD9, 0x77, 0x06)
    primary_color_dark: tuple[int, int, int] = (0xB4, 0x53, 0x09)
    caption: str = "Nexora Lab  ·  Confidential  ·  Internal use"
    eyebrow: str = "NEXORA"
    template: str = "default"
    logo_png: Optional[bytes] = None  # raw PNG bytes for the cover slide


DEFAULT_THEME = ExportTheme()


def _hex_to_rgb(value: str) -> Optional[tuple[int, int, int]]:
    """Parse ``#RRGGBB`` (case-insensitive, optional leading ``#``). Returns
    ``None`` for malformed input so callers can fall back to defaults."""
    if not value:
        return None
    s = value.strip().lstrip("#")
    if len(s) != 6:
        return None
    try:
        return int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16)
    except ValueError:
        return None


def theme_from_branding(branding: Optional[dict], *, template: str = "default") -> ExportTheme:
    """Build an :class:`ExportTheme` from a tenant's ``branding`` JSON.

    ``branding`` is the JSON payload stored on the Tenant row — keys:
    ``primary_color`` (hex), ``secondary_color`` (hex), ``palette`` (list of
    hex), ``caption`` (str), ``eyebrow`` (str). Missing or malformed keys
    fall through to the Nexora defaults so a partial config can't crash the
    export.
    """
    if not isinstance(branding, dict):
        return ExportTheme(template=template)

    primary = _hex_to_rgb(str(branding.get("primary_color") or ""))
    dark = _hex_to_rgb(str(branding.get("secondary_color") or ""))

    raw_palette = branding.get("palette")
    palette: tuple[str, ...]
    if isinstance(raw_palette, list) and raw_palette:
        cleaned = [str(c).strip() for c in raw_palette if isinstance(c, str) and c.strip()]
        palette = tuple(cleaned) or chart_renderer.DEFAULT_PALETTE
    elif primary:
        # If the tenant supplied a single primary colour, lead the palette
        # with it and keep the rest of the default rotation for variety.
        palette = (f"#{primary[0]:02X}{primary[1]:02X}{primary[2]:02X}",) + chart_renderer.DEFAULT_PALETTE[1:]
    else:
        palette = chart_renderer.DEFAULT_PALETTE

    caption = str(branding.get("caption") or ExportTheme.caption)
    eyebrow = str(branding.get("eyebrow") or ExportTheme.eyebrow)

    logo_b64 = branding.get("logo_png_base64")
    logo_bytes: Optional[bytes] = None
    if isinstance(logo_b64, str) and logo_b64.strip():
        try:
            logo_bytes = base64.b64decode(logo_b64.strip(), validate=False)
            if len(logo_bytes) > 2 * 1024 * 1024:
                logo_bytes = None  # cap so a huge logo can't bloat decks
        except Exception:  # noqa: BLE001
            logo_bytes = None

    return ExportTheme(
        palette=palette,
        primary_color=primary or ExportTheme.primary_color,
        primary_color_dark=dark or ExportTheme.primary_color_dark,
        caption=caption,
        eyebrow=eyebrow,
        template=template or "default",
        logo_png=logo_bytes,
    )


# ── Chart image resolution ──────────────────────────────────────────────────


def _resolve_chart_image_bytes(
    *,
    chart_id: str,
    chart_idx: int,
    chart_specs: list[dict],
    charts: dict,
    theme: ExportTheme,
) -> Optional[bytes]:
    """Return PNG bytes for a chart, preferring client-captured pixels.

    Order of preference:
      1. Client-captured image (passed in via ``charts``) — pixel-identical
         to what the user saw on screen, so the deck matches the chat.
      2. Server-rendered matplotlib image from the spec — used by the
         ``build_artifact`` tool path where no canvas exists.
      3. ``None`` — caller renders a textual placeholder.
    """
    captured = charts.get(chart_id, "")
    decoded = _decode_chart_image(captured) if captured else None
    if decoded is not None:
        return decoded

    spec = chart_specs[chart_idx] if 0 <= chart_idx < len(chart_specs) else None
    if isinstance(spec, dict):
        try:
            return chart_renderer.render_chart_png(spec, palette=theme.palette)
        except Exception as exc:  # noqa: BLE001
            log.warning("server_chart_render_failed",
                        extra={"chart_id": chart_id, "error": str(exc)})
    return None


# ── Speaker notes ───────────────────────────────────────────────────────────

# Speaker notes are emitted by the model as HTML comments of the form
# ``<!-- notes: ... -->`` attached underneath the heading or paragraph they
# describe. They never appear on-slide; they flow into the pptx notes pane.
_NOTES_BLOCK_RE = re.compile(r"<!--\s*notes:\s*([\s\S]*?)-->", re.IGNORECASE)


def _extract_notes_for_section(markdown_src: str, heading_text: str) -> Optional[str]:
    """Find the first ``<!-- notes: ... -->`` block that follows ``heading_text``
    in ``markdown_src``. Returns the note body (stripped) or None if no
    notes block appears within the section.
    """
    if not markdown_src or not heading_text:
        return None
    heading_pos = markdown_src.find(heading_text)
    if heading_pos < 0:
        return None
    tail = markdown_src[heading_pos:]
    match = _NOTES_BLOCK_RE.search(tail)
    if not match:
        return None
    return match.group(1).strip() or None


class ExportError(RuntimeError):
    """Raised on render failures. Routes map to 500 (server fault) since
    the request itself validated; this means our rendering pipeline broke."""


# ── Public API ──────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class ExportMessage:
    """Internal value object the renderers consume. Decoupled from the
    Pydantic schema so the service stays unit-testable without dragging in
    FastAPI/pydantic at the test level."""

    role: str
    content: str
    timestamp: Optional[str] = None
    model: Optional[str] = None
    file: Optional[str] = None


def export_to_docx(
    *,
    messages: list[ExportMessage],
    charts: dict[str, str] | None = None,
    title: Optional[str] = None,
    theme: Optional[ExportTheme] = None,
) -> bytes:
    """Render ``messages`` as a .docx file. Returns the raw bytes."""
    theme = theme or DEFAULT_THEME
    try:
        from docx import Document
        from docx.enum.text import WD_ALIGN_PARAGRAPH
        from docx.shared import Inches, Pt, RGBColor
    except ImportError as exc:  # pragma: no cover
        raise ExportError(
            "python-docx is required for docx export. Add it to requirements.txt."
        ) from exc

    doc = Document()
    _apply_default_docx_styles(doc, Pt, RGBColor)

    # Title page header.
    doc_title = title or "Nexora Chat Transcript"
    header = doc.add_heading(doc_title, level=0)
    header.alignment = WD_ALIGN_PARAGRAPH.LEFT
    meta = doc.add_paragraph()
    meta_run = meta.add_run(
        f"Generated {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')} · "
        f"{len(messages)} message{'s' if len(messages) != 1 else ''}"
    )
    meta_run.font.size = Pt(9)
    meta_run.font.color.rgb = RGBColor(0x66, 0x66, 0x66)

    for msg_idx, msg in enumerate(messages):
        _docx_render_message(doc, msg, msg_idx, charts or {}, Pt, RGBColor, theme)

    buf = io.BytesIO()
    try:
        doc.save(buf)
    except Exception as exc:  # noqa: BLE001
        raise ExportError(f"Failed to write docx: {exc}") from exc
    return buf.getvalue()


def export_to_pptx(
    *,
    messages: list[ExportMessage],
    charts: dict[str, str] | None = None,
    title: Optional[str] = None,
    theme: Optional[ExportTheme] = None,
) -> bytes:
    """Render ``messages`` as a .pptx presentation. Returns the raw bytes.

    Deck shape:
      * 1 title slide (deck title + timestamp)
      * Per assistant message:
          - 1 "text slide" with the message's prose body
            (title derived from the preceding user prompt, or the first
             heading inside the assistant message, falling back to
             "Response N"). Tables and chart sentinels are stripped from
             the body so the textbox only contains paragraphs + lists.
          - 1 slide per chart (title = chart's own title; image centred)
          - 1 slide per table (title = "Data" + index; native pptx table)

    User prompts are *not* separate slides — they only inform titles, which
    keeps the deck length proportional to the assistant's output (the part
    a clinician or exec actually wants to present).
    """
    try:
        from pptx import Presentation
        from pptx.util import Inches, Pt, Emu
        from pptx.dml.color import RGBColor
    except ImportError as exc:  # pragma: no cover
        raise ExportError(
            "python-pptx is required for pptx export. Add it to requirements.txt."
        ) from exc

    theme = theme or DEFAULT_THEME

    prs = Presentation()
    # 16:9 widescreen is the modern default. Default python-pptx blank
    # presentations are 10x7.5 (4:3), which looks dated.
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)

    _pptx_add_title_slide(prs, title, len(messages), Inches, Pt, RGBColor, theme)

    response_idx = 0
    for msg_idx, msg in enumerate(messages):
        if msg.role != "assistant":
            continue
        response_idx += 1
        preceding_user = _find_preceding_user(messages, msg_idx)
        _pptx_add_assistant_slides(
            prs, msg, msg_idx, response_idx, charts or {}, preceding_user,
            Inches, Pt, RGBColor, theme,
        )

    # Stamp page numbers on every slide except the cover. We do this in a
    # post-pass so the per-slide builders don't need to know the deck's
    # total length — that's only knowable after all messages have been
    # rendered.
    total = len(prs.slides)
    for idx, slide in enumerate(prs.slides, start=1):
        if idx == 1:
            continue  # cover gets the orange band, not a page number
        _pptx_add_page_number_footer(slide, idx, total, Inches, Pt, RGBColor, theme)

    buf = io.BytesIO()
    try:
        prs.save(buf)
    except Exception as exc:  # noqa: BLE001
        raise ExportError(f"Failed to write pptx: {exc}") from exc
    return buf.getvalue()


def export_to_pdf(
    *,
    messages: list[ExportMessage],
    charts: dict[str, str] | None = None,
    title: Optional[str] = None,
    theme: Optional[ExportTheme] = None,
) -> bytes:
    """Render ``messages`` as a PDF. Returns the raw bytes."""
    theme = theme or DEFAULT_THEME
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import LETTER
        from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
        from reportlab.lib.units import inch
        from reportlab.platypus import (
            HRFlowable,
            Image as RLImage,
            PageBreak,
            Paragraph,
            SimpleDocTemplate,
            Spacer,
            Table,
            TableStyle,
        )
    except ImportError as exc:  # pragma: no cover
        raise ExportError(
            "reportlab is required for pdf export. Add it to requirements.txt."
        ) from exc

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=LETTER,
        leftMargin=0.75 * inch,
        rightMargin=0.75 * inch,
        topMargin=0.75 * inch,
        bottomMargin=0.75 * inch,
        title=title or "Nexora Chat Transcript",
    )
    styles = _build_pdf_styles(ParagraphStyle, getSampleStyleSheet, colors)
    story: list = []

    story.append(Paragraph(title or "Nexora Chat Transcript", styles["title"]))
    story.append(
        Paragraph(
            f"Generated {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')} · "
            f"{len(messages)} message{'s' if len(messages) != 1 else ''}",
            styles["meta"],
        )
    )
    story.append(Spacer(1, 0.2 * inch))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#cccccc")))
    story.append(Spacer(1, 0.15 * inch))

    for msg_idx, msg in enumerate(messages):
        _pdf_render_message(
            story,
            styles,
            msg,
            msg_idx,
            charts or {},
            inch,
            colors,
            Paragraph,
            Spacer,
            Table,
            TableStyle,
            RLImage,
            HRFlowable,
            theme,
        )

    try:
        doc.build(story)
    except Exception as exc:  # noqa: BLE001
        raise ExportError(f"Failed to write pdf: {exc}") from exc
    return buf.getvalue()


# ── Shared utilities ────────────────────────────────────────────────────────


# Match the ```chart ... ``` blocks before passing to the markdown parser.
# We replace them with a sentinel comment so we can find them again post-parse
# without confusing the markdown's own code-fence handling.
_CHART_BLOCK_RE = re.compile(r"```chart\s*([\s\S]*?)```", re.MULTILINE)
_CHART_SENTINEL = "<!--NEXORA_CHART_BLOCK_{idx}-->"


def _extract_chart_blocks(markdown_src: str) -> tuple[str, list[dict]]:
    """Replace ```chart blocks with sentinel HTML comments, returning the
    rewritten markdown plus the parsed chart specs (in document order).

    We don't validate the JSON heavily — the frontend already renders these,
    so by the time export runs the spec is known-good. We only need ``title``
    for the placeholder fallback when no image is provided.
    """
    blocks: list[dict] = []

    def _repl(match: re.Match) -> str:
        raw = match.group(1).strip()
        spec: dict
        try:
            import json
            spec = json.loads(raw)
        except Exception:
            spec = {"title": "(unparseable chart)"}
        idx = len(blocks)
        blocks.append(spec)
        return _CHART_SENTINEL.format(idx=idx)

    rewritten = _CHART_BLOCK_RE.sub(_repl, markdown_src)
    return rewritten, blocks


def _markdown_to_html(markdown_src: str) -> "BeautifulSoup":  # type: ignore[name-defined]
    """Parse markdown to a BeautifulSoup tree we can walk.

    Extensions:
      * ``fenced_code`` — handles ``` blocks (we strip ours first, but other
        code samples in the chat still render).
      * ``tables``      — GitHub-flavored tables.
      * ``sane_lists``  — fixes the off-by-one indent quirks of the default.
    """
    try:
        import markdown
        from bs4 import BeautifulSoup
    except ImportError as exc:  # pragma: no cover
        raise ExportError("markdown and beautifulsoup4 are required.") from exc

    html = markdown.markdown(
        markdown_src or "",
        extensions=["fenced_code", "tables", "sane_lists"],
        output_format="html",
    )
    return BeautifulSoup(html, "html.parser")


def _decode_chart_image(data_url: str) -> Optional[bytes]:
    """Accept either ``data:image/png;base64,...`` or a bare base64 string.

    Returns ``None`` on any decoding failure — callers fall back to the text
    placeholder so a malformed image doesn't kill the whole export.
    """
    if not data_url:
        return None
    payload = data_url
    if payload.startswith("data:"):
        comma = payload.find(",")
        if comma == -1:
            return None
        payload = payload[comma + 1 :]
    try:
        decoded = base64.b64decode(payload, validate=False)
    except Exception:
        return None
    # 4 MB cap. Chart.js exports of our size land at 30-80 KB; a 4 MB blob is
    # almost certainly malformed (or an attempt to balloon the response).
    if len(decoded) > 4 * 1024 * 1024:
        return None
    return decoded


# ── DOCX renderer ───────────────────────────────────────────────────────────


def _apply_default_docx_styles(doc, Pt, RGBColor) -> None:
    """Tighten the stock python-docx styles a notch. The defaults look very
    1995-Word; clinicians comparing to a PDF will notice."""
    normal = doc.styles["Normal"]
    normal.font.name = "Calibri"
    normal.font.size = Pt(11)


def _docx_render_message(doc, msg: ExportMessage, msg_idx: int, charts: dict, Pt, RGBColor, theme: ExportTheme) -> None:
    """Append one message's content to the document."""
    role_label = "User" if msg.role == "user" else ("Assistant" if msg.role == "assistant" else msg.role.title())
    role_color = RGBColor(0x60, 0xA5, 0xFA) if msg.role == "user" else RGBColor(0xD9, 0x77, 0x06)

    # Speaker header.
    header_para = doc.add_paragraph()
    header_run = header_para.add_run(role_label.upper())
    header_run.bold = True
    header_run.font.color.rgb = role_color
    header_run.font.size = Pt(10)
    if msg.model:
        meta_run = header_para.add_run(f"  ·  {msg.model}")
        meta_run.font.size = Pt(9)
        meta_run.font.color.rgb = RGBColor(0x66, 0x66, 0x66)
    if msg.timestamp:
        ts_run = header_para.add_run(f"  ·  {msg.timestamp}")
        ts_run.font.size = Pt(9)
        ts_run.font.color.rgb = RGBColor(0x66, 0x66, 0x66)
    if msg.file:
        attach_run = header_para.add_run(f"  ·  📎 {msg.file}")
        attach_run.font.size = Pt(9)
        attach_run.font.color.rgb = RGBColor(0x66, 0x66, 0x66)

    if msg.role == "user":
        # User content is rendered as plain text — markdown is rare in user
        # prompts and rendering it would obscure typos that often hint at
        # what the user actually asked for.
        for line in (msg.content or "").splitlines() or [""]:
            p = doc.add_paragraph(line)
            for r in p.runs:
                r.font.size = Pt(11)
        return

    rewritten, chart_specs = _extract_chart_blocks(msg.content or "")
    tree = _markdown_to_html(rewritten)
    _docx_walk(doc, tree, msg_idx, chart_specs, charts, Pt, RGBColor, theme)


def _docx_walk(doc, node, msg_idx: int, chart_specs: list[dict], charts: dict, Pt, RGBColor, theme: ExportTheme) -> None:
    """Walk the HTML tree, emitting docx elements for each block-level node.

    Block-level elements (p, h1-h6, ul/ol, table, pre, blockquote) generate
    their own paragraph/table; inline elements (em, strong, code, a) only
    contribute runs inside the currently open paragraph and are handled by
    ``_docx_inline``.
    """
    from docx.shared import Inches

    for child in node.children:
        name = getattr(child, "name", None)
        if name is None:
            # Stray top-level text — render as a paragraph.
            text = (child.string or "").strip()
            if text:
                doc.add_paragraph(text)
            continue

        if name in {"h1", "h2", "h3", "h4", "h5", "h6"}:
            level = int(name[1])
            doc.add_heading(child.get_text(strip=True), level=min(level, 4))
            continue

        if name == "p":
            # A paragraph might contain a sentinel that points to a chart.
            sentinel_match = _find_chart_sentinel(child)
            if sentinel_match is not None:
                _docx_insert_chart(doc, msg_idx, sentinel_match, chart_specs, charts, Inches, Pt, RGBColor, theme)
                continue
            p = doc.add_paragraph()
            _docx_inline(p, child, Pt, RGBColor)
            continue

        if name in {"ul", "ol"}:
            style = "List Bullet" if name == "ul" else "List Number"
            for li in child.find_all("li", recursive=False):
                p = doc.add_paragraph(style=style)
                _docx_inline(p, li, Pt, RGBColor)
            continue

        if name == "pre":
            # Fenced code block. python-docx has no native code style, so
            # emit a monospace paragraph with a soft gray run.
            code = child.find("code")
            text = (code.get_text() if code else child.get_text()) or ""
            p = doc.add_paragraph()
            run = p.add_run(text)
            run.font.name = "Consolas"
            run.font.size = Pt(9)
            run.font.color.rgb = RGBColor(0x33, 0x33, 0x33)
            continue

        if name == "blockquote":
            p = doc.add_paragraph()
            p.paragraph_format.left_indent = Inches(0.3)
            _docx_inline(p, child, Pt, RGBColor)
            continue

        if name == "table":
            _docx_render_table(doc, child, Pt)
            continue

        # Anything else — render the text content as a paragraph.
        text = child.get_text(strip=True)
        if text:
            doc.add_paragraph(text)


def _docx_inline(paragraph, node, Pt, RGBColor) -> None:
    """Walk inline children, appending runs to ``paragraph``."""
    for sub in node.children:
        if getattr(sub, "name", None) is None:
            text = str(sub)
            if text:
                paragraph.add_run(text)
            continue
        if sub.name in {"strong", "b"}:
            run = paragraph.add_run(sub.get_text())
            run.bold = True
        elif sub.name in {"em", "i"}:
            run = paragraph.add_run(sub.get_text())
            run.italic = True
        elif sub.name == "code":
            run = paragraph.add_run(sub.get_text())
            run.font.name = "Consolas"
            run.font.size = Pt(10)
        elif sub.name == "a":
            # python-docx hyperlink support requires manual XML; for the MVP
            # we render link text + url in parentheses so the destination
            # is preserved even if styled blue underlines aren't.
            text = sub.get_text() or sub.get("href") or ""
            href = sub.get("href") or ""
            run = paragraph.add_run(text)
            run.font.color.rgb = RGBColor(0x60, 0xA5, 0xFA)
            if href and href != text:
                trailing = paragraph.add_run(f" ({href})")
                trailing.font.size = Pt(9)
                trailing.font.color.rgb = RGBColor(0x66, 0x66, 0x66)
        elif sub.name == "br":
            paragraph.add_run("\n")
        else:
            # Recurse into anything else (span, etc.).
            _docx_inline(paragraph, sub, Pt, RGBColor)


def _docx_render_table(doc, table_node, Pt) -> None:
    """Convert an HTML table into a native Word table.

    We compute the column count from the widest row (cope with malformed
    LLM output that varies columns row-to-row) and pad short rows with
    empty cells.
    """
    rows = table_node.find_all("tr")
    if not rows:
        return
    col_count = max(len(r.find_all(["td", "th"])) for r in rows)
    if col_count == 0:
        return
    tbl = doc.add_table(rows=len(rows), cols=col_count)
    tbl.style = "Light Grid Accent 1"
    for r_idx, tr in enumerate(rows):
        cells = tr.find_all(["td", "th"])
        for c_idx in range(col_count):
            cell = tbl.cell(r_idx, c_idx)
            cell_text = cells[c_idx].get_text(strip=True) if c_idx < len(cells) else ""
            cell.text = cell_text
            if c_idx < len(cells) and cells[c_idx].name == "th":
                for p in cell.paragraphs:
                    for r in p.runs:
                        r.bold = True
                        r.font.size = Pt(10)


_CHART_SENTINEL_RE = re.compile(r"NEXORA_CHART_BLOCK_(\d+)")


def _find_chart_sentinel(paragraph_node) -> Optional[int]:
    """Return the chart index if the paragraph contains *only* a chart
    sentinel comment, else None."""
    from bs4 import Comment

    children = list(paragraph_node.children)
    # Strip whitespace-only NavigableString siblings.
    children = [c for c in children if not (getattr(c, "name", None) is None and not str(c).strip())]
    if len(children) != 1:
        return None
    c = children[0]
    if isinstance(c, Comment):
        match = _CHART_SENTINEL_RE.search(str(c))
        if match:
            return int(match.group(1))
    return None


def _docx_insert_chart(
    doc,
    msg_idx: int,
    chart_idx: int,
    chart_specs: list[dict],
    charts: dict,
    Inches,
    Pt,
    RGBColor,
    theme: ExportTheme,
) -> None:
    """Insert the captured (or server-rendered) chart image, or a placeholder."""
    chart_id = f"chart-{msg_idx}-{chart_idx}"
    image_bytes = _resolve_chart_image_bytes(
        chart_id=chart_id, chart_idx=chart_idx,
        chart_specs=chart_specs, charts=charts, theme=theme,
    )
    spec = chart_specs[chart_idx] if 0 <= chart_idx < len(chart_specs) else {}
    title = (spec.get("title") or "").strip() if isinstance(spec, dict) else ""

    if image_bytes is None:
        # Placeholder: title + a faint border-styled note.
        p = doc.add_paragraph()
        run = p.add_run(f"[Chart: {title or 'untitled'}]")
        run.italic = True
        run.font.color.rgb = RGBColor(0x66, 0x66, 0x66)
        run.font.size = Pt(10)
        return

    if title:
        title_p = doc.add_paragraph()
        title_run = title_p.add_run(title)
        title_run.bold = True
        title_run.font.size = Pt(10)
        title_run.font.color.rgb = RGBColor(0x33, 0x33, 0x33)

    try:
        doc.add_picture(io.BytesIO(image_bytes), width=Inches(5.5))
    except Exception as exc:  # noqa: BLE001
        # Fall back to placeholder rather than crashing the export.
        log.warning("chart_image_embed_failed", extra={"chart_id": chart_id, "error": str(exc)})
        p = doc.add_paragraph()
        run = p.add_run(f"[Chart: {title or 'untitled'} — image embed failed]")
        run.italic = True
        run.font.color.rgb = RGBColor(0x66, 0x66, 0x66)


# ── PDF renderer ────────────────────────────────────────────────────────────


def _build_pdf_styles(ParagraphStyle, getSampleStyleSheet, colors) -> dict:
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "Title", parent=base["Title"], fontName="Helvetica-Bold", fontSize=20,
            textColor=colors.HexColor("#111111"), spaceAfter=4,
        ),
        "meta": ParagraphStyle(
            "Meta", parent=base["BodyText"], fontName="Helvetica", fontSize=9,
            textColor=colors.HexColor("#666666"),
        ),
        "speaker_user": ParagraphStyle(
            "SpeakerUser", parent=base["BodyText"], fontName="Helvetica-Bold", fontSize=10,
            textColor=colors.HexColor("#60a5fa"), spaceBefore=12, spaceAfter=4,
        ),
        "speaker_assistant": ParagraphStyle(
            "SpeakerAssistant", parent=base["BodyText"], fontName="Helvetica-Bold", fontSize=10,
            textColor=colors.HexColor("#d97706"), spaceBefore=12, spaceAfter=4,
        ),
        "speaker_meta": ParagraphStyle(
            "SpeakerMeta", parent=base["BodyText"], fontName="Helvetica", fontSize=8.5,
            textColor=colors.HexColor("#666666"), spaceAfter=4,
        ),
        "body": ParagraphStyle(
            "Body", parent=base["BodyText"], fontName="Helvetica", fontSize=10.5, leading=14,
            textColor=colors.HexColor("#222222"),
        ),
        "h1": ParagraphStyle("H1", parent=base["Heading1"], fontSize=16, spaceBefore=10),
        "h2": ParagraphStyle("H2", parent=base["Heading2"], fontSize=14, spaceBefore=8),
        "h3": ParagraphStyle("H3", parent=base["Heading3"], fontSize=12, spaceBefore=6),
        "code": ParagraphStyle(
            "Code", parent=base["BodyText"], fontName="Courier", fontSize=9, leading=11,
            textColor=colors.HexColor("#333333"), backColor=colors.HexColor("#f4f4f4"),
            leftIndent=8, rightIndent=8, spaceBefore=6, spaceAfter=6,
        ),
        "chart_title": ParagraphStyle(
            "ChartTitle", parent=base["BodyText"], fontName="Helvetica-Bold", fontSize=10,
            textColor=colors.HexColor("#222222"), spaceBefore=4, spaceAfter=2,
        ),
        "chart_placeholder": ParagraphStyle(
            "ChartPlaceholder", parent=base["BodyText"], fontName="Helvetica-Oblique", fontSize=10,
            textColor=colors.HexColor("#666666"),
        ),
    }


def _pdf_render_message(
    story,
    styles: dict,
    msg: ExportMessage,
    msg_idx: int,
    charts: dict,
    inch,
    colors,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    RLImage,
    HRFlowable,
    theme: ExportTheme,
) -> None:
    speaker_style = styles["speaker_user"] if msg.role == "user" else styles["speaker_assistant"]
    label = (msg.role or "speaker").upper()
    story.append(Paragraph(label, speaker_style))

    meta_parts: list[str] = []
    if msg.model:
        meta_parts.append(msg.model)
    if msg.timestamp:
        meta_parts.append(msg.timestamp)
    if msg.file:
        meta_parts.append(f"file: {msg.file}")
    if meta_parts:
        story.append(Paragraph(" · ".join(meta_parts), styles["speaker_meta"]))

    if msg.role == "user":
        for line in (msg.content or "").splitlines() or [""]:
            story.append(Paragraph(_escape_for_reportlab(line) or "&nbsp;", styles["body"]))
        return

    rewritten, chart_specs = _extract_chart_blocks(msg.content or "")
    tree = _markdown_to_html(rewritten)
    _pdf_walk(
        story, styles, tree, msg_idx, chart_specs, charts,
        inch, colors, Paragraph, Spacer, Table, TableStyle, RLImage, HRFlowable,
        theme,
    )


# Reportlab paragraphs accept a tiny HTML subset (<b>, <i>, <font>, <br/>).
# We render markdown's inline structure into that.
_RL_ESCAPE_TABLE = str.maketrans({"&": "&amp;", "<": "&lt;", ">": "&gt;"})


def _escape_for_reportlab(text: str) -> str:
    return (text or "").translate(_RL_ESCAPE_TABLE)


def _inline_to_rl_markup(node) -> str:
    """Render a BS4 inline subtree to reportlab's mini-HTML markup."""
    out: list[str] = []
    for sub in node.children:
        if getattr(sub, "name", None) is None:
            out.append(_escape_for_reportlab(str(sub)))
            continue
        text = _inline_to_rl_markup(sub)
        if sub.name in {"strong", "b"}:
            out.append(f"<b>{text}</b>")
        elif sub.name in {"em", "i"}:
            out.append(f"<i>{text}</i>")
        elif sub.name == "code":
            out.append(f'<font face="Courier" size="9">{text}</font>')
        elif sub.name == "a":
            href = _escape_for_reportlab(sub.get("href") or "")
            if href:
                out.append(f'<link href="{href}" color="blue">{text}</link>')
            else:
                out.append(text)
        elif sub.name == "br":
            out.append("<br/>")
        else:
            out.append(text)
    return "".join(out)


def _pdf_walk(
    story,
    styles,
    node,
    msg_idx,
    chart_specs,
    charts,
    inch,
    colors,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    RLImage,
    HRFlowable,
    theme: ExportTheme,
) -> None:
    for child in node.children:
        name = getattr(child, "name", None)
        if name is None:
            text = str(child).strip()
            if text:
                story.append(Paragraph(_escape_for_reportlab(text), styles["body"]))
            continue

        if name in {"h1", "h2", "h3", "h4", "h5", "h6"}:
            level = int(name[1])
            style_key = "h1" if level == 1 else "h2" if level == 2 else "h3"
            story.append(Paragraph(_escape_for_reportlab(child.get_text(strip=True)), styles[style_key]))
            continue

        if name == "p":
            chart_idx = _find_chart_sentinel(child)
            if chart_idx is not None:
                _pdf_insert_chart(
                    story, styles, msg_idx, chart_idx, chart_specs, charts,
                    inch, Paragraph, Spacer, RLImage, theme,
                )
                continue
            story.append(Paragraph(_inline_to_rl_markup(child) or "&nbsp;", styles["body"]))
            continue

        if name in {"ul", "ol"}:
            for li_idx, li in enumerate(child.find_all("li", recursive=False), start=1):
                marker = "• " if name == "ul" else f"{li_idx}. "
                story.append(
                    Paragraph(
                        marker + _inline_to_rl_markup(li),
                        styles["body"],
                    )
                )
            continue

        if name == "pre":
            code_text = (child.find("code") or child).get_text() or ""
            story.append(Paragraph(_escape_for_reportlab(code_text).replace("\n", "<br/>"), styles["code"]))
            continue

        if name == "blockquote":
            story.append(Paragraph(_inline_to_rl_markup(child), styles["body"]))
            continue

        if name == "table":
            _pdf_render_table(story, child, inch, colors, Paragraph, Table, TableStyle, styles)
            continue

        # Unknown block — render its text.
        text = child.get_text(strip=True)
        if text:
            story.append(Paragraph(_escape_for_reportlab(text), styles["body"]))


def _pdf_render_table(story, table_node, inch, colors, Paragraph, Table, TableStyle, styles) -> None:
    rows = table_node.find_all("tr")
    if not rows:
        return
    col_count = max(len(r.find_all(["td", "th"])) for r in rows)
    if col_count == 0:
        return

    data: list[list] = []
    for tr in rows:
        cells = tr.find_all(["td", "th"])
        row: list = []
        for c_idx in range(col_count):
            if c_idx < len(cells):
                row.append(Paragraph(_inline_to_rl_markup(cells[c_idx]) or "", styles["body"]))
            else:
                row.append("")
        data.append(row)

    table = Table(data, repeatRows=1 if rows[0].find_all("th") else 0)
    style = TableStyle(
        [
            ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cccccc")),
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f3f4f6")),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 9.5),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ]
    )
    table.setStyle(style)
    story.append(table)


# ── PPTX renderer ───────────────────────────────────────────────────────────
#
# Programmatic styling, no template file. The constants below are the deck's
# single source of truth — change them here and every slide picks up the new
# look. We deliberately avoid layout placeholders for content slides and use
# a Blank layout + manual shapes so the same brand applies across PowerPoint
# versions (placeholder behaviour varies between Office 2016 / 365 / online).

# Nexora brand palette. The chat UI uses #d97706 as the AI/assistant accent,
# so we carry that through to the deck.
_PPTX_BRAND_PRIMARY = (0xD9, 0x77, 0x06)        # Nexora orange
_PPTX_BRAND_PRIMARY_DARK = (0xB4, 0x53, 0x09)   # darker orange for hover/border
_PPTX_TEXT_PRIMARY = (0x11, 0x18, 0x27)         # near-black slate
_PPTX_TEXT_SECONDARY = (0x4B, 0x55, 0x63)       # medium slate
_PPTX_TEXT_MUTED = (0x9C, 0xA3, 0xAF)           # light slate
_PPTX_BORDER = (0xE5, 0xE7, 0xEB)               # light gray hairline
_PPTX_ROW_ALT = (0xF9, 0xFA, 0xFB)              # very light gray for zebra rows
_PPTX_TABLE_HEADER_BG = (0x1F, 0x29, 0x37)      # dark slate for table headers
_PPTX_WHITE = (0xFF, 0xFF, 0xFF)

# Typography — Calibri ships with every Office install since 2007 so the
# deck renders identically on Mac, Windows, web, and PowerPoint Online.
_PPTX_FONT_DISPLAY = "Calibri"
_PPTX_FONT_BODY = "Calibri"
_PPTX_FONT_MONO = "Consolas"

# Layout constants in inches. Slide is 13.333 × 7.5 (16:9).
_PPTX_MARGIN_X = 0.5
_PPTX_HEADER_HEIGHT = 1.0   # title bar
_PPTX_FOOTER_HEIGHT = 0.4   # page number band
_PPTX_CONTENT_TOP = 1.2     # below header
_PPTX_CONTENT_BOTTOM = 7.0  # above footer
_PPTX_ACCENT_BAR_HEIGHT = 0.06  # thin orange line under title


def _find_preceding_user(messages: list[ExportMessage], assistant_idx: int) -> Optional[str]:
    """Walk backwards from an assistant turn to the nearest user turn.

    Used to title the assistant's slide(s) with the question being answered.
    Returns ``None`` if the assistant is the conversation's first speaker
    (rare but possible — system-seeded conversations).
    """
    for j in range(assistant_idx - 1, -1, -1):
        if messages[j].role == "user":
            return messages[j].content or None
    return None


def _truncate(text: str, limit: int) -> str:
    text = (text or "").strip()
    if len(text) <= limit:
        return text
    # Try to break on a word boundary so we don't end mid-word.
    cut = text[:limit].rsplit(" ", 1)[0]
    return (cut or text[:limit]) + "…"


def _pptx_add_rect_fill(slide, MSO_SHAPE, RGBColor, *, left, top, width, height, fill_rgb) -> None:
    """Add a filled rectangle with no border. The thin shapes our brand layout
    uses (accent bars, underlines) all share this primitive."""
    shape = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, left, top, width, height)
    shape.fill.solid()
    shape.fill.fore_color.rgb = RGBColor(*fill_rgb)
    shape.line.fill.background()  # remove the default 1pt black border
    shape.shadow.inherit = False


def _pptx_set_text(
    text_frame,
    text: str,
    *,
    Pt,
    RGBColor,
    font: str = _PPTX_FONT_BODY,
    size: int = 14,
    bold: bool = False,
    italic: bool = False,
    color: tuple[int, int, int] = _PPTX_TEXT_PRIMARY,
    align: Optional[str] = None,
    letter_spacing: int = 0,
) -> None:
    """Set the first paragraph of ``text_frame`` to ``text`` with the given
    style. Subsequent calls clear the frame first (helpers shouldn't leak
    runs from a previous use).

    ``letter_spacing`` is in 100ths of a percent (per OOXML's spc attribute);
    pass e.g. 200 for a slight track-out on eyebrow labels.
    """
    try:
        from pptx.enum.text import PP_ALIGN
    except ImportError:  # pragma: no cover
        PP_ALIGN = None

    # Wipe any existing content.
    text_frame.clear()
    p = text_frame.paragraphs[0]
    if align == "center" and PP_ALIGN is not None:
        p.alignment = PP_ALIGN.CENTER
    elif align == "right" and PP_ALIGN is not None:
        p.alignment = PP_ALIGN.RIGHT
    run = p.add_run()
    run.text = text
    run.font.name = font
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.italic = italic
    run.font.color.rgb = RGBColor(*color)
    if letter_spacing:
        # python-pptx doesn't expose spc on Run.font, so set the XML attr
        # directly. The namespace handling is brittle — guarded with a
        # try so a future SDK change doesn't crash the export.
        try:
            rPr = run.font._rPr  # noqa: SLF001
            rPr.set("spc", str(letter_spacing))
        except Exception:
            pass


def _pptx_add_brand_header(slide, title_text: str, Inches, Pt, RGBColor, theme: ExportTheme) -> None:
    """Title bar at the top of every content slide: title text + thin
    themed underline. Replaces the stock Title placeholder used by layout
    5 so we have full control over typography and spacing."""
    # Title sizing varies per template — executive decks want a larger,
    # more confident header; analysis decks stay compact so more body
    # content fits on the same slide.
    title_size = {
        "executive_summary": 28,
        "dashboard": 22,
        "roadmap": 26,
        "analysis": 22,
    }.get(theme.template, 24)

    title_box = slide.shapes.add_textbox(
        Inches(_PPTX_MARGIN_X), Inches(0.35),
        Inches(13.333 - 2 * _PPTX_MARGIN_X), Inches(0.7),
    )
    _pptx_set_text(
        title_box.text_frame, title_text,
        Pt=Pt, RGBColor=RGBColor,
        font=_PPTX_FONT_DISPLAY, size=title_size, bold=True,
        color=_PPTX_TEXT_PRIMARY,
    )

    try:
        from pptx.enum.shapes import MSO_SHAPE
    except ImportError:  # pragma: no cover
        return
    _pptx_add_rect_fill(
        slide, MSO_SHAPE, RGBColor,
        left=Inches(_PPTX_MARGIN_X), top=Inches(1.05),
        width=Inches(2.0), height=Inches(_PPTX_ACCENT_BAR_HEIGHT),
        fill_rgb=theme.primary_color,
    )


def _pptx_add_page_number_footer(slide, page_idx: int, total: int, Inches, Pt, RGBColor, theme: ExportTheme) -> None:
    """Thin hairline + brand mark + 'N / M' at the bottom of content slides."""
    try:
        from pptx.enum.shapes import MSO_SHAPE
    except ImportError:  # pragma: no cover
        return

    # Hairline divider above the footer text.
    _pptx_add_rect_fill(
        slide, MSO_SHAPE, RGBColor,
        left=Inches(_PPTX_MARGIN_X), top=Inches(_PPTX_CONTENT_BOTTOM + 0.05),
        width=Inches(13.333 - 2 * _PPTX_MARGIN_X), height=Inches(0.012),
        fill_rgb=_PPTX_BORDER,
    )

    # Left-aligned brand mark — uses tenant eyebrow + primary colour.
    brand = slide.shapes.add_textbox(
        Inches(_PPTX_MARGIN_X), Inches(_PPTX_CONTENT_BOTTOM + 0.15),
        Inches(4.0), Inches(_PPTX_FOOTER_HEIGHT),
    )
    _pptx_set_text(
        brand.text_frame, theme.eyebrow,
        Pt=Pt, RGBColor=RGBColor,
        font=_PPTX_FONT_DISPLAY, size=9, bold=True,
        color=theme.primary_color, letter_spacing=200,
    )

    # Right-aligned page number.
    page = slide.shapes.add_textbox(
        Inches(13.333 - _PPTX_MARGIN_X - 3.5), Inches(_PPTX_CONTENT_BOTTOM + 0.15),
        Inches(3.5), Inches(_PPTX_FOOTER_HEIGHT),
    )
    _pptx_set_text(
        page.text_frame, f"{page_idx} / {total}",
        Pt=Pt, RGBColor=RGBColor,
        font=_PPTX_FONT_BODY, size=9, color=_PPTX_TEXT_MUTED,
        align="right",
    )


def _pptx_add_title_slide(prs, title: Optional[str], message_count: int, Inches, Pt, RGBColor, theme: ExportTheme) -> None:
    """Cover slide: brand-styled title with accent bars and optional logo.

    The cover layout varies subtly per template — executive_summary uses a
    larger main title; dashboard adds a faint colour-block under the title
    to suggest a tile layout; roadmap shifts the accent rule wider. The
    differences are visual, not structural (one cover slide regardless).
    """
    try:
        from pptx.enum.shapes import MSO_SHAPE
        from pptx.enum.text import PP_ALIGN
    except ImportError as exc:  # pragma: no cover
        raise ExportError("python-pptx enum imports failed") from exc

    slide = prs.slides.add_slide(prs.slide_layouts[6])  # Blank

    slide_w_in = prs.slide_width / 914400  # EMUs per inch
    slide_h_in = prs.slide_height / 914400

    # Top accent bar (full width). Templates can opt for a thicker bar
    # to make the cover feel more deliberate.
    top_bar_h = 0.12 if theme.template == "executive_summary" else 0.08
    _pptx_add_rect_fill(
        slide, MSO_SHAPE, RGBColor,
        left=Inches(0), top=Inches(0),
        width=Inches(slide_w_in), height=Inches(top_bar_h),
        fill_rgb=theme.primary_color,
    )

    # Optional logo, top-right. Sized to fit the eyebrow band so it reads
    # as a brand mark rather than competing with the title.
    if theme.logo_png:
        try:
            slide.shapes.add_picture(
                io.BytesIO(theme.logo_png),
                Inches(slide_w_in - 1.7), Inches(0.4),
                height=Inches(0.7),
            )
        except Exception as exc:  # noqa: BLE001
            log.warning("pptx_logo_embed_failed", extra={"error": str(exc)})

    eyebrow = slide.shapes.add_textbox(
        Inches(_PPTX_MARGIN_X), Inches(1.2),
        Inches(slide_w_in - 2 * _PPTX_MARGIN_X), Inches(0.45),
    )
    _pptx_set_text(
        eyebrow.text_frame, theme.eyebrow,
        Pt=Pt, RGBColor=RGBColor,
        font=_PPTX_FONT_DISPLAY, size=16, bold=True,
        color=theme.primary_color, letter_spacing=200,
    )

    title_size = {
        "executive_summary": 52,
        "dashboard": 40,
        "roadmap": 46,
        "analysis": 40,
    }.get(theme.template, 44)

    title_box = slide.shapes.add_textbox(
        Inches(_PPTX_MARGIN_X), Inches(1.9),
        Inches(slide_w_in - 2 * _PPTX_MARGIN_X), Inches(1.6),
    )
    _pptx_set_text(
        title_box.text_frame,
        title or "Chat Transcript",
        Pt=Pt, RGBColor=RGBColor,
        font=_PPTX_FONT_DISPLAY, size=title_size, bold=True,
        color=_PPTX_TEXT_PRIMARY,
    )

    accent_width = 4.0 if theme.template == "roadmap" else 2.5
    _pptx_add_rect_fill(
        slide, MSO_SHAPE, RGBColor,
        left=Inches(_PPTX_MARGIN_X), top=Inches(3.5),
        width=Inches(accent_width), height=Inches(0.06),
        fill_rgb=theme.primary_color,
    )

    # Dashboard template adds a faint horizontal block under the title to
    # hint at a tile-grid layout. Subtle visual differentiation only.
    if theme.template == "dashboard":
        _pptx_add_rect_fill(
            slide, MSO_SHAPE, RGBColor,
            left=Inches(_PPTX_MARGIN_X), top=Inches(5.3),
            width=Inches(slide_w_in - 2 * _PPTX_MARGIN_X), height=Inches(0.6),
            fill_rgb=_PPTX_ROW_ALT,
        )

    # Metadata block.
    meta_box = slide.shapes.add_textbox(
        Inches(_PPTX_MARGIN_X), Inches(3.85),
        Inches(slide_w_in - 2 * _PPTX_MARGIN_X), Inches(1.2),
    )
    meta_tf = meta_box.text_frame
    meta_tf.word_wrap = True
    _pptx_set_text(
        meta_tf,
        f"Generated {datetime.now(timezone.utc).strftime('%B %d, %Y at %H:%M UTC')}",
        Pt=Pt, RGBColor=RGBColor,
        font=_PPTX_FONT_BODY, size=14, color=_PPTX_TEXT_SECONDARY,
    )
    p2 = meta_tf.add_paragraph()
    run = p2.add_run()
    run.text = f"{message_count} message{'s' if message_count != 1 else ''} · AI-assisted transcript"
    run.font.name = _PPTX_FONT_BODY
    run.font.size = Pt(12)
    run.font.color.rgb = RGBColor(*_PPTX_TEXT_MUTED)

    # Bottom themed band as the cover's signature element.
    _pptx_add_rect_fill(
        slide, MSO_SHAPE, RGBColor,
        left=Inches(0), top=Inches(slide_h_in - 0.45),
        width=Inches(slide_w_in), height=Inches(0.45),
        fill_rgb=theme.primary_color,
    )
    caption = slide.shapes.add_textbox(
        Inches(_PPTX_MARGIN_X), Inches(slide_h_in - 0.42),
        Inches(slide_w_in - 2 * _PPTX_MARGIN_X), Inches(0.42),
    )
    _pptx_set_text(
        caption.text_frame, theme.caption,
        Pt=Pt, RGBColor=RGBColor,
        font=_PPTX_FONT_BODY, size=10, color=_PPTX_WHITE, letter_spacing=80,
    )


def _pptx_extract_artifacts(msg_content: str) -> tuple["BeautifulSoup", list[dict]]:  # type: ignore[name-defined]
    """Parse the assistant content into HTML and split off chart specs.

    The returned soup still contains chart sentinel comments — caller
    iterates through to extract them in order.
    """
    rewritten, chart_specs = _extract_chart_blocks(msg_content or "")
    tree = _markdown_to_html(rewritten)
    return tree, chart_specs


def _pptx_resolve_slide_title(
    msg: ExportMessage,
    tree,
    response_idx: int,
    preceding_user: Optional[str],
) -> str:
    """Pick a human-friendly title for the text slide.

    Preference order:
      1. Truncated preceding user prompt — most useful for Q&A decks.
      2. First H1/H2 of the assistant's message — useful when the
         conversation is one-shot (no user turn yet).
      3. "Response N" — last-resort fallback.
    """
    if preceding_user:
        # Strip newlines so the title fits on one line.
        flat = " ".join(preceding_user.split())
        if flat:
            return _truncate(flat, 90)
    for header_tag in ("h1", "h2", "h3"):
        node = tree.find(header_tag)
        if node is not None:
            text = node.get_text(strip=True)
            if text:
                return _truncate(text, 90)
    return f"Response {response_idx}"


def _pptx_add_assistant_slides(
    prs,
    msg: ExportMessage,
    msg_idx: int,
    response_idx: int,
    charts: dict,
    preceding_user: Optional[str],
    Inches,
    Pt,
    RGBColor,
    theme: ExportTheme,
) -> None:
    """Emit the slides for one assistant message: text slide, chart
    slide(s), table slide(s)."""
    tree, chart_specs = _pptx_extract_artifacts(msg.content)
    slide_title = _pptx_resolve_slide_title(msg, tree, response_idx, preceding_user)

    # Speaker notes flow into the pptx notes pane for any slide derived
    # from this message. The model emits them as ``<!-- notes: ... -->``
    # at the top of the message body; we look up by slide title.
    text_slide_notes = _extract_notes_for_section(msg.content or "", slide_title)

    text_slide = _pptx_add_text_slide(
        prs, tree, slide_title, msg, Inches, Pt, RGBColor, theme,
    )
    if text_slide is not None and text_slide_notes:
        _pptx_set_speaker_notes(text_slide, text_slide_notes)

    for chart_idx, spec in enumerate(chart_specs):
        chart_id = f"chart-{msg_idx}-{chart_idx}"
        image_bytes = _resolve_chart_image_bytes(
            chart_id=chart_id, chart_idx=chart_idx,
            chart_specs=chart_specs, charts=charts, theme=theme,
        )
        chart_title = ""
        if isinstance(spec, dict):
            chart_title = (spec.get("title") or "").strip()
        chart_slide = _pptx_add_chart_slide(
            prs,
            chart_title or f"Chart {chart_idx + 1}",
            image_bytes,
            Inches, Pt, RGBColor, theme,
        )
        chart_notes = _extract_notes_for_section(msg.content or "", chart_title or "")
        if chart_slide is not None and chart_notes:
            _pptx_set_speaker_notes(chart_slide, chart_notes)

    table_idx = 0
    for table_node in tree.find_all("table"):
        table_idx += 1
        _pptx_add_table_slide(
            prs, f"Data table {table_idx}", table_node, Inches, Pt, RGBColor, theme,
        )


def _pptx_set_speaker_notes(slide, text: str) -> None:
    """Attach ``text`` to the slide's notes pane. python-pptx creates the
    notes_slide lazily on first access so we don't need to opt in earlier
    in the build."""
    try:
        notes_tf = slide.notes_slide.notes_text_frame
        notes_tf.text = text
    except Exception as exc:  # noqa: BLE001
        log.warning("pptx_notes_set_failed", extra={"error": str(exc)})


def _pptx_add_text_slide(prs, tree, slide_title: str, msg: ExportMessage, Inches, Pt, RGBColor, theme: ExportTheme):
    """Branded content slide: header bar + content textbox + (optional) message
    metadata strip + footer (added in post-processing).

    Returns the created slide so callers can attach speaker notes after the
    fact (notes flow into the pptx notes pane, never the visible slide).
    """
    slide = prs.slides.add_slide(prs.slide_layouts[6])  # Blank
    _pptx_add_brand_header(slide, slide_title, Inches, Pt, RGBColor, theme)

    # Optional metadata strip directly under the accent line.
    body_top = _PPTX_CONTENT_TOP
    if msg.model or msg.timestamp or msg.file:
        meta_box = slide.shapes.add_textbox(
            Inches(_PPTX_MARGIN_X), Inches(body_top),
            Inches(13.333 - 2 * _PPTX_MARGIN_X), Inches(0.3),
        )
        parts: list[str] = []
        if msg.model:
            parts.append(msg.model)
        if msg.timestamp:
            parts.append(msg.timestamp)
        if msg.file:
            parts.append(f"file: {msg.file}")
        _pptx_set_text(
            meta_box.text_frame, "  ·  ".join(parts),
            Pt=Pt, RGBColor=RGBColor,
            font=_PPTX_FONT_BODY, size=10, color=_PPTX_TEXT_MUTED,
        )
        body_top += 0.35

    # Content textbox spans from below the metadata to just above the footer.
    body_height = _PPTX_CONTENT_BOTTOM - body_top
    tb = slide.shapes.add_textbox(
        Inches(_PPTX_MARGIN_X), Inches(body_top),
        Inches(13.333 - 2 * _PPTX_MARGIN_X), Inches(body_height),
    )
    tf = tb.text_frame
    tf.word_wrap = True
    try:
        from pptx.enum.text import MSO_AUTO_SIZE
        tf.auto_size = MSO_AUTO_SIZE.TEXT_TO_FIT_SHAPE
    except Exception:
        pass

    first_paragraph = True

    def _new_paragraph():
        nonlocal first_paragraph
        if first_paragraph:
            first_paragraph = False
            return tf.paragraphs[0]
        return tf.add_paragraph()

    _pptx_walk_text(tree, _new_paragraph, Pt, RGBColor)
    return slide


def _pptx_walk_text(node, new_para_fn, Pt, RGBColor) -> None:
    """Emit pptx paragraphs for the block-level nodes that belong in the
    text slide.

    Skips: <table> (gets its own slide), HTML comments matching the
    chart sentinel (chart gets its own slide).
    """
    from bs4 import Comment

    for child in node.children:
        # Skip chart sentinels — these flow to chart slides.
        if isinstance(child, Comment):
            continue
        name = getattr(child, "name", None)
        if name is None:
            text = str(child).strip()
            if not text:
                continue
            p = new_para_fn()
            _pptx_add_runs(p, [(text, {})], Pt, RGBColor)
            continue
        if name == "table":
            # Table slide handles this content. Skip here.
            continue
        if name in {"h1", "h2", "h3", "h4", "h5", "h6"}:
            level = int(name[1])
            p = new_para_fn()
            size = {1: 22, 2: 18, 3: 16}.get(level, 14)
            _pptx_add_runs(
                p,
                [(child.get_text(strip=True), {"bold": True, "size": size})],
                Pt, RGBColor,
            )
            continue
        if name == "p":
            # If the paragraph IS only a chart sentinel, skip.
            if _find_chart_sentinel(child) is not None:
                continue
            p = new_para_fn()
            _pptx_inline_to_runs(p, child, Pt, RGBColor)
            continue
        if name in {"ul", "ol"}:
            for i, li in enumerate(child.find_all("li", recursive=False), start=1):
                p = new_para_fn()
                prefix = "•  " if name == "ul" else f"{i}.  "
                p.level = 0
                # Prepend the bullet character as a plain run. Using actual
                # bullet placeholders would require theme-aware list styling
                # that we don't want to lock down.
                runs_spec: list[tuple[str, dict]] = [(prefix, {})]
                # Pull inline content into runs.
                _pptx_collect_inline_runs(li, runs_spec)
                _pptx_add_runs(p, runs_spec, Pt, RGBColor)
            continue
        if name == "pre":
            code = child.find("code")
            text = (code.get_text() if code else child.get_text()) or ""
            for line in text.splitlines() or [""]:
                p = new_para_fn()
                _pptx_add_runs(
                    p, [(line, {"font": "Consolas", "size": 11, "color": (0x33, 0x33, 0x33)})], Pt, RGBColor,
                )
            continue
        if name == "blockquote":
            p = new_para_fn()
            _pptx_inline_to_runs(p, child, Pt, RGBColor, italic=True)
            continue
        # Unknown block — render its text.
        text = child.get_text(strip=True)
        if text:
            p = new_para_fn()
            _pptx_add_runs(p, [(text, {})], Pt, RGBColor)


def _pptx_collect_inline_runs(node, runs_spec: list[tuple[str, dict]]) -> None:
    """Flatten an HTML inline subtree to (text, style) tuples appended to
    ``runs_spec``. The pptx textbox API takes one run per styled span."""
    for sub in node.children:
        if getattr(sub, "name", None) is None:
            text = str(sub)
            if text:
                runs_spec.append((text, {}))
            continue
        if sub.name in {"strong", "b"}:
            inner: list[tuple[str, dict]] = []
            _pptx_collect_inline_runs(sub, inner)
            for t, s in inner:
                merged = dict(s)
                merged["bold"] = True
                runs_spec.append((t, merged))
        elif sub.name in {"em", "i"}:
            inner = []
            _pptx_collect_inline_runs(sub, inner)
            for t, s in inner:
                merged = dict(s)
                merged["italic"] = True
                runs_spec.append((t, merged))
        elif sub.name == "code":
            runs_spec.append((sub.get_text(), {"font": "Consolas", "size": 12}))
        elif sub.name == "a":
            text = sub.get_text() or sub.get("href") or ""
            runs_spec.append((text, {"color": (0x60, 0xA5, 0xFA)}))
        elif sub.name == "br":
            runs_spec.append(("\n", {}))
        else:
            _pptx_collect_inline_runs(sub, runs_spec)


def _pptx_inline_to_runs(paragraph, node, Pt, RGBColor, italic: bool = False) -> None:
    spec: list[tuple[str, dict]] = []
    _pptx_collect_inline_runs(node, spec)
    if italic:
        spec = [(t, {**s, "italic": True}) for t, s in spec]
    if not spec:
        spec = [(node.get_text(strip=True), {})]
    _pptx_add_runs(paragraph, spec, Pt, RGBColor)


def _pptx_add_runs(paragraph, runs_spec: list[tuple[str, dict]], Pt, RGBColor) -> None:
    """Convert (text, style) tuples to paragraph runs, applying font config."""
    # The first run replaces the paragraph's implicit empty run; subsequent
    # runs add. We always start by ensuring the paragraph has no leftover text.
    paragraph.text = ""
    for text, style in runs_spec:
        run = paragraph.add_run()
        run.text = text
        if style.get("bold"):
            run.font.bold = True
        if style.get("italic"):
            run.font.italic = True
        if "font" in style:
            run.font.name = style["font"]
        if "size" in style:
            run.font.size = Pt(style["size"])
        if "color" in style:
            r, g, b = style["color"]
            run.font.color.rgb = RGBColor(r, g, b)


def _pptx_add_footer(slide, msg: ExportMessage, Inches, Pt, RGBColor) -> None:
    """Small text in the slide footer band with model + attached file."""
    left, top = Inches(0.5), Inches(7.0)
    width, height = Inches(12.333), Inches(0.35)
    tb = slide.shapes.add_textbox(left, top, width, height)
    tf = tb.text_frame
    parts: list[str] = []
    if msg.model:
        parts.append(msg.model)
    if msg.timestamp:
        parts.append(msg.timestamp)
    if msg.file:
        parts.append(f"file: {msg.file}")
    tf.text = "  ·  ".join(parts)
    if tf.paragraphs:
        for run in tf.paragraphs[0].runs:
            run.font.size = Pt(9)
            run.font.color.rgb = RGBColor(0x66, 0x66, 0x66)


def _pptx_add_chart_slide(prs, title_text: str, image_bytes: Optional[bytes], Inches, Pt, RGBColor, theme: ExportTheme):
    """Per-chart slide: branded header + centred image with hairline frame.

    Returns the slide so callers can attach speaker notes.
    """
    slide = prs.slides.add_slide(prs.slide_layouts[6])  # Blank
    _pptx_add_brand_header(slide, title_text, Inches, Pt, RGBColor, theme)

    if image_bytes is None:
        tb = slide.shapes.add_textbox(
            Inches(_PPTX_MARGIN_X), Inches(3.5),
            Inches(13.333 - 2 * _PPTX_MARGIN_X), Inches(0.5),
        )
        _pptx_set_text(
            tb.text_frame, f"[Chart image not captured: {title_text}]",
            Pt=Pt, RGBColor=RGBColor,
            font=_PPTX_FONT_BODY, size=14, italic=True, color=_PPTX_TEXT_MUTED,
            align="center",
        )
        return slide

    # Hairline frame behind the image — same width as the image (10"), gives
    # the chart a subtle "card" look.
    try:
        from pptx.enum.shapes import MSO_SHAPE
    except ImportError:  # pragma: no cover
        MSO_SHAPE = None

    image_left_in = (13.333 - 10) / 2  # centre horizontally
    image_top_in = 1.65

    if MSO_SHAPE is not None:
        # Soft background card.
        _pptx_add_rect_fill(
            slide, MSO_SHAPE, RGBColor,
            left=Inches(image_left_in - 0.15), top=Inches(image_top_in - 0.15),
            width=Inches(10.3), height=Inches(4.7),
            fill_rgb=_PPTX_ROW_ALT,
        )

    try:
        slide.shapes.add_picture(
            io.BytesIO(image_bytes),
            left=Inches(image_left_in),
            top=Inches(image_top_in),
            width=Inches(10),
        )
    except Exception as exc:  # noqa: BLE001
        log.warning("pptx_chart_embed_failed", extra={"error": str(exc)})
        tb = slide.shapes.add_textbox(
            Inches(_PPTX_MARGIN_X), Inches(3.5),
            Inches(13.333 - 2 * _PPTX_MARGIN_X), Inches(0.5),
        )
        _pptx_set_text(
            tb.text_frame, f"[Chart image failed to embed: {title_text}]",
            Pt=Pt, RGBColor=RGBColor,
            font=_PPTX_FONT_BODY, size=14, italic=True, color=_PPTX_TEXT_MUTED,
            align="center",
        )
    return slide


def _pptx_add_table_slide(prs, title_text: str, table_node, Inches, Pt, RGBColor, theme: ExportTheme):
    """Per-table slide: branded header + polished table.

    Polishing:
      * Header row: dark slate fill, white bold text, larger font.
      * Body rows: zebra striping (white / very light gray) for scanability.
      * Right-align cells that look numeric so columns of figures line up.
      * Hairline borders (delivered by the default pptx Table; we don't
        try to override the XML).

    Rows that vary in column count (LLM output is messy) are padded to the
    widest row's column count so the pptx grid has no holes.
    """
    slide = prs.slides.add_slide(prs.slide_layouts[6])  # Blank
    _pptx_add_brand_header(slide, title_text, Inches, Pt, RGBColor, theme)

    rows = table_node.find_all("tr")
    if not rows:
        return slide
    col_count = max(len(r.find_all(["td", "th"])) for r in rows)
    if col_count == 0:
        return slide

    # Layout the table to fill the content area.
    available_width = Inches(13.333 - 2 * _PPTX_MARGIN_X)
    available_height = _PPTX_CONTENT_BOTTOM - _PPTX_CONTENT_TOP
    row_height = max(0.4, min(0.7, available_height / max(len(rows), 1)))
    table_height = Inches(row_height * len(rows))
    if table_height > Inches(available_height):
        table_height = Inches(available_height)

    shape = slide.shapes.add_table(
        len(rows), col_count,
        Inches(_PPTX_MARGIN_X), Inches(_PPTX_CONTENT_TOP),
        available_width, table_height,
    )
    table = shape.table

    has_header = bool(rows[0].find_all("th"))

    # Heuristic: detect numeric columns from the first body row so we can
    # right-align them. Imperfect — currencies with $ prefix won't isnumeric()
    # — but a decent default that improves the common case (counts, scores).
    numeric_cols: set[int] = set()
    body_start = 1 if has_header else 0
    if len(rows) > body_start:
        sample_cells = rows[body_start].find_all(["td", "th"])
        for c_idx, c in enumerate(sample_cells):
            text = c.get_text(strip=True).replace(",", "").replace("%", "").replace("$", "").lstrip("-")
            if text and (text.replace(".", "", 1).isdigit()):
                numeric_cols.add(c_idx)

    try:
        from pptx.enum.text import PP_ALIGN
    except ImportError:
        PP_ALIGN = None

    for r_idx, tr in enumerate(rows):
        cells = tr.find_all(["td", "th"])
        is_header_row = has_header and r_idx == 0
        is_alt_row = (not is_header_row) and ((r_idx - body_start) % 2 == 1)

        for c_idx in range(col_count):
            cell = table.cell(r_idx, c_idx)
            text = cells[c_idx].get_text(strip=True) if c_idx < len(cells) else ""
            cell.text = text

            # Background fill.
            if is_header_row:
                cell.fill.solid()
                cell.fill.fore_color.rgb = RGBColor(*_PPTX_TABLE_HEADER_BG)
            elif is_alt_row:
                cell.fill.solid()
                cell.fill.fore_color.rgb = RGBColor(*_PPTX_ROW_ALT)
            else:
                cell.fill.solid()
                cell.fill.fore_color.rgb = RGBColor(*_PPTX_WHITE)

            # Cell padding — defaults are tight, but a small bump reads
            # better on screen.
            cell.margin_left = Inches(0.08)
            cell.margin_right = Inches(0.08)
            cell.margin_top = Inches(0.04)
            cell.margin_bottom = Inches(0.04)

            # Text styling.
            for p in cell.text_frame.paragraphs:
                if PP_ALIGN is not None and c_idx in numeric_cols and not is_header_row:
                    p.alignment = PP_ALIGN.RIGHT
                for run in p.runs:
                    run.font.name = _PPTX_FONT_BODY
                    if is_header_row:
                        run.font.bold = True
                        run.font.size = Pt(11)
                        run.font.color.rgb = RGBColor(*_PPTX_WHITE)
                    else:
                        run.font.size = Pt(10.5)
                        run.font.color.rgb = RGBColor(*_PPTX_TEXT_PRIMARY)
    return slide


def _pdf_insert_chart(
    story,
    styles,
    msg_idx: int,
    chart_idx: int,
    chart_specs: list[dict],
    charts: dict,
    inch,
    Paragraph,
    Spacer,
    RLImage,
    theme: ExportTheme,
) -> None:
    chart_id = f"chart-{msg_idx}-{chart_idx}"
    image_bytes = _resolve_chart_image_bytes(
        chart_id=chart_id, chart_idx=chart_idx,
        chart_specs=chart_specs, charts=charts, theme=theme,
    )
    spec = chart_specs[chart_idx] if 0 <= chart_idx < len(chart_specs) else {}
    title = (spec.get("title") or "").strip() if isinstance(spec, dict) else ""

    if image_bytes is None:
        story.append(
            Paragraph(
                f"[Chart: {_escape_for_reportlab(title) or 'untitled'}]",
                styles["chart_placeholder"],
            )
        )
        return

    if title:
        story.append(Paragraph(_escape_for_reportlab(title), styles["chart_title"]))
    try:
        # Cap width at 6 inches (page is ~6.5" wide between 0.75" margins).
        img = RLImage(io.BytesIO(image_bytes), width=6 * inch, height=3 * inch, kind="proportional")
        story.append(img)
    except Exception as exc:  # noqa: BLE001
        log.warning("chart_image_embed_failed_pdf", extra={"chart_id": chart_id, "error": str(exc)})
        story.append(
            Paragraph(
                f"[Chart: {_escape_for_reportlab(title) or 'untitled'} — image embed failed]",
                styles["chart_placeholder"],
            )
        )
    story.append(Spacer(1, 0.1 * inch))
