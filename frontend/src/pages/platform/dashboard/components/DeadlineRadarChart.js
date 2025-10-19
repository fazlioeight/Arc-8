import React, { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import useResizeObserver from "../../../../hooks/useResizeObserver";

const margin = { top: 24, right: 24, bottom: 24, left: 24 };
const innerRadius = 40;

const DeadlineRadarChart = ({ data, onSegmentClick }) => {
  const containerRef = useRef(null);
  const svgRef = useRef(null);
  const tooltipRef = useRef(null);
  const [tooltip, setTooltip] = useState(null);
  const [pulseDone, setPulseDone] = useState(false);
  const { width, height } = useResizeObserver(containerRef);

  const buckets = useMemo(() => data?.buckets || [], [data]);
  const maxCount = useMemo(() => d3.max(buckets, (bucket) => bucket.count) || 0, [buckets]);

  useEffect(() => {
    if (!width || !height || !buckets.length) return;

    const w = Math.max(280, width);
    const h = Math.max(280, height);
    const radius = Math.min(w, h) / 2 - Math.max(margin.left, margin.top);

    const svg = d3
      .select(svgRef.current)
      .attr("width", w)
      .attr("height", h)
      .attr("role", "img")
      .attr("aria-label", "Deadline radar chart");

    const center = svg
      .selectAll("g.center")
      .data([null])
      .join("g")
      .attr("class", "center")
      .attr("transform", `translate(${w / 2},${h / 2})`);

    const angle = d3.scaleBand().domain(buckets.map((bucket) => bucket.range)).range([0, Math.PI * 2]).padding(0.15);
    const radial = d3.scaleLinear().domain([0, maxCount]).range([innerRadius, radius]).nice();

    const arc = d3
      .arc()
      .innerRadius(innerRadius)
      .startAngle((bucket) => angle(bucket.range))
      .endAngle((bucket) => angle(bucket.range) + angle.bandwidth())
      .padAngle(0.02)
      .padRadius(innerRadius);

    const bars = center
      .selectAll("path.deadline-bar")
      .data(buckets, (bucket) => bucket.range)
      .join(
        (enter) =>
          enter
            .append("path")
            .attr("class", (bucket) => `deadline-bar${bucket.urgent ? " is-urgent" : ""}`)
            .attr("d", (bucket) =>
              arc({
                ...bucket,
                outerRadius: innerRadius,
              })
            ),
        (update) =>
          update.attr("class", (bucket) => `deadline-bar${bucket.urgent ? " is-urgent" : ""}`),
        (exit) => exit.remove()
      )
      .transition()
      .duration(500)
      .attr("d", (bucket) =>
        arc({
          ...bucket,
          outerRadius: radial(bucket.count),
        })
      );

    if (!pulseDone) {
      bars
        .filter((bucket) => bucket.urgent)
        .attr("data-pulse", "true")
        .attr("class", (bucket) => `deadline-bar is-urgent is-pulsing`);
      const timer = setTimeout(() => setPulseDone(true), 3000);
      return () => clearTimeout(timer);
    }

    const guides = center
      .selectAll("circle.guide")
      .data(radial.ticks(3))
      .join("circle")
      .attr("class", "guide")
      .attr("r", (value) => radial(value))
      .attr("fill", "none");

    const axis = center
      .selectAll("g.axis-line")
      .data(buckets)
      .join("g")
      .attr("class", "axis-line")
      .attr("transform", (bucket) => `rotate(${((angle(bucket.range) + angle.bandwidth() / 2) * 180) / Math.PI})`);

    axis
      .selectAll("line")
      .data((bucket) => [bucket])
      .join("line")
      .attr("x1", innerRadius)
      .attr("x2", radius)
      .attr("stroke-dasharray", "2 2");

    center
      .selectAll("text.bucket-label")
      .data(buckets)
      .join("text")
      .attr("class", "bucket-label")
      .attr("text-anchor", "middle")
      .attr("transform", (bucket) => {
        const angleCenter = angle(bucket.range) + angle.bandwidth() / 2 - Math.PI / 2;
        const r = radial(bucket.count) + 20;
        return `translate(${Math.cos(angleCenter) * r}, ${Math.sin(angleCenter) * r})`;
      })
      .text((bucket) => `${bucket.range} (${d3.format(",")(bucket.count)})`);
  }, [width, height, buckets, maxCount, pulseDone]);

  useEffect(() => {
    if (!width || !height || !buckets.length) return;

    const w = Math.max(280, width);
    const h = Math.max(280, height);
    const radius = Math.min(w, h) / 2 - Math.max(margin.left, margin.top);
    const angle = d3.scaleBand().domain(buckets.map((bucket) => bucket.range)).range([0, Math.PI * 2]).padding(0.15);
    const radial = d3.scaleLinear().domain([0, maxCount]).range([innerRadius, radius]).nice();
    const arc = d3
      .arc()
      .innerRadius(innerRadius)
      .startAngle((bucket) => angle(bucket.range))
      .endAngle((bucket) => angle(bucket.range) + angle.bandwidth())
      .padAngle(0.02)
      .padRadius(innerRadius);

    const svg = d3.select(svgRef.current);
    const center = svg.select("g.center");
    const overlays = center
      .selectAll("path.deadline-overlay")
      .data(buckets, (bucket) => bucket.range)
      .join("path")
      .attr("class", "deadline-overlay")
      .attr("d", (bucket) =>
        arc({
          ...bucket,
          outerRadius: radial(bucket.count),
        })
      )
      .attr("fill", "transparent")
      .attr("pointer-events", "all")
      .on("mousemove", (event, bucket) => {
        const rect = containerRef.current?.getBoundingClientRect();
        setTooltip({
          x: event.clientX - (rect?.left || 0),
          y: event.clientY - (rect?.top || 0),
          bucket,
        });
      })
      .on("mouseleave", () => setTooltip(null))
      .on("click", (_, bucket) => {
        if (typeof onSegmentClick === "function") {
          onSegmentClick(bucket);
        }
      })
      .attr("tabindex", 0)
      .attr("role", "button")
      .attr("aria-label", (bucket) => `${bucket.range} days bucket, ${d3.format(",")(bucket.count)} items${bucket.urgent ? ", urgent" : ""}`)
      .on("focus", (_, bucket) => {
        const rect = center.node()?.getBoundingClientRect();
        setTooltip({
          x: rect ? rect.x : 0,
          y: rect ? rect.y : 0,
          bucket,
        });
      })
      .on("keydown", (event, bucket) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        if (typeof onSegmentClick === "function") {
          onSegmentClick(bucket);
        }
      });

    return () =>
      overlays
        .on("mousemove", null)
        .on("mouseleave", null)
        .on("click", null)
        .on("focus", null)
        .on("keydown", null);
  }, [width, height, buckets, maxCount, onSegmentClick]);

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
      <div class="viz-tooltip__heading">${tooltip.bucket.range} days</div>
      <div>Count: ${d3.format(",")(tooltip.bucket.count)}</div>
      ${tooltip.bucket.urgent ? '<div class="viz-tooltip__flag">High risk to cutoff</div>' : ""}
    `;
  }, [tooltip]);

  return (
    <div ref={containerRef} className="deadline-radar-chart">
      <svg ref={svgRef} />
      <div ref={tooltipRef} className="viz-tooltip" aria-live="polite" />
    </div>
  );
};

export default DeadlineRadarChart;
