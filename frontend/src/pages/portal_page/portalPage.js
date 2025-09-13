// Updated portalPage.js 
import React, { useState, useEffect, useContext, useRef } from "react";
import { useNavigate } from "react-router-dom";
import "../../index.css"; // base styles
import "./portalPage.sfdc.css"; // Salesforce-like portal styles
import { AuthContext } from "../../context/AuthContext";
import D3BarChart from "../../components/D3BarChart";

const PortalDashboard = () => {
  const [data, setData] = useState({
    bur: 0,
    raf: 0,
    memberCount: 0,
    gaps: 0,
    loading: true,
    error: null,
  });
  const navigate = useNavigate();
  const { user, logout } = useContext(AuthContext);
  const [showWaffle, setShowWaffle] = useState(false);
  const [showNotif, setShowNotif] = useState(false);
  const [showUser, setShowUser] = useState(false);
  const barRef = useRef(null);

  useEffect(() => {
    // For testing without backend, use mocked data
    // Comment this out and uncomment the real fetch when you have a backend
    const mockMetrics = {
      bur: 12345,
      raf: 1.25,
      memberCount: 5000,
      gaps: 150,
    };
    setData({
      ...mockMetrics,
      loading: false,
    });

    // Real fetch (commented out for testing)
    /*
    const fetchCompanyMetrics = async () => {
      try {
        const response = await fetch("https://api.nexora.com/company-metrics", {
          method: "GET",
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          throw new Error("Failed to fetch metrics");
        }

        const metrics = await response.json();
        setData({
          bur: metrics.bur || 0,
          raf: metrics.raf || 0,
          memberCount: metrics.memberCount || 0,
          gaps: metrics.gaps || 0,
          loading: false,
        });
      } catch (err) {
        setData((prev) => ({ ...prev, loading: false, error: err.message }));
      }
    };

    fetchCompanyMetrics();
    */
  }, []);

  useEffect(() => {
    const onDocClick = (e) => {
      if (!barRef.current) return;
      if (!barRef.current.contains(e.target)) {
        setShowWaffle(false);
        setShowNotif(false);
        setShowUser(false);
      }
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  if (data.loading) {
    return <div className="loading">Loading Nexora Analytics Portal...</div>;
  }

  if (data.error) {
    return <div className="error">Error: {data.error}</div>;
  }

  const initials = (user?.email || "?").slice(0, 1).toUpperCase();
  const tenantName = user?.tenant || localStorage.getItem("companyName") || "Tenant";

  return (
    <div className="sfdc-portal">
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
            <button className="sfdc-iconbutton" title="Search" aria-label="Search" onClick={()=>navigate('/products')}>
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
              <svg viewBox="0 0 24 24"><path d="M19.14 12.94a7.994 7.994 0 000-1.88l2.03-1.58a.5.5 0 00.12-.65l-1.92-3.32a.5.5 0 00-.61-.22l-2.39.96a7.992 7.992 0 00-1.63-.94l-.36-2.54A.5.5 0 0013.98 0h-3.96a.5.5 0 00-.49.42l-.36 2.54a7.992 7.992 0 00-1.63.94l-2.39-.96a.5.5 0 00-.61.22L.62 6.41a.5.5 0 00.12.65l2.03 1.58a7.994 7.994 0 000 1.88L.74 12.1a.5.5 0 00-.12.65l1.92 3.32c.13.23.39.32.61.22l2.39-.96c.5.38 1.05.7 1.63.94l.36 2.54c.04.24.25.42.49.42h3.96c.24 0 .45-.18.49-.42l.36-2.54c.58-.24 1.13-.56 1.63-.94l2.39.96c.23.1.49.01.61-.22l1.92-3.32a.5.5 0 00-.12-.65l-2.03-1.58zM12 15.6A3.6 3.6 0 1115.6 12 3.6 3.6 0 0112 15.6z"/></svg>
            </button>
            <button
              className="sfdc-iconbutton"
              title="User menu"
              aria-haspopup="true"
              aria-expanded={showUser}
              onClick={(e)=>{ e.stopPropagation(); setShowUser((s)=>!s); setShowNotif(false); setShowWaffle(false); }}>
              <svg viewBox="0 0 24 24"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8V22h19.2v-2.8c0-3.2-6.4-4.8-9.6-4.8z"/></svg>
            </button>
            <span className="sfdc-identity__name" style={{marginLeft: 8}}>{user?.email || "Guest"}</span>
          </div>
          {showWaffle && (
            <div className="sfdc-waffle" onClick={(e)=>e.stopPropagation()}>
              <div className="sfdc-dropdown__header">Pinned Apps</div>
              <div className="sfdc-waffle__grid">
                <div className="sfdc-app" onClick={()=>navigate('/portal_page/portalPage')}>
                  <div className="sfdc-app__icon" style={{background:'#0176d3'}}>NP</div>
                  <div>
                    <div className="sfdc-app__name">Nexora Portal</div>
                    <div className="sfdc-app__desc">Metrics & insights</div>
                  </div>
                </div>
                <div className="sfdc-app" onClick={()=>navigate('/products')}>
                  <div className="sfdc-app__icon" style={{background:'#22c55e'}}>PR</div>
                  <div>
                    <div className="sfdc-app__name">Products</div>
                    <div className="sfdc-app__desc">Apps & features</div>
                  </div>
                </div>
                <div className="sfdc-app" onClick={()=>navigate('/RideBooking')}>
                  <div className="sfdc-app__icon" style={{background:'#0ea5e9'}}>RB</div>
                  <div>
                    <div className="sfdc-app__name">Ride Booking</div>
                    <div className="sfdc-app__desc">Transportation</div>
                  </div>
                </div>
                <div className="sfdc-app" onClick={()=>navigate('/dashboard')}>
                  <div className="sfdc-app__icon" style={{background:'#a855f7'}}>DB</div>
                  <div>
                    <div className="sfdc-app__name">Dashboard</div>
                    <div className="sfdc-app__desc">Analytics view</div>
                  </div>
                </div>
                <div className="sfdc-app" onClick={()=>navigate('/settings')}>
                  <div className="sfdc-app__icon" style={{background:'#64748b'}}>ST</div>
                  <div>
                    <div className="sfdc-app__name">Settings</div>
                    <div className="sfdc-app__desc">Preferences</div>
                  </div>
                </div>
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
              <div className="sfdc-dropdown__item" onClick={()=>{ logout(); navigate('/login'); }}>
                <div>Logout</div>
              </div>
            </div>
          )}
        </div>
      </div>
      <section className="sfdc-hero">
        <div className="sfdc-hero__content">
          <h1 className="sfdc-hero__title">{tenantName}</h1>
          <p className="sfdc-hero__subtitle">
            {localStorage.getItem("companyName") || "Your Company"} Portal
          </p>
        </div>
      </section>

      <main className="sfdc-grid">
        <div className="sfdc-card fade-in" style={{ animationDelay: "40ms" }}>
          <div className="sfdc-card__title">BUR</div>
          <div className="sfdc-card__value">{data.bur.toLocaleString()}</div>
          <div className="sfdc-card__hint">Business Utilization Report</div>
        </div>

        <div className="sfdc-card fade-in" style={{ animationDelay: "80ms" }}>
          <div className="sfdc-card__title">RAF</div>
          <div className="sfdc-card__value">{data.raf.toFixed(2)}</div>
          <div className="sfdc-card__hint">Risk Adjustment Factor</div>
        </div>

        <div className="sfdc-card fade-in" style={{ animationDelay: "120ms" }}>
          <div className="sfdc-card__title">Member Count</div>
          <div className="sfdc-card__value">{data.memberCount.toLocaleString()}</div>
          <div className="sfdc-card__hint">Total Active Members</div>
        </div>

        <div className="sfdc-card fade-in" style={{ animationDelay: "160ms" }}>
          <div className="sfdc-card__title">Gaps</div>
          <div className="sfdc-card__value">{data.gaps.toLocaleString()}</div>
          <div className="sfdc-card__hint">Care or Compliance Gaps</div>
        </div>

        <div className="sfdc-card sfdc-card--full slide-up" style={{ animationDelay: "200ms" }}>
          <div className="sfdc-card__title">Metrics Overview</div>
          <div className="sfdc-card__body">
            <D3BarChart
              height={260}
              data={[
                { label: "BUR", value: data.bur },
                { label: "RAF", value: data.raf },
                { label: "Members", value: data.memberCount },
                { label: "Gaps", value: data.gaps },
              ]}
            />
          </div>
        </div>
      </main>

      <footer className="sfdc-footer">
        <p>&copy; 2025 Nexora - Multi-tenant Analytics Platform</p>
      </footer>
    </div>
  );
};

export default PortalDashboard;
