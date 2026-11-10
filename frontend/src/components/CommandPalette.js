import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { useCommandPalette } from '../context/CommandPaletteContext';
import { useGuidedTour } from '../context/GuidedTourContext';
import { useUserPreferences } from '../context/UserPreferencesContext';
import { usePermissions } from '../hooks/usePermissions';
import { ROUTES } from '../constants/routes';
import { getCurrentData } from '../services/planPerformanceService';
import { resolveApiBase } from '../utils/apiBase';

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
  const { can, currentRole } = usePermissions();

  const auth = useContext(AuthContext) || {};
  const {
    isAuthenticated,
    token,
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
        : ['portal', 'settings', 'admin_console', 'dashboard', 'providers', 'member360', 'docs', 'job_center']
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
      keywords: 'home overview landing portal',
      shortcut: 'G H',
      action: () => navigate(ROUTES.PORTAL.LANDING),
      disabled: !isNavItemEnabled('home'),
    });
    append({
      id: 'nav-member360',
      label: 'Open Care Intelligence (Member 360)',
      category: 'Navigation',
      keywords: 'member 360 care intelligence dashboard clinical overview',
      action: () => navigate(ROUTES.MEMBER360_LAB.DASHBOARD),
      disabled: !isAuthenticated || !can('menu:care_intelligence') || currentRole === 'payer_executive',
    });
    append({
      id: 'nav-patient-roster',
      label: 'Open Patient Roster',
      category: 'Navigation',
      keywords: 'patient roster members list search chart phi',
      action: () => navigate(ROUTES.MEMBER360_LAB.MEMBERS),
      disabled: !isAuthenticated || !can('menu:patient_roster') || currentRole === 'payer_executive',
    });
    append({
      id: 'nav-clinical-tasks',
      label: 'Open Clinical Tasks Queue',
      category: 'Navigation',
      keywords: 'clinical tasks queue todo care coordination',
      action: () => navigate(ROUTES.MEMBER360_LAB.TASKS),
      disabled: !isAuthenticated || !can('menu:tasks') || currentRole === 'payer_executive',
    });
    append({
      id: 'nav-care-journeys',
      label: 'Open Care Journeys',
      category: 'Navigation',
      keywords: 'care journeys transitions pathways stages',
      action: () => navigate(ROUTES.MEMBER360_LAB.CARE_JOURNEYS),
      disabled: !isAuthenticated || !can('menu:care_journeys') || currentRole === 'payer_executive',
    });
    append({
      id: 'nav-risk-intelligence',
      label: 'Open Risk Intelligence',
      category: 'Navigation',
      keywords: 'risk intelligence stratification hcc gaps',
      action: () => navigate(ROUTES.MEMBER360_LAB.RISK_INTELLIGENCE),
      disabled: !isAuthenticated || !can('menu:risk_intelligence') || currentRole === 'payer_executive',
    });
    append({
      id: 'nav-care-options',
      label: 'Open Care Options',
      category: 'Navigation',
      keywords: 'care options interventions programs referrals',
      action: () => navigate(ROUTES.MEMBER360_LAB.CARE_OPTIONS),
      disabled: !isAuthenticated || !can('menu:care_options') || currentRole === 'payer_executive',
    });
    append({
      id: 'nav-messages',
      label: 'Open Secure Messages',
      category: 'Navigation',
      keywords: 'messages inbox outreach communication',
      action: () => navigate(ROUTES.MEMBER360_LAB.MESSAGES),
      disabled: !isAuthenticated || !can('menu:messages') || currentRole === 'payer_executive',
    });
    append({
      id: 'nav-documents',
      label: 'Open Documents Vault',
      category: 'Navigation',
      keywords: 'documents clinical attachments files pdf',
      action: () => navigate(ROUTES.MEMBER360_LAB.DOCUMENTS),
      disabled: !isAuthenticated || !can('menu:documents') || currentRole === 'payer_executive',
    });
    append({
      id: 'nav-plan-performance',
      label: 'Open Plan Performance Console (Executive Dashboard)',
      category: 'Navigation',
      keywords: 'plan performance console commercial payer executive dashboard ma medicare advantage mlr pmpm',
      action: () => navigate(ROUTES.MEMBER360_LAB.PLAN_PERFORMANCE),
      disabled: !isAuthenticated || !can('menu:executive_dashboards') || !can('sub:exec_financial'),
    });
    if (isAuthenticated && can('menu:executive_dashboards') && can('sub:exec_financial')) {
      const ppTabs = [
        ['overview', 'Plan Overview', 'tab:pp_overview', 'overview kpis summary budget prior year'],
        ['fin', 'Plan Financials (PMPM)', 'tab:pp_financials', 'financials revenue pmpm part a b d sga ioi'],
        ['cost', 'Medical Cost Analytics', 'tab:pp_medical_cost', 'medical cost inpatient outpatient professional pharmacy admits'],
        ['mlr', 'Provider MLR & Benchmarks', 'tab:pp_mlr', 'provider mlr loss ratio network benchmark'],
        ['util', 'Utilization & Admits', 'tab:pp_utilization', 'utilization admits er visits readmissions snf obs'],
        ['qual', 'Quality & Star Ratings', 'tab:pp_quality', 'quality star ratings hedis cahps adherence'],
        ['risk', 'Risk Adjustment (RAF)', 'tab:pp_risk', 'risk adjustment raf hcc capture chart review ebur mbur'],
        ['defs', 'Definitions & Glossary', 'tab:pp_defs', 'definitions glossary formulas metrics'],
      ];
      ppTabs.forEach(([tabKey, tabLabel, permKey, kw]) => {
        append({
          id: `nav-pp-tab-${tabKey}`,
          label: `Plan Performance: ${tabLabel}`,
          category: 'Navigation',
          keywords: `plan performance ${tabLabel} ${kw}`,
          action: () => navigate(`${ROUTES.MEMBER360_LAB.PLAN_PERFORMANCE}?tab=${tabKey}`),
          disabled: !can(permKey),
        });
      });

      const ppData = getCurrentData();
      (ppData?.fact_entity_summary || []).forEach((ent) => {
        if (ent.level === 'market') {
          append({
            id: `pp-market-${ent.entity_id}`,
            label: `Filter Plan Performance: ${ent.entity_name} (Market)`,
            category: 'Records',
            keywords: `market ${ent.entity_name} ${ent.entity_id} plan performance filter`,
            action: () => navigate(`${ROUTES.MEMBER360_LAB.PLAN_PERFORMANCE}?market=${ent.entity_id}`),
          });
        } else if (ent.level === 'provider_group') {
          append({
            id: `pp-group-${ent.entity_id}`,
            label: `Filter Plan Performance: ${ent.entity_name} (Provider Group)`,
            category: 'Providers',
            keywords: `provider group ${ent.entity_name} ${ent.entity_id} ${ent.market_id || ''} plan performance mlr`,
            action: () =>
              navigate(
                `${ROUTES.MEMBER360_LAB.PLAN_PERFORMANCE}?market=${ent.market_id || 'all'}&group=${ent.entity_id}`
              ),
          });
        }
      });
    }
    append({
      id: 'nav-coding-worklist',
      label: 'Open Coding Worklist',
      category: 'Navigation',
      keywords: 'coding worklist hcc suspect chases v28',
      action: () => navigate(ROUTES.CODING.WORKLIST),
      disabled: !isAuthenticated || !can('menu:coding_worklist') || currentRole === 'payer_executive',
    });
    append({
      id: 'nav-providers',
      label: 'Open Providers Directory',
      category: 'Navigation',
      keywords: 'providers directory care team npi',
      action: () => navigate(ROUTES.PROVIDERS.LANDING),
      disabled: !isAuthenticated || !can('menu:provider_directory'),
    });
    append({
      id: 'nav-ride-booking',
      label: 'Open Ride Booking (NEMT)',
      category: 'Navigation',
      keywords: 'ride booking nemt transportation',
      action: () => navigate(ROUTES.RIDE_BOOKING),
      disabled: !isAuthenticated || !can('menu:ride_booking'),
    });
    append({
      id: 'nav-role-privileges',
      label: 'Open Role & Privileges Matrix',
      category: 'Admin',
      keywords: 'role privileges rbac permissions users matrix security hipaa',
      action: () => navigate(`${ROUTES.SETTINGS}#privileges`),
      disabled: !isAuthenticated || !can('menu:role_privileges'),
    });
    append({
      id: 'nav-docs',
      label: 'Browse Documentation',
      category: 'Support',
      keywords: 'docs help knowledge base',
      shortcut: 'G ?',
      action: () => navigate(ROUTES.DOCS),
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
      keywords: 'profile preferences theme settings',
      action: () => navigate(ROUTES.SETTINGS),
      disabled: !isAuthenticated || !can('menu:platform_settings'),
    });
    append({
      id: 'nav-job-center',
      label: 'View Job & Status Center',
      category: 'Navigation',
      keywords: 'jobs imports queue status logs',
      action: () => navigate(ROUTES.JOBS.STATUS_CENTER),
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

    if (can('menu:master_admin') && isEnabled('admin_console')) {
      append({
        id: 'nav-admin-console',
        label: 'Open Master Admin Console',
        category: 'Admin',
        keywords: 'admin roles permissions master console',
        action: () => navigate(ROUTES.ADMIN.MASTER),
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
    currentPath,
    location.pathname,
    can,
    currentRole,
  ]);

  useEffect(() => {
    if (!isOpen || !isAuthenticated || !token) {
      setSearchCommands([]);
      return undefined;
    }
    const term = query.trim();
    if (term.length < 2) {
      setSearchCommands([]);
      return undefined;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      const apiBase = resolveApiBase();
      const tenantKey = tenant || 'prominencehealth';
      const headers = {
        Authorization: `Bearer ${token}`,
        'X-Tenant-Key': tenantKey,
      };
      const dynamicResults = [];

      // 1. Search Members if user has Patient Roster access
      if (can('menu:patient_roster') && currentRole !== 'payer_executive') {
        try {
          const res = await fetch(
            `${apiBase}/api/member360/members?search=${encodeURIComponent(term)}&page_size=5`,
            { headers }
          );
          if (res.ok) {
            const data = await res.json();
            (data.items || []).forEach((m) => {
              const fullName = `${m.first_name || ''} ${m.last_name || ''}`.trim() || m.external_id || `Member #${m.id}`;
              dynamicResults.push({
                id: `search-member-${m.id}`,
                label: `Patient: ${fullName} (${m.external_id || `ID ${m.id}`})`,
                category: 'Records',
                keywords: `${fullName} ${m.external_id || ''} ${m.risk_tier || ''} member patient`,
                action: () => navigate(`${ROUTES.MEMBER360_LAB.MEMBER_WORKSPACE_ROOT}/${m.id}`),
              });
            });
          }
        } catch (_) {}
      }

      // 2. Search Providers if user has Provider Directory access
      if (can('menu:provider_directory')) {
        try {
          const res = await fetch(
            `${apiBase}/api/providers?q=${encodeURIComponent(term)}&limit=5`,
            { headers }
          );
          if (res.ok) {
            const data = await res.json();
            const list = Array.isArray(data) ? data : data.items || data.providers || [];
            list.slice(0, 5).forEach((p) => {
              const pName = p.name || `${p.first_name || ''} ${p.last_name || ''}`.trim() || `Provider #${p.id}`;
              dynamicResults.push({
                id: `search-provider-${p.id || p.npi || pName}`,
                label: `Provider: ${pName}${p.specialty ? ` · ${p.specialty}` : ''}`,
                category: 'Providers',
                keywords: `${pName} ${p.specialty || ''} ${p.npi || ''} provider doctor`,
                action: () => navigate(p.id ? `${ROUTES.PROVIDERS.LANDING}/${p.id}` : ROUTES.PROVIDERS.LANDING),
              });
            });
          }
        } catch (_) {}
      }

      if (!cancelled) {
        setSearchCommands(dynamicResults);
      }
    }, 180);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isOpen, query, isAuthenticated, token, tenant, can, currentRole, navigate]);

  const combinedCommands = useMemo(() => {
    if (searchCommands.length) {
      return [...searchCommands, ...dynamicCommands, ...baseCommands];
    }
    return [...dynamicCommands, ...baseCommands];
  }, [searchCommands, dynamicCommands, baseCommands]);

  const filteredCommands = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return combinedCommands;
    const tokens = term.split(/\s+/).filter(Boolean);
    return combinedCommands.filter((command) => {
      const haystack = [command.label, command.keywords, command.category]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return tokens.every((tok) => haystack.includes(tok));
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
            placeholder="Search pages, members, providers, or Plan Performance entities..."
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
                Try searching for page names, members, providers, "MLR", or "settings".
              </div>
            </div>
          )}
          {groupedCommands.map(([category, items]) => (
            <section key={category} className="command-palette__group">
              <h3>{category}</h3>
              <ul>
                {items.map((command) => {
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
