import React from "react";
import { ChartTabHeader, ChartTable } from "./chartPrimitives";

const LAB_COLUMNS = [
  { label: "Date", accessor: "date" },
  { label: "Test", accessor: "test" },
  { label: "Result", accessor: "result" },
  { label: "Reference", accessor: "reference" },
  { label: "Ordering", accessor: "ordering" },
];

// Member360 does not yet ingest lab results or imaging studies. When that
// data lands (likely from a FHIR Observation feed), this page should fetch
// and render it. Until then the tab shows an empty state instead of fake
// values; rendering hardcoded lab results for every member is a clinical
// confidence risk.
export default function LabsImagingPage() {
  return (
    <div>
      <ChartTabHeader
        title="Labs & Imaging"
        subtitle="Recent results and studies"
      />
      <ChartTable
        columns={LAB_COLUMNS}
        rows={[]}
        emptyMessage="Lab and imaging integration is pending."
      />
    </div>
  );
}
