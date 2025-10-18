import React, { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import useResizeObserver from "../../../hooks/useResizeObserver";

const margin = { top: 16, right: 32, bottom: 32, left: 56 };

const formatDate = (date) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    month: "short",
    day: "numeric",
  }).format(date);

const formatTooltipDate = (date) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);

const LiveRafDeltaChart = ({
  data,
  forecastEnabled,
  onPointFocus,
  onSegmentClick,
  onHover,
  ariaLabel,
}) => {
  const containerRef = useRef(null);
  const svgRef = useRef(null);
  const tooltipRef = useRef(null);
  const [tooltip, setTooltip] = useState(null);
  const { width, height } = useResizeObserver(containerRef);

  const prepared = useMemo(() => {
    if (!data?.series?.length) return null;
    const series = data.series.map((point) => ({
      ...point,
      date: new Date(point.date),
    }));
    const targetTrajectory = (data.targetTrajectory || []).map((point) => ({
      ...point,
      date: new Date(point.date),
    }));
    const cutoff = data.cutoff ? new Date(data.cutoff) : null;
    const forecast = forecastEnabled
      ? (data.forecast || []).map((point) => ({
          ...point,
          date: new Date(point.date),
        }))
      : [];
    const last = series[series.length - 1];
    const forecastBand = forecast.length
      ? [
          {
            date: last.date,
            lo: last.realized,
            hi: last.realized,
          },
          ...forecast.map((point) => ({
            date: point.date,
            lo: point.lo80 ?? point.p50 ?? point.hi80,
            hi: point.hi80 ?? point.p50 ?? point.lo80,
          })),
        ]
      : [];
    return {
      series,
      targetTrajectory,
      cutoff,
      forecast,
      forecastBand,
      target: data.target,
    };
  }, [data, forecastEnabled]);

  useEffect(() => {
    if (!prepared || !width || !height) return;

    const w = Math.max(320, width);
    const h = Math.max(220, height);
    const innerW = w - margin.left - margin.right;
    const innerH = h - margin.top - margin.bottom;

    const svg = d3
      .select(svgRef.current)
      .attr("width", w)
      .attr("height", h)
      .attr("role", "img")
      .attr("aria-label", ariaLabel || "Live RAF delta chart");

    const frame = svg
      .selectAll("g.frame")
      .data([null])
      .join("g")
      .attr("class", "frame")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3
      .scaleUtc()
      .domain(d3.extent(prepared.series, (d) => d.date))
      .range([0, innerW]);

    const y = d3
      .scaleLinear()
      .domain([
        0,
        Math.max(
          prepared.target || 0,
          d3.max(prepared.series, (d) => d.realized) || 0,
          d3.max(prepared.forecast, (d) => d.hi80 || d.p50 || 0) || 0
        ) * 1.08,
      ])
      .nice()
      .range([innerH, 0]);

    // Axes
    const xAxis = d3.axisBottom(x).ticks(6).tickPadding(8);
    const yAxis = d3.axisLeft(y).ticks(5).tickPadding(8);

    frame
      .selectAll("g.x-axis")
      .data([null])
      .join("g")
      .attr("class", "x-axis")
      .attr("transform", `translate(0,${innerH})`)
      .call(xAxis);

    frame
      .selectAll("g.y-axis")
      .data([null])
      .join("g")
      .attr("class", "y-axis")
      .call(yAxis);

    frame.selectAll("g.x-axis text, g.y-axis text").attr("aria-hidden", "true");

    // Area
    const area = d3
      .area()
      .x((d) => x(d.date))
      .y0(innerH)
      .y1((d) => y(d.realized))
      .curve(d3.curveMonotoneX);

    frame
      .selectAll("path.realized-area")
      .data([prepared.series])
      .join("path")
      .attr("class", "realized-area")
      .attr("d", area);

    // Line
    const line = d3
      .line()
      .x((d) => x(d.date))
      .y((d) => y(d.realized))
      .curve(d3.curveMonotoneX);

    frame
      .selectAll("path.realized-line")
      .data([prepared.series])
      .join("path")
      .attr("class", "realized-line")
      .attr("d", line);

    // Target trajectory
    if (prepared.targetTrajectory.length) {
      const targetLine = d3
        .line()
        .x((d) => x(new Date(d.date)))
        .y((d) => y(d.target))
        .curve(d3.curveMonotoneX);
      frame
        .selectAll("path.target-line")
        .data([prepared.targetTrajectory])
        .join("path")
        .attr("class", "target-line")
        .attr("d", targetLine);
    } else if (prepared.target) {
      frame
        .selectAll("line.target-flat")
        .data([prepared.target])
        .join("line")
        .attr("class", "target-line")
        .attr("x1", 0)
        .attr("x2", innerW)
        .attr("y1", (d) => y(d))
        .attr("y2", (d) => y(d));
    }

    // Forecast band
    if (forecastEnabled && prepared.forecastBand.length > 1) {
      const forecastArea = d3
        .area()
        .x((d) => x(d.date))
        .y0((d) => y(d.lo ?? 0))
        .y1((d) => y(d.hi ?? 0))
        .curve(d3.curveMonotoneX);
      frame
        .selectAll("path.forecast-band")
        .data([prepared.forecastBand])
        .join("path")
        .attr("class", "forecast-band")
        .attr("d", forecastArea);
    } else {
      frame.selectAll("path.forecast-band").remove();
    }

    if (forecastEnabled && prepared.forecast.length) {
      const forecastLine = d3
        .line()
        .x((d) => x(d.date))
        .y((d) => y(d.p50 ?? d.lo80 ?? d.hi80 ?? 0))
        .curve(d3.curveMonotoneX);
      frame
        .selectAll("path.forecast-line")
        .data([prepared.forecast])
        .join("path")
        .attr("class", "forecast-line")
        .attr("d", forecastLine);
    } else {
      frame.selectAll("path.forecast-line").remove();
    }

    // Today marker
    const todayPoint = prepared.series[prepared.series.length - 1];
    if (todayPoint) {
      frame
        .selectAll("circle.today-marker")
        .data([todayPoint])
        .join("circle")
        .attr("class", "today-marker")
        .attr("cx", (d) => x(d.date))
        .attr("cy", (d) => y(d.realized))
        .attr("r", 5)
        .attr("tabindex", 0)
        .attr("role", "button")
        .attr("aria-label", `Today ${formatDate(todayPoint.date)}, RAF ${todayPoint.realized.toFixed(3)}`);
    }

    // Points for keyboard nav
    const points = frame
      .selectAll("circle.data-point")
      .data(prepared.series)
      .join(
        (enter) =>
          enter
            .append("circle")
            .attr("class", "data-point")
            .attr("r", 3.5)
            .attr("tabindex", 0)
            .attr("role", "button"),
        (update) => update,
        (exit) => exit.remove()
      )
      .attr("cx", (d) => x(d.date))
      .attr("cy", (d) => y(d.realized))
      .attr("aria-label", (d) => `RAF ${d.realized.toFixed(3)} on ${formatDate(d.date)}`);

    points.on("focus", (_, d) => {
      setTooltip({
        x: x(d.date) + margin.left,
        y: y(d.realized) + margin.top,
        payload: buildTooltipPayload(d, data.target),
      });
      if (typeof onPointFocus === "function") {
        onPointFocus(d);
      }
    });

    points.on("keydown", (event, d) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      if (typeof onSegmentClick === "function") {
        onSegmentClick({
          chart: "raf_delta",
          point: d,
        });
      }
    });
  }, [prepared, width, height, ariaLabel, forecastEnabled, data, onPointFocus]);

  useEffect(() => {
    if (!prepared || !width || !height) return;
    const w = Math.max(320, width);
    const h = Math.max(220, height);
    const innerW = w - margin.left - margin.right;
    const innerH = h - margin.top - margin.bottom;

    const x = d3
      .scaleUtc()
      .domain(d3.extent(prepared.series, (d) => d.date))
      .range([0, innerW]);

    const y = d3
      .scaleLinear()
      .domain([
        0,
        Math.max(
          prepared.target || 0,
          d3.max(prepared.series, (d) => d.realized) || 0,
          d3.max(prepared.forecast, (d) => d.hi80 || d.p50 || 0) || 0
        ) * 1.08,
      ])
      .nice()
      .range([innerH, 0]);

    const bisect = d3.bisector((d) => d.date).center;
    const svg = d3.select(svgRef.current);
    const overlay = svg
      .selectAll("rect.overlay")
      .data([null])
      .join("rect")
      .attr("class", "overlay")
      .attr("fill", "transparent")
      .attr("pointer-events", "all")
      .attr("width", innerW)
      .attr("height", innerH)
      .attr("transform", `translate(${margin.left},${margin.top})`)
      .on("mousemove", (event) => {
        const [px] = d3.pointer(event);
        const date = x.invert(px);
        const index = bisect(prepared.series, date);
        const point = prepared.series[index];
        if (!point) return;
        const tooltipPayload = buildTooltipPayload(point, data.target);
        setTooltip({
          x: x(point.date) + margin.left,
          y: y(point.realized) + margin.top,
          payload: tooltipPayload,
        });
        if (typeof onHover === "function") {
          onHover(point);
        }
      })
      .on("mouseleave", () => {
        setTooltip(null);
      })
      .on("click", (event) => {
        const [px] = d3.pointer(event);
        const date = x.invert(px);
        const index = bisect(prepared.series, date);
        const point = prepared.series[index];
        if (point && typeof onSegmentClick === "function") {
          onSegmentClick({
            chart: "raf_delta",
            point,
          });
        }
      });

    return () => {
      overlay.on("mousemove", null).on("mouseleave", null).on("click", null);
    };
  }, [prepared, width, height, data, onHover, onSegmentClick]);

  useEffect(() => {
    const el = tooltipRef.current;
    if (!el) return;
    if (!tooltip) {
      el.style.opacity = 0;
      return;
    }
    const { x, y, payload } = tooltip;
    el.style.opacity = 1;
    el.style.transform = `translate(${x + 8}px, ${y - 12}px)`;
    el.innerHTML = `
      <div class="viz-tooltip__date">${formatTooltipDate(payload.date)}</div>
      <div>RAF realized: <strong>${payload.realized}</strong></div>
      <div>Daily adds: ${payload.dailyAdd}</div>
      <div>Delta to target: ${payload.delta}</div>
      ${payload.projected ? `<div>Projected Delta at cutoff: ${payload.projected}</div>` : ""}
    `;
  }, [tooltip]);

  return (
    <div ref={containerRef} className="raf-delta-chart-container" tabIndex={-1}>
      <svg ref={svgRef} />
      <div ref={tooltipRef} className="viz-tooltip" role="status" aria-live="polite" />
    </div>
  );
};

const buildTooltipPayload = (point, target) => {
  const projectedDelta = target ? target - point.realized : null;
  return {
    date: point.date,
    realized: point.realized.toFixed(3),
    dailyAdd: point.dailyAdd?.toFixed(3) ?? "-",
    delta: projectedDelta !== null ? projectedDelta.toFixed(3) : "-",
    projected: projectedDelta !== null ? projectedDelta.toFixed(3) : null,
  };
};

export default LiveRafDeltaChart;
