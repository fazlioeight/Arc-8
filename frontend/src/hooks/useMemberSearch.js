import { useCallback, useEffect, useMemo, useState } from "react";
import { MemberSearchService } from "../services/codingService";

export const toLowerString = (value) => {
  if (value === undefined || value === null) {
    return null;
  }
  return String(value).toLowerCase();
};

export const extractMemberTokens = (member) => {
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

export const pickMemberIdForNavigation = (member) => {
  if (!member) {
    return null;
  }
  return member?.id || member?.member_id || member?.memberId || null;
};

export const pickMemberDisplayValue = (member) => {
  if (!member) {
    return "";
  }
  const value =
    member?.member_key ||
    member?.memberId ||
    member?.member_id ||
    member?.id;
  return value ? String(value) : "";
};

export const formatMemberLabel = (member) => {
  if (!member) {
    return "";
  }
  const pieces = [
    pickMemberDisplayValue(member),
    [member?.first_name, member?.last_name].filter(Boolean).join(" "),
    member?.dob ? `DOB ${member.dob}` : null,
  ].filter(Boolean);
  return pieces.join(" | ");
};

export const buildMemberOption = (member) => {
  if (!member) {
    return null;
  }
  const value = pickMemberDisplayValue(member);
  const memberId = pickMemberIdForNavigation(member);
  const key = memberId || value;
  if (!value && !key) {
    return null;
  }
  return {
    key: key || value,
    value: value || String(key || ""),
    label: formatMemberLabel(member) || value || "Unknown member",
    memberId: memberId || null,
    member,
  };
};

export const DEFAULT_MEMBER_SEARCH_MESSAGES = {
  emptySearchError: "Enter a member ID to continue.",
  searchErrorFallback: "Unable to search members right now.",
  lookupErrorFallback: "Unable to open that member right now.",
  notFound: "Member not found. Try another ID.",
  status: {
    launching: "Opening member chart...",
    searching: "Searching members...",
    prompt: "Enter at least two characters to search by member ID.",
    hasSuggestions:
      "Press Enter to open the highlighted member chart or pick a suggestion.",
    empty: "No suggestions yet.",
  },
};

const mergeMessages = (messages) => ({
  ...DEFAULT_MEMBER_SEARCH_MESSAGES,
  ...messages,
  status: {
    ...DEFAULT_MEMBER_SEARCH_MESSAGES.status,
    ...(messages?.status || {}),
  },
});

export const useMemberSearch = ({
  token,
  tenant,
  onNavigate,
  debounceMs = 250,
  suggestionPageSize = 7,
  lookupPageSize = 5,
  minChars = 2,
  messages: customMessages = DEFAULT_MEMBER_SEARCH_MESSAGES,
  service: providedService,
} = {}) => {
  const messages = useMemo(
    () => mergeMessages(customMessages || {}),
    [customMessages]
  );
  const memberService = useMemo(
    () => providedService || new MemberSearchService({ token, tenant }),
    [providedService, tenant, token]
  );

  const [memberQuery, setMemberQuery] = useState("");
  const [memberSuggestions, setMemberSuggestions] = useState([]);
  const [memberSearchError, setMemberSearchError] = useState(null);
  const [isSearchingMembers, setIsSearchingMembers] = useState(false);
  const [isLaunchingMember, setIsLaunchingMember] = useState(false);

  const memberOptions = useMemo(
    () => memberSuggestions.map(buildMemberOption).filter(Boolean),
    [memberSuggestions]
  );

  const handleMemberQueryChange = useCallback((value) => {
    setMemberQuery(value);
    setMemberSearchError(null);
  }, []);

  useEffect(() => {
    const term = memberQuery.trim();
    if (term.length < minChars) {
      setMemberSuggestions([]);
      setMemberSearchError(null);
      setIsSearchingMembers(false);
      return undefined;
    }

    let isActive = true;
    setIsSearchingMembers(true);
    setMemberSearchError(null);

    const timeoutId = window.setTimeout(() => {
      memberService
        .search({
          search: term,
          pageSize: suggestionPageSize,
        })
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
            error?.message || messages.searchErrorFallback
          );
        })
        .finally(() => {
          if (!isActive) {
            return;
          }
          setIsSearchingMembers(false);
        });
    }, debounceMs);

    return () => {
      isActive = false;
      window.clearTimeout(timeoutId);
      setIsSearchingMembers(false);
    };
  }, [
    debounceMs,
    memberQuery,
    messages.searchErrorFallback,
    minChars,
    suggestionPageSize,
    memberService,
  ]);

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

  const navigateToMember = useCallback(
    (memberId) => {
      if (!memberId) {
        return;
      }
      setIsLaunchingMember(false);
      if (onNavigate) {
        onNavigate(memberId);
      }
    },
    [onNavigate]
  );

  const handleMemberSearch = useCallback(
    async (event) => {
      event?.preventDefault?.();
      const term = memberQuery.trim();
      if (!term) {
        setMemberSearchError(messages.emptySearchError);
        return;
      }

      setMemberSearchError(null);
      setIsLaunchingMember(true);

      let memberId = resolveMemberId(term);

      if (!memberId) {
        try {
          const response = await memberService.search({
            search: term,
            pageSize: lookupPageSize,
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
            error?.message || messages.lookupErrorFallback
          );
          setIsLaunchingMember(false);
          return;
        }
      }

      if (memberId) {
        navigateToMember(memberId);
        return;
      }

      setMemberSearchError(messages.notFound);
      setIsLaunchingMember(false);
    },
    [
      lookupPageSize,
      memberQuery,
      messages.emptySearchError,
      messages.lookupErrorFallback,
      messages.notFound,
      navigateToMember,
      resolveMemberId,
      memberService,
    ]
  );

  const handleSuggestionSelect = useCallback(
    (memberOrOption) => {
      const member = memberOrOption?.member || memberOrOption;
      const memberId = pickMemberIdForNavigation(member);
      if (!memberId) {
        return;
      }
      const memberKey = pickMemberDisplayValue(member) || String(memberId);
      setMemberQuery(memberKey);
      setMemberSearchError(null);
      setIsLaunchingMember(true);
      setTimeout(() => navigateToMember(memberId), 0);
    },
    [navigateToMember]
  );

  const statusMessage = useMemo(() => {
    if (memberSearchError) {
      return memberSearchError;
    }
    if (isLaunchingMember) {
      return messages.status.launching;
    }
    if (isSearchingMembers) {
      return messages.status.searching;
    }
    if (!memberQuery.trim()) {
      return messages.status.prompt;
    }
    if (memberSuggestions.length) {
      return messages.status.hasSuggestions;
    }
    return messages.status.empty;
  }, [
    isLaunchingMember,
    isSearchingMembers,
    memberQuery,
    memberSearchError,
    memberSuggestions.length,
    messages.status,
  ]);

  return {
    memberQuery,
    memberSuggestions,
    memberSearchError,
    isSearchingMembers,
    isLaunchingMember,
    memberOptions,
    statusMessage,
    handleMemberQueryChange,
    handleMemberSearch,
    handleSuggestionSelect,
  };
};
