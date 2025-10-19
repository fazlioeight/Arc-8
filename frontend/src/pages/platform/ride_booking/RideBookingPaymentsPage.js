import React, { useMemo, useState } from 'react';
import {
  Alert,
  Accordion,
  Badge,
  Button,
  ButtonGroup,
  Form,
  Table,
} from 'react-bootstrap';

import PortalUtilityBar from '../../../components/PortalUtilityBar';
import RideBookingHeader from './RideBookingHeader';
import '../../../styles/rideBooking.css';

const PLANTUML_BASE_URL = 'https://www.plantuml.com/plantuml/svg/';

const INITIAL_PAYOUTS = [
  {
    id: 'pay-1001',
    provider: 'Uber Health',
    partnerType: 'Network',
    amount: 3421.25,
    currency: 'USD',
    scheduledFor: '2025-10-21T16:00:00Z',
    method: 'Virtual card',
    rideCount: 18,
    status: 'scheduled',
  },
  {
    id: 'pay-1002',
    provider: 'Lyft Assist',
    partnerType: 'Network',
    amount: 2810.1,
    currency: 'USD',
    scheduledFor: '2025-10-19T19:00:00Z',
    method: 'ACH',
    rideCount: 14,
    status: 'processing',
  },
  {
    id: 'pay-1003',
    provider: 'Austin Care Vans',
    partnerType: '3rd Party Driver',
    amount: 965.45,
    currency: 'USD',
    scheduledFor: '2025-10-17T14:30:00Z',
    method: 'Stripe Connect',
    rideCount: 6,
    status: 'paid',
    paidAt: '2025-10-18T01:05:00Z',
  },
];

const INITIAL_INVOICES = [
  {
    id: 'inv-2087',
    subscriber: 'Lone Star Health',
    periodStart: '2025-09-01',
    periodEnd: '2025-09-30',
    dueDate: '2025-10-20',
    total: 14875.52,
    status: 'sent',
    autoPay: true,
    lastSentAt: '2025-10-05T12:10:00Z',
  },
  {
    id: 'inv-2088',
    subscriber: 'Acme Biotech',
    periodStart: '2025-09-01',
    periodEnd: '2025-09-30',
    dueDate: '2025-10-14',
    total: 6230.75,
    status: 'overdue',
    autoPay: false,
    lastSentAt: '2025-10-01T15:00:00Z',
    lastReminderAt: '2025-10-16T13:10:00Z',
  },
  {
    id: 'inv-2089',
    subscriber: 'Sunrise Clinics',
    periodStart: '2025-10-01',
    periodEnd: '2025-10-31',
    dueDate: '2025-11-14',
    total: 4021.2,
    status: 'draft',
    autoPay: true,
    lastSentAt: null,
  },
];

const INITIAL_RECONCILIATION = [
  {
    id: 'adj-3101',
    rideId: 'ride-1003',
    provider: 'Uber Health',
    variance: -4.8,
    type: 'fare_delta',
    reason: 'Provider receipt lower than ledger',
    assignedTo: 'finance@nexora.com',
    status: 'open',
  },
  {
    id: 'adj-3102',
    rideId: 'ride-1011',
    provider: 'Lyft Assist',
    variance: 12.5,
    type: 'surcharge',
    reason: 'Additional wait time charge',
    assignedTo: 'ops@nexora.com',
    status: 'in_progress',
  },
  {
    id: 'adj-3103',
    rideId: 'ride-1024',
    provider: 'Austin Care Vans',
    variance: -18.75,
    type: 'refund',
    reason: 'Duplicate charge reversed',
    assignedTo: 'finance@nexora.com',
    status: 'resolved',
  },
];

const RECENT_WEBHOOKS = [
  {
    id: 'wh-901',
    receivedAt: '2025-10-18T18:42:10Z',
    source: 'Stripe Billing',
    event: 'invoice.payment_succeeded',
    reference: 'inv-2086',
    status: 'processed',
  },
  {
    id: 'wh-902',
    receivedAt: '2025-10-18T16:12:33Z',
    source: 'Uber Health',
    event: 'trip.completed',
    reference: 'ride-1050',
    status: 'processed',
  },
  {
    id: 'wh-903',
    receivedAt: '2025-10-18T14:01:09Z',
    source: 'Stripe Connect',
    event: 'payout.paid',
    reference: 'pay-1003',
    status: 'processed',
  },
  {
    id: 'wh-904',
    receivedAt: '2025-10-18T11:27:58Z',
    source: 'Lyft Assist',
    event: 'trip.canceled',
    reference: 'ride-1064',
    status: 'investigating',
  },
];

const REFERENCE_DIAGRAMS = [
  {
    id: 'money_flow',
    title: 'Money and data flow',
    description: 'Trace passenger bookings to provider payouts and subscriber invoices.',
    encoded:
      'bLHDYzim4BthLmpf9O6474ekUoZhU2bTA3Jiqa8fEIYox8YLDTwHd19A_tj7ifqr2KdPaoNvpTFJcuzx7oI5jhR2wZ90G21JxGCKXhGA1ftmByOracGD2ki6dNRXEHojXWYGhh9w1Cc8y7UE5Wa-h5Oh8QGAlDv8xxMhDFNxIIwjXPofD45MyNS2qdShSUA5oNExyuhCZb7JlFK1QrxbB4Ewuoo5l264S5Xmp4zi-K8hGubK9yomWJy2uDSQaULMy8tKNlj0aWLjuu-DFDPyFtDgEXYbq-7QM1lHuxElkk2dRCLV8PJ5je39Xl1W2ar-qjtnFIhEDeyT_CZ63fkFL2msxFWH7iWSE68R5VRhCMCd1fwaiGFhSo3JQEWbRKT7EJh7hgMZBF-o_64ufv8TbbJu93HP2ul5foi6m1taf6NWjF93EBUlBV-3SfmycAA3dTvBMyx45Pfqm-dvp1fXi8JN5fbxoJNaIiEfc68Jgmkosqmdx_xFjBx9r3lCD0_6DpAe_IamdmanadpJey_6iQqAVPX3hOCiP91YfFBzmOEmzqVUDgwhKOvzqWgfI6cTGzCNwhmd2wQPGwcr5vVbtn5TbXDpClP41TFetJ9vm3SrIB6A54DdLqdFohPZn9PnF81YYpIfHOg-BSH56vu_CgigqjLGldwUPbNBsrhIIzjS8pZhA2PwzBxLODm16HNLZ0RCQ1fTYOw-3B7Jw5pUsN2EJE6NtjpnCWIhK-Sx3AOqIgOXVAzT4OVqFm00',
  },
  {
    id: 'booking_sequence',
    title: 'Booking → settlement sequence',
    description: 'Detailed sequence for booking, payouts, invoicing, and cash application.',
    encoded:
      'RLJ1Rk8m4BtxAqRT2sXJEFNGbLWr2PMAX0GBoqezLSQPfbuIsxKdRFdx7GT22kebIZpllPbvVif38EcfgIiHTjeuwMKD0TyRD0fJx-s_t5RMmxUxkxil49dzoAmlq9zGz_VtGaX5_9wMQ4WmdBJIJXg2cuLNRnZ8IwxVW0omMELFbv2bjtlDUf0kPp26gTTxF6ANgyMVAwmyrDmZ7ClfioWaoQqC23TpBCeJR_uulQHbkggqATjYDflFBwjhyjeXV0Qjioj8imtAw-sfmNgJ2T5k2xS_svNW1-GU9I5utWK6JeQ0XWTAOBaPJnS95EWe0MK3WM8Y-g5eYImGzsI1Nuqb76VMxaHxqakdIZ4RliFZxvIViSMBBivythVllvfD7s70LqnDc6nP38i4tgFqK8n6eslfTGk4nh6J6620vjRRXZ01fnLpRnlt9I-tjQkGiE1vNhMHrKkx6W-72hMZg-4shVxbSAgJI3ufV78bVMRYAiQEXLsNae145SOKY8ZexUDizAY1ahuOvzOOL4oM1zvfs16E8wrGSOwFPd90JU0GQsluxauYB-wOjg4GaqaN3yWFgk8Bnb4vIg2sXjwgmn0c4n63rQkdPUcnx08HO7k0S0xHE9fnHOY6ikzGIxzhN08aFp0a88k_JQ0sz6V2EkklMvkzrGhPU9wEFmdh81WGOPk8MwCfEfI8Hvr0z6kGva_ZdAqQdZYTwRKcU6rC4O0ik4hIg_Nrb_wTf2yjx5VjJNpWGU9Fvpy0',
  },
];

const TIMEFRAME_OPTIONS = [
  { value: '30', label: 'Last 30 days' },
  { value: '60', label: 'Last 60 days' },
  { value: '90', label: 'Last 90 days' },
];

const STATUS_VARIANTS = {
  paid: 'paid',
  processing: 'processing',
  scheduled: 'queued',
  overdue: 'overdue',
  sent: 'sent',
  draft: 'draft',
  open: 'queued',
  in_progress: 'in_progress',
  resolved: 'completed',
  processed: 'completed',
  investigating: 'overdue',
};

const formatCurrency = (amount, currency = 'USD') => {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
};

const formatDateTime = (iso) => {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
};

const formatDate = (iso) => {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString();
};

const RideBookingPaymentsPage = () => {
  const [timeframe, setTimeframe] = useState('30');
  const [subscriber, setSubscriber] = useState('all');
  const [payouts, setPayouts] = useState(INITIAL_PAYOUTS);
  const [invoices, setInvoices] = useState(INITIAL_INVOICES);
  const [reconciliation, setReconciliation] = useState(INITIAL_RECONCILIATION);
  const [syncNotice, setSyncNotice] = useState(null);

  const timeframeCutoff = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - Number(timeframe));
    return cutoff;
  }, [timeframe]);

  const subscriberOptions = useMemo(() => {
    const base = new Set(invoices.map((invoice) => invoice.subscriber));
    return ['all', ...Array.from(base)];
  }, [invoices]);

  const filteredPayouts = useMemo(() => {
    return payouts.filter((payout) => new Date(payout.scheduledFor) >= timeframeCutoff);
  }, [payouts, timeframeCutoff]);

  const filteredInvoices = useMemo(() => {
    return invoices.filter((invoice) => {
      const dueDate = new Date(invoice.dueDate);
      const inWindow = dueDate >= timeframeCutoff;
      const matchesSubscriber = subscriber === 'all' || invoice.subscriber === subscriber;
      return inWindow && matchesSubscriber;
    });
  }, [invoices, subscriber, timeframeCutoff]);

  const outstandingInvoices = useMemo(
    () => filteredInvoices.filter((invoice) => invoice.status !== 'paid'),
    [filteredInvoices],
  );

  const metrics = useMemo(() => {
    const pendingPayouts = filteredPayouts.filter((payout) => payout.status !== 'paid');
    const pendingPayoutTotal = pendingPayouts.reduce((sum, payout) => sum + payout.amount, 0);
    const outstandingTotal = outstandingInvoices.reduce((sum, invoice) => sum + invoice.total, 0);
    const autopayInvoices = filteredInvoices.filter((invoice) => invoice.autoPay);
    const autopayRate = filteredInvoices.length
      ? Math.round((autopayInvoices.length / filteredInvoices.length) * 100)
      : 0;
    const netCash = outstandingTotal - pendingPayoutTotal;

    return [
      {
        id: 'outstanding-invoices',
        label: 'Outstanding invoices',
        value: formatCurrency(outstandingTotal),
        trend: `${outstandingInvoices.length} open`,
      },
      {
        id: 'pending-payouts',
        label: 'Pending provider payouts',
        value: formatCurrency(pendingPayoutTotal),
        trend: `${pendingPayouts.length} pending`,
      },
      {
        id: 'autopay-rate',
        label: 'Autopay coverage',
        value: `${autopayRate}%`,
        trend: `${autopayInvoices.length} of ${filteredInvoices.length || 0} subscribers`,
      },
      {
        id: 'net-cash',
        label: 'Net cash impact',
        value: formatCurrency(netCash),
        trend: netCash >= 0 ? 'Positive inflow' : 'Outflow risk',
      },
    ];
  }, [filteredInvoices, filteredPayouts, outstandingInvoices]);

  const openAdjustments = useMemo(
    () => reconciliation.filter((item) => item.status !== 'resolved'),
    [reconciliation],
  );

  const handleMarkPayoutPaid = (id) => {
    setPayouts((current) =>
      current.map((payout) =>
        payout.id === id
          ? {
              ...payout,
              status: 'paid',
              paidAt: new Date().toISOString(),
            }
          : payout,
      ),
    );
  };

  const handleSendReminder = (id) => {
    setInvoices((current) =>
      current.map((invoice) =>
        invoice.id === id
          ? {
              ...invoice,
              lastReminderAt: new Date().toISOString(),
            }
          : invoice,
      ),
    );
  };

  const handleFinalizeDraft = (id) => {
    setInvoices((current) =>
      current.map((invoice) =>
        invoice.id === id
          ? {
              ...invoice,
              status: 'sent',
              lastSentAt: new Date().toISOString(),
            }
          : invoice,
      ),
    );
  };

  const handleResolveAdjustment = (id) => {
    setReconciliation((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              status: 'resolved',
            }
          : item,
      ),
    );
  };

  const handleRunReconciliation = () => {
    setSyncNotice({
      type: 'success',
      message: `Nightly reconciliation queued for ${new Date().toLocaleTimeString()}. We will email finance once adjustments are posted.`,
    });
  };

  const handleGenerateDrafts = () => {
    setSyncNotice({
      type: 'info',
      message: 'Draft invoices will refresh in Stripe Billing in a few minutes. Check invoice-creation logs for progress.',
    });
  };

  const renderStatusBadge = (status) => {
    const variantKey = STATUS_VARIANTS[status] || 'queued';
    return (
      <span className={`ride-booking__status ride-booking__status--${variantKey}`}>
        {status.replace('_', ' ')}
      </span>
    );
  };

  return (
    <div className="ride-booking">
      <PortalUtilityBar />
      <RideBookingHeader
        title="Ride payments console"
        subtitle="Track provider payouts, subscriber invoices, and reconciliation tasks for the ride booking program."
      />

      <div className="ride-booking__shell ride-booking__feature-shell">
        {syncNotice && (
          <Alert
            variant={syncNotice.type}
            onClose={() => setSyncNotice(null)}
            dismissible
            className="ride-booking__feature-alert"
          >
            {syncNotice.message}
          </Alert>
        )}

        <div className="ride-booking__feature-metrics">
          {metrics.map((metric) => (
            <div key={metric.id} className="ride-booking__metric-card">
              <div className="ride-booking__metric-label">{metric.label}</div>
              <div className="ride-booking__metric-value">{metric.value}</div>
              <div className="ride-booking__metric-trend">{metric.trend}</div>
            </div>
          ))}
        </div>

        <div className="ride-booking__feature-filters">
          <Form.Group controlId="timeframe" className="ride-booking__filter">
            <Form.Label>Time window</Form.Label>
            <Form.Select value={timeframe} onChange={(event) => setTimeframe(event.target.value)}>
              {TIMEFRAME_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Form.Select>
          </Form.Group>
          <Form.Group controlId="subscriber" className="ride-booking__filter">
            <Form.Label>Subscriber</Form.Label>
            <Form.Select value={subscriber} onChange={(event) => setSubscriber(event.target.value)}>
              {subscriberOptions.map((option) => (
                <option key={option} value={option}>
                  {option === 'all' ? 'All subscribers' : option}
                </option>
              ))}
            </Form.Select>
          </Form.Group>
          <div className="ride-booking__feature-actions">
            <ButtonGroup size="sm">
              <Button variant="outline-primary" onClick={handleRunReconciliation}>
                Run reconciliation now
              </Button>
              <Button variant="outline-secondary" onClick={handleGenerateDrafts}>
                Refresh draft invoices
              </Button>
            </ButtonGroup>
          </div>
        </div>

        <div className="ride-booking__feature-grid">
          <section className="ride-booking__feature-card" aria-labelledby="provider-payouts">
            <header className="ride-booking__feature-cardhead">
              <div>
                <h2 id="provider-payouts" className="h5 mb-1">
                  Provider payouts
                </h2>
                <p className="text-muted small mb-0">
                  Monitor upcoming settlements across virtual cards, ACH, and Stripe Connect.
                </p>
              </div>
            </header>
            <div className="ride-booking__tablewrap">
              <Table hover responsive size="sm" className="ride-booking__table">
                <thead>
                  <tr>
                    <th>Provider</th>
                    <th>Amount</th>
                    <th>Scheduled</th>
                    <th>Method</th>
                    <th>Rides</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filteredPayouts.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center text-muted py-4">
                        No payouts in this window.
                      </td>
                    </tr>
                  )}
                  {filteredPayouts.map((payout) => (
                    <tr key={payout.id}>
                      <td>
                        <div className="fw-semibold">{payout.provider}</div>
                        <div className="text-muted small">{payout.partnerType}</div>
                      </td>
                      <td>{formatCurrency(payout.amount, payout.currency)}</td>
                      <td>{formatDateTime(payout.status === 'paid' ? payout.paidAt || payout.scheduledFor : payout.scheduledFor)}</td>
                      <td>{payout.method}</td>
                      <td>{payout.rideCount}</td>
                      <td>{renderStatusBadge(payout.status)}</td>
                      <td className="text-end">
                        {payout.status !== 'paid' ? (
                          <Button
                            size="sm"
                            variant="outline-success"
                            onClick={() => handleMarkPayoutPaid(payout.id)}
                          >
                            Mark paid
                          </Button>
                        ) : (
                          <Badge bg="secondary" pill>
                            Paid
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </section>

          <section className="ride-booking__feature-card" aria-labelledby="subscriber-invoices">
            <header className="ride-booking__feature-cardhead">
              <div>
                <h2 id="subscriber-invoices" className="h5 mb-1">
                  Subscriber invoices
                </h2>
                <p className="text-muted small mb-0">
                  Keep tabs on open balances and quickly trigger follow-ups from the console.
                </p>
              </div>
            </header>
            <div className="ride-booking__tablewrap">
              <Table hover responsive size="sm" className="ride-booking__table">
                <thead>
                  <tr>
                    <th>Subscriber</th>
                    <th>Period</th>
                    <th>Due</th>
                    <th>Total</th>
                    <th>Autopay</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filteredInvoices.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center text-muted py-4">
                        No invoices match your filters.
                      </td>
                    </tr>
                  )}
                  {filteredInvoices.map((invoice) => (
                    <tr key={invoice.id}>
                      <td>
                        <div className="fw-semibold">{invoice.subscriber}</div>
                        <div className="text-muted small">{invoice.id}</div>
                      </td>
                      <td>
                        {formatDate(invoice.periodStart)} – {formatDate(invoice.periodEnd)}
                      </td>
                      <td>{formatDate(invoice.dueDate)}</td>
                      <td>{formatCurrency(invoice.total)}</td>
                      <td>
                        {invoice.autoPay ? (
                          <Badge bg="primary" pill>
                            Autopay
                          </Badge>
                        ) : (
                          <Badge bg="warning" pill text="dark">
                            Manual
                          </Badge>
                        )}
                      </td>
                      <td>{renderStatusBadge(invoice.status)}</td>
                      <td className="text-end">
                        <div className="ride-booking__table-actions">
                          {invoice.status === 'draft' ? (
                            <Button
                              size="sm"
                              variant="outline-primary"
                              onClick={() => handleFinalizeDraft(invoice.id)}
                            >
                              Finalize &amp; send
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline-secondary"
                              onClick={() => handleSendReminder(invoice.id)}
                            >
                              Send reminder
                            </Button>
                          )}
                          {invoice.lastReminderAt && (
                            <span className="text-muted small">
                              Last reminder {formatDateTime(invoice.lastReminderAt)}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </section>

          <section className="ride-booking__feature-card" aria-labelledby="reconciliation-queue">
            <header className="ride-booking__feature-cardhead">
              <div>
                <h2 id="reconciliation-queue" className="h5 mb-1">
                  Reconciliation queue
                </h2>
                <p className="text-muted small mb-0">
                  Resolve variances between provider receipts and the ride ledger.
                </p>
              </div>
              <Badge bg="secondary">{openAdjustments.length} open</Badge>
            </header>
            <ul className="ride-booking__recon-list">
              {reconciliation.map((item) => (
                <li key={item.id} className="ride-booking__recon-item">
                  <div>
                    <div className="ride-booking__recon-title">
                      {item.provider} · Ride {item.rideId}
                    </div>
                    <div className="ride-booking__recon-meta">
                      <span>
                        Variance {formatCurrency(item.variance)}
                      </span>
                      <span>{item.reason}</span>
                      <span>{item.assignedTo}</span>
                    </div>
                  </div>
                  <div className="ride-booking__recon-actions">
                    {renderStatusBadge(item.status)}
                    {item.status !== 'resolved' && (
                      <Button
                        size="sm"
                        variant="outline-success"
                        onClick={() => handleResolveAdjustment(item.id)}
                      >
                        Resolve
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="ride-booking__feature-card" aria-labelledby="webhook-feed">
            <header className="ride-booking__feature-cardhead">
              <div>
                <h2 id="webhook-feed" className="h5 mb-1">
                  Live webhook feed
                </h2>
                <p className="text-muted small mb-0">
                  Monitor inbound events from Stripe and provider integrations.
                </p>
              </div>
            </header>
            <ul className="ride-booking__webhook-list">
              {RECENT_WEBHOOKS.map((entry) => (
                <li key={entry.id} className="ride-booking__webhook-item">
                  <div>
                    <div className="ride-booking__webhook-event">
                      <span className="ride-booking__webhook-source">{entry.source}</span>
                      <code className="ride-booking__inline-code">{entry.event}</code>
                    </div>
                    <div className="ride-booking__webhook-meta">
                      <span>{formatDateTime(entry.receivedAt)}</span>
                      <span>Ref {entry.reference}</span>
                    </div>
                  </div>
                  <div>{renderStatusBadge(entry.status)}</div>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <section className="ride-booking__feature-card" aria-labelledby="reference-diagrams">
          <header className="ride-booking__feature-cardhead">
            <div>
              <h2 id="reference-diagrams" className="h5 mb-1">
                Reference diagrams
              </h2>
              <p className="text-muted small mb-0">
                Keep architecture and sequence diagrams handy while resolving finance operations.
              </p>
            </div>
          </header>
          <Accordion alwaysOpen>
            {REFERENCE_DIAGRAMS.map((diagram, index) => (
              <Accordion.Item eventKey={diagram.id} key={diagram.id}>
                <Accordion.Header>
                  <span className="ride-booking__diagram-title">
                    {index + 1}. {diagram.title}
                  </span>
                </Accordion.Header>
                <Accordion.Body>
                  <p className="text-muted small mb-3">{diagram.description}</p>
                  <figure className="ride-booking__diagram ride-booking__diagram--feature">
                    <img
                      src={`${PLANTUML_BASE_URL}${diagram.encoded}`}
                      alt={`${diagram.title} diagram`}
                      loading="lazy"
                    />
                    <figcaption>Rendered via PlantUML</figcaption>
                  </figure>
                </Accordion.Body>
              </Accordion.Item>
            ))}
          </Accordion>
        </section>
      </div>
    </div>
  );
};

export default RideBookingPaymentsPage;

