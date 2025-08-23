// pages/Dashboard.js (enhanced example)
import React, { useContext, useEffect, useState } from "react";
import { AuthContext } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import axios from "axios";

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
    <div className="container py-5">
      <h1>Welcome, {user?.name}!</h1>
      <p>Your personalized analytics dashboard.</p>
      {analyticsData ? (
        <div>
          {/* Render data, e.g., charts or tables */}
          <h3>Risk Overview</h3>
          <p>High-risk members: {analyticsData.highRiskCount}</p>
          {/* Add more UI elements */}
        </div>
      ) : (
        <p>Loading data...</p>
      )}
      <button onClick={handleLogout} className="btn btn-danger mt-3">
        Logout
      </button>
    </div>
  );
};

export default Dashboard;
