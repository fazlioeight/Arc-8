import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useParams } from "react-router-dom";
import { AuthContext } from "../../../../../context/AuthContext";
import { Chip, SectionHeader } from "../../../../../components/ehr/Primitives";
import "../memberWorkspace.css";

import {
  fetchCodingMemberDetail,
  fetchMemberGapAnalysis,
  generateSubmissionExport,
} from "../../../../../services/codingService";

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

const formatDate = (value) => {
  if (!value) return "N/A";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleDateString();
};

const getMemberName = (member) =>
  member ? [member.first_name, member.last_name].filter(Boolean).join(" ") || member.member_key : "Member";

function PatientHeader({ member, gapCount = 0, onRefresh }) {
  const name = getMemberName(member);
  const mrn = member?.member_key ? `MRN ${member.member_key}` : null;
  const chips = [mrn, member?.gender?.slice(0, 1)?.toUpperCase()].filter(Boolean);

  return (
    <header className="coding-member-header sticky top-0 z-40 backdrop-blur">
      <div className="mx-auto grid max-w-[1400px] grid-cols-12 items-center gap-4 px-4 py-2">
        <div className="col-span-12 flex items-center gap-3 lg:col-span-6">
          <div className="h-10 w-10 rounded-full border-0 coding-surface-subtle" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="coding-text-strong text-base font-semibold">{name}</h1>
              {chips.map((chip) => (
                <Chip key={chip} label={chip} />
              ))}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs coding-text-muted">
              {member?.line_of_business && <span>Plan: {member.line_of_business}</span>}
              {member?.pcp_name && <span className="hidden md:inline">{"\u2022"}</span>}
              {member?.pcp_name && <span>PCP: {member.pcp_name}</span>}
              {member?.last_encounter_date && <span className="hidden md:inline">{"\u2022"}</span>}
              {member?.last_encounter_date && <span>Last: {formatDate(member.last_encounter_date)}</span>}
            </div>
          </div>
        </div>

        <div className="col-span-12 flex flex-wrap items-center gap-2 lg:col-span-4">
          <Chip label={`GAPS: ${gapCount}`} />
        </div>

        <div className="col-span-12 flex justify-end gap-2 lg:col-span-2">
          <button onClick={onRefresh} className="coding-ghost-button rounded-lg px-3 py-1.5 text-xs font-medium">
            Refresh
          </button>
        </div>
      </div>
    </header>
  );
}

function LeftNav() {
  const linkBase =
    "coding-nav-link flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm";
  const buildClass = ({ isActive }) => `${linkBase}${isActive ? " coding-nav-link--active font-semibold" : ""}`;

  return (
    <nav aria-label="Patient navigation" className="coding-sidebar hidden w-60 shrink-0 md:block">
      <div className="sticky top-[52px] h-[calc(100vh-52px)] overflow-auto px-3 py-3">
        <div className="coding-sidebar__heading mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider">
          Chart
        </div>
        <ul className="space-y-1">
          {CHART.map(({ label, to }) => (
            <li key={label}>
              <NavLink end to={to} className={buildClass}>
                <span className="truncate">{label}</span>
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="coding-sidebar__heading mt-6 px-2 text-[11px] font-semibold uppercase tracking-wider">
          Utilities
        </div>
        <ul className="mt-1 space-y-1">
          {UTIL.map(({ label, to }) => (
            <li key={label}>
              <NavLink to={to} className={buildClass}>
                <span className="truncate">{label}</span>
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
    <aside className="coding-right-rail hidden w-80 shrink-0 xl:block">
      <div className="sticky top-[52px] h-[calc(100vh-52px)] overflow-auto px-3 py-3">
        <SectionHeader title="Timeline" subtitle="Last 90 days" />
        <ul className="mt-2 space-y-3 text-xs">
          {timelineItems.length ? (
            timelineItems.map((item) => (
              <li key={item.id || item.date} className="flex items-start gap-2">
                <div className="coding-timeline-dot" />
                <div>
                  <div className="coding-text-strong font-medium">{item.date}</div>
                  <div className="coding-text-soft">{item.description}</div>
                  {item.detail && <div className="coding-text-muted text-[11px]">{item.detail}</div>}
                </div>
              </li>
            ))
          ) : (
            <li className="coding-text-muted">No recent encounters available.</li>
          )}
        </ul>

        <div className="mt-6">
          <SectionHeader title="Sticky Actions" subtitle="Always available" />
          <div className="mt-2 space-y-2">
            <button className="coding-ghost-button w-full rounded-lg px-3 py-2 text-left text-sm" disabled>
              + Add Diagnosis
            </button>
            <button className="coding-ghost-button w-full rounded-lg px-3 py-2 text-left text-sm" disabled>
              + Add Encounter
            </button>
            <button
              onClick={onGenerateSubmission}
              className="coding-ghost-button w-full rounded-lg px-3 py-2 text-left text-sm font-semibold disabled:opacity-60"
              disabled={submissionState === "working"}
            >
              {submissionState === "working" ? "Generating export..." : "Submit to Payer (Preview)"}
            </button>
          </div>
          {submissionResult?.record_count != null && (
            <p className="coding-text-muted mt-2 text-[11px]">
              Last export batch {submissionResult.batch_id} {"\u2022"} {submissionResult.record_count} record(s)
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
      const response = await generateSubmissionExport(token, tenant, year, [memberId]);
      setSubmissionResult(response);
      setSubmissionState("done");
    } catch {
      setSubmissionState("error");
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="coding-member-workspace min-h-screen grid place-items-center text-sm coding-text-soft">
        Sign in required.
      </div>
    );
  }

  const member = detail?.member;
  const missingHcc = gap?.missing_hcc || [];
  const timelineItems = (detail?.claims || [])
    .filter(Boolean)
    .sort((a, b) => new Date(b.service_date || b.service_start) - new Date(a.service_date || a.service_start))
    .slice(0, 5)
    .map((claim) => ({
      id: claim.id || claim.claim_number,
      date: formatDate(claim.service_date || claim.service_start || claim.service_end),
      description: (claim.claim_type || "Encounter").replace(/\b\w/g, (match) => match.toUpperCase()),
      detail: claim.provider_name || claim.place_of_service,
    }));

  const [noteBody, setNoteBody] = useState("");
  const [noteStatus, setNoteStatus] = useState("idle");
  const onNoteBodyChange = setNoteBody;
  const onSubmitNote = (event) => {
    event?.preventDefault?.();
    setNoteStatus("saving");
    setTimeout(() => setNoteStatus("idle"), 400);
  };

  const [assessmentDate, setAssessmentDate] = useState("");
  const [assessmentIcd, setAssessmentIcd] = useState("");
  const [assessmentNotes, setAssessmentNotes] = useState("");
  const [assessmentStatus, setAssessmentStatus] = useState("idle");
  const onCreateAssessment = (event) => {
    event?.preventDefault?.();
    setAssessmentStatus("saving");
    setTimeout(() => setAssessmentStatus("idle"), 400);
  };

  const [chaseUpdating, setChaseUpdating] = useState(null);
  const onAdvanceChase = (chase) => {
    setChaseUpdating(chase.id);
    setTimeout(() => setChaseUpdating(null), 400);
  };

  return (
    <div className="coding-member-workspace min-h-screen">
      <PatientHeader member={member} gapCount={missingHcc.length} onRefresh={onRefresh} />

      <div className="coding-member-toolbar">
        <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-2">
          <input className="coding-input w-full rounded-lg px-3 py-2 text-sm" placeholder="Search..." />
          <button className="coding-ghost-button rounded-lg px-3 py-2 text-sm">Advanced</button>
          <div className="ml-auto hidden items-center gap-2 text-xs coding-text-muted sm:flex">
            <span className="inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" /> Synced
            </span>
            <span>{"\u2022"}</span>
            <span>Autosave: On</span>
          </div>
        </div>
      </div>

      <div className="mx-auto flex max-w-[1400px] gap-0">
        <LeftNav />
        <main className="flex-1 px-4 py-4">
          <Outlet
            context={{
              detail,
              gap,
              loading,
              gapLoading,
              onGenerateSubmission,
              submissionState,
              submissionResult,
              noteBody,
              onNoteBodyChange,
              onSubmitNote,
              noteStatus,
              assessmentDate,
              onAssessmentDateChange: setAssessmentDate,
              assessmentIcd,
              onAssessmentIcdChange: setAssessmentIcd,
              assessmentNotes,
              onAssessmentNotesChange: setAssessmentNotes,
              onCreateAssessment,
              assessmentStatus,
              onAdvanceChase,
              chaseUpdating,
            }}
          />
        </main>
        <RightRail
          submissionState={submissionState}
          onGenerateSubmission={onGenerateSubmission}
          submissionResult={submissionResult}
          timelineItems={timelineItems}
        />
      </div>

      <footer className="coding-member-footer sticky bottom-0 z-30 px-4 py-2 text-[11px] backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between">
          <div className="hidden items-center gap-3 sm:flex">
            <kbd className="coding-key">N</kbd> Note
            <kbd className="coding-key">D</kbd> Diagnosis
            <kbd className="coding-key">/</kbd> Search
          </div>
          <span className="coding-text-soft">v0.1 Wireframe</span>
        </div>
      </footer>
    </div>
  );
}
