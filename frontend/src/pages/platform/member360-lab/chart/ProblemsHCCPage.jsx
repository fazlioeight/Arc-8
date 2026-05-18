import React from "react";
import { ChartTabHeader, ChartTable } from "./chartPrimitives";

const PROBLEM_COLUMNS = [
  { label: "Problem", accessor: "problem" },
  { label: "HCC", accessor: "hcc" },
  { label: "Evidence", accessor: "evidence" },
  { label: "Last seen", accessor: "lastSeen" },
  { label: "Status", accessor: "status" },
];

// Member360 does not yet model a problem list / conditions table. When that
// data lands (problems backed by ICD-10 + HCC mapping per encounter), this
// page should fetch it via a dedicated endpoint and render the rows. For now
// the tab shows an honest empty state instead of fabricated patient data —
// rendering hardcoded conditions for every member is a HIPAA-confidence risk.
export default function ProblemsHCCPage() {
  return (
    <div>
      <ChartTabHeader
        title="Problem List / HCC"
        subtitle="Active problems mapped to HCCs"
      />
      <ChartTable
        columns={PROBLEM_COLUMNS}
        rows={[]}
        emptyMessage="Problem list integration is pending. See the Care Gaps tab for HCC gaps derived from claims."
      />
    </div>
  );
}
