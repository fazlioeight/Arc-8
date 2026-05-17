import React from "react";
import { ChartTabHeader, ChartTable, ChartChip } from "./chartPrimitives";

const problemColumns = [
  { label: "Problem", accessor: "problem" },
  { label: "HCC", accessor: "hcc" },
  { label: "Evidence", accessor: "evidence" },
  { label: "Last seen", accessor: "lastSeen" },
  {
    label: "Status",
    render: (row) => (row.flag ? <ChartChip label={row.flag} /> : null),
  },
];

const problemRows = [
  {
    id: "prob-1",
    problem: "Chronic systolic heart failure",
    hcc: "HCC 85",
    evidence: "Cardiology note 10/05/2025 — BNP 980",
    lastSeen: "Oct 12, 2025",
    flag: "High",
  },
  {
    id: "prob-2",
    problem: "Type 2 diabetes with nephropathy",
    hcc: "HCC 18",
    evidence: "Nephrology visit 09/22/2025",
    lastSeen: "Sep 22, 2025",
    flag: "Lab follow-up",
  },
];

export default function ProblemsHCCPage() {
  return (
    <div>
      <ChartTabHeader title="Problem List / HCC" subtitle="Active problems mapped to HCCs" />
      <ChartTable columns={problemColumns} rows={problemRows} />
    </div>
  );
}
