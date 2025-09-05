import React, { useState, useEffect } from "react";
import "./PortalDashboard.css"; // Assuming a separate CSS file for styling

const PortalDashboard = () => {
  const [data, setData] = useState({
    bur: 0,
    raf: 0,
    memberCount: 0,
    gaps: 0,
    // Additional details can be added here, e.g., trends, charts data, etc.
    loading: true,
    error: null,
  });

  useEffect(() => {
    // Fetch data from the backend API after user authentication
    // Assuming the backend provides an endpoint like /api/company-metrics
    // This would be protected by JWT or session from login
    // Multi-tenant: The backend should resolve the company based on user token
    const fetchCompanyMetrics = async () => {
      try {
        const response = await fetch("https://api.nexora.com/company-metrics", {
          method: "GET",
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`, // Assuming token stored after login
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
  }, []);

  if (data.loading) {
    return <div className="loading">Loading Nexora Analytics Portal...</div>;
  }

  if (data.error) {
    return <div className="error">Error: {data.error}</div>;
  }

  return (
    <div className="portal-dashboard">
      <header className="dashboard-header">
        <h1>Welcome to Nexora Analytics Portal</h1>
        <p>
          Dashboard for {localStorage.getItem("companyName") || "Your Company"}
        </p>{" "}
        {/* Assuming company name stored after login */}
      </header>

      <main className="metrics-grid">
        <div className="metric-card">
          <h2>BUR</h2>
          <p className="metric-value">{data.bur.toLocaleString()}</p>
          <small>Business Utilization Report</small>
        </div>

        <div className="metric-card">
          <h2>RAF</h2>
          <p className="metric-value">{data.raf.toFixed(2)}</p>
          <small>Risk Adjustment Factor</small>
        </div>

        <div className="metric-card">
          <h2>Member Count</h2>
          <p className="metric-value">{data.memberCount.toLocaleString()}</p>
          <small>Total Active Members</small>
        </div>

        <div className="metric-card">
          <h2>Gaps</h2>
          <p className="metric-value">{data.gaps.toLocaleString()}</p>
          <small>Care or Compliance Gaps</small>
        </div>

        {/* Additional details section - can expand with charts using libraries like Recharts or Chart.js */}
        <div className="details-section">
          <h3>More Details</h3>
          <p>
            Here you can add charts, trends, historical data, or drill-down
            reports.
          </p>
          {/* Example: Integrate a chart component */}
          {/* <ChartComponent data={additionalData} /> */}
        </div>
      </main>

      <footer className="dashboard-footer">
        <p>&copy; 2025 Nexora. Multi-tenant Analytics Platform.</p>
      </footer>
    </div>
  );
};

export default PortalDashboard;
