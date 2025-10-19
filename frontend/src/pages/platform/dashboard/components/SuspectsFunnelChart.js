import React, { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import useResizeObserver from "../../../../hooks/useResizeObserver";

const barHeight = 36;
const barGap = 16;
const margin = { top: 12, right: 16, bottom: 16, left: 12 };

const SuspectsFunnelChart = ({ data, onStageSelect, partial, asOf }) => {
  const containerRef = useRef(null);
  const svgRef = useRef(null);
  const tooltipRef = useRef(null);
  const { width, height } = useResizeObserver(containerRef);
  const [tooltip, setTooltip] = useState(null);

  const stages = useMemo(() => data?.stages || [], [data]);
  const maxCount = useMemo(() => d3.max(stages, (stage) => stage.count) || 0, [stages]);

  useEffect(() => {
    if (!width || !stages.length) return;
    const computedHeight =
      margin.top + margin.bottom + stages.length * barHeight + (stages.length - 1) * barGap;

    const svg = d3
      .select(svgRef.current)
      .attr("width", Math.max(320, width))
      .attr("height", Math.max(200, computedHeight))
      .attr("role", "img")
      .attr("aria-label", "Suspects funnel");

    const frame = svg
      .selectAll("g.frame")
      .data([null])
      .join("g")
      .attr("class", "frame")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3.scaleLinear().domain([0, maxCount]).range([0, Math.max(280, width - margin.left - margin.right)]);

    const pattern = frame
      .selectAll("defs")
      .data([null])
      .join("defs")
      .selectAll("pattern")
      .data(partial ? [null] : [])
      .join("pattern")
      .attr("id", "partial-stripe")
      .attr("patternUnits", "userSpaceOnUse")
      .attr("width", 8)
      .attr("height", 8)
      .attr("patternTransform", "rotate(45)")
      .call((pat) => {
        pat.selectAll("rect")
          .data([null])
          .join("rect")
          .attr("width", 4)
          .attr("height", 8)
          .attr("transform", "translate(0,0)")
          .attr("fill", "rgba(15, 76, 129, 0.25)");
      });

    const groups = frame
      .selectAll("g.stage")
      .data(stages, (stage) => stage.key)
      .join(
        (enter) => enter.append("g").attr("class", "stage"),
        (update) => update,
        (exit) => exit.remove()
      )
      .attr("transform", (_, index) => `translate(0, ${index * (barHeight + barGap)})`);

    groups
      .selectAll("rect.bar")
      .data((stage) => [stage])
      .join("rect")
      .attr("class", "bar")
      .attr("rx", 8)
      .attr("ry", 8)
      .attr("fill", partial ? "url(#partial-stripe)" : "var(--chart-stage-fill)")
      .attr("width", (stage) => x(stage.count))
      .attr("height", barHeight)
      .attr("tabindex", 0)
      .attr("role", "button")
      .attr("aria-label", (stage) => buildAriaLabel(stage))
      .on("focus", (_, stage) => {
        setTooltip({
          x: x(stage.count) + margin.left,
          y: stages.indexOf(stage) * (barHeight + barGap) + margin.top + barHeight / 2,
          stage,
        });
      })
      .on("click", (_, stage) => {
        if (typeof onStageSelect === "function") {
          onStageSelect(stage);
        }
      })
      .on("keydown", (event, stage) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        if (typeof onStageSelect === "function") {
          onStageSelect(stage);
        }
      });

    groups
      .selectAll("text.label")
      .data((stage) => [stage])
      .join("text")
      .attr("class", "label")
      .attr("x", 12)
      .attr("y", barHeight / 2 + 4)
      .text((stage) => `${stage.label} - ${d3.format(",")(stage.count)} (${formatPercent(stage.conversion)})`);

    groups
      .selectAll("text.meta")
      .data((stage) => [stage])
      .join("text")
      .attr("class", "meta")
      .attr("x", (stage) => Math.max(12, x(stage.count) - 140))
      .attr("y", barHeight / 2 + 4)
      .attr("text-anchor", "end")
      .text((stage) => `Median ${stage.medianDays} days`);
  }, [width, stages, partial, onStageSelect, maxCount]);

  useEffect(() => {
    if (!width || !stages.length) return;
    const x = d3.scaleLinear().domain([0, maxCount]).range([0, Math.max(280, width - margin.left - margin.right)]);
    const svg = d3.select(svgRef.current);
    const frame = svg.select("g.frame");
    const overlay = frame
      .selectAll("rect.overlay")
      .data(stages)
      .join("rect")
      .attr("class", "overlay")
      .attr("fill", "transparent")
      .attr("width", (stage) => x(stage.count))
      .attr("height", barHeight)
      .attr("transform", (_, index) => `translate(0, ${index * (barHeight + barGap)})`)
      .on("mousemove", (event, stage) => {
        const rect = containerRef.current?.getBoundingClientRect();
        setTooltip({
          x: event.clientX - (rect?.left || 0),
          y: event.clientY - (rect?.top || 0),
          stage,
        });
      })
      .on("mouseleave", () => setTooltip(null))
      .on("click", (_, stage) => {
        if (typeof onStageSelect === "function") onStageSelect(stage);
      });

    return () => overlay.on("mousemove", null).on("mouseleave", null).on("click", null);
  }, [width, stages, maxCount, onStageSelect]);

  useEffect(() => {
    const el = tooltipRef.current;
    if (!el) return;
    if (!tooltip) {
      el.style.opacity = 0;
      return;
    }
    el.style.opacity = 1;
    el.style.transform = `translate(${tooltip.x + 12}px, ${tooltip.y - 24}px)`;
    el.innerHTML = `
      <div class="viz-tooltip__heading">${tooltip.stage.label}</div>
      <div>Count: ${d3.format(",")(tooltip.stage.count)}</div>
      <div>Conversion: ${formatPercent(tooltip.stage.conversion)}</div>
      <div>Median time: ${tooltip.stage.medianDays} day(s)</div>
    `;
  }, [tooltip]);

  return (
    <div ref={containerRef} className="suspects-funnel-chart">
      <svg ref={svgRef} />
      <div ref={tooltipRef} className="viz-tooltip" aria-live="polite" />
      {partial && asOf ? (
        <div className="partial-indicator" role="note">
          Partial through {formatAsOf(asOf)}
        </div>
      ) : null}
    </div>
  );
};

const formatPercent = (value) => {
  if (!Number.isFinite(value)) return "-";
  return d3.format(".0%")(value);
};

const formatAsOf = (value) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));

const buildAriaLabel = (stage) =>
  `${stage.label} stage, ${d3.format(",")(stage.count)} items, ${formatPercent(stage.conversion)} conversion, median ${stage.medianDays} day${stage.medianDays === 1 ? "" : "s"}.`;

export default SuspectsFunnelChart;
