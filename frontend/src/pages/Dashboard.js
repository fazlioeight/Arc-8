// pages/Dashboard.js (enhanced example)
import React, { useContext, useEffect, useState } from "react";
import { AuthContext } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import "../index.css";
import "./portal_page/portalPage.sfdc.css";
import PortalUtilityBar from "../components/PortalUtilityBar";

const Dashboard = () => {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();
  const [analyticsData, setAnalyticsData] = useState(null); // e.g., risk insights

  useEffect(() => {
    if (!user) {
      navigate("/login");
      return;
    }
    // Fetch data from Python backend
    const fetchData = async () => {
      try {
        const response = await axios.get(
          `${process.env.REACT_APP_API_URL}/api/analytics/dashboard`,
          {
            headers: {
              Authorization: `Bearer ${localStorage.getItem("authToken")}`,
            },
          }
        );
        setAnalyticsData(response.data);
      } catch (err) {
        console.error("Error fetching dashboard data:", err);
      }
    };
    fetchData();
  }, [user, navigate]);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="sfdc-portal">
      {user && <PortalUtilityBar />}
      <section className="sfdc-hero">
        <div className="sfdc-hero__content">
          <h1 className="sfdc-hero__title">Dashboard</h1>
          <p className="sfdc-hero__subtitle">Your personalized analytics</p>
        </div>
      </section>
      <main className="sfdc-grid">
        {analyticsData ? (
          <>
            <div className="sfdc-card">
              <div className="sfdc-card__title">Risk Overview</div>
              <div className="sfdc-card__value">High-risk: {analyticsData.highRiskCount}</div>
              <div className="sfdc-card__hint">Based on latest scoring</div>
            </div>
            <div className="sfdc-card">
              <div className="sfdc-card__title">Members</div>
              <div className="sfdc-card__value">{analyticsData.memberCount ?? '—'}</div>
              <div className="sfdc-card__hint">Active population</div>
            </div>
            <div className="sfdc-card sfdc-card--full">
              <div className="sfdc-card__title">Notes</div>
              <p className="sfdc-card__body">Charts and deep-dive views coming soon.</p>
            </div>
          </>
        ) : (
          <div className="sfdc-card sfdc-card--full">
            <div className="sfdc-card__title">Loading</div>
            <p className="sfdc-card__body">Fetching your analytics data...</p>
          </div>
        )}
        <div className="sfdc-card sfdc-card--full">
          <button onClick={handleLogout} className="sfdc-button_brand">Logout</button>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
