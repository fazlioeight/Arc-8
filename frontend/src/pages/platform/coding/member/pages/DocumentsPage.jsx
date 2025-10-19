import React from "react";
import { SectionHeader, TableSkeleton } from "../../../../../components/ehr/Primitives";

export default function DocumentsPage() {
  return (
    <div className="space-y-4">
      <div className="coding-surface rounded-xl p-4">
        <SectionHeader title="Documents" subtitle="Charts, PDFs & uploads" />
        <div className="mt-3">
          <TableSkeleton columns={["Date", "Type", "Description", "Source", "Open"]} rows={10} />
        </div>
      </div>
    </div>
  );
}
