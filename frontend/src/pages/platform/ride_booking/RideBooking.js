import React, { useContext, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../../../context/AuthContext";
import PortalUtilityBar from "../../../components/PortalUtilityBar";
import RideBookingHeader from "./RideBookingHeader";
import "../coding/member/memberWorkspace.css";
import "../../../styles/rideBooking.css";
import { addRideRecord, getRideCompaniesForDate } from "../../../services/rideBookingService";
import useGooglePlacesAutocomplete from "../../../hooks/useGooglePlacesAutocomplete";

const getLocalDate = () => new Date().toISOString().slice(0, 10);
const getLocalTime = () => new Date().toISOString().slice(11, 16);

const RideBooking = () => {
  const { isAuthenticated } = useContext(AuthContext) || {};
  const navigate = useNavigate();

  const [memberId, setMemberId] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [pickup, setPickup] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [pickupAddress, setPickupAddress] = useState("");
  const [dropoffAddress, setDropoffAddress] = useState("");
  const [rideOptions, setRideOptions] = useState(() => getRideCompaniesForDate(new Date()));
  const [rideType, setRideType] = useState(() => getRideCompaniesForDate(new Date())[0] || "Other");
  const [rideDate, setRideDate] = useState(getLocalDate());
  const [rideTime, setRideTime] = useState(getLocalTime());
  const [estimatedCost, setEstimatedCost] = useState("");
  const [formStatus, setFormStatus] = useState(null);

  const pickupAddressInputRef = useRef(null);
  const dropoffAddressInputRef = useRef(null);

  const isPickupAutocompleteReady = useGooglePlacesAutocomplete(pickupAddressInputRef, setPickupAddress);
  const isDropoffAutocompleteReady = useGooglePlacesAutocomplete(dropoffAddressInputRef, setDropoffAddress);

  const refreshRideOptions = () => {
    const options = getRideCompaniesForDate(new Date());
    setRideOptions(options);
    setRideType((current) => (current && options.includes(current) ? current : options[0] || "Other"));
  };

  const resetForm = () => {
    setMemberId("");
    setFirstName("");
    setLastName("");
    setPickup("");
    setDropoff("");
    setPickupAddress("");
    setDropoffAddress("");
    setRideDate(getLocalDate());
    setRideTime(getLocalTime());
    setEstimatedCost("");
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    setFormStatus(null);
    const scheduledPickupIso = new Date(`${rideDate}T${rideTime || "08:00"}`).toISOString();
    const record = addRideRecord({
      memberId,
      firstName,
      lastName,
      rideType: rideType || rideOptions[0] || "Other",
      pickup,
      dropoff,
      pickupAddress,
      dropoffAddress,
      scheduledPickup: scheduledPickupIso,
      costUsd: estimatedCost ? Number(estimatedCost) : undefined,
    });
    setFormStatus(`Ride booked with ${record.rideType} for ${record.firstName} ${record.lastName}.`);
    resetForm();
  };

  return (
    <div className="ride-booking coding-member-workspace portal-theme min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {isAuthenticated && <PortalUtilityBar />}
      <RideBookingHeader
        title="Book a ride"
        subtitle="Enter member details and schedule transportation in a few quick steps."
      />

      <div className="ride-booking__shell">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold" htmlFor="memberId">
                Member ID
              </label>
              <input
                id="memberId"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-inner outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-sky-400 dark:focus:ring-sky-500/40"
                value={memberId}
                onChange={(event) => setMemberId(event.target.value)}
                required
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-semibold" htmlFor="firstName">
                  First name
                </label>
                <input
                  id="firstName"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-inner outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-sky-400 dark:focus:ring-sky-500/40"
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold" htmlFor="lastName">
                  Last name
                </label>
                <input
                  id="lastName"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-inner outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-sky-400 dark:focus:ring-sky-500/40"
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold" htmlFor="pickup">
                Pickup location (facility or name)
              </label>
              <input
                id="pickup"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-inner outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-sky-400 dark:focus:ring-sky-500/40"
                value={pickup}
                onChange={(event) => setPickup(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold" htmlFor="pickupAddress">
                Pickup address
              </label>
              <input
                id="pickupAddress"
                ref={pickupAddressInputRef}
                autoComplete="off"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-inner outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-sky-400 dark:focus:ring-sky-500/40"
                value={pickupAddress}
                onChange={(event) => setPickupAddress(event.target.value)}
                required
              />
              {isPickupAutocompleteReady && (
                <p className="text-xs text-slate-500">Start typing to search for a verified address.</p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold" htmlFor="dropoff">
                Dropoff location
              </label>
              <input
                id="dropoff"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-inner outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-sky-400 dark:focus:ring-sky-500/40"
                value={dropoff}
                onChange={(event) => setDropoff(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold" htmlFor="dropoffAddress">
                Dropoff address
              </label>
              <input
                id="dropoffAddress"
                ref={dropoffAddressInputRef}
                autoComplete="off"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-inner outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-sky-400 dark:focus:ring-sky-500/40"
                value={dropoffAddress}
                onChange={(event) => setDropoffAddress(event.target.value)}
                required
              />
              {isDropoffAutocompleteReady && (
                <p className="text-xs text-slate-500">Start typing to search for a verified address.</p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-semibold" htmlFor="rideDate">
                  Ride date
                </label>
                <input
                  id="rideDate"
                  type="date"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-inner outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-sky-400 dark:focus:ring-sky-500/40"
                  value={rideDate}
                  onChange={(event) => setRideDate(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold" htmlFor="rideTime">
                  Pickup time
                </label>
                <input
                  id="rideTime"
                  type="time"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-inner outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-sky-400 dark:focus:ring-sky-500/40"
                  value={rideTime}
                  onChange={(event) => setRideTime(event.target.value)}
                  required
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-semibold" htmlFor="rideType">
                  Ride partner
                </label>
                <div className="flex items-center gap-2">
                  <select
                    id="rideType"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-sky-400 dark:focus:ring-sky-500/40"
                    value={rideType}
                    onChange={(event) => setRideType(event.target.value)}
                    required
                  >
                    {rideOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-slate-500 dark:hover:bg-slate-700"
                    onClick={refreshRideOptions}
                  >
                    Refresh
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold" htmlFor="estimatedCost">
                  Estimated cost (optional)
                </label>
                <input
                  id="estimatedCost"
                  type="number"
                  min="0"
                  step="0.01"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-inner outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-sky-400 dark:focus:ring-sky-500/40"
                  value={estimatedCost}
                  onChange={(event) => setEstimatedCost(event.target.value)}
                />
              </div>
            </div>

            <button
              type="submit"
              className="mt-2 w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
            >
              Book ride
            </button>
          </form>

          {formStatus && (
            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 shadow-sm dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-100">
              {formStatus}
            </div>
          )}
        </section>

        <div className="mt-4 text-right">
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-slate-500 dark:hover:bg-slate-700"
            onClick={() => navigate("/RideBooking")}
          >
            Back to overview
          </button>
        </div>
      </div>
    </div>
  );
};

export default RideBooking;
