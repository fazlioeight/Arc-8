import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import PortalUtilityBar from "../../../components/PortalUtilityBar";
import RideBookingHeader from "./RideBookingHeader";
import {
  addPartner,
  addPartnerSchedule,
  getAvailablePartnersForDate,
  getPartners,
  upsertPartnerBillingProfile,
} from "../../../services/ridePartnerService";
import { RideBookingService } from "../../../services/rideBookingService";
import "../coding/member/memberWorkspace.css";
import "../../../styles/rideBooking.css";

const DAY_LABEL = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

const defaultSchedule = {
  frequency: "weekly",
  daysOfWeek: ["mon"],
  startDate: new Date().toISOString().slice(0, 10),
  endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  openSlots: 4,
  notes: "",
};

const formatRecurrence = (schedule) => {
  if (!schedule?.frequency) return "Ad hoc";
  if (schedule.frequency === "weekly") {
    return (schedule.daysOfWeek || []).map((code) => DAY_LABEL[code] || code).join(", ") || "Weekly";
  }
  if (schedule.frequency === "monthly") {
    return (schedule.daysOfMonth || []).join(", ") || "Monthly";
  }
  return "Ad hoc";
};

const RidePartnerManagementPage = () => {
  const navigate = useNavigate();
  const rideBookingService = useMemo(() => new RideBookingService(), []);
  const [partners, setPartners] = useState([]);
  const [availableToday, setAvailableToday] = useState([]);
  const [rides, setRides] = useState([]);
  const [feedback, setFeedback] = useState(null);
  const [scheduleState, setScheduleState] = useState({});

  const refreshPartners = () => {
    setPartners(getPartners());
    setAvailableToday(getAvailablePartnersForDate(new Date()));
    setRides(rideBookingService.getRecentRides());
  };

  useEffect(() => {
    refreshPartners();
  }, [rideBookingService]);

  const scheduleStateFor = (partnerId) => scheduleState[partnerId] || defaultSchedule;

  const updateScheduleForm = (partnerId, updates) => {
    setScheduleState((prev) => ({
      ...prev,
      [partnerId]: { ...scheduleStateFor(partnerId), ...updates },
    }));
  };

  const resetScheduleForm = (partnerId, freq = "weekly") => {
    setScheduleState((prev) => ({
      ...prev,
      [partnerId]: { ...defaultSchedule, frequency: freq },
    }));
  };

  const handleAddPartner = (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    const name = form.get("partnerName");
    const contact = form.get("partnerContact");
    if (!name || !contact) {
      setFeedback({ type: "danger", message: "Enter partner name and contact." });
      return;
    }
    try {
      addPartner({ companyName: name, contactEmail: contact, contactName: name });
      setFeedback({ type: "success", message: "Partner added." });
      event.target.reset();
      refreshPartners();
    } catch (error) {
      setFeedback({ type: "danger", message: error?.message || "Unable to add partner." });
    }
  };

  const handleBillingInputChange = (partner, field, value) => {
    const updated = { ...(partner.billingProfile || {}), [field]: value };
    upsertPartnerBillingProfile(partner.id, updated);
    setFeedback({ type: "success", message: "Billing profile updated." });
    refreshPartners();
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
      setFeedback({ type: "danger", message: "Start and end dates are required." });
      return;
    }
    addPartnerSchedule(partnerId, form);
    setFeedback({ type: "success", message: "Availability added to the partner calendar." });
    refreshPartners();
    resetScheduleForm(partnerId, form.frequency);
  };

  const ridesByPartner = useMemo(() => {
    const map = new Map();
    rides.forEach((ride) => {
      const bucket = map.get(ride.rideType) || [];
      bucket.push(ride);
      map.set(ride.rideType, bucket);
    });
    return map;
  }, [rides]);

  return (
    <div className="ride-booking coding-member-workspace portal-theme min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <PortalUtilityBar />
      <RideBookingHeader
        title="Ride Partner Calendars"
        subtitle="Invite transportation partners to publish their open ride windows. Availability for today feeds the booking dropdown."
      />

      <main className="mx-auto max-w-6xl px-4 py-6 space-y-6">
        {feedback && (
          <div
            className={`rounded-lg border px-3 py-2 text-sm shadow-sm ${
              feedback.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-100"
                : "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100"
            }`}
          >
            {feedback.message}
          </div>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <header className="mb-4">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Register a partner</h2>
            <p className="text-sm text-slate-500 dark:text-slate-300">Capture partner contact details.</p>
          </header>
          <form onSubmit={handleAddPartner} className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-semibold" htmlFor="partnerName">
                Partner name
              </label>
              <input
                id="partnerName"
                name="partnerName"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-inner outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-sky-400 dark:focus:ring-sky-500/40"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold" htmlFor="partnerContact">
                Contact email
              </label>
              <input
                id="partnerContact"
                name="partnerContact"
                type="email"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-inner outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-sky-400 dark:focus:ring-sky-500/40"
                required
              />
            </div>
            <div className="sm:col-span-2">
              <button
                className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                type="submit"
              >
                Add partner
              </button>
            </div>
          </form>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <header className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Today&apos;s availability</h2>
              <p className="text-sm text-slate-500 dark:text-slate-300">Partners with open slots.</p>
            </div>
            <button
              className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-slate-500 dark:hover:bg-slate-700"
              onClick={refreshPartners}
            >
              Refresh
            </button>
          </header>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {availableToday.map((partner) => (
              <div key={partner.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-inner dark:border-slate-700 dark:bg-slate-800">
                <div className="flex items-center justify-between text-sm text-slate-800 dark:text-slate-100">
                  <div className="font-semibold">{partner.name}</div>
                  <span className="text-xs text-slate-500 dark:text-slate-300">{partner.openSlots} slots</span>
                </div>
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-300">{partner.contact}</div>
              </div>
            ))}
            {!availableToday.length && (
              <div className="rounded-xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                No availability published today.
              </div>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <header className="mb-4">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Partners</h2>
            <p className="text-sm text-slate-500 dark:text-slate-300">Manage billing profiles and schedules.</p>
          </header>
          <div className="space-y-4">
            {partners.map((partner) => {
              const ridesForPartner = ridesByPartner.get(partner.name) || [];
              const scheduleForm = scheduleStateFor(partner.id);
              return (
                <div
                  key={partner.id}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-inner dark:border-slate-700 dark:bg-slate-800"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-base font-semibold text-slate-900 dark:text-slate-100">{partner.name}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-300">{partner.contact}</div>
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-300">
                      {ridesForPartner.length} rides in the last 48h
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Billing profile</div>
                      <label className="text-xs text-slate-500 dark:text-slate-300">
                        Pay-to name
                        <input
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900 shadow-inner outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-sky-400 dark:focus:ring-sky-500/40"
                          value={partner.billingProfile?.payToName || ""}
                          onChange={(event) =>
                            handleBillingInputChange(partner, "payToName", event.target.value)
                          }
                          placeholder="Payee name"
                        />
                      </label>
                      <label className="text-xs text-slate-500 dark:text-slate-300">
                        Remit address
                        <input
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900 shadow-inner outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-sky-400 dark:focus:ring-sky-500/40"
                          value={partner.billingProfile?.remitAddress || ""}
                          onChange={(event) =>
                            handleBillingInputChange(partner, "remitAddress", event.target.value)
                          }
                          placeholder="Street, city, state, ZIP"
                        />
                      </label>
                    </div>

                    <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Open rides</div>
                      <div className="text-xs text-slate-500 dark:text-slate-300">
                        Last 48h rides for this partner.
                      </div>
                      <ul className="space-y-1 text-sm text-slate-800 dark:text-slate-100">
                        {ridesForPartner.slice(0, 3).map((ride) => (
                          <li key={ride.id} className="flex justify-between text-xs">
                            <span>{ride.memberName}</span>
                            <span className="text-slate-500 dark:text-slate-300">{ride.status}</span>
                          </li>
                        ))}
                        {!ridesForPartner.length && (
                          <li className="text-xs text-slate-500 dark:text-slate-300">No recent rides.</li>
                        )}
                      </ul>
                    </div>

                    <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Publish availability</div>
                      <form onSubmit={(event) => handleAddSchedule(partner.id, event)} className="space-y-2 text-xs">
                        <label className="flex flex-col gap-1 text-slate-600 dark:text-slate-300">
                          Frequency
                          <select
                            value={scheduleForm.frequency}
                            onChange={(event) => updateScheduleForm(partner.id, { frequency: event.target.value })}
                            className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 shadow-inner outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-sky-400 dark:focus:ring-sky-500/40"
                          >
                            <option value="weekly">Weekly</option>
                            <option value="monthly">Monthly</option>
                          </select>
                        </label>

                        {scheduleForm.frequency === "weekly" ? (
                          <label className="flex flex-col gap-1 text-slate-600 dark:text-slate-300">
                            Days of week
                            <select
                              multiple
                              value={scheduleForm.daysOfWeek}
                              onChange={(event) => {
                                const values = Array.from(event.target.selectedOptions || []).map(
                                  (option) => option.value
                                );
                                updateScheduleForm(partner.id, { daysOfWeek: values });
                              }}
                              className="h-24 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 shadow-inner outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-sky-400 dark:focus:ring-sky-500/40"
                            >
                              {Object.entries(DAY_LABEL).map(([code, label]) => (
                                <option key={code} value={code}>
                                  {label}
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : (
                          <label className="flex flex-col gap-1 text-slate-600 dark:text-slate-300">
                            Days of month
                            <select
                              multiple
                              value={scheduleForm.daysOfMonth || []}
                              onChange={(event) => {
                                const values = Array.from(event.target.selectedOptions || []).map((option) =>
                                  Number(option.value)
                                );
                                updateScheduleForm(partner.id, { daysOfMonth: values });
                              }}
                              className="h-24 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 shadow-inner outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-sky-400 dark:focus:ring-sky-500/40"
                            >
                              {Array.from({ length: 28 }, (_, idx) => idx + 1).map((day) => (
                                <option key={day} value={day}>
                                  {day}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}

                        <div className="grid grid-cols-2 gap-2">
                          <label className="flex flex-col gap-1 text-slate-600 dark:text-slate-300">
                            Start date
                            <input
                              type="date"
                              value={scheduleForm.startDate}
                              onChange={(event) => updateScheduleForm(partner.id, { startDate: event.target.value })}
                              className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 shadow-inner outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-sky-400 dark:focus:ring-sky-500/40"
                              required
                            />
                          </label>
                          <label className="flex flex-col gap-1 text-slate-600 dark:text-slate-300">
                            End date
                            <input
                              type="date"
                              value={scheduleForm.endDate}
                              onChange={(event) => updateScheduleForm(partner.id, { endDate: event.target.value })}
                              className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 shadow-inner outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-sky-400 dark:focus:ring-sky-500/40"
                              required
                            />
                          </label>
                        </div>
                        <label className="flex flex-col gap-1 text-slate-600 dark:text-slate-300">
                          Open slots
                          <input
                            type="number"
                            min="1"
                            value={scheduleForm.openSlots}
                            onChange={(event) =>
                              updateScheduleForm(partner.id, { openSlots: Number(event.target.value) })
                            }
                            className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 shadow-inner outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-sky-400 dark:focus:ring-sky-500/40"
                          />
                        </label>
                        <label className="flex flex-col gap-1 text-slate-600 dark:text-slate-300">
                          Notes
                          <textarea
                            value={scheduleForm.notes}
                            onChange={(event) => updateScheduleForm(partner.id, { notes: event.target.value })}
                            className="min-h-[80px] rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 shadow-inner outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-sky-400 dark:focus:ring-sky-500/40"
                          />
                        </label>

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="submit"
                            className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                          >
                            Publish availability
                          </button>
                          <button
                            type="button"
                            className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-slate-500 dark:hover:bg-slate-700"
                            onClick={() => resetScheduleForm(partner.id, scheduleForm.frequency)}
                          >
                            Reset
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>

                  {(partner.schedules || []).length > 0 && (
                    <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
                      <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
                        <thead className="bg-slate-50 dark:bg-slate-800/60">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                              Frequency
                            </th>
                            <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                              Recurrence
                            </th>
                            <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                              Dates
                            </th>
                            <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                              Open rides
                            </th>
                            <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                              Notes
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                          {partner.schedules.map((schedule) => (
                            <tr key={schedule.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                              <td className="px-3 py-2 text-slate-900 dark:text-slate-100 capitalize">
                                {schedule.frequency}
                              </td>
                              <td className="px-3 py-2 text-slate-900 dark:text-slate-100">{formatRecurrence(schedule)}</td>
                              <td className="px-3 py-2 text-slate-900 dark:text-slate-100">
                                {new Date(schedule.startDate).toLocaleDateString()} -{" "}
                                {new Date(schedule.endDate).toLocaleDateString()}
                              </td>
                              <td className="px-3 py-2 text-slate-900 dark:text-slate-100">{schedule.openSlots}</td>
                              <td className="px-3 py-2 text-slate-900 dark:text-slate-100">{schedule.notes || "None"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
            {!partners.length && (
              <div className="rounded-xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                No partners yet. Add a partner above to begin.
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
};

export default RidePartnerManagementPage;
