import React from "react";
import { ChartTabHeader, ChartTable } from "./chartPrimitives";

const PROBLEM_COLUMNS = [
  { label: "Code", accessor: "code" },
  { label: "System", accessor: "code_system" },
  { label: "Description", accessor: "description" },
  { label: "Status", accessor: "status" },
  { label: "Severity", accessor: "severity" },
  { label: "Onset", accessor: "onset_date" },
  { label: "Resolved", accessor: "resolved_date" },
];

const formatDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString();
};

// Active problems first, then resolved/inactive. The backend already sorts
// active-first by onset_date; we re-sort here as a safety net since the page
// also stays usable if a caller hands us a manually-sorted list.
const sortProblems = (problems) =>
  [...problems].sort((a, b) => {
    const aActive = a.status === "active" ? 0 : 1;
    const bActive = b.status === "active" ? 0 : 1;
    if (aActive !== bActive) return aActive - bActive;
    return String(b.onset_date || "").localeCompare(String(a.onset_date || ""));
  });

export default function ProblemsHCCPage({ detail }) {
  const problems = sortProblems(detail?.problems || []);
  const rows = problems.map((p) => ({
    id: p.id,
    code: p.is_primary ? `${p.code} ★` : p.code,
    code_system: p.code_system,
    description: p.description || "—",
    status: p.status,
    severity: p.severity || "—",
    onset_date: formatDate(p.onset_date),
    resolved_date: formatDate(p.resolved_date),
  }));

  return (
    <div>
      <ChartTabHeader
        title="Problems / HCC"
        subtitle="Active diagnosis list and HCC-mapped conditions (★ marks the primary diagnosis)"
      />
      <ChartTable
        columns={PROBLEM_COLUMNS}
        rows={rows}
        emptyMessage="No problems on file. Upload via POST /api/member360/import/problems."
      />
    </div>
  );
}
