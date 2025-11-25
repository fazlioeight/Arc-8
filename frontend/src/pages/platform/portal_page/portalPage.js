import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import PortalUtilityBar from "../../../components/PortalUtilityBar";
import { AuthContext } from "../../../context/AuthContext";
import { SectionHeader } from "../../../components/ehr/Primitives";
import "../../../index.css";
import "../coding/member/memberWorkspace.css";
import "./portalPage.sfdc.css";
import { fetchCodingMembers } from "../../../services/codingService";

const buildFallbackOverview = (apps, user) => {
  const accessible = apps.filter((app) => app.allowed);
  const source = accessible.length ? accessible : apps;
  const now = Date.now();

  const lastSaved = source.slice(0, 4).map((app, idx) => ({
    id: `saved-${idx}`,
    title: `${app.label} snapshot ${idx % 2 ? "(draft)" : "(published)"}`,
    appKey: app.key,
    summary:
      app.key === "coding"
        ? "Queued chart review saved by you"
        : app.key === "ride_booking"
        ? "Ride manifest changes captured"
        : app.key === "portal"
        ? "Personal overview preferences cached"
        : "Latest workspace preferences stored",
    savedAt: new Date(now - (idx + 1) * 45 * 60 * 1000).toISOString(),
    path: app.path,
  }));

  const todos = source.slice(0, 5).map((app, idx) => ({
    id: `todo-${idx}`,
    title:
      app.key === "coding"
        ? "Complete chart validation for high-risk cohort"
        : app.key === "dashboard"
        ? "Review metrics variance for Q3 close"
        : app.key === "ride_booking"
        ? "Confirm transport coverage for dialysis members"
        : app.key === "portal"
        ? "Publish weekly updates on your overview"
        : "Follow up on configuration updates",
    appKey: app.key,
    assignedBy: "Manager",
    dueAt: new Date(now + (idx + 1) * 24 * 60 * 60 * 1000).toISOString(),
    priority: idx === 0 ? "high" : idx === 1 ? "medium" : "low",
    path: app.path,
  }));

  return {
    applications: apps,
    profile: {
      email: user?.email || "guest@nexora.ai",
      tenant: user?.tenant || "Nexora Tenant",
      role: user?.role || "user",
      lastLogin: new Date(now - 6 * 60 * 60 * 1000).toISOString(),
    },
    lastSaved,
    todos,
  };
};

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

const toLowerString = (value) => {
  if (value === undefined || value === null) {
    return null;
  }
  return String(value).toLowerCase();
};

const extractMemberTokens = (member) => {
  if (!member) {
    return [];
  }
  return [
    toLowerString(member?.id),
    toLowerString(member?.member_id),
    toLowerString(member?.memberId),
    toLowerString(member?.member_key),
  ].filter(Boolean);
};

const pickMemberIdForNavigation = (member) => {
  if (!member) {
    return null;
  }
  return member?.id || member?.member_id || member?.memberId || null;
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
  const [overview, setOverview] = useState({
    loading: true,
    error: null,
    profile: null,
    applications: [],
    lastSaved: [],
    todos: [],
  });
  const [memberQuery, setMemberQuery] = useState("");
  const [memberSuggestions, setMemberSuggestions] = useState([]);
  const [isSearchingMembers, setIsSearchingMembers] = useState(false);
  const [isLaunchingMember, setIsLaunchingMember] = useState(false);
  const [memberSearchError, setMemberSearchError] = useState(null);

  const appCatalog = useMemo(
    () => [
      {
        key: "portal",
        label: "Portal Overview",
        desc: "Daily digest and workspace snapshot",
        path: "/portal_page/portalPage",
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
        path: "/RideBooking",
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

  const filteredCatalog = useMemo(() => {
    const sourceKeys =
      availableApplications && availableApplications.length
        ? availableApplications
        : purchasedApplications && purchasedApplications.length
        ? purchasedApplications
        : appCatalog.map((app) => app.key);
    const enabledKeys = new Set(sourceKeys);
    return appCatalog.filter((app) => enabledKeys.has(app.key));
  }, [appCatalog, availableApplications, purchasedApplications]);

  const hasAccessInfo = useMemo(
    () => Object.keys(accessMap || {}).length > 0,
    [accessMap]
  );

  const resolvedApps = useMemo(() => {
    return filteredCatalog.map((app) => {
      const level = accessMap?.[app.key];
      const allowed = hasAccessInfo
        ? app.key === "portal"
          ? true
          : app.requiredLevel === "admin"
          ? level === "admin"
          : Boolean(level)
        : true;
      return { ...app, level, allowed };
    });
  }, [filteredCatalog, accessMap, hasAccessInfo]);

  useEffect(() => {
    let isMounted = true;

    const loadOverview = async () => {
      const fallback = buildFallbackOverview(resolvedApps, user);
      try {
        const baseUrl = process.env.REACT_APP_API_URL;
        if (!baseUrl) {
          setOverview({ ...fallback, loading: false, error: null });
          return;
        }

        const response = await axios.get(`${baseUrl}/api/portal/overview`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("authToken")}`,
          },
        });

        if (!isMounted) return;

        const payload = response?.data || {};
        setOverview({
          loading: false,
          error: null,
          profile: payload.profile || fallback.profile,
          applications:
            (payload.applications || []).map((app) => {
              const catalogEntry =
                resolvedApps.find((item) => item.key === app.key) || {};
              return { ...catalogEntry, ...app };
            }) || fallback.applications,
          lastSaved: payload.lastSaved?.length
            ? payload.lastSaved
            : fallback.lastSaved,
          todos: payload.todos?.length ? payload.todos : fallback.todos,
        });
      } catch (error) {
        if (!isMounted) return;
        console.warn("Falling back to mocked portal overview", error);
        setOverview({
          ...fallback,
          loading: false,
          error:
            "We could not reach the portal services. Showing the latest synced data.",
        });
      }
    };

    loadOverview();

    return () => {
      isMounted = false;
    };
  }, [resolvedApps, user]);

  useEffect(() => {
    const term = memberQuery.trim();
    if (term.length < 2) {
      setMemberSuggestions([]);
      setMemberSearchError(null);
      setIsSearchingMembers(false);
      return undefined;
    }

    let isActive = true;
    setIsSearchingMembers(true);
    setMemberSearchError(null);

    const timeoutId = window.setTimeout(() => {
      fetchCodingMembers(token, tenant, { search: term, pageSize: 7 })
        .then((response) => {
          if (!isActive) {
            return;
          }
          const items = Array.isArray(response?.items) ? response.items : [];
          setMemberSuggestions(items);
        })
        .catch((error) => {
          if (!isActive) {
            return;
          }
          console.error("Member search failed", error);
          setMemberSuggestions([]);
          setMemberSearchError(
            error?.message || "Unable to search members right now."
          );
        })
        .finally(() => {
          if (!isActive) {
            return;
          }
          setIsSearchingMembers(false);
        });
    }, 250);

    return () => {
      isActive = false;
      window.clearTimeout(timeoutId);
      setIsSearchingMembers(false);
    };
  }, [memberQuery, token, tenant]);

  const resolveMemberId = useCallback(
    (value) => {
      const term = value?.trim().toLowerCase();
      if (!term) {
        return null;
      }
      const match = memberSuggestions.find((member) =>
        extractMemberTokens(member).includes(term)
      );
      return pickMemberIdForNavigation(match);
    },
    [memberSuggestions]
  );

  const handleMemberSearch = useCallback(
    async (event) => {
      event.preventDefault();
      const term = memberQuery.trim();
      if (!term) {
        return;
      }

      setMemberSearchError(null);
      setIsLaunchingMember(true);

      let memberId = resolveMemberId(term);

      if (!memberId) {
        try {
          const response = await fetchCodingMembers(token, tenant, {
            search: term,
            pageSize: 5,
          });
          const items = Array.isArray(response?.items) ? response.items : [];
          if (items.length) {
            setMemberSuggestions(items);
          }
          const lowerTerm = term.toLowerCase();
          const exactMatch = items.find((member) =>
            extractMemberTokens(member).includes(lowerTerm)
          );
          if (exactMatch) {
            memberId = pickMemberIdForNavigation(exactMatch);
          } else if (items.length === 1) {
            memberId = pickMemberIdForNavigation(items[0]);
          }
        } catch (error) {
          console.error("Member lookup failed", error);
          setMemberSearchError(
            error?.message || "Unable to open that member right now."
          );
        }
      }

      if (memberId) {
        setIsLaunchingMember(false);
        navigate(`/coding/member/${memberId}/chart`);
        return;
      }

      setMemberSearchError("Member not found. Try another ID.");
      setIsLaunchingMember(false);
    },
    [memberQuery, navigate, resolveMemberId, tenant, token]
  );

  const memberSearchStatus = useMemo(() => {
    if (memberSearchError) {
      return memberSearchError;
    }
    if (isLaunchingMember) {
      return "Opening member chart...";
    }
    if (isSearchingMembers) {
      return "Searching members...";
    }
    if (!memberQuery.trim()) {
      return "Enter at least two characters to search by member ID.";
    }
    if (memberSuggestions.length) {
      return "Press Enter to open the highlighted member chart.";
    }
    return "No suggestions yet.";
  }, [
    isLaunchingMember,
    isSearchingMembers,
    memberQuery,
    memberSearchError,
    memberSuggestions.length,
  ]);

  if (overview.loading) {
    return (
      <div className="coding-member-workspace portal-theme min-h-screen">
        <PortalUtilityBar />
        <section className="mx-auto flex max-w-3xl items-center justify-center px-4 py-24">
          <div className="coding-surface w-full rounded-2xl p-8 text-center shadow-sm">
            <p className="text-base font-medium coding-text-strong">
              Loading your Nexora workspace...
            </p>
          </div>
        </section>
      </div>
    );
  }

  const displayName = user?.email?.split("@")[0] || "there";
  const accessibleApps = overview.applications.filter((app) => app.allowed);
  const appsToRender = accessibleApps.length
    ? accessibleApps
    : overview.applications;
  const cardClass = "rounded-xl p-4 portal-alert-shell";

  return (
    <div className="coding-member-workspace portal-theme min-h-screen">
      <PortalUtilityBar />

      <header className="coding-member-header">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-5 sm:flex-row sm:items-center sm:justify-between">
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
                {accessibleApps.length || appsToRender.length}
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
      </header>

      <section className="coding-member-toolbar">
        <form
          className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-end"
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
                onChange={(event) => setMemberQuery(event.target.value)}
                list="portal-member-suggestions"
                aria-describedby="portal-member-search-help"
                className="coding-input w-full rounded-xl px-4 py-3 text-sm"
              />
              <datalist id="portal-member-suggestions">
                {memberSuggestions.map((member) => {
                  const optionValue =
                    member?.member_key ||
                    member?.memberId ||
                    member?.member_id ||
                    member?.id;
                  const optionKey =
                    member?.id || member?.member_id || optionValue;
                  if (!optionValue && !optionKey) {
                    return null;
                  }
                  const altId = member?.id || member?.member_id || "";
                  const label =
                    altId && optionValue && altId !== optionValue
                      ? `${optionValue} - ${altId}`
                      : optionValue || altId;
                  return (
                    <option
                      key={optionKey}
                      value={(optionValue || altId || "").toString()}
                    >
                      {label}
                    </option>
                  );
                })}
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
          className={`mx-auto max-w-6xl px-4 pb-5 text-sm ${
            memberSearchError
              ? "text-red-600"
              : "coding-text-muted"
          }`}
          id="portal-member-search-help"
          role="status"
        >
          {memberSearchStatus}
        </p>
      </section>

      {overview.error && (
        <div className="mx-auto max-w-6xl px-4 pt-4">
          <div className="coding-surface-subtle flex items-start gap-3 rounded-xl px-4 py-3 text-amber-900 shadow-sm">
            <span className="text-sm font-semibold coding-text-strong">Heads up</span>
            <span className="text-sm coding-text-soft">{overview.error}</span>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 lg:py-10">
        {/* <section className={cardClass} aria-label="User profile summary">
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
                    Tenant {overview.profile?.tenant || user?.tenant || "Nexora"} ·{" "}
                    {formatRoleLabel(overview.profile?.role)} ·{" "}
                    {overview.profile?.lastLogin
                      ? `Last login ${formatRelativeTime(overview.profile.lastLogin)}`
                      : "Last login just now"}{" "}
                    · {accessibleApps.length || appsToRender.length} applications
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
        </section> */}

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
      </div>
    </div>
  );
};

export default PortalPage;
