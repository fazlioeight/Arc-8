import React from "react";
import { ChartTabHeader, ChartTable, ChartChip } from "./chartPrimitives";

const sharingColumns = [
  { label: "User / Group", accessor: "subject" },
  {
    label: "Role",
    render: (row) => <ChartChip label={row.role} tone="bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-200" />,
  },
  { label: "Added", accessor: "added" },
  { label: "Owner", accessor: "owner" },
  {
    label: "Action",
    render: (row) => (
      <button
        type="button"
        className="rounded-md ring-1 coding-border coding-text-strong bg-transparent hover:bg-[var(--coding-hover)] px-2 py-1 text-[11px] font-semibold"
      >
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
    <div>
      <ChartTabHeader
        title="Sharing"
        subtitle="Access and collaboration"
        action={
          <button
            type="button"
            className="rounded-md bg-[var(--brand-primary)] text-white px-2.5 py-1.5 text-xs font-semibold hover:bg-brand-700"
          >
            + Share
          </button>
        }
      />
      <ChartTable columns={sharingColumns} rows={sharingRows} />
    </div>
  );
}
