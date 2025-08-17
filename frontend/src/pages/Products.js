// pages/Products.js - Converted from products.html
import React from 'react';

const Products = () => (
  <div className="container py-5">
    <h1 className="text-center mb-4">Our Products</h1>
    <p className="lead text-center">Advanced analytics tools designed for payer groups to optimize health outcomes.</p>
    
    <div className="row">
      <div className="col-md-6">
        <div className="product-card mb-4" style={{ border: '1px solid #ddd', padding: '20px', borderRadius: '8px' }}>
          <h3>Risk Analysis Dashboard</h3>
          <p>Interactive dashboard for real-time risk scoring, predictive modeling, and member stratification. Features customizable views and AI insights.</p>
          <a href="/contact" className="btn btn-primary">Request Demo</a>
        </div>
      </div>
      <div className="col-md-6">
        <div className="product-card mb-4" style={{ border: '1px solid #ddd', padding: '20px', borderRadius: '8px' }}>
          <h3>Cost & Capitation Analyzer</h3>
          <p>Tools to break down costs, forecast capitation rates, and identify savings opportunities with detailed reporting.</p>
          <a href="/contact" className="btn btn-primary">Request Demo</a>
        </div>
      </div>
      <div className="col-md-6">
        <div className="product-card mb-4" style={{ border: '1px solid #ddd', padding: '20px', borderRadius: '8px' }}>
          <h3>Member Health Insights</h3>
          <p>Personalized analytics to track member health trends, recommend interventions, and measure outcomes.</p>
          <a href="/contact" className="btn btn-primary">Request Demo</a>
        </div>
      </div>
      <div className="col-md-6">
        <div className="product-card mb-4" style={{ border: '1px solid #ddd', padding: '20px', borderRadius: '8px' }}>
          <h3>Integration Suite</h3>
          <p>Seamless API integrations with EHRs, claims data, and third-party systems for unified analytics.</p>
          <a href="/contact" className="btn btn-primary">Request Demo</a>
        </div>
      </div>
    </div>

    <footer className="bg-dark text-white text-center py-3 mt-5">
      <p>&copy; 2025 Nexora Analytics. All rights reserved. | <a href="#" className="text-white">Privacy Policy</a> | <a href="#" className="text-white">Terms of Service</a></p>
    </footer>
  </div>
);

export default Products;