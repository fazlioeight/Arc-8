// pages/Contact.js - Converted from contact.html
import React, { useState } from 'react';

const Contact = () => {
  const [formData, setFormData] = useState({ name: '', email: '', subject: '', message: '' });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.id]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // Add API call here, e.g., axios.post('/api/contact', formData)
    console.log('Form submitted:', formData);
  };

  return (
    <div className="container py-5">
      <h1 className="text-center mb-4">Contact Us</h1>
      <p className="lead text-center">Get in touch for demos, questions, or partnerships. We're here to help.</p>
      
      <form onSubmit={handleSubmit} className="row g-3">
        <div className="col-md-6">
          <label htmlFor="name" className="form-label">Name</label>
          <input type="text" className="form-control" id="name" value={formData.name} onChange={handleChange} required />
        </div>
        <div className="col-md-6">
          <label htmlFor="email" className="form-label">Email</label>
          <input type="email" className="form-control" id="email" value={formData.email} onChange={handleChange} required />
        </div>
        <div className="col-12">
          <label htmlFor="subject" className="form-label">Subject</label>
          <input type="text" className="form-control" id="subject" value={formData.subject} onChange={handleChange} required />
        </div>
        <div className="col-12">
          <label htmlFor="message" className="form-label">Message</label>
          <textarea className="form-control" id="message" rows="5" value={formData.message} onChange={handleChange} required />
        </div>
        <div className="col-12 text-center">
          <button type="submit" className="btn btn-primary">Send Message</button>
        </div>
      </form>

      <footer className="bg-dark text-white text-center py-3 mt-5">
        <p>&copy; 2025 Nexora Analytics. All rights reserved. | <a href="#" className="text-white">Privacy Policy</a> | <a href="#" className="text-white">Terms of Service</a></p>
      </footer>
    </div>
  );
};

export default Contact;