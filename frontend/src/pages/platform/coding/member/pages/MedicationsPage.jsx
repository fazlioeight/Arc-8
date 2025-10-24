import React from "react";
import { SectionHeader, DataTable } from "../../../../../components/ehr/Primitives";

const medicationColumns = [
  { label: "Medication", accessor: "medication" },
  { label: "Sig", accessor: "sig" },
  { label: "Start", accessor: "start" },
  { label: "End", accessor: "end" },
  { label: "Prescriber", accessor: "prescriber" },
];

const medicationRows = [
  {
    id: "rx-1",
    medication: "Metformin XR 500 mg",
    sig: "Take 1 tablet by mouth twice daily with meals",
    start: "Jan 04, 2025",
    end: "Current",
    prescriber: "Dr. Harper (PCP)",
  },
  {
    id: "rx-2",
    medication: "Spironolactone 25 mg",
    sig: "Take 1 tablet daily",
    start: "Aug 18, 2025",
    end: "Nov 18, 2025",
    prescriber: "Dr. Nguyen (Cardiology)",
  },
];

export default function MedicationsPage() {
  return (
    <div className="space-y-4">
      <div className="coding-surface rounded-xl p-4">
        <SectionHeader title="Medications" subtitle="Active & historical" />
        <div className="mt-3">
          <DataTable columns={medicationColumns} rows={medicationRows} />
        </div>
      </div>
    </div>
  );
}
