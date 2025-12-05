import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import PortalPageLayout from "../../../components/PortalPageLayout";
import PortalPageHeader from "../../../components/PortalPageHeader";
import PortalCard from "../../../components/PortalCard";
import PortalStat from "../../../components/PortalStat";
import { AuthContext } from "../../../context/AuthContext";
import { useCommandPalette } from "../../../context/CommandPaletteContext";
import { fetchCodingMembers, fetchPrioritizedMembers } from "../../../services/codingService";
import "../coding/member/memberWorkspace.css";
import { CODING_NAV_ITEMS } from "./codingNavItems";

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "in_review", label: "In Review" },
  { value: "closed", label: "Closed" },
];

const LOB_OPTIONS = ["Commercial", "Medicare Advantage", "DSNP", "Exchange"];

const CODING_MEMBERS_COMMAND_SCOPE = "coding-members-commands";
const statusToneMap = {
  closed: "bg-slate-100 text-slate-700 ring-1 ring-slate-200",
  in_review: "bg-amber-100 text-amber-800 ring-1 ring-amber-200",
  active: "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200",
};

const CodingMembersPage = () => {
  const { registerCommands } = useCommandPalette();
  const navigate = useNavigate();
  const location = useLocation();
  const { token, tenant, isAuthenticated, recordAuditEvent } = useContext(AuthContext) || {};

  const [members, setMembers] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [priorityQueue, setPriorityQueue] = useState([]);
  const [priorityLoading, setPriorityLoading] = useState(false);

  const [searchValue, setSearchValue] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [lobFilter, setLobFilter] = useState("");

  const canQuery = useMemo(() => token && tenant, [token, tenant]);

  const loadSampleMembers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchCodingMembers("sample-command", tenant || "prominencehealth", {
        search: searchValue,
        status: statusFilter ? [statusFilter] : [],
        lob: lobFilter ? [lobFilter] : [],
        page: 1,
      });
      setMembers(response.items || []);
      setTotal(response.total || 0);
      recordAuditEvent?.("coding.load_sample_members");
    } catch (err) {
      setError(err.message || "Unable to load sample members");
    } finally {
      setLoading(false);
    }
  }, [tenant, searchValue, statusFilter, lobFilter, recordAuditEvent]);

  const loadPrioritizedMembers = useCallback(async () => {
    if (!canQuery) return;
    try {
      setPriorityLoading(true);
      const response = await fetchPrioritizedMembers(token, tenant, { limit: 10 });
      setPriorityQueue(response?.items || []);
    } catch (err) {
      /* ignore priority fetch errors */
    } finally {
      setPriorityLoading(false);
    }
  }, [canQuery, tenant, token]);

  const loadMembers = useCallback(
    async (overrides = {}) => {
      if (!canQuery) return;
      setLoading(true);
      setError(null);
      try {
        const response = await fetchCodingMembers(token, tenant, {
          search: overrides.search ?? searchValue,
          status: overrides.status ?? (statusFilter ? [statusFilter] : []),
          lob: overrides.lob ?? (lobFilter ? [lobFilter] : []),
          page: 1,
        });
        setMembers(response.items || []);
        setTotal(response.total || 0);
      } catch (err) {
        setError(err.message || "Unable to load members");
      } finally {
        setLoading(false);
      }
    },
    [canQuery, lobFilter, searchValue, statusFilter, tenant, token]
  );

  useEffect(() => {
    if (!isAuthenticated || !canQuery) return;
    void loadMembers();
  }, [isAuthenticated, canQuery, loadMembers]);

  useEffect(() => {
    if (!isAuthenticated || !canQuery) return;
    void loadPrioritizedMembers();
  }, [isAuthenticated, canQuery, loadPrioritizedMembers]);

  useEffect(() => {
    const unregister = registerCommands(
      [
        {
          id: "coding-members-load-sample",
          label: "Load sample coding members",
          category: "Coding",
          action: () => {
            void loadSampleMembers();
          },
        },
        {
          id: "coding-members-clear-filters",
          label: "Clear member filters",
          category: "Coding",
          action: () => {
            setStatusFilter("active");
            setLobFilter("");
            setSearchValue("");
          },
        },
      ],
      { id: CODING_MEMBERS_COMMAND_SCOPE }
    );
    return unregister;
  }, [registerCommands, loadSampleMembers]);

  const handleSubmit = (event) => {
    event.preventDefault();
    void loadMembers({ search: searchValue });
  };

  const handleOpenProvider = (member) => {
    const providerKey = member.pcp_npi || member.pcp_name;
    if (!providerKey) return;
    const search = `?fromMemberId=${encodeURIComponent(member.id)}${member.pcp_name ? `&providerName=${encodeURIComponent(member.pcp_name)}` : ""}`;
    navigate(`/coding/providers/${encodeURIComponent(providerKey)}${search}`, {
      state: {
        from: `${location.pathname}${location.search}`,
        breadcrumb: member.pcp_name || member.pcp_npi,
        fromMemberId: member.id,
        providerName: member.pcp_name,
        providerNpi: member.pcp_npi,
      },
    });
  };

  const layoutProps = useMemo(
    () => ({
      backgroundClassName:
        "coding-member-workspace portal-theme bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100",
      maxWidthClassName: "max-w-6xl",
      paddingClassName: "px-4",
      navItems: CODING_NAV_ITEMS,
      currentNav: "members",
      utilityBar: true,
    }),
    []
  );

  const headerContent = (
    <PortalPageHeader
      eyebrow="Coding"
      title="Coding member worklists"
      subtitle="Search, filter, and open members assigned to your coding teams."
      actions={
        <div className="flex flex-wrap items-center gap-3">
          <PortalStat label="Members" value={total} meta="Matching filters" tone="info" />
          <PortalStat label="Priority" value={priorityQueue.length} meta="Top 10" tone="warning" />
          <PortalStat label="Status" value={statusFilter || "All"} meta="Filter" tone="success" />
        </div>
      }
    />
  );

  return (
    <PortalPageLayout {...layoutProps} headerContent={headerContent}>
      {!isAuthenticated ? (
        <PortalCard tone="warning" title="Authentication required" subtitle="You must be logged in to view coding members." />
      ) : null}

      <PortalCard
        title="Filters"
        subtitle="Search, status, and LOB filters for coding members."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button className="portal-ghost-button" onClick={() => void loadSampleMembers()} disabled={loading}>
              Load sandbox sample
            </button>
            <button
              className="portal-ghost-button"
              onClick={() => {
                setStatusFilter("active");
                setLobFilter("");
                setSearchValue("");
                void loadMembers({ search: "", status: [], lob: [] });
              }}
            >
              Clear filters
            </button>
          </div>
        }
      >
        <form onSubmit={handleSubmit} className="portal-section-grid">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300" htmlFor="coding-member-search">
              Member search
            </label>
            <input
              id="coding-member-search"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-inner outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-sky-400 dark:focus:ring-sky-500/40"
              placeholder="Name, member key, or PCP"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Status</label>
            <select
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-sky-400 dark:focus:ring-sky-500/40"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Line of business</label>
            <select
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-sky-400 dark:focus:ring-sky-500/40"
              value={lobFilter}
              onChange={(e) => setLobFilter(e.target.value)}
            >
              <option value="">All LOBs</option>
              {LOB_OPTIONS.map((lob) => (
                <option key={lob} value={lob}>
                  {lob}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              className="portal-ghost-button"
              disabled={loading}
            >
              {loading ? "Searching..." : "Search"}
            </button>
          </div>
        </form>
        {error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 shadow-sm dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100">
            {error}
          </div>
        ) : null}
      </PortalCard>

      <PortalCard title="Top priority members" subtitle="Members most likely to impact RAF if actioned soon." compact>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800" aria-label="Top priority members">
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Member</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Tier</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Score</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Next action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {priorityLoading && (
                <tr>
                  <td colSpan={4} className="py-3 text-center text-slate-500 dark:text-slate-300">Loading priorities...</td>
                </tr>
              )}
              {!priorityLoading && priorityQueue.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-3 text-center text-slate-500 dark:text-slate-300">No prioritized members yet.</td>
                </tr>
              )}
              {priorityQueue.map((item) => (
                <tr
                  key={item.member_id}
                  className="hover:bg-slate-50 dark:hover:bg-slate-800/60"
                  onClick={() =>
                    navigate(`/coding/member/${item.member_id}`, {
                      state: {
                        from: `${location.pathname}${location.search}`,
                        breadcrumb: item.member_key,
                      },
                    })
                  }
                  style={{ cursor: "pointer" }}
                >
                  <td className="px-3 py-2 text-slate-900 dark:text-slate-100">{item.member_key}</td>
                  <td className="px-3 py-2 text-slate-900 dark:text-slate-100">{item.priority_tier}</td>
                  <td className="px-3 py-2 text-slate-900 dark:text-slate-100">{item.priority_score.toFixed ? item.priority_score.toFixed(1) : item.priority_score}</td>
                  <td className="px-3 py-2 text-slate-900 dark:text-slate-100">{item.next_action || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PortalCard>

      <PortalCard
        title="Member worklist"
        subtitle="Search, filter, and open members assigned to your coding teams."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <span className="portal-pill portal-pill--ghost">{total} member(s) found</span>
            <button className="portal-ghost-button" onClick={() => void loadMembers()} disabled={loading}>
              Refresh
            </button>
          </div>
        }
      >
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800" aria-label="Coding members">
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Member</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Member Key</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Status</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Line of Business</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Provider</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {!loading && members.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-slate-500 dark:text-slate-300">
                    <div className="space-y-2">
                      <p>No members match your filters.</p>
                      <button className="portal-ghost-button" onClick={loadSampleMembers}>
                        Load sandbox sample members
                      </button>
                    </div>
                  </td>
                </tr>
              )}
              {members.map((member) => (
                <tr key={member.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                  <td className="px-3 py-2 text-slate-900 dark:text-slate-100">{[member.first_name, member.last_name].filter(Boolean).join(" ") || "-"}</td>
                  <td className="px-3 py-2 text-slate-900 dark:text-slate-100">{member.member_key}</td>
                  <td className="px-3 py-2 text-slate-900 dark:text-slate-100">
                    <span className={`inline-flex items-center rounded-full px-2 py-1 text-[11px] font-semibold uppercase tracking-wide ${statusToneMap[member.status] || "bg-slate-100 text-slate-700 ring-1 ring-slate-200"}`}>
                      {member.status || "unknown"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-900 dark:text-slate-100">{member.line_of_business || "-"}</td>
                  <td className="px-3 py-2 text-slate-900 dark:text-slate-100">
                    {member.pcp_name || member.pcp_npi ? (
                      <div className="flex flex-col gap-0.5">
                        <button
                          className="text-left text-sky-600 underline-offset-2 hover:underline dark:text-sky-300"
                          type="button"
                          onClick={() => handleOpenProvider(member)}
                        >
                          {member.pcp_name || member.pcp_npi}
                        </button>
                        {member.pcp_npi && member.pcp_name ? (
                          <span className="text-xs text-slate-500 dark:text-slate-300">NPI {member.pcp_npi}</span>
                        ) : null}
                      </div>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      className="portal-ghost-button"
                      onClick={() =>
                        navigate(`/coding/member/${member.id}`, {
                          state: {
                            from: `${location.pathname}${location.search}`,
                            breadcrumb: [member.first_name, member.last_name].filter(Boolean).join(" ") || member.member_key,
                          },
                        })
                      }
                    >
                      Open
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PortalCard>
    </PortalPageLayout>
  );
};

export default CodingMembersPage;
