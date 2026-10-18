import React, { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import useResizeObserver from "../../../../hooks/useResizeObserver";

const margin = { top: 24, right: 24, bottom: 24, left: 120 };
const rowHeight = 36;
const overscan = 3;
// Minimum absolute value for color normalization to avoid zero range
const MIN_ABS_COLOR_DOMAIN = 2;

const ProviderHeatmap = ({ data, onCellSelect }) => {
  const outerRef = useRef(null);
  const scrollRef = useRef(null);
  const svgRef = useRef(null);
  const tooltipRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [tooltip, setTooltip] = useState(null);
  const size = useResizeObserver(outerRef);
  const rafRef = useRef(null);

  const providers = data?.providers || [];
  const metrics = data?.metrics || [];
  const matrix = data?.matrix || [];

  const totalHeight = providers.length * rowHeight;
  const viewportHeight = Math.max(320, size.height || 320);
  const viewportWidth = Math.max(400, size.width || 400);

  const visibleRange = useMemo(() => {
    const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
    const end = Math.min(providers.length, Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscan);
    return { start, end };
  }, [scrollTop, viewportHeight, providers.length]);

  const visibleProviders = providers.slice(visibleRange.start, visibleRange.end);
  const visibleMatrix = matrix.slice(visibleRange.start, visibleRange.end);
  const colorDomain = useMemo(() => {
    const values = matrix.flat().map((cell) => cell.displayValue).filter((value) => value !== null && value !== undefined);
    if (!values.length) return [0, 0];
    return [d3.min(values), d3.max(values)];
  }, [matrix]);

  useEffect(() => {
    const handleScroll = (event) => {
      const nextTop = event.target.scrollTop;
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
      rafRef.current = window.requestAnimationFrame(() => setScrollTop(nextTop));
    };
    const node = scrollRef.current;
    if (!node) return undefined;
    node.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      node.removeEventListener("scroll", handleScroll);
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
    };
  }, []);

  useEffect(() => {
    if (!metrics.length || !visibleProviders.length) {
      return;
    }

    const width = viewportWidth;
    const height = visibleProviders.length * rowHeight + margin.top + margin.bottom;
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const svg = d3
      .select(svgRef.current)
      .attr("width", width)
      .attr("height", height)
      .style("position", "absolute")
      .style("top", `${visibleRange.start * rowHeight}px`);

    const defs = svg.selectAll("defs").data([null]).join("defs");

    const x = d3.scaleBand().domain(metrics).range([0, innerWidth]).padding(0.05);
    const y = d3.scaleBand().domain(visibleProviders).range([0, innerHeight]).padding(0.05);
    const [domainMin, domainMax] = colorDomain;
    const sequentialDomain =
      domainMin === domainMax
        ? [domainMin || 0, (domainMin || 0) + 1]
        : colorDomain;
    const maxAbs = Math.max(Math.abs(domainMin || 0), Math.abs(domainMax || 0), MIN_ABS_COLOR_DOMAIN);
    const color = data?.normalize
      ? d3.scaleDiverging(d3.interpolateSpectral).domain([-maxAbs, 0, maxAbs])
      : d3.scaleSequential(d3.interpolateYlGnBu).domain(sequentialDomain);
    const legendDomain = data?.normalize ? [-maxAbs, maxAbs] : sequentialDomain;
    const legendSamplesCount = data?.normalize ? 7 : 6;
    const legendSamples = Array.from({ length: legendSamplesCount }, (_, index) => {
      const t = legendSamplesCount === 1 ? 0 : index / (legendSamplesCount - 1);
      const value = legendDomain[0] + t * (legendDomain[1] - legendDomain[0]);
      return {
        offset: `${t * 100}%`,
        color: Number.isFinite(value) ? color(value) : "var(--chart-empty)",
      };
    });
    const legendGradientId = data?.normalize ? "heatmap-legend-diverging" : "heatmap-legend-sequential";
    const legendGradient = defs
      .selectAll(`linearGradient#${legendGradientId}`)
      .data([null])
      .join("linearGradient")
      .attr("id", legendGradientId)
      .attr("x1", "0%")
      .attr("x2", "100%")
      .attr("y1", "0%")
      .attr("y2", "0%");

    legendGradient
      .selectAll("stop")
      .data(legendSamples)
      .join("stop")
      .attr("offset", (d) => d.offset)
      .attr("stop-color", (d) => d.color);

    const frame = svg
      .selectAll("g.frame")
      .data([null])
      .join("g")
      .attr("class", "frame")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const legendWidth = Math.max(120, Math.min(220, innerWidth));
    const legendY = Math.max(12, margin.top * 0.5);
    const legend = svg
      .selectAll("g.legend-container")
      .data([null])
      .join("g")
      .attr("class", "legend-container")
      .attr("transform", `translate(${margin.left}, ${legendY})`);

    if (
      legendWidth > 0 &&
      Number.isFinite(legendDomain?.[0]) &&
      Number.isFinite(legendDomain?.[1])
    ) {
      legend
        .selectAll("text.legend-title")
        .data([data?.normalize ? "Z-score" : "Metric value"])
        .join("text")
        .attr("class", "legend-title")
        .attr("x", 0)
        .attr("y", -8)
        .text((value) => value);

      legend
        .selectAll("rect.legend-ramp")
        .data([null])
        .join("rect")
        .attr("class", "legend-ramp")
        .attr("width", legendWidth)
        .attr("height", 10)
        .attr("rx", 4)
        .attr("fill", `url(#${legendGradientId})`);

      const legendScale = d3.scaleLinear().domain(legendDomain).range([0, legendWidth]);
      const legendFormatter = data?.normalize ? d3.format("+.1f") : d3.format(".2s");
      const legendAxis = d3.axisBottom(legendScale).ticks(4).tickSize(0).tickPadding(6).tickFormat(legendFormatter);

      const legendAxisGroup = legend
        .selectAll("g.legend-axis")
        .data([null])
        .join("g")
        .attr("class", "legend-axis")
        .attr("transform", "translate(0, 12)");

      legendAxisGroup.call(legendAxis);
      legendAxisGroup.select(".domain").remove();
    }

    const cells = frame
      .selectAll("rect.cell")
      .data(visibleMatrix.flat(), (cell) => `${cell.provider}-${cell.metric}`)
      .join(
        (enter) =>
          enter
            .append("rect")
            .attr("class", "cell")
            .attr("rx", 6)
            .attr("ry", 6)
            .attr("fill", "var(--chart-empty)")
            .attr("tabindex", 0)
            .attr("role", "button")
            .on("focus", (_, cell) => {
              const focus = getCellPosition(cell, x, y, margin);
              setTooltip({
                x: focus.x,
                y: focus.y,
                cell,
              });
            })
            .on("click", (_, cell) => {
              if (typeof onCellSelect === "function") onCellSelect(cell);
            }),
        (update) => update,
        (exit) => exit.remove()
      )
      .attr("x", (cell) => x(cell.metric) || 0)
      .attr("y", (cell) => y(cell.provider) || 0)
      .attr("width", x.bandwidth())
      .attr("height", y.bandwidth())
      .on("mousemove", (event, cell) => {
        const rect = outerRef.current?.getBoundingClientRect();
        setTooltip({
          x: event.clientX - (rect?.left || 0),
          y: event.clientY - (rect?.top || 0),
          cell,
        });
      })
      .on("mouseleave", () => setTooltip(null));
    cells
      .interrupt()
      .transition()
      .duration(400)
      .attr("fill", (cell) => {
        if (cell.displayValue === null || cell.displayValue === undefined) return "var(--chart-empty)";
        return color(cell.displayValue);
      });
    cells.on("keydown", (event, cell) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      if (typeof onCellSelect === "function") onCellSelect(cell);
    });

    frame
      .selectAll("text.provider-label")
      .data(visibleProviders)
      .join("text")
      .attr("class", "provider-label")
      .attr("x", -12)
      .attr("y", (provider) => (y(provider) || 0) + y.bandwidth() / 2 + 4)
      .attr("text-anchor", "end")
      .text((provider) => provider);

    frame
      .selectAll("text.metric-label")
      .data(metrics)
      .join("text")
      .attr("class", "metric-label")
      .attr("transform", (metric) => `translate(${(x(metric) || 0) + x.bandwidth() / 2}, -8)`)
      .attr("text-anchor", "middle")
      .text((metric) => metricLabel(metric));
  }, [metrics, visibleProviders, visibleMatrix, data?.normalize, colorDomain, viewportWidth, visibleRange.start, onCellSelect]);

  useEffect(() => {
    const el = tooltipRef.current;
    if (!el) return;
    if (!tooltip) {
      el.style.opacity = 0;
      return;
    }
    el.style.opacity = 1;
    el.style.transform = `translate(${tooltip.x + 8}px, ${tooltip.y - 16}px)`;
    el.innerHTML = `
      <div class="viz-tooltip__heading">${tooltip.cell.provider}</div>
      <div>${metricLabel(tooltip.cell.metric)}</div>
      <div>Value: ${formatValue(tooltip.cell.displayValue, tooltip.cell.metric)}</div>
    `;
  }, [tooltip]);

  return (
    <div ref={outerRef} className="provider-heatmap-chart">
      <div
        ref={scrollRef}
        className="provider-heatmap-chart__viewport"
        style={{ maxHeight: `${viewportHeight}px` }}
        role="listbox"
        aria-label="Provider heatmap"
      >
        <div className="provider-heatmap-chart__canvas" style={{ height: `${totalHeight + margin.top + margin.bottom}px` }}>
          <svg ref={svgRef} />
        </div>
      </div>
      <div ref={tooltipRef} className="viz-tooltip" aria-live="polite" />
    </div>
  );
};

const metricLabel = (metric) => {
  switch (metric) {
    case "open_raf":
      return "Open RAF";
    case "denial_rate":
      return "Denial Rate";
    case "days_aging":
      return "Avg Days Aging";
    case "qa_fail_rate":
      return "QA Fail Rate";
    default:
      return metric;
  }
};

const formatValue = (value, metric) => {
  if (value === null || value === undefined) return "-";
  if (metric.includes("rate")) return `${(value * 100).toFixed(1)}%`;
  if (metric.includes("days")) return `${value.toFixed(0)} days`;
  return value.toFixed(1);
};

const getCellPosition = (cell, xScale, yScale, chartMargin) => {
  if (!cell) return { x: 0, y: 0 };
  const x = (xScale(cell.metric) || 0) + chartMargin.left;
  const y = (yScale(cell.provider) || 0) + chartMargin.top;
  return { x, y };
};

export default ProviderHeatmap;
