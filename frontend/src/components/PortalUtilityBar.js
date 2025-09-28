// components/PortalUtilityBar.js - Shared top utility bar used across portal apps
import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import '../pages/portal_page/portalPage.sfdc.css';

const PortalUtilityBar = () => {
  const navigate = useNavigate();
  const { user, logout, hasApplicationAccess } = useContext(AuthContext) || {};
  const [showWaffle, setShowWaffle] = useState(false);
  const [showNotif, setShowNotif] = useState(false);
  const [showUser, setShowUser] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef(null);
  const barRef = useRef(null);

  useEffect(() => {
    const onDocClick = (e) => {
      if (!barRef.current) return;
      if (!barRef.current.contains(e.target)) {
        setShowWaffle(false);
        setShowNotif(false);
        setShowUser(false);
      }
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  useEffect(() => {
    if (showSearch && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [showSearch]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') setShowSearch(false);
    };
    if (showSearch) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showSearch]);

  const applicationTiles = useMemo(() => ([
    { key: 'portal', label: 'Nexora Portal', desc: 'Metrics & insights', icon: 'NP', color: '#0176d3', path: '/portal_page/portalPage' },
    { key: 'coding', label: 'Coding Worklists', desc: 'Member reviews', icon: 'CD', color: '#0f172a', path: '/coding' },
    { key: 'ride_booking', label: 'Ride Booking', desc: 'Transportation', icon: 'RB', color: '#0ea5e9', path: '/RideBooking' },
    { key: 'dashboard', label: 'Dashboard', desc: 'Analytics view', icon: 'DB', color: '#a855f7', path: '/dashboard' },
    { key: 'docs', label: 'Docs Library', desc: 'Knowledge base', icon: 'DL', color: '#6366f1', path: '/docs' },
    { key: 'settings', label: 'Settings', desc: 'Preferences', icon: 'ST', color: '#64748b', path: '/settings' },
    { key: 'admin_console', label: 'Master Admin', desc: 'Roles & access', icon: 'MA', color: '#dc2626', path: '/admin/master' },
  ]), []);

  const accessibleApps = useMemo(() => {
    return applicationTiles.filter((app) => {
      if (!hasApplicationAccess) return false;
      if (app.key === 'admin_console') {
        return hasApplicationAccess(app.key, 'admin');
      }
      return hasApplicationAccess(app.key);
    });
  }, [applicationTiles, hasApplicationAccess]);

  const initials = (user?.email || '?').slice(0, 1).toUpperCase();

  return (
    <>
      <div className="sfdc-utilitybar" ref={barRef}>
        <div className="sfdc-utilitybar__content">
          <div className="sfdc-utilitybar__left">
            <button
              className="sfdc-iconbutton"
              title="App Launcher"
              aria-haspopup="true"
              aria-expanded={showWaffle}
              onClick={(e) => { e.stopPropagation(); setShowWaffle((s) => !s); setShowNotif(false); setShowUser(false); }}
            >
              <svg viewBox="0 0 24 24"><path d="M4 4h4v4H4V4zm6 0h4v4h-4V4zm6 0h4v4h-4V4zM4 10h4v4H4v-4zm6 0h4v4h-4v-4zm6 0h4v4h-4v-4zM4 16h4v4H4v-4zm6 0h4v4h-4v-4zm6 0h4v4h-4v-4z"/></svg>
            </button>
            <span className="sfdc-avatar" aria-hidden>{initials}</span>
          </div>
          <div className="sfdc-utilitybar__right">
            <button className="sfdc-iconbutton" title="Search" aria-label="Search" onClick={(e)=>{ e.stopPropagation(); setShowSearch(true); setShowWaffle(false); setShowNotif(false); setShowUser(false); }}>
              <svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79L20 21.5 21.5 20l-6-6zM10 14a4 4 0 110-8 4 4 0 010 8z"/></svg>
            </button>
            <button
              className="sfdc-iconbutton"
              title="Notifications"
              aria-haspopup="true"
              aria-expanded={showNotif}
              onClick={(e)=>{ e.stopPropagation(); setShowNotif((s)=>!s); setShowWaffle(false); setShowUser(false); }}>
              <svg viewBox="0 0 24 24"><path d="M12 22a2 2 0 002-2H10a2 2 0 002 2zm6-6V9a6 6 0 10-12 0v7L4 18v1h16v-1l-2-2z"/></svg>
            </button>
            <button className="sfdc-iconbutton" title="Settings" aria-label="Settings" onClick={()=>navigate('/settings')}>
              <svg viewBox="0 0 24 24"><path d="M19.14 12.94a7.994 7.994 0 000-1.88l2.03-1.58a.5.5 0 00.12-.65l-1.92-3.32a.5.5 0 00-.61.22l-2.39.96a7.992 7.992 0 00-1.63-.94l-.36-2.54A.5.5 0 0013.98 0h-3.96a.5.5 0 00-.49.42l-.36 2.54a7.992 7.992 0 00-1.63.94l-2.39-.96a.5.5 0 00-.61.22L.62 6.41a.5.5 0 00.12.65l2.03 1.58a7.994 7.994 0 000 1.88L.74 12.1a.5.5 0 00-.12.65l1.92 3.32c.13.23.39.32.61.22l2.39-.96c.5.38 1.05.7 1.63.94l.36 2.54c.04.24.25.42.49.42h3.96c.24 0 .45-.18.49-.42l.36-2.54c.58-.24 1.13-.56 1.63-.94l2.39.96c.23.1.49.01.61-.22l1.92-3.32a.5.5 0 00-.12-.65l-2.03-1.58zM12 15.6A3.6 3.6 0 1115.6 12 3.6 3.6 0 0112 15.6z"/></svg>
            </button>
            <button
              className="sfdc-iconbutton"
              title="User menu"
              aria-haspopup="true"
              aria-expanded={showUser}
              onClick={(e)=>{ e.stopPropagation(); setShowUser((s)=>!s); setShowNotif(false); setShowWaffle(false); }}>
              <svg viewBox="0 0 24 24"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8V22h19.2v-2.8c0-3.2-6.4-4.8-9.6-4.8z"/></svg>
            </button>
            <span className="sfdc-identity__name" style={{marginLeft: 8}}>{user?.email || 'Guest'}</span>
          </div>

          {showWaffle && (
            <div className="sfdc-waffle" onClick={(e)=>e.stopPropagation()}>
              <div className="sfdc-dropdown__header">Pinned Apps</div>
              <div className="sfdc-waffle__grid">
                {accessibleApps.map((app) => (
                  <div key={app.key} className="sfdc-app" onClick={() => navigate(app.path)}>
                    <div className="sfdc-app__icon" style={{background: app.color}}>{app.icon}</div>
                    <div>
                      <div className="sfdc-app__name">{app.label}</div>
                      <div className="sfdc-app__desc">{app.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {showNotif && (
            <div className="sfdc-dropdown" style={{right: 108}} onClick={(e)=>e.stopPropagation()}>
              <div className="sfdc-dropdown__header">Notifications</div>
              <div className="sfdc-dropdown__item">
                <svg viewBox="0 0 24 24" style={{width:16,height:16}}><circle cx="12" cy="12" r="6"/></svg>
                <div>
                  <div>System update scheduled</div>
                  <div className="sfdc-dropdown__hint">Tonight at 11:00 PM</div>
                </div>
              </div>
              <div className="sfdc-dropdown__item">
                <svg viewBox="0 0 24 24" style={{width:16,height:16}}><path d="M12 2l3 7h7l-5.5 4.1L18 20l-6-4-6 4 1.5-6.9L2 9h7z"/></svg>
                <div>
                  <div>New insights available</div>
                  <div className="sfdc-dropdown__hint">View in Dashboard</div>
                </div>
              </div>
            </div>
          )}

          {showUser && (
            <div className="sfdc-dropdown" onClick={(e)=>e.stopPropagation()}>
              <div className="sfdc-dropdown__item" onClick={()=>navigate('/settings')}>
                <div>Profile</div>
              </div>
              <div className="sfdc-dropdown__item" onClick={()=>navigate('/settings')}>
                <div>Preferences</div>
              </div>
              <div className="sfdc-dropdown__item" onClick={()=>{ logout && logout(); navigate('/login'); }}>
                <div>Logout</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {showSearch && (
        <div className="sfdc-overlay" role="dialog" aria-modal="true" onClick={()=>setShowSearch(false)}>
          <div className="sfdc-overlay__panel" onClick={(e)=>e.stopPropagation()}>
            <div className="sfdc-overlay__header">
              <input
                ref={searchInputRef}
                className="sfdc-overlay__input"
                type="text"
                placeholder="Search Nexora Analytics Docs"
                value={searchQuery}
                onChange={(e)=>setSearchQuery(e.target.value)}
                onKeyDown={(e)=>{ if (e.key === 'Enter') { navigate(`/docs?q=${encodeURIComponent(searchQuery)}`); setShowSearch(false); } }}
              />
              <button
                className="sfdc-button_brand"
                onClick={()=>{ navigate(`/docs?q=${encodeURIComponent(searchQuery)}`); setShowSearch(false); }}
              >Search</button>
              <button className="sfdc-iconbutton" aria-label="Close search" onClick={()=>setShowSearch(false)}>
                <svg viewBox="0 0 24 24"><path d="M18.3 5.7L12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3l6.3 6.3 6.3-6.3z"/></svg>
              </button>
            </div>
            <div className="sfdc-overlay__body">
              <div className="sfdc-overlay__hint">Type a query and press Enter to search docs.</div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default PortalUtilityBar;


