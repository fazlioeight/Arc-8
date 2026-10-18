import React, { useRef, useState, useEffect } from 'react';

const joinClassNames = (...parts) => parts.filter(Boolean).join(' ');

/**
 * Enterprise Clinical Icons for standard EHR chart tabs
 */
const getTabIcon = (key) => {
  const iconProps = { className: 'h-3.5 w-3.5 shrink-0 transition-opacity', fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor', strokeWidth: 2 };
  switch (key) {
    case 'timeline':
      return (
        <svg {...iconProps}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case 'notes':
      return (
        <svg {...iconProps}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
      );
    case 'messages':
      return (
        <svg {...iconProps}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a.75.75 0 01-.854-.853l.472-2.36A8.25 8.25 0 013 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
        </svg>
      );
    case 'care_journey':
      return (
        <svg {...iconProps}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934a1.12 1.12 0 01-1.006 0L9.503 3.814a1.12 1.12 0 00-1.006 0L4.628 5.748A1.125 1.125 0 004 6.754v11.935c0 .836.88 1.38 1.628 1.006l3.869-1.934a1.12 1.12 0 011.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
        </svg>
      );
    case 'problems_hcc':
      return (
        <svg {...iconProps}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
      );
    case 'medications':
      return (
        <svg {...iconProps}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.942A4.5 4.5 0 0115.89 17H8.11a4.5 4.5 0 01-2.34-.758L4.2 15.3m15.6 0a3.75 3.75 0 01-.6 2.052A3.75 3.75 0 0115.89 19H8.11a3.75 3.75 0 01-3.31-1.648 3.75 3.75 0 01-.6-2.052" />
        </svg>
      );
    case 'labs_imaging':
      return (
        <svg {...iconProps}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.942A4.5 4.5 0 0115.89 17H8.11a4.5 4.5 0 01-2.34-.758L4.2 15.3" />
        </svg>
      );
    case 'care_gaps':
      return (
        <svg {...iconProps}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
        </svg>
      );
    case 'claims':
      return (
        <svg {...iconProps}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
        </svg>
      );
    case 'accumulators':
      return (
        <svg {...iconProps}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
        </svg>
      );
    case 'documents':
      return (
        <svg {...iconProps}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
        </svg>
      );
    case 'portal':
      return (
        <svg {...iconProps}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-.778.099-1.533.284-2.253" />
        </svg>
      );
    case 'audit_log':
    case 'audit':
      return (
        <svg {...iconProps}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
        </svg>
      );
    case 'sharing':
      return (
        <svg {...iconProps}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
        </svg>
      );
    case 'settings':
      return (
        <svg {...iconProps}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
        </svg>
      );
    case 'overview':
      return (
        <svg {...iconProps}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
        </svg>
      );
    case 'codes':
      return (
        <svg {...iconProps}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
        </svg>
      );
    default:
      return null;
  }
};

/**
 * Enterprise EHR Clinical Tab Navigation
 * 
 * Features:
 * - Seamless card integration (matches background, zero dark block clashing)
 * - Clean clinical underline indicators (no crammed pill buttons)
 * - Smart "More ▾" dropdown for large tab collections (eliminating ugly horizontal scrollbars & cutoffs)
 * - Automatic active tab indication inside dropdown
 * - EHR-standard micro-icons and tabular badges
 */
export default function WorkspaceTabs({
  tabs = [],
  activeKey,
  onChange,
  className = '',
  maxVisible = 9,
  ariaLabel = 'Workspace tabs',
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Split tabs into visible inline items and overflow dropdown items
  const shouldSplit = tabs.length > maxVisible;
  const visibleTabs = shouldSplit ? tabs.slice(0, maxVisible) : tabs;
  const overflowTabs = shouldSplit ? tabs.slice(maxVisible) : [];

  // Check if current activeKey is inside the overflow set
  const activeOverflowTab = overflowTabs.find((t) => t.key === activeKey);

  // Close dropdown on click outside or escape key
  useEffect(() => {
    if (!dropdownOpen) return;

    const handlePointerDown = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [dropdownOpen]);

  return (
    <div
      className={joinClassNames(
        'relative border-b border-slate-800/80 bg-slate-900/60 rounded-t-2xl px-3 pt-2 select-none transition-colors flex items-center justify-between gap-2',
        className
      )}
    >
      {/* ── Primary Inline Tabs in clean horizontal container ────── */}
      <div className="flex-1 overflow-x-auto no-scrollbar min-w-0">
        <nav
          className="flex items-center gap-1.5"
          role="tablist"
          aria-label={ariaLabel}
        >
          {visibleTabs.map((t) => {
            const active = t.key === activeKey;
            const icon = t.icon || getTabIcon(t.key);

            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={active}
                disabled={t.disabled}
                onClick={() => !t.disabled && onChange?.(t.key)}
                className={joinClassNames(
                  'group relative inline-flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold rounded-lg transition-all duration-150 whitespace-nowrap shrink-0',
                  active
                    ? 'text-sky-400 font-bold bg-slate-800 shadow-sm border border-slate-700/80'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 border border-slate-800/40',
                  t.disabled && 'opacity-40 cursor-not-allowed'
                )}
              >
                {icon && (
                  <span
                    className={joinClassNames(
                      'transition-colors',
                      active
                        ? 'text-sky-400'
                        : 'text-slate-500 group-hover:text-slate-300'
                    )}
                    aria-hidden
                  >
                    {icon}
                  </span>
                )}
                <span>{t.label}</span>
                {t.badge != null && (
                  <span
                    className={joinClassNames(
                      'inline-flex items-center justify-center min-w-[1.25rem] h-4 px-1.5 rounded-full text-[10px] font-bold tabular-nums transition-colors',
                      active
                        ? 'bg-sky-500 text-white'
                        : 'bg-slate-800 text-slate-400 border border-slate-700/60'
                    )}
                  >
                    {t.badge}
                  </span>
                )}
                {/* Active bottom accent bar */}
                {active && (
                  <span
                    className="absolute -bottom-[9px] left-3 right-3 h-[2.5px] bg-sky-400 rounded-full shadow-xs shadow-sky-400/50"
                    aria-hidden
                  />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* ── Smart "More ▾" Overflow Dropdown (outside of scroll container) ── */}
      {shouldSplit && overflowTabs.length > 0 && (
        <div className="relative shrink-0" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setDropdownOpen((v) => !v)}
            aria-expanded={dropdownOpen}
            aria-haspopup="menu"
            className={joinClassNames(
              'group relative inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold rounded-lg transition-all duration-150 whitespace-nowrap',
              activeOverflowTab
                ? 'text-sky-400 font-bold bg-slate-800 shadow-sm border border-slate-700/80'
                : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 border border-slate-800/40'
            )}
          >
            {activeOverflowTab ? (
              <>
                <span className="text-sky-400" aria-hidden>
                  {activeOverflowTab.icon || getTabIcon(activeOverflowTab.key)}
                </span>
                <span>{activeOverflowTab.label}</span>
              </>
            ) : (
              <span>More ({overflowTabs.length})</span>
            )}
            <svg
              className={joinClassNames(
                'h-3.5 w-3.5 transition-transform duration-150',
                dropdownOpen && 'rotate-180',
                activeOverflowTab ? 'text-sky-400' : 'text-slate-500 group-hover:text-slate-300'
              )}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
            {activeOverflowTab && (
              <span
                className="absolute -bottom-[9px] left-3 right-3 h-[2.5px] bg-sky-400 rounded-full shadow-xs shadow-sky-400/50"
                aria-hidden
              />
            )}
          </button>

          {/* Dropdown Menu Popover */}
          {dropdownOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-slate-700/80 bg-slate-900 shadow-2xl shadow-black/80 p-1.5 z-50 animate-in fade-in zoom-in-95 duration-100"
            >
              <div className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800 mb-1">
                Additional Sections
              </div>
              {overflowTabs.map((t) => {
                const active = t.key === activeKey;
                const icon = t.icon || getTabIcon(t.key);

                return (
                  <button
                    key={t.key}
                    type="button"
                    role="menuitem"
                    disabled={t.disabled}
                    onClick={() => {
                      if (!t.disabled) {
                        onChange?.(t.key);
                        setDropdownOpen(false);
                      }
                    }}
                    className={joinClassNames(
                      'w-full flex items-center justify-between px-2.5 py-2 text-xs font-semibold rounded-lg transition-colors text-left',
                      active
                        ? 'bg-sky-950/60 text-sky-400 font-bold border border-sky-800/40'
                        : 'text-slate-300 hover:bg-slate-800/80 hover:text-white',
                      t.disabled && 'opacity-40 cursor-not-allowed'
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {icon && (
                        <span
                          className={joinClassNames(
                            'shrink-0',
                            active ? 'text-sky-400' : 'text-slate-500'
                          )}
                          aria-hidden
                        >
                          {icon}
                        </span>
                      )}
                      <span className="truncate">{t.label}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      {t.badge != null && (
                        <span
                          className={joinClassNames(
                            'inline-flex items-center justify-center min-w-[1.25rem] h-4 px-1.5 rounded-full text-[10px] font-bold tabular-nums',
                            active
                              ? 'bg-sky-500 text-white'
                              : 'bg-slate-800 text-slate-400'
                          )}
                        >
                          {t.badge}
                        </span>
                      )}
                      {active && (
                        <svg className="h-3.5 w-3.5 text-sky-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
