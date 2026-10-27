import React, { useContext, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import PortalPageLayout from "../../../components/PortalPageLayout";
import KpiTile from "../../../components/ui/KpiTile";
import SearchInput from "../../../components/ui/SearchInput";
import { AuthContext } from "../../../context/AuthContext";
import { usePermissions } from "../../../hooks/usePermissions";
import { useUserPreferences } from "../../../context/UserPreferencesContext";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../../../components/ehr/Primitives";
import "../../../index.css";
import "../../../styles/memberWorkspace.css";
import "../../../styles/portalPattern.css";
import { useMemberSearch } from "../../../hooks/useMemberSearch";
import { usePortalOverview } from "../../../hooks/usePortalOverview";
import { PORTAL_NAV_ITEMS } from "./portalNavItems";
import { ROUTES } from "../../../constants/routes";
import {
  Member360MemberSearchService,
  MemberSearchService,
  PortalMemberSearchService,
} from "../../../services/codingService";

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
  const { currentRole, can } = usePermissions();
  const { t } = useUserPreferences();
  const canSearchMembers = currentRole !== "patient" && can("menu:patient_roster");
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
  const hasMember360 = Boolean(accessMap?.member360);
  const hasCoding = Boolean(accessMap?.coding);
  const memberSearchService = useMemo(() => {
    if (hasMember360 && hasCoding) {
      return new PortalMemberSearchService({ token, tenant });
    }
    if (hasMember360) {
      return new Member360MemberSearchService({ token, tenant });
    }
    if (hasCoding) {
      return new MemberSearchService({ token, tenant });
    }
    return new Member360MemberSearchService({ token, tenant });
  }, [hasCoding, hasMember360, tenant, token]);

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
    service: memberSearchService,
    onNavigate: (memberId) =>
      navigate(`${ROUTES.MEMBER360_LAB.MEMBER_WORKSPACE_ROOT}/${memberId}`),
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
        key: "member360",
        label: "Member 360",
        desc: "Search and launch member charts",
        path: ROUTES.MEMBER360_LAB.DASHBOARD,
        icon: "M3",
        color: "#0891b2",
      },
      {
        key: "coding",
        label: "Coding Worklists",
        desc: "Review chases assigned to you",
        path: ROUTES.CODING.WORKLIST,
        icon: "CD",
        color: "#0f172a",
      },
      {
        key: "providers",
        label: "Providers",
        desc: "Search the provider directory",
        path: ROUTES.PROVIDERS.LANDING,
        icon: "PR",
        color: "#1f2937",
      },
      {
        key: "ride_booking",
        label: "Ride Booking",
        desc: "Schedule and reconcile transportation",
        path: "/ride-booking",
        icon: "RB",
        color: "#2563eb",
      },
      {
        key: "dashboard",
        label: "Dashboard",
        desc: "Analytics view across programs",
        path: "/dashboard",
        icon: "DB",
        color: "#4f46e5",
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
        key: "chat",
        label: "Nexora Chat",
        desc: "Claude assistant, files, workbooks, dataset",
        path: ROUTES.CHAT,
        icon: "AI",
        color: "#7c3aed",
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

  const tenantLabel = overview.profile?.tenant || tenant || 'Nexora Lab';
  const lastLoginText = overview.profile?.lastLogin
    ? `Last login ${formatRelativeTime(overview.profile.lastLogin)}`
    : 'Last login just now';

  const headerContent = (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] coding-text-muted">{t("Enterprise Clinical Portal")}</p>
        <span className="rounded-full bg-sky-500/10 border border-sky-500/30 px-2.5 py-0.5 text-[10px] font-bold text-sky-600 dark:text-sky-400">
          {(currentRole || auth.role || "User").replace(/_/g, " ").toUpperCase()}
        </span>
      </div>
      <h1 className="text-3xl font-bold tracking-tight coding-text-strong">
        {t("Welcome back")}, {displayName}
      </h1>
      <div className="flex flex-wrap items-center gap-2 text-sm coding-text-soft">
        <span>{tenantLabel}</span>
        <span>&middot;</span>
        <span>{t("Role")}: <strong>{formatRoleLabel(currentRole || auth.role || overview.profile?.role)}</strong></span>
        <span>&middot;</span>
        <span>{lastLoginText}</span>
      </div>
    </div>
  );

  const kpiStrip = (
    <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <KpiTile label={t("Applications")} value={allowedApps.length || renderableApps.length} hint={t("Available to you")} />
      <KpiTile label={t("Open tasks")} value={openTasks} tone={openTasks > 0 ? 'warning' : 'neutral'} hint={t("Across products")} />
      <KpiTile label={t("Saved items")} value={lastSavedItems.length} hint={t("Recently pinned")} />
      <KpiTile label={t("Tenant")} value={tenantLabel} hint={t("Workspace")} small />
    </section>
  );

  if (overviewLoading) {
    return (
      <PortalPageLayout
        {...layoutProps}
        title={`${t("Welcome back")}, ${displayName}`}
        subtitle="Stay aligned with the same workspace feel as your chart view."
        eyebrow={t("Portal Overview")}
        align="center"
        mainClassName="pt-10"
      >
        <section className="flex items-center justify-center py-16">
          <LoadingState
            title="Loading your Nexora Lab workspace"
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
      {kpiStrip}

      {canSearchMembers && (
        <section className="coding-surface rounded-2xl shadow-sm p-5">
          <header className="flex items-start justify-between gap-3 mb-3">
            <div>
              <h2 className="text-sm font-semibold coding-text-strong">{t("Member quick search")}</h2>
              <p className="text-xs coding-text-soft">{t("Open a chart without leaving the portal.")}</p>
            </div>
          </header>
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={handleMemberSearch}
            aria-label="Member quick search"
          >
            <div className="flex-1">
              <label
                className="block text-[11px] font-medium uppercase tracking-wider coding-text-muted mb-1"
                htmlFor="portal-member-search-input"
              >
                Member ID
              </label>
              <SearchInput
                id="portal-member-search-input"
                autoComplete="off"
                placeholder="Search by member ID, name, or plan"
                value={memberQuery}
                onChange={(event) => handleMemberQueryChange(event.target.value)}
                list="portal-member-suggestions"
                aria-describedby="portal-member-search-help"
                className="pl-9 pr-3 py-2.5"
                wrapperClassName="w-full"
              />
              <datalist id="portal-member-suggestions">
                {memberOptions.map((option) => (
                  <option key={option.key} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </datalist>
            </div>
            <button
              className="inline-flex items-center justify-center rounded-md bg-[var(--brand-primary)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
              type="submit"
              disabled={!memberQuery.trim() || isLaunchingMember}
            >
              {isLaunchingMember ? "Opening..." : t("Open chart")}
            </button>
          </form>
          <p
            className={`mt-2 text-xs ${
              memberSearchError ? "text-rose-600 dark:text-rose-300" : "coding-text-muted"
            }`}
            id="portal-member-search-help"
            role="status"
          >
            {memberSearchStatus}
          </p>
        </section>
      )}

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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <section className="coding-surface rounded-2xl shadow-sm p-5">
          <header className="flex items-start justify-between gap-3 mb-3">
            <div>
              <h2 className="text-sm font-semibold coding-text-strong">Last saved</h2>
              <p className="text-xs coding-text-soft">Recent items you have pinned or updated.</p>
            </div>
          </header>
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
                      className="portal-task-link"
                      type="button"
                      onClick={() => navigate(item.path || ROUTES.PORTAL.LANDING)}
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
        </section>

        <section className="coding-surface rounded-2xl shadow-sm p-5">
          <header className="flex items-start justify-between gap-3 mb-3">
            <div>
              <h2 className="text-sm font-semibold coding-text-strong">To-do</h2>
              <p className="text-xs coding-text-soft">Assignments from your managers across applications.</p>
            </div>
          </header>
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
                      className="portal-task-link"
                      type="button"
                      onClick={() => navigate(todo.path || ROUTES.PORTAL.LANDING)}
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
        </section>
      </div>
    </PortalPageLayout>
  );
};

export default PortalPage;
