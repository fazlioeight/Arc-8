import React from "react";
import { Link } from "react-router-dom";

const DetailDrawer = ({ isOpen, context, onClose, filters, contributors = [], sparkline = [] }) => {
  const className = `dashboard-detail${isOpen ? " is-open" : ""}`;
  const workqueuePath = buildWorkqueuePath(context, filters);

  return (
    <aside
      className={className}
      aria-hidden={!isOpen}
      aria-live="polite"
      role="complementary"
      aria-label="Chart details"
    >
      <header className="dashboard-detail__header">
        <div>
          <h2>{context?.title || "Details"}</h2>
          {context?.subtitle ? <p className="dashboard-detail__subtitle">{context.subtitle}</p> : null}
        </div>
        <button type="button" className="dashboard-detail__close" onClick={onClose} aria-label="Close details">
          x
        </button>
      </header>
      {context ? (
        <div className="dashboard-detail__body">
          {renderSummary(context)}
          {sparkline.length ? (
            <div className="dashboard-detail__sparkline" aria-hidden="true">
              <Sparkline data={sparkline} />
            </div>
          ) : null}
          <section className="dashboard-detail__section">
            <h3>Applied filters</h3>
            <ul>
              <li>Model Year: {filters.modelYear}</li>
              <li>LOB: {filters.lob}</li>
              <li>Provider Group: {filters.providerGroup}</li>
              <li>Date Range: {filters.from} to {filters.to}</li>
              <li>Stage: {filters.stage}</li>
            </ul>
          </section>
          {contributors.length ? (
            <section className="dashboard-detail__section">
              <h3>Top contributors</h3>
              <ol>
                {contributors.slice(0, 10).map((item) => (
                  <li key={`${item.stage}-${item.name}`}>
                    <span>{item.name}</span>
                    <span className="dashboard-detail__count">{item.count.toLocaleString()}</span>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
        </div>
      ) : (
        <div className="dashboard-detail__body">
          <p>Select a chart element to get more insight.</p>
        </div>
      )}
      {context ? (
        <footer className="dashboard-detail__footer">
          {workqueuePath ? (
            <Link to={workqueuePath} className="ds-button ds-button--primary">
              Open in Workqueue
            </Link>
          ) : null}
        </footer>
      ) : null}
    </aside>
  );
};

const renderSummary = (context) => {
  switch (context.type) {
    case "raf":
      return (
        <section className="dashboard-detail__section">
          <h3>{context.label}</h3>
          <ul>
            <li>Date: {context.date}</li>
            <li>RAF realized: {context.realized}</li>
            <li>Daily adds: {context.dailyAdd}</li>
            <li>Delta to target: {context.delta}</li>
            {context.projected ? <li>Projected at cutoff: {context.projected}</li> : null}
          </ul>
        </section>
      );
    case "funnel":
      return (
        <section className="dashboard-detail__section">
          <h3>{context.label}</h3>
          <ul>
            <li>Count: {context.count}</li>
            <li>Conversion: {context.conversion}</li>
            <li>Median time-in-stage: {context.medianDays} days</li>
          </ul>
        </section>
      );
    case "deadline":
      return (
        <section className="dashboard-detail__section">
          <h3>{context.label}</h3>
          <ul>
            <li>Items: {context.count}</li>
            <li>Risk status: {context.urgent ? "High" : "On track"}</li>
          </ul>
        </section>
      );
    case "heatmap":
      return (
        <section className="dashboard-detail__section">
          <h3>{context.label}</h3>
          <ul>
            <li>Provider: {context.provider}</li>
            <li>Metric: {context.metric}</li>
            <li>Value: {context.value}</li>
          </ul>
        </section>
      );
    default:
      return null;
  }
};

const buildWorkqueuePath = (context, filters) => {
  if (!context) return null;
  const params = new URLSearchParams({
    modelYear: filters.modelYear,
    lob: filters.lob,
    providerGroup: filters.providerGroup,
    from: filters.from,
    to: filters.to,
    stage: filters.stage,
  });
  if (context.type === "funnel" && context.key) params.set("funnelStage", context.key);
  if (context.type === "deadline" && context.range) params.set("deadlineRange", context.range);
  if (context.type === "heatmap" && context.provider) params.set("provider", context.provider);
  return `/coding?${params.toString()}`;
};

const Sparkline = ({ data }) => {
  if (!data?.length) return null;
  const width = 160;
  const height = 40;
  const x = (index) => (index / (data.length - 1 || 1)) * width;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const y = (value) => {
    if (max === min) return height / 2;
    return height - ((value - min) / (max - min)) * height;
  };
  return (
    <svg className="sparkline" width={width} height={height} role="presentation" aria-hidden="true">
      <polyline
        points={data.map((value, index) => `${x(index)},${y(value)}`).join(" ")}
        fill="none"
        stroke="var(--sfdc-primary)"
        strokeWidth="2"
      />
    </svg>
  );
};

export default DetailDrawer;
