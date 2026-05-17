import React from "react";
import { ChartTabHeader, ChartTable } from "./chartPrimitives";

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
    sig: "1 tablet by mouth twice daily with meals",
    start: "Jan 04, 2025",
    end: "Current",
    prescriber: "Dr. Harper (PCP)",
  },
  {
    id: "rx-2",
    medication: "Spironolactone 25 mg",
    sig: "1 tablet daily",
    start: "Aug 18, 2025",
    end: "Nov 18, 2025",
    prescriber: "Dr. Nguyen (Cardiology)",
  },
];

export default function MedicationsPage() {
  return (
    <div>
      <ChartTabHeader title="Medications" subtitle="Active and historical prescriptions" />
      <ChartTable columns={medicationColumns} rows={medicationRows} />
    </div>
  );
}
