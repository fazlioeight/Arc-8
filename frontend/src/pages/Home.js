import React, { useContext, useMemo } from 'react';
import { Button, Card, Col, ListGroup, Row } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';

import PortalUtilityBar from '../components/PortalUtilityBar';
import { AuthContext } from '../context/AuthContext';
import { SAMPLE_CODING_MEMBERS, SAMPLE_JOBS } from '../utils/sampleData';
import Icon from '../components/ui/Icon';
import InfoTooltip from '../components/ui/InfoTooltip';

import './home.landing.css';

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
};

const MarketingLanding = () => {
  const trustLogos = [
    { src: '/images/nexoraAnalyticsLogo.png', alt: 'HealthCo' },
    { src: '/images/nexoraAnalyticsNavBarLogo.png', alt: 'PayerOne' },
    { src: '/images/nexoraAnalyticsLogo.png', alt: 'CarePlus' },
    { src: '/images/nexoraAnalyticsNavBarLogo.png', alt: 'Optiview' },
    { src: '/images/nexoraAnalyticsLogo.png', alt: 'WellMetrics' },
  ];

  return (
    <div className="nx-landing">
      <section className="nx-hero">
        <div className="nx-hero__wrap">
          <div className="fade-in" style={{ animationDelay: '40ms' }}>
            <div className="nx-hero__eyebrow">Nexora Analytics Platform</div>
            <h1 className="nx-hero__title">AI-powered analytics for payers and providers</h1>
            <p className="nx-hero__desc">
              Modernize decisions across risk, capitation, and member outcomes with an end-to-end analytics stack that your teams actually enjoy using.
            </p>
            <div className="nx-hero__ctas">
              <a className="ds-btn ds-btn--primary ds-btn--lg" href="/contact">Request a demo</a>
              <a className="ds-btn ds-btn--ghost ds-btn--lg" href="/products">Explore products</a>
            </div>
          </div>
          <div className="nx-hero__media fade-in" style={{ animationDelay: '120ms' }}>
            <img
              src="/images/nexoraAnalyticsLogo.png"
              alt="Nexora platform branding"
              loading="lazy"
              decoding="async"
              style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '12px' }}
            />
          </div>
        </div>
        <div className="nx-trust">
          <div className="nx-trust__label">Trusted by teams like</div>
          <div className="nx-carousel" aria-label="Trusted logos carousel">
            <div className="nx-carousel__track" role="list">
              <div className="nx-logos" aria-hidden="false">
                {trustLogos.map((logo, index) => (
                  <div className="nx-logo" role="listitem" key={`logo-a-${index}`}>
                    <img src={logo.src} alt={logo.alt} width="120" height="36" loading="lazy" decoding="async" />
                  </div>
                ))}
              </div>
              <div className="nx-logos" aria-hidden="true">
                {trustLogos.map((logo, index) => (
                  <div className="nx-logo" role="listitem" key={`logo-b-${index}`}>
                    <img src={logo.src} alt="" aria-hidden="true" width="120" height="36" loading="lazy" decoding="async" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="nx-features">
        <div className="nx-feature ds-card ds-card--interactive ds-card--compact fade-in" style={{ animationDelay: '60ms' }}>
          <div className="nx-feature__icon">
            <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" /></svg>
          </div>
          <div className="nx-feature__title">Unified data to insight</div>
          <div className="nx-feature__desc">Ingest, model, and visualize faster with battle-tested pipelines and semantic layers.</div>
        </div>
        <div className="nx-feature ds-card ds-card--interactive ds-card--compact fade-in" style={{ animationDelay: '100ms' }}>
          <div className="nx-feature__icon">
            <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" /></svg>
          </div>
          <div className="nx-feature__title">Compliance by default</div>
          <div className="nx-feature__desc">Privacy-first controls, auditing, and PHI-safe workflows across your stack.</div>
        </div>
        <div className="nx-feature ds-card ds-card--interactive ds-card--compact fade-in" style={{ animationDelay: '140ms' }}>
          <div className="nx-feature__icon">
            <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M5 3h14v2H5V3zm0 4h14v6H5V7zm0 8h14v2H5v-2z" /></svg>
          </div>
          <div className="nx-feature__title">Outcomes you can measure</div>
          <div className="nx-feature__desc">Track RAF, PMPM, and gap closure with living dashboards your execs will love.</div>
        </div>
      </section>

      <section className="nx-stats slide-up" style={{ animationDelay: '80ms' }}>
        <div className="nx-stats__wrap">
          <div className="nx-stat"><div className="nx-stat__num">15%</div><div className="nx-stat__label">Avg. cost reduction</div></div>
          <div className="nx-stat"><div className="nx-stat__num">3x</div><div className="nx-stat__label">Faster insights</div></div>
          <div className="nx-stat"><div className="nx-stat__num">99.95%</div><div className="nx-stat__label">Uptime</div></div>
          <div className="nx-stat"><div className="nx-stat__num">HIPAA</div><div className="nx-stat__label">Compliance ready</div></div>
        </div>
      </section>

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

      <section className="nx-testimonial fade-in" style={{ animationDelay: '120ms' }}>
        <div className="nx-quote">“Nexora helped us cut PMPM by double digits while improving member outcomes.”<small>VP Analytics, Regional Payer</small></div>
      </section>

      <section className="nx-resources">
        <article className="nx-card ds-card ds-card--interactive ds-card--compact fade-in" style={{ animationDelay: '60ms' }}>
          <div className="nx-card__eyebrow">Guide</div>
          <div className="nx-card__title">Playbook: Standing up payer analytics in 60 days</div>
          <a className="ds-link nx-card__cta" href="/insights">
            Read the guide
            <Icon name="arrowRight" size={16} aria-hidden="true" />
          </a>
        </article>
        <article className="nx-card ds-card ds-card--interactive ds-card--compact fade-in" style={{ animationDelay: '100ms' }}>
          <div className="nx-card__eyebrow">Case study</div>
          <div className="nx-card__title">How HealthCo improved gap closure by 22%</div>
          <a className="ds-link nx-card__cta" href="/insights">
            See results
            <Icon name="arrowRight" size={16} aria-hidden="true" />
          </a>
        </article>
        <article className="nx-card ds-card ds-card--interactive ds-card--compact fade-in" style={{ animationDelay: '140ms' }}>
          <div className="nx-card__eyebrow">Webinar</div>
          <div className="nx-card__title">Building trust in analytics programs</div>
          <a className="ds-link nx-card__cta" href="/insights">
            Watch now
            <Icon name="arrowRight" size={16} aria-hidden="true" />
          </a>
        </article>
      </section>

      <section className="nx-cta fade-in" style={{ animationDelay: '120ms' }}>
        <div className="nx-cta__wrap">
          <div>
            <div className="nx-cta__title">Ready to modernize your analytics?</div>
            <div style={{ color: 'var(--text-muted)' }}>See Nexora in action with a tailored demo for your data.</div>
          </div>
          <div className="nx-cta__actions">
            <a className="ds-btn ds-btn--primary" href="/contact">Request a demo</a>
            <a className="ds-btn ds-btn--ghost" href="/pricing">View pricing</a>
          </div>
        </div>
      </section>
    </div>
  );
};

const Home = () => {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useContext(AuthContext) || {};

  const metrics = useMemo(() => {
    const openCharts = SAMPLE_CODING_MEMBERS.filter((member) => member.status !== 'closed').length;
    const inReview = SAMPLE_CODING_MEMBERS.filter((member) => member.status === 'in_review').length;
    const highRisk = SAMPLE_CODING_MEMBERS.filter((member) => (member.risk_score || 0) >= 2).length;
    const providerTouchpoints = new Set(
      SAMPLE_CODING_MEMBERS
        .filter((member) => member.pcp_name)
        .map((member) => member.pcp_name),
    ).size;

    const runningJobs = SAMPLE_JOBS.filter((job) => job.status === 'running').length;

    return [
      {
        title: 'Open coding charts',
        value: openCharts,
        hint: 'Charts awaiting review',
        tooltip: 'Live count of charts waiting for coding activity across all teams.',
        action: () => navigate('/coding/platform', { state: { breadcrumb: 'Coder platform' } }),
      },
      {
        title: 'Charts in review',
        value: inReview,
        hint: 'Active reviews today',
        tooltip: 'Peer reviews being completed in the last refresh cycle.',
        action: () => navigate('/coding/member-details', { state: { breadcrumb: 'Member workspace' } }),
      },
      {
        title: 'High-risk members',
        value: highRisk,
        hint: 'Risk score ≥ 2.0',
        tooltip: 'Members surfaced by analytics as needing rapid follow-up.',
        action: () => navigate('/coding/members', { state: { breadcrumb: 'Members' } }),
      },
      {
        title: 'Providers needing outreach',
        value: providerTouchpoints,
        hint: 'Open education follow-ups',
        tooltip: 'Care teams that still require outreach or education this week.',
        action: () => navigate('/coding/provider-education', { state: { breadcrumb: 'Provider education' } }),
      },
      {
        title: 'Jobs in progress',
        value: runningJobs,
        hint: 'Imports or exports currently running',
        tooltip: 'Background imports, exports, or sync jobs that are still running.',
        action: () => navigate('/jobs/status-center', { state: { breadcrumb: 'Operations Center' } }),
      },
    ];
  }, [navigate]);

  const tasks = useMemo(() => [
    {
      label: 'Review high-priority charts',
      detail: 'Focus on charts flagged as high priority in the work queue.',
      to: '/coding/platform',
    },
    {
      label: 'Check provider education list',
      detail: 'Follow up with care teams that still have open gaps.',
      to: '/coding/provider-education',
    },
    {
      label: 'Monitor analytics dashboard',
      detail: 'Confirm RAF, PMPM, and closure metrics are trending correctly.',
      to: '/dashboard',
    },
  ], [navigate]);

  const jobAlerts = useMemo(() => SAMPLE_JOBS
    .filter((job) => job.status === 'failed' || job.status === 'running')
    .slice(0, 4), []);

  const quickLinks = useMemo(() => [
    { label: 'Coding Workbench', to: '/coding' },
    { label: 'Care Team Directory', to: '/coding/providers' },
    { label: 'Operations Center', to: '/jobs/status-center' },
    { label: 'Resource Library', to: '/docs' },
  ], []);

  if (!isAuthenticated) {
    return <MarketingLanding />;
  }

  const greeting = getGreeting();
  const displayName = user?.name || user?.email || 'there';

  return (
    <div className="sfdc-portal home-dashboard">
      <PortalUtilityBar />
      <div className="container py-4">
        <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-4">
          <div>
            <h1 className="h4 mb-1">Good {greeting}, {displayName}.</h1>
            <p className="text-muted mb-2">
              Here’s what needs your attention across coding, operations, and analytics today.
            </p>
          </div>
          <div className="d-flex gap-2">
            <Button
              variant="primary"
              className="ds-btn ds-btn--primary"
              onClick={() => navigate('/coding/platform', { state: { breadcrumb: 'Coder platform' } })}
            >
              Open Work Queue
            </Button>
            <Button
              variant="outline-secondary"
              className="ds-btn ds-btn--secondary"
              onClick={() => navigate('/coding/member-details', { state: { breadcrumb: 'Member workspace' } })}
            >
              Member workspace
            </Button>
          </div>
        </div>

        <Row className="g-3">
          {metrics.map((metric) => {
            const displayValue = typeof metric.value === 'number'
              ? metric.value.toLocaleString()
              : metric.value;

            return (
              <Col key={metric.title} xs={12} sm={6} xl={3}>
                <Card className="ds-card ds-card--compact h-100">
                  <Card.Body className="d-flex flex-column gap-2">
                    <div className="d-flex align-items-center justify-content-between gap-2">
                      <div className="ds-card__title">{metric.title}</div>
                      <InfoTooltip content={metric.tooltip || metric.hint} placement="top" />
                    </div>
                    <div className="display-6 fw-semibold">{displayValue}</div>
                    <div className="ds-card__meta">{metric.hint}</div>
                    <Button variant="link" className="ds-link ps-0" onClick={metric.action}>
                      Go to view
                      <Icon name="arrowRight" size={16} aria-hidden="true" />
                    </Button>
                  </Card.Body>
                </Card>
              </Col>
            );
          })}
        </Row>

        <Row className="g-4 mt-1">
          <Col md={6}>
            <Card className="ds-card ds-card--compact h-100">
              <Card.Header>Today’s focus</Card.Header>
              <ListGroup variant="flush">
                {tasks.map((task) => (
                  <ListGroup.Item key={task.label}>
                    <div className="fw-semibold">{task.label}</div>
                    <div className="text-muted small mb-2">{task.detail}</div>
                    <Button
                      variant="outline-primary"
                      size="sm"
                      className="ds-btn ds-btn--secondary ds-btn--sm"
                      onClick={() => navigate(task.to, { state: { breadcrumb: task.label } })}
                    >
                      Open
                    </Button>
                  </ListGroup.Item>
                ))}
              </ListGroup>
            </Card>
          </Col>
          <Col md={6}>
            <Card className="ds-card ds-card--compact mb-4">
              <Card.Header>Job center alerts</Card.Header>
              <Card.Body>
                {jobAlerts.length === 0 ? (
                  <div className="text-muted">All background jobs are healthy.</div>
                ) : (
                  <ListGroup variant="flush">
                    {jobAlerts.map((job) => {
                      const badgeTone = job.status === 'failed' ? 'ds-badge--critical' : 'ds-badge--warning';
                      return (
                        <ListGroup.Item key={job.id} className="d-flex justify-content-between align-items-center">
                          <div>
                            <div className="fw-semibold">{job.name}</div>
                            <div className="text-muted small">{job.type}</div>
                          </div>
                          <span className={`ds-badge ${badgeTone}`}>{job.status}</span>
                        </ListGroup.Item>
                      );
                    })}
                  </ListGroup>
                )}
              </Card.Body>
              <Card.Footer className="text-end">
                <Button
                  variant="link"
                  className="ds-link"
                  onClick={() => navigate('/jobs/status-center', { state: { breadcrumb: 'Operations Center' } })}
                >
                  View job center
                  <Icon name="arrowRight" size={16} aria-hidden="true" />
                </Button>
              </Card.Footer>
            </Card>

            <Card className="ds-card ds-card--compact">
              <Card.Header>Quick links</Card.Header>
              <ListGroup variant="flush">
                {quickLinks.map((link) => (
                  <ListGroup.Item key={link.label} className="d-flex justify-content-between align-items-center">
                    <div>{link.label}</div>
                    <Button
                      variant="link"
                      className="ds-link"
                      onClick={() => navigate(link.to, { state: { breadcrumb: link.label } })}
                    >
                      Open
                      <Icon name="arrowRight" size={16} aria-hidden="true" />
                    </Button>
                  </ListGroup.Item>
                ))}
              </ListGroup>
            </Card>
          </Col>
        </Row>
      </div>
    </div>
  );
};

export default Home;
