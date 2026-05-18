import React from "react";
import { ChartTabHeader, ChartTable } from "./chartPrimitives";

const AUDIT_LOG_COLUMNS = [
  { label: "Time", accessor: "time" },
  { label: "User", accessor: "user" },
  { label: "Action", accessor: "action" },
  { label: "Entity", accessor: "entity" },
  { label: "Details", accessor: "details" },
];

// Audit events for every authenticated route already land in the control
// plane's `tenant_audit_events` table (see record_audit_event +
// app/routes/member360.py). This tab needs a dedicated backend endpoint that
// reads those rows filtered by tenant_id + member_id + a sensible window.
// Until that endpoint exists the tab shows an empty state. Hardcoded sample
// audit rows are deliberately removed — pretending to surface audit history
// for compliance review is worse than showing nothing.
export default function AuditLogPage() {
  return (
    <div>
      <ChartTabHeader
        title="Audit log"
        subtitle="Who did what, and when"
      />
      <ChartTable
        columns={AUDIT_LOG_COLUMNS}
        rows={[]}
        emptyMessage="Per-member audit endpoint is pending. Tenant-wide audit events are captured in the control plane."
      />
    </div>
  );
}
