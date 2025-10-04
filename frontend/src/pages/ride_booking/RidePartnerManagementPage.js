import React, { useEffect, useMemo, useState } from "react";
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
import { useNavigate } from "react-router-dom";

import PortalUtilityBar from "../../components/PortalUtilityBar";
import PortalHero from "../../components/PortalHero";
import {
  addPartner,
  addPartnerSchedule,
  getAvailablePartnersForDate,
  getPartners,
} from "../../services/ridePartnerService";

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

const RidePartnerManagementPage = () => {
  const navigate = useNavigate();
  const [partners, setPartners] = useState([]);
  const [partnerForm, setPartnerForm] = useState({
    companyName: "",
    contactName: "",
    contactEmail: "",
  });
  const [scheduleForms, setScheduleForms] = useState({});
  const [feedback, setFeedback] = useState(null);

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
      <PortalHero
        title="Ride Partner Calendars"
        subtitle="Invite transportation partners to publish their open ride windows. Availability for today automatically feeds the booking dropdown."
        actions={[
          <Button
            key="overview"
            variant="light"
            onClick={() => navigate("/RideBooking")}
          >
            View ride overview
          </Button>,
          <Button
            key="book"
            variant="outline-light"
            onClick={() => navigate("/RideBooking/book")}
          >
            Book a ride
          </Button>,
        ]}
      />

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
                const isOpenToday = partnersOpenToday.has(partner.id);
                return (
                  <Card key={partner.id} className="shadow-sm">
                    <Card.Body>
                      <div className="d-flex flex-column flex-lg-row justify-content-between gap-3">
                        <div>
                          <Card.Title className="mb-1">
                            {partner.companyName}
                            {isOpenToday && (
                              <Badge bg="success" className="ms-2">
                                Open today
                              </Badge>
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
                            Joined{" "}
                            {new Date(partner.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                        <div style={{ minWidth: 260 }}>
                          <Form
                            onSubmit={(event) =>
                              handleAddSchedule(partner.id, event)
                            }
                          >
                            <Row className="g-2">
                              <Col md={6}>
                                <Form.Group
                                  controlId={`frequency-${partner.id}`}
                                >
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
                                <Form.Group
                                  controlId={`openSlots-${partner.id}`}
                                >
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
                                    placeholder="e.g., 10"
                                    required
                                  />
                                </Form.Group>
                              </Col>
                              <Col md={6}>
                                <Form.Group
                                  controlId={`startDate-${partner.id}`}
                                >
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
                                  <Form.Group
                                    controlId={`daysOfWeek-${partner.id}`}
                                  >
                                    <Form.Label>Days of week</Form.Label>
                                    <Form.Select
                                      multiple
                                      value={form.daysOfWeek}
                                      onChange={(event) =>
                                        handleWeeklySelection(partner.id, event)
                                      }
                                    >
                                      {WEEKDAY_OPTIONS.map((option) => (
                                        <option
                                          key={option.value}
                                          value={option.value}
                                        >
                                          {option.label}
                                        </option>
                                      ))}
                                    </Form.Select>
                                    <Form.Text>
                                      Use Ctrl/Cmd click to select multiple
                                      days.
                                    </Form.Text>
                                  </Form.Group>
                                </Col>
                              )}
                              {form.frequency === "monthly" && (
                                <Col md={12}>
                                  <Form.Group
                                    controlId={`daysOfMonth-${partner.id}`}
                                  >
                                    <Form.Label>Days of month</Form.Label>
                                    <Form.Select
                                      multiple
                                      value={form.daysOfMonth.map(String)}
                                      onChange={(event) =>
                                        handleMonthlySelection(
                                          partner.id,
                                          event
                                        )
                                      }
                                    >
                                      {monthOptions.map((day) => (
                                        <option key={day} value={day}>
                                          {day}
                                        </option>
                                      ))}
                                    </Form.Select>
                                    <Form.Text>
                                      Select all calendar days that recur for
                                      this schedule.
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
