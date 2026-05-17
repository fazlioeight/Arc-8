import React from "react";
import { SectionHeader, DataTable, Chip } from "../../../../components/ehr/Primitives";

const problemColumns = [
  { label: "Problem", accessor: "problem" },
  { label: "HCC", accessor: "hcc" },
  { label: "Evidence", accessor: "evidence" },
  { label: "Last Seen", accessor: "lastSeen" },
  {
    label: "Actions",
    render: (row) => (
      <div className="flex items-center gap-2">
        <button type="button" className="rounded border border-gray-300 px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50">
          Review
        </button>
        {row.flag && <Chip label={row.flag} title={row.flag} />}
      </div>
    ),
  },
];

const problemRows = [
  {
    id: "prob-1",
    problem: "Chronic systolic heart failure",
    hcc: "HCC 85",
    evidence: "Cardiology note 10/05/2025 - BNP 980",
    lastSeen: "Oct 12, 2025",
    flag: "High priority",
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
    <div className="space-y-4">
      <div className="coding-surface rounded-xl p-4">
        <SectionHeader title="Problem List / HCC" subtitle="Active problems mapped to HCCs" />
        <div className="mt-3">
          <DataTable columns={problemColumns} rows={problemRows} />
        </div>
      </div>
    </div>
  );
}
