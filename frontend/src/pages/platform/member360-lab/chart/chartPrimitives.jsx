import React from "react";

const joinClassNames = (...parts) => parts.filter(Boolean).join(" ");

/**
 * Internal section header used by Member 360 workspace chart tabs.
 * The chart tabs render inside the workspace center pane, which already
 * provides a `coding-surface` card — so we don't wrap in another card.
 */
export function ChartTabHeader({ title, subtitle, action, className = "" }) {
  return (
    <header className={joinClassNames("flex items-start justify-between gap-3 mb-3", className)}>
      <div>
        <h3 className="text-sm font-semibold coding-text-strong">{title}</h3>
        {subtitle && <p className="text-xs coding-text-soft">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}

const STATUS_TONE = {
  open: "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-200",
  "in review": "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200",
  closed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200",
  high: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-200",
  default: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
};

/**
 * Small pill matching the rest of the HubSpot pattern. Auto-tones based on
 * the label content (open / in review / closed / high) when no tone is
 * passed.
 */
export function ChartChip({ label, tone, className = "" }) {
  const resolvedTone =
    tone ||
    (label && STATUS_TONE[String(label).toLowerCase()]) ||
    STATUS_TONE.default;
  return (
    <span
      className={joinClassNames(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium capitalize",
        resolvedTone,
        className
      )}
    >
      {label}
    </span>
  );
}

/**
 * HubSpot-styled table for chart tabs. Same row/header look as the worklist
 * and members pages. Use `columns[].render` for custom cells, `accessor` for
 * direct property reads, and optional `align: 'right'` for numeric columns.
 */
export function ChartTable({ columns = [], rows = [], emptyMessage = "No records yet.", getRowKey }) {
  const resolveRowKey = (row, index) => {
    if (typeof getRowKey === "function") return getRowKey(row, index);
    if (row && (row.id || row.key)) return row.id || row.key;
    return `row-${index}`;
  };

  return (
    <div className="overflow-x-auto rounded-md border coding-border">
      <table className="min-w-full text-sm">
        <thead className="text-[11px] uppercase tracking-wider coding-text-muted">
          <tr className="border-b coding-border">
            {columns.map((column, index) => (
              <th
                key={column.id || column.accessor || column.label || `col-${index}`}
                className={joinClassNames(
                  "px-3 py-2.5 font-semibold",
                  column.align === "right" ? "text-right" : "text-left",
                  index === 0 && "pl-4"
                )}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length > 0 ? (
            rows.map((row, rowIndex) => (
              <tr
                key={resolveRowKey(row, rowIndex)}
                className="border-b coding-border-subtle last:border-b-0 hover:bg-[var(--coding-hover)] transition"
              >
                {columns.map((column, colIndex) => {
                  const cellKey = column.id || column.accessor || column.label || `cell-${colIndex}`;
                  const cellValue =
                    typeof column.render === "function"
                      ? column.render(row)
                      : column.accessor
                      ? row[column.accessor]
                      : null;
                  return (
                    <td
                      key={cellKey}
                      className={joinClassNames(
                        "px-3 py-3",
                        column.align === "right" ? "text-right tabular-nums" : "",
                        colIndex === 0 ? "pl-4 coding-text-strong font-medium" : "coding-text-soft"
                      )}
                    >
                      {cellValue ?? "—"}
                    </td>
                  );
                })}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columns.length} className="px-3 py-12 text-center text-sm coding-text-soft">
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Compact label/value pair used by the chart Settings tab. HubSpot's record
 * pattern stacks these vertically; we keep a small grid so multiple fields
 * fit side-by-side.
 */
export function ChartKeyValue({ k, v }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] font-medium uppercase tracking-wider coding-text-muted">{k}</p>
      <p className="text-sm coding-text-strong">{v ?? <span className="coding-text-soft italic">N/A</span>}</p>
    </div>
  );
}
