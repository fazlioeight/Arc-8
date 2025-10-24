import React from "react";
import { SectionHeader, DataTable, Chip } from "../../../../../components/ehr/Primitives";

const taskColumns = [
  {
    label: "Type",
    render: (row) => <Chip label={row.type} title={`Item type: ${row.type}`} />,
  },
  { label: "Subject", accessor: "subject" },
  { label: "Owner", accessor: "owner" },
  { label: "Due", accessor: "due" },
  {
    label: "Status",
    render: (row) => <Chip label={row.status} title={`Status: ${row.status}`} />,
  },
];

const taskRows = [
  {
    id: "task-1",
    type: "Task",
    subject: "Confirm documentation for HCC 85",
    owner: "Alex P.",
    due: "Oct 25, 2025",
    status: "In Progress",
  },
  {
    id: "task-2",
    type: "Message",
    subject: "Need discharge summary from St. Mary's",
    owner: "Risk Adjustment Squad",
    due: "Oct 21, 2025",
    status: "Waiting",
  },
];

export default function TasksMessagesPage() {
  return (
    <div className="space-y-4">
      <div className="coding-surface rounded-xl p-4">
        <SectionHeader title="Tasks & Messages" subtitle="Workflow & communication" />
        <div className="mt-3">
          <DataTable columns={taskColumns} rows={taskRows} />
        </div>
      </div>
    </div>
  );
}
