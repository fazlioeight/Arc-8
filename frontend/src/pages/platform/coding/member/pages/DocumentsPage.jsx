import React from "react";
import { SectionHeader, DataTable } from "../../../../../components/ehr/Primitives";

const documentColumns = [
  { label: "Date", accessor: "date" },
  { label: "Type", accessor: "type" },
  { label: "Description", accessor: "description" },
  { label: "Source", accessor: "source" },
  {
    label: "Open",
    render: (row) => (
      <button type="button" className="text-xs font-semibold text-indigo-600 hover:underline">
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
    <div className="space-y-4">
      <div className="coding-surface rounded-xl p-4">
        <SectionHeader title="Documents" subtitle="Charts, PDFs & uploads" />
        <div className="mt-3">
          <DataTable columns={documentColumns} rows={documentRows} />
        </div>
      </div>
    </div>
  );
}
