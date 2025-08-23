// pages/Login.js - Converted from login.html with form state
import React, { useState } from "react";

const Login = () => {
  const [formData, setFormData] = useState({ email: "", password: "" });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.id]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Add API call here, e.g., axios.post('/api/login', formData)
    console.log("Login submitted:", formData);
    try {
      const response = await fetch("http://localhost:8000/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await response.json();
      if (response.ok) {
        // Handle successful login (e.g., save JWT, redirect)
        console.log("Login success:", data);
      } else {
        // Handle error (e.g., show message)
        console.error("Login failed:", data);
      }
    } catch (error) {
      console.error("Network error:", error);
    }
  };

  return (
    <div className="container py-5" style={{ backgroundColor: "#f8f9fa" }}>
      <div
        className="login-form"
        style={{
          maxWidth: "400px",
          margin: "auto",
          padding: "40px",
          background: "white",
          borderRadius: "8px",
          boxShadow: "0 0 10px rgba(0,0,0,0.1)",
        }}
      >
        <h2 className="text-center mb-4">Login to Your Account</h2>
        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <label htmlFor="email" className="form-label">
              Email Address
            </label>
            <input
              type="email"
              className="form-control"
              id="email"
              value={formData.email}
              onChange={handleChange}
              required
            />
          </div>
          <div className="mb-3">
            <label htmlFor="password" className="form-label">
              Password
            </label>
            <input
              type="password"
              className="form-control"
              id="password"
              value={formData.password}
              onChange={handleChange}
              required
            />
          </div>
          <div className="text-center">
            <button type="submit" className="btn btn-primary w-100">
              Login
            </button>
          </div>
          <p className="text-center mt-3">
            <a href="#">Forgot Password?</a>
          </p>
          <p className="text-center">
            Don't have an account? <a href="/signup">Sign Up</a>
          </p>
        </form>
      </div>

      <footer className="bg-dark text-white text-center py-3 mt-auto">
        <p>
          &copy; 2025 Nexora Analytics. All rights reserved. |{" "}
          <a href="#" className="text-white">
            Privacy Policy
          </a>{" "}
          |{" "}
          <a href="#" className="text-white">
            Terms of Service
          </a>
        </p>
      </footer>
    </div>
  );
};

export default Login;
