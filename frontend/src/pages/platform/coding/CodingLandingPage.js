import React, { useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import PortalUtilityBar from "../../../components/PortalUtilityBar";
import { AuthContext } from "../../../context/AuthContext";
import { fetchCodingMembers } from "../../../services/codingService";
import CodingPortalHeader from "./CodingPortalHeader";
import "../coding/member/memberWorkspace.css";
import { createMemberSummary } from "../../../viewModels/common";

const STATUS_BADGES = {
  closed: "bg-slate-100 text-slate-700 ring-1 ring-slate-200 dark:bg-slate-700/40 dark:text-slate-100 dark:ring-slate-600/50",
  in_review: "bg-amber-100 text-amber-800 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-100 dark:ring-amber-500/30",
  default: "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-100 dark:ring-emerald-500/30",
};

const CodingLandingPage = () => {
  const navigate = useNavigate();
  const { user, token, tenant, isAuthenticated } = useContext(AuthContext) || {};

  const [worklist, setWorklist] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const canQuery = Boolean(token && tenant);
  const userEmail = user?.email?.toLowerCase();

  const loadWorklist = async () => {
    if (!canQuery) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetchCodingMembers(token, tenant, {
        status: ["active", "in_review"],
        pageSize: 25,
      });
      const items = (response.items || []).map((item) => createMemberSummary(item)).filter(Boolean);
      setWorklist(items);
    } catch (err) {
      setError(err.message || "Unable to load worklist");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated || !canQuery) return;
    void loadWorklist();
  }, [isAuthenticated, canQuery]);

  const assignedToMe = useMemo(() => {
    if (!userEmail) return worklist;
    const normalizedEmail = userEmail.toLowerCase();
    const matched = worklist.filter((member) => {
      const emails = Array.isArray(member.assignedCoderEmails) ? member.assignedCoderEmails : [];
      return emails.some((email) => typeof email === "string" && email.toLowerCase() === normalizedEmail);
    });
    return matched.length > 0 ? matched : worklist;
  }, [worklist, userEmail]);

  const displayedMembers = assignedToMe.slice(0, 12);

  const renderBadge = (status) => {
    const tone = STATUS_BADGES[status] || STATUS_BADGES.default;
    return <span className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${tone}`}>{status || "unknown"}</span>;
  };

  return (
    <div className="coding-member-workspace portal-theme min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <PortalUtilityBar />
      <CodingPortalHeader
        title="Coding worklists"
        subtitle={
          user?.email
            ? `Welcome back, ${user.email}. Here is your current queue.`
            : "Sign in to manage your coding assignments."
        }
      />

      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Your worklist</h2>
              <div className="text-sm text-slate-600 dark:text-slate-300">
                {user?.email ? "Assignments routed to your queue." : "Showing latest coding members."}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-slate-500 dark:hover:bg-slate-700"
                onClick={() => navigate("/coding/members")}
              >
                Open members page
              </button>
              <button
                className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-slate-500 dark:hover:bg-slate-700"
                disabled={loading || !canQuery}
                onClick={() => void loadWorklist()}
              >
                {loading ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>

          {!isAuthenticated && (
            <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
              You must be logged in to view your personalized worklist.
            </div>
          )}
          {error && (
            <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100">
              {error}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                    Member
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                    Member Key
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                    Line of Business
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                    PCP
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {loading && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-300">
                      Loading worklist...
                    </td>
                  </tr>
                )}
                {!loading && displayedMembers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-300">
                      No members assigned yet.
                    </td>
                  </tr>
                )}
                {displayedMembers.map((member) => {
                  const name = member.fullName || [member.firstName, member.lastName].filter(Boolean).join(" ") || "-";
                  return (
                    <tr key={member.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                      <td className="px-4 py-3 text-slate-900 dark:text-slate-100">{name}</td>
                      <td className="px-4 py-3 text-slate-900 dark:text-slate-100">{member.memberKey || "-"}</td>
                      <td className="px-4 py-3">{renderBadge(member.status)}</td>
                      <td className="px-4 py-3 text-slate-900 dark:text-slate-100">{member.lineOfBusiness || "-"}</td>
                      <td className="px-4 py-3 text-slate-900 dark:text-slate-100">{member.pcpName || "-"}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-slate-500 dark:hover:bg-slate-700"
                          onClick={() => navigate(`/coding/member/${member.id}`)}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {assignedToMe.length > displayedMembers.length && (
            <div className="mt-3 text-center">
              <button
                className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-slate-500 dark:hover:bg-slate-700"
                onClick={() => navigate("/coding/members")}
              >
                View full queue
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default CodingLandingPage;
