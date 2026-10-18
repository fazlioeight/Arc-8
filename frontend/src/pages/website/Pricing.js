// pages/Pricing.js - Talkdesk-inspired pricing page
import React, { useState } from "react";
import Icon from "../../components/ui/Icon";
import InfoTooltip from "../../components/ui/InfoTooltip";
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

  const cadenceLabel = billing === "monthly" ? "/user/mo" : "/user/mo (annual)";

  return (
    <div className="nx-pricing">
      <section className="nx-pricing__hero ds-section ds-section--dense">
        <div className="ds-container">
          <div className="nx-heroStack ds-stack ds-stack--sm">
            <span className="ds-eyebrow">Pricing</span>
            <h1 className="ds-heading-xxl">Plans that fit your growth</h1>
            <p className="ds-lead">
              Transparent pricing with enterprise-grade security and performance.
            </p>
            <div className="nx-billingToggle__wrap">
              <div className="ds-inline nx-billingToggle__label">
                <span className="ds-text-muted">Billing cadence</span>
                <InfoTooltip
                  content="Switch anytime. Annual pricing reflects a yearly pre-pay discount."
                  placement="top"
                />
              </div>
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
          </div>
        </div>
      </section>

      <section className="nx-plans ds-section">
        <div className="ds-container">
          <div className="nx-plans__grid">
            {plans.map((plan) => {
              const price = billing === "monthly" ? plan.monthly : plan.yearly;
              const showPrice = price && price > 0;
              return (
                <article
                  key={plan.id}
                  className={`nx-card ds-card ds-card--interactive${plan.popular ? " nx-card--popular" : ""}`}
                >
                  {plan.popular && (
                    <span className="nx-badge ds-badge ds-badge--team">Most popular</span>
                  )}
                  <div className="ds-stack ds-stack--xs">
                    <h3 className="ds-heading-md">{plan.name}</h3>
                    <p className="nx-card__desc ds-text-muted">{plan.description}</p>
                  </div>
                  <div className="nx-card__price">
                    {showPrice ? (
                      <>
                        <span className="nx-price__amount">${price}</span>
                        <span className="nx-price__cycle">{cadenceLabel}</span>
                      </>
                    ) : (
                      <span className="nx-price__custom">Custom pricing</span>
                    )}
                  </div>
                  {plan.note && (
                    <div className="nx-card__note ds-inline ds-text-muted">
                      <Icon name="info" size={16} aria-hidden="true" />
                      <span>{plan.note}</span>
                    </div>
                  )}
                  <a
                    href={plan.cta.href}
                    className="ds-btn ds-btn--primary ds-btn--lg nx-card__cta"
                  >
                    {plan.cta.label}
                    <Icon name="arrowRight" size={16} aria-hidden="true" />
                  </a>
                  <ul className="nx-list">
                    {plan.features.map((feature, index) => (
                      <li key={index} className="nx-list__item">
                        <span className="nx-list__icon">
                          <Icon name="check" size={18} aria-hidden="true" />
                        </span>
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="nx-pricing__faq ds-section">
        <div className="ds-container">
          <h2 className="ds-heading-xl">Frequently asked questions</h2>
          <div className="nx-faq__grid">
            <div className="nx-faq ds-card ds-card--compact">
              <h4 className="ds-heading-sm">How does annual billing work?</h4>
              <p className="ds-card__meta">
                Annual pricing reflects a discount applied when billed yearly. You can switch
                between monthly and annual at renewal.
              </p>
            </div>
            <div className="nx-faq ds-card ds-card--compact">
              <h4 className="ds-heading-sm">Do you offer HIPAA-compliant deployments?</h4>
              <p className="ds-card__meta">
                Yes. Enterprise plans include BAAs, audit logs, and VPC options to meet your
                compliance requirements.
              </p>
            </div>
            <div className="nx-faq ds-card ds-card--compact">
              <h4 className="ds-heading-sm">Can I try before purchasing?</h4>
              <p className="ds-card__meta">
                Absolutely. Request a demo and we can enable a guided sandbox for your use case.
              </p>
            </div>
            <div className="nx-faq ds-card ds-card--compact">
              <h4 className="ds-heading-sm">What’s included in support?</h4>
              <p className="ds-card__meta">
                All paid plans include standard support. Advanced and above add priority SLAs and
                dedicated channels.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Pricing;
