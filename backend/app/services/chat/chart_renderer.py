"""Server-side rendering of chat chart blocks to PNG.

The chat frontend renders ```chart {...}``` markdown blocks live in the
browser via Chart.js. When the assistant calls the ``build_artifact`` tool
mid-conversation those Chart.js canvases don't exist yet (the model is
synthesising new content rather than exporting what's on screen), so we
render the same spec server-side with matplotlib instead. The output is
intentionally close to what Chart.js produces — same colours, same data
ordering, same title placement — so a deck exported via build_artifact
looks consistent with the chat UI's live previews.

Supported types
---------------
``bar``, ``line``, ``pie``, ``doughnut``, ``scatter``. These match the
shapes the chat model is trained to emit and account for ~all chart blocks
seen in production traffic. Unknown types render as a labelled placeholder
panel instead of crashing the build.

Spec shape (mirror of ``ChatPage.js``)
--------------------------------------
::

    {
      "type":     "bar" | "line" | "pie" | "doughnut" | "scatter",
      "title":    str (optional),
      "labels":   [str, ...],
      "datasets": [ { "label": str, "data": [number, ...] }, ... ]
    }

Thread safety
-------------
matplotlib's pyplot interface holds module-level state. We use the OO API
(``Figure``) so concurrent calls don't interleave. The Agg backend is
forced via ``matplotlib.use('Agg')`` at import time — no display server
required (containers) and no GUI event loop overhead.
"""
from __future__ import annotations

import io
import logging
from typing import Iterable, Optional, Sequence

import matplotlib

matplotlib.use("Agg")  # headless backend, must be set before pyplot import
from matplotlib.figure import Figure  # noqa: E402

logger = logging.getLogger("nexora.chat.chart_renderer")


# ── Palette ─────────────────────────────────────────────────────────────────
# Default palette mirrors the chat UI's brand accent. The first colour is the
# primary accent (used for the dominant series); the rest are de-saturated
# companions that stack cleanly in grouped/stacked charts and read well next
# to the brand orange on white slides. Override via ``palette=`` to apply
# per-tenant branding.
DEFAULT_PALETTE: tuple[str, ...] = (
    "#D97706",  # Nexora orange
    "#1F2937",  # near-black slate
    "#0EA5E9",  # cool blue
    "#10B981",  # emerald
    "#A855F7",  # violet
    "#EF4444",  # red
    "#F59E0B",  # amber
    "#14B8A6",  # teal
)

# Output dimensions in inches × DPI. 1600×900 @ 200 DPI gives a sharp image
# that fits the pptx chart slide layout (10" wide canvas) without resampling
# blur and stays well under the 4 MB chart-image cap enforced upstream.
_FIG_INCHES = (8.0, 4.5)
_FIG_DPI = 200


# ── Spec validation ─────────────────────────────────────────────────────────

_SUPPORTED_TYPES = {"bar", "line", "pie", "doughnut", "scatter"}


def _coerce_numbers(values: Iterable) -> list[float]:
    """Best-effort numeric coercion. None / non-numeric entries become 0.0
    so a partially-malformed dataset still renders rather than killing the
    whole export."""
    out: list[float] = []
    for v in values or []:
        if v is None:
            out.append(0.0)
            continue
        try:
            out.append(float(v))
        except (TypeError, ValueError):
            out.append(0.0)
    return out


def _datasets(spec: dict) -> list[dict]:
    raw = spec.get("datasets") or []
    if not isinstance(raw, list):
        return []
    out: list[dict] = []
    for i, d in enumerate(raw):
        if not isinstance(d, dict):
            continue
        out.append({
            "label": str(d.get("label") or f"Series {i + 1}"),
            "data": _coerce_numbers(d.get("data") or []),
        })
    return out


def _labels(spec: dict) -> list[str]:
    raw = spec.get("labels") or []
    if not isinstance(raw, list):
        return []
    return [str(v) if v is not None else "" for v in raw]


# ── Public API ──────────────────────────────────────────────────────────────


def render_chart_png(
    spec: dict,
    *,
    palette: Optional[Sequence[str]] = None,
) -> Optional[bytes]:
    """Render ``spec`` to PNG bytes. Returns ``None`` if the spec is not
    renderable (missing type, no data, unknown type, etc.) — callers fall
    back to a textual placeholder.

    ``palette`` overrides the default colour cycle so per-tenant branding
    can theme its decks. Pass a sequence of hex strings (``"#RRGGBB"``);
    additional series past the palette length cycle back to the start.
    """
    if not isinstance(spec, dict):
        return None
    chart_type = (spec.get("type") or "").strip().lower()
    if chart_type not in _SUPPORTED_TYPES:
        return None

    labels = _labels(spec)
    datasets = _datasets(spec)
    if not datasets or not any(d["data"] for d in datasets):
        return None

    colours = list(palette) if palette else list(DEFAULT_PALETTE)
    if not colours:
        colours = list(DEFAULT_PALETTE)

    fig = Figure(figsize=_FIG_INCHES, dpi=_FIG_DPI, facecolor="white")
    ax = fig.add_subplot(111)

    try:
        if chart_type == "bar":
            _render_bar(ax, labels, datasets, colours)
        elif chart_type == "line":
            _render_line(ax, labels, datasets, colours)
        elif chart_type in {"pie", "doughnut"}:
            _render_pie(ax, labels, datasets, colours, doughnut=chart_type == "doughnut")
        elif chart_type == "scatter":
            _render_scatter(ax, datasets, colours)

        title = (spec.get("title") or "").strip()
        if title:
            ax.set_title(title, fontsize=13, fontweight="bold", color="#111827", pad=10)

        # Common cosmetics applied after the type-specific renderer.
        _polish_axes(ax, chart_type)

        buf = io.BytesIO()
        fig.tight_layout()
        fig.savefig(buf, format="png", dpi=_FIG_DPI, bbox_inches="tight",
                    facecolor="white", pad_inches=0.15)
        return buf.getvalue()
    except Exception as exc:  # noqa: BLE001
        # Last-ditch defence: any matplotlib error becomes a None so the
        # exporter falls back to the textual placeholder instead of
        # killing the whole artifact build.
        logger.warning("chart_render_failed", extra={
            "chart_type": chart_type, "error": str(exc),
        })
        return None
    finally:
        # Free the figure even on success — Agg holds onto canvases until
        # GC otherwise, which spikes memory under sustained load.
        try:
            fig.clear()
        except Exception:  # noqa: BLE001
            pass


# ── Type-specific renderers ─────────────────────────────────────────────────


def _render_bar(ax, labels: list[str], datasets: list[dict], colours: list[str]) -> None:
    """Grouped vertical bars. With one dataset this is a simple bar chart;
    with multiple it side-by-sides them per label (matching Chart.js's
    default grouped-bar behaviour)."""
    import numpy as np

    n_groups = len(labels) or max(len(d["data"]) for d in datasets)
    n_series = len(datasets)
    x = np.arange(n_groups)
    # Width per bar shrinks as we add series, but capped so wide bars
    # don't fall off the axis.
    total_width = 0.78
    width = total_width / max(n_series, 1)

    for i, ds in enumerate(datasets):
        data = ds["data"][:n_groups] + [0.0] * (n_groups - len(ds["data"]))
        offset = (i - (n_series - 1) / 2) * width
        ax.bar(
            x + offset,
            data,
            width=width,
            label=ds["label"],
            color=colours[i % len(colours)],
            edgecolor="white",
            linewidth=0.8,
        )

    ax.set_xticks(x)
    ax.set_xticklabels(labels[:n_groups], rotation=0 if n_groups <= 6 else 30,
                       ha="right" if n_groups > 6 else "center", fontsize=9)
    if n_series > 1:
        ax.legend(loc="upper right", fontsize=9, frameon=False)


def _render_line(ax, labels: list[str], datasets: list[dict], colours: list[str]) -> None:
    """One line per dataset, shared x-axis from ``labels`` (or numeric index
    when labels missing). Markers on every point keep small series readable."""
    import numpy as np

    n = len(labels) or max(len(d["data"]) for d in datasets)
    x = np.arange(n)
    for i, ds in enumerate(datasets):
        data = ds["data"][:n] + [0.0] * (n - len(ds["data"]))
        colour = colours[i % len(colours)]
        ax.plot(
            x, data,
            label=ds["label"],
            color=colour,
            linewidth=2.2,
            marker="o",
            markersize=5,
            markerfacecolor=colour,
            markeredgecolor="white",
            markeredgewidth=1.0,
        )

    if labels:
        ax.set_xticks(x)
        ax.set_xticklabels(labels[:n], rotation=0 if n <= 8 else 30,
                           ha="right" if n > 8 else "center", fontsize=9)
    if len(datasets) > 1:
        ax.legend(loc="best", fontsize=9, frameon=False)


def _render_pie(ax, labels: list[str], datasets: list[dict], colours: list[str], *, doughnut: bool) -> None:
    """Pie (or ring) chart from the *first* dataset only — pies don't compose
    across multiple series in any meaningful way."""
    data = datasets[0]["data"]
    total = sum(data)
    if total <= 0:
        ax.text(0.5, 0.5, "No data", ha="center", va="center", fontsize=12, color="#6b7280")
        ax.set_axis_off()
        return
    slice_labels = labels[:len(data)] if labels else [f"Slice {i + 1}" for i in range(len(data))]
    wedge_props = {"edgecolor": "white", "linewidth": 1.5}
    if doughnut:
        wedge_props["width"] = 0.42
    ax.pie(
        data,
        labels=slice_labels,
        autopct="%1.0f%%",
        colors=[colours[i % len(colours)] for i in range(len(data))],
        startangle=90,
        textprops={"fontsize": 10, "color": "#1f2937"},
        wedgeprops=wedge_props,
    )
    ax.set_aspect("equal")


def _render_scatter(ax, datasets: list[dict], colours: list[str]) -> None:
    """Scatter plots accept (x, y) pairs. Chart.js's scatter form uses
    ``data: [{x, y}, ...]`` rather than ``data: [number, ...]`` — but since
    ``_coerce_numbers`` flattened the dataset, we fall back to indexing
    ``data`` by position pair: even indices = x, odd indices = y. This
    isn't pretty but it's resilient to whatever the model emits; for
    cleaner scatter renders, callers can synthesise structured ``points``
    in the chart spec and a future iteration here can pick them up."""
    for i, ds in enumerate(datasets):
        data = ds["data"]
        if not data:
            continue
        xs = data[0::2] if len(data) >= 2 else list(range(len(data)))
        ys = data[1::2] if len(data) >= 2 else data
        # Pad whichever is shorter.
        n = min(len(xs), len(ys))
        ax.scatter(
            xs[:n], ys[:n],
            label=ds["label"],
            color=colours[i % len(colours)],
            s=60,
            alpha=0.85,
            edgecolors="white",
            linewidths=1.0,
        )
    if len(datasets) > 1:
        ax.legend(loc="best", fontsize=9, frameon=False)


# ── Axis polish ─────────────────────────────────────────────────────────────


def _polish_axes(ax, chart_type: str) -> None:
    """Cosmetic pass shared across the bar/line/scatter renderers."""
    if chart_type in {"pie", "doughnut"}:
        return  # pies have no axes
    for side, on in (("top", False), ("right", False), ("left", True), ("bottom", True)):
        ax.spines[side].set_visible(on)
        if on:
            ax.spines[side].set_color("#d1d5db")
            ax.spines[side].set_linewidth(0.8)
    ax.tick_params(colors="#6b7280", labelsize=9)
    ax.yaxis.grid(True, color="#e5e7eb", linewidth=0.8, linestyle="-")
    ax.set_axisbelow(True)
    ax.set_facecolor("white")
