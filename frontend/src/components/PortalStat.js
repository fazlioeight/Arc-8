import React from "react";
import "../styles/portalPattern.css";

const PortalStat = ({ label, value, meta, tone = "neutral", className = "" }) => {
  const classes = [
    "portal-stat",
    tone !== "neutral" ? `portal-stat--${tone}` : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} role="status">
      <div className="portal-stat__value">{value}</div>
      <div className="portal-stat__label">{label}</div>
      {meta ? <div className="portal-stat__meta">{meta}</div> : null}
    </div>
  );
};

export default PortalStat;
