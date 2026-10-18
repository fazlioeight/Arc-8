import React, { useEffect, useRef, useState } from "react";
import * as d3 from "d3";

// Simple responsive D3 bar chart for metric overviews
// Props: data = [{ label, value }], height, colors
const D3BarChart = ({ data, height = 240, colors }) => {
  const containerRef = useRef(null);
  const svgRef = useRef(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Set initial width and watch for resizes
    const resize = () => setWidth(el.clientWidth || 0);
    resize();

    let ro;
    if ("ResizeObserver" in window) {
      ro = new ResizeObserver(resize);
      ro.observe(el);
    } else {
      window.addEventListener("resize", resize);
    }
    return () => {
      if (ro) ro.disconnect();
      else window.removeEventListener("resize", resize);
    };
  }, []);

  useEffect(() => {
    if (!width || !data?.length) return;

    const margin = { top: 24, right: 16, bottom: 40, left: 16 };
    const w = Math.max(200, width);
    const h = Math.max(160, height);
    const innerW = w - margin.left - margin.right;
    const innerH = h - margin.top - margin.bottom;

    // Clean existing SVG
    d3.select(svgRef.current).selectAll("*").remove();

    const svg = d3
      .select(svgRef.current)
      .attr("width", w)
      .attr("height", h)
      .attr("role", "img")
      .attr("aria-label", "Metrics overview bar chart");

    const g = svg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const maxVal = d3.max(data, (d) => d.value) || 1;
    const y = d3.scaleLinear().domain([0, maxVal]).range([innerH, 0]).nice();
    const x = d3
      .scaleBand()
      .domain(data.map((d) => d.label))
      .range([0, innerW])
      .padding(0.25);

    const color = d3
      .scaleOrdinal()
      .domain(data.map((d) => d.label))
      .range(
        colors || [
          "#0ea5e9",
          "#22c55e",
          "#a855f7",
          "#f59e0b",
          "#ef4444",
          "#10b981",
        ]
      );

    // Axes (x only for clarity)
    const xAxis = d3
      .axisBottom(x)
      .tickSizeOuter(0)
      .tickPadding(8);

    g.append("g")
      .attr("transform", `translate(0,${innerH})`)
      .call(xAxis)
      .selectAll("text")
      .style("fill", "var(--sfdc-muted)")
      .style("font-size", "12px");

    // Bars
    const bars = g
      .selectAll("rect.bar")
      .data(data, (d) => d.label)
      .join("rect")
      .attr("class", "bar")
      .attr("x", (d) => x(d.label))
      .attr("y", y(0))
      .attr("width", x.bandwidth())
      .attr("height", innerH - y(0))
      .attr("fill", (d) => color(d.label))
      .attr("rx", 6)
      .attr("ry", 6)
      .append("title")
      .text((d) => `${d.label}: ${formatValue(d.value)}`);

    // Animate bars to their values
    g.selectAll("rect.bar")
      .transition()
      .duration(800)
      .ease(d3.easeCubicOut)
      .attr("y", (d) => y(d.value))
      .attr("height", (d) => innerH - y(d.value));

    // Value labels
    const labels = g
      .selectAll("text.value")
      .data(data, (d) => d.label)
      .join("text")
      .attr("class", "value")
      .attr("x", (d) => (x(d.label) || 0) + x.bandwidth() / 2)
      .attr("y", y(0) - 6)
      .attr("text-anchor", "middle")
      .style("fill", "var(--sfdc-text)")
      .style("font-weight", 600)
      .style("font-size", "12px")
      .text((d) => formatValue(d.value));

    labels
      .transition()
      .duration(800)
      .ease(d3.easeCubicOut)
      .attr("y", (d) => Math.max(16, y(d.value) - 6));
  }, [data, width, height, colors]);

  return (
    <div ref={containerRef} style={{ width: "100%" }}>
      <svg ref={svgRef} />
    </div>
  );
};

function formatValue(v) {
  if (v < 1 && v > 0) return v.toFixed(2);
  if (v % 1 !== 0) return v.toFixed(2);
  // Add thousand separators
  return d3.format(",.0f")(v);
}

export default D3BarChart;

