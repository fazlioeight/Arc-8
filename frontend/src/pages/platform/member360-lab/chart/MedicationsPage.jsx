import React from "react";
import { ChartTabHeader, ChartTable } from "./chartPrimitives";

const MEDICATION_COLUMNS = [
  { label: "Medication", accessor: "medication" },
  { label: "Sig", accessor: "sig" },
  { label: "Start", accessor: "start" },
  { label: "End", accessor: "end" },
  { label: "Prescriber", accessor: "prescriber" },
];

// Member360 does not yet ingest pharmacy / fills data. When that lands
// (likely from the existing php_pharmacy import pipeline), this page should
// fetch and render it. Until then the tab shows an empty state — rendering
// hardcoded prescriptions for every member is a clinical confidence risk.
export default function MedicationsPage() {
  return (
    <div>
      <ChartTabHeader
        title="Medications"
        subtitle="Active and historical prescriptions"
      />
      <ChartTable
        columns={MEDICATION_COLUMNS}
        rows={[]}
        emptyMessage="Pharmacy data integration is pending."
      />
    </div>
  );
}
