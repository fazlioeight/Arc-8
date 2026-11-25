import React, { useContext, useEffect, useMemo, useState } from "react";
import { AuthContext } from "../../../../context/AuthContext";
import {
  fetchMember360MemberAudit,
  fetchMember360TenantAudit,
  logMember360AccessReason,
} from "../../../../services/member360LabService";
import { ChartTabHeader, ChartTable } from "./chartPrimitives";

const AUDIT_LOG_COLUMNS = [
  { label: "Time", accessor: "time" },
  { label: "Actor", accessor: "actor" },
  { label: "Event Type", accessor: "event_badge" },
  { label: "Member ID", accessor: "member_col" },
  { label: "Audit Details & Access Reason", accessor: "details" },
];

const REASON_CATEGORIES = [
  "Coverage / Cross-Coverage Backup",
  "Supervisor Escalation Review",
  "Urgent Clinical Triage / Transition of Care",
  "Quality & HEDIS / HCC Audit Review",
  "Member Inbound Call Assistance",
];

const formatTimestamp = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
};

const formatPayloadText = (payload) => {
  if (!payload || typeof payload !== "object") return "—";
  const filtered = Object.entries(payload).filter(([key]) => key !== "member_id");
  if (filtered.length === 0) return "—";
  return filtered
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : JSON.stringify(value)}`)
    .join("  ·  ");
};

export default function AuditLogPage({ memberId, assignedCoordinator }) {
  const { token, tenant } = useContext(AuthContext) || {};
  const [events, setEvents] = useState([]);
  const [scope, setScope] = useState("member"); // 'member' | 'tenant'
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [reasonModalOpen, setReasonModalOpen] = useState(false);
  const [reasonCategory, setReasonCategory] = useState(REASON_CATEGORIES[0]);
  const [reasonDetail, setReasonDetail] = useState("");
  const [reasonBusy, setReasonBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!token || !tenant) {
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    const req =
      scope === "tenant" || !memberId
        ? fetchMember360TenantAudit(token, tenant, { limit: 200 })
        : fetchMember360MemberAudit(token, tenant, memberId, { limit: 150 });
    req
      .then((res) => {
        if (cancelled) return;
        setEvents(res?.items || []);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, tenant, memberId, scope, refreshKey]);

  const filteredEvents = useMemo(() => {
    const term = search.trim().toLowerCase();
    return events.filter((ev) => {
      const et = String(ev.event_type || "").toLowerCase();
      if (categoryFilter === "out_of_caseload" && !et.includes("out_of_caseload")) return false;
      if (categoryFilter === "views" && !et.includes(".view") && !et.includes(".detail") && !et.includes(".list")) return false;
      if (
        categoryFilter === "mutations" &&
        !et.includes(".create") &&
        !et.includes(".update") &&
        !et.includes(".upload") &&
        !et.includes(".evaluate_escalations")
      ) {
        return false;
      }
      if (term) {
        const hay = [ev.actor, ev.event_type, JSON.stringify(ev.payload || {})].join(" ").toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [events, categoryFilter, search]);

  const exportAuditCsv = () => {
    const header = ["ID", "Timestamp", "Actor", "EventType", "MemberID", "ReasonCategory", "ReasonDetail", "Payload"];
    const lines = [header.join(",")];
    filteredEvents.forEach((ev) => {
      const p = ev.payload || {};
      const row = [
        ev.id,
        ev.created_at || "",
        `"${String(ev.actor || "").replace(/"/g, '""')}"`,
        `"${String(ev.event_type || "").replace(/"/g, '""')}"`,
        p.member_id ?? memberId ?? "",
        `"${String(p.reason_category || "").replace(/"/g, '""')}"`,
        `"${String(p.reason_detail || "").replace(/"/g, '""')}"`,
        `"${JSON.stringify(p).replace(/"/g, '""')}"`,
      ];
      lines.push(row.join(","));
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `member360-audit-log-${scope}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleLogReason = async (e) => {
    e.preventDefault();
    if (!memberId || !reasonDetail.trim()) return;
    setReasonBusy(true);
    try {
      await logMember360AccessReason(token, tenant, memberId, {
        reason_category: reasonCategory,
        reason_detail: reasonDetail.trim(),
        caseload_coordinator: assignedCoordinator || null,
      });
      setReasonModalOpen(false);
      setReasonDetail("");
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setReasonBusy(false);
    }
  };

  const rows = filteredEvents.map((ev) => {
    const isOutOfCaseload = String(ev.event_type || "").includes("out_of_caseload_access");
    const p = ev.payload || {};
    return {
      id: ev.id,
      time: formatTimestamp(ev.created_at),
      actor: ev.actor || "—",
      event_badge: isOutOfCaseload ? (
        <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200 px-2 py-0.5 text-[11px] font-semibold">
          🛡️ Out-of-Caseload Access
        </span>
      ) : (
        <span className="font-mono text-xs">{ev.event_type}</span>
      ),
      member_col: p.member_id ? `Member #${p.member_id}` : memberId ? `Member #${memberId}` : "Population",
      details: isOutOfCaseload ? (
        <div className="text-xs">
          <span className="font-semibold text-amber-800 dark:text-amber-300">
            [{p.reason_category || "Break-the-Glass"}]
          </span>{" "}
          <span>{p.reason_detail}</span>
          {p.caseload_coordinator && (
            <span className="coding-text-muted"> · Assigned Coordinator: {p.caseload_coordinator}</span>
          )}
        </div>
      ) : (
        formatPayloadText(p)
      ),
    };
  });

  const outOfCaseloadCount = events.filter((ev) =>
    String(ev.event_type || "").includes("out_of_caseload_access")
  ).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ChartTabHeader
          title="HIPAA Record Access & Change Audit Trail"
          subtitle={`${filteredEvents.length} audit event${filteredEvents.length === 1 ? "" : "s"} (${outOfCaseloadCount} out-of-caseload access logs)`}
        />
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg ring-1 coding-border overflow-hidden text-xs">
            <button
              type="button"
              onClick={() => setScope("member")}
              className={`px-2.5 py-1 font-semibold ${
                scope === "member" ? "bg-[var(--brand-primary)] text-white" : "coding-surface coding-text-strong"
              }`}
            >
              This Member
            </button>
            <button
              type="button"
              onClick={() => setScope("tenant")}
              className={`px-2.5 py-1 font-semibold ${
                scope === "tenant" ? "bg-[var(--brand-primary)] text-white" : "coding-surface coding-text-strong"
              }`}
            >
              Global Auditor View (All Members)
            </button>
          </div>
          {memberId && (
            <button
              type="button"
              onClick={() => setReasonModalOpen(true)}
              className="rounded-lg ring-1 ring-amber-400/80 bg-amber-50 text-amber-900 dark:bg-amber-900/20 dark:text-amber-200 px-2.5 py-1 text-xs font-semibold hover:opacity-90"
            >
              + Log Out-of-Caseload Access Reason
            </button>
          )}
          <button
            type="button"
            onClick={exportAuditCsv}
            className="rounded-lg ring-1 coding-border coding-text-strong px-2.5 py-1 text-xs font-semibold hover:bg-[var(--coding-hover)]"
          >
            Export Audit CSV
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {[
            { key: "all", label: "All Events" },
            { key: "out_of_caseload", label: `Out-of-Caseload Access (${outOfCaseloadCount})` },
            { key: "views", label: "Record Access & Views" },
            { key: "mutations", label: "Clinical & Task Changes" },
          ].map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setCategoryFilter(c.key)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                categoryFilter === c.key
                  ? "bg-[var(--brand-primary)] text-white"
                  : "coding-surface-subtle coding-text-strong hover:opacity-80"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search actor, event, or reason…"
          className="coding-input rounded-md px-2.5 py-1 text-xs w-60"
        />
      </div>

      {loading && <p className="text-xs coding-text-soft px-1 py-2">Loading audit events…</p>}
      {error && (
        <div className="rounded-lg ring-1 ring-rose-200 dark:ring-rose-700/40 bg-rose-50/60 dark:bg-rose-900/20 px-3 py-2 text-xs coding-text-strong">
          {error}
        </div>
      )}

      {!loading && !error && (
        <ChartTable
          columns={AUDIT_LOG_COLUMNS}
          rows={rows}
          emptyMessage="No audit events match the current filter."
        />
      )}

      {reasonModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="coding-surface rounded-2xl shadow-xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold coding-text-strong">Log Out-of-Caseload Access Reason</h3>
              <button type="button" onClick={() => setReasonModalOpen(false)} className="text-xs coding-text-muted">
                ✕
              </button>
            </div>
            <p className="text-xs coding-text-soft">
              Record a HIPAA minimum-necessary justification for accessing a member record outside your primary assigned caseload.
            </p>
            <form onSubmit={handleLogReason} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold coding-text-strong mb-1">Access Reason Category *</label>
                <select
                  value={reasonCategory}
                  onChange={(e) => setReasonCategory(e.target.value)}
                  className="coding-input w-full rounded-md px-3 py-2"
                >
                  {REASON_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-semibold coding-text-strong mb-1">Clinical / Operational Justification *</label>
                <textarea
                  rows={3}
                  value={reasonDetail}
                  onChange={(e) => setReasonDetail(e.target.value)}
                  placeholder="e.g., Covering post-discharge medication reconciliation while assigned coordinator is on shift handoff."
                  className="coding-input w-full rounded-md px-3 py-2"
                  required
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setReasonModalOpen(false)}
                  className="rounded-md ring-1 coding-border px-3 py-1.5 text-xs font-semibold coding-text-strong"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={reasonBusy}
                  className="rounded-md bg-amber-600 text-white px-4 py-1.5 text-xs font-semibold hover:bg-amber-700 disabled:opacity-50"
                >
                  {reasonBusy ? "Logging…" : "Record Access Reason"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
