import React, { useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import PortalPageLayout from "../../../components/PortalPageLayout";
import PortalPageHeader from "../../../components/PortalPageHeader";
import PortalCard from "../../../components/PortalCard";
import PortalStat from "../../../components/PortalStat";
import { AuthContext } from "../../../context/AuthContext";
import { fetchCodingMembers } from "../../../services/codingService";
import { createMemberSummary } from "../../../viewModels/common";
import "../coding/member/memberWorkspace.css";
import { CODING_NAV_ITEMS } from "./codingNavItems";

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
    return (
      <span className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${tone}`}>
        {status || "unknown"}
      </span>
    );
  };

  const totalCount = assignedToMe.length;
  const inReviewCount = assignedToMe.filter((member) => member.status === "in_review").length;
  const closedCount = assignedToMe.filter((member) => member.status === "closed").length;

  const layoutProps = useMemo(
    () => ({
      backgroundClassName:
        "",
      maxWidthClassName: "max-w-6xl",
      paddingClassName: "px-4",
      navItems: CODING_NAV_ITEMS,
      currentNav: "overview",
      utilityBar: true,
    }),
    []
  );

  const headerContent = (
    <PortalPageHeader
      eyebrow="Coding worklists"
      title="Coding worklists"
      subtitle={
        user?.email
          ? `Welcome back, ${user.email}. Here is your current queue.`
          : "Sign in to manage your coding assignments."
      }
      actions={
        <div className="flex flex-wrap items-center gap-3">
          <PortalStat label="Assignments" value={totalCount} meta="Visible" tone="info" />
          <PortalStat label="In review" value={inReviewCount} meta="Active QA" tone="warning" />
          <PortalStat label="Closed" value={closedCount} meta="Completed" tone="success" />
        </div>
      }
    />
  );

  return (
    <PortalPageLayout {...layoutProps} headerContent={headerContent}>
      {!isAuthenticated ? (
        <PortalCard tone="warning" title="Authentication required" subtitle="You must be logged in to view your personalized worklist." />
      ) : null}

      {error ? (
        <PortalCard tone="danger" title="Unable to load worklist" subtitle={error} />
      ) : null}

      <PortalCard
        title="Your worklist"
        subtitle={user?.email ? "Assignments routed to your queue." : "Showing latest coding members."}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button className="portal-ghost-button" onClick={() => navigate("/coding/members")}>
              Open members page
            </button>
            <button className="portal-ghost-button" onClick={() => void loadWorklist()} disabled={loading || !canQuery}>
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        }
      >
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
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
                        className="portal-ghost-button"
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
            <button className="portal-ghost-button" onClick={() => navigate("/coding/members")}>
              View full queue
            </button>
          </div>
        )}
      </PortalCard>
    </PortalPageLayout>
  );
};

export default CodingLandingPage;
