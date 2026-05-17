import React from 'react';
import PortalPageLayout from '../../../components/PortalPageLayout';
import AlertShell from '../../../components/ui/AlertShell';
import { PORTAL_NAV_ITEMS } from '../portal_page/portalNavItems';
import { LabSubNav } from './components';

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

    <AlertShell
      tone="warning"
      title="Admin preview"
      description="These configuration surfaces document what will be editable here. They render as read-only placeholders until each backend admin endpoint lands."
    />

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {ADMIN_SECTIONS.map((section) => (
        <section key={section.key} className="coding-surface rounded-2xl shadow-sm overflow-hidden">
          <header className="px-5 py-3 border-b coding-border flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold coding-text-strong">{section.title}</h3>
              <p className="mt-0.5 text-xs coding-text-soft">{section.description}</p>
            </div>
            <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider coding-text-muted shrink-0">
              Coming soon
            </span>
          </header>
          <div className="px-5 py-4">
            <ul className="space-y-2">
              {section.items.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm coding-text-strong">
                  <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-primary)]" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              disabled
              className="mt-4 inline-flex items-center rounded-md ring-1 coding-border coding-text-muted bg-transparent px-3 py-1.5 text-xs font-semibold cursor-not-allowed opacity-60"
            >
              Configure
            </button>
          </div>
        </section>
      ))}
    </div>
  </PortalPageLayout>
);

export default Member360LabAdminPage;
