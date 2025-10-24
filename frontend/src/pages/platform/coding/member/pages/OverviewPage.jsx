import React from "react";
import { useOutletContext } from "react-router-dom";
import { SectionHeader, TableSkeleton, KeyValue, AlertBanner } from "../../../../../components/ehr/Primitives";

/**
 * Helpers
 */
const formatDate = (value) => {
  if (!value) return "N/A";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString();
};

const formatDateTime = (value) => {
  if (!value) return "N/A";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString();
};

const toSentenceCase = (value) =>
  value
    ? value
        .toString()
        .replace(/[_-]+/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase())
    : "N/A";

const extractIcdCodes = (source) => {
  const map = source?.diagnosis_codes || source?.icd10_codes;
  if (!map) return [];
  if (Array.isArray(map)) return map;
  return Object.keys(map);
};

const nextChaseStatus = (status) => {
  if (status === "open") return "in_review";
  if (status === "in_review") return "closed";
  return "open";
};

const formatCurrency = (value) => {
  if (typeof value !== "number") return value ?? "N/A";
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
};

const extractHccCode = (chase) => {
  if (!chase) return "N/A";
  if (chase.hcc_code) return chase.hcc_code;
  const codes = chase.hcc_codes ? Object.keys(chase.hcc_codes) : [];
  return codes[0] || "N/A";
};

const fallbackMissingHcc = [
  {
    hcc_code: "HCC 85",
    reason: "Chronic CHF with recent inpatient stay flagged for validation.",
    icd10_candidates: ["I50.22", "I11.0"],
    action: "Confirm documentation in cardiology note (10/05/2025).",
  },
  {
    hcc_code: "HCC 18",
    reason: "Diabetes with complications noted in cardiology follow-up note.",
    icd10_candidates: ["E11.65", "E11.21"],
    action: "Request latest A1c result from endocrinology.",
  },
];

const fallbackClaims = [
  {
    id: "claim-sample-1",
    service_date: "2025-10-12",
    claim_type: "outpatient",
    place_of_service: "Harborview Clinics",
    total_paid: 1285,
    diagnosis_codes: ["E11.9", "I50.22", "J44.9"],
  },
  {
    id: "claim-sample-2",
    service_start: "2025-09-29",
    service_end: "2025-10-03",
    claim_type: "inpatient",
    place_of_service: "St. Mary's Medical Center",
    total_paid: 7945,
    diagnosis_codes: ["J18.9", "I10"],
  },
];

const fallbackChases = [
  {
    id: "CHASE-48219",
    status: "open",
    hcc_code: "HCC 85",
    assigned_coder_email: "jamie.r@nexorahealth.com",
  },
  {
    id: "CHASE-48107",
    status: "in_review",
    hcc_code: "HCC 18",
    assigned_coder_email: "alex.p@nexorahealth.com",
  },
];

export default function OverviewPage() {
  const ctx = useOutletContext?.() || {};
  const {
    detail,
    gap,
    loading = false,
    gapLoading = false,
    // Optional handlers/state
    onAdvanceChase,
    chaseUpdating,
    // Notes
    noteBody = "",
    onNoteBodyChange,
    onSubmitNote,
    noteStatus = "idle",
    // Assessments
    assessmentDate,
    onAssessmentDateChange,
    assessmentNotes = "",
    onAssessmentNotesChange,
    assessmentIcd = "",
    onAssessmentIcdChange,
    onCreateAssessment,
    assessmentStatus = "idle",
    // Submissions
    submissionState = "idle",
    onGenerateSubmission,
    submissionResult,
    // Errors
    errorMessage,
  } = ctx;

  const member = detail?.member || {};
  const priority = detail?.priority || gap?.priority || {};
  const chases = detail?.chases || [];
  const notes = detail?.notes || [];
  const claims = detail?.claims || [];
  const assessments = detail?.health_assessments || [];
  const maoRecords = detail?.mao_records || gap?.mao_records || [];
  const missingHcc = gap?.missing_hcc || [];

  const riskScore = typeof member?.risk_score === "number" ? member.risk_score : null;
  const hccOpportunityCount = priority?.hcc_opportunity_count || 0;
  const proposedAdds = hccOpportunityCount * 0.12;
  const projectedRaf = riskScore != null ? riskScore + proposedAdds : null;

  const suspectRows = missingHcc.slice(0, 6);
  const claimRows = claims.slice(0, 4);
  const chaseRows = chases.slice(0, 6);
  const suspectTableRows = suspectRows.length > 0 ? suspectRows : fallbackMissingHcc;
  const claimTableRows = claimRows.length > 0 ? claimRows : fallbackClaims;
  const chaseTableRows = chaseRows.length > 0 ? chaseRows : fallbackChases;
  const showingSuspectFallback = suspectRows.length === 0;
  const showingClaimFallback = claimRows.length === 0;
  const showingChaseFallback = chaseRows.length === 0;
  const noteRows = notes.slice(0, 5);
  const assessmentRows = assessments.slice(0, 4);
  const maoRows = maoRecords.slice(0, 3);

  const alerts = [];
  if (priority?.next_action) {
    alerts.push({
      level: "warning",
      title: `Next action: ${toSentenceCase(priority.next_action)}`,
      body: priority?.next_action_due ? `Due ${formatDate(priority.next_action_due)}` : undefined,
    });
  }
  (gap?.immediate_actions || []).forEach((action) =>
    alerts.push({ level: "info", title: toSentenceCase(action), body: "Flagged by gap analysis." }),
  );
  if (priority?.priority_tier === "high") {
    alerts.push({
      level: "danger",
      title: "High priority member",
      body: "Address outstanding conditions before end of cycle.",
    });
  }

  return (
    <div className="space-y-4">
      {errorMessage && <AlertBanner level="danger" title="We could not update some data" body={errorMessage} />}
      {gapLoading && (
        <AlertBanner level="info" title="Refreshing care gaps" body="Fetching the most recent gap analysis for this member." />
      )}

      {/* Top snapshot + RAF calculator */}
      <div className="grid grid-cols-12 gap-4">
        {/* Snapshot */}
        <div className="col-span-12 lg:col-span-8 space-y-4">
          <div className="coding-surface rounded-xl p-4">
            <SectionHeader title="Patient Snapshot" subtitle="Key facts and trends" />
            <div className="mt-3 grid grid-cols-2 gap-6 md:grid-cols-3 text-xs">
              <KeyValue k="Status" v={toSentenceCase(member?.status)} />
              <KeyValue k="Line of Business" v={member?.line_of_business || "N/A"} />
              <KeyValue k="PCP" v={member?.pcp_name || "N/A"} />
              <KeyValue k="Risk Score" v={riskScore != null ? riskScore.toFixed(2) : "N/A"} />
              <KeyValue
                k="Next Action"
                v={
                  priority?.next_action
                    ? `${toSentenceCase(priority.next_action)}${
                        priority?.next_action_due ? ` - ${formatDate(priority.next_action_due)}` : ""
                      }`
                    : "N/A"
                }
              />
              <KeyValue
                k="Priority Score"
                v={priority?.priority_score != null ? Number(priority.priority_score).toFixed(1) : "N/A"}
              />
            </div>
          </div>

          {/* HCC Suspect List */}
          <div className="coding-surface rounded-xl p-4">
            <SectionHeader title="HCC Suspect List" subtitle="Machine-suggested conditions for review" />
            <div className="mt-3">
              {loading ? (
                <TableSkeleton columns={["HCC", "Reason", "ICD-10 Candidates", "Action"]} rows={4} />
              ) : (
                <>
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
                        {suspectTableRows.map((row, i) => (
                          <tr key={row.hcc_code || i} className="hover:bg-gray-50">
                            <td className="px-3 py-2 font-medium text-gray-900">{row.hcc_code || "N/A"}</td>
                            <td className="px-3 py-2">{row.reason || "Opportunity detected"}</td>
                            <td className="px-3 py-2">{(row.icd10_candidates || []).join(", ") || "N/A"}</td>
                            <td className="px-3 py-2">{row.action || "Review & validate"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {showingSuspectFallback && (
                    <p className="mt-2 text-[11px] text-gray-500">Sample suspect records shown while live data syncs.</p>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Recent Encounters */}
          <div className="coding-surface rounded-xl p-4">
            <SectionHeader title="Recent Encounters" subtitle="Past 12 months" />
            <div className="mt-3">
              {loading ? (
                <TableSkeleton columns={["Date", "Type", "Location", "Paid", "Dx (summary)"]} rows={4} />
              ) : (
                <>
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
                        {claimTableRows.map((claim) => {
                          const diagnoses = extractIcdCodes(claim);
                          const paid = claim.total_paid ?? claim.paid_amount ?? 0;
                          return (
                            <tr key={claim.id || claim.claim_number} className="hover:bg-gray-50">
                              <td className="px-3 py-2 font-medium text-gray-900">
                                {formatDate(claim.service_date || claim.service_start)}
                              </td>
                              <td className="px-3 py-2">{toSentenceCase(claim.claim_type || "Encounter")}</td>
                              <td className="px-3 py-2">{claim.place_of_service || claim.provider_name || "N/A"}</td>
                              <td className="px-3 py-2">{formatCurrency(paid)}</td>
                              <td className="px-3 py-2">{diagnoses.length ? diagnoses.join(", ") : "N/A"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {showingClaimFallback && (
                    <p className="mt-2 text-[11px] text-gray-500">Sample encounter records shown while feeds connect.</p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right column: RAF + Care Gaps + Clinical Alerts */}
        <aside className="col-span-12 lg:col-span-4 space-y-4">
          <div className="coding-surface rounded-xl p-4">
            <SectionHeader title="RAF Calculator" subtitle="Preview impact before submit" />
            <div className="mt-3 space-y-2 text-xs">
              <KeyValue k="Base RAF" v={<span>{riskScore != null ? riskScore.toFixed(2) : "N/A"}</span>} />
              <KeyValue k="HCC Adds (proposed)" v={<span>{proposedAdds ? `+${proposedAdds.toFixed(2)}` : "+0.00"}</span>} />
              <KeyValue k="Opportunities" v={<span>{hccOpportunityCount}</span>} />
              <div className="mt-2 rounded-lg bg-gray-50 p-2 text-center text-sm font-semibold">
                Projected RAF: {projectedRaf != null ? projectedRaf.toFixed(2) : "N/A"}
              </div>
              <button className="mt-2 w-full rounded-lg border border-gray-300 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50" disabled>
                Open Dx picker
              </button>
              <button
                className="mt-2 w-full rounded-lg border border-gray-300 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                type="button"
                onClick={onGenerateSubmission}
                disabled={!onGenerateSubmission || submissionState === "working"}
              >
                {submissionState === "working" ? "Generating export..." : "Submit to Payer (Preview)"}
              </button>
              {submissionResult?.record_count != null && (
                <p className="mt-2 text-[11px] text-gray-500">
                  Last export batch {submissionResult.batch_id} - {submissionResult.record_count} record(s)
                </p>
              )}
            </div>
          </div>

          <div className="coding-surface rounded-xl p-4">
            <SectionHeader title="Care Gaps" subtitle="Quality & risk" />
            <ul className="mt-2 space-y-2 text-xs">
              {missingHcc.slice(0, 3).map((g) => (
                <li key={g.hcc_code} className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-gray-400" />
                  <div className="flex-1">
                    <div className="font-medium text-gray-800">{g.hcc_code}</div>
                    <div className="text-[11px] text-gray-500">{g.reason || "Review supporting documentation."}</div>
                  </div>
                  <button
                    type="button"
                    className="rounded border border-gray-300 px-2 py-0.5 text-[11px] text-gray-700 hover:bg-gray-50"
                    disabled
                  >
                    Add
                  </button>
                </li>
              ))}
              {missingHcc.length === 0 && (
                <li className="text-[11px] text-gray-500">No open care gaps tracked for this member.</li>
              )}
            </ul>
          </div>

          <div className="coding-surface rounded-xl p-4">
            <SectionHeader title="Clinical Alerts" subtitle="Sorted by severity" />
            <div className="mt-3 space-y-2">
              {alerts.length > 0 ? (
                alerts.map((a, i) => <AlertBanner key={`${a.title}-${i}`} level={a.level} title={a.title} body={a.body} />)
              ) : (
                <AlertBanner level="success" title="No blocking alerts" body="All high-severity items cleared for this member." />
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* Lower panels: Chases, Notes, Assessments */}
      <div className="grid grid-cols-12 gap-4">
        {/* Chases */}
        <div className="col-span-12 xl:col-span-7">
          <div className="coding-surface rounded-xl p-4">
            <SectionHeader title="Chase Worklist" subtitle="Assigned coding chases" />
            <div className="mt-3">
              {loading ? (
                <TableSkeleton columns={["Chase", "Status", "HCC", "Coder", "Action"]} rows={4} />
              ) : (
                <>
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
                        {chaseTableRows.map((ch) => {
                          const next = nextChaseStatus(ch.status);
                          const canAdvance = typeof onAdvanceChase === "function";
                          return (
                            <tr key={ch.id} className="hover:bg-gray-50">
                              <td className="px-3 py-2 font-medium text-gray-900">{ch.id}</td>
                              <td className="px-3 py-2">{toSentenceCase(ch.status)}</td>
                              <td className="px-3 py-2">{extractHccCode(ch)}</td>
                              <td className="px-3 py-2">{ch.assigned_coder_email || "Unassigned"}</td>
                              <td className="px-3 py-2">
                                <button
                                  type="button"
                                  onClick={() => canAdvance && onAdvanceChase(ch)}
                                  className="rounded border border-gray-300 px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                                  disabled={!canAdvance || chaseUpdating === ch.id}
                                >
                                  {chaseUpdating === ch.id ? "Updating..." : `Mark ${toSentenceCase(next)}`}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {showingChaseFallback && (
                    <p className="mt-2 text-[11px] text-gray-500">Sample chase assignments shown until worklist syncs.</p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Notes + Assessments */}
        <div className="col-span-12 xl:col-span-5 space-y-4">
          <div id="notes-panel" className="coding-surface rounded-xl p-4">
            <SectionHeader title="Notes & Collaboration" subtitle="Share coder insights" />
            <form className="mt-3 space-y-2" onSubmit={onSubmitNote}>
              <label className="block text-xs font-medium text-gray-700">
                Add note
                <textarea
                  value={noteBody}
                  onChange={(e) => (onNoteBodyChange ? onNoteBodyChange(e.target.value) : null)}
                  rows={3}
                  className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-xs text-gray-800 focus:border-gray-500 focus:outline-none"
                  placeholder="Document findings, outreach, or next steps..."
                  disabled={!onNoteBodyChange}
                />
              </label>
              <div className="flex items-center justify-between text-[11px] text-gray-500">
                {noteStatus === "error" && <span className="text-red-600">Unable to save note. Try again.</span>}
                <button
                  type="submit"
                  className="rounded border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                  disabled={!onSubmitNote || !noteBody?.trim() || noteStatus === "saving"}
                >
                  {noteStatus === "saving" ? "Saving..." : "Save note"}
                </button>
              </div>
            </form>
            <ul className="mt-4 space-y-2 text-xs">
              {noteRows.length > 0 ? (
                noteRows.map((n) => (
                  <li key={n.id} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                    <div className="flex items-center justify-between text-[11px] text-gray-500">
                      <span>{n.author_name || n.author_email || "Unknown author"}</span>
                      <time dateTime={n.created_at}>{formatDateTime(n.created_at)}</time>
                    </div>
                    <p className="mt-1 text-gray-700">{n.body}</p>
                  </li>
                ))
              ) : (
                <li className="text-[11px] text-gray-500">No notes yet. Capture the next action above.</li>
              )}
            </ul>
          </div>

          <div id="assessments-panel" className="coding-surface rounded-xl p-4">
            <SectionHeader title="Assessments & Submissions" subtitle="Track supporting documentation" />
            <ul className="mt-3 space-y-2 text-xs">
              {assessmentRows.length > 0 ? (
                assessmentRows.map((a) => (
                  <li key={a.id} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                    <div className="flex items-center justify-between text-[11px] text-gray-500">
                      <span>{toSentenceCase(a.assessment_type || "Assessment")}</span>
                      <span>{formatDate(a.assessment_date)}</span>
                    </div>
                    <div className="mt-1 text-gray-700">ICD-10: {(a.icd10_codes || []).join(", ") || "N/A"}</div>
                    {a.notes && <div className="mt-1 text-gray-600">{a.notes}</div>}
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
                    value={assessmentDate || ""}
                    onChange={(e) => (onAssessmentDateChange ? onAssessmentDateChange(e.target.value) : null)}
                    className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-xs text-gray-800 focus:border-gray-500 focus:outline-none"
                    disabled={!onAssessmentDateChange}
                  />
                </label>
              </div>
              <div>
                <label className="block font-medium text-gray-700">
                  ICD-10 codes
                  <input
                    type="text"
                    value={assessmentIcd}
                    onChange={(e) => (onAssessmentIcdChange ? onAssessmentIcdChange(e.target.value) : null)}
                    placeholder="E11.9, J44.9"
                    className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-xs text-gray-800 focus:border-gray-500 focus:outline-none"
                    disabled={!onAssessmentIcdChange}
                  />
                </label>
              </div>
              <div>
                <label className="block font-medium text-gray-700">
                  Notes
                  <textarea
                    value={assessmentNotes}
                    onChange={(e) => (onAssessmentNotesChange ? onAssessmentNotesChange(e.target.value) : null)}
                    rows={2}
                    className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-xs text-gray-800 focus:border-gray-500 focus:outline-none"
                    placeholder="Optional context for the assessment..."
                    disabled={!onAssessmentNotesChange}
                  />
                </label>
              </div>
              <div className="flex items-center justify-between text-[11px] text-gray-500">
                {assessmentStatus === "error" && <span className="text-red-600">Unable to record assessment.</span>}
                <button
                  type="submit"
                  className="rounded border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                  disabled={!onCreateAssessment || assessmentStatus === "saving"}
                >
                  {assessmentStatus === "saving" ? "Saving..." : "Record assessment"}
                </button>
              </div>
            </form>

            {maoRows.length > 0 && (
              <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-[11px] text-gray-600">
                <div className="font-semibold text-gray-700">Recent MAO records</div>
                <ul className="mt-1 space-y-1">
                  {maoRows.map((r) => (
                    <li key={r.id}>
                      {r.hcc_code} - {r.icd10_code} ({formatDate(r.service_start)} - {formatDate(r.service_end)}) - {" "}
                      {toSentenceCase(r.status)}
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
