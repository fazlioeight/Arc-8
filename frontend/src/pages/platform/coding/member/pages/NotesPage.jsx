import React from "react";
import { SectionHeader, DataTable, Chip } from "../../../../../components/ehr/Primitives";

const noteColumns = [
  { label: "Author", accessor: "author" },
  { label: "Date", accessor: "date" },
  {
    label: "Type",
    render: (row) => <Chip label={row.type} title={`Note type: ${row.type}`} />,
  },
  { label: "Summary", accessor: "summary" },
];

const noteRows = [
  {
    id: "note-1",
    author: "Jamie L. (RN)",
    date: "Oct 16, 2025",
    type: "Clinical",
    summary: "Patient reports improved adherence to diuretics; monitoring weight at home.",
  },
  {
    id: "note-2",
    author: "Alex P. (Coder)",
    date: "Oct 10, 2025",
    type: "Coding",
    summary: "Validated CHF (I50.22) supported by progress note dated 10/05/2025.",
  },
];

export default function NotesPage() {
  return (
    <div className="space-y-4">
      <div className="coding-surface rounded-xl p-4">
        <SectionHeader title="Notes" subtitle="Clinician & coder notes" />
        <div className="mt-3">
          <DataTable columns={noteColumns} rows={noteRows} />
        </div>
      </div>
    </div>
  );
}
