import React from "react";
// portalPattern.css is imported here so pages using PortalCard inherit portal
// list / pill / ghost-button utilities without a separate import.
import "../styles/portalPattern.css";

// `neutral` uses the same surface pattern as the rest of the HubSpot-style
// pages: a coding-surface with rounded-2xl + soft shadow + no explicit border.
// Tinted variants (info/success/warning/danger) keep an explicit border so the
// tone reads at a glance.
const TONE = {
  neutral: "coding-surface rounded-2xl shadow-sm",
  info:    "rounded-2xl border border-brand-200/80 bg-brand-50/60 dark:border-brand-800/40 dark:bg-brand-950/30",
  success: "rounded-2xl border border-emerald-200/80 bg-emerald-50/60 dark:border-emerald-800/40 dark:bg-emerald-950/30",
  warning: "rounded-2xl border border-amber-200/80 bg-amber-50/60 dark:border-amber-800/40 dark:bg-amber-950/30",
  danger:  "rounded-2xl border border-rose-200/80 bg-rose-50/60 dark:border-rose-800/40 dark:bg-rose-950/30",
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
        toneClass,
        compact ? "p-4" : "p-5",
        interactive ? "cursor-pointer transition hover:shadow-card-hover" : "",
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
