import React, { useState, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext"; // Adjust path if needed
import "../index.css";
import "./Login.sfdc.css";

const Login = () => {
  const [formData, setFormData] = useState({ email: "", password: "", tenant: "demo" });
  const { login } = useContext(AuthContext);
  const navigate = useNavigate();
  const [error, setError] = useState("");

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.id]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    // Dummy login: username 'admin', password 'admin'
    if (
      formData.email === "admin@admin.com" &&
      formData.password === "admin"
    ) {
      login({ email: "admin@admin.com", token: "dummy-token", tenant: formData.tenant || 'demo' });
      navigate("../portal_page/portalPage");
      return;
    }

    try {
      const response = await fetch("http://localhost:8000/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await response.json();
      if (response.ok) {
        login(data); // Call login from context
        navigate("/portal_page/portalPage"); // Redirect after login
      } else {
        setError(data.detail || "Login failed. Please try again.");
      }
    } catch (error) {
      setError("Network error. Please try again.");
    }
  };

  return (
    <div className="sfdc-auth">
      <section className="sfdc-auth__hero">
        <div className="sfdc-auth__heroContent">
          <div className="sfdc-auth__brand">Nexora Analytics</div>
          <div className="sfdc-auth__blurb">Welcome back. Sign in to continue.</div>
        </div>
      </section>

      <main className="sfdc-auth__wrap">
        <div className="sfdc-auth__card fade-in" style={{ animationDelay: "60ms" }}>
          <h2 className="sfdc-auth__title">Sign in</h2>
          <form onSubmit={handleSubmit} className="sfdc-form">
            <div className="sfdc-input">
              <label htmlFor="tenant">Tenant</label>
              <input
                type="text"
                id="tenant"
                value={formData.tenant}
                onChange={handleChange}
                placeholder="e.g., demo"
              />
            </div>
            <div className="sfdc-input">
              <label htmlFor="email">Email address</label>
              <input
                type="email"
                id="email"
                value={formData.email}
                onChange={handleChange}
                required
              />
            </div>
            <div className="sfdc-input">
              <label htmlFor="password">Password</label>
              <input
                type="password"
                id="password"
                value={formData.password}
                onChange={handleChange}
                required
              />
            </div>
            {error && (
              <div className="sfdc-error" role="alert">{error}</div>
            )}
            <button type="submit" className="sfdc-button_brand sfdc-auth__submit">
              Sign in
            </button>
            <div className="sfdc-auth__links">
              <a href="#">Forgot password?</a>
              <span>
                Don't have an account? <a href="/signup">Sign up</a>
              </span>
            </div>
          </form>
        </div>
      </main>

      <footer className="sfdc-auth__footer">
        <p>&copy; 2025 Nexora Analytics</p>
      </footer>
    </div>
  );
};

export default Login;
