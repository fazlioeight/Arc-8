// pages/Signup.js - Converted from signup.html with form state
import React, { useState } from 'react';

const Signup = () => {
  const [formData, setFormData] = useState({ name: '', email: '', password: '', confirmPassword: '' });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.id]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (formData.password !== formData.confirmPassword) {
      alert('Passwords do not match');
      return;
    }
    // Add API call here, e.g., axios.post('/api/signup', formData)
    console.log('Signup submitted:', formData);
  };

  return (
    <div className="container py-5" style={{ backgroundColor: '#f8f9fa' }}>
      <div className="signup-form" style={{ maxWidth: '400px', margin: 'auto', padding: '40px', background: 'white', borderRadius: '8px', boxShadow: '0 0 10px rgba(0,0,0,0.1)' }}>
        <h2 className="text-center mb-4">Create a New Account</h2>
        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <label htmlFor="name" className="form-label">Full Name</label>
            <input type="text" className="form-control" id="name" value={formData.name} onChange={handleChange} required />
          </div>
          <div className="mb-3">
            <label htmlFor="email" className="form-label">Email Address</label>
            <input type="email" className="form-control" id="email" value={formData.email} onChange={handleChange} required />
          </div>
          <div className="mb-3">
            <label htmlFor="password" className="form-label">Password</label>
            <input type="password" className="form-control" id="password" value={formData.password} onChange={handleChange} required />
          </div>
          <div className="mb-3">
            <label htmlFor="confirm-password" className="form-label">Confirm Password</label>
            <input type="password" className="form-control" id="confirmPassword" value={formData.confirmPassword} onChange={handleChange} required />
          </div>
          <div className="text-center">
            <button type="submit" className="btn btn-primary w-100">Sign Up</button>
          </div>
          <p className="text-center mt-3">Already have an account? <a href="/login">Login</a></p>
        </form>
      </div>

      <footer className="bg-dark text-white text-center py-3 mt-auto">
        <p>&copy; 2025 Nexora Analytics. All rights reserved. | <a href="#" className="text-white">Privacy Policy</a> | <a href="#" className="text-white">Terms of Service</a></p>
      </footer>
    </div>
  );
};

export default Signup;