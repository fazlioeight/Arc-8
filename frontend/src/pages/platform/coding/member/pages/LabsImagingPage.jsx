import React from "react";
import { SectionHeader, TableSkeleton } from "../../../../../components/ehr/Primitives";

export default function LabsImagingPage() {
  return (
    <div className="space-y-4">
      <div className="coding-surface rounded-xl p-4">
        <SectionHeader title="Labs & Imaging" subtitle="Results & studies" />
        <div className="mt-3">
          <TableSkeleton columns={["Date", "Test", "Result", "Reference", "Ordering"]} rows={8} />
        </div>
      </div>
    </div>
  );
}
