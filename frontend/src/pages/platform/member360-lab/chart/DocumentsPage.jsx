import React from "react";
import { ChartTabHeader, ChartTable } from "./chartPrimitives";

const documentColumns = [
  { label: "Date", accessor: "date" },
  { label: "Type", accessor: "type" },
  { label: "Description", accessor: "description" },
  { label: "Source", accessor: "source" },
  {
    label: "Action",
    render: (row) => (
      <button
        type="button"
        className="text-xs font-medium text-[var(--brand-primary)] hover:underline"
      >
        {row.actionLabel}
      </button>
    ),
  },
];

const documentRows = [
  {
    id: "doc-1",
    date: "Oct 15, 2025",
    type: "Clinical Note",
    description: "PCP follow-up visit documenting CHF exacerbation.",
    source: "Uploaded by S. Patel",
    actionLabel: "Open PDF",
  },
  {
    id: "doc-2",
    date: "Sep 29, 2025",
    type: "Hospital Discharge",
    description: "Discharge summary from St. Mary's for COPD admission.",
    source: "Faxed by Central Intake",
    actionLabel: "Preview",
  },
];

export default function DocumentsPage() {
  return (
    <div>
      <ChartTabHeader title="Documents" subtitle="Charts, PDFs and uploads" />
      <ChartTable columns={documentColumns} rows={documentRows} />
    </div>
  );
}
