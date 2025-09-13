// pages/Home.js - Talkdesk-inspired landing (custom colors)
import React from "react";
import "./home.landing.css";

const Home = () => (
  <div className="nx-landing">
    {/* Hero */}
    <section className="nx-hero">
      <div className="nx-hero__wrap">
        <div className="fade-in" style={{ animationDelay: '40ms' }}>
          <div className="nx-hero__eyebrow">Nexora Analytics Platform</div>
          <h1 className="nx-hero__title">AI-powered analytics for payers and providers</h1>
          <p className="nx-hero__desc">Modernize decisions across risk, capitation, and member outcomes with an end-to-end analytics stack that your teams actually enjoy using.</p>
          <div className="nx-hero__ctas">
            <a className="nx-btn_primary" href="/contact">Request a demo</a>
            <a className="nx-btn_ghost" href="/products">Explore products</a>
          </div>
        </div>
        <div className="nx-hero__media fade-in" style={{ animationDelay: '120ms' }}>Hero media placeholder</div>
      </div>
      <div className="nx-trust">
        <div className="nx-trust__label">Trusted by teams like</div>
        <div className="nx-logos">
          <div className="nx-logo fade-in" style={{ animationDelay: '60ms' }}>
            <img src="/images/nexoraAnalyticsLogo.png" alt="HealthCo" width="120" height="36" loading="lazy" decoding="async" />
          </div>
          <div className="nx-logo fade-in" style={{ animationDelay: '100ms' }}>
            <img src="/images/nexoraAnalyticsNavBarLogo.png" alt="PayerOne" width="120" height="36" loading="lazy" decoding="async" />
          </div>
          <div className="nx-logo fade-in" style={{ animationDelay: '140ms' }}>
            <img src="/images/nexoraAnalyticsLogo.png" alt="CarePlus" width="120" height="36" loading="lazy" decoding="async" />
          </div>
          <div className="nx-logo fade-in" style={{ animationDelay: '180ms' }}>
            <img src="/images/nexoraAnalyticsNavBarLogo.png" alt="Optiview" width="120" height="36" loading="lazy" decoding="async" />
          </div>
          <div className="nx-logo fade-in" style={{ animationDelay: '220ms' }}>
            <img src="/images/nexoraAnalyticsLogo.png" alt="WellMetrics" width="120" height="36" loading="lazy" decoding="async" />
          </div>
        </div>
      </div>
    </section>

    {/* Features */}
    <section className="nx-features">
      <div className="nx-feature fade-in" style={{ animationDelay: '60ms' }}>
        <div className="nx-feature__icon"><svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/></svg></div>
        <div className="nx-feature__title">Unified data to insight</div>
        <div className="nx-feature__desc">Ingest, model, and visualize faster with battle-tested pipelines and semantic layers.</div>
      </div>
      <div className="nx-feature fade-in" style={{ animationDelay: '100ms' }}>
        <div className="nx-feature__icon"><svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg></div>
        <div className="nx-feature__title">Compliance by default</div>
        <div className="nx-feature__desc">Privacy-first controls, auditing, and PHI-safe workflows across your stack.</div>
      </div>
      <div className="nx-feature fade-in" style={{ animationDelay: '140ms' }}>
        <div className="nx-feature__icon"><svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M5 3h14v2H5V3zm0 4h14v6H5V7zm0 8h14v2H5v-2z"/></svg></div>
        <div className="nx-feature__title">Outcomes you can measure</div>
        <div className="nx-feature__desc">Track RAF, PMPM, and gap closure with living dashboards your execs will love.</div>
      </div>
    </section>

    {/* Stats */}
    <section className="nx-stats slide-up" style={{ animationDelay: '80ms' }}>
      <div className="nx-stats__wrap">
        <div className="nx-stat"><div className="nx-stat__num">15%</div><div className="nx-stat__label">Avg. cost reduction</div></div>
        <div className="nx-stat"><div className="nx-stat__num">3x</div><div className="nx-stat__label">Faster insights</div></div>
        <div className="nx-stat"><div className="nx-stat__num">99.95%</div><div className="nx-stat__label">Uptime</div></div>
        <div className="nx-stat"><div className="nx-stat__num">HIPAA</div><div className="nx-stat__label">Compliance ready</div></div>
      </div>
    </section>

    {/* Integrations */}
    <section className="nx-integrations fade-in" style={{ animationDelay: '80ms' }}>
      <h2>Connect your data</h2>
      <div className="nx-integrations__grid">
        <div className="nx-integration">FHIR R4</div>
        <div className="nx-integration">HL7 v2</div>
        <div className="nx-integration">X12 837/835</div>
        <div className="nx-integration">Snowflake</div>
        <div className="nx-integration">Databricks</div>
        <div className="nx-integration">Redshift</div>
      </div>
    </section>

    {/* Testimonial */}
    <section className="nx-testimonial fade-in" style={{ animationDelay: '120ms' }}>
      <div className="nx-quote">“Nexora helped us cut PMPM by double digits while improving member outcomes.”<small>VP Analytics, Regional Payer</small></div>
    </section>

    {/* Resources */}
    <section className="nx-resources">
      <article className="nx-card fade-in" style={{ animationDelay: '60ms' }}>
        <div className="nx-card__eyebrow">Guide</div>
        <div className="nx-card__title">Playbook: Standing up payer analytics in 60 days</div>
        <a className="nx-card__cta" href="/insights">Read the guide →</a>
      </article>
      <article className="nx-card fade-in" style={{ animationDelay: '100ms' }}>
        <div className="nx-card__eyebrow">Case study</div>
        <div className="nx-card__title">How HealthCo improved gap closure by 22%</div>
        <a className="nx-card__cta" href="/insights">See results →</a>
      </article>
      <article className="nx-card fade-in" style={{ animationDelay: '140ms' }}>
        <div className="nx-card__eyebrow">Webinar</div>
        <div className="nx-card__title">Future of value-based care analytics</div>
        <a className="nx-card__cta" href="/insights">Watch on-demand →</a>
      </article>
    </section>

    {/* CTA */}
    <section className="nx-cta slide-up" style={{ animationDelay: '100ms' }}>
      <div className="nx-cta__wrap">
        <div>
          <div className="nx-cta__title">Ready to modernize your analytics?</div>
          <div style={{ color: 'var(--text-muted)' }}>See Nexora in action with a tailored demo for your data.</div>
        </div>
        <div className="nx-cta__actions">
          <a className="nx-btn_primary" href="/contact">Request a demo</a>
          <a className="nx-btn_ghost" href="/signup">Start free</a>
        </div>
      </div>
    </section>

    {/* Footer */}
    <footer className="nx-footer">
      <div className="nx-footer__wrap">
        <div className="nx-footer__grid">
          <div className="nx-footer__col">
            <h4>Products</h4>
            <a className="nx-footer__link" href="/products/risk-analysis">Risk Analysis</a>
            <a className="nx-footer__link" href="/products/capitation-analyzer">Capitation</a>
            <a className="nx-footer__link" href="/products/member-health-insights">Health Insights</a>
            <a className="nx-footer__link" href="/products/integration-suite">Integrations</a>
          </div>
          <div className="nx-footer__col">
            <h4>Solutions</h4>
            <a className="nx-footer__link" href="/about/mission">Payers</a>
            <a className="nx-footer__link" href="/about/mission">Providers</a>
            <a className="nx-footer__link" href="/about/mission">Partners</a>
          </div>
          <div className="nx-footer__col">
            <h4>Resources</h4>
            <a className="nx-footer__link" href="/insights">Insights</a>
            <a className="nx-footer__link" href="/docs">Docs</a>
            <a className="nx-footer__link" href="/contact/form">Contact</a>
          </div>
          <div className="nx-footer__col">
            <h4>Company</h4>
            <a className="nx-footer__link" href="/about">About</a>
            <a className="nx-footer__link" href="/about/team">Team</a>
            <a className="nx-footer__link" href="/contact/info">Company Info</a>
          </div>
          <div className="nx-footer__col">
            <h4>Legal</h4>
            <a className="nx-footer__link" href="#">Terms</a>
            <a className="nx-footer__link" href="#">Privacy</a>
            <a className="nx-footer__link" href="#">Security</a>
          </div>
        </div>
        <div className="nx-footer__bottom">
          <div>© {new Date().getFullYear()} Nexora Analytics</div>
          <div className="nx-social" aria-label="Social links">
            <a className="nx-social__link" href="#" aria-label="LinkedIn" title="LinkedIn">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M4.98 3.5C4.98 4.88 3.86 6 2.5 6S0 4.88 0 3.5 1.12 1 2.5 1 4.98 2.12 4.98 3.5zM0 8h5v16H0V8zm7.5 0h4.8v2.2h.1c.7-1.3 2.4-2.7 5-2.7 5.4 0 6.4 3.6 6.4 8.3V24h-5v-7.1c0-1.7 0-3.9-2.4-3.9-2.4 0-2.8 1.8-2.8 3.8V24h-5V8z"/></svg>
            </a>
            <a className="nx-social__link" href="#" aria-label="X (Twitter)" title="X">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M18.244 2H21l-6.52 7.455L22 22h-6.9l-4.6-5.9L5 22H2.244l6.98-7.98L2 2h6.9l4.28 5.6L18.244 2zm-1.2 18h2.08L8.06 4h-2.1l11.084 16z"/></svg>
            </a>
            <a className="nx-social__link" href="#" aria-label="YouTube" title="YouTube">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M23.5 6.2s-.2-1.6-.8-2.3c-.8-.8-1.7-.8-2.2-.9C17.5 2.7 12 2.7 12 2.7h0s-5.5 0-8.5.3c-.5.1-1.4.1-2.2.9C.7 4.6.5 6.2.5 6.2S0 8.1 0 10v1.9c0 1.9.5 3.8.5 3.8s.2 1.6.8 2.3c.8.8 1.8.8 2.3.9 1.7.2 7.4.3 8.4.3h.1s5.5 0 8.5-.3c.5-.1 1.4-.1 2.2-.9.6-.6.8-2.3.8-2.3s.5-1.9.5-3.8V10c0-1.9-.5-3.8-.5-3.8zM9.6 13.9V7.9l6.2 3-6.2 3z"/></svg>
            </a>
          </div>
        </div>
      </div>
    </footer>
  </div>
);

export default Home;
