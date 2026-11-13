import React from "react";
import { ChartTabHeader, ChartTable, ChartChip } from "./chartPrimitives";

const HCC_CODE_PREFIXES = [
  "E10", "E11", "E13", "I10", "I11", "I12", "I13", "I20", "I21", "I25",
  "I42", "I48", "I50", "I63", "I69", "I70", "I73", "J43", "J44", "J45",
  "N18", "F20", "F31", "F32", "F33", "C", "G20", "G30", "G35", "K70", "K74",
  "M05", "M06",
];

const ICD10_REFERENCE_LOOKUP = {
  I10: { code: "I10", description: "Essential (primary) hypertension", severity: "moderate" },
  E119: { code: "E11.9", description: "Type 2 diabetes mellitus without complications", severity: "moderate" },
  "E11.9": { code: "E11.9", description: "Type 2 diabetes mellitus without complications", severity: "moderate" },
  E1165: { code: "E11.65", description: "Type 2 diabetes mellitus with hyperglycemia", severity: "severe" },
  "E11.65": { code: "E11.65", description: "Type 2 diabetes mellitus with hyperglycemia", severity: "severe" },
  N1830: { code: "N18.30", description: "Chronic kidney disease, stage 3 unspecified", severity: "moderate" },
  "N18.30": { code: "N18.30", description: "Chronic kidney disease, stage 3 unspecified", severity: "moderate" },
  N183: { code: "N18.3", description: "Chronic kidney disease, stage 3 (moderate)", severity: "moderate" },
  "N18.3": { code: "N18.3", description: "Chronic kidney disease, stage 3 (moderate)", severity: "moderate" },
  N184: { code: "N18.4", description: "Chronic kidney disease, stage 4 (severe)", severity: "severe" },
  "N18.4": { code: "N18.4", description: "Chronic kidney disease, stage 4 (severe)", severity: "severe" },
  I509: { code: "I50.9", description: "Heart failure, unspecified", severity: "severe" },
  "I50.9": { code: "I50.9", description: "Heart failure, unspecified", severity: "severe" },
  I5032: { code: "I50.32", description: "Chronic diastolic (congestive) heart failure", severity: "severe" },
  "I50.32": { code: "I50.32", description: "Chronic diastolic (congestive) heart failure", severity: "severe" },
  J449: { code: "J44.9", description: "Chronic obstructive pulmonary disease, unspecified", severity: "moderate" },
  "J44.9": { code: "J44.9", description: "Chronic obstructive pulmonary disease, unspecified", severity: "moderate" },
  J441: { code: "J44.1", description: "COPD with (acute) exacerbation", severity: "severe" },
  "J44.1": { code: "J44.1", description: "COPD with (acute) exacerbation", severity: "severe" },
};

const formatIcd10Code = (raw) => {
  const clean = String(raw || "").trim().toUpperCase();
  if (!clean) return "—";
  if (ICD10_REFERENCE_LOOKUP[clean]) return ICD10_REFERENCE_LOOKUP[clean].code;
  const compact = clean.replace(/\./g, "");
  if (ICD10_REFERENCE_LOOKUP[compact]) return ICD10_REFERENCE_LOOKUP[compact].code;
  if (clean.length > 3 && !clean.includes(".") && /^[A-Z]\d{2}/.test(clean)) {
    return `${clean.slice(0, 3)}.${clean.slice(3)}`;
  }
  return clean;
};

const resolveClinicalDescription = (problem, formattedCode) => {
  const rawDesc = String(problem?.description || "").trim();
  const compact = String(problem?.code || "").trim().toUpperCase().replace(/\./g, "");
  const ref = ICD10_REFERENCE_LOOKUP[formattedCode] || ICD10_REFERENCE_LOOKUP[compact];
  if (!rawDesc || /^icd-10 diagnosis\b/i.test(rawDesc)) {
    return ref?.description || `Clinical diagnosis (${formattedCode})`;
  }
  return rawDesc;
};

const resolveClinicalSeverity = (problem, formattedCode) => {
  const rawSev = String(problem?.severity || "").trim().toLowerCase();
  if (rawSev && rawSev !== "—") return rawSev;
  const compact = String(problem?.code || "").trim().toUpperCase().replace(/\./g, "");
  const ref = ICD10_REFERENCE_LOOKUP[formattedCode] || ICD10_REFERENCE_LOOKUP[compact];
  return ref?.severity || "moderate";
};

const isHccImpactCode = (problem) => {
  if (!problem) return false;
  if (problem.is_primary) return true;
  if (String(problem.severity || "").toLowerCase() === "severe") return true;
  const normalized = String(problem.code || "").trim().toUpperCase();
  return HCC_CODE_PREFIXES.some((prefix) => normalized.startsWith(prefix));
};

const PROBLEM_COLUMNS = [
  {
    label: "Code & HCC",
    id: "code",
    render: (row) => (
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-mono font-semibold coding-text-strong">{row.raw_code}</span>
        {row.is_primary && (
          <span
            title="Primary diagnosis"
            className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200 px-1.5 py-0.5 text-[10px] font-semibold"
          >
            ★ Primary
          </span>
        )}
        {row.is_hcc && (
          <span
            title="CMS HCC / RAF revenue-impacting condition"
            className="inline-flex items-center rounded-full bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-200 dark:ring-emerald-700/40 px-1.5 py-0.5 text-[10px] font-semibold"
          >
            $ HCC
          </span>
        )}
      </div>
    ),
  },
  { label: "System", accessor: "code_system" },
  { label: "Description", accessor: "description" },
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
  {
    label: "Severity",
    id: "severity",
    render: (row) => {
      const sev = String(row.severity || "").toLowerCase();
      if (!sev || sev === "—") return "—";
      const tone =
        sev === "severe"
          ? "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-200"
          : sev === "moderate"
          ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200"
          : "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-200";
      return <ChartChip label={row.severity} tone={tone} />;
    },
  },
  { label: "Onset", accessor: "onset_date" },
  { label: "Resolved", accessor: "resolved_date" },
  { label: "Recorded by", accessor: "recorded_by" },
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
  const rows = problems.map((p) => {
    const formattedCode = formatIcd10Code(p.code);
    const resolvedSeverity = resolveClinicalSeverity(p, formattedCode);
    return {
      id: p.id,
      raw_code: formattedCode,
      code: p.is_primary ? `${formattedCode} ★` : formattedCode,
      is_primary: Boolean(p.is_primary),
      is_hcc: isHccImpactCode({ ...p, code: formattedCode, severity: resolvedSeverity }),
      code_system: p.code_system || "ICD-10",
      description: resolveClinicalDescription(p, formattedCode),
      status: p.status,
      severity: resolvedSeverity,
      onset_date: formatDate(p.onset_date),
      resolved_date: formatDate(p.resolved_date),
      recorded_by: p.recorded_by || "—",
    };
  });

  return (
    <div>
      <ChartTabHeader
        title="Problems / HCC"
        subtitle="Active diagnosis list and HCC-mapped conditions (★ marks the primary diagnosis · $ HCC marks CMS RAF revenue-impact codes)"
      />
      <ChartTable
        columns={PROBLEM_COLUMNS}
        rows={rows}
        emptyMessage="No problems on file. Upload via POST /api/member360/import/problems."
      />
    </div>
  );
}
