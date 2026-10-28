// pages/Insights.js - Converted from blog.html, renamed for professionalism
import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const Insights = () => {
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
    <h1 className="text-center mb-4">Insights</h1>
    <p className="lead text-center">Insights on healthcare analytics, risk management, and value-based care.</p>
    
    <div className="blog-post" id="future-capitation" style={{ borderBottom: '1px solid #ddd', padding: '20px 0' }}>
      <h3>The Future of Capitation in Value-Based Care</h3>
      <p>Published: August 10, 2025</p>
      <p>Explore how advanced analytics can optimize capitation models for payers...</p>
      <a href="/insights/future-capitation">Read More</a>
    </div>
    
    <div className="blog-post" id="predictive-modeling" style={{ borderBottom: '1px solid #ddd', padding: '20px 0' }}>
      <h3>Reducing Risks with Predictive Modeling</h3>
      <p>Published: July 25, 2025</p>
      <p>Learn how data-driven tools identify high-risk members early...</p>
      <a href="/insights/predictive-modeling">Read More</a>
    </div>
    
    <div className="blog-post" id="cost-savings" style={{ borderBottom: '1px solid #ddd', padding: '20px 0' }}>
      <h3>Cost Savings Strategies for Payer Groups</h3>
      <p>Published: June 15, 2025</p>
      <p>Discover data-backed approaches to lower healthcare costs...</p>
      <a href="/insights/cost-savings">Read More</a>
    </div>

    <footer className="bg-dark text-white text-center py-3 mt-5">
      <p>&copy; 2025 Arc-8. All rights reserved. | <a href="#" className="text-white">Privacy Policy</a> | <a href="#" className="text-white">Terms of Service</a></p>
    </footer>
  </div>
  );
};

export default Insights;
