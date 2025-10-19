import React from "react";
import { SectionHeader, TableSkeleton } from "../../../../../components/ehr/Primitives";

export default function AuditLogPage() {
  return (
    <div className="space-y-4">
      <div className="coding-surface rounded-xl p-4">
        <SectionHeader title="Audit Log" subtitle="Who did what, when" />
        <div className="mt-3">
          <TableSkeleton columns={["Time", "User", "Action", "Entity", "Details"]} rows={12} />
        </div>
      </div>
    </div>
  );
}
