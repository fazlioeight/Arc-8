import React, { useContext, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import PortalPageLayout from "../../../components/PortalPageLayout";
import PortalCard from "../../../components/PortalCard";
import PortalPageHeader from "../../../components/PortalPageHeader";
import PortalStat from "../../../components/PortalStat";
import { AuthContext } from "../../../context/AuthContext";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../../../components/ehr/Primitives";
import "../../../index.css";
import "../coding/member/memberWorkspace.css";
import { useMemberSearch } from "../../../hooks/useMemberSearch";
import { usePortalOverview } from "../../../hooks/usePortalOverview";
import { PORTAL_NAV_ITEMS } from "./portalNavItems";
import { ROUTES } from "../../../constants/routes";

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

const PRIORITY_TONE = {
  high: "danger",
  medium: "warning",
  low: "success",
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
        "",
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
        path: ROUTES.PORTAL.LANDING,
        icon: "OV",
        color: "#0ea5e9",
      },
      {
        key: "coding",
        label: "Coding Worklists",
        desc: "Coding queues and chart review tools",
        path: ROUTES.CODING.LANDING,
        icon: "CD",
        color: "#0f172a",
      },
      {
        key: "member360",
        label: "Member 360",
        desc: "Search and launch member charts",
        path: ROUTES.MEMBER_360.LANDING,
        icon: "M3",
        color: "#0891b2",
      },
      {
        key: "ride_booking",
        label: "Ride Booking",
        desc: "Transportation scheduling and tracking",
        path: ROUTES.RIDE_BOOKING.LANDING,
        icon: "RB",
        color: "#2563eb",
      },
      {
        key: "job_center",
        label: "Jobs / Import Data",
        desc: "Kick off and monitor bulk data imports",
        path: ROUTES.JOBS.IMPORT_DATA,
        icon: "JI",
        color: "#0d9488",
      },
      {
        key: "docs",
        label: "Docs Library",
        desc: "Guides, SOPs, and enablement",
        path: ROUTES.DOCS,
        icon: "DL",
        color: "#6366f1",
      },
      {
        key: "settings",
        label: "Settings",
        desc: "Preferences and integrations",
        path: ROUTES.SETTINGS,
        icon: "ST",
        color: "#64748b",
      },
      {
        key: "admin_console",
        label: "Master Admin",
        desc: "Access policies and user controls",
        path: ROUTES.ADMIN.MASTER,
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
    refresh: refreshOverview,
  } = usePortalOverview({
    user,
    accessMap,
    availableApplications,
    purchasedApplications,
    appCatalog,
    token,
    tenant,
  });

  const portalError = overview.error || overviewError;
  const renderableApps = appsToRender || [];
  const lastSavedItems = overview.lastSaved || [];
  const todoItems = overview.todos || [];
  const openTasks = todoItems.length;

  const headerContent = (
    <PortalPageHeader
      eyebrow="Portal Overview"
      title={`Welcome back, ${displayName}`}
      subtitle="Stay aligned with the same workspace feel as your chart view."
      actions={
        <div className="flex flex-wrap items-center gap-3">
          <PortalStat
            label="Applications"
            value={allowedApps.length || renderableApps.length}
            meta="Available"
            tone="info"
          />
          <PortalStat
            label="Open tasks"
            value={openTasks}
            meta="Across products"
            tone="warning"
          />
        </div>
      }
    />
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
          <LoadingState
            title="Loading your Nexora workspace"
            description="Pulling recent tasks, saved items, and applications."
            className="w-full max-w-2xl"
          />
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
      <PortalCard
        compact
        title="Member quick search"
        subtitle="Open a chart without leaving the portal."
        className="coding-member-toolbar"
      >
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
      </PortalCard>

      {portalError && (
        <ErrorState
          title="Portal overview is offline"
          description={portalError}
          actions={
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-slate-500 dark:hover:bg-slate-700"
              onClick={() => refreshOverview()}
            >
              Retry
            </button>
          }
          className="w-full"
        />
      )}

      <PortalCard
        title="Profile"
        subtitle="Your account at a glance"
        tone="info"
        compact
      >
        <div className="portal-list">
          <div className="portal-list-item portal-list-item--info">
            <span className="portal-list-item__icon">
              {user?.email?.slice(0, 1).toUpperCase() || "N"}
            </span>
            <div className="portal-list-item__body">
              <div className="portal-list-item__title">
                {overview.profile?.email || user?.email}
              </div>
              <p className="portal-list-item__meta">
                Tenant {overview.profile?.tenant || user?.tenant || "Nexora"} |{" "}
                {formatRoleLabel(overview.profile?.role)} |{" "}
                {overview.profile?.lastLogin
                  ? `Last login ${formatRelativeTime(overview.profile.lastLogin)}`
                  : "Last login just now"}{" "}
                | {allowedApps.length || renderableApps.length} applications
              </p>
              <div className="portal-list-item__actions">
                <span className="portal-pill portal-pill--ghost">
                  Tenant {overview.profile?.tenant || tenant || "Nexora"}
                </span>
                <span className="portal-pill portal-pill--ghost">
                  {formatRoleLabel(overview.profile?.role)}
                </span>
                <span className="portal-pill portal-pill--ghost">
                  {allowedApps.length || renderableApps.length} apps
                </span>
              </div>
            </div>
            <button
              className="portal-ghost-button"
              onClick={() => navigate("/settings")}
              type="button"
            >
              Manage
            </button>
          </div>
        </div>
      </PortalCard>

      <div className="portal-section-grid">
        <PortalCard
          title="Applications"
          subtitle="Launch into the areas you use most."
          tone="info"
        >
          <div className="portal-list">
            {renderableApps.map((app) => {
              const isLocked = !app.allowed;
              const itemTone = isLocked ? "warning" : "info";
              return (
                <div
                  key={app.key}
                  className={["portal-list-item", `portal-list-item--${itemTone}`].join(
                    " "
                  )}
                  aria-disabled={isLocked}
                >
                  <span
                    className="portal-list-item__icon"
                    style={{ background: app.color }}
                    aria-hidden
                  >
                    {app.icon}
                  </span>
                  <div className="portal-list-item__body">
                    <div className="portal-list-item__title">{app.label}</div>
                    <p className="portal-list-item__meta">{app.desc}</p>
                    {isLocked && (
                      <p className="portal-list-item__meta">
                        Request access from your admin.
                      </p>
                    )}
                  </div>
                  <button
                    className="portal-ghost-button"
                    onClick={() => !isLocked && navigate(app.path)}
                    disabled={isLocked}
                    type="button"
                  >
                    {isLocked ? "Locked" : "Open"}
                  </button>
                </div>
              );
            })}
          </div>
        </PortalCard>

        <PortalCard
          title="Last saved"
          subtitle="Recent items you have pinned or updated."
        >
          <div className="portal-list">
            {lastSavedItems.map((item) => (
              <div key={item.id} className="portal-list-item portal-list-item--info">
                <div className="portal-list-item__body">
                  <div className="portal-list-item__title">{item.title}</div>
                  <p className="portal-list-item__meta">{item.summary}</p>
                  <p className="portal-list-item__meta">
                    Updated {formatRelativeTime(item.savedAt)}
                  </p>
                  <div className="portal-list-item__actions">
                    {item.appKey && (
                      <span className="portal-pill portal-pill--ghost">
                        {item.appKey.replace(/_/g, " ")}
                      </span>
                    )}
                    <button
                      className="portal-ghost-button"
                      type="button"
                      onClick={() => navigate(item.path || "/dashboard")}
                    >
                      Open
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {!lastSavedItems.length && (
              <EmptyState
                title="No saved items yet"
                description="Bookmark a report from the dashboard to keep it handy here."
                size="sm"
                className="w-full"
              />
            )}
          </div>
        </PortalCard>

        <PortalCard
          title="To-do"
          subtitle="Assignments from your managers across applications."
          tone="warning"
        >
          <div className="portal-list">
            {todoItems.map((todo) => {
              const tone = PRIORITY_TONE[todo.priority] || PRIORITY_TONE.low;
              return (
                <div
                  key={todo.id}
                  className={[
                    "portal-list-item",
                    `portal-list-item--${tone}`,
                  ].join(" ")}
                >
                  <div className="portal-list-item__body">
                    <div className="portal-list-item__title">{todo.title}</div>
                    <div className="portal-list-item__actions">
                      <span className="portal-pill portal-pill--solid">
                        {todo.priority || "low"}
                      </span>
                      {todo.appKey && (
                        <span className="portal-pill portal-pill--ghost">
                          {todo.appKey.replace(/_/g, " ")}
                        </span>
                      )}
                      {todo.dueAt && (
                        <span className="portal-pill portal-pill--ghost">
                          Due {formatRelativeTime(todo.dueAt)}
                        </span>
                      )}
                      {todo.assignedBy && (
                        <span className="portal-pill portal-pill--ghost">
                          Assigned by {todo.assignedBy}
                        </span>
                      )}
                    </div>
                    <button
                      className="portal-ghost-button"
                      type="button"
                      onClick={() => navigate(todo.path || "/dashboard")}
                    >
                      View task
                    </button>
                  </div>
                </div>
              );
            })}
            {!todoItems.length && (
              <EmptyState
                title="No open tasks"
                description="Enjoy the clear slate; new assignments will appear here."
                size="sm"
                className="w-full"
              />
            )}
          </div>
        </PortalCard>
      </div>
    </PortalPageLayout>
  );
};

export default PortalPage;
