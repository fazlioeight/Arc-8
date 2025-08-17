// pages/Home.js - Converted from the EY-inspired index.html
import React from 'react';

const Home = () => (
  <div>
    <section className="hero" style={{
      backgroundColor: '#e9f7ff',
      backgroundImage: 'linear-gradient(rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0.5)), url("placeholder-hero-image.jpg")',
      backgroundSize: 'cover',
      color: 'white',
      textAlign: 'center',
      padding: '150px 20px'
    }}>
      <div className="container">
        <h1 style={{ fontSize: '3rem', fontWeight: 'bold' }}>Data and Decision Intelligence for Healthcare</h1>
        <p style={{ fontSize: '1.5rem' }}>Unlock the power of analytics to drive healthier outcomes, optimize costs, and manage risks in value-based care.</p>
        <a href="/contact" className="btn cta-btn btn-lg me-2" style={{ backgroundColor: '#007bff', color: 'white' }}>Request a Demo</a>
        <a href="/signup" className="btn btn-outline-light btn-lg">Get Started</a>
      </div>
    </section>

    <section className="container py-5">
      <h2 className="section-title text-center mb-4" style={{ fontWeight: 'bold', color: '#004080' }}>Our Analytics Platform</h2>
      <p className="text-center lead mb-5">A unifying solution for payer groups to harness data, AI, and insights for better decision-making in healthcare.</p>
      <div className="row">
        <div className="col-md-4">
          <div className="card p-3" style={{ border: 'none', boxShadow: '0 4px 8px rgba(0,0,0,0.1)' }}>
            <h4>Risk Management</h4>
            <p>Advanced tools for predictive risk modeling and member stratification.</p>
            <a href="/products" className="btn cta-btn" style={{ backgroundColor: '#007bff', color: 'white' }}>Learn More</a>
          </div>
        </div>
        <div className="col-md-4">
          <div className="card p-3" style={{ border: 'none', boxShadow: '0 4px 8px rgba(0,0,0,0.1)' }}>
            <h4>Cost Optimization</h4>
            <p>Data-driven analysis to reduce capitation costs and improve efficiency.</p>
            <a href="/products" className="btn cta-btn" style={{ backgroundColor: '#007bff', color: 'white' }}>Learn More</a>
          </div>
        </div>
        <div className="col-md-4">
          <div className="card p-3" style={{ border: 'none', boxShadow: '0 4px 8px rgba(0,0,0,0.1)' }}>
            <h4>Health Outcomes</h4>
            <p>Insights to enhance member health through personalized interventions.</p>
            <a href="/products" className="btn cta-btn" style={{ backgroundColor: '#007bff', color: 'white' }}>Learn More</a>
          </div>
        </div>
      </div>
    </section>

    <section className="bg-light py-5">
      <div className="container">
        <h2 className="section-title text-center mb-4" style={{ fontWeight: 'bold', color: '#004080' }}>Our Latest Thinking</h2>
        <p className="text-center lead mb-5">Explore insights on healthcare analytics, AI in value-based care, and industry trends.</p>
        <div className="row">
          <div className="col-md-4">
            <div className="card">
              <div className="card-body">
                <h5>AI Evolution in Healthcare</h5>
                <p>Empowering payers with generative AI for better risk assessment.</p>
                <a href="/insights" className="btn cta-btn" style={{ backgroundColor: '#007bff', color: 'white' }}>Read More</a>
              </div>
            </div>
          </div>
          <div className="col-md-4">
            <div className="card">
              <div className="card-body">
                <h5>Data Readiness for Payers</h5>
                <p>How to build a robust data foundation for decision intelligence.</p>
                <a href="/insights" className="btn cta-btn" style={{ backgroundColor: '#007bff', color: 'white' }}>Read More</a>
              </div>
            </div>
          </div>
          <div className="col-md-4">
            <div className="card">
              <div className="card-body">
                <h5>Ethical AI in Health Analytics</h5>
                <p>Ensuring compliance and trust in AI-driven healthcare solutions.</p>
                <a href="/insights" className="btn cta-btn" style={{ backgroundColor: '#007bff', color: 'white' }}>Read More</a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section className="container py-5">
      <h2 className="section-title text-center mb-4" style={{ fontWeight: 'bold', color: '#004080' }}>Case Studies</h2>
      <p className="text-center lead mb-5">See how we're helping payer groups achieve transformative results.</p>
      <div className="row">
        <div className="col-md-6">
          <div className="card mb-4">
            <div className="card-body">
              <h5>How We Helped a Major Payer Reduce Costs by 15%</h5>
              <p>Using our platform to optimize capitation and risk models.</p>
              <a href="/contact" className="btn cta-btn" style={{ backgroundColor: '#007bff', color: 'white' }}>Find Out More</a>
            </div>
          </div>
        </div>
        <div className="col-md-6">
          <div className="card mb-4">
            <div className="card-body">
              <h5>Improving Member Outcomes with Predictive Analytics</h5>
              <p>A case study on digital transformation in healthcare engagement.</p>
              <a href="/contact" className="btn cta-btn" style={{ backgroundColor: '#007bff', color: 'white' }}>Find Out More</a>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section className="bg-primary text-white text-center py-5" style={{ backgroundColor: '#007bff' }}>
      <div className="container">
        <h2 className="mb-4">Ready to Transform Your Healthcare Analytics?</h2>
        <a href="/contact" className="btn btn-light btn-lg">Contact Us Today</a>
      </div>
    </section>

    <footer className="bg-dark text-white text-center py-3">
      <p>&copy; 2025 Nexora Analytics. All rights reserved. | <a href="#" className="text-white">Privacy Policy</a> | <a href="#" className="text-white">Terms of Service</a> | HIPAA Compliant</p>
    </footer>
  </div>
);

export default Home;