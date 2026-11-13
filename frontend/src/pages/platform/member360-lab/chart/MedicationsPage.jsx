import React from "react";
import { ChartTabHeader, ChartTable, ChartChip } from "./chartPrimitives";

const CRITICAL_DRUG_KEYWORDS = [
  "insulin", "glargine", "lispro", "aspart", "metformin", "furosemide",
  "apixaban", "eliquis", "warfarin", "rivaroxaban", "clopidogrel",
  "atorvastatin", "lisinopril", "losartan", "metoprolol", "carvedilol",
  "empagliflozin", "jardiance", "semaglutide", "ozempic",
];

const isCriticalDrug = (m) => {
  const text = `${m?.drug_name || ""} ${m?.generic_name || ""}`.toLowerCase();
  return CRITICAL_DRUG_KEYWORDS.some((kw) => text.includes(kw));
};

const MEDICATION_COLUMNS = [
  {
    label: "Drug",
    id: "drug",
    render: (row) => (
      <div className="space-y-0.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-semibold coding-text-strong">{row.drug}</span>
          {row.is_critical && (
            <span className="inline-flex items-center rounded-full bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-200 px-1.5 py-0.5 text-[10px] font-semibold">
              Star / Adherence
            </span>
          )}
        </div>
        {row.rx_number && (
          <p className="text-[11px] font-mono coding-text-muted">{row.rx_number}</p>
        )}
      </div>
    ),
  },
  { label: "Sig", accessor: "sig" },
  { label: "Quantity", accessor: "quantity" },
  { label: "Supply", accessor: "days_supply" },
  { label: "Last fill", accessor: "last_fill" },
  {
    label: "Refills",
    id: "refills",
    render: (row) => {
      if (row.raw_refills === 0 && row.status === "active") {
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 text-rose-800 ring-1 ring-rose-200 dark:bg-rose-900/30 dark:text-rose-200 dark:ring-rose-700/40 px-2 py-0.5 text-[11px] font-semibold">
            ⚠️ 0 refills · Renew / PA
          </span>
        );
      }
      if (row.raw_refills === 1 && row.status === "active") {
        return (
          <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 ring-1 ring-amber-200 dark:bg-amber-900/30 dark:text-amber-200 dark:ring-amber-700/40 px-2 py-0.5 text-[11px] font-semibold">
            1 refill left
          </span>
        );
      }
      return <span className="tabular-nums">{row.refills}</span>;
    },
  },
  { label: "Prescriber", accessor: "prescriber" },
  { label: "Pharmacy", accessor: "pharmacy" },
  {
    label: "Status",
    id: "status",
    render: (row) => (
      <ChartChip
        label={row.status || "active"}
        tone={
          row.status === "active"
            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200"
            : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
        }
      />
    ),
  },
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

const DOSAGE_FORM_TOKENS = ["TAB", "TABLET", "CAP", "CAPSULE", "INH", "INHALER", "INJ", "SOL", "SUSP", "PATCH"];

const inferDosageForm = (m) => {
  if (m?.dosage_form) return String(m.dosage_form).toUpperCase();
  const upperName = String(m?.drug_name || "").toUpperCase();
  const routeUpper = String(m?.route || "").toUpperCase();
  if (routeUpper === "INH" || upperName.includes("ALBUTEROL") || upperName.includes("HFA")) return "INH";
  if (["SC", "SUBQ", "IM", "IV"].includes(routeUpper) || upperName.includes("INSULIN") || upperName.includes("100U/ML")) return "INJ";
  if (upperName.includes("OMEPRAZOLE") || upperName.includes("CAP")) return "CAP";
  return "TAB";
};

const formatDrug = (m) => {
  let base = (m.drug_name || "Unnamed medication").trim();
  const upper = base.toUpperCase();
  const hasToken = DOSAGE_FORM_TOKENS.some((tok) => new RegExp(`\\b${tok}\\b`).test(upper));
  const form = inferDosageForm(m);
  if (!hasToken && base !== "Unnamed medication") {
    base = `${base} ${form}`;
  }
  return m.generic_name && m.generic_name.toLowerCase() !== base.toLowerCase()
    ? `${base} (${m.generic_name})`
    : base;
};

const formatQuantity = (m) => {
  if (m?.quantity != null) return `${m.quantity} ${inferDosageForm(m)}`;
  const supply = m?.days_supply != null ? Number(m.days_supply) : 30;
  const form = inferDosageForm(m);
  const freq = String(m?.frequency || "").toLowerCase();
  if (form === "INH" || freq.includes("4-6") || freq.includes("needed")) return `1 ${form}`;
  if (form === "INJ") return `${Math.max(1, Math.floor(supply / 10))} ${form}`;
  if (freq.includes("twice") || freq.includes("bid")) return `${supply * 2} ${form}`;
  if (freq.includes("three") || freq.includes("tid")) return `${supply * 3} ${form}`;
  return `${supply} ${form}`;
};

export default function MedicationsPage({ detail }) {
  const meds = detail?.medications || [];
  // Active medications first, then 0-refill urgent items, then most-recently filled.
  const sorted = [...meds].sort((a, b) => {
    const aActive = a.status === "active" ? 0 : 1;
    const bActive = b.status === "active" ? 0 : 1;
    if (aActive !== bActive) return aActive - bActive;
    const aZero = a.refills_remaining === 0 ? 0 : 1;
    const bZero = b.refills_remaining === 0 ? 0 : 1;
    if (aZero !== bZero) return aZero - bZero;
    return String(b.last_fill_date || "").localeCompare(String(a.last_fill_date || ""));
  });

  const zeroRefillMeds = sorted.filter(
    (m) => m.status === "active" && m.refills_remaining === 0
  );

  const rows = sorted.map((m) => ({
    id: m.id,
    rx_number: m.rx_number,
    drug: formatDrug(m),
    is_critical: isCriticalDrug(m),
    sig: formatSig(m),
    quantity: formatQuantity(m),
    days_supply: m.days_supply != null ? `${m.days_supply}d` : "—",
    last_fill: formatDate(m.last_fill_date),
    raw_refills: m.refills_remaining,
    refills: m.refills_remaining != null ? m.refills_remaining : "—",
    prescriber: m.prescriber || "—",
    pharmacy: m.pharmacy || "—",
    status: m.status,
  }));

  return (
    <div className="space-y-3">
      <ChartTabHeader
        title="Medications & Pharmacy (Abarca PBM)"
        subtitle="Active and historical prescriptions, refill status, dispensing pharmacy, and Star Rating adherence alerts"
      />
      {zeroRefillMeds.length > 0 && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50/80 dark:border-rose-800/50 dark:bg-rose-950/30 px-3.5 py-2.5 text-xs text-rose-900 dark:text-rose-200"
        >
          <span>
            <strong>Pharmacy Refill / Prior Auth Alert:</strong>{" "}
            {zeroRefillMeds.length} active prescription{zeroRefillMeds.length === 1 ? " has" : "s have"}{" "}
            <strong>0 refills remaining</strong> ({zeroRefillMeds.map((m) => m.drug_name).join(", ")}). Coordinate refill renewal or Prior Authorization with prescriber.
          </span>
        </div>
      )}
      <ChartTable
        columns={MEDICATION_COLUMNS}
        rows={rows}
        emptyMessage="No medications on file. Upload via POST /api/member360/import/medications."
      />
    </div>
  );
}
