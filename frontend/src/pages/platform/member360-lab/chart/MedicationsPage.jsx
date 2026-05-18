import React from "react";
import { ChartTabHeader, ChartTable } from "./chartPrimitives";

const MEDICATION_COLUMNS = [
  { label: "Drug", accessor: "drug" },
  { label: "Sig", accessor: "sig" },
  { label: "Last fill", accessor: "last_fill" },
  { label: "Refills", accessor: "refills" },
  { label: "Prescriber", accessor: "prescriber" },
  { label: "Status", accessor: "status" },
];

const formatDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString();
};

// Build the human-readable Sig from the structured columns. EHR-style
// "20mg PO daily" reconstructed from dose/dose_unit/route/frequency so the
// table reads cleanly even when input is split across fields.
const formatSig = (m) =>
  [
    [m.dose, m.dose_unit].filter(Boolean).join(""),
    m.route,
    m.frequency,
  ]
    .filter(Boolean)
    .join(" ") || "—";

const formatDrug = (m) => {
  const base = m.drug_name || "Unnamed medication";
  return m.generic_name && m.generic_name !== m.drug_name
    ? `${base} (${m.generic_name})`
    : base;
};

export default function MedicationsPage({ detail }) {
  const meds = detail?.medications || [];
  // Active medications first, then most-recently filled.
  const sorted = [...meds].sort((a, b) => {
    const aActive = a.status === "active" ? 0 : 1;
    const bActive = b.status === "active" ? 0 : 1;
    if (aActive !== bActive) return aActive - bActive;
    return String(b.last_fill_date || "").localeCompare(String(a.last_fill_date || ""));
  });

  const rows = sorted.map((m) => ({
    id: m.id,
    drug: formatDrug(m),
    sig: formatSig(m),
    last_fill: formatDate(m.last_fill_date),
    refills: m.refills_remaining != null ? m.refills_remaining : "—",
    prescriber: m.prescriber || "—",
    status: m.status,
  }));

  return (
    <div>
      <ChartTabHeader
        title="Medications"
        subtitle="Active and historical prescriptions"
      />
      <ChartTable
        columns={MEDICATION_COLUMNS}
        rows={rows}
        emptyMessage="No medications on file. Upload via POST /api/member360/import/medications."
      />
    </div>
  );
}
