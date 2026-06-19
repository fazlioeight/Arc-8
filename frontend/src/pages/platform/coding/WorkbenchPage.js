import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import PortalPageLayout from "../../../components/PortalPageLayout";
import AlertShell from "../../../components/ui/AlertShell";
import Pill from "../../../components/ui/Pill";
import { LoadingState, ErrorState } from "../../../components/ehr/Primitives";
import { AuthContext } from "../../../context/AuthContext";
import { PORTAL_NAV_ITEMS } from "../portal_page/portalNavItems";
import { ROUTES } from "../../../constants/routes";
import {
  fetchWorkbenchSuspects,
  finalizeCode,
  getICDMap,
  fetchDocumentPdf,
} from "../../../services/workbenchService";

const MEAT_LABELS = { M: "Monitored", E: "Evaluated", A: "Assessed", T: "Treated" };

const WorkbenchPage = () => {
  const navigate = useNavigate();
  const { memberId } = useParams();
  const { token, tenant, isAuthenticated } = useContext(AuthContext) || {};
  const canQuery = useMemo(() => Boolean(token && tenant && memberId), [token, tenant, memberId]);

  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [activeSuspectId, setActiveSuspectId] = useState(null);
  const [selectedEvidence, setSelectedEvidence] = useState({}); // snippet_id -> bool
  const [selectedIcd, setSelectedIcd] = useState("");
  const [meat, setMeat] = useState({ M: false, E: false, A: false, T: false });
  const [finalizing, setFinalizing] = useState(false);
  const [finalizeResult, setFinalizeResult] = useState(null);
  const [finalizeError, setFinalizeError] = useState(null);

  const [icdLookup, setIcdLookup] = useState("");
  const [icdResult, setIcdResult] = useState(null);
  const [icdError, setIcdError] = useState(null);

  const load = useCallback(async () => {
    if (!canQuery) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchWorkbenchSuspects(token, tenant, memberId);
      setPayload(data);
      const first = (data.suspects || [])[0];
      setActiveSuspectId(first ? first.suspect_id : null);
    } catch (err) {
      setError(err.message || "Unable to load workbench");
    } finally {
      setLoading(false);
    }
  }, [canQuery, token, tenant, memberId]);

  useEffect(() => {
    if (isAuthenticated) void load();
  }, [isAuthenticated, load]);

  const activeSuspect = useMemo(
    () => (payload?.suspects || []).find((s) => s.suspect_id === activeSuspectId) || null,
    [payload, activeSuspectId]
  );

  // Reset the finalize panel whenever the coder switches suspect.
  useEffect(() => {
    setSelectedEvidence({});
    setMeat({ M: false, E: false, A: false, T: false });
    setFinalizeResult(null);
    setFinalizeError(null);
    setSelectedIcd(activeSuspect?.icd_suggestions?.[0]?.code || "");
  }, [activeSuspectId, activeSuspect]);

  const evidenceUsed = useMemo(
    () => Object.entries(selectedEvidence).filter(([, v]) => v).map(([k]) => k),
    [selectedEvidence]
  );
  const meatComplete = meat.M && meat.E && meat.A && meat.T;

  const submitFinalize = async () => {
    if (!activeSuspect) return;
    setFinalizing(true);
    setFinalizeError(null);
    setFinalizeResult(null);
    try {
      const result = await finalizeCode(token, tenant, {
        member_id: payload.member.id,
        encounter_id: payload.encounter?.id,
        suspect_id: activeSuspect.suspect_id,
        selected_icd: selectedIcd || null,
        model_year: payload.model_year,
        lob: payload.member.lob,
        evidence_used: evidenceUsed,
        checklist: { meat_complete: meatComplete },
      });
      setFinalizeResult(result);
      await load(); // refresh — the coded chase drops out of the open suspects
    } catch (err) {
      setFinalizeError(err.message || "Could not finalize code");
    } finally {
      setFinalizing(false);
    }
  };

  const runIcdLookup = async () => {
    if (!icdLookup.trim()) return;
    setIcdError(null);
    setIcdResult(null);
    try {
      const res = await getICDMap(token, tenant, {
        code: icdLookup.trim(),
        modelYear: payload?.model_year,
        lob: payload?.member?.lob,
      });
      setIcdResult(res);
    } catch (err) {
      setIcdError(err.message || "ICD code not found");
    }
  };

  const openDocument = async (documentId) => {
    try {
      const blob = await fetchDocumentPdf(token, tenant, documentId);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener");
      // Revoke shortly after so the new tab has time to load it.
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      setError(err.message || "Unable to open document");
    }
  };

  return (
    <PortalPageLayout
      eyebrow="Coding"
      title="Coding workbench"
      subtitle={payload ? `${payload.member.name} · ${payload.member.lob} · MY${payload.model_year}` : "Review suspects and finalize HCC codes."}
      navItems={PORTAL_NAV_ITEMS}
      currentNav="coding"
      navProps={{ align: "center", tone: "surface" }}
      maxWidthClassName="max-w-[1500px]"
      mainClassName="space-y-4"
    >
      {!isAuthenticated && (
        <AlertShell tone="warning" title="Authentication required" description="Sign in to open the coding workbench." />
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate(ROUTES.CODING.WORKLIST)}
          className="rounded-md ring-1 coding-border coding-text-strong bg-transparent hover:bg-[var(--coding-hover)] px-2.5 py-1.5 text-xs font-semibold"
        >
          ← Worklist
        </button>
        <span className="text-xs coding-text-muted font-mono">{memberId}</span>
      </div>

      {error && <ErrorState title="Unable to load workbench" description={error} />}
      {!error && loading && <LoadingState title="Loading workbench" />}

      {!error && !loading && payload && (
        <div className="grid grid-cols-12 gap-4">
          {/* Suspects list */}
          <div className="col-span-12 lg:col-span-3 space-y-2">
            <section className="coding-surface rounded-2xl shadow-sm overflow-hidden">
              <header className="px-4 py-2.5 border-b coding-border text-xs font-semibold uppercase tracking-wider coding-text-muted">
                Suspects ({(payload.suspects || []).length})
              </header>
              <ul>
                {(payload.suspects || []).map((s) => (
                  <li key={s.suspect_id}>
                    <button
                      type="button"
                      onClick={() => setActiveSuspectId(s.suspect_id)}
                      className={`w-full text-left px-4 py-3 border-b coding-border-subtle hover:bg-[var(--coding-hover)] transition ${
                        s.suspect_id === activeSuspectId ? "bg-[var(--coding-hover)]" : ""
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="coding-text-strong font-medium">{s.condition}</span>
                        <Pill tone={s.priority >= 0.8 ? "danger" : s.priority >= 0.5 ? "warning" : "neutral"} size="sm">
                          {Math.round(s.priority * 100)}
                        </Pill>
                      </div>
                      <p className="text-[11px] coding-text-muted">{(s.evidence || []).length} evidence · {(s.icd_suggestions || []).length} ICD</p>
                    </button>
                  </li>
                ))}
                {(payload.suspects || []).length === 0 && (
                  <li className="px-4 py-10 text-center text-sm coding-text-soft">No open suspects for this member.</li>
                )}
              </ul>
            </section>

            <ICDLookup
              value={icdLookup}
              onChange={setIcdLookup}
              onLookup={runIcdLookup}
              result={icdResult}
              error={icdError}
            />
          </div>

          {/* Evidence for the active suspect */}
          <div className="col-span-12 lg:col-span-6 space-y-4">
            <section className="coding-surface rounded-2xl shadow-sm overflow-hidden">
              <header className="px-4 py-2.5 border-b coding-border flex items-center justify-between">
                <h3 className="text-sm font-semibold coding-text-strong">{activeSuspect ? activeSuspect.condition : "Evidence"}</h3>
                <span className="text-[11px] coding-text-muted">Select supporting evidence</span>
              </header>
              <ul>
                {(activeSuspect?.evidence || []).map((ev) => (
                  <li key={ev.snippet_id} className="px-4 py-3 border-b coding-border-subtle">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        className="mt-1 accent-[var(--brand-primary)]"
                        checked={Boolean(selectedEvidence[ev.snippet_id])}
                        onChange={(e) => setSelectedEvidence((prev) => ({ ...prev, [ev.snippet_id]: e.target.checked }))}
                      />
                      <span className="flex-1">
                        <span className="flex items-center gap-2">
                          <span className="coding-text-strong text-sm">{ev.text}</span>
                          {ev.qualifying && <Pill tone="success" size="sm">Qualifying</Pill>}
                        </span>
                        <span className="block text-[11px] coding-text-muted mt-0.5">
                          {ev.source_type} · DOS {ev.dos || "—"} · confidence {Math.round((ev.confidence || 0) * 100)}%
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
                {activeSuspect && (activeSuspect.evidence || []).length === 0 && (
                  <li className="px-4 py-10 text-center text-sm coding-text-soft">No evidence snippets on this suspect.</li>
                )}
              </ul>
            </section>

            {(payload.documents || []).length > 0 && (
              <section className="coding-surface rounded-2xl shadow-sm overflow-hidden">
                <header className="px-4 py-2.5 border-b coding-border text-xs font-semibold uppercase tracking-wider coding-text-muted">
                  Documents
                </header>
                <ul>
                  {payload.documents.map((d) => (
                    <li key={d.id} className="px-4 py-3 border-b coding-border-subtle flex items-center justify-between">
                      <span className="coding-text-strong text-sm">{d.preview || d.id}</span>
                      <button
                        type="button"
                        onClick={() => openDocument(d.id)}
                        className="text-[var(--brand-primary)] hover:underline text-xs font-semibold"
                      >
                        View PDF →
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          {/* Finalize panel */}
          <div className="col-span-12 lg:col-span-3">
            <section className="coding-surface rounded-2xl shadow-sm overflow-hidden sticky top-4">
              <header className="px-4 py-2.5 border-b coding-border text-sm font-semibold coding-text-strong">Finalize</header>
              <div className="p-4 space-y-4">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="coding-text-muted text-xs font-medium">ICD-10 code</span>
                  {(activeSuspect?.icd_suggestions || []).length > 0 ? (
                    <select
                      className="rounded-md border coding-border px-2 py-2 bg-transparent coding-text-strong"
                      value={selectedIcd}
                      onChange={(e) => setSelectedIcd(e.target.value)}
                    >
                      <option value="">Select…</option>
                      {activeSuspect.icd_suggestions.map((s) => (
                        <option key={s.code} value={s.code}>{s.code}{s.label && s.label !== s.code ? ` — ${s.label}` : ""}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className="rounded-md border coding-border px-2 py-2 bg-transparent coding-text-strong"
                      value={selectedIcd}
                      placeholder="e.g. E11.9"
                      onChange={(e) => setSelectedIcd(e.target.value)}
                    />
                  )}
                </label>

                <div>
                  <p className="coding-text-muted text-xs font-medium mb-1">MEAT</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {["M", "E", "A", "T"].map((k) => (
                      <label key={k} className="flex items-center gap-2 text-sm coding-text-strong cursor-pointer">
                        <input
                          type="checkbox"
                          className="accent-[var(--brand-primary)]"
                          checked={meat[k]}
                          onChange={(e) => setMeat((prev) => ({ ...prev, [k]: e.target.checked }))}
                        />
                        {MEAT_LABELS[k]}
                      </label>
                    ))}
                  </div>
                </div>

                {finalizeError && <AlertShell tone="danger" title="Could not finalize" description={finalizeError} />}
                {finalizeResult && (
                  <AlertShell tone="success" title="Code finalized" description={`Audit ${finalizeResult.audit_id} · ${finalizeResult.submission_intent}`} />
                )}

                <button
                  type="button"
                  onClick={submitFinalize}
                  disabled={finalizing || !activeSuspect || evidenceUsed.length === 0 || !meatComplete}
                  className="w-full rounded-md bg-[var(--brand-primary)] text-white px-4 py-2 text-sm font-semibold hover:bg-brand-700 disabled:opacity-60"
                >
                  {finalizing ? "Finalizing…" : "Finalize code"}
                </button>
                {(evidenceUsed.length === 0 || !meatComplete) && activeSuspect && (
                  <p className="text-[11px] coding-text-soft">
                    Select at least one evidence snippet and complete all four MEAT criteria to finalize.
                  </p>
                )}
              </div>
            </section>
          </div>
        </div>
      )}
    </PortalPageLayout>
  );
};

const ICDLookup = ({ value, onChange, onLookup, result, error }) => (
  <section className="coding-surface rounded-2xl shadow-sm overflow-hidden">
    <header className="px-4 py-2.5 border-b coding-border text-xs font-semibold uppercase tracking-wider coding-text-muted">
      ICD → HCC lookup
    </header>
    <div className="p-3 space-y-2">
      <div className="flex gap-2">
        <input
          className="flex-1 rounded-md border coding-border px-2 py-1.5 bg-transparent coding-text-strong text-sm"
          value={value}
          placeholder="ICD-10 code"
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") onLookup(); }}
        />
        <button
          type="button"
          onClick={onLookup}
          className="rounded-md bg-[var(--brand-primary)] text-white px-3 py-1.5 text-sm font-semibold hover:bg-brand-700"
        >
          Map
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {result && (
        <div className="text-xs coding-text-strong space-y-1">
          <p><span className="coding-text-muted">Code:</span> {result.code}</p>
          <p><span className="coding-text-muted">HCC:</span> {result.hcc || "—"}</p>
          {(result.alternatives || []).length > 0 && (
            <p><span className="coding-text-muted">Alternatives:</span> {result.alternatives.join(", ")}</p>
          )}
        </div>
      )}
    </div>
  </section>
);

export default WorkbenchPage;
