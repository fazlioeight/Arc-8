import React from "react";
import { SectionHeader, DataTable, Chip } from "../../../../components/ehr/Primitives";

const sharingColumns = [
  { label: "User / Group", accessor: "subject" },
  {
    label: "Role",
    render: (row) => <Chip label={row.role} title={`Role: ${row.role}`} />,
  },
  { label: "Added", accessor: "added" },
  { label: "Owner", accessor: "owner" },
  {
    label: "Actions",
    render: (row) => (
      <button type="button" className="rounded border border-gray-300 px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50">
        {row.actionLabel}
      </button>
    ),
  },
];

const sharingRows = [
  {
    id: "share-1",
    subject: "Jamie Ramirez",
    role: "Coder",
    added: "Oct 14, 2025",
    owner: "Yes",
    actionLabel: "Manage",
  },
  {
    id: "share-2",
    subject: "Risk Adjustment Squad",
    role: "Reviewer",
    added: "Oct 01, 2025",
    owner: "No",
    actionLabel: "Remove",
  },
];

export default function SharingPage() {
  return (
    <div className="space-y-4">
      <div className="coding-surface rounded-xl p-4">
        <SectionHeader title="Sharing" subtitle="Access & collaboration" />
        <div className="mt-3">
          <DataTable columns={sharingColumns} rows={sharingRows} />
        </div>
      </div>
    </div>
  );
}
