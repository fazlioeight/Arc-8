import React from "react";
import { SectionHeader, TableSkeleton } from "../../../../components/ehr/Primitives";

export default function CareGapsPage() {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <SectionHeader title="Care Gaps" subtitle="Quality & risk closure" />
        <div className="mt-3">
          <TableSkeleton columns={["Gap", "Measure", "Due", "Status", "Action"]} rows={8} />
        </div>
      </div>
    </div>
  );
}
