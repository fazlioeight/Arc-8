import React from 'react';
import PortalPageLayout from '../../../components/PortalPageLayout';
import { PORTAL_NAV_ITEMS } from '../portal_page/portalNavItems';
import { LabSubNav, SectionCard } from './components';

const ADMIN_SECTIONS = [
  {
    key: 'templates',
    title: 'Care journey templates',
    description: 'Author, version, and publish reusable outreach playbooks. Map default stages, default tasks, and risk-tier targeting.',
    items: [
      'Edit existing templates and clone into new versions',
      'Promote drafts to active, archive obsolete templates',
      'Map templates to LOB, plan, or risk tier defaults',
    ],
  },
  {
    key: 'risk_rules',
    title: 'Risk rules & insight catalog',
    description: 'Manage the rule catalog that produces composite risk scores, tiers, and driver explanations.',
    items: [
      'Tune composite scoring weights per domain',
      'Edit driver descriptions and recommended next actions',
      'Backtest rule changes against historical claims',
    ],
  },
  {
    key: 'care_options',
    title: 'Care options policies',
    description: 'Configure steerage criteria, network rules, and savings validation thresholds.',
    items: [
      'Service-type catalog and acceptable quality thresholds',
      'Distance & network tier rules per LOB',
      'Savings validation policy and claim-match tolerance',
    ],
  },
  {
    key: 'queues',
    title: 'Task queues & routing',
    description: 'Define queues, SLAs, and auto-routing rules so tasks reach the right team automatically.',
    items: [
      'Care Coordination, RN escalation, Pharmacy, Behavioral Health queues',
      'SLA timers per priority and queue',
      'Auto-routing from triage decisions and member attributes',
    ],
  },
  {
    key: 'channels',
    title: 'Outreach channels & integrations',
    description: 'Wire up channel providers and consent rules used by the messaging surfaces.',
    items: [
      'Talkdesk voice/SMS/chat connection',
      'Secure messaging provider credentials',
      'Channel consent and preferred-language rules',
    ],
  },
  {
    key: 'audit',
    title: 'Audit & compliance',
    description: 'View tenant audit events, configure retention, and export evidence packages.',
    items: [
      'Audit event stream (member360.* events)',
      'PHI access review reports',
      'Export compliance evidence packages',
    ],
  },
];

const Member360LabAdminPage = () => (
  <PortalPageLayout
    eyebrow="Nexora Lab Member360"
    title="Admin"
    subtitle="Configuration surfaces for templates, rules, queues, integrations, and compliance — wiring lands in a future phase."
    navItems={PORTAL_NAV_ITEMS}
    currentNav="member360-lab"
    navProps={{ align: 'center', tone: 'surface' }}
    align="left"
    maxWidthClassName="max-w-7xl"
    mainClassName="space-y-4"
  >
    <LabSubNav />

    <div className="rounded-2xl ring-1 ring-amber-200 dark:ring-amber-700/40 bg-amber-50/60 dark:bg-amber-900/15 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-200">Admin preview</p>
      <p className="text-sm coding-text-strong mt-1">
        These configuration surfaces document what will be editable here. They render as read-only placeholders until each backend admin endpoint lands.
      </p>
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {ADMIN_SECTIONS.map((section) => (
        <SectionCard
          key={section.key}
          title={section.title}
          subtitle={section.description}
          action={(
            <span className="text-[10px] uppercase tracking-wider rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 coding-text-muted">Coming soon</span>
          )}
        >
          <ul className="space-y-1.5">
            {section.items.map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm coding-text-strong">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[var(--brand-primary)] shrink-0" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            disabled
            className="mt-3 inline-flex items-center rounded-md coding-surface-subtle coding-text-muted ring-1 ring-black/5 dark:ring-white/10 px-3 py-1.5 text-xs font-semibold cursor-not-allowed"
          >
            Configure
          </button>
        </SectionCard>
      ))}
    </div>
  </PortalPageLayout>
);

export default Member360LabAdminPage;
