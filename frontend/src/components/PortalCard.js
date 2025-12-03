import React from "react";
import "../styles/portalPattern.css";

const PortalCard = ({
  title,
  subtitle,
  actions,
  tone = "neutral",
  compact = false,
  interactive = false,
  footer = null,
  className = "",
  as = "section",
  children,
}) => {
  const Component = as || "section";
  const classes = [
    "portal-card",
    compact && "portal-card--compact",
    interactive && "portal-card--interactive",
    tone !== "neutral" ? `portal-card--tone-${tone}` : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Component className={classes}>
      {(title || subtitle || actions) && (
        <header className="portal-card__header">
          <div className="portal-card__heading">
            {title ? <h3 className="portal-card__title">{title}</h3> : null}
            {subtitle ? (
              <p className="portal-card__meta">{subtitle}</p>
            ) : null}
          </div>
          {actions ? <div className="portal-card__actions">{actions}</div> : null}
        </header>
      )}
      <div className="portal-card__body">{children}</div>
      {footer ? <footer className="portal-card__footer">{footer}</footer> : null}
    </Component>
  );
};

export default PortalCard;
