import React from "react";
import { SectionHeader, TableSkeleton } from "../../../../components/ehr/Primitives";

export default function MedicationsPage() {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <SectionHeader title="Medications" subtitle="Active & historical" />
        <div className="mt-3">
          <TableSkeleton columns={["Medication", "Sig", "Start", "End", "Prescriber"]} rows={8} />
        </div>
      </div>
    </div>
  );
}
