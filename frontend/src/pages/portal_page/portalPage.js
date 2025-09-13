// Updated portalPage.js 
import React, { useState, useEffect, useContext } from "react";
import { useNavigate } from "react-router-dom";
import "../../index.css"; // base styles
import "./portalPage.sfdc.css"; // Salesforce-like portal styles
import { AuthContext } from "../../context/AuthContext";
import D3BarChart from "../../components/D3BarChart";
import PortalUtilityBar from "../../components/PortalUtilityBar";

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
  const { user } = useContext(AuthContext);

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

  // Utility bar interactions managed inside PortalUtilityBar

  if (data.loading) {
    return <div className="loading">Loading Nexora Analytics Portal...</div>;
  }

  if (data.error) {
    return <div className="error">Error: {data.error}</div>;
  }

  const tenantName = user?.tenant || localStorage.getItem("companyName") || "Tenant";

  return (
    <div className="sfdc-portal">
      <PortalUtilityBar />
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
