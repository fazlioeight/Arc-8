import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { submitContactForm } from '../../../services/contactService';

const Contact = () => {
  const [formData, setFormData] = useState({ name: '', email: '', subject: '', message: '' });
  const [errors, setErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  const validate = () => {
    const newErrors = {};
    if (!formData.name.trim()) newErrors.name = 'Name is required';
    if (!formData.email.trim()) newErrors.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(formData.email)) newErrors.email = 'Email is invalid';
    if (!formData.subject.trim()) newErrors.subject = 'Subject is required';
    if (!formData.message.trim()) newErrors.message = 'Message is required';
    return newErrors;
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.id]: e.target.value });
    setErrors({ ...errors, [e.target.id]: undefined });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setLoading(true);
    setSubmitError(null);
    try {
      await submitContactForm(formData);
      setSubmitted(true);
      setFormData({ name: '', email: '', subject: '', message: '' });
    } catch (err) {
      setSubmitError(err.message || 'Something went wrong. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const location = useLocation();
  useEffect(() => {
    if (location.hash) {
      const id = location.hash.replace('#', '');
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [location]);

  return (
    <div className="container py-5">
      <h1 className="text-center mb-4" id="info">Contact Us</h1>
      <p className="lead text-center">Get in touch for demos, questions, or partnerships. We're here to help.</p>
      
      {submitted && (
        <div className="alert alert-success text-center" role="alert">
          Thank you for contacting us! We'll get back to you soon.
        </div>
      )}

      {submitError && (
        <div className="alert alert-danger text-center" role="alert">
          {submitError}
        </div>
      )}

      <form onSubmit={handleSubmit} id="form" className="row g-3" aria-label="Contact form" noValidate>
        <div className="col-md-6">
          <label htmlFor="name" className="form-label">Name</label>
          <input
            type="text"
            className={`form-control${errors.name ? ' is-invalid' : ''}`}
            id="name"
            value={formData.name}
            onChange={handleChange}
            required
            aria-label="Your name"
            aria-invalid={!!errors.name}
          />
          {errors.name && <div className="invalid-feedback">{errors.name}</div>}
        </div>
        <div className="col-md-6">
          <label htmlFor="email" className="form-label">Email</label>
          <input
            type="email"
            className={`form-control${errors.email ? ' is-invalid' : ''}`}
            id="email"
            value={formData.email}
            onChange={handleChange}
            required
            aria-label="Your email"
            aria-invalid={!!errors.email}
          />
          {errors.email && <div className="invalid-feedback">{errors.email}</div>}
        </div>
        <div className="col-12">
          <label htmlFor="subject" className="form-label">Subject</label>
          <input
            type="text"
            className={`form-control${errors.subject ? ' is-invalid' : ''}`}
            id="subject"
            value={formData.subject}
            onChange={handleChange}
            required
            aria-label="Subject"
            aria-invalid={!!errors.subject}
          />
          {errors.subject && <div className="invalid-feedback">{errors.subject}</div>}
        </div>
        <div className="col-12">
          <label htmlFor="message" className="form-label">Message</label>
          <textarea
            className={`form-control${errors.message ? ' is-invalid' : ''}`}
            id="message"
            rows="5"
            value={formData.message}
            onChange={handleChange}
            required
            aria-label="Message"
            aria-invalid={!!errors.message}
          />
          {errors.message && <div className="invalid-feedback">{errors.message}</div>}
        </div>
        <div className="col-12 text-center">
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? (
              <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
            ) : null}
            Send Message
          </button>
        </div>
      </form>

      <footer className="bg-dark text-white text-center py-3 mt-5">
        <p>
          &copy; 2025 Nexora Lab. All rights reserved. |{' '}
          <a href="#" className="text-white">Privacy Policy</a> |{' '}
          <a href="#" className="text-white">Terms of Service</a>
        </p>
      </footer>
    </div>
  );
};

export default Contact;
// ...existing
