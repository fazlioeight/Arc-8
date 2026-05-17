import React from "react";
import { ChartTabHeader, ChartTable, ChartChip } from "./chartPrimitives";

const careGapColumns = [
  { label: "Gap", accessor: "gap" },
  { label: "Measure", accessor: "measure" },
  { label: "Due", accessor: "due" },
  {
    label: "Status",
    render: (row) => <ChartChip label={row.status} />,
  },
  { label: "Next action", accessor: "action" },
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
    <div>
      <ChartTabHeader title="Care Gaps" subtitle="Quality and risk closure" />
      <ChartTable columns={careGapColumns} rows={careGapRows} />
    </div>
  );
}
