import React, { useContext, useEffect, useState } from "react";
import { AuthContext } from "../../../../context/AuthContext";
import { fetchMember360MemberAudit } from "../../../../services/member360LabService";
import { ChartTabHeader, ChartTable } from "./chartPrimitives";

const AUDIT_LOG_COLUMNS = [
  { label: "Time", accessor: "time" },
  { label: "Actor", accessor: "actor" },
  { label: "Event", accessor: "event_type" },
  { label: "Payload", accessor: "details" },
];

const formatTimestamp = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
};

// Render the JSON payload as a compact, readable summary. Most member-scoped
// audit events carry a small number of useful keys (task_id, document_id,
// fields, etc.) plus member_id which we strip since it's redundant in this
// view. Unknown shapes fall back to a JSON.stringify so nothing important
// gets hidden — better verbose than misleading for compliance review.
const formatPayload = (payload) => {
  if (!payload || typeof payload !== "object") return "—";
  const filtered = Object.entries(payload).filter(([key]) => key !== "member_id");
  if (filtered.length === 0) return "—";
  return filtered
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : JSON.stringify(value)}`)
    .join("  ·  ");
};

export default function AuditLogPage({ memberId }) {
  const { token, tenant } = useContext(AuthContext) || {};
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!token || !tenant || !memberId) {
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    fetchMember360MemberAudit(token, tenant, memberId, { limit: 100 })
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
  }, [token, tenant, memberId]);

  if (loading) {
    return (
      <div>
        <ChartTabHeader title="Audit log" subtitle="Who did what, and when" />
        <p className="text-xs coding-text-soft px-1 py-2">Loading audit events…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <ChartTabHeader title="Audit log" subtitle="Who did what, and when" />
        <div className="rounded-lg ring-1 ring-rose-200 dark:ring-rose-700/40 bg-rose-50/60 dark:bg-rose-900/20 px-3 py-2 text-xs coding-text-strong">
          {error}
        </div>
      </div>
    );
  }

  const rows = events.map((ev) => ({
    id: ev.id,
    time: formatTimestamp(ev.created_at),
    actor: ev.actor || "—",
    event_type: ev.event_type,
    details: formatPayload(ev.payload),
  }));

  return (
    <div>
      <ChartTabHeader
        title="Audit log"
        subtitle={`Last ${events.length} member-scoped event${events.length === 1 ? "" : "s"}`}
      />
      <ChartTable
        columns={AUDIT_LOG_COLUMNS}
        rows={rows}
        emptyMessage="No audit events recorded for this member yet."
      />
    </div>
  );
}
