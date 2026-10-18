import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import PortalPageLayout from "../../../components/PortalPageLayout";
import AlertShell from "../../../components/ui/AlertShell";
import KpiTile from "../../../components/ui/KpiTile";
import Pill from "../../../components/ui/Pill";
import { LoadingState, ErrorState } from "../../../components/ehr/Primitives";
import { AuthContext } from "../../../context/AuthContext";
import { PORTAL_NAV_ITEMS } from "../portal_page/portalNavItems";
import {
  fetchRides,
  createRide,
  fetchPartners,
  createPartner,
  fetchRideOptions,
  fetchPayments,
} from "../../../services/rideBookingService";

const TABS = [
  { key: "rides", label: "Rides" },
  { key: "partners", label: "Partners" },
  { key: "payments", label: "Payments" },
];

const STATUS_TONE = {
  queued: "info",
  scheduled: "info",
  in_progress: "accent",
  completed: "success",
  cancelled: "danger",
  canceled: "danger",
};

const EMPTY_RIDE = {
  member_id: "",
  first_name: "",
  last_name: "",
  ride_type: "",
  pickup: "",
  pickup_address: "",
  dropoff: "",
  dropoff_address: "",
  scheduled_pickup: "",
  cost_usd: "",
};

const EMPTY_PARTNER = {
  company_name: "",
  contact_name: "",
  contact_email: "",
  contact_phone: "",
};

const formatDateTime = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
};

const formatMoney = (value) =>
  value == null ? "—" : `$${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const RideBookingPage = () => {
  const { token, tenant, isAuthenticated } = useContext(AuthContext) || {};
  const canQuery = useMemo(() => Boolean(token && tenant), [token, tenant]);

  const [tab, setTab] = useState("rides");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [rides, setRides] = useState([]);
  const [partners, setPartners] = useState([]);
  const [rideOptions, setRideOptions] = useState([]);
  const [payments, setPayments] = useState(null);

  const [showRideForm, setShowRideForm] = useState(false);
  const [rideForm, setRideForm] = useState(EMPTY_RIDE);
  const [showPartnerForm, setShowPartnerForm] = useState(false);
  const [partnerForm, setPartnerForm] = useState(EMPTY_PARTNER);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const loadRides = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ridesRes, optionsRes] = await Promise.all([
        fetchRides(token, tenant),
        fetchRideOptions(token, tenant),
      ]);
      setRides(ridesRes.items || []);
      setRideOptions(optionsRes.options || []);
    } catch (err) {
      setError(err.message || "Unable to load rides");
    } finally {
      setLoading(false);
    }
  }, [token, tenant]);

  const loadPartners = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchPartners(token, tenant);
      setPartners(res.items || []);
    } catch (err) {
      setError(err.message || "Unable to load partners");
    } finally {
      setLoading(false);
    }
  }, [token, tenant]);

  const loadPayments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchPayments(token, tenant);
      setPayments(res);
    } catch (err) {
      setError(err.message || "Unable to load payments");
    } finally {
      setLoading(false);
    }
  }, [token, tenant]);

  useEffect(() => {
    if (!isAuthenticated || !canQuery) return;
    if (tab === "rides") void loadRides();
    else if (tab === "partners") void loadPartners();
    else if (tab === "payments") void loadPayments();
  }, [tab, isAuthenticated, canQuery, loadRides, loadPartners, loadPayments]);

  const submitRide = async (event) => {
    event.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        ...rideForm,
        // datetime-local yields local time without a zone; normalise to ISO.
        scheduled_pickup: rideForm.scheduled_pickup
          ? new Date(rideForm.scheduled_pickup).toISOString()
          : undefined,
        cost_usd: rideForm.cost_usd === "" ? undefined : Number(rideForm.cost_usd),
      };
      await createRide(token, tenant, payload);
      setRideForm(EMPTY_RIDE);
      setShowRideForm(false);
      await loadRides();
    } catch (err) {
      setFormError(err.message || "Could not create ride");
    } finally {
      setSaving(false);
    }
  };

  const submitPartner = async (event) => {
    event.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      await createPartner(token, tenant, partnerForm);
      setPartnerForm(EMPTY_PARTNER);
      setShowPartnerForm(false);
      await loadPartners();
    } catch (err) {
      setFormError(err.message || "Could not add partner");
    } finally {
      setSaving(false);
    }
  };

  const rideStats = useMemo(() => {
    const queued = rides.filter((r) => r.status === "queued").length;
    const completed = rides.filter((r) => r.status === "completed").length;
    return { total: rides.length, queued, completed };
  }, [rides]);

  return (
    <PortalPageLayout
      eyebrow="Ride Booking"
      title="Transportation"
      subtitle="Schedule member rides, manage transportation partners, and reconcile payments."
      navItems={PORTAL_NAV_ITEMS}
      currentNav="ride_booking"
      navProps={{ align: "center", tone: "surface" }}
      maxWidthClassName="max-w-7xl"
      mainClassName="space-y-4"
    >
      {!isAuthenticated && (
        <AlertShell tone="warning" title="Authentication required" description="Sign in to load ride booking data." />
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
              tab === t.key
                ? "bg-[var(--brand-primary)] text-white"
                : "coding-surface coding-text-strong hover:bg-[var(--coding-hover)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <ErrorState title="Something went wrong" description={error} />}
      {!error && loading && <LoadingState title="Loading…" />}

      {/* ── Rides ─────────────────────────────────────────────────────── */}
      {!error && !loading && tab === "rides" && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <KpiTile label="Total rides" value={rideStats.total} tone="brand" />
            <KpiTile label="Queued" value={rideStats.queued} tone="info" />
            <KpiTile label="Completed" value={rideStats.completed} tone="success" />
          </div>

          <section className="coding-surface rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-2.5 flex items-center justify-between border-b coding-border">
              <span className="text-xs coding-text-muted">{rides.length} ride{rides.length === 1 ? "" : "s"}</span>
              <button
                type="button"
                onClick={() => { setShowRideForm((v) => !v); setFormError(null); }}
                disabled={!canQuery}
                className="rounded-md bg-[var(--brand-primary)] text-white px-3 py-1.5 text-sm font-semibold hover:bg-brand-700 disabled:opacity-60"
              >
                {showRideForm ? "Cancel" : "Book a ride"}
              </button>
            </div>

            {showRideForm && (
              <form onSubmit={submitRide} className="p-4 border-b coding-border grid grid-cols-1 sm:grid-cols-2 gap-3">
                {formError && <div className="sm:col-span-2"><AlertShell tone="danger" title="Could not book ride" description={formError} /></div>}
                <Field label="Member ID" required value={rideForm.member_id} onChange={(v) => setRideForm((f) => ({ ...f, member_id: v }))} />
                <Field label="Ride type" required as="select" options={rideOptions} value={rideForm.ride_type} onChange={(v) => setRideForm((f) => ({ ...f, ride_type: v }))} />
                <Field label="First name" required value={rideForm.first_name} onChange={(v) => setRideForm((f) => ({ ...f, first_name: v }))} />
                <Field label="Last name" required value={rideForm.last_name} onChange={(v) => setRideForm((f) => ({ ...f, last_name: v }))} />
                <Field label="Pickup" required value={rideForm.pickup} onChange={(v) => setRideForm((f) => ({ ...f, pickup: v }))} />
                <Field label="Pickup address" required value={rideForm.pickup_address} onChange={(v) => setRideForm((f) => ({ ...f, pickup_address: v }))} />
                <Field label="Dropoff" required value={rideForm.dropoff} onChange={(v) => setRideForm((f) => ({ ...f, dropoff: v }))} />
                <Field label="Dropoff address" required value={rideForm.dropoff_address} onChange={(v) => setRideForm((f) => ({ ...f, dropoff_address: v }))} />
                <Field label="Scheduled pickup" required type="datetime-local" value={rideForm.scheduled_pickup} onChange={(v) => setRideForm((f) => ({ ...f, scheduled_pickup: v }))} />
                <Field label="Cost (USD)" type="number" value={rideForm.cost_usd} onChange={(v) => setRideForm((f) => ({ ...f, cost_usd: v }))} />
                <div className="sm:col-span-2 flex justify-end">
                  <button type="submit" disabled={saving} className="rounded-md bg-[var(--brand-primary)] text-white px-4 py-2 text-sm font-semibold hover:bg-brand-700 disabled:opacity-60">
                    {saving ? "Booking…" : "Book ride"}
                  </button>
                </div>
              </form>
            )}

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-[11px] uppercase tracking-wider coding-text-muted">
                  <tr className="border-b coding-border">
                    <th className="text-left px-4 py-2.5 font-semibold">Member</th>
                    <th className="text-left px-3 py-2.5 font-semibold">Ride type</th>
                    <th className="text-left px-3 py-2.5 font-semibold">Pickup → Dropoff</th>
                    <th className="text-left px-3 py-2.5 font-semibold">Scheduled</th>
                    <th className="text-right px-3 py-2.5 font-semibold">Cost</th>
                    <th className="text-left px-3 py-2.5 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rides.map((r) => (
                    <tr key={r.id} className="border-b coding-border-subtle">
                      <td className="px-4 py-3">
                        <p className="coding-text-strong font-medium">{r.first_name} {r.last_name}</p>
                        <p className="text-[11px] coding-text-muted font-mono">{r.member_id}</p>
                      </td>
                      <td className="px-3 py-3 coding-text-strong">{r.ride_type}</td>
                      <td className="px-3 py-3 coding-text-strong">{r.pickup} → {r.dropoff}</td>
                      <td className="px-3 py-3 coding-text-strong">{formatDateTime(r.scheduled_pickup)}</td>
                      <td className="px-3 py-3 text-right tabular-nums coding-text-strong">{formatMoney(r.cost_usd)}</td>
                      <td className="px-3 py-3"><Pill tone={STATUS_TONE[r.status] || "neutral"}>{r.status}</Pill></td>
                    </tr>
                  ))}
                  {rides.length === 0 && (
                    <tr><td colSpan={6} className="px-3 py-12 text-center text-sm coding-text-soft">No rides yet. Book one to get started.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {/* ── Partners ──────────────────────────────────────────────────── */}
      {!error && !loading && tab === "partners" && (
        <section className="coding-surface rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 flex items-center justify-between border-b coding-border">
            <span className="text-xs coding-text-muted">{partners.length} active partner{partners.length === 1 ? "" : "s"}</span>
            <button
              type="button"
              onClick={() => { setShowPartnerForm((v) => !v); setFormError(null); }}
              disabled={!canQuery}
              className="rounded-md bg-[var(--brand-primary)] text-white px-3 py-1.5 text-sm font-semibold hover:bg-brand-700 disabled:opacity-60"
            >
              {showPartnerForm ? "Cancel" : "Add partner"}
            </button>
          </div>

          {showPartnerForm && (
            <form onSubmit={submitPartner} className="p-4 border-b coding-border grid grid-cols-1 sm:grid-cols-2 gap-3">
              {formError && <div className="sm:col-span-2"><AlertShell tone="danger" title="Could not add partner" description={formError} /></div>}
              <Field label="Company name" required value={partnerForm.company_name} onChange={(v) => setPartnerForm((f) => ({ ...f, company_name: v }))} />
              <Field label="Contact name" value={partnerForm.contact_name} onChange={(v) => setPartnerForm((f) => ({ ...f, contact_name: v }))} />
              <Field label="Contact email" type="email" value={partnerForm.contact_email} onChange={(v) => setPartnerForm((f) => ({ ...f, contact_email: v }))} />
              <Field label="Contact phone" value={partnerForm.contact_phone} onChange={(v) => setPartnerForm((f) => ({ ...f, contact_phone: v }))} />
              <div className="sm:col-span-2 flex justify-end">
                <button type="submit" disabled={saving} className="rounded-md bg-[var(--brand-primary)] text-white px-4 py-2 text-sm font-semibold hover:bg-brand-700 disabled:opacity-60">
                  {saving ? "Saving…" : "Add partner"}
                </button>
              </div>
            </form>
          )}

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wider coding-text-muted">
                <tr className="border-b coding-border">
                  <th className="text-left px-4 py-2.5 font-semibold">Company</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Contact</th>
                  <th className="text-right px-3 py-2.5 font-semibold">Schedules</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {partners.map((p) => (
                  <tr key={p.id} className="border-b coding-border-subtle">
                    <td className="px-4 py-3 coding-text-strong font-medium">{p.company_name}</td>
                    <td className="px-3 py-3 coding-text-strong">
                      {p.contact_name || <span className="coding-text-soft">—</span>}
                      {p.contact_email ? <p className="text-[11px] coding-text-muted">{p.contact_email}</p> : null}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums coding-text-strong">{(p.schedules || []).length}</td>
                    <td className="px-3 py-3"><Pill tone={p.status === "active" ? "success" : "neutral"}>{p.status}</Pill></td>
                  </tr>
                ))}
                {partners.length === 0 && (
                  <tr><td colSpan={4} className="px-3 py-12 text-center text-sm coding-text-soft">No partners yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Payments ──────────────────────────────────────────────────── */}
      {!error && !loading && tab === "payments" && payments && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {(payments.metrics || []).map((m) => (
              <KpiTile
                key={m.id}
                label={m.label}
                value={m.value}
                hint={m.meta}
                tone={m.tone === "danger" ? "critical" : m.tone === "success" ? "success" : "info"}
              />
            ))}
          </div>

          <section className="coding-surface rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-2.5 border-b coding-border text-xs coding-text-muted">Open reconciliation items</div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-[11px] uppercase tracking-wider coding-text-muted">
                  <tr className="border-b coding-border">
                    <th className="text-left px-4 py-2.5 font-semibold">Item</th>
                    <th className="text-left px-3 py-2.5 font-semibold">Priority</th>
                    <th className="text-left px-3 py-2.5 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(payments.reconciliation || []).map((item) => (
                    <tr key={item.id} className="border-b coding-border-subtle">
                      <td className="px-4 py-3">
                        <p className="coding-text-strong font-medium">{item.title}</p>
                        {item.detail ? <p className="text-[11px] coding-text-muted">{item.detail}</p> : null}
                      </td>
                      <td className="px-3 py-3"><Pill tone={item.priority === "high" ? "danger" : "neutral"}>{item.priority}</Pill></td>
                      <td className="px-3 py-3"><Pill tone="warning">{item.status}</Pill></td>
                    </tr>
                  ))}
                  {(payments.reconciliation || []).length === 0 && (
                    <tr><td colSpan={3} className="px-3 py-12 text-center text-sm coding-text-soft">No open reconciliation items.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </PortalPageLayout>
  );
};

// Small labelled input/select used by the inline forms.
const Field = ({ label, value, onChange, required = false, type = "text", as = "input", options = [] }) => (
  <label className="flex flex-col gap-1 text-sm">
    <span className="coding-text-muted text-xs font-medium">
      {label}{required ? <span className="text-red-500"> *</span> : null}
    </span>
    {as === "select" ? (
      <select
        className="rounded-md border coding-border px-2 py-2 bg-transparent coding-text-strong"
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Select…</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    ) : (
      <input
        className="rounded-md border coding-border px-2 py-2 bg-transparent coding-text-strong"
        type={type}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
      />
    )}
  </label>
);

export default RideBookingPage;
