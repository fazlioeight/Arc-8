import React, { useState, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import { SAMPLE_SESSION } from "../utils/sampleData";
import "../index.css";
import "./Login.sfdc.css";

const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:8000";

const Login = () => {
  const [formData, setFormData] = useState({ email: "", password: "", tenant: "demo" });
  const { login } = useContext(AuthContext);
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSsoLogin = () => {
    setError('');
    setSubmitting(true);
    setTimeout(() => {
      login({
        ...SAMPLE_SESSION,
        tenant: formData.tenant || SAMPLE_SESSION.tenant,
      });
      navigate('/portal_page/portalPage');
      setSubmitting(false);
    }, 350);
  };

  const handleSampleLogin = () => {
    setError('');
    const payload = {
      ...SAMPLE_SESSION,
      tenant: formData.tenant || SAMPLE_SESSION.tenant,
    };
    login(payload);
    navigate('/portal_page/portalPage');
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.id]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const response = await fetch(`${API_BASE}/api/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Tenant-Key": formData.tenant.trim(),
        },
        body: JSON.stringify(formData),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Login failed. Please try again.");
      }
      login(data);
      navigate("/portal_page/portalPage");
    } catch (err) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setSubmitting(false);
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
          <button type="button" className="sfdc-auth__sso" onClick={handleSsoLogin} disabled={submitting}>
            Continue with SSO
          </button>
          <div className="sfdc-auth__divider" role="presentation">
            <span>or use email</span>
          </div>
          <form onSubmit={handleSubmit} className="sfdc-form">
            <div className="sfdc-input">
              <label htmlFor="tenant">Tenant</label>
              <input
                type="text"
                id="tenant"
                value={formData.tenant}
                onChange={handleChange}
                placeholder="e.g., demo"
                required
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
            <button type="submit" className="sfdc-button_brand sfdc-auth__submit" disabled={submitting}>
              {submitting ? "Signing in..." : "Sign in"}
            </button>
            <button type="button" className="sfdc-linkbutton" onClick={handleSampleLogin}>
              Explore with sample sandbox data
            </button>
            <div className="sfdc-auth__links">
              <a href="#">Forgot password?</a>
              <span>
                Don't have an account? <a href="/pricing">See pricing</a>
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


