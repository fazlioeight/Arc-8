import React, { useMemo } from "react";
import "../styles/portalPattern.css";

const ALIGNMENT = {
  left: { stack: "items-start text-left", actions: "justify-start" },
  center: { stack: "items-center text-center", actions: "justify-center" },
  right: { stack: "items-end text-right", actions: "justify-end" },
};

const PortalPageHeader = ({
  eyebrow,
  title,
  subtitle,
  actions,
  align = "left",
  className = "",
}) => {
  const alignment = useMemo(() => ALIGNMENT[align] || ALIGNMENT.left, [align]);
  return (
    <div
      className={[
        "portal-page-header",
        "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className={["flex flex-col gap-1", alignment.stack].join(" ")}>
        {eyebrow ? (
          <p className="portal-page-header__eyebrow">{eyebrow}</p>
        ) : null}
        {title ? (
          <h1
            className={[
              "portal-page-header__title",
              alignment.stack.includes("text-center")
                ? "text-center"
                : alignment.stack.includes("text-right")
                ? "text-right"
                : "text-left",
            ].join(" ")}
          >
            {title}
          </h1>
        ) : null}
        {subtitle ? (
          <p
            className={[
              "portal-page-header__subtitle",
              alignment.stack.includes("text-center")
                ? "text-center"
                : alignment.stack.includes("text-right")
                ? "text-right"
                : "text-left",
            ].join(" ")}
          >
            {subtitle}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div
          className={[
            "portal-page-header__actions",
            alignment.actions,
            "flex flex-wrap items-center gap-3",
          ].join(" ")}
        >
          {actions}
        </div>
      ) : null}
    </div>
  );
};

export default PortalPageHeader;
