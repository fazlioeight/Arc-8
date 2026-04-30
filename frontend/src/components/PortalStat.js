import React from "react";

const VALUE_COLOR = {
  neutral: "text-slate-900 dark:text-slate-100",
  info:    "text-brand-600 dark:text-blue-400",
  warning: "text-amber-600 dark:text-amber-400",
  success: "text-emerald-600 dark:text-emerald-400",
  danger:  "text-red-600 dark:text-red-400",
};

const PortalStat = ({
  label,
  value,
  meta,
  tone = "neutral",
  className = "",
}) => {
  const valueColor = VALUE_COLOR[tone] || VALUE_COLOR.neutral;

  return (
    <div
      className={[
        "min-w-[140px] rounded-lg border border-slate-200 bg-white px-4 py-3",
        "dark:border-slate-700 dark:bg-slate-900",
        className,
      ].join(" ")}
      role="status"
    >
      <div className={["text-2xl font-bold leading-none", valueColor].join(" ")}>
        {value}
      </div>
      <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        {label}
      </div>
      {meta && (
        <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          {meta}
        </div>
      )}
    </div>
  );
};

export default PortalStat;
