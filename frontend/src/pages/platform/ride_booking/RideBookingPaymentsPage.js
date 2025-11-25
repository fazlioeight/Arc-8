import React, { useMemo, useState } from "react";
import { Accordion } from "react-bootstrap";
import PortalUtilityBar from "../../../components/PortalUtilityBar";
import RideBookingHeader from "./RideBookingHeader";
import "../coding/member/memberWorkspace.css";
import "../../../styles/rideBooking.css";

const PAYMENT_METRICS = [
  { id: "payouts", label: "Total payouts", value: "$182,400", trend: 8 },
  { id: "invoices", label: "Subscriber invoices", value: "$141,200", trend: 5 },
  { id: "disputes", label: "Open disputes", value: "12", trend: -3 },
  { id: "sla", label: "Avg SLA", value: "2.2 days", trend: 4 },
  { id: "collections", label: "Collections", value: "$31,900", trend: 2 },
  { id: "refunds", label: "Refunds", value: "$2,180", trend: -6 },
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

const RideBookingPaymentsPage = () => {
  const [filters, setFilters] = useState({
    timeframe: "last_30_days",
    provider: "",
    subscriber: "",
  });

  const payments = useMemo(() => getRecentPayments(filters), [filters]);

  const metricCards = PAYMENT_METRICS;

  return (
    <div className="ride-booking coding-member-workspace portal-theme min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <PortalUtilityBar />
      <RideBookingHeader
        title="Ride Payments & Billing"
        subtitle="Track payouts, invoices, and reconciliation activity for ride partners."
      />

      <div className="ride-booking__shell">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Billing overview</h2>
              <p className="text-sm text-slate-600 dark:text-slate-300">Payments, invoices, and webhook events.</p>
            </div>
            <div className="flex flex-wrap gap-2 text-sm text-slate-600 dark:text-slate-300">
              <div className="inline-flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Synced
              </div>
              <span>•</span>
              <span>Autosave: On</span>
            </div>
          </div>

          <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-inner dark:border-slate-700 dark:bg-slate-800 sm:grid-cols-2 lg:grid-cols-3">
            {metricCards.map((metric) => (
              <div key={metric.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-300">{metric.label}</div>
                <div className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">{metric.value}</div>
                <div className={`mt-1 text-xs font-semibold ${metric.trend > 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  {metric.trend > 0 ? "+" : ""}
                  {metric.trend}%
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:grid-cols-2 lg:grid-cols-3">
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
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900" aria-labelledby="provider-payouts">
              <header className="flex items-center justify-between">
                <div>
                  <h3 id="provider-payouts" className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    Provider payouts
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-300">Top payouts across partners.</p>
                </div>
                <button className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-slate-500 dark:hover:bg-slate-700">
                  Export CSV
                </button>
              </header>
              <div className="mt-3 overflow-x-auto">
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
                          <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700 ring-1 ring-emerald-200">
                            {row.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900" aria-labelledby="subscriber-invoices">
              <header className="flex items-center justify-between">
                <div>
                  <h3 id="subscriber-invoices" className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    Subscriber invoices
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-300">Latest invoices issued to subscribers.</p>
                </div>
                <button className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-slate-500 dark:hover:bg-slate-700">
                  Export PDF
                </button>
              </header>
              <div className="mt-3 overflow-x-auto">
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
                          <span className="inline-flex items-center rounded-full bg-sky-100 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-sky-700 ring-1 ring-sky-200">
                            {row.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <section className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <header className="mb-2">
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Reconciliation queue</h3>
                <p className="text-sm text-slate-500 dark:text-slate-300">Items requiring manual review.</p>
              </header>
              <ul className="space-y-3">
                {payments.reconciliation.map((item) => (
                  <li key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 shadow-inner dark:border-slate-700 dark:bg-slate-800">
                    <div className="flex items-center justify-between text-sm text-slate-800 dark:text-slate-100">
                      <div className="font-semibold">{item.title}</div>
                      <span className="text-xs text-slate-500 dark:text-slate-300">{item.date}</span>
                    </div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-300">{item.detail}</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-slate-500 dark:hover:bg-slate-700">
                        Resolve
                      </button>
                      <button className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-slate-500 dark:hover:bg-slate-700">
                        Open invoice
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <header className="mb-2">
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Webhook feed</h3>
                <p className="text-sm text-slate-500 dark:text-slate-300">Recent webhook events for payments.</p>
              </header>
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
            </div>
          </section>

          <section className="mt-6">
            <Accordion defaultActiveKey="0">
              <Accordion.Item eventKey="0">
                <Accordion.Header>Reference diagrams</Accordion.Header>
                <Accordion.Body>
                  <div className="grid gap-3 sm:grid-cols-2">
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
          </section>
        </div>
      </div>
    </div>
  );
};

export default RideBookingPaymentsPage;
