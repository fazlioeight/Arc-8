import React from "react";
import "./primitives.css";

const joinClassNames = (...parts) => parts.filter(Boolean).join(" ");

export function Chip({ label, title }) {
  return (
    <span title={title || label} className="ehr-chip">
      {label}
    </span>
  );
}

export function SectionHeader({ title, subtitle, action }) {
  return (
    <div className="ehr-section-header">
      <div>
        <h3 className="ehr-section-header__title">{title}</h3>
        {subtitle && <p className="ehr-section-header__subtitle">{subtitle}</p>}
      </div>
      {action && <div className="ehr-section-header__action">{action}</div>}
    </div>
  );
}

export function TableSkeleton({ columns = [], rows = 5 }) {
  return (
    <div className="ehr-table-wrapper">
      <table className="ehr-table ehr-table--skeleton">
        <thead>
          <tr>
            {columns.map((column, index) => (
              <th key={index}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, rowIndex) => (
            <tr key={rowIndex}>
              {columns.map((_, colIndex) => (
                <td key={colIndex}>
                  <div className="ehr-skeleton-bar" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DataTable({ columns = [], rows = [], emptyMessage = "No records yet.", getRowKey }) {
  const resolveRowKey = (row, index) => {
    if (typeof getRowKey === "function") return getRowKey(row, index);
    if (row && (row.id || row.key)) return row.id || row.key;
    return `row-${index}`;
  };

  return (
    <div className="ehr-table-wrapper">
      <table className="ehr-table">
        <thead>
          <tr>
            {columns.map((column, index) => (
              <th key={column.id || column.accessor || column.label || `col-${index}`}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length > 0 ? (
            rows.map((row, rowIndex) => (
              <tr key={resolveRowKey(row, rowIndex)}>
                {columns.map((column, colIndex) => {
                  const cellKey = column.id || column.accessor || column.label || `cell-${colIndex}`;
                  const cellValue =
                    typeof column.render === "function"
                      ? column.render(row)
                      : column.accessor
                      ? row[column.accessor]
                      : null;
                  return <td key={cellKey}>{cellValue ?? "—"}</td>;
                })}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columns.length} className="py-6 text-center text-xs text-gray-500">
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function KeyValue({ k, v }) {
  return (
    <div className="ehr-key-value">
      <div className="ehr-key-value__key">{k}</div>
      <div className="ehr-key-value__value">{v ?? "N/A"}</div>
    </div>
  );
}

export function AlertBanner({ level = "info", title, body }) {
  const variant = {
    danger: "ehr-alert--danger",
    warning: "ehr-alert--warning",
    info: "ehr-alert--info",
    success: "ehr-alert--success",
  }[level] || "ehr-alert--info";

  return (
    <div role="alert" className={`ehr-alert ${variant}`}>
      <div className="ehr-alert__body">
        <p className="ehr-alert__title">{title}</p>
        {body && <p className="ehr-alert__meta">{body}</p>}
      </div>
    </div>
  );
}

export { default as UtilityBar } from "../PortalUtilityBar";

const DEFAULT_STATE_GLYPH = <span className="ehr-state__dot" aria-hidden />;

const toneFromLevel = (level) =>
  ({
    danger: "danger",
    warning: "warning",
    success: "success",
    info: "info",
    muted: "muted",
    loading: "loading",
  }[level] || "muted");

export function StateMessage({
  tone = "muted",
  title,
  description,
  actions,
  icon,
  align = "center",
  size = "md",
  role = "status",
  className = "",
  bodyClassName = "",
}) {
  const resolvedTone = toneFromLevel(tone);
  const glyph = icon === null ? null : icon || DEFAULT_STATE_GLYPH;

  return (
    <div
      className={joinClassNames(
        "ehr-state",
        `ehr-state--${resolvedTone}`,
        `ehr-state--${align}`,
        `ehr-state--${size}`,
        className
      )}
      role={role}
      aria-live={resolvedTone === "loading" ? "polite" : undefined}
    >
      {glyph ? <div className="ehr-state__icon">{glyph}</div> : null}
      <div className={joinClassNames("ehr-state__body", bodyClassName)}>
        {title ? <p className="ehr-state__title">{title}</p> : null}
        {description ? (
          <p className="ehr-state__description">{description}</p>
        ) : null}
        {actions ? <div className="ehr-state__actions">{actions}</div> : null}
      </div>
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  description,
  actions,
  className = "",
}) {
  return (
    <StateMessage
      tone="danger"
      title={title}
      description={description}
      actions={actions}
      className={className}
      role="alert"
      align="left"
    />
  );
}

export function EmptyState({
  title = "Nothing to show yet",
  description = "Try adjusting filters or come back later.",
  actions,
  className = "",
  size = "md",
}) {
  return (
    <StateMessage
      tone="muted"
      title={title}
      description={description}
      actions={actions}
      className={className}
      size={size}
      align="center"
    />
  );
}

export function LoadingState({
  title = "Loading",
  description = "Hang tight while we fetch the latest data.",
  actions,
  className = "",
  size = "md",
  tone = "loading",
}) {
  return (
    <StateMessage
      tone={tone}
      title={title}
      description={description}
      actions={actions}
      className={className}
      size={size}
      align="center"
      icon={<span className="ehr-spinner" aria-hidden />}
      role="status"
    />
  );
}
