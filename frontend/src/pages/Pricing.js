// pages/Pricing.js - Talkdesk-inspired pricing page
import React, { useState } from "react";
import "./pricing.page.css";

const plans = [
  {
    id: "essential",
    name: "Essential",
    monthly: 65,
    yearly: 55,
    description: "Core analytics for small teams starting their journey.",
    features: [
      "Up to 50k member lives",
      "Standard dashboards (cost, risk, gaps)",
      "Email support",
      "Basic SSO",
    ],
    cta: { label: "Get a demo", href: "/contact/form" },
  },
  {
    id: "advanced",
    name: "Advanced",
    monthly: 95,
    yearly: 85,
    popular: true,
    description: "Deeper insights and automation for growing orgs.",
    features: [
      "Up to 250k member lives",
      "Predictive modeling & cohorts",
      "PHI-safe exports",
      "SAML SSO + SCIM",
    ],
    cta: { label: "Talk to sales", href: "/contact/form" },
  },
  {
    id: "enterprise",
    name: "Enterprise",
    monthly: 145,
    yearly: 129,
    description: "Scale, security, and customization for complex teams.",
    features: [
      "Unlimited member lives",
      "Custom models & SLAs",
      "Dedicated VPC + audit logs",
      "Premium support",
    ],
    cta: { label: "Contact us", href: "/contact/info" },
  },
  {
    id: "payg",
    name: "Usage-based",
    monthly: 0,
    yearly: 0,
    description: "Start free, pay as you grow by usage.",
    features: [
      "No fixed commitment",
      "Ingest + storage metered",
      "All core dashboards",
      "Community support",
    ],
    note: "Custom rates based on volume",
    cta: { label: "View details", href: "/contact" },
  },
];

const Pricing = () => {
  const [billing, setBilling] = useState("monthly"); // 'monthly' | 'yearly'

  return (
    <div className="nx-pricing">
      <section className="nx-pricing__hero">
        <div className="container">
          <h1>Plans that fit your growth</h1>
          <p className="nx-pricing__subtitle">
            Transparent pricing with enterprise-grade security and performance.
          </p>
          <div className="nx-billingToggle" role="group" aria-label="Billing period">
            <button
              className={`nx-toggleBtn ${billing === "monthly" ? "active" : ""}`}
              onClick={() => setBilling("monthly")}
              aria-pressed={billing === "monthly"}
            >
              Monthly
            </button>
            <button
              className={`nx-toggleBtn ${billing === "yearly" ? "active" : ""}`}
              onClick={() => setBilling("yearly")}
              aria-pressed={billing === "yearly"}
            >
              Annual <span className="nx-save">Save up to 15%</span>
            </button>
          </div>
        </div>
      </section>

      <section className="nx-plans">
        <div className="container nx-plans__grid">
          {plans.map((plan) => {
            const price = billing === "monthly" ? plan.monthly : plan.yearly;
            const showPrice = price && price > 0;
            return (
              <div key={plan.id} className={`nx-card ${plan.popular ? "popular" : ""}`}>
                {plan.popular && <div className="nx-badge">Most popular</div>}
                <h3 className="nx-card__title">{plan.name}</h3>
                <p className="nx-card__desc">{plan.description}</p>
                <div className="nx-card__price">
                  {showPrice ? (
                    <>
                      <span className="nx-price__amount">${price}</span>
                      <span className="nx-price__cycle">/user/mo</span>
                    </>
                  ) : (
                    <span className="nx-price__custom">Custom pricing</span>
                  )}
                </div>
                {plan.note && <div className="nx-card__note">{plan.note}</div>}
                <a href={plan.cta.href} className="nx-btn_primary nx-card__cta">
                  {plan.cta.label}
                </a>
                <ul className="nx-list">
                  {plan.features.map((f, i) => (
                    <li key={i} className="nx-list__item">
                      <svg
                        className="nx-check"
                        viewBox="0 0 24 24"
                        width="16"
                        height="16"
                        aria-hidden="true"
                      >
                        <path
                          fill="currentColor"
                          d="M9 16.2l-3.5-3.5-1.4 1.4L9 19 20.3 7.7l-1.4-1.4z"
                        />
                      </svg>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      <section className="nx-pricing__faq">
        <div className="container">
          <h2>Frequently asked questions</h2>
          <div className="nx-faq__grid">
            <div className="nx-faq">
              <h4>How does annual billing work?</h4>
              <p>
                Annual pricing reflects a discount applied when billed yearly. You
                can switch between monthly and annual at renewal.
              </p>
            </div>
            <div className="nx-faq">
              <h4>Do you offer HIPAA-compliant deployments?</h4>
              <p>
                Yes. Enterprise plans include BAAs, audit logs, and VPC options to
                meet your compliance requirements.
              </p>
            </div>
            <div className="nx-faq">
              <h4>Can I try before purchasing?</h4>
              <p>
                Absolutely. Request a demo and we can enable a guided sandbox for
                your use case.
              </p>
            </div>
            <div className="nx-faq">
              <h4>What’s included in support?</h4>
              <p>
                All paid plans include standard support. Advanced and above add
                priority SLAs and dedicated channels.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Pricing;

