import React from "react";
import { SectionHeader, TableSkeleton } from "../../../../components/ehr/Primitives";

export default function ProblemsHCCPage() {
  return (
    <div className="space-y-4">
      <div className="coding-surface rounded-xl p-4">
        <SectionHeader title="Problem List / HCC" subtitle="Active problems mapped to HCCs" />
        <div className="mt-3">
          <TableSkeleton columns={["Problem", "HCC", "Evidence", "Last Seen", "Actions"]} rows={6} />
        </div>
      </div>
    </div>
  );
}
