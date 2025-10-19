import React from "react";
import { SectionHeader, TableSkeleton } from "../../../../../components/ehr/Primitives";

export default function NotesPage() {
  return (
    <div className="space-y-4">
      <div className="coding-surface rounded-xl p-4">
        <SectionHeader title="Notes" subtitle="Clinician & coder notes" />
        <div className="mt-3">
          <TableSkeleton columns={["Author", "Date", "Type", "Summary"]} rows={10} />
        </div>
      </div>
    </div>
  );
}
