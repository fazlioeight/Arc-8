import React, { useCallback, useContext, useEffect, useState } from 'react';
import PortalPageLayout from '../../../components/PortalPageLayout';
import AlertShell from '../../../components/ui/AlertShell';
import { AuthContext } from '../../../context/AuthContext';
import { PORTAL_NAV_ITEMS } from '../portal_page/portalNavItems';
import {
  fetchAuditEvents,
  fetchCareOptionPolicies,
  fetchOutreachChannels,
  fetchRiskRules,
  fetchTaskQueues,
  fetchTemplates,
} from '../../../services/member360AdminService';
import { LabSubNav } from './components';

const SECTIONS = [
  {
    key: 'templates',
    title: 'Care journey templates',
    description:
      'Reusable outreach playbooks. Stages and default tasks are picked up automatically when journeys launch.',
    columns: ['Name', 'Category', 'Risk tier', 'Stages', 'Default tasks'],
    fetch: fetchTemplates,
    renderRow: (item) => [
      item.name,
      item.category || '-',
      item.recommended_for_risk_tier || '-',
      (item.default_stages || []).length,
      (item.default_tasks || []).length,
    ],
  },
  {
    key: 'risk_rules',
    title: 'Risk rules & insight catalog',
    description:
      'Per-domain scoring rules used to produce composite risk and driver explanations.',
    columns: ['Name', 'Domain', 'Weight', 'Threshold', 'Active'],
    fetch: fetchRiskRules,
    renderRow: (item) => [
      item.name,
      item.domain,
      Number(item.weight ?? 0).toFixed(2),
      item.threshold ?? '-',
      item.is_active ? 'Yes' : 'No',
    ],
  },
  {
    key: 'queues',
    title: 'Task queues & routing',
    description:
      'Queues, SLA timers per priority, and escalation routing. Tasks land here based on routing rules.',
    columns: ['Name', 'Description', 'SLA (urgent/high)', 'Escalates to', 'Active'],
    fetch: fetchTaskQueues,
    renderRow: (item) => [
      item.name,
      item.description || '-',
      `${item.sla_priority_hours?.urgent ?? '-'}h / ${item.sla_priority_hours?.high ?? '-'}h`,
      item.escalation_queue || '-',
      item.is_active ? 'Yes' : 'No',
    ],
  },
  {
    key: 'channels',
    title: 'Outreach channels & integrations',
    description: 'Channel providers, consent rules, and language coverage.',
    columns: ['Channel', 'Provider', 'Consent', 'Languages', 'Active'],
    fetch: fetchOutreachChannels,
    renderRow: (item) => [
      item.channel_type,
      item.provider || '-',
      item.consent_required ? 'Required' : 'Optional',
      (item.preferred_languages || []).join(', ') || '-',
      item.is_active ? 'Yes' : 'No',
    ],
  },
  {
    key: 'care_options',
    title: 'Care options policies',
    description: 'Steerage criteria — distance, quality floor, minimum savings, and network tier per service.',
    columns: ['Service', 'LOB', 'Max distance', 'Min quality', 'Min savings', 'Tier'],
    fetch: fetchCareOptionPolicies,
    renderRow: (item) => [
      item.service_type,
      item.line_of_business || 'Any',
      item.max_distance_miles != null ? `${item.max_distance_miles} mi` : '-',
      item.min_quality_score != null ? item.min_quality_score : '-',
      item.min_savings_threshold != null ? `$${item.min_savings_threshold}` : '-',
      item.network_tier || '-',
    ],
  },
];

const AuditSection = ({ events, loading, error }) => (
  <section className="coding-surface rounded-2xl shadow-sm overflow-hidden">
    <header className="px-5 py-3 border-b coding-border">
      <h3 className="text-sm font-semibold coding-text-strong">Audit & compliance</h3>
      <p className="mt-0.5 text-xs coding-text-soft">Stream of member360.* audit events for this tenant.</p>
    </header>
    <div className="px-5 py-3">
      {loading && <div className="text-xs coding-text-soft">Loading audit events...</div>}
      {error && <div className="text-xs text-rose-700 dark:text-rose-300">{error}</div>}
      {!loading && !error && events.length === 0 && (
        <div className="text-xs coding-text-soft">No audit events recorded yet.</div>
      )}
      {!loading && events.length > 0 && (
        <ul className="space-y-2 max-h-80 overflow-y-auto">
          {events.map((ev) => (
            <li key={ev.id} className="text-xs flex items-start gap-3">
              <span className="coding-text-muted shrink-0 w-32">
                {ev.created_at ? new Date(ev.created_at).toLocaleString() : ''}
              </span>
              <span className="font-semibold coding-text-strong shrink-0">{ev.actor}</span>
              <span className="coding-text-soft">{ev.event_type}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  </section>
);

const SectionPanel = ({ section, data, loading, error }) => (
  <section key={section.key} className="coding-surface rounded-2xl shadow-sm overflow-hidden">
    <header className="px-5 py-3 border-b coding-border flex items-start justify-between gap-3">
      <div>
        <h3 className="text-sm font-semibold coding-text-strong">{section.title}</h3>
        <p className="mt-0.5 text-xs coding-text-soft">{section.description}</p>
      </div>
      <span className="inline-flex items-center rounded-full bg-emerald-100 dark:bg-emerald-900/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-800 dark:text-emerald-100 shrink-0">
        {data.length} configured
      </span>
    </header>
    <div className="overflow-x-auto">
      {loading && (
        <div className="px-5 py-4 text-xs coding-text-soft">Loading...</div>
      )}
      {error && (
        <div className="px-5 py-4 text-xs text-rose-700 dark:text-rose-300">{error}</div>
      )}
      {!loading && !error && (
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800/60">
              {section.columns.map((col) => (
                <th
                  key={col}
                  className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wide coding-text-muted"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y coding-border">
            {data.length === 0 && (
              <tr>
                <td colSpan={section.columns.length} className="px-4 py-4 text-xs coding-text-soft">
                  No records yet.
                </td>
              </tr>
            )}
            {data.map((item) => (
              <tr key={item.id}>
                {section.renderRow(item).map((cell, idx) => (
                  <td key={idx} className="px-4 py-2 coding-text-strong">{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  </section>
);

const Member360LabAdminPage = () => {
  const { token, tenant } = useContext(AuthContext) || {};
  const [sectionData, setSectionData] = useState({});
  const [sectionLoading, setSectionLoading] = useState({});
  const [sectionError, setSectionError] = useState({});

  const [auditEvents, setAuditEvents] = useState([]);
  const [auditLoading, setAuditLoading] = useState(true);
  const [auditError, setAuditError] = useState(null);

  const loadSections = useCallback(async () => {
    const initialLoading = {};
    SECTIONS.forEach((s) => { initialLoading[s.key] = true; });
    setSectionLoading(initialLoading);

    await Promise.all(
      SECTIONS.map(async (section) => {
        try {
          const data = await section.fetch(token, tenant);
          setSectionData((prev) => ({ ...prev, [section.key]: data || [] }));
          setSectionError((prev) => ({ ...prev, [section.key]: null }));
        } catch (err) {
          setSectionError((prev) => ({ ...prev, [section.key]: err.message || 'Failed to load' }));
        } finally {
          setSectionLoading((prev) => ({ ...prev, [section.key]: false }));
        }
      }),
    );
  }, [token, tenant]);

  const loadAudit = useCallback(async () => {
    setAuditLoading(true);
    try {
      const data = await fetchAuditEvents(token, tenant);
      setAuditEvents(data?.items || []);
      setAuditError(null);
    } catch (err) {
      setAuditError(err.message || 'Failed to load audit events');
    } finally {
      setAuditLoading(false);
    }
  }, [token, tenant]);

  useEffect(() => {
    loadSections();
    loadAudit();
  }, [loadSections, loadAudit]);

  return (
    <PortalPageLayout
      eyebrow="Nexora Lab Member360"
      title="Admin"
      subtitle="Configure templates, risk rules, queues, channels, and care option policies. All edits are tenant-scoped and audited."
      navItems={PORTAL_NAV_ITEMS}
      currentNav="member360-lab"
      navProps={{ align: 'center', tone: 'surface' }}
      align="left"
      maxWidthClassName="max-w-7xl"
      mainClassName="space-y-4"
    >
      <LabSubNav />

      <AlertShell
        tone="info"
        title="Live admin"
        description="Tables below are read directly from the tenant database. Inline editing arrives in a follow-up — for now changes go through the API."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {SECTIONS.map((section) => (
          <SectionPanel
            key={section.key}
            section={section}
            data={sectionData[section.key] || []}
            loading={sectionLoading[section.key]}
            error={sectionError[section.key]}
          />
        ))}
        <AuditSection events={auditEvents} loading={auditLoading} error={auditError} />
      </div>
    </PortalPageLayout>
  );
};

export default Member360LabAdminPage;
