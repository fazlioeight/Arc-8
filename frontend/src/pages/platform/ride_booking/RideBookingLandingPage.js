import React, { useContext, useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import PortalPageLayout from "../../../components/PortalPageLayout";
import PortalPageHeader from "../../../components/PortalPageHeader";
import PortalCard from "../../../components/PortalCard";
import PortalStat from "../../../components/PortalStat";
import { EmptyState, ErrorState, LoadingState } from "../../../components/ehr/Primitives";
import { RideBookingService } from "../../../services/rideBookingService";
import { AuthContext } from "../../../context/AuthContext";
import "../coding/member/memberWorkspace.css";
import { ROUTES } from "../../../constants/routes";
import { RIDE_NAV_ITEMS } from "./rideNavItems";

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "queued", label: "Queued" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
];

const EMPTY_VALUE = "--";

const formatDateTime = (iso) => {
  if (!iso) return EMPTY_VALUE;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return EMPTY_VALUE;
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
};

const statusTone = (status) => {
  switch (status) {
    case "completed":
      return "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200";
    case "queued":
      return "bg-slate-100 text-slate-700 ring-1 ring-slate-200";
    case "in_progress":
      return "bg-sky-100 text-sky-700 ring-1 ring-sky-200";
    default:
      return "bg-slate-100 text-slate-700 ring-1 ring-slate-200";
  }
};

const RideBookingLandingPage = () => {
  const navigate = useNavigate();
  const { token, tenant } = useContext(AuthContext) || {};
  const rideBookingService = useMemo(() => new RideBookingService({ token, tenant }), [tenant, token]);
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedRideId, setSelectedRideId] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [companyFilter, setCompanyFilter] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);

  const loadRides = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await rideBookingService.getRecentRides();
      setRides(result || []);
      setLastUpdated(new Date());
    } catch (err) {
      setRides([]);
      setSelectedRideId(null);
      setLastUpdated(null);
      setError(err.message || "Unable to load rides");
    } finally {
      setLoading(false);
    }
  }, [rideBookingService]);

  useEffect(() => {
    loadRides();
  }, [loadRides]);

  const filteredRides = useMemo(() => {
    return rides.filter((ride) => {
      if (statusFilter !== "all" && ride.status !== statusFilter) return false;
      if (companyFilter && ride.rideType !== companyFilter) return false;
      const term = searchTerm.trim().toLowerCase();
      if (term) {
        const haystack = [ride.memberName, ride.pickupAddress, ride.dropoffAddress, ride.rideType]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(term);
      }
      return true;
    });
  }, [rides, statusFilter, companyFilter, searchTerm]);

  useEffect(() => {
    if (!filteredRides.length) {
      setSelectedRideId(null);
      return;
    }
    setSelectedRideId((prev) => {
      if (prev && filteredRides.some((ride) => ride.id === prev)) {
        return prev;
      }
      return filteredRides[0].id;
    });
  }, [filteredRides]);

  const selectedRide = useMemo(
    () => filteredRides.find((ride) => ride.id === selectedRideId) || null,
    [filteredRides, selectedRideId]
  );

  const companies = Array.from(new Set(rides.map((ride) => ride.rideType).filter(Boolean)));

  const renderRow = useCallback(
    (ride) => (
      <tr
        key={ride.id}
        className={`cursor-pointer transition hover:bg-slate-50 dark:hover:bg-slate-800/60 ${selectedRideId === ride.id ? "bg-sky-50 dark:bg-slate-800/80" : ""}`}
        onClick={() => setSelectedRideId(ride.id)}
      >
        <td className="px-4 py-3 text-sm text-slate-900 dark:text-slate-100">
          <div className="font-semibold">{ride.memberName}</div>
          <div className="text-xs text-slate-500 dark:text-slate-300">{ride.memberId}</div>
        </td>
        <td className="px-4 py-3 text-sm text-slate-900 dark:text-slate-100">{ride.rideType}</td>
        <td className="px-4 py-3 text-sm text-slate-900 dark:text-slate-100">
          <div className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${statusTone(ride.status)}`}>
            {ride.status}
          </div>
        </td>
        <td className="px-4 py-3 text-sm text-slate-900 dark:text-slate-100">{formatDateTime(ride.pickupAt)}</td>
        <td className="px-4 py-3 text-sm text-slate-900 dark:text-slate-100">{ride.pickupAddress}</td>
        <td className="px-4 py-3 text-sm text-slate-900 dark:text-slate-100 text-right">{ride.costUsd ? `$${ride.costUsd.toFixed(2)}` : EMPTY_VALUE}</td>
      </tr>
    ),
    [selectedRideId]
  );

  const layoutProps = useMemo(
    () => ({
      backgroundClassName:
        "",
      maxWidthClassName: "max-w-6xl",
      paddingClassName: "px-4",
      navItems: RIDE_NAV_ITEMS,
      currentNav: "ride-overview",
    }),
    []
  );

  const completedCount = filteredRides.filter((ride) => ride.status === "completed").length;
  const inProgressCount = filteredRides.filter((ride) => ride.status === "in_progress").length;
  const queuedCount = filteredRides.filter((ride) => ride.status === "queued").length;

  const headerContent = (
    <PortalPageHeader
      eyebrow="Ride booking"
      title="Ride booking overview"
      subtitle="Review the latest transportation activity and drill into ride details."
      actions={
        <div className="flex flex-wrap items-center gap-3">
          <PortalStat label="Rides" value={filteredRides.length} meta="Matching filters" tone="info" />
          <PortalStat label="Completed" value={completedCount} meta="Success" tone="success" />
          <PortalStat label="In progress" value={inProgressCount} meta="On the road" tone="warning" />
          <PortalStat
            label="Queued"
            value={queuedCount}
            meta={lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : "Awaiting sync"}
            tone="info"
          />
        </div>
      }
    />
  );

  const detailTone = useMemo(() => {
    if (!selectedRide) return "neutral";
    if (selectedRide.status === "completed") return "success";
    if (selectedRide.status === "queued") return "warning";
    return "info";
  }, [selectedRide]);

  return (
    <PortalPageLayout {...layoutProps} headerContent={headerContent}>
      <PortalCard
        title="Filters & actions"
        subtitle="Tighten the ride manifest by status, partner, or keyword."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button className="portal-ghost-button" onClick={() => navigate(ROUTES.RIDE_BOOKING.BOOK)}>
              Book ride
            </button>
            <button className="portal-ghost-button" onClick={loadRides} disabled={loading}>
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        }
      >
        <div className="portal-section-grid">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300" htmlFor="ride-search">
              Search
            </label>
            <input
              id="ride-search"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-inner outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-sky-400 dark:focus:ring-sky-500/40"
              type="search"
              placeholder="Member, address, or partner"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Status</label>
            <select
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-sky-400 dark:focus:ring-sky-500/40"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Partner</label>
            <select
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-sky-400 dark:focus:ring-sky-500/40"
              value={companyFilter}
              onChange={(event) => setCompanyFilter(event.target.value)}
            >
              <option value="">All partners</option>
              {companies.map((company) => (
                <option key={company} value={company}>
                  {company}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                className="portal-ghost-button"
                onClick={() => {
                  setStatusFilter("all");
                  setCompanyFilter("");
                  setSearchTerm("");
                }}
              >
                Clear filters
              </button>
              <span className="portal-pill portal-pill--ghost">{filteredRides.length} ride(s) visible</span>
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Last updated {lastUpdated ? lastUpdated.toLocaleTimeString() : "--"}
            </span>
          </div>
        </div>
      </PortalCard>

      {error ? (
        <PortalCard tone="danger" title="Unable to load rides" subtitle={error}>
          <ErrorState
            title="Unable to load rides"
            description={error}
            actions={
              <button
                type="button"
                className="portal-ghost-button"
                onClick={loadRides}
                disabled={loading}
              >
                Try again
              </button>
            }
            className="mx-auto w-full"
          />
        </PortalCard>
      ) : null}

      {!error ? (
        <PortalCard title="Recent rides" subtitle="Select a row to preview trip details and billing data.">
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                    Member
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                    Partner
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                    Pickup
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                    From
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                    Cost
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {loading && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6">
                      <LoadingState
                        title="Loading rides"
                        description="Fetching the latest ride manifest."
                        size="sm"
                        className="mx-auto max-w-xl"
                      />
                    </td>
                  </tr>
                )}
                {!loading && filteredRides.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6">
                      <EmptyState
                        title="No rides match your filters"
                        description="Adjust the filters or refresh to pull the latest data."
                        size="sm"
                        className="mx-auto max-w-xl"
                      />
                    </td>
                  </tr>
                )}
                {filteredRides.map(renderRow)}
              </tbody>
            </table>
          </div>
        </PortalCard>
      ) : null}

      <PortalCard
        tone={detailTone}
        title={selectedRide ? selectedRide.memberName : "Ride details"}
        subtitle={selectedRide ? selectedRide.memberId : "Select a ride to view details."}
      >
        {selectedRide ? (
          <div className="space-y-4 text-sm text-slate-800 dark:text-slate-100">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <span className="portal-pill portal-pill--ghost">{selectedRide.rideType}</span>
                <span className="text-xs text-slate-500 dark:text-slate-300">{formatDateTime(selectedRide.pickupAt)}</span>
              </div>
              <div className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${statusTone(selectedRide.status)}`}>
                {selectedRide.status}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-300">Pickup</div>
                <div className="font-semibold">{selectedRide.pickupAddress}</div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-300">Dropoff</div>
                <div className="font-semibold">{selectedRide.dropoffAddress}</div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-300">Cost</div>
                <div className="font-semibold">{selectedRide.costUsd ? `$${selectedRide.costUsd.toFixed(2)}` : EMPTY_VALUE}</div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-300">Ride status</div>
                <div className="font-semibold capitalize">{selectedRide.status.replace("_", " ")}</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="portal-ghost-button" onClick={() => navigate(ROUTES.RIDE_BOOKING.BOOK)}>
                Book another ride
              </button>
              <button className="portal-ghost-button" onClick={loadRides} disabled={loading}>
                Refresh feed
              </button>
            </div>
          </div>
        ) : (
          <EmptyState
            title="Select a ride"
            description="Choose a row above to preview ride details."
            size="sm"
            className="mx-auto max-w-md"
          />
        )}
      </PortalCard>
    </PortalPageLayout>
  );
};

export default RideBookingLandingPage;
