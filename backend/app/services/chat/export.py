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
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Iterable, Optional


log = logging.getLogger("nexora.chat.export")


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
) -> bytes:
    """Render ``messages`` as a .docx file. Returns the raw bytes."""
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
        _docx_render_message(doc, msg, msg_idx, charts or {}, Pt, RGBColor)

    buf = io.BytesIO()
    try:
        doc.save(buf)
    except Exception as exc:  # noqa: BLE001
        raise ExportError(f"Failed to write docx: {exc}") from exc
    return buf.getvalue()


def export_to_pdf(
    *,
    messages: list[ExportMessage],
    charts: dict[str, str] | None = None,
    title: Optional[str] = None,
) -> bytes:
    """Render ``messages`` as a PDF. Returns the raw bytes."""
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


def _docx_render_message(doc, msg: ExportMessage, msg_idx: int, charts: dict, Pt, RGBColor) -> None:
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
    _docx_walk(doc, tree, msg_idx, chart_specs, charts, Pt, RGBColor)


def _docx_walk(doc, node, msg_idx: int, chart_specs: list[dict], charts: dict, Pt, RGBColor) -> None:
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
                _docx_insert_chart(doc, msg_idx, sentinel_match, chart_specs, charts, Inches, Pt, RGBColor)
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
) -> None:
    """Insert the captured chart image, or a placeholder paragraph."""
    chart_id = f"chart-{msg_idx}-{chart_idx}"
    image_bytes = _decode_chart_image(charts.get(chart_id, ""))
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
                    inch, Paragraph, Spacer, RLImage,
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
) -> None:
    chart_id = f"chart-{msg_idx}-{chart_idx}"
    image_bytes = _decode_chart_image(charts.get(chart_id, ""))
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
