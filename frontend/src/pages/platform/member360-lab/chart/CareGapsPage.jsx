import React from "react";
import { ChartTabHeader, ChartTable, ChartChip } from "./chartPrimitives";

const CARE_GAP_COLUMNS = [
  { label: "HCC", accessor: "hcc_code" },
  { label: "Likely ICD-10", accessor: "icd10" },
  { label: "Reason", accessor: "reason" },
  {
    label: "Status",
    render: () => (
      <ChartChip
        label="Open"
        tone="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200"
      />
    ),
  },
];

export default function CareGapsPage({ gap, member }) {
  // Missing HCC rows come from the backend gap analysis. Each entry can list
  // multiple ICD-10 candidates; we join them so the row stays readable.
  const rows = (gap?.missing_hcc || []).map((entry, idx) => ({
    id: entry.hcc_code || `gap-${idx}`,
    hcc_code: entry.hcc_code || "—",
    icd10:
      Array.isArray(entry.icd10_candidates) && entry.icd10_candidates.length
        ? entry.icd10_candidates.join(", ")
        : "—",
    reason: entry.reason || "Present in claims but not MAO-004",
  }));

  const openCount = member?.open_care_gaps ?? rows.length;

  return (
    <div>
      <ChartTabHeader
        title="Care Gaps"
        subtitle={
          openCount > 0
            ? `${openCount} open ${openCount === 1 ? "gap" : "gaps"} flagged from claims vs MAO-004 reconciliation.`
            : "No open gaps from claims vs MAO-004 reconciliation."
        }
      />
      <ChartTable
        columns={CARE_GAP_COLUMNS}
        rows={rows}
        emptyMessage="No missing HCCs detected for this member in the current submission year."
      />
    </div>
  );
}
