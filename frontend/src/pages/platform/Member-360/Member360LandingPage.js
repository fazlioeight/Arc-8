import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import PortalUtilityBar from "../../../components/PortalUtilityBar";
import PortalNavigation from "../../../components/PortalNavigation";
import { AuthContext } from "../../../context/AuthContext";
import { fetchCodingMembers } from "../../../services/codingService";

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

const formatMemberLabel = (member) => {
  const pieces = [
    member?.member_key,
    [member?.first_name, member?.last_name].filter(Boolean).join(" "),
    member?.dob ? `DOB ${member.dob}` : null,
  ].filter(Boolean);
  return pieces.join(" • ");
};

const MEMBER_CHART_BREADCRUMB = "Member chart";

const Member360LandingPage = () => {
  const navigate = useNavigate();
  const { token, tenant } = useContext(AuthContext) || {};

  const [memberQuery, setMemberQuery] = useState("");
  const [memberSuggestions, setMemberSuggestions] = useState([]);
  const [memberSearchError, setMemberSearchError] = useState(null);
  const [isSearchingMembers, setIsSearchingMembers] = useState(false);
  const [isLaunchingMember, setIsLaunchingMember] = useState(false);

  const navigationItems = useMemo(
    () => [
      { key: "member-search", label: "Member Search", href: "/member-360", disabled: true },
      { key: "coding", label: "Coding Worklists", href: "/coding" },
      { key: "portal", label: "Portal Overview", href: "/portal_page/portalPage" },
    ],
    []
  );

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
  }, [memberQuery, tenant, token]);

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

  const navigateToMemberChart = useCallback(
    (memberId) => {
      if (!memberId) {
        return;
      }
      setIsLaunchingMember(false);
      navigate(`/coding/member/${memberId}/chart`, {
        state: { breadcrumb: MEMBER_CHART_BREADCRUMB },
      });
    },
    [navigate]
  );

  const handleMemberSearch = useCallback(
    async (event) => {
      event.preventDefault();
      const term = memberQuery.trim();
      if (!term) {
        setMemberSearchError("Enter a member ID to continue.");
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
          setMemberSearchError(error?.message || "Unable to open that member right now.");
        }
      }

      if (memberId) {
        navigateToMemberChart(memberId);
        return;
      }

      setMemberSearchError("Member not found. Try another ID.");
      setIsLaunchingMember(false);
    },
    [memberQuery, navigateToMemberChart, resolveMemberId, tenant, token]
  );

  const statusMessage = useMemo(() => {
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
      return "Press Enter to open the highlighted member chart or pick a suggestion.";
    }
    return "No suggestions yet.";
  }, [isLaunchingMember, isSearchingMembers, memberQuery, memberSearchError, memberSuggestions.length]);

  const statusTone = memberSearchError ? "text-rose-400" : "text-slate-400";

  const handleSuggestionSelect = useCallback(
    (member) => {
      const memberId = pickMemberIdForNavigation(member);
      if (!memberId) {
        return;
      }
      const memberKey =
        member?.member_key || member?.memberId || member?.member_id || String(memberId);
      setMemberQuery(memberKey);
      setMemberSearchError(null);
      setIsLaunchingMember(true);
      setTimeout(() => navigateToMemberChart(memberId), 0);
    },
    [navigateToMemberChart]
  );

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <PortalUtilityBar />
      <main className="flex w-full justify-center px-4 pb-16 pt-10 sm:px-6 lg:px-8">
        <div className="w-full max-w-3xl space-y-6">
          <PortalNavigation
            items={navigationItems}
            currentSection="member-search"
            className="!bg-slate-900/40 !border-slate-800 !text-slate-200"
          />
          <section className="rounded-3xl border border-white/5 bg-slate-900/70 p-10 shadow-2xl shadow-slate-950/40 backdrop-blur">
            <header className="mb-8 text-center sm:text-left">
              <p className="text-xs font-semibold uppercase tracking-[0.4em] text-sky-400/80">
                Member 360
              </p>
              <h1 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">
                Launch a member chart in seconds
              </h1>
              <p className="mt-4 text-base text-slate-300 sm:max-w-xl">
                Search across your member roster and jump directly into the Coding chart view
                without leaving the workspace.
              </p>
            </header>

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
                        setMemberQuery(event.target.value);
                        setMemberSearchError(null);
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
                  {memberSuggestions.map((member) => {
                    const optionValue =
                      member?.member_key ||
                      member?.memberId ||
                      member?.member_id ||
                      member?.id;
                    return (
                      <option key={member?.id || optionValue} value={optionValue || ""}>
                        {formatMemberLabel(member)}
                      </option>
                    );
                  })}
                </datalist>
              </div>

              <div className="space-y-3">
                <p
                  id="member-360-search-status"
                  className={`text-sm font-medium ${statusTone}`}
                >
                  {statusMessage}
                </p>

                {memberSuggestions.length > 0 && (
                  <ul className="divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/5 bg-slate-950/40">
                    {memberSuggestions.map((member) => {
                      const label = formatMemberLabel(member);
                      const memberId = pickMemberIdForNavigation(member);
                      return (
                        <li key={member?.id || memberId}>
                          <button
                            type="button"
                            onClick={() => handleSuggestionSelect(member)}
                            className="flex w-full flex-col items-start gap-1 px-4 py-3 text-left transition hover:bg-sky-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                          >
                            <span className="text-sm font-semibold text-white">
                              {label || "Unknown member"}
                            </span>
                            {memberId && (
                              <span className="text-xs uppercase tracking-wide text-slate-400">
                                Member ID: {memberId}
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </form>
          </section>
        </div>
      </main>
    </div>
  );
};

export default Member360LandingPage;
