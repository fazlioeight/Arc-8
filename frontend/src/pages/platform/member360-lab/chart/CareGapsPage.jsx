import React from "react";
import { SectionHeader, DataTable, Chip } from "../../../../components/ehr/Primitives";

const careGapColumns = [
  { label: "Gap", accessor: "gap" },
  { label: "Measure", accessor: "measure" },
  { label: "Due", accessor: "due" },
  {
    label: "Status",
    render: (row) => <Chip label={row.status} title={`Current status: ${row.status}`} />,
  },
  { label: "Action", accessor: "action" },
];

const careGapRows = [
  {
    id: "gap-1",
    gap: "Diabetes retinal exam",
    measure: "HEDIS MY2025",
    due: "Oct 31, 2025",
    status: "Open",
    action: "Coordinate with Dr. Kim (ophthalmology) to obtain visit note.",
  },
  {
    id: "gap-2",
    gap: "Colorectal cancer screening",
    measure: "Stars 2025",
    due: "Nov 15, 2025",
    status: "In Review",
    action: "Awaiting pathology report upload from GI clinic.",
  },
];

export default function CareGapsPage() {
  return (
    <div className="space-y-4">
      <div className="coding-surface rounded-xl p-4">
        <SectionHeader title="Care Gaps" subtitle="Quality & risk closure" />
        <div className="mt-3">
          <DataTable columns={careGapColumns} rows={careGapRows} />
        </div>
      </div>
    </div>
  );
}
