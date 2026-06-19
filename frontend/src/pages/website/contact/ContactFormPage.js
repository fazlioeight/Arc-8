import React, { useState } from 'react';
import { submitContactForm } from '../../../services/contactService';

const ContactFormPage = () => {
  const [formData, setFormData] = useState({ name: '', email: '', message: '' });
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.email.trim() || !formData.message.trim()) {
      setError('Please fill in your name, email, and message.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await submitContactForm(formData);
      setSubmitted(true);
      setFormData({ name: '', email: '', message: '' });
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container py-5">
      <h1>Contact Form</h1>
      <p>Responses typically within 1–2 business days.</p>

      {submitted && (
        <div className="alert alert-success" role="alert">
          Thanks! Your message has been sent — we'll be in touch soon.
        </div>
      )}
      {error && (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}

      <form className="row g-3 mt-2" onSubmit={handleSubmit} noValidate>
        <div className="col-md-6">
          <label className="form-label" htmlFor="cf-name">Name</label>
          <input
            id="cf-name"
            name="name"
            className="form-control"
            placeholder="Jane Doe"
            value={formData.name}
            onChange={handleChange}
            required
          />
        </div>
        <div className="col-md-6">
          <label className="form-label" htmlFor="cf-email">Email</label>
          <input
            id="cf-email"
            name="email"
            type="email"
            className="form-control"
            placeholder="jane@example.com"
            value={formData.email}
            onChange={handleChange}
            required
          />
        </div>
        <div className="col-12">
          <label className="form-label" htmlFor="cf-message">Message</label>
          <textarea
            id="cf-message"
            name="message"
            className="form-control"
            rows={4}
            placeholder="Hello!"
            value={formData.message}
            onChange={handleChange}
            required
          />
        </div>
        <div className="col-12">
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? 'Sending…' : 'Send'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ContactFormPage;
