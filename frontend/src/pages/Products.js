// pages/Products.js - Converted from products.html
import React from "react";
import styles from "../styles/theme.module.css";

const Products = () => (
  <div className="container py-5">
    <h1 className="text-center mb-4">Our Products</h1>
    <p className="lead text-center">
      Advanced analytics tools designed for payer groups to optimize health
      outcomes.
    </p>

    <div className="row">
      <div className="col-md-6">
        <div className={`${styles.productCard} mb-4 fade-in`}>
          <h3>Risk Analysis Dashboard <span className={styles.badgeEnterprise}>Enterprise</span></h3>
          <p>
            Interactive dashboard for real-time risk scoring, predictive
            modeling, and member stratification. Features customizable views and
            AI insights.
          </p>
          <a href="/contact" className={`btn ${styles.btnBrandPrimary}`}>
            Request Demo
          </a>
        </div>
      </div>
      <div className="col-md-6">
        <div className={`${styles.productCard} mb-4 fade-in`}>
          <h3>Cost & Capitation Analyzer <span className={styles.badgeTeam}>Team</span></h3>
          <p>
            Tools to break down costs, forecast capitation rates, and identify
            savings opportunities with detailed reporting.
          </p>
          <a href="/contact" className={`btn ${styles.btnBrandPrimary}`}>
            Request Demo
          </a>
        </div>
      </div>
      <div className="col-md-6">
        <div className={`${styles.productCard} mb-4 fade-in`}>
          <h3>Member Health Insights</h3>
          <p>
            Personalized analytics to track member health trends, recommend
            interventions, and measure outcomes.
          </p>
          <a href="/contact" className={`btn ${styles.btnBrandAccent}`}>
            Request Demo
          </a>
        </div>
      </div>
      <div className="col-md-6">
        <div className={`${styles.productCard} mb-4 fade-in`}>
          <h3>Integration Suite</h3>
          <p>
            Seamless API integrations with EHRs, claims data, and third-party
            systems for unified analytics.
          </p>
          <a href="/contact" className={`btn ${styles.btnBrandPrimary}`}>
            Request Demo
          </a>
        </div>
      </div>
    </div>

    <footer className="bg-dark text-white text-center py-3 mt-5">
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

export default Products;
