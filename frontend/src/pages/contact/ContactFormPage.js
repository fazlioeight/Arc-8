import React from 'react';

const ContactFormPage = () => (
  <div className="container py-5">
    <h1>Contact Form</h1>
    <p>Random note: responses typically within 1–2 business days.</p>
    <form className="row g-3 mt-2">
      <div className="col-md-6">
        <label className="form-label">Name</label>
        <input className="form-control" placeholder="Jane Doe" />
      </div>
      <div className="col-md-6">
        <label className="form-label">Email</label>
        <input type="email" className="form-control" placeholder="jane@example.com" />
      </div>
      <div className="col-12">
        <label className="form-label">Message</label>
        <textarea className="form-control" rows={4} placeholder="Hello!" />
      </div>
      <div className="col-12">
        <button className="btn btn-primary" type="button">Send</button>
      </div>
    </form>
  </div>
);

export default ContactFormPage;

