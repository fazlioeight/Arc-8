import React, { useContext, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import PortalPageLayout from "../../../components/PortalPageLayout";
import { AuthContext } from "../../../context/AuthContext";
import { SectionHeader } from "../../../components/ehr/Primitives";
import "../../../index.css";
import "../coding/member/memberWorkspace.css";
import "./portalPage.sfdc.css";
import { useMemberSearch } from "../../../hooks/useMemberSearch";
import { usePortalOverview } from "../../../hooks/usePortalOverview";
import { PORTAL_NAV_ITEMS } from "./portalNavItems";

const formatRelativeTime = (value) => {
  try {
    const date = typeof value === "string" ? new Date(value) : value;
    const diff = date.getTime() - Date.now();
    const tense = diff < 0 ? "past" : "future";
    const absMs = Math.abs(diff);
    const minutes = Math.round(absMs / (60 * 1000));
    if (minutes < 1) return "just now";
    const hours = Math.round(minutes / 60);
    const days = Math.round(hours / 24);
    const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
    if (minutes < 60) {
      return rtf.format(tense === "past" ? -minutes : minutes, "minute");
    }
    if (hours < 24) {
      return rtf.format(tense === "past" ? -hours : hours, "hour");
    }
    return rtf.format(tense === "past" ? -days : days, "day");
  } catch (error) {
    return value ? String(value) : "n/a";
  }
};

const formatRoleLabel = (value) => {
  if (!value) return "User";
  switch (value) {
    case "admin":
      return "Admin";
    case "platform_admin":
      return "Platform admin";
    default:
      return value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, " ");
  }
};

const PRIORITY_VARIANT = {
  high: "ehr-alert--danger",
  medium: "ehr-alert--warning",
  low: "ehr-alert--success",
};

const PortalPage = () => {
  const navigate = useNavigate();
  const auth = useContext(AuthContext) || {};
  const {
    user,
    token,
    tenant,
    applications: accessMap = {},
    availableApplications = [],
    purchasedApplications = [],
  } = auth;
  const displayName = useMemo(
    () => user?.email?.split("@")[0] || "there",
    [user?.email]
  );

  const layoutProps = useMemo(
    () => ({
      navItems: PORTAL_NAV_ITEMS,
      currentNav: "portal",
      navProps: { align: "center", tone: "surface" },
      backgroundClassName:
        "coding-member-workspace portal-theme bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100",
      maxWidthClassName: "max-w-6xl",
      paddingClassName: "px-4",
    }),
    []
  );
  const {
    memberQuery,
    memberOptions,
    memberSearchError,
    isLaunchingMember,
    statusMessage: memberSearchStatus,
    handleMemberQueryChange,
    handleMemberSearch,
  } = useMemberSearch({
    token,
    tenant,
    onNavigate: (memberId) => navigate(`/coding/member/${memberId}/chart`),
  });

  const appCatalog = useMemo(
    () => [
      {
        key: "portal",
        label: "Portal Overview",
        desc: "Daily digest and workspace snapshot",
        path: "/portalPage",
        icon: "OV",
        color: "#0ea5e9",
      },
      {
        key: "coding",
        label: "Coding Worklists",
        desc: "Coding queues and chart review tools",
        path: "/coding",
        icon: "CD",
        color: "#0f172a",
      },
      {
        key: "member360",
        label: "Member 360",
        desc: "Search and launch member charts",
        path: "/member-360",
        icon: "M3",
        color: "#0891b2",
      },
      {
        key: "ride_booking",
        label: "Ride Booking",
        desc: "Transportation scheduling and tracking",
        path: "/rideBooking",
        icon: "RB",
        color: "#2563eb",
      },
      {
        key: "jobs/import-data",
        label: "Jobs / Import Data",
        desc: "Kick off and monitor bulk data imports",
        path: "/jobs/import-data",
        icon: "JI",
        color: "#0d9488",
      },
      {
        key: "docs",
        label: "Docs Library",
        desc: "Guides, SOPs, and enablement",
        path: "/docs",
        icon: "DL",
        color: "#6366f1",
      },
      {
        key: "settings",
        label: "Settings",
        desc: "Preferences and integrations",
        path: "/settings",
        icon: "ST",
        color: "#64748b",
      },
      {
        key: "admin_console",
        label: "Master Admin",
        desc: "Access policies and user controls",
        path: "/admin/master",
        icon: "MA",
        color: "#dc2626",
        requiredLevel: "admin",
      },
    ],
    []
  );

  const {
    overview,
    isLoading: overviewLoading,
    error: overviewError,
    appsToRender,
    accessibleApps: allowedApps,
  } = usePortalOverview({
    user,
    accessMap,
    availableApplications,
    purchasedApplications,
    appCatalog,
    token,
  });

  const cardClass = "rounded-xl p-4 portal-alert-shell";
  const portalError = overview.error || overviewError;

  const headerContent = (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] coding-text-muted">
          Portal Overview
        </p>
        <h1 className="text-2xl font-semibold coding-text-strong sm:text-3xl">
          Welcome back, {displayName}
        </h1>
        <p className="coding-text-soft text-base">
          Stay aligned with the same workspace feel as your chart view.
        </p>
      </div>
      <div className="flex items-center gap-3 rounded-xl bg-white/60 px-4 py-3 shadow-sm ring-1 ring-gray-200 dark:bg-white/5 dark:ring-0">
        <div className="flex flex-col text-right">
          <span className="text-[11px] uppercase tracking-wide coding-text-muted">
            Applications
          </span>
          <span className="text-lg font-semibold coding-text-strong">
            {allowedApps.length || appsToRender.length}
          </span>
        </div>
        <span className="h-10 w-px bg-gray-200 dark:bg-white/20" />
        <div className="flex flex-col text-right">
          <span className="text-[11px] uppercase tracking-wide coding-text-muted">
            Open tasks
          </span>
          <span className="text-lg font-semibold coding-text-strong">
            {overview.todos.length}
          </span>
        </div>
      </div>
    </div>
  );

  if (overviewLoading) {
    return (
      <PortalPageLayout
        {...layoutProps}
        title={`Welcome back, ${displayName}`}
        subtitle="Stay aligned with the same workspace feel as your chart view."
        eyebrow="Portal Overview"
        align="center"
        mainClassName="pt-10"
      >
        <section className="flex items-center justify-center py-16">
          <div className="coding-surface w-full rounded-2xl p-8 text-center shadow-sm">
            <p className="text-base font-medium coding-text-strong">
              Loading your Nexora workspace...
            </p>
          </div>
        </section>
      </PortalPageLayout>
    );
  }

  return (
    <PortalPageLayout
      {...layoutProps}
      headerContent={headerContent}
      mainClassName="space-y-6"
    >
      <section className="coding-member-toolbar">
        <form
          className="flex flex-col gap-4 sm:flex-row sm:items-end"
          onSubmit={handleMemberSearch}
          aria-label="Member quick search"
        >
          <div className="flex-1 space-y-2">
            <label
              className="text-sm font-semibold coding-text-strong"
              htmlFor="portal-member-search-input"
            >
              Member ID
            </label>
            <div className="relative">
              <input
                id="portal-member-search-input"
                type="search"
                autoComplete="off"
                placeholder="Search by member ID"
                value={memberQuery}
                onChange={(event) => handleMemberQueryChange(event.target.value)}
                list="portal-member-suggestions"
                aria-describedby="portal-member-search-help"
                className="coding-input w-full rounded-xl px-4 py-3 text-sm"
              />
              <datalist id="portal-member-suggestions">
                {memberOptions.map((option) => (
                  <option key={option.key} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </datalist>
            </div>
          </div>
          <button
            className="inline-flex h-12 items-center justify-center rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-60"
            type="submit"
            disabled={!memberQuery.trim() || isLaunchingMember}
          >
            {isLaunchingMember ? "Opening..." : "Open chart"}
          </button>
        </form>
        <p
          className={`text-sm ${
            memberSearchError ? "text-red-600" : "coding-text-muted"
          }`}
          id="portal-member-search-help"
          role="status"
        >
          {memberSearchStatus}
        </p>
      </section>

      {portalError && (
        <div className="coding-surface-subtle flex items-start gap-3 rounded-xl px-4 py-3 text-amber-900 shadow-sm">
          <span className="text-sm font-semibold coding-text-strong">Heads up</span>
          <span className="text-sm coding-text-soft">{portalError}</span>
        </div>
      )}

      <section className={cardClass} aria-label="User profile summary">
        <SectionHeader title="Profile" subtitle="Your account at a glance" />
        <div className="mt-3 space-y-2">
          <div className="ehr-alert ehr-alert--info portal-alert-card">
            <div className="flex w-full items-start gap-3">
              <span className="portal-alert-icon">
                {user?.email?.slice(0, 1).toUpperCase() || "N"}
              </span>
              <div className="flex-1 space-y-1">
                <div className="portal-alert-card__title">
                  {overview.profile?.email || user?.email}
                </div>
                <div className="portal-alert-card__meta">
                  Tenant {overview.profile?.tenant || user?.tenant || "Nexora"} |{" "}
                  {formatRoleLabel(overview.profile?.role)} |{" "}
                  {overview.profile?.lastLogin
                    ? `Last login ${formatRelativeTime(overview.profile.lastLogin)}`
                    : "Last login just now"}{" "}
                  | {allowedApps.length || appsToRender.length} applications
                </div>
              </div>
              <button
                className="portal-alert-button"
                onClick={() => navigate("/settings")}
                type="button"
              >
                Manage
              </button>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className={cardClass} aria-label="Applications">
          <SectionHeader
            title="Applications"
            subtitle="Launch into the areas you use most."
          />
          <div className="mt-3 space-y-2">
            {appsToRender.map((app) => {
              const isLocked = !app.allowed;
              const tone = isLocked ? "ehr-alert--warning" : "ehr-alert--info";
              return (
                <div
                  key={app.key}
                  className={`ehr-alert portal-alert-card ${tone}`}
                  aria-disabled={isLocked}
                >
                  <div className="flex w-full items-start gap-3">
                    <span
                      className="portal-alert-icon"
                      style={{ background: app.color }}
                      aria-hidden
                    >
                      {app.icon}
                    </span>
                    <div className="flex-1">
                      <div className="portal-alert-card__title">{app.label}</div>
                      <p className="portal-alert-card__meta">{app.desc}</p>
                      {isLocked && (
                        <p className="portal-alert-card__meta">
                          Request access from your admin.
                        </p>
                      )}
                    </div>
                    <button
                      className="portal-alert-button"
                      onClick={() => !isLocked && navigate(app.path)}
                      disabled={isLocked}
                      type="button"
                    >
                      {isLocked ? "Locked" : "Open"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className={cardClass} aria-label="Last saved items">
          <SectionHeader
            title="Last saved"
            subtitle="Recent items you have pinned or updated."
          />
          <ul className="mt-3 space-y-2">
            {overview.lastSaved.map((item) => (
              <li
                key={item.id}
                className="ehr-alert portal-alert-card ehr-alert--info"
              >
                <div className="flex w-full flex-col gap-2">
                  <div>
                    <div className="portal-alert-card__title">{item.title}</div>
                    <p className="portal-alert-card__meta">{item.summary}</p>
                    <p className="portal-alert-card__meta">
                      Updated {formatRelativeTime(item.savedAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {item.appKey && (
                      <span className="portal-alert-pill">
                        {item.appKey.replace(/_/g, " ")}
                      </span>
                    )}
                    <button
                      className="portal-alert-button"
                      type="button"
                      onClick={() => navigate(item.path || "/dashboard")}
                    >
                      Open
                    </button>
                  </div>
                </div>
              </li>
            ))}
            {!overview.lastSaved.length && (
              <li className="coding-empty-state">
                No saved items yet. Try bookmarking a report from the
                dashboard.
              </li>
            )}
          </ul>
        </section>

        <section className={cardClass} aria-label="Assigned to-do items">
          <SectionHeader
            title="To-do"
            subtitle="Assignments from your managers across applications."
          />
          <ul className="mt-3 space-y-2">
            {overview.todos.map((todo) => {
              const tone = PRIORITY_VARIANT[todo.priority] || PRIORITY_VARIANT.low;
              return (
                <li
                  key={todo.id}
                  className={`ehr-alert portal-alert-card ${tone}`}
                >
                  <div className="flex w-full flex-col gap-2">
                    <div className="portal-alert-card__title">
                      {todo.title}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="portal-alert-pill">
                        {todo.priority || "low"}
                      </span>
                      {todo.appKey && (
                        <span className="portal-alert-pill">
                          {todo.appKey.replace(/_/g, " ")}
                        </span>
                      )}
                      {todo.dueAt && (
                        <span className="portal-alert-pill portal-alert-pill--ghost">
                          Due {formatRelativeTime(todo.dueAt)}
                        </span>
                      )}
                      {todo.assignedBy && (
                        <span className="portal-alert-pill portal-alert-pill--ghost">
                          Assigned by {todo.assignedBy}
                        </span>
                      )}
                    </div>
                    <div>
                      <button
                        className="portal-alert-button"
                        type="button"
                        onClick={() => navigate(todo.path || "/dashboard")}
                      >
                        View task
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
            {!overview.todos.length && (
              <li className="coding-empty-state">
                No open tasks. Enjoy the clear slate!
              </li>
            )}
          </ul>
        </section>
      </div>
    </PortalPageLayout>
  );
};

export default PortalPage;
