import React from "react";
import { ChartTabHeader, ChartTable } from "./chartPrimitives";

const LAB_COLUMNS = [
  { label: "Date", accessor: "date" },
  { label: "Test", accessor: "test" },
  { label: "Result", accessor: "result" },
  { label: "Reference", accessor: "reference" },
  { label: "Status", accessor: "status" },
  { label: "Ordered by", accessor: "ordered_by" },
];

const formatDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString();
};

const formatRange = (lab) => {
  const lo = lab.reference_range_low;
  const hi = lab.reference_range_high;
  if (lo == null && hi == null) return "—";
  if (lo == null) return `≤ ${hi}`;
  if (hi == null) return `≥ ${lo}`;
  return `${lo}–${hi}`;
};

// Annotate abnormal results inline so a reviewer can scan the column at a
// glance. We render the H/L/A flag right next to the value rather than as
// a separate column — keeps the row compact and matches how chart printouts
// usually present this.
const formatResult = (lab) => {
  const value = lab.result_value || "—";
  const unit = lab.result_unit ? ` ${lab.result_unit}` : "";
  const flag = lab.abnormal_flag && lab.abnormal_flag !== "N"
    ? ` [${lab.abnormal_flag}]`
    : "";
  return `${value}${unit}${flag}`;
};

const formatTest = (lab) =>
  lab.loinc_code ? `${lab.test_name} (${lab.loinc_code})` : lab.test_name;

export default function LabsImagingPage({ detail }) {
  const labs = detail?.labs || [];
  // Most-recent results first.
  const sorted = [...labs].sort((a, b) =>
    String(b.result_date || "").localeCompare(String(a.result_date || ""))
  );

  const rows = sorted.map((l) => ({
    id: l.id,
    date: formatDate(l.result_date),
    test: formatTest(l),
    result: formatResult(l),
    reference: formatRange(l),
    status: l.status,
    ordered_by: l.ordering_provider || "—",
  }));

  return (
    <div className="space-y-3">
      <ChartTabHeader
        title="Labs & Imaging"
        subtitle="LOINC-coded observations (imaging studies ingestion is a future addition)"
      />
      <ChartTable
        columns={LAB_COLUMNS}
        rows={rows}
        emptyMessage="No lab results on file. Upload via POST /api/member360/import/labs."
      />
    </div>
  );
}
