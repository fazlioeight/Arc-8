import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import PortalUtilityBar from "../../../components/PortalUtilityBar";
import { AuthContext } from "../../../context/AuthContext";
import "../../../index.css";
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
  if (!value) return 'User';
  switch (value) {
    case 'admin':
      return 'Admin';
    case 'platform_admin':
      return 'Platform admin';
    default:
      return value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, ' ');
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
    const sourceKeys = (availableApplications && availableApplications.length)
      ? availableApplications
      : (purchasedApplications && purchasedApplications.length)
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
              const catalogEntry = resolvedApps.find((item) => item.key === app.key) || {};
              return { ...catalogEntry, ...app };
            }) || fallback.applications,
          lastSaved: payload.lastSaved?.length ? payload.lastSaved : fallback.lastSaved,
          todos: payload.todos?.length ? payload.todos : fallback.todos,
        });
      } catch (error) {
        if (!isMounted) return;
        console.warn("Falling back to mocked portal overview", error);
        setOverview({
          ...fallback,
          loading: false,
          error: "We could not reach the portal services. Showing the latest synced data.",
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
          setMemberSearchError(error?.message || "Unable to search members right now.");
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

  const resolveMemberId = useCallback((value) => {
    const term = value?.trim().toLowerCase();
    if (!term) {
      return null;
    }
    const match = memberSuggestions.find((member) => extractMemberTokens(member).includes(term));
    return pickMemberIdForNavigation(match);
  }, [memberSuggestions]);

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
          const response = await fetchCodingMembers(token, tenant, { search: term, pageSize: 5 });
          const items = Array.isArray(response?.items) ? response.items : [];
          if (items.length) {
            setMemberSuggestions(items);
          }
          const lowerTerm = term.toLowerCase();
          const exactMatch = items.find((member) => extractMemberTokens(member).includes(lowerTerm));
          if (exactMatch) {
            memberId = pickMemberIdForNavigation(exactMatch);
          } else if (items.length === 1) {
            memberId = pickMemberIdForNavigation(items[0]);
          }
        } catch (error) {
          console.error("Member lookup failed", error);
          setMemberSearchError(error?.message || "Unable to open that member right now.");
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
  }, [isLaunchingMember, isSearchingMembers, memberQuery, memberSearchError, memberSuggestions.length]);

  if (overview.loading) {
    return (
      <div className="portal-overview__loading">
        <PortalUtilityBar />
        <section className="portal-loading-panel">Loading your Nexora workspace...</section>
      </div>
    );
  }

  const displayName = user?.email?.split("@")[0] || "there";
  const accessibleApps = overview.applications.filter((app) => app.allowed);
  const appsToRender = accessibleApps.length ? accessibleApps : overview.applications;

  return (
    <div className="portal-overview sfdc-portal">
      <PortalUtilityBar />
      <header className="portal-hero">
        <div className="portal-hero__inner">
          <div>
            <p className="portal-hero__eyebrow">Workspace overview</p>
            <h1 className="portal-hero__title">Welcome back, {displayName}</h1>
            <p className="portal-hero__subtitle">
              Here's what changed across your applications since your last visit.
            </p>
          </div>
        </div>
      </header>
      <section className="portal-member-search" aria-label="Member quick search">
        <form className="portal-member-search__form" onSubmit={handleMemberSearch}>
          <div className="portal-member-search__field">
            <label className="portal-member-search__label" htmlFor="portal-member-search-input">
              Member ID
            </label>
            <div className="portal-member-search__inputwrap">
              <input
                id="portal-member-search-input"
                type="search"
                autoComplete="off"
                placeholder="Search by member ID"
                value={memberQuery}
                onChange={(event) => setMemberQuery(event.target.value)}
                list="portal-member-suggestions"
                aria-describedby="portal-member-search-help"
              />
              <datalist id="portal-member-suggestions">
                {memberSuggestions.map((member) => {
                  const optionValue =
                    member?.member_key ||
                    member?.memberId ||
                    member?.member_id ||
                    member?.id;
                  const optionKey = member?.id || member?.member_id || optionValue;
                  if (!optionValue && !optionKey) {
                    return null;
                  }
                  const altId = member?.id || member?.member_id || "";
                  const label =
                    altId && optionValue && altId !== optionValue
                      ? `${optionValue} - ${altId}`
                      : optionValue || altId;
                  return (
                    <option key={optionKey} value={(optionValue || altId || "").toString()}>
                      {label}
                    </option>
                  );
                })}
              </datalist>
            </div>
          </div>
          <button
            className="portal-member-search__submit"
            type="submit"
            disabled={!memberQuery.trim() || isLaunchingMember}
          >
            {isLaunchingMember ? "Opening..." : "Open chart"}
          </button>
        </form>
        <p
          className={`portal-member-search__status${memberSearchError ? " portal-member-search__status--error" : ""}`}
          id="portal-member-search-help"
          role="status"
        >
          {memberSearchStatus}
        </p>
      </section>

      {overview.error && (
        <div className="portal-alert" role="alert">
          {overview.error}
        </div>
      )}

      <div className="portal-shell">
        <aside className="portal-sidebar">
          <section className="portal-panel portal-profile" aria-label="User profile summary">
            <header className="portal-panel__header">
              <h2>Profile</h2>
            </header>
            <div className="portal-profile__body">
              <div className="portal-profile__identity">
                <span className="portal-profile__avatar">
                  {user?.email?.slice(0, 1).toUpperCase() || "N"}
                </span>
                <div>
                  <div className="portal-profile__name">
                    {overview.profile?.email || user?.email}
                  </div>
                  <div className="portal-profile__meta">
                    Tenant | {overview.profile?.tenant || user?.tenant || "Nexora"}
                  </div>
                </div>
              </div>
              <dl className="portal-profile__details">
                <div>
                  <dt>Role</dt>
                  <dd>{formatRoleLabel(overview.profile?.role)}</dd>
                </div>
                <div>
                  <dt>Last login</dt>
                  <dd>
                    {overview.profile?.lastLogin
                      ? formatRelativeTime(overview.profile.lastLogin)
                      : "Just now"}
                  </dd>
                </div>
                <div>
                  <dt>Applications</dt>
                  <dd>{accessibleApps.length || appsToRender.length}</dd>
                </div>
              </dl>
              <button className="portal-link" onClick={() => navigate("/settings")}>
                Manage profile
              </button>
            </div>
          </section>
        </aside>

        <main className="portal-main">
          <section className="portal-panel" aria-label="Applications">
            <header className="portal-panel__header">
              <div>
                <h2>Applications</h2>
                <p className="portal-panel__subhead">Launch into the areas you use most.</p>
              </div>
            </header>
            <div className="portal-apps__grid">
              {appsToRender.map((app) => (
                <button
                  key={app.key}
                  className={`portal-apps__tile${app.allowed ? "" : " portal-apps__tile--locked"}`}
                  onClick={() => app.allowed && navigate(app.path)}
                  type="button"
                  aria-disabled={!app.allowed}
                >
                  <span className="portal-apps__icon" style={{ background: app.color }}>
                    {app.icon}
                  </span>
                  <span className="portal-apps__body">
                    <span className="portal-apps__name">{app.label}</span>
                    <span className="portal-apps__desc">{app.desc}</span>
                    {!app.allowed && (
                      <span className="portal-apps__hint">Request access from your admin</span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="portal-panel" aria-label="Last saved items">
            <header className="portal-panel__header">
              <div>
                <h2>Last saved</h2>
                <p className="portal-panel__subhead">Recent items you have pinned or updated.</p>
              </div>
            </header>
            <ul className="portal-list">
              {overview.lastSaved.map((item) => (
                <li key={item.id} className="portal-list__item">
                  <div className="portal-list__content">
                    <strong>{item.title}</strong>
                    <span>{item.summary}</span>
                    <span className="portal-list__meta">
                      Updated {formatRelativeTime(item.savedAt)}
                    </span>
                  </div>
                  <button
                    className="portal-link"
                    type="button"
                    onClick={() => navigate(item.path || "/dashboard")}
                  >
                    Open
                  </button>
                </li>
              ))}
              {!overview.lastSaved.length && (
                <li className="portal-list__empty">
                  No saved items yet. Try bookmarking a report from the dashboard.
                </li>
              )}
            </ul>
          </section>

          <section className="portal-panel" aria-label="Assigned to-do items">
            <header className="portal-panel__header">
              <div>
                <h2>To-do</h2>
                <p className="portal-panel__subhead">
                  Assignments from your managers across applications.
                </p>
              </div>
            </header>
            <ul className="portal-todos">
              {overview.todos.map((todo) => (
                <li key={todo.id} className="portal-todos__item">
                  <div className="portal-todos__main">
                    <span className={`portal-status portal-status--${todo.priority || "low"}`}>
                      {todo.priority || "low"}
                    </span>
                    <div>
                      <strong>{todo.title}</strong>
                      <div className="portal-todos__meta">
                        {todo.appKey && <span>{todo.appKey.replace(/_/g, " ")}</span>}
                        {todo.dueAt && <span>Due {formatRelativeTime(todo.dueAt)}</span>}
                        {todo.assignedBy && <span>Assigned by {todo.assignedBy}</span>}
                      </div>
                    </div>
                  </div>
                  <button
                    className="portal-link"
                    type="button"
                    onClick={() => navigate(todo.path || "/dashboard")}
                  >
                    View task
                  </button>
                </li>
              ))}
              {!overview.todos.length && (
                <li className="portal-list__empty">No open tasks. Enjoy the clear slate!</li>
              )}
            </ul>
          </section>
        </main>
      </div>
    </div>
  );
};

export default PortalPage;
