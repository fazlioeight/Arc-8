import React from "react";
import { SectionHeader, TableSkeleton } from "../../../../components/ehr/Primitives";

export default function TasksMessagesPage() {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <SectionHeader title="Tasks & Messages" subtitle="Workflow & communication" />
        <div className="mt-3">
          <TableSkeleton columns={["Type", "Subject", "Owner", "Due", "Status"]} rows={10} />
        </div>
      </div>
    </div>
  );
}
