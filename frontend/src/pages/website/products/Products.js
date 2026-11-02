// pages/Products.js - Converted from products.html
import React, { useEffect, useMemo } from "react";
import { useLocation } from 'react-router-dom';
import Icon from "../../../components/ui/Icon";
import InfoTooltip from "../../../components/ui/InfoTooltip";
import styles from "../../../styles/theme.module.css";

const PRODUCTS = [
  {
    id: "risk-analysis",
    title: "Risk Analysis Dashboard",
    badge: { tone: "enterprise", label: "Enterprise" },
    description: "Interactive dashboard for real-time risk scoring, predictive modeling, and member stratification with configurable cohorts.",
    meta: "Includes RAF, PMPM, and HCC drilldowns.",
    cta: { label: "Request demo", href: "/contact", variant: "primary" },
    icon: "spark",
    tooltip: "Layer in custom cohorts and track risk trending in real time.",
  },
  {
    id: "capitation-analyzer",
    title: "Cost & Capitation Analyzer",
    badge: { tone: "team", label: "Team" },
    description: "Break down costs, forecast capitation rates, and identify savings opportunities with scenario modeling.",
    meta: "Bundle actuarial modeling and plan forecasting.",
    tooltip: "Scenario comparisons for PMPM, RAF, and contract margin.",
    cta: { label: "Request demo", href: "/contact", variant: "primary" },
    icon: "clock",
  },
  {
    id: "member-health-insights",
    title: "Member Health Insights",
    description: "Personalized analytics to track member health trends, recommend interventions, and measure outcomes.",
    meta: "Surface at-risk cohorts and care gaps automatically.",
    tooltip: "Combines claims, EHR, and SDOH signals for targeted outreach.",
    cta: { label: "Request demo", href: "/contact", variant: "secondary" },
    icon: "info",
  },
  {
    id: "integration-suite",
    title: "Integration Suite",
    description: "Seamless API integrations with EHRs, claims data, and third-party systems for unified analytics.",
    meta: "Real-time pipelines with monitoring and alerting.",
    tooltip: "Prebuilt connectors and webhook notifications keep teams in sync.",
    cta: { label: "Request demo", href: "/contact", variant: "primary" },
    icon: "arrowRight",
  },
];

const Products = () => {
  const location = useLocation();

  useEffect(() => {
    if (location.hash) {
      const id = location.hash.replace('#', '');
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [location]);

  const animationDelays = useMemo(
    () => PRODUCTS.reduce((acc, product, index) => {
      acc[product.id] = `${60 + index * 40}ms`;
      return acc;
    }, {}),
    []
  );

  return (
    <div className="ds-container py-5">
      <div className="ds-stack ds-stack--sm text-center mb-5">
        <span className="ds-eyebrow">Product suite</span>
        <h1 className="ds-heading-xxl">Analytics built for payers and providers</h1>
        <p className="ds-lead mx-auto">
          Advanced analytics tools designed to modernize care delivery, streamline operations, and surface the insights that matter.
        </p>
      </div>

      <div className="ds-grid ds-grid--balanced">
        {PRODUCTS.map((product) => (
          <article
            key={product.id}
            id={product.id}
            className={`${styles.productCard} fade-in`}
            style={{ animationDelay: animationDelays[product.id] }}
          >
            <div className="ds-card__header">
              <div className="ds-inline">
                <span className="ds-icon-mask">
                  <Icon name={product.icon} size={18} aria-hidden="true" />
                </span>
                <h3 className={styles.productTitle}>{product.title}</h3>
              </div>
              {product.badge ? (
                <span className={`ds-badge ds-badge--${product.badge.tone}`}>
                  {product.badge.label}
                </span>
              ) : null}
            </div>

            <p className={styles.productMeta}>{product.description}</p>
            <div className="ds-inline ds-text-muted">
              <InfoTooltip content={product.tooltip || product.meta} placement="top" />
              <span>{product.meta}</span>
            </div>

            <div className={styles.productActions}>
              <a
                href={product.cta.href}
                className={`ds-btn ds-btn--${product.cta.variant === "secondary" ? "secondary" : "primary"}`}
              >
                {product.cta.label}
                <Icon name="arrowRight" size={16} aria-hidden="true" />
              </a>
              <a href="/docs" className="ds-link">
                View documentation
                <Icon name="arrowRight" size={16} aria-hidden="true" />
              </a>
            </div>
          </article>
        ))}
      </div>

      <footer className={styles.productFooter}>
        <p className="ds-text-muted mb-0">© 2025 Arc-8. All rights reserved.</p>
        <div className={styles.productFooterLinks}>
          <a href="/privacy" className="ds-link">Privacy</a>
          <a href="/terms" className="ds-link">Terms</a>
          <a href="/contact" className="ds-link">Contact</a>
        </div>
      </footer>
    </div>
  );
};

export default Products;
