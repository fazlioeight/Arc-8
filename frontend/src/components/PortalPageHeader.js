import React from "react";

const ALIGN = {
  left:   "items-start text-left",
  center: "items-center text-center",
  right:  "items-end text-right",
};

const ACTIONS_ALIGN = {
  left:   "justify-start",
  center: "justify-center",
  right:  "justify-end",
};

const PortalPageHeader = ({
  eyebrow,
  title,
  subtitle,
  actions,
  align = "left",
  className = "",
}) => {
  const stack = ALIGN[align] || ALIGN.left;
  const actionsAlign = ACTIONS_ALIGN[align] || ACTIONS_ALIGN.left;

  return (
    <div
      className={[
        "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className={["flex flex-col gap-1", stack].join(" ")}>
        {eyebrow && (
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
            {eyebrow}
          </p>
        )}
        {title && (
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
            {title}
          </h1>
        )}
        {subtitle && (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {subtitle}
          </p>
        )}
      </div>

      {actions && (
        <div
          className={[
            "flex flex-wrap items-center gap-3",
            actionsAlign,
          ].join(" ")}
        >
          {actions}
        </div>
      )}
    </div>
  );
};

export default PortalPageHeader;
