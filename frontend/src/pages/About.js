// pages/About.js - Converted from about.html
import React from 'react';

const About = () => (
  <div className="container py-5">
    <h1 className="text-center mb-4">About Nexora Analytics</h1>
    <p className="lead text-center">We are a healthcare tech startup dedicated to providing advanced analytics for payer groups to achieve healthier member outcomes.</p>
    
    <section className="mb-5">
      <h2>Our Mission</h2>
      <p>To empower payers with data-driven insights on capitation, costs, and risks, fostering value-based care that improves lives and reduces inefficiencies.</p>
    </section>
    
    <section className="mb-5">
      <h2>Our Values</h2>
      <ul>
        <li>Innovation in analytics and AI</li>
        <li>Commitment to data security and HIPAA compliance</li>
        <li>Focus on user-centered design for seamless experiences</li>
        <li>Partnerships for long-term success</li>
      </ul>
    </section>
    
    <section>
      <h2>Our Team</h2>
      <div className="row">
        <div className="col-md-4">
          <h4>Jane Doe, CEO</h4>
          <p>20+ years in healthcare analytics.</p>
        </div>
        <div className="col-md-4">
          <h4>John Smith, CTO</h4>
          <p>Expert in AI and data platforms.</p>
        </div>
        <div className="col-md-4">
          <h4>Emily Johnson, CMO</h4>
          <p>Specialist in payer strategies.</p>
        </div>
      </div>
    </section>

    <footer className="bg-dark text-white text-center py-3 mt-5">
      <p>&copy; 2025 Nexora Analytics. All rights reserved. | <a href="#" className="text-white">Privacy Policy</a> | <a href="#" className="text-white">Terms of Service</a></p>
    </footer>
  </div>
);

export default About;