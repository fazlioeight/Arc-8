import React from "react";
import InfoTooltip from "../../../../components/ui/InfoTooltip";

const ChartCard = ({
  title,
  subtitle,
  tooltip,
  badge,
  actions,
  children,
  partial = false,
  partialLabel,
  error = null,
  summaryId,
  description,
  footer,
}) => {
  return (
    <section className="dashboard-card ds-card ds-card--compact sfdc-card fade-in" aria-describedby={summaryId}>
      <header className="dashboard-card__header ds-card__header">
        <div className="dashboard-card__heading">
          <div className="ds-inline">
            <div>
              <div className="ds-card__title">{title}</div>
              {subtitle && <div className="ds-card__meta">{subtitle}</div>}
            </div>
            {tooltip ? <InfoTooltip content={tooltip} placement="top" /> : null}
          </div>
          {badge ? <div className="dashboard-card__badge">{badge}</div> : null}
        </div>
        {actions ? <div className="dashboard-card__actions">{actions}</div> : null}
      </header>

      {partial ? (
        <div className="dashboard-card__banner dashboard-card__banner--partial" role="status">
          <span className="dashboard-card__banner-icon" aria-hidden="true">!</span>
          <span>{partialLabel || "Data is partial"}</span>
        </div>
      ) : null}

      {error ? (
        <div className="dashboard-card__body">
          <div className="dashboard-error" role="alert">
            <strong>We're working on it.</strong>
            <span>{error.message || "Unable to load this visualization right now."}</span>
          </div>
        </div>
      ) : (
        <div className="dashboard-card__body">
          {description ? <p className="dashboard-card__summary" id={summaryId}>{description}</p> : null}
          <div className="dashboard-card__viz">{children}</div>
        </div>
      )}
      {footer ? <footer className="dashboard-card__footer">{footer}</footer> : null}
    </section>
  );
};

export default ChartCard;
