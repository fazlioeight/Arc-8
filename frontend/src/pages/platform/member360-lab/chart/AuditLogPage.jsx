import React from "react";
import { ChartTabHeader, ChartTable } from "./chartPrimitives";

const auditLogColumns = [
  { label: "Time", accessor: "time" },
  { label: "User", accessor: "user" },
  { label: "Action", accessor: "action" },
  { label: "Entity", accessor: "entity" },
  { label: "Details", accessor: "details" },
];

const auditLogRows = [
  {
    id: "audit-1",
    time: "Oct 18, 2025 · 1:42 PM",
    user: "M. Ramirez",
    action: "Updated diagnosis",
    entity: "Encounter #48392",
    details: "Mapped E11.9 to HCC 19 after chart review.",
  },
  {
    id: "audit-2",
    time: "Oct 17, 2025 · 9:15 AM",
    user: "S. Patel",
    action: "Uploaded document",
    entity: "Care gap evidence",
    details: "Attached cardiology visit summary dated 09/29/2025.",
  },
];

export default function AuditLogPage() {
  return (
    <div>
      <ChartTabHeader title="Audit log" subtitle="Who did what, and when" />
      <ChartTable columns={auditLogColumns} rows={auditLogRows} />
    </div>
  );
}
