// Risk Adjustment EHR-Style Wireframe (Pure JS version)
// TailwindCSS for layout; spacing, stickiness, palette, and density tuned for parity.

import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import { AuthContext } from "../../context/AuthContext";
import {
  createCodingNote,
  createHealthAssessment,
  fetchCodingMemberDetail,
  fetchMemberGapAnalysis,
  generateSubmissionExport,
  updateCodingChase,
} from "../../services/codingService";

const CHART_NAV_ITEMS = [
  "Overview",
  "Problems / HCC",
  "Medications",
  "Encounters",
  "Labs & Imaging",
  "Notes",
  "Care Gaps",
  "Tasks & Messages",
  "Eligibility & Coverage",
  "Documents",
];

const UTILITY_NAV_ITEMS = ["Audit Log", "Sharing", "Settings"];

const formatDate = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString();
};

const formatDateTime = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
};

const calculateAge = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const diff = Date.now() - date.getTime();
  const ageDate = new Date(diff);
  return Math.abs(ageDate.getUTCFullYear() - 1970);
};

const formatDobWithAge = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const age = calculateAge(date);
  const display = date.toLocaleDateString();
  return Number.isFinite(age) ? `${display} (${age}y)` : display;
};

const toSentenceCase = (value) => {
  if (!value) return "—";
  return value
    .toString()
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const getMemberName = (member) => {
  if (!member) return null;
  const name = [member.first_name, member.last_name].filter(Boolean).join(" ");
  return name || member.member_key || null;
};

const deriveTimelineFromClaims = (claims) =>
  (claims || [])
    .filter(Boolean)
    .sort((a, b) => {
      const aDate = new Date(a.service_date || a.service_start || 0).getTime();
      const bDate = new Date(b.service_date || b.service_start || 0).getTime();
      return bDate - aDate;
    })
    .slice(0, 5)
    .map((claim) => ({
      id: claim.id || claim.claim_number,
      date: formatDate(claim.service_date || claim.service_start || claim.service_end),
      description: toSentenceCase(claim.claim_type || "Encounter"),
      detail: claim.provider_name || claim.place_of_service || (claim.chart_required ? "Chart requested" : ""),
    }));

const nextChaseStatus = (status) => {
  if (status === "open") return "in_review";
  if (status === "in_review") return "closed";
  return "open";
};

const formatCurrency = (value) => {
  if (typeof value !== "number") return value ?? "—";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
};

const extractHccCode = (chase) => {
  if (!chase) return "—";
  if (chase.hcc_code) return chase.hcc_code;
  const codes = chase.hcc_codes ? Object.keys(chase.hcc_codes) : [];
  return codes[0] || "—";
};

const extractIcdCodes = (source) => {
  const map = source?.diagnosis_codes || source?.icd10_codes;
  if (!map) return [];
  if (Array.isArray(map)) return map;
  return Object.keys(map);
};

function Chip({ label, title }) {
  return (
    <span
      title={title || label}
      className="inline-flex items-center rounded-full border border-gray-300 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-700"
    >
      {label}
    </span>
  );
}

function SectionHeader({ title, subtitle, action }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h3 className="text-sm font-semibold tracking-wide text-gray-800">{title}</h3>
        {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
      </div>
      {action && <div className="ml-4">{action}</div>}
    </div>
  );
}

function KeyValue({ k, v }) {
  return (
    <div className="grid grid-cols-5 gap-2 text-xs">
      <div className="col-span-2 text-gray-500">{k}</div>
      <div className="col-span-3 font-medium text-gray-800">{v || "—"}</div>
    </div>
  );
}

function TableSkeleton({ columns = [], rows = 5 }) {
  return (
    <div className="overflow-auto rounded-lg border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            {columns.map((c, i) => (
              <th
                key={`skeleton-head-${i}`}
                scope="col"
                className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-600"
              >
                <span className="cursor-default select-none" aria-sort="none" title="Click to sort">
                  {c}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={`skeleton-row-${r}`} className="hover:bg-gray-50">
              {columns.map((_, c) => (
                <td key={`skeleton-cell-${r}-${c}`} className="whitespace-nowrap px-3 py-2 text-xs text-gray-700">
                  <div className="h-3 w-24 rounded bg-gray-100" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AlertBanner({ level = "info", title, body }) {
  const palette = {
    danger: "bg-red-50 border-red-300 text-red-800",
    warning: "bg-amber-50 border-amber-300 text-amber-800",
    info: "bg-blue-50 border-blue-300 text-blue-800",
    success: "bg-green-50 border-green-300 text-green-800",
  };
  const tone = palette[level] || palette.info;
  return (
    <div role="alert" aria-live="assertive" className={`flex items-start gap-3 rounded-lg border px-3 py-2 text-xs ${tone}`}>
      <div className="mt-0.5 h-2 w-2 flex-none rounded-full bg-current" aria-hidden />
      <div>
        <div className="font-semibold">{title}</div>
        {body && <div className="mt-0.5 text-[11px] opacity-90">{body}</div>}
      </div>
    </div>
  );
}

function PatientHeader({ member, priority, gapCount, onAddNote, onOpenAssessments, onRefresh }) {
  const memberName = getMemberName(member) || "Fitzgerald Sample";
  const mrn = member?.member_key ? `MRN ${member.member_key}` : null;
  const dobRaw = member?.date_of_birth || member?.dob;
  const dobFormatted = formatDobWithAge(dobRaw);
  const dobLabel = dobFormatted ? `DOB ${dobFormatted}` : null;
  const genderLabel = member?.gender ? member.gender.toUpperCase().slice(0, 1) : null;

  const chipValues = [mrn, dobLabel, genderLabel].filter(Boolean);
  const planLabel = member?.line_of_business ? `Plan: ${member.line_of_business}` : null;
  const pcpLabel = member?.pcp_name ? `PCP: ${member.pcp_name}` : null;
  const encounterDate =
    member?.last_encounter_date || member?.last_encounter_at || member?.last_encounter?.date;
  const encounterLabel = encounterDate ? `Last encounter: ${formatDate(encounterDate)}` : null;

  const priorityChip = priority?.priority_tier ? `PRIORITY: ${String(priority.priority_tier).toUpperCase()}` : null;
  const gapChip = gapCount ? `GAPS: ${gapCount}` : null;

  return (
    <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="mx-auto grid max-w-[1400px] grid-cols-12 items-center gap-4 px-4 py-2">
        {/* Identity */}
        <div className="col-span-12 lg:col-span-6 flex items-center gap-3">
          <div className="h-10 w-10 flex-none overflow-hidden rounded-full bg-gray-200" aria-hidden />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-base font-semibold text-gray-900">{memberName}</h1>
              {chipValues.map((chip) => (
                <Chip key={chip} label={chip} />
              ))}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-600">
              {planLabel && <span>{planLabel}</span>}
              {planLabel && pcpLabel && <span className="hidden md:inline">•</span>}
              {pcpLabel && <span>{pcpLabel}</span>}
              {(pcpLabel || planLabel) && encounterLabel && <span className="hidden md:inline">•</span>}
              {encounterLabel && <span>{encounterLabel}</span>}
            </div>
          </div>
        </div>
        {/* Alerts */}
        <div className="col-span-12 lg:col-span-4 flex flex-wrap items-center gap-2">
          {priorityChip && <Chip label={priorityChip} />}
          {gapChip && <Chip label={gapChip} />}
        </div>
        {/* Quick actions */}
        <div className="col-span-12 lg:col-span-2 flex justify-end gap-2">
          <button
            type="button"
            onClick={onAddNote}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            aria-label="Document note (N)"
          >
            + Note
          </button>
          <button
            type="button"
            onClick={onOpenAssessments}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            aria-label="Add diagnosis (D)"
          >
            + Dx
          </button>
          <button
            type="button"
            onClick={onRefresh}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            aria-label="Refresh member data"
          >
            Refresh
          </button>
        </div>
      </div>
    </header>
  );
}

function LeftNav() {
  return (
    <nav aria-label="Patient navigation" className="hidden w-60 shrink-0 border-r border-gray-200 bg-white md:block">
      <div className="sticky top-[52px] h-[calc(100vh-52px)] overflow-auto px-3 py-3">
        <div className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">Chart</div>
        <ul className="space-y-1">
          {CHART_NAV_ITEMS.map((label, index) => (
            <li key={label}>
              <button
                type="button"
                className="group flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm hover:bg-gray-50 aria-selected:bg-gray-100 aria-selected:font-semibold"
                aria-selected={index === 0}
              >
                <span className="truncate text-gray-800 group-aria-selected:text-gray-900">{label}</span>
                {index === 1 && <span className="rounded-full bg-gray-200 px-1.5 py-0.5 text-[10px]">3</span>}
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-6 px-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">Utilities</div>
        <ul className="mt-1 space-y-1">
          {UTILITY_NAV_ITEMS.map((label) => (
            <li key={label}>
              <button type="button" className="flex w-full items-center rounded-lg px-2 py-2 text-left text-sm hover:bg-gray-50">
                <span className="truncate text-gray-800">{label}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

function RightRail({ timelineItems, immediateActions = [], submissionState, onGenerateSubmission, submissionResult }) {
  return (
    <aside className="hidden w-80 shrink-0 border-l border-gray-200 bg-white xl:block">
      <div className="sticky top-[52px] h-[calc(100vh-52px)] overflow-auto px-3 py-3">
        <SectionHeader title="Timeline" subtitle="Last 90 days" />
        <ul className="mt-2 space-y-3 text-xs">
          {timelineItems?.length > 0 ? (
            timelineItems.map((item) => (
              <li key={item.id || item.date} className="flex items-start gap-2">
                <div className="mt-1 h-1.5 w-1.5 rounded-full bg-gray-400" />
                <div>
                  <div className="font-medium text-gray-800">{item.date}</div>
                  <div className="text-gray-600">{item.description}</div>
                  {item.detail && <div className="text-[11px] text-gray-500">{item.detail}</div>}
                </div>
              </li>
            ))
          ) : (
            <li className="text-gray-500">No recent encounters available.</li>
          )}
        </ul>

        {immediateActions.length > 0 && (
          <div className="mt-6">
            <SectionHeader title="Immediate Actions" subtitle="From gap analysis" />
            <ul className="mt-2 space-y-2 text-xs text-gray-700">
              {immediateActions.map((action) => (
                <li key={action} className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-gray-400" />
                  <span>{toSentenceCase(action)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-6">
          <SectionHeader title="Sticky Actions" subtitle="Always available" />
          <div className="mt-2 space-y-2">
            <button
              type="button"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
              disabled
            >
              + Add Diagnosis
            </button>
            <button
              type="button"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
              disabled
            >
              + Add Encounter
            </button>
            <button
              type="button"
              onClick={onGenerateSubmission}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-left text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              disabled={!onGenerateSubmission || submissionState === "working"}
            >
              {submissionState === "working" ? "Generating export…" : "Submit to Payer (Preview)"}
            </button>
          </div>
          {submissionResult?.record_count != null && (
            <p className="mt-2 text-[11px] text-gray-500">
              Last export batch {submissionResult.batch_id} · {submissionResult.record_count} record(s)
            </p>
          )}
          <p className="mt-2 text-[11px] text-gray-500">
            Actions confirm with summary before commit. Irreversible steps require typed confirmation.
          </p>
        </div>
      </div>
    </aside>
  );
}

function OverviewPanel(props) {
  const {
    member,
    priority,
    gap,
    gapLoading,
    chases,
    chaseUpdating,
    onAdvanceChase,
    notes,
    noteBody,
    onNoteBodyChange,
    noteStatus,
    onSubmitNote,
    assessments,
    assessmentDate,
    onAssessmentDateChange,
    assessmentNotes,
    onAssessmentNotesChange,
    assessmentIcd,
    onAssessmentIcdChange,
    assessmentStatus,
    onCreateAssessment,
    claims,
    maoRecords,
    errorMessage,
    isLoading,
  } = props;

  const missingHcc = gap?.missing_hcc || [];
  const suspectRows = missingHcc.slice(0, 6);
  const claimRows = (claims || []).slice(0, 4);
  const chaseRows = (chases || []).slice(0, 6);
  const noteRows = (notes || []).slice(0, 5);
  const assessmentRows = (assessments || []).slice(0, 4);
  const maoRows = (maoRecords || []).slice(0, 3);

  const riskScore = typeof member?.risk_score === "number" ? member.risk_score : null;
  const hccOpportunityCount = priority?.hcc_opportunity_count || 0;
  const proposedAdds = hccOpportunityCount * 0.12;
  const projectedRaf = riskScore != null ? riskScore + proposedAdds : null;

  const alerts = [];
  if (priority?.next_action) {
    alerts.push({
      level: "warning",
      title: `Next action: ${toSentenceCase(priority.next_action)}`,
      body: priority?.next_action_due ? `Due ${formatDate(priority.next_action_due)}` : undefined,
    });
  }
  (gap?.immediate_actions || []).forEach((action) => {
    alerts.push({
      level: "info",
      title: toSentenceCase(action),
      body: "Flagged by gap analysis.",
    });
  });
  if (priority?.priority_tier === "high") {
    alerts.push({
      level: "danger",
      title: "High priority member",
      body: "Address outstanding conditions before end of cycle.",
    });
  }

  const snapshotItems = [
    { label: "Status", value: toSentenceCase(member?.status) },
    { label: "Line of Business", value: member?.line_of_business || "—" },
    { label: "PCP", value: member?.pcp_name || "—" },
    { label: "Risk Score", value: riskScore != null ? riskScore.toFixed(2) : "—" },
    { label: "Priority Score", value: priority?.priority_score != null ? priority.priority_score.toFixed(1) : "—" },
    {
      label: "Next Action",
      value: priority?.next_action
        ? `${toSentenceCase(priority.next_action)}${priority?.next_action_due ? ` · ${formatDate(priority.next_action_due)}` : ""}`
        : "—",
    },
  ];

  return (
    <div className="space-y-4">
      {errorMessage && <AlertBanner level="danger" title="We could not update some data" body={errorMessage} />}

      {gapLoading && (
        <AlertBanner level="info" title="Refreshing care gaps" body="Fetching the most recent gap analysis for this member." />
      )}

      <div className="grid grid-cols-12 gap-4">
        {/* LEFT column */}
        <div className="col-span-12 space-y-4 lg:col-span-8">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <SectionHeader
              title="Patient Snapshot"
              subtitle="Key facts and trends"
              action={
                <button type="button" className="text-xs underline decoration-dotted" disabled>
                  Customize
                </button>
              }
            />
            <div className="mt-3 grid grid-cols-2 gap-6 md:grid-cols-3">
              {snapshotItems.map((item) => (
                <KeyValue key={item.label} k={item.label} v={item.value} />
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <SectionHeader
              title="HCC Suspect List"
              subtitle="Machine-suggested conditions for review"
              action={
                <div className="flex items-center gap-2">
                  <input
                    aria-label="Search HCCs"
                    placeholder="Search…"
                    className="w-40 rounded border border-gray-300 px-2 py-1 text-xs"
                    type="search"
                    disabled
                  />
                  <button type="button" className="rounded border border-gray-300 px-2 py-1 text-xs" disabled>
                    Export
                  </button>
                </div>
              }
            />
            <div className="mt-3">
              {isLoading ? (
                <TableSkeleton columns={["HCC", "Reason", "ICD-10 Candidates", "Action"]} rows={4} />
              ) : suspectRows.length > 0 ? (
                <div className="overflow-auto rounded-lg border border-gray-200">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                      <tr>
                        <th className="px-3 py-2">HCC</th>
                        <th className="px-3 py-2">Reason</th>
                        <th className="px-3 py-2">ICD-10 Candidates</th>
                        <th className="px-3 py-2">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white text-xs text-gray-700">
                      {suspectRows.map((row, index) => (
                        <tr key={row.hcc_code || index} className="hover:bg-gray-50">
                          <td className="px-3 py-2 font-medium text-gray-900">{row.hcc_code || "—"}</td>
                          <td className="px-3 py-2">{row.reason || "Opportunity detected"}</td>
                          <td className="px-3 py-2">{(row.icd10_candidates || []).join(", ") || "—"}</td>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              className="rounded border border-gray-300 px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50"
                              disabled
                            >
                              Review
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center text-xs text-gray-600">
                  Great work! No outstanding HCC opportunities detected.
                </div>
              )}
              <div className="mt-2 text-[11px] text-gray-500">
                Tip: Select a row to open side-by-side evidence review without losing context.
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <SectionHeader
              title="Recent Encounters"
              subtitle="Past 12 months"
              action={
                <button type="button" className="text-xs underline decoration-dotted" disabled>
                  View timeline
                </button>
              }
            />
            <div className="mt-3">
              {isLoading ? (
                <TableSkeleton columns={["Date", "Type", "Location", "Paid", "Dx (summary)"]} rows={4} />
              ) : claimRows.length > 0 ? (
                <div className="overflow-auto rounded-lg border border-gray-200">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                      <tr>
                        <th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2">Type</th>
                        <th className="px-3 py-2">Location</th>
                        <th className="px-3 py-2">Paid</th>
                        <th className="px-3 py-2">Dx (summary)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white text-xs text-gray-700">
                      {claimRows.map((claim) => {
                        const diagnoses = extractIcdCodes(claim);
                        return (
                          <tr key={claim.id || claim.claim_number} className="hover:bg-gray-50">
                            <td className="px-3 py-2 font-medium text-gray-900">
                              {formatDate(claim.service_date || claim.service_start)}
                            </td>
                            <td className="px-3 py-2">{toSentenceCase(claim.claim_type || "Encounter")}</td>
                            <td className="px-3 py-2">{claim.place_of_service || claim.provider_name || "—"}</td>
                            <td className="px-3 py-2">{formatCurrency(claim.total_paid)}</td>
                            <td className="px-3 py-2">{diagnoses.length ? diagnoses.join(", ") : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center text-xs text-gray-600">
                  No encounter claims recorded for the selected period.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT column */}
        <aside className="col-span-12 space-y-4 lg:col-span-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <SectionHeader title="RAF Calculator" subtitle="Preview impact before submit" />
            <div className="mt-3 space-y-2 text-xs">
              <KeyValue k="Base RAF" v={<span>{riskScore != null ? riskScore.toFixed(2) : "—"}</span>} />
              <KeyValue k="HCC Adds (proposed)" v={<span>{proposedAdds ? `+${proposedAdds.toFixed(2)}` : "+0.00"}</span>} />
              <KeyValue k="Opportunities" v={<span>{hccOpportunityCount || 0}</span>} />
              <div className="mt-2 rounded-lg bg-gray-50 p-2 text-center text-sm font-semibold">
                Projected RAF: {projectedRaf != null ? projectedRaf.toFixed(2) : "—"}
              </div>
              <button
                className="mt-2 w-full rounded-lg border border-gray-300 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                type="button"
                disabled
              >
                Open Dx picker
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <SectionHeader title="Care Gaps" subtitle="Quality & risk" />
            <ul className="mt-2 space-y-2 text-xs">
              {missingHcc.slice(0, 3).map((gapItem) => (
                <li key={gapItem.hcc_code} className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-gray-400" />
                  <div className="flex-1">
                    <div className="font-medium text-gray-800">{gapItem.hcc_code}</div>
                    <div className="text-[11px] text-gray-500">{gapItem.reason || "Review supporting documentation."}</div>
                  </div>
                  <button type="button" className="rounded border border-gray-300 px-2 py-0.5 text-[11px] text-gray-700 hover:bg-gray-50" disabled>
                    Add
                  </button>
                </li>
              ))}
              {missingHcc.length === 0 && (
                <li className="text-[11px] text-gray-500">No open care gaps tracked for this member.</li>
              )}
            </ul>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <SectionHeader title="Clinical Alerts" subtitle="Sorted by severity" />
            <div className="mt-3 space-y-2">
              {alerts.length > 0 ? (
                alerts.map((alert, index) => (
                  <AlertBanner key={`${alert.title}-${index}`} level={alert.level} title={alert.title} body={alert.body} />
                ))
              ) : (
                <AlertBanner level="success" title="No blocking alerts" body="All high-severity items cleared for this member." />
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* Additional panels */}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 xl:col-span-7">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <SectionHeader title="Chase Worklist" subtitle="Assigned coding chases" />
            <div className="mt-3">
              {isLoading ? (
                <TableSkeleton columns={["Chase", "Status", "HCC", "Coder", "Action"]} rows={4} />
              ) : chaseRows.length > 0 ? (
                <div className="overflow-auto rounded-lg border border-gray-200">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                      <tr>
                        <th className="px-3 py-2">Chase</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2">HCC</th>
                        <th className="px-3 py-2">Assigned</th>
                        <th className="px-3 py-2">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white text-xs text-gray-700">
                      {chaseRows.map((chase) => {
                        const nextStatusValue = nextChaseStatus(chase.status);
                        return (
                          <tr key={chase.id} className="hover:bg-gray-50">
                            <td className="px-3 py-2 font-medium text-gray-900">{chase.id}</td>
                            <td className="px-3 py-2">{toSentenceCase(chase.status)}</td>
                            <td className="px-3 py-2">{extractHccCode(chase)}</td>
                            <td className="px-3 py-2">{chase.assigned_coder_email || "Unassigned"}</td>
                            <td className="px-3 py-2">
                              <button
                                type="button"
                                onClick={() => onAdvanceChase(chase)}
                                className="rounded border border-gray-300 px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                                disabled={!onAdvanceChase || chaseUpdating === chase.id}
                              >
                                {chaseUpdating === chase.id ? "Updating…" : `Mark ${toSentenceCase(nextStatusValue)}`}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center text-xs text-gray-600">
                  No active chases for this member.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="col-span-12 space-y-4 xl:col-span-5">
          <div id="notes-panel" className="rounded-xl border border-gray-200 bg-white p-4">
            <SectionHeader title="Notes & Collaboration" subtitle="Share coder insights" />
            <form className="mt-3 space-y-2" onSubmit={onSubmitNote}>
              <label className="block text-xs font-medium text-gray-700">
                Add note
                <textarea
                  value={noteBody}
                  onChange={(event) => onNoteBodyChange(event.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-xs text-gray-800 focus:border-gray-500 focus:outline-none"
                  placeholder="Document findings, outreach, or next steps…"
                />
              </label>
              <div className="flex items-center justify-between text-[11px] text-gray-500">
                {noteStatus === "error" && <span className="text-red-600">Unable to save note. Try again.</span>}
                <button
                  type="submit"
                  className="rounded border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                  disabled={!noteBody.trim() || noteStatus === "saving"}
                >
                  {noteStatus === "saving" ? "Saving…" : "Save note"}
                </button>
              </div>
            </form>
            <ul className="mt-4 space-y-2 text-xs">
              {noteRows.length > 0 ? (
                noteRows.map((note) => (
                  <li key={note.id} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                    <div className="flex items-center justify-between text-[11px] text-gray-500">
                      <span>{note.author_name || note.author_email || "Unknown author"}</span>
                      <time dateTime={note.created_at}>{formatDateTime(note.created_at)}</time>
                    </div>
                    <p className="mt-1 text-gray-700">{note.body}</p>
                  </li>
                ))
              ) : (
                <li className="text-[11px] text-gray-500">No notes yet. Capture the next action above.</li>
              )}
            </ul>
          </div>

          <div id="assessments-panel" className="rounded-xl border border-gray-200 bg-white p-4">
            <SectionHeader title="Assessments & Submissions" subtitle="Track supporting documentation" />
            <ul className="mt-3 space-y-2 text-xs">
              {assessmentRows.length > 0 ? (
                assessmentRows.map((assessment) => (
                  <li key={assessment.id} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                    <div className="flex items-center justify-between text-[11px] text-gray-500">
                      <span>{toSentenceCase(assessment.assessment_type || "Assessment")}</span>
                      <span>{formatDate(assessment.assessment_date)}</span>
                    </div>
                    <div className="mt-1 text-gray-700">ICD-10: {(assessment.icd10_codes || []).join(", ") || "—"}</div>
                    {assessment.notes && <div className="mt-1 text-gray-600">{assessment.notes}</div>}
                  </li>
                ))
              ) : (
                <li className="text-[11px] text-gray-500">No health assessments recorded.</li>
              )}
            </ul>
            <form className="mt-4 space-y-2 text-xs" onSubmit={onCreateAssessment}>
              <div>
                <label className="block font-medium text-gray-700">
                  Assessment date
                  <input
                    type="date"
                    value={assessmentDate}
                    onChange={(event) => onAssessmentDateChange(event.target.value)}
                    className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-xs text-gray-800 focus:border-gray-500 focus:outline-none"
                  />
                </label>
              </div>
              <div>
                <label className="block font-medium text-gray-700">
                  ICD-10 codes
                  <input
                    type="text"
                    value={assessmentIcd}
                    onChange={(event) => onAssessmentIcdChange(event.target.value)}
                    placeholder="E11.9, J44.9"
                    className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-xs text-gray-800 focus:border-gray-500 focus:outline-none"
                  />
                </label>
              </div>
              <div>
                <label className="block font-medium text-gray-700">
                  Notes
                  <textarea
                    value={assessmentNotes}
                    onChange={(event) => onAssessmentNotesChange(event.target.value)}
                    rows={2}
                    className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-xs text-gray-800 focus:border-gray-500 focus:outline-none"
                    placeholder="Optional context for the assessment…"
                  />
                </label>
              </div>
              <div className="flex items-center justify-between text-[11px] text-gray-500">
                {assessmentStatus === "error" && <span className="text-red-600">Unable to record assessment.</span>}
                <button
                  type="submit"
                  className="rounded border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                  disabled={assessmentStatus === "saving"}
                >
                  {assessmentStatus === "saving" ? "Saving…" : "Record assessment"}
                </button>
              </div>
            </form>

            {maoRows.length > 0 && (
              <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-[11px] text-gray-600">
                <div className="font-semibold text-gray-700">Recent MAO records</div>
                <ul className="mt-1 space-y-1">
                  {maoRows.map((record) => (
                    <li key={record.id}>
                      {record.hcc_code} · {record.icd10_code} ({formatDate(record.service_start)} - {formatDate(record.service_end)}) · {toSentenceCase(record.status)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CodingMemberDetailPage() {
  const params = useParams();
  const memberId = params?.memberId;
  const auth = useContext(AuthContext) || {};
  const { token, tenant, isAuthenticated } = auth;
  const canQuery = useMemo(() => Boolean(token && tenant && memberId), [token, tenant, memberId]);

  const [detail, setDetail] = useState(null);
  const [gap, setGap] = useState(null);
  const [loading, setLoading] = useState(false);
  const [gapLoading, setGapLoading] = useState(false);
  const [error, setError] = useState(null);
  const [noteBody, setNoteBody] = useState("");
  const [noteStatus, setNoteStatus] = useState("idle");
  const [chaseUpdating, setChaseUpdating] = useState(null);
  const [assessmentDate, setAssessmentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [assessmentNotes, setAssessmentNotes] = useState("");
  const [assessmentIcd, setAssessmentIcd] = useState("");
  const [assessmentStatus, setAssessmentStatus] = useState("idle");
  const [submissionState, setSubmissionState] = useState("idle");
  const [submissionResult, setSubmissionResult] = useState(null);

  const loadDetail = useCallback(async () => {
    if (!canQuery) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetchCodingMemberDetail(token, tenant, memberId);
      setDetail(response);
    } catch (err) {
      setError(err.message || "Unable to retrieve member details.");
    } finally {
      setLoading(false);
    }
  }, [canQuery, token, tenant, memberId]);

  const loadGapAnalysis = useCallback(async () => {
    if (!canQuery) return;
    setGapLoading(true);
    try {
      const response = await fetchMemberGapAnalysis(token, tenant, memberId);
      setGap(response);
    } catch (err) {
      setError((prev) => prev || err.message || "Unable to load gap analysis.");
    } finally {
      setGapLoading(false);
    }
  }, [canQuery, token, tenant, memberId]);

  useEffect(() => {
    if (!canQuery) return;
    loadDetail();
  }, [canQuery, loadDetail]);

  useEffect(() => {
    if (!canQuery) return;
    loadGapAnalysis();
  }, [canQuery, loadGapAnalysis]);

  const handleAdvanceChase = async (chase) => {
    if (!chase?.id || !token || !tenant) return;
    try {
      setChaseUpdating(chase.id);
      const nextStatusValue = nextChaseStatus(chase.status);
      const updated = await updateCodingChase(token, tenant, chase.id, { status: nextStatusValue });
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              chases: (prev.chases || []).map((item) => (item.id === updated.id ? updated : item)),
            }
          : prev,
      );
    } catch (err) {
      setError(err.message || "Unable to update chase.");
    } finally {
      setChaseUpdating(null);
    }
  };

  const handleAddNote = async (event) => {
    event.preventDefault();
    if (!noteBody.trim() || !token || !tenant) return;
    try {
      setNoteStatus("saving");
      const created = await createCodingNote(token, tenant, memberId, { body: noteBody.trim() });
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              notes: [created, ...(prev.notes || [])],
            }
          : prev,
      );
      setNoteBody("");
      setNoteStatus("idle");
    } catch (err) {
      setNoteStatus("error");
      setError(err.message || "Unable to save note.");
    }
  };

  const handleCreateAssessment = async (event) => {
    event.preventDefault();
    if (!token || !tenant) return;
    if (!assessmentDate) return;
    try {
      setAssessmentStatus("saving");
      const payload = {
        assessment_date: assessmentDate,
        assessment_type: "initial",
        icd10_codes: assessmentIcd
          .split(",")
          .map((code) => code.trim())
          .filter(Boolean),
        notes: assessmentNotes || undefined,
      };
      const created = await createHealthAssessment(token, tenant, memberId, payload);
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              health_assessments: [created, ...(prev.health_assessments || [])],
            }
          : prev,
      );
      setAssessmentStatus("idle");
      setAssessmentNotes("");
      setAssessmentIcd("");
    } catch (err) {
      setAssessmentStatus("error");
      setError(err.message || "Unable to record assessment.");
    }
  };

  const handleGenerateSubmission = async () => {
    if (!token || !tenant) return;
    try {
      setSubmissionState("working");
      const submissionYear = new Date().getFullYear();
      const result = await generateSubmissionExport(token, tenant, submissionYear, [memberId]);
      setSubmissionResult(result);
      setSubmissionState("done");
    } catch (err) {
      setSubmissionState("error");
      setError(err.message || "Unable to generate submission export.");
    }
  };

  const handleRefresh = () => {
    loadDetail();
    loadGapAnalysis();
  };

  const focusElementById = (id) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      el.classList.add("ring-2", "ring-blue-200");
      window.setTimeout(() => {
        el.classList.remove("ring-2", "ring-blue-200");
      }, 1200);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-100 px-6 py-16 text-center text-sm text-gray-700">
        You must be signed in to view member details.
      </div>
    );
  }

  if (!memberId) {
    return (
      <div className="min-h-screen bg-gray-100 px-6 py-16 text-center text-sm text-gray-700">
        Missing member identifier in route.
      </div>
    );
  }

  if (!detail && !loading && error) {
    return (
      <div className="min-h-screen bg-gray-100 px-6 py-16 text-center text-sm text-red-600">
        {error}
      </div>
    );
  }

  const member = detail?.member;
  const priority = detail?.priority || gap?.priority;
  const chases = detail?.chases || [];
  const notes = detail?.notes || [];
  const claims = detail?.claims || [];
  const assessments = detail?.health_assessments || [];
  const maoRecords = detail?.mao_records || gap?.mao_records || [];
  const missingHcc = gap?.missing_hcc || [];
  const timelineItems = deriveTimelineFromClaims(claims);
  const memberName = getMemberName(member);
  const breadcrumbName = memberName || memberId || "Member";
  const overviewError = detail ? error : null;
  const isLoading = loading && !detail;

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900">
      {/* Sticky patient header */}
      <PatientHeader
        member={member}
        priority={priority}
        gapCount={missingHcc.length}
        onAddNote={() => focusElementById("notes-panel")}
        onOpenAssessments={() => focusElementById("assessments-panel")}
        onRefresh={handleRefresh}
      />

      {/* Global toolbar */}
      <div className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-2">
          <input
            aria-label="Search patients, problems, orders"
            placeholder="Search patients, problems, orders…"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            type="search"
          />
          {/* Visual parity: 'Advanced' button (header already has Refresh) */}
          <button
            type="button"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
            onClick={() => {}}
          >
            Advanced
          </button>
          <div className="ml-auto flex items-center gap-2 text-xs text-gray-600">
            <span title="Connection status" className="inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" /> Synced
            </span>
            <span>•</span>
            <span>Autosave: On</span>
          </div>
        </div>
      </div>

      {/* Main layout */}
      <div className="mx-auto flex max-w-[1400px] gap-0 px-0">
        <LeftNav />

        <main id="content" className="flex-1 px-4 py-4">
          <nav aria-label="Breadcrumb" className="mb-2 text-xs text-gray-600">
            Home / Patients / {breadcrumbName} / <span className="font-medium text-gray-800">Overview</span>
          </nav>

          <OverviewPanel
            member={member}
            priority={priority}
            gap={gap}
            gapLoading={gapLoading}
            chases={chases}
            chaseUpdating={chaseUpdating}
            onAdvanceChase={handleAdvanceChase}
            notes={notes}
            noteBody={noteBody}
            onNoteBodyChange={setNoteBody}
            noteStatus={noteStatus}
            onSubmitNote={handleAddNote}
            assessments={assessments}
            assessmentDate={assessmentDate}
            onAssessmentDateChange={setAssessmentDate}
            assessmentNotes={assessmentNotes}
            onAssessmentNotesChange={setAssessmentNotes}
            assessmentIcd={assessmentIcd}
            onAssessmentIcdChange={setAssessmentIcd}
            assessmentStatus={assessmentStatus}
            onCreateAssessment={handleCreateAssessment}
            claims={claims}
            maoRecords={maoRecords}
            errorMessage={overviewError}
            isLoading={isLoading}
          />
        </main>

        <RightRail
          timelineItems={timelineItems}
          immediateActions={gap?.immediate_actions}
          submissionState={submissionState}
          onGenerateSubmission={handleGenerateSubmission}
          submissionResult={submissionResult}
        />
      </div>

      {/* Footer help strip */}
      <footer className="sticky bottom-0 z-30 border-t border-gray-200 bg-white/95 px-4 py-2 text-[11px] text-gray-600 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline">Shortcuts:</span>
            <kbd className="rounded border bg-gray-50 px-1">N</kbd> Note
            <kbd className="rounded border bg-gray-50 px-1">D</kbd> Diagnosis
            <kbd className="rounded border bg-gray-50 px-1">/</kbd> Search
          </div>
          <div className="flex items-center gap-4">
            <button
              type="button"
              className="rounded border border-gray-300 px-2 py-1 text-gray-700 hover:bg-gray-50"
              onClick={() => window.open("https://docs.nexora.health", "_blank")}
            >
              Help
            </button>
            <span className="text-gray-400">v0.1 Wireframe</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
