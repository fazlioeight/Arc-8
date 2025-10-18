const EVENT_PREFIX = "telemetry";

export const TELEMETRY_EVENTS = {
  DASHBOARD_VIEW: "dashboard_view",
  FILTER_CHANGE: "filter_change",
  SEGMENT_CLICK: "segment_click",
  EXPORT_CSV: "export_csv",
};

export function logTelemetry(recordAuditEvent, event, dimensions = {}) {
  if (typeof recordAuditEvent !== "function" || !event) return;
  recordAuditEvent(`${EVENT_PREFIX}.${event}`, {
    ...dimensions,
    timestamp: new Date().toISOString(),
  });
}

