import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import PortalPageLayout from "../../../components/PortalPageLayout";
import PortalPageHeader from "../../../components/PortalPageHeader";
import PortalCard from "../../../components/PortalCard";
import PortalStat from "../../../components/PortalStat";
import { AuthContext } from "../../../context/AuthContext";
import "../coding/member/memberWorkspace.css";
import { RideBookingService } from "../../../services/rideBookingService";
import useGooglePlacesAutocomplete from "../../../hooks/useGooglePlacesAutocomplete";
import { ErrorState } from "../../../components/ehr/Primitives";
import { ROUTES } from "../../../constants/routes";
import { RIDE_NAV_ITEMS } from "./rideNavItems";

const getLocalDate = () => new Date().toISOString().slice(0, 10);
const getLocalTime = () => new Date().toISOString().slice(11, 16);

const RideBooking = () => {
  const { isAuthenticated, token, tenant } = useContext(AuthContext) || {};
  const navigate = useNavigate();
  const rideBookingService = useMemo(() => new RideBookingService({ token, tenant }), [tenant, token]);

  const [memberId, setMemberId] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [pickup, setPickup] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [pickupAddress, setPickupAddress] = useState("");
  const [dropoffAddress, setDropoffAddress] = useState("");
  const [rideOptions, setRideOptions] = useState(["Uber Health", "Lyft Assist", "Other"]);
  const [rideType, setRideType] = useState("Uber Health");
  const [rideDate, setRideDate] = useState(getLocalDate());
  const [rideTime, setRideTime] = useState(getLocalTime());
  const [estimatedCost, setEstimatedCost] = useState("");
  const [formStatus, setFormStatus] = useState(null);
  const [formError, setFormError] = useState(null);

  const pickupAddressInputRef = useRef(null);
  const dropoffAddressInputRef = useRef(null);

  const isPickupAutocompleteReady = useGooglePlacesAutocomplete(pickupAddressInputRef, setPickupAddress);
  const isDropoffAutocompleteReady = useGooglePlacesAutocomplete(dropoffAddressInputRef, setDropoffAddress);
  const addressAutocompleteAvailable = isPickupAutocompleteReady || isDropoffAutocompleteReady;

  const refreshRideOptions = async () => {
    const options = await rideBookingService.getRideOptionsForDate(new Date());
    setRideOptions(options);
    setRideType((current) => (current && options.includes(current) ? current : options[0] || "Other"));
  };

  useEffect(() => {
    let active = true;
    rideBookingService
      .getRideOptionsForDate(new Date())
      .then((options) => {
        if (!active) return;
        setRideOptions(options);
        setRideType((current) => (current && options.includes(current) ? current : options[0] || "Other"));
      })
      .catch(() => {
        if (!active) return;
        setRideOptions(["Uber Health", "Lyft Assist", "Other"]);
        setRideType((current) => current || "Uber Health");
      });
    return () => {
      active = false;
    };
  }, [rideBookingService]);

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

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormStatus(null);
    setFormError(null);
    try {
      const scheduledPickupIso = new Date(`${rideDate}T${rideTime || "08:00"}`).toISOString();
      const record = await rideBookingService.bookRide({
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
    } catch (error) {
      setFormError(error?.message || "We couldn't book the ride. Try again in a moment.");
    }
  };

  const layoutProps = useMemo(
    () => ({
      backgroundClassName:
        "coding-member-workspace portal-theme bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100",
      maxWidthClassName: "max-w-5xl",
      paddingClassName: "px-4",
      navItems: RIDE_NAV_ITEMS,
      currentNav: "ride-book",
      utilityBar: isAuthenticated,
    }),
    [isAuthenticated]
  );

  const headerContent = (
    <PortalPageHeader
      eyebrow="Ride booking"
      title="Book a ride"
      subtitle="Enter member details and schedule transportation in a few quick steps."
      actions={
        <div className="flex flex-wrap items-center gap-3">
          <PortalStat label="Partners" value={rideOptions.length || 0} meta="Available today" tone="info" />
          <PortalStat
            label="Autocomplete"
            value={addressAutocompleteAvailable ? "On" : "Off"}
            meta="Address lookup"
            tone={addressAutocompleteAvailable ? "success" : "warning"}
          />
        </div>
      }
    />
  );

  return (
    <PortalPageLayout {...layoutProps} headerContent={headerContent}>
      <PortalCard
        title="Ride request"
        subtitle="Member identity, pickup details, and partner selection."
        footer={
          <div className="flex w-full justify-end">
            <button
              type="button"
              className="portal-ghost-button"
              onClick={() => navigate(ROUTES.RIDE_BOOKING.LANDING)}
            >
              Back to overview
            </button>
          </div>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="portal-section-grid">
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

          <div className="portal-section-grid">
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

          <div className="portal-section-grid">
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
                  className="portal-ghost-button"
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

        {formError && (
          <div className="mt-4">
            <ErrorState description={formError} title="Ride booking failed" />
          </div>
        )}
        {formStatus && (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 shadow-sm dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-100">
            {formStatus}
          </div>
        )}
      </PortalCard>
    </PortalPageLayout>
  );
};

export default RideBooking;
