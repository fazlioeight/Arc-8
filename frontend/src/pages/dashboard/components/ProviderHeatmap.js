import React, { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import useResizeObserver from "../../../hooks/useResizeObserver";

const margin = { top: 24, right: 24, bottom: 24, left: 120 };
const rowHeight = 36;
const overscan = 3;

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

    const frame = svg
      .selectAll("g.frame")
      .data([null])
      .join("g")
      .attr("class", "frame")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3.scaleBand().domain(metrics).range([0, innerWidth]).padding(0.05);
    const y = d3.scaleBand().domain(visibleProviders).range([0, innerHeight]).padding(0.05);
    const color = d3.scaleSequential(data?.normalize ? d3.interpolatePuBuGn : d3.interpolateTurbo).domain(colorDomain);

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
      .attr("fill", (cell) => {
        if (cell.displayValue === null || cell.displayValue === undefined) return "var(--chart-empty)";
        return color(cell.displayValue);
      })
      .on("mousemove", (event, cell) => {
        const rect = outerRef.current?.getBoundingClientRect();
        setTooltip({
          x: event.clientX - (rect?.left || 0),
          y: event.clientY - (rect?.top || 0),
          cell,
        });
      })
      .on("mouseleave", () => setTooltip(null));
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
