import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useParams, useNavigate, useLocation } from "react-router-dom";
import { AuthContext } from "../../../../context/AuthContext";
import { Chip, SectionHeader } from "../../../../components/ehr/Primitives";

import {
  fetchCodingMemberDetail,
  fetchMemberGapAnalysis,
  generateSubmissionExport,
} from "../../../../services/codingService";

const CHART = [
  { label: "Overview", to: "" },
  { label: "Problems / HCC", to: "problems" },
  { label: "Medications", to: "medications" },
  { label: "Encounters", to: "encounters" },
  { label: "Labs & Imaging", to: "labs-imaging" },
  { label: "Notes", to: "notes" },
  { label: "Care Gaps", to: "care-gaps" },
  { label: "Tasks & Messages", to: "tasks-messages" },
  { label: "Eligibility & Coverage", to: "eligibility-coverage" },
  { label: "Documents", to: "documents" },
];

const UTIL = [
  { label: "Audit Log", to: "audit-log" },
  { label: "Sharing", to: "sharing" },
  { label: "Settings", to: "settings" },
];

const formatDate = (v) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString();
};
const getMemberName = (m) => (m ? [m.first_name, m.last_name].filter(Boolean).join(" ") || m.member_key : "Member");

function PatientHeader({ member, gapCount = 0, onRefresh }) {
  const name = getMemberName(member);
  const mrn = member?.member_key ? `MRN ${member.member_key}` : null;
  const chips = [mrn, member?.gender?.slice(0, 1)?.toUpperCase()].filter(Boolean);

  return (
    <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/95 backdrop-blur">
      <div className="mx-auto grid max-w-[1400px] grid-cols-12 items-center gap-4 px-4 py-2">
        <div className="col-span-12 lg:col-span-6 flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-gray-200" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-base font-semibold text-gray-900">{name}</h1>
              {chips.map((c) => (
                <Chip key={c} label={c} />
              ))}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-600">
              {member?.line_of_business && <span>Plan: {member.line_of_business}</span>}
              {member?.pcp_name && <span className="hidden md:inline">•</span>}
              {member?.pcp_name && <span>PCP: {member.pcp_name}</span>}
              {member?.last_encounter_date && <span className="hidden md:inline">•</span>}
              {member?.last_encounter_date && <span>Last: {formatDate(member.last_encounter_date)}</span>}
            </div>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-4 flex flex-wrap items-center gap-2">
          <Chip label={`GAPS: ${gapCount}`} />
        </div>

        <div className="col-span-12 lg:col-span-2 flex justify-end gap-2">
          <button
            onClick={onRefresh}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Refresh
          </button>
        </div>
      </div>
    </header>
  );
}

function LeftNav() {
  const linkBase =
    "group flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm hover:bg-gray-50";
  const selected = "bg-gray-100 font-semibold";

  return (
    <nav aria-label="Patient navigation" className="hidden w-60 shrink-0 border-r border-gray-200 bg-white md:block">
      <div className="sticky top-[52px] h-[calc(100vh-52px)] overflow-auto px-3 py-3">
        <div className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">Chart</div>
        <ul className="space-y-1">
          {CHART.map(({ label, to }) => (
            <li key={label}>
              <NavLink end to={to} className={({ isActive }) => `${linkBase} ${isActive ? selected : ""}`}>
                <span className="truncate text-gray-800 group-aria-selected:text-gray-900">{label}</span>
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="mt-6 px-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">Utilities</div>
        <ul className="mt-1 space-y-1">
          {UTIL.map(({ label, to }) => (
            <li key={label}>
              <NavLink to={to} className={({ isActive }) => `${linkBase} ${isActive ? selected : ""}`}>
                <span className="truncate text-gray-800">{label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

function RightRail({ submissionState, onGenerateSubmission, submissionResult, timelineItems = [] }) {
  return (
    <aside className="hidden w-80 shrink-0 border-l border-gray-200 bg-white xl:block">
      <div className="sticky top-[52px] h-[calc(100vh-52px)] overflow-auto px-3 py-3">
        <SectionHeader title="Timeline" subtitle="Last 90 days" />
        <ul className="mt-2 space-y-3 text-xs">
          {timelineItems.length ? (
            timelineItems.map((it) => (
              <li key={it.id || it.date} className="flex items-start gap-2">
                <div className="mt-1 h-1.5 w-1.5 rounded-full bg-gray-400" />
                <div>
                  <div className="font-medium text-gray-800">{it.date}</div>
                  <div className="text-gray-600">{it.description}</div>
                  {it.detail && <div className="text-[11px] text-gray-500">{it.detail}</div>}
                </div>
              </li>
            ))
          ) : (
            <li className="text-gray-500">No recent encounters available.</li>
          )}
        </ul>

        <div className="mt-6">
          <SectionHeader title="Sticky Actions" subtitle="Always available" />
          <div className="mt-2 space-y-2">
            <button className="w-full rounded-lg border border-gray-300 px-3 py-2 text-left text-sm text-gray-700" disabled>
              + Add Diagnosis
            </button>
            <button className="w-full rounded-lg border border-gray-300 px-3 py-2 text-left text-sm text-gray-700" disabled>
              + Add Encounter
            </button>
            <button
              onClick={onGenerateSubmission}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-left text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              disabled={submissionState === "working"}
            >
              {submissionState === "working" ? "Generating export…" : "Submit to Payer (Preview)"}
            </button>
          </div>
          {submissionResult?.record_count != null && (
            <p className="mt-2 text-[11px] text-gray-500">
              Last export batch {submissionResult.batch_id} · {submissionResult.record_count} record(s)
            </p>
          )}
        </div>
      </div>
    </aside>
  );
}

export default function CodingMemberLayout() {
  const { memberId } = useParams();
  const { token, tenant, isAuthenticated } = useContext(AuthContext) || {};
  const canQuery = useMemo(() => Boolean(token && tenant && memberId), [token, tenant, memberId]);

  const [detail, setDetail] = useState(null);
  const [gap, setGap] = useState(null);
  const [loading, setLoading] = useState(false);
  const [gapLoading, setGapLoading] = useState(false);
  const [submissionState, setSubmissionState] = useState("idle");
  const [submissionResult, setSubmissionResult] = useState(null);

  const loadDetail = useCallback(async () => {
    if (!canQuery) return;
    setLoading(true);
    try {
      const resp = await fetchCodingMemberDetail(token, tenant, memberId);
      setDetail(resp);
    } finally {
      setLoading(false);
    }
  }, [canQuery, token, tenant, memberId]);

  const loadGap = useCallback(async () => {
    if (!canQuery) return;
    setGapLoading(true);
    try {
      const resp = await fetchMemberGapAnalysis(token, tenant, memberId);
      setGap(resp);
    } finally {
      setGapLoading(false);
    }
  }, [canQuery, token, tenant, memberId]);

  useEffect(() => {
    if (!canQuery) return;
    loadDetail();
    loadGap();
  }, [canQuery, loadDetail, loadGap]);

  const onRefresh = () => {
    loadDetail();
    loadGap();
  };

  const onGenerateSubmission = async () => {
    if (!token || !tenant) return;
    try {
      setSubmissionState("working");
      const year = new Date().getFullYear();
      const r = await generateSubmissionExport(token, tenant, year, [memberId]);
      setSubmissionResult(r);
      setSubmissionState("done");
    } catch {
      setSubmissionState("error");
    }
  };

  if (!isAuthenticated) {
    return <div className="min-h-screen grid place-items-center text-sm text-gray-700">Sign in required.</div>;
  }

  const member = detail?.member;
  const missingHcc = gap?.missing_hcc || [];
  const timelineItems = (detail?.claims || [])
    .filter(Boolean)
    .sort((a, b) => new Date(b.service_date || b.service_start) - new Date(a.service_date || a.service_start))
    .slice(0, 5)
    .map((c) => ({
      id: c.id || c.claim_number,
      date: formatDate(c.service_date || c.service_start || c.service_end),
      description: (c.claim_type || "Encounter").replace(/\b\w/g, (m) => m.toUpperCase()),
      detail: c.provider_name || c.place_of_service,
    }));

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900">
      <PatientHeader member={member} gapCount={missingHcc.length} onRefresh={onRefresh} />

      {/* Global toolbar */}
      <div className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-2">
          <input className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Search…" />
          <button className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50">Advanced</button>
          <div className="ml-auto text-xs text-gray-600 hidden sm:flex items-center gap-2">
            <span className="inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" /> Synced
            </span>
            <span>•</span>
            <span>Autosave: On</span>
          </div>
        </div>
      </div>

      <div className="mx-auto flex max-w-[1400px] gap-0">
        <LeftNav />
        <main className="flex-1 px-4 py-4">
          <Outlet context={{ detail, gap, loading, gapLoading }} />
        </main>
        <RightRail
          submissionState={submissionState}
          onGenerateSubmission={onGenerateSubmission}
          submissionResult={submissionResult}
          timelineItems={timelineItems}
        />
      </div>

      <footer className="sticky bottom-0 z-30 border-t border-gray-200 bg-white/95 px-4 py-2 text-[11px] text-gray-600 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between">
          <div className="hidden sm:flex items-center gap-3">
            <kbd className="rounded border bg-gray-50 px-1">N</kbd> Note
            <kbd className="rounded border bg-gray-50 px-1">D</kbd> Diagnosis
            <kbd className="rounded border bg-gray-50 px-1">/</kbd> Search
          </div>
          <span className="text-gray-400">v0.1 Wireframe</span>
        </div>
      </footer>
    </div>
  );
}
