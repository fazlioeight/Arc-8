import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Form,
  Row,
  Table,
} from "react-bootstrap";

import PortalUtilityBar from "../../../components/PortalUtilityBar";
import RideBookingHeader from "./RideBookingHeader";
import {
  addPartner,
  addPartnerSchedule,
  getAvailablePartnersForDate,
  getPartners,
  upsertPartnerBillingProfile,
} from "../../../services/ridePartnerService";
import { getRecentRides } from "../../../services/rideBookingService";
import "../../../styles/rideBooking.css";

const WEEKDAY_OPTIONS = [
  { value: "mon", label: "Monday" },
  { value: "tue", label: "Tuesday" },
  { value: "wed", label: "Wednesday" },
  { value: "thu", label: "Thursday" },
  { value: "fri", label: "Friday" },
  { value: "sat", label: "Saturday" },
  { value: "sun", label: "Sunday" },
];

const DAY_LABEL = WEEKDAY_OPTIONS.reduce((acc, option) => {
  acc[option.value] = option.label;
  return acc;
}, {});

const createScheduleForm = (frequency = "daily") => ({
  frequency,
  startDate: "",
  endDate: "",
  openSlots: "",
  daysOfWeek: [],
  daysOfMonth: [],
  notes: "",
});

const PAYMENT_METHOD_OPTIONS = [
  { value: "ach", label: "ACH" },
  { value: "virtual_card", label: "Virtual card" },
  { value: "stripe_connect", label: "Stripe Connect" },
  { value: "check", label: "Check" },
];

const describePaymentMethod = (value) => {
  const option = PAYMENT_METHOD_OPTIONS.find((method) => method.value === value);
  return option ? option.label : value || "";
};

const createBillingForm = (partner = {}) => ({
  payToName: partner.billingProfile?.payToName || partner.companyName || "",
  paymentEmail: partner.billingProfile?.paymentEmail || partner.contactEmail || "",
  paymentMethod: partner.billingProfile?.paymentMethod || "ach",
  remitAddress: partner.billingProfile?.remitAddress || "",
  taxId: partner.billingProfile?.taxId || "",
});

const formatDateTime = (iso) => {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

const escapeCsv = (value) => {
  if (value === null || value === undefined) return "";
  const string = String(value);
  if (/[",\n]/.test(string)) {
    return `"${string.replace(/"/g, '""')}"`;
  }
  return string;
};

const buildInvoiceCsv = (partner, billingProfile, rides) => {
  const metadata = [
    ["Partner Company", partner.companyName || ""],
    ["Pay To Name", billingProfile.payToName || ""],
    ["Remit Email", billingProfile.paymentEmail || ""],
    ["Payment Method", describePaymentMethod(billingProfile.paymentMethod)],
    ["Remit Address", billingProfile.remitAddress || ""],
    ["Tax ID", billingProfile.taxId || ""],
    ["Profile Updated", billingProfile.updatedAt || ""],
    ["Generated At", new Date().toISOString()],
  ];

  const headers = [
    "Ride ID",
    "Member ID",
    "Passenger",
    "Pickup",
    "Dropoff",
    "Scheduled Pickup",
    "Estimated Dropoff",
    "Status",
    "Cost (USD)",
  ];

  const sortedRides = rides
    .slice()
    .sort(
      (a, b) =>
        new Date(a.scheduledPickup || 0).getTime() -
        new Date(b.scheduledPickup || 0).getTime()
    );

  const rideRows = sortedRides.map((ride) => {
    const costValue = Number.parseFloat(ride.costUsd);
    const formattedCost = Number.isFinite(costValue) ? costValue.toFixed(2) : "";
    return [
      ride.id,
      ride.memberId,
      `${ride.firstName || ""} ${ride.lastName || ""}`.trim(),
      ride.pickup,
      ride.dropoff,
      formatDateTime(ride.scheduledPickup),
      formatDateTime(ride.estimatedDropoff),
      ride.status,
      formattedCost,
    ];
  });

  const lines = [
    ...metadata.map((row) => row.map(escapeCsv).join(",")),
    "",
    headers.map(escapeCsv).join(","),
    ...rideRows.map((row) => row.map(escapeCsv).join(",")),
  ];

  return lines.join("\n");
};

const RidePartnerManagementPage = () => {
  const navigate = useNavigate();
  const [partners, setPartners] = useState([]);
  const [partnerForm, setPartnerForm] = useState({
    companyName: "",
    contactName: "",
    contactEmail: "",
  });
  const [scheduleForms, setScheduleForms] = useState({});
  const [billingForms, setBillingForms] = useState({});
  const [feedback, setFeedback] = useState(null);
  const [expandedPartners, setExpandedPartners] = useState(() => new Set());

  const partnersOpenToday = useMemo(() => {
    const open = getAvailablePartnersForDate();
    return new Set(open.map((partner) => partner.id));
  }, [partners]);

  const monthOptions = useMemo(
    () => Array.from({ length: 31 }, (_, index) => index + 1),
    []
  );

  const refreshPartners = () => {
    const data = getPartners();
    setPartners(data);
    setBillingForms((current) => {
      const next = {};
      data.forEach((partner) => {
        next[partner.id] = current[partner.id] || createBillingForm(partner);
      });
      return next;
    });
    setExpandedPartners((current) => {
      if (!current || current.size === 0) {
        return new Set();
      }
      const next = new Set();
      data.forEach((partner) => {
        if (current.has(partner.id)) {
          next.add(partner.id);
        }
      });
      return next;
    });
  };

  useEffect(() => {
    refreshPartners();
  }, []);

  const scheduleStateFor = (partnerId) =>
    scheduleForms[partnerId] || createScheduleForm();

  const resetScheduleForm = (partnerId, frequency = "daily") => {
    setScheduleForms((current) => ({
      ...current,
      [partnerId]: createScheduleForm(frequency),
    }));
  };

  const updateScheduleForm = (partnerId, changes) => {
    setScheduleForms((current) => {
      const existing = current[partnerId] || createScheduleForm();
      const next =
        typeof changes === "function"
          ? changes(existing)
          : { ...existing, ...changes };
      if (!next.frequency) {
        next.frequency = existing.frequency || "daily";
      }
      return {
        ...current,
        [partnerId]: next,
      };
    });
  };

  const handlePartnerInputChange = (event) => {
    const { name, value } = event.target;
    setPartnerForm((form) => ({ ...form, [name]: value }));
  };

  const handleAddPartner = (event) => {
    event.preventDefault();
    try {
      const record = addPartner(partnerForm);
      setFeedback({
        type: "success",
        message: `Added ${record.companyName} to ride partners.`,
      });
      setPartnerForm({ companyName: "", contactName: "", contactEmail: "" });
      refreshPartners();
      setExpandedPartners((current) => {
        const next = new Set(current);
        next.add(record.id);
        return next;
      });
    } catch (error) {
      setFeedback({
        type: "danger",
        message: error.message || "Unable to add ride partner.",
      });
    }
  };

  const handleFrequencyChange = (partnerId, value) => {
    resetScheduleForm(partnerId, value);
  };

  const handleWeeklySelection = (partnerId, event) => {
    const values = Array.from(event.target.selectedOptions || []).map(
      (option) => option.value
    );
    updateScheduleForm(partnerId, { daysOfWeek: values });
  };

  const handleMonthlySelection = (partnerId, event) => {
    const values = Array.from(event.target.selectedOptions || []).map(
      (option) => Number(option.value)
    );
    updateScheduleForm(partnerId, { daysOfMonth: values });
  };

  const handleAddSchedule = (partnerId, event) => {
    event.preventDefault();
    const form = scheduleStateFor(partnerId);
    const { frequency, startDate, endDate, openSlots } = form;

    if (!frequency) {
      setFeedback({ type: "danger", message: "Select a schedule frequency." });
      return;
    }
    if (!startDate || !endDate) {
      setFeedback({
        type: "danger",
        message: "Provide a start and end date for the schedule.",
      });
      return;
    }
    if (new Date(startDate) > new Date(endDate)) {
      setFeedback({
        type: "danger",
        message: "Schedule start date must be before the end date.",
      });
      return;
    }
    if (!openSlots || Number.parseInt(openSlots, 10) <= 0) {
      setFeedback({
        type: "danger",
        message: "Enter the number of open rides available.",
      });
      return;
    }
    if (
      frequency === "weekly" &&
      (!form.daysOfWeek || form.daysOfWeek.length === 0)
    ) {
      setFeedback({
        type: "danger",
        message: "Select at least one day of the week.",
      });
      return;
    }
    if (
      frequency === "monthly" &&
      (!form.daysOfMonth || form.daysOfMonth.length === 0)
    ) {
      setFeedback({
        type: "danger",
        message: "Select at least one day of the month.",
      });
      return;
    }

    try {
      addPartnerSchedule(partnerId, form);
      setFeedback({
        type: "success",
        message: "Availability added to the partner calendar.",
      });
      refreshPartners();
      resetScheduleForm(partnerId, form.frequency);
    } catch (error) {
      setFeedback({
        type: "danger",
        message: error.message || "Unable to add schedule.",
      });
    }
  };

  const billingStateFor = (partner) =>
    billingForms[partner.id] || createBillingForm(partner);

  const handleBillingInputChange = (partner, field, value) => {
    setBillingForms((current) => ({
      ...current,
      [partner.id]: {
        ...(current[partner.id] || createBillingForm(partner)),
        [field]: value,
      },
    }));
  };

  const handleSaveBillingProfile = (event, partner) => {
    event.preventDefault();
    const form = billingForms[partner.id] || createBillingForm(partner);
    if (!form.payToName || !form.payToName.trim()) {
      setFeedback({
        type: "danger",
        message: "Enter the pay-to name for invoice processing.",
      });
      return;
    }
    if (!form.paymentEmail || !form.paymentEmail.trim()) {
      setFeedback({
        type: "danger",
        message: "Enter the remit email used for payout notifications.",
      });
      return;
    }

    try {
      const saved = upsertPartnerBillingProfile(partner.id, form);
      setFeedback({
        type: "success",
        message: `Saved pay-to profile for ${partner.companyName}.`,
      });
      setBillingForms((current) => ({
        ...current,
        [partner.id]: createBillingForm({
          ...partner,
          billingProfile: saved,
        }),
      }));
      refreshPartners();
    } catch (error) {
      console.error("Unable to save billing profile", error);
      setFeedback({
        type: "danger",
        message: "Unable to save billing profile. Try again.",
      });
    }
  };

  const handleDownloadInvoiceData = (partner) => {
    try {
      const storedProfile = partner.billingProfile || {};
      const form = billingForms[partner.id] || createBillingForm(partner);
      const billingProfile = { ...storedProfile, ...form };
      const rides = getRecentRides().filter(
        (ride) => ride.rideType === partner.companyName
      );
      const csv = buildInvoiceCsv(partner, billingProfile, rides);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const safeName =
        partner.companyName?.toLowerCase().replace(/[^a-z0-9]+/g, "-") ||
        "partner";
      link.href = url;
      link.download = `${safeName}-invoice-data.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setFeedback({
        type: "success",
        message: `Invoice data downloaded for ${partner.companyName}.`,
      });
    } catch (error) {
      console.error("Unable to download invoice data", error);
      setFeedback({
        type: "danger",
        message: "Unable to generate invoice download. Try again.",
      });
    }
  };

  const togglePartnerSection = (partnerId) => {
    setExpandedPartners((current) => {
      const next = new Set(current);
      if (next.has(partnerId)) {
        next.delete(partnerId);
      } else {
        next.add(partnerId);
      }
      return next;
    });
  };

  const formatRecurrence = (schedule) => {
    switch (schedule.frequency) {
      case "daily":
        return "Every day";
      case "weekly":
        return (
          schedule.daysOfWeek
            ?.map((code) => DAY_LABEL[code] || code)
            .join(", ") || "Weekly"
        );
      case "monthly":
        return schedule.daysOfMonth?.length
          ? `Days ${schedule.daysOfMonth.join(", ")}`
          : "Monthly";
      default:
        return "None";
    }
  };

  return (
    <div className="sfdc-portal coding-portal">
      <PortalUtilityBar />
      <RideBookingHeader
        title="Ride Partner Calendars"
        subtitle="Invite transportation partners to publish their open ride windows. Availability for today automatically feeds the booking dropdown."
      />

      <Alert variant="light" className="ride-booking__knowledge-banner mx-3">
        <div>
          <h2 className="h6 mb-1">Finance alignment reminder</h2>
          <p className="mb-0">
            Share the payments and billing playbook with partner success so payouts, invoices, and ledger data stay in sync.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline-primary"
          onClick={() => navigate("/RideBooking/payments")}
        >
          View playbook
        </Button>
      </Alert>

      <main className="sfdc-grid" style={{ gridTemplateColumns: "1fr" }}>
        <div className="sfdc-card sfdc-card--full">
          <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-3">
            <div>
              <h2 className="h5 mb-1">Register a partner</h2>
              <div className="text-muted">
                Capture basic contact details to publish ride availability.
              </div>
            </div>
          </div>
          {feedback && (
            <Alert
              variant={feedback.type}
              onClose={() => setFeedback(null)}
              dismissible
            >
              {feedback.message}
            </Alert>
          )}
          <Form onSubmit={handleAddPartner} className="mb-4">
            <Row className="g-3">
              <Col md={4}>
                <Form.Group controlId="companyName">
                  <Form.Label>Company name</Form.Label>
                  <Form.Control
                    name="companyName"
                    value={partnerForm.companyName}
                    onChange={handlePartnerInputChange}
                    placeholder="e.g., Riverside Mobility"
                    required
                  />
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group controlId="contactName">
                  <Form.Label>Contact name</Form.Label>
                  <Form.Control
                    name="contactName"
                    value={partnerForm.contactName}
                    onChange={handlePartnerInputChange}
                    placeholder="Primary coordinator"
                  />
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group controlId="contactEmail">
                  <Form.Label>Contact email</Form.Label>
                  <Form.Control
                    type="email"
                    name="contactEmail"
                    value={partnerForm.contactEmail}
                    onChange={handlePartnerInputChange}
                    placeholder="contact@example.com"
                  />
                </Form.Group>
              </Col>
            </Row>
            <div className="d-flex justify-content-end mt-3">
              <Button type="submit">Add partner</Button>
            </div>
          </Form>

          <h2 className="h6">Partner calendars</h2>



          {partners.length === 0 ? (
            <div className="text-muted">No partners registered yet.</div>
          ) : (
            <div className="d-flex flex-column gap-3">
              {partners.map((partner) => {
                const form = scheduleStateFor(partner.id);
                const billingForm = billingStateFor(partner);
                const isOpenToday = partnersOpenToday.has(partner.id);
                const lastUpdated = partner.billingProfile?.updatedAt;
                const savedMethod =
                  partner.billingProfile?.paymentMethod ||
                  billingForm.paymentMethod;
                const isExpanded = expandedPartners.has(partner.id);
                const detailsId = `partner-${partner.id}-details`;
                return (
                  <Card key={partner.id} className="shadow-sm">
                    <Card.Body>
                      <div className="d-flex flex-column flex-lg-row justify-content-between gap-3">
                        <div>
                          <Card.Title className="mb-1 d-flex flex-wrap align-items-center gap-2">
                            <span>{partner.companyName}</span>
                            {isOpenToday && (
                              <Badge bg="success">Open today</Badge>
                            )}
                          </Card.Title>
                          <div
                            className="text-muted"
                            style={{ fontSize: "0.9rem" }}
                          >
                            {partner.contactName || "Not provided"}
                            {partner.contactEmail && (
                              <>
                                {" | "}
                                {partner.contactEmail}
                              </>
                            )}
                          </div>
                          <div
                            className="text-muted"
                            style={{ fontSize: "0.8rem" }}
                          >
                            Joined {new Date(partner.createdAt).toLocaleDateString()}
                          </div>
                          <div
                            className="text-muted"
                            style={{ fontSize: "0.8rem" }}
                          >
                            Pay-to profile:{" "}
                            {partner.billingProfile?.payToName
                              ? partner.billingProfile.payToName
                              : "Not saved"}{" "}
                            - Method: {describePaymentMethod(savedMethod)}
                          </div>
                        </div>
                        <div className="d-flex align-items-start gap-2">
                          <Button
                            variant="outline-secondary"
                            size="sm"
                            onClick={() => togglePartnerSection(partner.id)}
                            aria-expanded={isExpanded}
                            aria-controls={detailsId}
                          >
                            {isExpanded ? "Hide details" : "Show details"}
                          </Button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div id={detailsId}>
                          <div className="d-flex flex-column flex-lg-row justify-content-between gap-3 mt-3">
                            <div style={{ minWidth: 260 }}>
                              <Form
                                onSubmit={(event) =>
                                  handleAddSchedule(partner.id, event)
                                }
                              >
                                <Row className="g-2">
                                  <Col md={6}>
                                    <Form.Group controlId={`frequency-${partner.id}`}>
                                      <Form.Label>Frequency</Form.Label>
                                      <Form.Select
                                        value={form.frequency}
                                        onChange={(event) =>
                                          handleFrequencyChange(
                                            partner.id,
                                            event.target.value
                                          )
                                        }
                                      >
                                        <option value="daily">Daily</option>
                                        <option value="weekly">Weekly</option>
                                        <option value="monthly">Monthly</option>
                                      </Form.Select>
                                    </Form.Group>
                                  </Col>
                                  <Col md={6}>
                                    <Form.Group controlId={`openSlots-${partner.id}`}>
                                      <Form.Label>Open rides</Form.Label>
                                      <Form.Control
                                        type="number"
                                        min={1}
                                        value={form.openSlots}
                                        onChange={(event) =>
                                          updateScheduleForm(partner.id, {
                                            openSlots: event.target.value,
                                          })
                                        }
                                        required
                                      />
                                    </Form.Group>
                                  </Col>
                                  <Col md={6}>
                                    <Form.Group controlId={`startDate-${partner.id}`}>
                                      <Form.Label>Start date</Form.Label>
                                      <Form.Control
                                        type="date"
                                        value={form.startDate}
                                        onChange={(event) =>
                                          updateScheduleForm(partner.id, {
                                            startDate: event.target.value,
                                          })
                                        }
                                        required
                                      />
                                    </Form.Group>
                                  </Col>
                                  <Col md={6}>
                                    <Form.Group controlId={`endDate-${partner.id}`}>
                                      <Form.Label>End date</Form.Label>
                                      <Form.Control
                                        type="date"
                                        value={form.endDate}
                                        onChange={(event) =>
                                          updateScheduleForm(partner.id, {
                                            endDate: event.target.value,
                                          })
                                        }
                                        required
                                      />
                                    </Form.Group>
                                  </Col>
                                  {form.frequency === "weekly" && (
                                    <Col md={12}>
                                      <Form.Group controlId={`daysOfWeek-${partner.id}`}>
                                        <Form.Label>Days of week</Form.Label>
                                        <Form.Select
                                          multiple
                                          value={form.daysOfWeek}
                                          onChange={(event) =>
                                            handleWeeklySelection(partner.id, event)
                                          }
                                        >
                                          {WEEKDAY_OPTIONS.map((option) => (
                                            <option key={option.value} value={option.value}>
                                              {option.label}
                                            </option>
                                          ))}
                                        </Form.Select>
                                        <Form.Text>
                                          Use Ctrl/Cmd click to select multiple days.
                                        </Form.Text>
                                      </Form.Group>
                                    </Col>
                                  )}
                                  {form.frequency === "monthly" && (
                                    <Col md={12}>
                                      <Form.Group controlId={`daysOfMonth-${partner.id}`}>
                                        <Form.Label>Days of month</Form.Label>
                                        <Form.Select
                                          multiple
                                          value={form.daysOfMonth.map(String)}
                                          onChange={(event) =>
                                            handleMonthlySelection(partner.id, event)
                                          }
                                        >
                                          {monthOptions.map((day) => (
                                            <option key={day} value={day}>
                                              {day}
                                            </option>
                                          ))}
                                        </Form.Select>
                                        <Form.Text>
                                          Select all calendar days that recur for this schedule.
                                        </Form.Text>
                                      </Form.Group>
                                    </Col>
                                  )}
                                  <Col md={12}>
                                    <Form.Group controlId={`notes-${partner.id}`}>
                                      <Form.Label>Notes</Form.Label>
                                      <Form.Control
                                        as="textarea"
                                        rows={2}
                                        value={form.notes}
                                        onChange={(event) =>
                                          updateScheduleForm(partner.id, {
                                            notes: event.target.value,
                                          })
                                        }
                                        placeholder="Optional details (vehicles, regions, etc.)"
                                      />
                                    </Form.Group>
                                  </Col>
                                </Row>
                                <div className="d-flex justify-content-end mt-3">
                                  <Button type="submit" size="sm">
                                    Add availability
                                  </Button>
                                </div>
                              </Form>
                            </div>
                          </div>

                          <div className="mt-4 pt-3 border-top">
                            <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-2">
                              <div>
                                <h3 className="h6 mb-1">Pay-to &amp; invoice profile</h3>
                                <p className="text-muted small mb-0">
                                  Store payout instructions and export invoice-ready ride data.
                                </p>
                              </div>
                              <div className="text-muted small">
                                {lastUpdated
                                  ? `Updated ${formatDateTime(lastUpdated)}`
                                  : "Not saved yet"}
                              </div>
                            </div>
                            <Form
                              className="mt-3"
                              onSubmit={(event) => handleSaveBillingProfile(event, partner)}
                            >
                              <Row className="g-3">
                                <Col md={6}>
                                  <Form.Group controlId={`payToName-${partner.id}`}>
                                    <Form.Label>Pay-to name</Form.Label>
                                    <Form.Control
                                      value={billingForm.payToName}
                                      onChange={(event) =>
                                        handleBillingInputChange(
                                          partner,
                                          "payToName",
                                          event.target.value
                                        )
                                      }
                                      placeholder="Legal or remit-to name"
                                      required
                                    />
                                  </Form.Group>
                                </Col>
                                <Col md={6}>
                                  <Form.Group controlId={`paymentEmail-${partner.id}`}>
                                    <Form.Label>Remit email</Form.Label>
                                    <Form.Control
                                      type="email"
                                      value={billingForm.paymentEmail}
                                      onChange={(event) =>
                                        handleBillingInputChange(
                                          partner,
                                          "paymentEmail",
                                          event.target.value
                                        )
                                      }
                                      placeholder="billing@example.com"
                                      required
                                    />
                                  </Form.Group>
                                </Col>
                                <Col md={6}>
                                  <Form.Group controlId={`paymentMethod-${partner.id}`}>
                                    <Form.Label>Preferred payment method</Form.Label>
                                    <Form.Select
                                      value={billingForm.paymentMethod}
                                      onChange={(event) =>
                                        handleBillingInputChange(
                                          partner,
                                          "paymentMethod",
                                          event.target.value
                                        )
                                      }
                                    >
                                      {PAYMENT_METHOD_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>
                                          {option.label}
                                        </option>
                                      ))}
                                    </Form.Select>
                                  </Form.Group>
                                </Col>
                                <Col md={6}>
                                  <Form.Group controlId={`taxId-${partner.id}`}>
                                    <Form.Label>Tax ID</Form.Label>
                                    <Form.Control
                                      value={billingForm.taxId}
                                      onChange={(event) =>
                                        handleBillingInputChange(
                                          partner,
                                          "taxId",
                                          event.target.value
                                        )
                                      }
                                      placeholder="EIN / SSN for 1099"
                                    />
                                  </Form.Group>
                                </Col>
                                <Col xs={12}>
                                  <Form.Group controlId={`remitAddress-${partner.id}`}>
                                    <Form.Label>Remit address</Form.Label>
                                    <Form.Control
                                      as="textarea"
                                      rows={2}
                                      value={billingForm.remitAddress}
                                      onChange={(event) =>
                                        handleBillingInputChange(
                                          partner,
                                          "remitAddress",
                                          event.target.value
                                        )
                                      }
                                      placeholder="Street, city, state, ZIP"
                                    />
                                  </Form.Group>
                                </Col>
                              </Row>
                              <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-2 mt-3">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline-secondary"
                                  onClick={() => handleDownloadInvoiceData(partner)}
                                >
                                  Download invoice data (CSV)
                                </Button>
                                <Button type="submit" size="sm">
                                  Save pay-to profile
                                </Button>
                              </div>
                            </Form>
                          </div>

                          {(partner.schedules || []).length > 0 && (
                            <div className="table-responsive mt-3">
                              <Table bordered size="sm" className="mb-0">
                                <thead>
                                  <tr>
                                    <th>Frequency</th>
                                    <th>Recurrence</th>
                                    <th>Dates</th>
                                    <th>Open rides</th>
                                    <th>Notes</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {partner.schedules.map((schedule) => (
                                    <tr key={schedule.id}>
                                      <td className="text-capitalize">
                                        {schedule.frequency}
                                      </td>
                                      <td>{formatRecurrence(schedule)}</td>
                                      <td>
                                        {new Date(
                                          schedule.startDate
                                        ).toLocaleDateString()}{" "}
                                        -{" "}
                                        {new Date(
                                          schedule.endDate
                                        ).toLocaleDateString()}
                                      </td>
                                      <td>{schedule.openSlots}</td>
                                      <td>{schedule.notes || "None"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </Table>
                            </div>
                          )}
                        </div>
                      )}
                    </Card.Body>
                  </Card>
                );
              })}
            </div>
          )}

        </div>
      </main>
    </div>
  );
};

export default RidePartnerManagementPage;
