import React, { useContext } from "react";
import { useNavigate } from "react-router-dom";
import PortalPageLayout from "../../../components/PortalPageLayout";
import { AuthContext } from "../../../context/AuthContext";
import { useMemberSearch } from "../../../hooks/useMemberSearch";
import { PORTAL_NAV_ITEMS } from "../portal_page/portalNavItems";

const MEMBER_CHART_BREADCRUMB = "Member chart";

const Member360LandingPage = () => {
  const navigate = useNavigate();
  const { token, tenant } = useContext(AuthContext) || {};

  const {
    memberQuery,
    memberSearchError,
    isSearchingMembers,
    isLaunchingMember,
    memberOptions,
    statusMessage,
    handleMemberQueryChange,
    handleMemberSearch,
    handleSuggestionSelect,
  } = useMemberSearch({
    token,
    tenant,
    onNavigate: (memberId) =>
      navigate(`/coding/member/${memberId}/chart`, {
        state: { breadcrumb: MEMBER_CHART_BREADCRUMB },
      }),
  });

  const statusTone = memberSearchError ? "text-rose-400" : "text-slate-400";

  return (
    <PortalPageLayout
      title="Launch a member chart in seconds"
      subtitle="Search across your member roster and jump directly into the Coding chart view without leaving the workspace."
      eyebrow="Member 360"
      navItems={PORTAL_NAV_ITEMS}
      currentNav="member-360"
      navProps={{ align: "center", tone: "inverted" }}
      align="center"
      headerTone="inverted"
      backgroundClassName="bg-slate-950 text-white"
      maxWidthClassName="max-w-4xl"
      mainClassName="space-y-6"
    >
      <section className="rounded-3xl border border-white/5 bg-slate-900/70 p-10 shadow-2xl shadow-slate-950/40 backdrop-blur">
        <form onSubmit={handleMemberSearch} className="space-y-6">
          <div className="space-y-3">
            <label
              htmlFor="member-360-search-input"
              className="block text-sm font-medium text-slate-200"
            >
              Member ID
            </label>
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <input
                  id="member-360-search-input"
                  type="search"
                  autoComplete="off"
                  placeholder="Search by member ID"
                  value={memberQuery}
                  onChange={(event) => {
                    handleMemberQueryChange(event.target.value);
                  }}
                  list="member-360-suggestions"
                  aria-describedby="member-360-search-status"
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950/70 px-4 py-3 text-base text-white placeholder-slate-500 shadow-inner focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                />
                {isSearchingMembers && (
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-sky-400">
                    <svg
                      className="h-5 w-5 animate-spin"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <circle cx="12" cy="12" r="9" className="opacity-20" />
                      <path d="M21 12a9 9 0 00-9-9" strokeLinecap="round" />
                    </svg>
                  </div>
                )}
              </div>
              <button
                type="submit"
                disabled={isLaunchingMember}
                className="inline-flex items-center justify-center rounded-2xl bg-sky-500 px-6 py-3 text-sm font-semibold uppercase tracking-wide text-white shadow-lg shadow-sky-500/30 transition hover:bg-sky-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300"
              >
                {isLaunchingMember ? "Opening..." : "Open member chart"}
              </button>
            </div>
            <datalist id="member-360-suggestions">
              {memberOptions.map((option) => (
                <option key={option.key} value={option.value}>
                  {option.label}
                </option>
              ))}
            </datalist>
          </div>

          <div className="space-y-3">
            <p
              id="member-360-search-status"
              className={`text-sm font-medium ${statusTone}`}
            >
              {statusMessage}
            </p>

            {memberOptions.length > 0 && (
              <ul className="divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/5 bg-slate-950/40">
                {memberOptions.map((option) => (
                  <li key={option.key}>
                    <button
                      type="button"
                      onClick={() => handleSuggestionSelect(option)}
                      className="flex w-full flex-col items-start gap-1 px-4 py-3 text-left transition hover:bg-sky-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                    >
                      <span className="text-sm font-semibold text-white">
                        {option.label || "Unknown member"}
                      </span>
                      {option.memberId && (
                        <span className="text-xs uppercase tracking-wide text-slate-400">
                          Member ID: {option.memberId}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </form>
      </section>
    </PortalPageLayout>
  );
};

export default Member360LandingPage;
