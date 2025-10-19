import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { useCommandPalette } from '../context/CommandPaletteContext';
import { useGuidedTour } from '../context/GuidedTourContext';
import { useUserPreferences } from '../context/UserPreferencesContext';
import { SAMPLE_CODING_MEMBERS, SAMPLE_ADMIN_APPLICATIONS } from '../utils/sampleData';

const CATEGORY_ORDER = ['Favorites', 'Records', 'Providers', 'Knowledge', 'Navigation', 'Workspace', 'Tenant', 'Data', 'Actions', 'Admin', 'Support'];

const CommandPalette = ({ onThemeToggle }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const {
    isOpen,
    openPalette,
    closePalette,
    query,
    setQuery,
    dynamicCommands,
  } = useCommandPalette();
  const [searchCommands, setSearchCommands] = useState([]);
  const { startTour } = useGuidedTour();
  const { isNavItemEnabled, favorites, toggleFavorite, isFavorite } = useUserPreferences();

  const auth = useContext(AuthContext) || {};
  const {
    isAuthenticated,
    tenantInfo,
    availableTenants = [],
    availableApplications = [],
    tenant,
    setTenant,
    role,
    hasApplicationAccess,
    isImpersonating,
    impersonation,
    endImpersonation,
    recordAuditEvent,
  } = auth;
  const currentPath = useMemo(
    () => `${location.pathname}${location.search}`,
    [location.pathname, location.search],
  );
  const currentFavoriteLabel = useMemo(() => {
    if (document?.title) return document.title;
    return location.pathname || 'Current page';
  }, [location.pathname]);
  const currentPagePinned = isFavorite(currentPath);
  const sampleProviders = useMemo(() => {
    const map = new Map();
    SAMPLE_CODING_MEMBERS.forEach((member) => {
      if (!member.pcp_name) return;
      const key = (member.pcp_npi || member.pcp_name || '').toLowerCase();
      if (!key || map.has(key)) return;
      map.set(key, {
        name: member.pcp_name,
        npi: member.pcp_npi,
      });
    });
    return Array.from(map.values());
  }, []);

  const paletteThemeVars = useMemo(() => ({
    '--sfdc-surface': 'var(--bg-card)',
    '--sfdc-surface-alt': 'var(--input-bg)',
    '--sfdc-text': 'var(--text)',
    '--sfdc-muted': 'var(--text-muted)',
    '--sfdc-border': 'var(--border)',
    '--cp-highlight-bg': 'rgba(14, 165, 233, 0.18)',
    '--cp-highlight-border': 'rgba(14, 165, 233, 0.28)',
  }), []);

  const activeCommandStyle = useMemo(() => ({
    background: 'var(--cp-highlight-bg)',
    color: 'var(--sfdc-text)',
    boxShadow: '0 0 0 1px var(--cp-highlight-border)',
  }), []);

  const activeShortcutStyle = useMemo(() => ({
    color: 'var(--sfdc-text)',
  }), []);

  const baseCommands = useMemo(() => {
    const enabledSet = new Set(
      (availableApplications && availableApplications.length)
        ? availableApplications
        : ['portal', 'settings', 'admin_console', 'dashboard', 'coding', 'ride_booking', 'docs', 'job_center']
    );
    const isEnabled = (key) => enabledSet.has(key) || key === 'portal';
    const commands = [];
    const append = (command) => {
      if (command.disabled) return;
      commands.push(command);
    };

    append({
      id: 'nav-portal',
      label: 'Go to Portal Home',
      category: 'Navigation',
      keywords: 'home overview landing',
      shortcut: 'G H',
      action: () => navigate('/portal_page/portalPage'),
      disabled: !isNavItemEnabled('home'),
    });
    append({
      id: 'nav-dashboard',
      label: 'Open Analytics Dashboard',
      category: 'Navigation',
      keywords: 'metrics analytics raf',
      shortcut: 'G D',
      action: () => navigate('/dashboard'),
      disabled: !isAuthenticated || !isEnabled('dashboard') || !hasApplicationAccess?.('dashboard') || !isNavItemEnabled('analytics'),
    });
    append({
      id: 'nav-coding',
      label: 'Go to Coding Worklists',
      category: 'Navigation',
      keywords: 'coding charts members worklist',
      action: () => navigate('/coding'),
      disabled: !isAuthenticated || !isEnabled('coding') || !hasApplicationAccess?.('coding') || !isNavItemEnabled('coding'),
    });
    append({
      id: 'nav-ride-booking',
      label: 'Open Ride Booking',
      category: 'Navigation',
      keywords: 'transport rides partners scheduling',
      action: () => navigate('/RideBooking'),
      disabled: !isAuthenticated || !isEnabled('ride_booking') || !hasApplicationAccess?.('ride_booking') || !isNavItemEnabled('rideBooking'),
    });
    append({
      id: 'nav-ride-payments',
      label: 'Open Ride Payments and Billing',
      category: 'Navigation',
      keywords: 'payments billing invoices payouts ledger stripe',
      action: () => navigate('/RideBooking/payments'),
      disabled: !isAuthenticated || !isEnabled('ride_booking') || !hasApplicationAccess?.('ride_booking') || !isNavItemEnabled('rideBooking'),
    });
    append({
      id: 'nav-docs',
      label: 'Browse Documentation',
      category: 'Support',
      keywords: 'docs help knowledge base',
      shortcut: 'G ?'
,
      action: () => navigate('/docs'),
      disabled: !isEnabled('docs') || !hasApplicationAccess?.('docs') || !isNavItemEnabled('resources'),
    });
    append({
      id: 'support-guided-tour',
      label: 'Take the guided tour',
      category: 'Support',
      keywords: 'help onboarding walkthrough tour introduction',
      action: () => startTour({ force: true, step: 0 }),
    });
    append({
      id: 'favorite-toggle-current',
      label: currentPagePinned ? 'Unpin this page from favorites' : 'Pin this page to favorites',
      category: 'Favorites',
      keywords: 'favorite pin unpin bookmark',
      action: () => toggleFavorite({ path: currentPath, label: currentFavoriteLabel }),
    });
    favorites.forEach((fav) => {
      append({
        id: `favorite-${fav.path}`,
        label: `Open ${fav.label}`,
        category: 'Favorites',
        keywords: `${fav.label} favorite pinned`,
        action: () => navigate(fav.path),
      });
    });
    append({
      id: 'nav-settings',
      label: 'Open Settings',
      category: 'Workspace',
      keywords: 'profile preferences theme',
      action: () => navigate('/settings'),
      disabled: !isAuthenticated || !isEnabled('settings') || !hasApplicationAccess?.('settings') || !isNavItemEnabled('settings'),
    });
    append({
      id: 'nav-job-center',
      label: 'View Job & Status Center',
      category: 'Navigation',
      keywords: 'jobs imports queue status logs',
      action: () => navigate('/jobs/status-center'),
      disabled: !isAuthenticated || !isEnabled('job_center') || !hasApplicationAccess?.('job_center'),
    });

    availableTenants.forEach((tenantOption) => {
      append({
        id: `tenant-${tenantOption.key}`,
        label: tenantOption.key === tenant
          ? `${tenantOption.name} (current)`
          : `Switch to ${tenantOption.name}`,
        category: 'Tenant',
        keywords: `${tenantOption.name} ${tenantOption.region || ''} ${tenantOption.key}`,
        action: () => setTenant?.(tenantOption.key),
        disabled: tenantOption.key === tenant,
      });
    });

    if (isImpersonating) {
      append({
        id: 'impersonation-exit',
        label: `Stop impersonating ${impersonation?.name || impersonation?.email}`,
        category: 'Admin',
        keywords: 'impersonation admin audit',
        action: () => endImpersonation?.(),
      });
    }

    if (((role === 'admin' || role === 'platform_admin') || hasApplicationAccess?.('admin_console', 'admin')) && isEnabled('admin_console')) {
      append({
        id: 'nav-admin-console',
        label: 'Open Master Admin Console',
        category: 'Admin',
        keywords: 'admin roles permissions',
        action: () => navigate('/admin/master'),
      });
    }

    if (typeof onThemeToggle === 'function') {
      append({
        id: 'workspace-toggle-theme',
        label: 'Toggle theme',
        category: 'Workspace',
        keywords: 'theme dark light',
        action: () => onThemeToggle(),
      });
    }

    return commands;
  }, [
    availableTenants,
    availableApplications,
    endImpersonation,
    hasApplicationAccess,
    isAuthenticated,
    isImpersonating,
    navigate,
    onThemeToggle,
    role,
    setTenant,
    tenant,
    impersonation,
    startTour,
    isNavItemEnabled,
    favorites,
    toggleFavorite,
    currentFavoriteLabel,
    currentPagePinned,
    location.pathname,
  ]);

  useEffect(() => {
    const term = query.trim().toLowerCase();
    if (!isOpen || term.length < 2) {
      setSearchCommands([]);
      return;
    }
    const commands = [];
    SAMPLE_CODING_MEMBERS.filter((member) => {
      const haystack = [
        member.first_name,
        member.last_name,
        member.member_key,
        member.pcp_name,
        member.pcp_npi,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    }).slice(0, 5).forEach((member) => {
      const memberName = [member.first_name, member.last_name]
        .filter(Boolean)
        .join(' ');
      const displayName = memberName || member.member_key;
      commands.push({
        id: `search-member-${member.id}`,
        label: `Member • ${displayName}`,
        category: 'Records',
        keywords: `${member.member_key} ${memberName} ${member.pcp_name || ''}`,
        action: () => navigate(`/coding/member/${member.id}`, {
          state: {
            from: currentPath,
            breadcrumb: displayName,
          },
        }),
      });
    });

    sampleProviders.filter((provider) => {
      const haystack = [provider.name, provider.npi].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(term);
    }).slice(0, 4).forEach((provider) => {
      const identifier = provider.npi || provider.name;
      commands.push({
        id: `search-provider-${identifier}`,
        label: `Care Team • ${provider.name}`,
        category: 'Providers',
        keywords: `${provider.name} ${provider.npi || ''}`,
        action: () => navigate(`/coding/providers/${encodeURIComponent(identifier)}`, {
          state: {
            from: currentPath,
            breadcrumb: provider.name,
          },
        }),
      });
    });

    SAMPLE_ADMIN_APPLICATIONS.filter((resource) => {
      const haystack = `${resource.label} ${resource.description || ''}`.toLowerCase();
      return haystack.includes(term);
    }).slice(0, 4).forEach((resource) => {
      commands.push({
        id: `search-doc-${resource.key}`,
        label: `Resource • ${resource.label}`,
        category: 'Knowledge',
        keywords: `${resource.label} ${resource.description || ''}`,
        action: () => navigate('/docs', {
          state: {
            breadcrumb: resource.label,
          },
        }),
      });
    });

    setSearchCommands(commands);
  }, [currentPath, isOpen, navigate, query, sampleProviders]);

  const combinedCommands = useMemo(() => {
    if (searchCommands.length) {
      return [...searchCommands, ...dynamicCommands, ...baseCommands];
    }
    return [...dynamicCommands, ...baseCommands];
  }, [searchCommands, dynamicCommands, baseCommands]);

  const filteredCommands = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return combinedCommands;
    return combinedCommands.filter((command) => {
      const haystack = [command.label, command.keywords, command.category]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [combinedCommands, query]);

  const groupedCommands = useMemo(() => {
    const groups = new Map();
    filteredCommands.forEach((command) => {
      const category = command.category || 'General';
      if (!groups.has(category)) groups.set(category, []);
      groups.get(category).push(command);
    });
    const ordered = Array.from(groups.entries()).sort((a, b) => {
      const aIdx = CATEGORY_ORDER.indexOf(a[0]);
      const bIdx = CATEGORY_ORDER.indexOf(b[0]);
      if (aIdx === -1 && bIdx === -1) return a[0].localeCompare(b[0]);
      if (aIdx === -1) return 1;
      if (bIdx === -1) return -1;
      return aIdx - bIdx;
    });
    return ordered;
  }, [filteredCommands]);

  const flatCommands = useMemo(() => groupedCommands.flatMap(([, items]) => items), [groupedCommands]);

  useEffect(() => {
    const handleGlobalKey = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if (isOpen) {
          closePalette();
        } else {
          openPalette();
        }
      }
    };
    window.addEventListener('keydown', handleGlobalKey);
    return () => window.removeEventListener('keydown', handleGlobalKey);
  }, [isOpen, closePalette, openPalette]);

  useEffect(() => {
    if (!isOpen) return undefined;
    setActiveIndex(0);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return undefined;
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKey = (event) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex((prev) => (prev + 1) % Math.max(flatCommands.length, 1));
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((prev) => (prev - 1 + Math.max(flatCommands.length, 1)) % Math.max(flatCommands.length, 1));
      } else if (event.key === 'Enter') {
        event.preventDefault();
        const command = flatCommands[activeIndex];
        if (command) {
          closePalette();
          setTimeout(() => {
            command.action?.();
            recordAuditEvent?.('command_palette.execute', {
              commandId: command.id,
              routeBefore: location.pathname,
            });
          }, 0);
        }
      } else if (event.key === 'Escape') {
        event.preventDefault();
        closePalette();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, flatCommands, activeIndex, closePalette, recordAuditEvent, location.pathname]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="command-palette" role="dialog" aria-modal="true">
      <div
        className="command-palette__backdrop"
        onClick={() => closePalette()}
        aria-hidden="true"
      />
      <div
        className="command-palette__panel"
        ref={listRef}
        style={paletteThemeVars}
      >
        <header className="command-palette__header">
          <div className="command-palette__context">
            <span className="command-palette__tenant">{tenantInfo?.name || tenant}</span>
            {isImpersonating && (
              <span className="command-palette__badge">Impersonating {impersonation?.name || impersonation?.email}</span>
            )}
          </div>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            placeholder="Search actions, tenants, or pages"
            className="command-palette__input"
            aria-label="Command search"
          />
          <div className="command-palette__hint">Ctrl+K</div>
        </header>
        <div className="command-palette__body">
          {flatCommands.length === 0 && (
            <div className="command-palette__empty">
              <p>No matches.</p>
              <div className="command-palette__suggestion">
                Try searching for page names, "tenant", or "settings".
              </div>
            </div>
          )}
          {groupedCommands.map(([category, items]) => (
            <section key={category} className="command-palette__group">
              <h3>{category}</h3>
              <ul>
                {items.map((command, index) => {
                  const globalIndex = flatCommands.indexOf(command);
                  const isActive = globalIndex === activeIndex;
                  const itemStyle = isActive ? activeCommandStyle : undefined;
                  return (
                    <li
                      key={command.id}
                      className={isActive ? 'active' : ''}
                      aria-selected={isActive}
                      style={itemStyle}
                      onMouseEnter={() => setActiveIndex(globalIndex)}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        closePalette();
                        setTimeout(() => {
                          command.action?.();
                          recordAuditEvent?.('command_palette.execute', {
                            commandId: command.id,
                            routeBefore: location.pathname,
                          });
                        }, 0);
                      }}
                    >
                      <div className="command-palette__label">{command.label}</div>
                      {command.shortcut && (
                        <span
                          className="command-palette__shortcut"
                          style={isActive ? activeShortcutStyle : undefined}
                        >
                          {command.shortcut}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;


