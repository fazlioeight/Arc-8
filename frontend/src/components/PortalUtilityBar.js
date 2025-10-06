// components/PortalUtilityBar.js - Shared top utility bar used across portal apps
import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { useCommandPalette } from '../context/CommandPaletteContext';
import { SAMPLE_TENANT_COMMENTS } from '../utils/sampleData';
import '../pages/portal_page/portalPage.sfdc.css';

const PortalUtilityBar = () => {
  const navigate = useNavigate();
  const {
    user,
    logout,
    hasApplicationAccess,
    availableApplications = [],
    purchasedApplications = [],
    availableTenants = [],
    tenant,
    tenantInfo,
    setTenant,
    isImpersonating,
    impersonation,
    endImpersonation,
    auditTrail = [],
    recordAuditEvent,
  } = useContext(AuthContext) || {};
  const { openPalette } = useCommandPalette();

  const [showWaffle, setShowWaffle] = useState(false);
  const [showNotif, setShowNotif] = useState(false);
  const [showUser, setShowUser] = useState(false);
  const [showTenantMenu, setShowTenantMenu] = useState(false);
  const barRef = useRef(null);

  const closeAll = () => {
    setShowWaffle(false);
    setShowNotif(false);
    setShowUser(false);
    setShowTenantMenu(false);
  };

  useEffect(() => {
    const onDocClick = (event) => {
      if (!barRef.current) return;
      if (!barRef.current.contains(event.target)) {
        closeAll();
      }
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  const applicationTiles = useMemo(
    () => [
      { key: 'portal', label: 'Nexora Portal', desc: 'Metrics & insights', icon: 'NP', color: '#0176d3', path: '/portal_page/portalPage' },
      { key: 'dashboard', label: 'Analytics Dashboard', desc: 'KPIs & RAF', icon: 'DB', color: '#a855f7', path: '/dashboard' },
      { key: 'coding', label: 'Coding Worklists', desc: 'Member reviews', icon: 'CD', color: '#0f172a', path: '/coding' },
      { key: 'ride_booking', label: 'Ride Booking', desc: 'Transportation', icon: 'RB', color: '#0ea5e9', path: '/RideBooking' },
      { key: 'docs', label: 'Docs Library', desc: 'Knowledge base', icon: 'DL', color: '#6366f1', path: '/docs' },
      { key: 'settings', label: 'Settings', desc: 'Preferences', icon: 'ST', color: '#64748b', path: '/settings' },
      { key: 'job_center', label: 'Job Center', desc: 'Logs & retry', icon: 'JC', color: '#0f766e', path: '/jobs/status-center' },
      { key: 'admin_console', label: 'Master Admin', desc: 'Roles & access', icon: 'MA', color: '#dc2626', path: '/admin/master', requiredLevel: 'admin' },
    ],
    []
  );

  const accessibleApps = useMemo(() => {
    if (!hasApplicationAccess) return [];
    const enabledKeys = new Set(
      (availableApplications && availableApplications.length)
        ? availableApplications
        : applicationTiles.map((app) => app.key)
    );
    return applicationTiles.filter((app) => {
      if (!enabledKeys.has(app.key)) return false;
      const level = app.requiredLevel || 'user';
      return hasApplicationAccess(app.key, level);
    });
  }, [applicationTiles, availableApplications, hasApplicationAccess]);

  const recentEvents = useMemo(() => (auditTrail || []).slice(0, 4), [auditTrail]);

  const jobAlerts = useMemo(() => {
    const items = [];
    const failedJob = recentEvents.find((event) => event.action === 'job.failed');
    if (failedJob) {
      items.push({
        id: failedJob.id,
        title: 'A job needs attention',
        hint: failedJob.metadata?.jobName || 'Review in Job Center',
        status: 'error',
      });
    }
    if (!failedJob && hasApplicationAccess?.('job_center')) {
      items.push({
        id: 'job-center',
        title: 'Monitor long-running jobs',
        hint: 'Check progress or download logs',
        status: 'info',
      });
    }
    const impersonationEvent = isImpersonating
      ? { id: 'impersonation', title: `Impersonating ${impersonation?.name || impersonation?.email}`, hint: 'All actions are audit logged.', status: 'warning' }
      : null;
    if (impersonationEvent) items.unshift(impersonationEvent);
    return items;
  }, [recentEvents, hasApplicationAccess, isImpersonating, impersonation]);

  const handleTenantSelect = (tenantKey) => {
    setTenant?.(tenantKey);
    setShowTenantMenu(false);
    recordAuditEvent?.('tenant.switch.via_utility', { tenant: tenantKey });
  };

  const handleCommandPalette = () => {
    closeAll();
    recordAuditEvent?.('command_palette.open', { source: 'utility_bar' });
    openPalette();
  };

  const initials = (user?.email || '?').slice(0, 1).toUpperCase();

  return (
    <>
      {isImpersonating && (
        <div className="portal-impersonation" role="status">
          <div>
            Acting as <strong>{impersonation?.name || impersonation?.email}</strong>
            <span> — all actions are recorded.</span>
          </div>
          <button
            type="button"
            onClick={() => {
              recordAuditEvent?.('impersonation.banner_exit');
              endImpersonation?.();
            }}
          >
            Return to self
          </button>
        </div>
      )}
      <div className="sfdc-utilitybar" ref={barRef}>
        <div className="sfdc-utilitybar__content">
          <div className="sfdc-utilitybar__left">
            <button
              className="sfdc-iconbutton"
              title="App launcher"
              aria-haspopup="true"
              aria-expanded={showWaffle}
              onClick={(event) => {
                event.stopPropagation();
                setShowWaffle((value) => !value);
                setShowNotif(false);
                setShowUser(false);
                setShowTenantMenu(false);
              }}
            >
              <svg viewBox="0 0 24 24"><path d="M4 4h4v4H4V4zm6 0h4v4h-4V4zm6 0h4v4h-4V4zM4 10h4v4H4v-4zm6 0h4v4h-4v-4zm6 0h4v4h-4v-4zM4 16h4v4H4v-4zm6 0h4v4h-4v-4zm6 0h4v4h-4v-4z"/></svg>
            </button>
            <button
              className="sfdc-iconbutton"
              title="Home"
              aria-label="Home"
              onClick={(event) => {
                event.stopPropagation();
                closeAll();
                navigate('/portal_page/portalPage');
              }}
            >
              <svg viewBox="0 0 24 24"><path d="M12 3l9 7h-2v9h-5v-6H10v6H5v-9H3l9-7z"/></svg>
            </button>
            <button
              className="sfdc-iconbutton"
              title="Command palette"
              aria-label="Command palette"
              onClick={(event) => {
                event.stopPropagation();
                handleCommandPalette();
              }}
            >
              <svg viewBox="0 0 24 24"><path d="M5 4h14a1 1 0 011 1v3H4V5a1 1 0 011-1zm-1 7h16a1 1 0 011 1v7H3v-7a1 1 0 011-1zm4 2v2h2v-2H8zm4 0v2h2v-2h-2z"/></svg>
              <span className="sfdc-badge">⌘K</span>
            </button>
            <button
              className="sfdc-tenantbutton"
              aria-haspopup="true"
              aria-expanded={showTenantMenu}
              onClick={(event) => {
                event.stopPropagation();
                setShowTenantMenu((value) => !value);
                setShowWaffle(false);
                setShowNotif(false);
                setShowUser(false);
              }}
            >
              <span className="sfdc-tenantbutton__label">{tenantInfo?.name || tenant}</span>
              <svg viewBox="0 0 24 24"><path d="M7 10l5 5 5-5H7z"/></svg>
            </button>
          </div>
          <div className="sfdc-utilitybar__right">
            {hasApplicationAccess?.('job_center') && (
              <button
                className="sfdc-iconbutton"
                title="Job & Status Center"
                aria-label="Job and status center"
                onClick={(event) => {
                  event.stopPropagation();
                  closeAll();
                  navigate('/jobs/status-center');
                }}
              >
                <svg viewBox="0 0 24 24"><path d="M5 4h14l1 4H4l1-4zm-1 6h16v9H4v-9zm4 2v5h2v-5H8zm4 0v5h2v-5h-2z"/></svg>
              </button>
            )}
            <button
              className="sfdc-iconbutton"
              title="Notifications"
              aria-haspopup="true"
              aria-expanded={showNotif}
              onClick={(event) => {
                event.stopPropagation();
                setShowNotif((value) => !value);
                setShowWaffle(false);
                setShowUser(false);
                setShowTenantMenu(false);
              }}
            >
              <svg viewBox="0 0 24 24"><path d="M12 22a2 2 0 002-2H10a2 2 0 002 2zm6-6V9a6 6 0 10-12 0v7L4 18v1h16v-1l-2-2z"/></svg>
            </button>
            <button
              className="sfdc-avatar"
              title="Account"
              aria-haspopup="true"
              aria-expanded={showUser}
              onClick={(event) => {
                event.stopPropagation();
                setShowUser((value) => !value);
                setShowWaffle(false);
                setShowNotif(false);
                setShowTenantMenu(false);
              }}
            >
              {initials}
            </button>
          </div>
        </div>

        {showWaffle && (
          <div className="sfdc-waffle" onClick={(event) => event.stopPropagation()}>
            <div className="sfdc-dropdown__header">Apps</div>
            <div className="sfdc-waffle__grid">
              {accessibleApps.map((app) => (
                <div key={app.key} className="sfdc-app" onClick={() => { closeAll(); navigate(app.path); }}>
                  <div className="sfdc-app__icon" style={{ background: app.color }}>{app.icon}</div>
                  <div>
                    <div className="sfdc-app__name">{app.label}</div>
                    <div className="sfdc-app__desc">{app.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {showTenantMenu && (
          <div className="sfdc-dropdown sfdc-dropdown--tenant" onClick={(event) => event.stopPropagation()}>
            <div className="sfdc-dropdown__header">Switch tenant</div>
            <div className="sfdc-dropdown__body">
              {availableTenants.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  className={`sfdc-tenantoption${option.key === tenant ? ' is-active' : ''}`}
                  onClick={() => handleTenantSelect(option.key)}
                >
                  <div className="sfdc-tenantoption__title">{option.name}</div>
                  <div className="sfdc-tenantoption__meta">{option.region || 'Unknown region'} • {option.timezone || 'Timezone TBD'}</div>
                  {SAMPLE_TENANT_COMMENTS[option.key] && (
                    <div className="sfdc-tenantoption__hint">{SAMPLE_TENANT_COMMENTS[option.key]}</div>
                  )}
                </button>
              ))}
            </div>
            <div className="sfdc-dropdown__footer">
              Need a sandbox reset? Contact support.
            </div>
          </div>
        )}

        {showNotif && (
          <div className="sfdc-dropdown sfdc-dropdown--right" onClick={(event) => event.stopPropagation()}>
            <div className="sfdc-dropdown__header">Notifications</div>
            {jobAlerts.length === 0 && (
              <div className="sfdc-dropdown__empty">No alerts. You're all caught up!</div>
            )}
            {jobAlerts.map((alert) => (
              <div key={alert.id} className={`sfdc-dropdown__item sfdc-dropdown__item--${alert.status || 'info'}`}>
                <div>
                  <div>{alert.title}</div>
                  <div className="sfdc-dropdown__hint">{alert.hint}</div>
                </div>
              </div>
            ))}
            {recentEvents.length > 0 && (
              <div className="sfdc-dropdown__section">
                <div className="sfdc-dropdown__header">Recent activity</div>
                {recentEvents.map((event) => (
                  <div key={event.id} className="sfdc-dropdown__item">
                    <div>
                      <div>{event.action}</div>
                      <div className="sfdc-dropdown__hint">{new Date(event.timestamp).toLocaleString()}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {showUser && (
          <div className="sfdc-dropdown sfdc-dropdown--right" onClick={(event) => event.stopPropagation()}>
            <div className="sfdc-dropdown__item" onClick={() => { closeAll(); navigate('/settings'); }}>
              <div>Profile & preferences</div>
            </div>
            <div className="sfdc-dropdown__item" onClick={() => { closeAll(); handleCommandPalette(); }}>
              <div>Open command palette</div>
              <div className="sfdc-dropdown__hint">⌘K</div>
            </div>
            <div className="sfdc-dropdown__item" onClick={() => { closeAll(); logout?.(); navigate('/login'); }}>
              <div>Logout</div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default PortalUtilityBar;
