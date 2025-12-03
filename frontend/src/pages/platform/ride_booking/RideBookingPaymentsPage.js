import React, { useMemo, useState } from "react";
import { Accordion } from "react-bootstrap";
import PortalPageLayout from "../../../components/PortalPageLayout";
import PortalPageHeader from "../../../components/PortalPageHeader";
import PortalCard from "../../../components/PortalCard";
import PortalStat from "../../../components/PortalStat";
import "../coding/member/memberWorkspace.css";
import { RIDE_NAV_ITEMS } from "./rideNavItems";

const PAYMENT_METRICS = [
  { id: "payouts", label: "Total payouts", value: "$182,400", trend: 8, meta: "Last 30d", tone: "success" },
  { id: "invoices", label: "Subscriber invoices", value: "$141,200", trend: 5, meta: "Last 30d", tone: "info" },
  { id: "disputes", label: "Open disputes", value: "12", trend: -3, meta: "Needs review", tone: "danger" },
  { id: "sla", label: "Avg SLA", value: "2.2 days", trend: 4, meta: "Payout cycle", tone: "warning" },
  { id: "collections", label: "Collections", value: "$31,900", trend: 2, meta: "Outstanding", tone: "info" },
  { id: "refunds", label: "Refunds", value: "$2,180", trend: -6, meta: "Processed", tone: "warning" },
];

const PAYMENT_FILTERS = {
  timeframe: [
    { value: "last_7_days", label: "Last 7 days" },
    { value: "last_30_days", label: "Last 30 days" },
    { value: "qtr", label: "This quarter" },
    { value: "ytd", label: "Year to date" },
  ],
  providers: [
    { value: "", label: "All providers" },
    { value: "SwiftLift", label: "SwiftLift" },
    { value: "CareRide", label: "CareRide" },
    { value: "Metro Wheels", label: "Metro Wheels" },
  ],
  subscribers: [
    { value: "", label: "All subscribers" },
    { value: "Horizon Health", label: "Horizon Health" },
    { value: "Beacon Clinics", label: "Beacon Clinics" },
    { value: "TriCity Medical", label: "TriCity Medical" },
  ],
};

const WEBHOOK_FEED = [
  { id: "wh-1", source: "Stripe", event: "payment_intent.succeeded", detail: "Payment for invoice INV-4312 succeeded", ts: "2025-05-12 10:21 PT" },
  { id: "wh-2", source: "Stripe", event: "invoice.payment_failed", detail: "Subscriber Horizon Health payment failed", ts: "2025-05-12 09:54 PT" },
  { id: "wh-3", source: "Custom", event: "ride.payout.created", detail: "Provider Metro Wheels payout initiated", ts: "2025-05-11 18:14 PT" },
  { id: "wh-4", source: "Custom", event: "ride.invoice.generated", detail: "Monthly invoice generated for Beacon Clinics", ts: "2025-05-11 07:32 PT" },
];

const SAMPLE_PAYMENTS = {
  providers: [
    { provider: "SwiftLift", invoice: "INV-4102", amount: 38210, status: "Paid" },
    { provider: "CareRide", invoice: "INV-4128", amount: 27440, status: "Pending" },
    { provider: "Metro Wheels", invoice: "INV-4177", amount: 18990, status: "Paid" },
    { provider: "CareRide", invoice: "INV-4189", amount: 16330, status: "In review" },
  ],
  subscribers: [
    { subscriber: "Horizon Health", invoice: "SUB-5512", amount: 42110, status: "Open" },
    { subscriber: "Beacon Clinics", invoice: "SUB-5531", amount: 31800, status: "Paid" },
    { subscriber: "TriCity Medical", invoice: "SUB-5542", amount: 24880, status: "Open" },
    { subscriber: "Horizon Health", invoice: "SUB-5555", amount: 20850, status: "Paid" },
  ],
  reconciliation: [
    { id: "rec-1", title: "Duplicate ride ID", detail: "Ride 9921 listed twice in payout batch #2104.", date: "May 12" },
    { id: "rec-2", title: "Bank reject", detail: "SwiftLift payout rejected: routing mismatch.", date: "May 11" },
    { id: "rec-3", title: "Invoice dispute", detail: "TriCity Medical disputed late cancel fee.", date: "May 10" },
  ],
  diagrams: [
    { id: "d1", title: "Billing flow", caption: "Ride -> invoice -> payout -> reconciliation" },
    { id: "d2", title: "Webhook contract", caption: "Stripe + internal events mapped to ride states" },
    { id: "d3", title: "SLA timeline", caption: "Provider payout SLA across batch windows" },
  ],
};

const getRecentPayments = (filters) => {
  const matchProvider = (row) => !filters.provider || row.provider === filters.provider;
  const matchSubscriber = (row) => !filters.subscriber || row.subscriber === filters.subscriber;

  return {
    providers: SAMPLE_PAYMENTS.providers.filter(matchProvider),
    subscribers: SAMPLE_PAYMENTS.subscribers.filter(matchSubscriber),
    reconciliation: SAMPLE_PAYMENTS.reconciliation,
    diagrams: SAMPLE_PAYMENTS.diagrams,
  };
};

const toneForStatus = (status) => {
  switch (status.toLowerCase()) {
    case "paid":
      return "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200";
    case "pending":
      return "bg-amber-100 text-amber-800 ring-1 ring-amber-200";
    case "in review":
      return "bg-sky-100 text-sky-700 ring-1 ring-sky-200";
    case "open":
      return "bg-slate-100 text-slate-700 ring-1 ring-slate-200";
    default:
      return "bg-slate-100 text-slate-700 ring-1 ring-slate-200";
  }
};

const RideBookingPaymentsPage = () => {
  const [filters, setFilters] = useState({
    timeframe: "last_30_days",
    provider: "",
    subscriber: "",
  });

  const payments = useMemo(() => getRecentPayments(filters), [filters]);
  const layoutProps = useMemo(
    () => ({
      backgroundClassName:
        "coding-member-workspace portal-theme bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100",
      maxWidthClassName: "max-w-6xl",
      paddingClassName: "px-4",
      navItems: RIDE_NAV_ITEMS,
      currentNav: "ride-payments",
    }),
    []
  );

  const headerContent = (
    <PortalPageHeader
      eyebrow="Ride payments"
      title="Ride Payments & Billing"
      subtitle="Track payouts, invoices, and reconciliation activity for ride partners."
      actions={
        <div className="flex flex-wrap items-center gap-3">
          <PortalStat label="Total payouts" value="$182,400" meta="Last 30d" tone="success" />
          <PortalStat label="Invoices" value="$141,200" meta="Subscribers" tone="info" />
          <PortalStat label="Disputes" value="12" meta="Open items" tone="danger" />
        </div>
      }
    />
  );

  return (
    <PortalPageLayout {...layoutProps} headerContent={headerContent}>
      <PortalCard title="Filters" subtitle="Slice payments by date range, provider, or subscriber.">
        <div className="portal-section-grid">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300" htmlFor="timeframe">
              Timeframe
            </label>
            <select
              id="timeframe"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-sky-400 dark:focus:ring-sky-500/40"
              value={filters.timeframe}
              onChange={(e) => setFilters((prev) => ({ ...prev, timeframe: e.target.value }))}
            >
              {PAYMENT_FILTERS.timeframe.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300" htmlFor="provider">
              Provider
            </label>
            <select
              id="provider"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-sky-400 dark:focus:ring-sky-500/40"
              value={filters.provider}
              onChange={(e) => setFilters((prev) => ({ ...prev, provider: e.target.value }))}
            >
              {PAYMENT_FILTERS.providers.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300" htmlFor="subscriber">
              Subscriber
            </label>
            <select
              id="subscriber"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-sky-400 dark:focus:ring-sky-500/40"
              value={filters.subscriber}
              onChange={(e) => setFilters((prev) => ({ ...prev, subscriber: e.target.value }))}
            >
              {PAYMENT_FILTERS.subscribers.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col justify-between gap-2">
            <span className="portal-pill portal-pill--ghost">Autosave: On</span>
            <span className="text-xs text-slate-500 dark:text-slate-400">Synced moments ago</span>
          </div>
        </div>
      </PortalCard>

      <PortalCard title="Billing overview" subtitle="High-level payout, invoice, and dispute signals." compact>
        <div className="portal-section-grid">
          {PAYMENT_METRICS.map((metric) => (
            <PortalStat
              key={metric.id}
              label={metric.label}
              value={metric.value}
              meta={`${metric.meta} | ${metric.trend > 0 ? "+" : ""}${metric.trend}%`}
              tone={metric.tone}
            />
          ))}
        </div>
      </PortalCard>

      <PortalCard
        title="Provider payouts"
        subtitle="Top payouts across partners."
        actions={<button className="portal-ghost-button">Export CSV</button>}
      >
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                  Provider
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                  Invoice #
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                  Amount
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {payments.providers.map((row) => (
                <tr key={row.invoice} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                  <td className="px-3 py-2 text-slate-900 dark:text-slate-100">{row.provider}</td>
                  <td className="px-3 py-2 text-slate-900 dark:text-slate-100">{row.invoice}</td>
                  <td className="px-3 py-2 text-slate-900 dark:text-slate-100">${row.amount.toLocaleString()}</td>
                  <td className="px-3 py-2 text-slate-900 dark:text-slate-100">
                    <span className={`inline-flex items-center rounded-full px-2 py-1 text-[11px] font-semibold uppercase tracking-wide ${toneForStatus(row.status)}`}>
                      {row.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PortalCard>

      <PortalCard
        title="Subscriber invoices"
        subtitle="Latest invoices issued to subscribers."
        actions={<button className="portal-ghost-button">Export PDF</button>}
      >
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                  Subscriber
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                  Invoice #
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                  Amount
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {payments.subscribers.map((row) => (
                <tr key={row.invoice} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                  <td className="px-3 py-2 text-slate-900 dark:text-slate-100">{row.subscriber}</td>
                  <td className="px-3 py-2 text-slate-900 dark:text-slate-100">{row.invoice}</td>
                  <td className="px-3 py-2 text-slate-900 dark:text-slate-100">${row.amount.toLocaleString()}</td>
                  <td className="px-3 py-2 text-slate-900 dark:text-slate-100">
                    <span className={`inline-flex items-center rounded-full px-2 py-1 text-[11px] font-semibold uppercase tracking-wide ${toneForStatus(row.status)}`}>
                      {row.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PortalCard>

      <div className="portal-section-grid">
        <PortalCard tone="warning" title="Reconciliation queue" subtitle="Items requiring manual review.">
          <ul className="space-y-3">
            {payments.reconciliation.map((item) => (
              <li key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 shadow-inner dark:border-slate-700 dark:bg-slate-800">
                <div className="flex items-center justify-between text-sm text-slate-800 dark:text-slate-100">
                  <div className="font-semibold">{item.title}</div>
                  <span className="text-xs text-slate-500 dark:text-slate-300">{item.date}</span>
                </div>
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-300">{item.detail}</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button className="portal-ghost-button">Resolve</button>
                  <button className="portal-ghost-button">Open invoice</button>
                </div>
              </li>
            ))}
          </ul>
        </PortalCard>

        <PortalCard title="Webhook feed" subtitle="Recent webhook events for payments.">
          <ul className="space-y-3">
            {WEBHOOK_FEED.map((entry) => (
              <li key={entry.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 shadow-inner dark:border-slate-700 dark:bg-slate-800">
                <div className="flex items-center justify-between text-sm text-slate-800 dark:text-slate-100">
                  <span className="font-semibold">{entry.source}</span>
                  <code className="rounded bg-slate-900 px-2 py-1 text-xs text-white">{entry.event}</code>
                </div>
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-300">{entry.detail}</div>
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-300">{entry.ts}</div>
              </li>
            ))}
          </ul>
        </PortalCard>
      </div>

      <PortalCard title="Reference diagrams" subtitle="Share the billing model and webhook contract across the team." compact>
        <Accordion defaultActiveKey="0">
          <Accordion.Item eventKey="0">
            <Accordion.Header>Reference diagrams</Accordion.Header>
            <Accordion.Body>
              <div className="portal-section-grid">
                {payments.diagrams.map((diagram) => (
                  <figure
                    key={diagram.id}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800 shadow-inner dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <div className="text-sm font-semibold">{diagram.title}</div>
                    <div className="mt-2 text-xs text-slate-500 dark:text-slate-300">{diagram.caption}</div>
                  </figure>
                ))}
              </div>
            </Accordion.Body>
          </Accordion.Item>
        </Accordion>
      </PortalCard>
    </PortalPageLayout>
  );
};

export default RideBookingPaymentsPage;
