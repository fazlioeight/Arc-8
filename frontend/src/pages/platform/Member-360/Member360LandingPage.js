import React, { useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import PortalPageLayout from "../../../components/PortalPageLayout";
import { AuthContext } from "../../../context/AuthContext";
import { PORTAL_NAV_ITEMS } from "../portal_page/portalNavItems";
import { ROUTES } from "../../../constants/routes";
import { fetchMember360Members } from "../../../services/member360LabService";
import { LabSubNav } from "../member360-lab/components";
import SearchInput from "../../../components/ui/SearchInput";
import "../../../styles/memberWorkspace.css";

const MEMBER_CHART_BREADCRUMB = "Member chart";

const buildOption = (member) => {
  const fullName = [member.first_name, member.last_name].filter(Boolean).join(" ");
  const display = member.member_key || String(member.id);
  return {
    key: String(member.id),
    value: display,
    label: [display, fullName, member.plan_name].filter(Boolean).join(" | "),
    memberId: member.id,
    member,
  };
};

const Member360LandingPage = () => {
  const navigate = useNavigate();
  const { token, tenant } = useContext(AuthContext) || {};
  const [members, setMembers] = useState([]);
  const [memberQuery, setMemberQuery] = useState("");
  const [loadError, setLoadError] = useState(null);
  const [searchError, setSearchError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLaunching, setIsLaunching] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    fetchMember360Members(token, tenant, { limit: 500 })
      .then((res) => {
        if (cancelled) return;
        setMembers(res.items || []);
        setLoadError(null);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message || String(err));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, tenant]);

  const memberOptions = useMemo(() => {
    const term = memberQuery.trim().toLowerCase();
    if (term.length < 2) return [];
    return members
      .filter((m) => {
        const hay = [
          m.first_name,
          m.last_name,
          m.member_key,
          m.primary_care_provider,
          m.plan_name,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(term);
      })
      .slice(0, 7)
      .map(buildOption);
  }, [members, memberQuery]);

  const launchMember = (memberId) => {
    if (!memberId) return;
    setIsLaunching(true);
    setTimeout(() => {
      navigate(`${ROUTES.MEMBER360_LAB.MEMBER_WORKSPACE_ROOT}/${memberId}`, {
        state: { breadcrumb: MEMBER_CHART_BREADCRUMB },
      });
    }, 0);
  };

  const handleMemberQueryChange = (value) => {
    setMemberQuery(value);
    setSearchError(null);
  };

  const handleMemberSearch = (event) => {
    event.preventDefault();
    const term = memberQuery.trim();
    if (!term) {
      setSearchError("Enter a member ID to continue.");
      return;
    }
    const lower = term.toLowerCase();
    const exact = members.find((m) =>
      [m.member_key, m.first_name, m.last_name, String(m.id)]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase() === lower)
    );
    if (exact) {
      launchMember(exact.id);
      return;
    }
    if (memberOptions.length === 1) {
      launchMember(memberOptions[0].memberId);
      return;
    }
    setSearchError("Member not found. Try another ID.");
  };

  const handleSuggestionSelect = (option) => {
    setMemberQuery(option.value);
    setSearchError(null);
    launchMember(option.memberId);
  };

  const statusMessage = useMemo(() => {
    if (searchError) return searchError;
    if (isLaunching) return "Opening member chart...";
    if (isLoading) return "Loading Member360 roster...";
    if (loadError) return loadError;
    if (!memberQuery.trim()) {
      return "Enter at least two characters to search by member ID.";
    }
    if (memberOptions.length) {
      return "Press Enter to open the highlighted member chart or pick a suggestion.";
    }
    return "No suggestions yet.";
  }, [
    isLaunching,
    isLoading,
    loadError,
    memberOptions.length,
    memberQuery,
    searchError,
  ]);

  const statusTone =
    searchError || loadError
      ? "text-rose-600 dark:text-rose-400"
      : "coding-text-muted";

  return (
    <PortalPageLayout
      title="Launch a member chart in seconds"
      subtitle="Search across your Member360 roster and jump directly into the chart workspace without leaving Member360."
      eyebrow="Nexora Lab Member360"
      navItems={PORTAL_NAV_ITEMS}
      currentNav="member360-lab"
      navProps={{ align: "center", tone: "surface" }}
      align="center"
      maxWidthClassName="max-w-4xl"
      mainClassName="space-y-6"
    >
      <LabSubNav />

      <section className="coding-surface rounded-2xl shadow-sm p-6 sm:p-8">
        <form onSubmit={handleMemberSearch} className="space-y-5">
          <div className="space-y-2">
            <label
              htmlFor="member-360-search-input"
              className="block text-[11px] font-semibold uppercase tracking-wider coding-text-muted"
            >
              Member ID
            </label>
            <div className="flex flex-col gap-3 sm:flex-row">
              <SearchInput
                id="member-360-search-input"
                autoComplete="off"
                placeholder="Search by member ID, name, or plan"
                value={memberQuery}
                onChange={(event) => handleMemberQueryChange(event.target.value)}
                list="member-360-suggestions"
                aria-describedby="member-360-search-status"
                className="pl-9 pr-3 py-2.5 text-sm"
              />
              <button
                type="submit"
                disabled={isLaunching}
                className="inline-flex items-center justify-center rounded-md bg-[var(--brand-primary)] px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLaunching ? "Opening..." : "Open chart"}
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

          <div className="space-y-2">
            <p
              id="member-360-search-status"
              className={`text-xs ${statusTone}`}
            >
              {statusMessage}
            </p>

            {memberOptions.length > 0 && (
              <ul className="overflow-hidden rounded-md border coding-border">
                {memberOptions.map((option) => (
                  <li key={option.key} className="border-b coding-border-subtle last:border-b-0">
                    <button
                      type="button"
                      onClick={() => handleSuggestionSelect(option)}
                      className="flex w-full flex-col items-start gap-0.5 px-4 py-2.5 text-left transition hover:bg-[var(--coding-hover)] focus-visible:outline-none focus-visible:bg-[var(--coding-hover)]"
                    >
                      <span className="text-sm font-medium coding-text-strong">
                        {[option.member.first_name, option.member.last_name]
                          .filter(Boolean)
                          .join(" ") || "Unknown member"}
                      </span>
                      {option.member.member_key && (
                        <span className="text-[11px] coding-text-muted">
                          {option.member.member_key}{option.member.plan_name ? ` · ${option.member.plan_name}` : ''}
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
