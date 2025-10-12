import React from "react";

export function Chip({ label, title }) {
  return (
    <span
      title={title || label}
      className="inline-flex items-center rounded-full border border-gray-300 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-700"
    >
      {label}
    </span>
  );
}

export function SectionHeader({ title, subtitle, action }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h3 className="text-sm font-semibold tracking-wide text-gray-800">{title}</h3>
        {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
      </div>
      {action && <div className="ml-4">{action}</div>}
    </div>
  );
}

export function TableSkeleton({ columns = [], rows = 5 }) {
  return (
    <div className="overflow-auto rounded-lg border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            {columns.map((c, i) => (
              <th key={i} className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r} className="hover:bg-gray-50">
              {columns.map((_, c) => (
                <td key={c} className="px-3 py-2 text-xs text-gray-700">
                  <div className="h-3 w-24 rounded bg-gray-100" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function KeyValue({ k, v }) {
  return (
    <div className="grid grid-cols-5 gap-2 text-xs">
      <div className="col-span-2 text-gray-500">{k}</div>
      <div className="col-span-3 font-medium text-gray-800">{v || "—"}</div>
    </div>
  );
}

export function AlertBanner({ level = "info", title, body }) {
  const palette = {
    danger: "bg-red-50 border-red-300 text-red-800",
    warning: "bg-amber-50 border-amber-300 text-amber-800",
    info: "bg-blue-50 border-blue-300 text-blue-800",
    success: "bg-green-50 border-green-300 text-green-800",
  };
  const tone = palette[level] || palette.info;
  return (
    <div role="alert" className={`flex items-start gap-3 rounded-lg border px-3 py-2 text-xs ${tone}`}>
      <div className="mt-0.5 h-2 w-2 flex-none rounded-full bg-current" />
      <div>
        <div className="font-semibold">{title}</div>
        {body && <div className="mt-0.5 text-[11px] opacity-90">{body}</div>}
      </div>
    </div>
  );
}
