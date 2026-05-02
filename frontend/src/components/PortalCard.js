import React from "react";
// portalPattern.css is imported here so pages using PortalCard inherit portal
// list / pill / ghost-button utilities without a separate import.
import "../styles/portalPattern.css";

const TONE = {
  neutral: "coding-surface",
  info:    "border-blue-200/80 bg-blue-50/60 dark:border-blue-800/40 dark:bg-blue-950/30",
  success: "border-emerald-200/80 bg-emerald-50/60 dark:border-emerald-800/40 dark:bg-emerald-950/30",
  warning: "border-amber-200/80 bg-amber-50/60 dark:border-amber-800/40 dark:bg-amber-950/30",
  danger:  "border-red-200/80 bg-red-50/60 dark:border-red-800/40 dark:bg-red-950/30",
};

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
  const Tag = as;
  const toneClass = TONE[tone] || TONE.neutral;

  return (
    <Tag
      className={[
        "rounded-xl border shadow-card",
        compact ? "p-4" : "p-5",
        interactive
          ? "cursor-pointer transition-all duration-150 hover:-translate-y-0.5 hover:shadow-card-hover"
          : "",
        toneClass,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {(title || subtitle || actions) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title && (
              <h3 className="text-base font-semibold coding-text-strong">
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="mt-0.5 text-sm coding-text-soft">
                {subtitle}
              </p>
            )}
          </div>
          {actions && (
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              {actions}
            </div>
          )}
        </div>
      )}

      <div className="space-y-3">{children}</div>

      {footer && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t coding-divider pt-4">
          {footer}
        </div>
      )}
    </Tag>
  );
};

export default PortalCard;
