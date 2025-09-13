// pages/Signup.js - Converted from signup.html with form state
import React, { useState } from "react";
import "../index.css";
import "./Login.sfdc.css";

const Signup = () => {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.id]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (formData.password !== formData.confirmPassword) {
      alert("Passwords do not match");
      return;
    }
    // Add API call here, e.g., axios.post('/api/signup', formData)
    console.log("Signup submitted:", formData);
  };

  return (
    <div className="sfdc-auth">
      <section className="sfdc-auth__hero">
        <div className="sfdc-auth__heroContent">
          <div className="sfdc-auth__brand">Nexora Analytics</div>
          <div className="sfdc-auth__blurb">Create your account</div>
        </div>
      </section>

      <main className="sfdc-auth__wrap">
        <div className="sfdc-auth__card fade-in" style={{ animationDelay: "60ms" }}>
          <h2 className="sfdc-auth__title">Sign up</h2>
          <form onSubmit={handleSubmit} className="sfdc-form">
            <div className="sfdc-input">
              <label htmlFor="name">Full name</label>
              <input
                type="text"
                id="name"
                value={formData.name}
                onChange={handleChange}
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
            <div className="sfdc-input">
              <label htmlFor="confirmPassword">Confirm password</label>
              <input
                type="password"
                id="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                required
              />
            </div>
            <button type="submit" className="sfdc-button_brand">Create account</button>
            <div className="sfdc-auth__links">
              <span>
                Already have an account? <a href="/login">Login</a>
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

export default Signup;
