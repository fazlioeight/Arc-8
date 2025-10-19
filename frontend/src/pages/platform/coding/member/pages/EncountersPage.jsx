import React from "react";
import { SectionHeader, TableSkeleton } from "../../../../../components/ehr/Primitives";

export default function EncountersPage() {
  return (
    <div className="space-y-4">
      <div className="coding-surface rounded-xl p-4">
        <SectionHeader title="Encounters" subtitle="Past 12 months" />
        <div className="mt-3">
          <TableSkeleton columns={["Date", "Type", "Location", "Paid", "Dx (summary)"]} rows={8} />
        </div>
      </div>
    </div>
  );
}
