import React, { useCallback, useContext, useEffect, useState } from 'react';
import PortalPageLayout from '../../../components/PortalPageLayout';
import AlertShell from '../../../components/ui/AlertShell';
import WorkspaceDrawer from '../../../components/ui/WorkspaceDrawer';
import { AuthContext } from '../../../context/AuthContext';
import { PORTAL_NAV_ITEMS } from '../portal_page/portalNavItems';
import {
  createCareOptionPolicy,
  createOutreachChannel,
  createRiskRule,
  createTaskQueue,
  createTemplate,
  deleteCareOptionPolicy,
  deleteOutreachChannel,
  deleteRiskRule,
  deleteTaskQueue,
  deleteTemplate,
  fetchAuditEvents,
  fetchCareOptionPolicies,
  fetchOutreachChannels,
  fetchRiskRules,
  fetchTaskQueues,
  fetchTemplates,
  updateCareOptionPolicy,
  updateOutreachChannel,
  updateRiskRule,
  updateTaskQueue,
  updateTemplate,
} from '../../../services/member360AdminService';
import { LabSubNav } from './components';
import { usePermissions } from '../../../hooks/usePermissions';

// Each section: how to render rows + which form schema drives the editor +
// which service functions handle CRUD. Keeping these co-located makes it
// easy to add a section: drop one more entry in SECTIONS and the rest
// (Add/Edit/Delete, drawer form, validation) just works.
const RISK_TIERS = ['', 'Low', 'Medium', 'High', 'Critical'];

const SECTIONS = [
  {
    key: 'templates',
    title: 'Care journey templates',
    description:
      'Reusable outreach playbooks. Stages and default tasks are picked up automatically when journeys launch.',
    columns: ['Name', 'Category', 'Risk tier', 'Stages', 'Default tasks'],
    fetch: fetchTemplates,
    create: createTemplate,
    update: updateTemplate,
    remove: deleteTemplate,
    rowLabel: (item) => item.name,
    singular: 'template',
    renderRow: (item) => [
      item.name,
      item.category || '-',
      item.recommended_for_risk_tier || '-',
      (item.default_stages || []).length,
      (item.default_tasks || []).length,
    ],
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'category', label: 'Category', type: 'text', placeholder: 'Cardiac, Diabetes, ...' },
      { key: 'recommended_for_risk_tier', label: 'Recommended for risk tier', type: 'select', options: RISK_TIERS },
      { key: 'description', label: 'Description', type: 'textarea' },
      {
        key: 'default_stages',
        label: 'Default stages (JSON array)',
        type: 'json',
        defaultValue: [],
        placeholder: '[{"sequence": 0, "name": "Intake", "status": "pending"}]',
      },
      {
        key: 'default_tasks',
        label: 'Default tasks (JSON array)',
        type: 'json',
        defaultValue: [],
        placeholder: '[{"title": "Outreach call", "priority": "medium"}]',
      },
    ],
  },
  {
    key: 'risk_rules',
    title: 'Risk rules & insight catalog',
    description:
      'Per-domain scoring rules used to produce composite risk and driver explanations.',
    columns: ['Name', 'Domain', 'Weight', 'Threshold', 'Active'],
    fetch: fetchRiskRules,
    create: createRiskRule,
    update: updateRiskRule,
    remove: deleteRiskRule,
    rowLabel: (item) => item.name,
    singular: 'risk rule',
    renderRow: (item) => [
      item.name,
      item.domain,
      Number(item.weight ?? 0).toFixed(2),
      item.threshold ?? '-',
      item.is_active ? 'Yes' : 'No',
    ],
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'domain', label: 'Domain', type: 'select', required: true,
        options: ['Clinical', 'Utilization', 'Cost', 'Engagement'] },
      { key: 'weight', label: 'Weight', type: 'number', defaultValue: 1.0 },
      { key: 'threshold', label: 'Threshold', type: 'number' },
      { key: 'description', label: 'Description', type: 'textarea' },
      { key: 'recommendation_template', label: 'Recommendation template', type: 'textarea',
        placeholder: 'e.g. Schedule diabetes coaching with {pcp}' },
      { key: 'is_active', label: 'Active', type: 'boolean', defaultValue: true },
    ],
  },
  {
    key: 'queues',
    title: 'Task queues & routing',
    description:
      'Queues, SLA timers per priority, and escalation routing. Tasks land here based on routing rules.',
    columns: ['Name', 'Description', 'SLA (urgent/high)', 'Escalates to', 'Active'],
    fetch: fetchTaskQueues,
    create: createTaskQueue,
    update: updateTaskQueue,
    remove: deleteTaskQueue,
    rowLabel: (item) => item.name,
    singular: 'task queue',
    renderRow: (item) => [
      item.name,
      item.description || '-',
      `${item.sla_priority_hours?.urgent ?? '-'}h / ${item.sla_priority_hours?.high ?? '-'}h`,
      item.escalation_queue || '-',
      item.is_active ? 'Yes' : 'No',
    ],
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true,
        placeholder: 'RN, MD, Pharmacy, ...' },
      { key: 'description', label: 'Description', type: 'textarea' },
      { key: 'sla_priority_hours', label: 'SLA priority hours (JSON)', type: 'json',
        defaultValue: { urgent: 1, high: 4, medium: 24 },
        placeholder: '{"urgent": 1, "high": 4, "medium": 24}' },
      { key: 'escalation_queue', label: 'Escalates to', type: 'text',
        placeholder: 'Name of another queue (optional)' },
      { key: 'routing_rules', label: 'Routing rules (JSON)', type: 'json',
        defaultValue: {},
        placeholder: '{"risk_tier": ["High", "Critical"]}' },
      { key: 'is_active', label: 'Active', type: 'boolean', defaultValue: true },
    ],
  },
  {
    key: 'channels',
    title: 'Outreach channels & integrations',
    description: 'Channel providers, consent rules, and language coverage.',
    columns: ['Channel', 'Provider', 'Consent', 'Languages', 'Active'],
    fetch: fetchOutreachChannels,
    create: createOutreachChannel,
    update: updateOutreachChannel,
    remove: deleteOutreachChannel,
    rowLabel: (item) => `${item.channel_type}${item.provider ? ` (${item.provider})` : ''}`,
    singular: 'outreach channel',
    renderRow: (item) => [
      item.channel_type,
      item.provider || '-',
      item.consent_required ? 'Required' : 'Optional',
      (item.preferred_languages || []).join(', ') || '-',
      item.is_active ? 'Yes' : 'No',
    ],
    fields: [
      { key: 'channel_type', label: 'Channel type', type: 'select', required: true,
        options: ['SMS', 'Chat', 'Secure Message', 'Email', 'Phone', 'Mail'] },
      { key: 'provider', label: 'Provider', type: 'text',
        placeholder: 'dryrun, twilio, sendgrid, talkdesk, ...' },
      { key: 'consent_required', label: 'Consent required', type: 'boolean', defaultValue: true },
      { key: 'preferred_languages', label: 'Preferred languages (comma-separated)', type: 'list',
        placeholder: 'en, es, zh' },
      { key: 'config', label: 'Provider config (JSON)', type: 'json',
        defaultValue: {},
        placeholder: '{"from_number": "+15551234567"}' },
      { key: 'is_active', label: 'Active', type: 'boolean', defaultValue: true },
    ],
  },
  {
    key: 'care_options',
    title: 'Care options policies',
    description: 'Steerage criteria — distance, quality floor, minimum savings, and network tier per service.',
    columns: ['Service', 'LOB', 'Max distance', 'Min quality', 'Min savings', 'Tier'],
    fetch: fetchCareOptionPolicies,
    create: createCareOptionPolicy,
    update: updateCareOptionPolicy,
    remove: deleteCareOptionPolicy,
    rowLabel: (item) => item.service_type,
    singular: 'care option policy',
    renderRow: (item) => [
      item.service_type,
      item.line_of_business || 'Any',
      item.max_distance_miles != null ? `${item.max_distance_miles} mi` : '-',
      item.min_quality_score != null ? item.min_quality_score : '-',
      item.min_savings_threshold != null ? `$${item.min_savings_threshold}` : '-',
      item.network_tier || '-',
    ],
    fields: [
      { key: 'service_type', label: 'Service type', type: 'text', required: true,
        placeholder: 'MRI - Shoulder' },
      { key: 'line_of_business', label: 'Line of business', type: 'text',
        placeholder: 'Commercial, Medicare, ...' },
      { key: 'max_distance_miles', label: 'Max distance (mi)', type: 'number' },
      { key: 'min_quality_score', label: 'Min quality score', type: 'number' },
      { key: 'min_savings_threshold', label: 'Min savings ($)', type: 'number' },
      { key: 'network_tier', label: 'Network tier', type: 'select',
        options: ['', 'In Network', 'Out of Network', 'Tier 1', 'Tier 2'] },
      { key: 'notes', label: 'Notes', type: 'textarea' },
      { key: 'is_active', label: 'Active', type: 'boolean', defaultValue: true },
    ],
  },
];

// ── Form primitives ────────────────────────────────────────────────────────-

function TextField({ label, value, onChange, type = 'text', placeholder }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-semibold coding-text-muted uppercase tracking-wider mb-1">{label}</span>
      <input
        type={type}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="coding-input w-full rounded-md px-2 py-1.5 text-sm"
      />
    </label>
  );
}

function NumberField({ label, value, onChange, placeholder }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-semibold coding-text-muted uppercase tracking-wider mb-1">{label}</span>
      <input
        type="number"
        step="any"
        value={value === null || value === undefined ? '' : value}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        placeholder={placeholder}
        className="coding-input w-full rounded-md px-2 py-1.5 text-sm"
      />
    </label>
  );
}

function TextareaField({ label, value, onChange, rows = 3, placeholder }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-semibold coding-text-muted uppercase tracking-wider mb-1">{label}</span>
      <textarea
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="coding-input w-full rounded-md px-2 py-1.5 text-sm font-mono"
      />
    </label>
  );
}

function BooleanField({ label, value, onChange }) {
  return (
    <label className="flex items-center gap-2 text-sm coding-text-strong cursor-pointer select-none">
      <input
        type="checkbox"
        checked={!!value}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded"
      />
      {label}
    </label>
  );
}

function SelectField({ label, value, onChange, options, required }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-semibold coding-text-muted uppercase tracking-wider mb-1">{label}</span>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="coding-input w-full rounded-md px-2 py-1.5 text-sm"
        required={required}
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>{opt || '— none —'}</option>
        ))}
      </select>
    </label>
  );
}

// Stores the raw textarea value so users can type freely (e.g. half-typed
// JSON), then validates only on submit. Avoids fighting the user mid-keypress.
function JsonField({ label, value, onChange, placeholder, errorAtKey }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-semibold coding-text-muted uppercase tracking-wider mb-1">{label}</span>
      <textarea
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        placeholder={placeholder}
        className="coding-input w-full rounded-md px-2 py-1.5 text-xs font-mono"
      />
      {errorAtKey && (
        <span className="block mt-1 text-[11px] text-rose-700 dark:text-rose-300">{errorAtKey}</span>
      )}
    </label>
  );
}

function ListField({ label, value, onChange, placeholder }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-semibold coding-text-muted uppercase tracking-wider mb-1">{label}</span>
      <input
        type="text"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="coding-input w-full rounded-md px-2 py-1.5 text-sm"
      />
      <span className="block mt-1 text-[11px] coding-text-soft">Comma-separated.</span>
    </label>
  );
}

// ── Edit drawer ─────────────────────────────────────────────────────────────

/**
 * Pre-fills the form for editing or seeds defaults for adding. JSON / list
 * fields are stored as their raw text representation in form state so the
 * user can type freely; we only parse on submit.
 */
function buildInitialForm(section, row) {
  const out = {};
  for (const f of section.fields) {
    const existing = row ? row[f.key] : undefined;
    if (f.type === 'json') {
      const value = existing ?? f.defaultValue ?? null;
      out[f.key] = value == null ? '' : JSON.stringify(value, null, 2);
    } else if (f.type === 'list') {
      out[f.key] = Array.isArray(existing) ? existing.join(', ') : '';
    } else if (f.type === 'boolean') {
      out[f.key] = existing == null ? !!f.defaultValue : !!existing;
    } else {
      out[f.key] = existing == null ? (f.defaultValue ?? '') : existing;
    }
  }
  return out;
}

/**
 * Convert form state back to the API payload. JSON and list fields are
 * parsed here — failures surface as per-field errors so the user can
 * correct them without losing the rest of the form.
 */
function serializeForm(section, form) {
  const payload = {};
  const errors = {};
  for (const f of section.fields) {
    const raw = form[f.key];
    if (f.type === 'json') {
      if (raw === '' || raw == null) {
        payload[f.key] = f.defaultValue ?? null;
        continue;
      }
      try {
        payload[f.key] = JSON.parse(raw);
      } catch (err) {
        errors[f.key] = `Invalid JSON: ${err.message}`;
      }
    } else if (f.type === 'list') {
      payload[f.key] = String(raw || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (f.type === 'number') {
      payload[f.key] = raw === '' || raw == null ? null : Number(raw);
    } else if (f.type === 'boolean') {
      payload[f.key] = !!raw;
    } else {
      payload[f.key] = raw === '' ? null : raw;
    }
    if (f.required && (payload[f.key] == null || payload[f.key] === '')) {
      errors[f.key] = `${f.label} is required`;
    }
  }
  return { payload, errors };
}

function EditDrawer({ section, row, token, tenant, onClose, onSaved }) {
  const isEdit = !!row;
  const [form, setForm] = useState(() => buildInitialForm(section, row));
  const [fieldErrors, setFieldErrors] = useState({});
  const [topError, setTopError] = useState(null);
  const [saving, setSaving] = useState(false);

  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async () => {
    setTopError(null);
    const { payload, errors } = serializeForm(section, form);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setSaving(true);
    try {
      if (isEdit) {
        await section.update(token, tenant, row.id, payload);
      } else {
        await section.create(token, tenant, payload);
      }
      onSaved();
    } catch (err) {
      setTopError(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <WorkspaceDrawer
      title={`${isEdit ? 'Edit' : 'Add'} ${section.singular}`}
      subtitle={isEdit ? section.rowLabel(row) : undefined}
      width="lg"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-md ring-1 coding-border coding-text-strong bg-transparent hover:bg-[var(--coding-hover)] px-3 py-1.5 text-xs font-semibold">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="rounded-md bg-[var(--brand-primary)] text-white px-3 py-1.5 text-xs font-semibold hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create'}
          </button>
        </>
      }
    >
      {topError && (
        <div className="rounded-lg ring-1 ring-rose-200 dark:ring-rose-700/40 bg-rose-50/60 dark:bg-rose-900/20 px-3 py-2 text-xs coding-text-strong">
          {topError}
        </div>
      )}

      <div className="space-y-3">
        {section.fields.map((f) => {
          const value = form[f.key];
          const onChange = (v) => update(f.key, v);
          if (f.type === 'text')      return <TextField     key={f.key} label={f.label} value={value} onChange={onChange} placeholder={f.placeholder} />;
          if (f.type === 'number')    return <NumberField   key={f.key} label={f.label} value={value} onChange={onChange} placeholder={f.placeholder} />;
          if (f.type === 'textarea')  return <TextareaField key={f.key} label={f.label} value={value} onChange={onChange} placeholder={f.placeholder} />;
          if (f.type === 'boolean')   return <BooleanField  key={f.key} label={f.label} value={value} onChange={onChange} />;
          if (f.type === 'select')    return <SelectField   key={f.key} label={f.label} value={value} onChange={onChange} options={f.options} required={f.required} />;
          if (f.type === 'json')      return <JsonField     key={f.key} label={f.label} value={value} onChange={onChange} placeholder={f.placeholder} errorAtKey={fieldErrors[f.key]} />;
          if (f.type === 'list')      return <ListField     key={f.key} label={f.label} value={value} onChange={onChange} placeholder={f.placeholder} />;
          return null;
        })}
        {/* Required-field errors don't have a per-field slot for text inputs;
            surface them all together below the form. */}
        {Object.entries(fieldErrors)
          .filter(([k]) => section.fields.find((f) => f.key === k)?.type !== 'json')
          .map(([k, msg]) => (
            <p key={k} className="text-[11px] text-rose-700 dark:text-rose-300">{msg}</p>
          ))}
      </div>
    </WorkspaceDrawer>
  );
}

// ── Audit panel + section panel ────────────────────────────────────────────-

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

const SectionPanel = ({ section, data, loading, error, onAdd, onEdit, onDelete }) => (
  <section key={section.key} className="coding-surface rounded-2xl shadow-sm overflow-hidden">
    <header className="px-5 py-3 border-b coding-border flex items-start justify-between gap-3">
      <div>
        <h3 className="text-sm font-semibold coding-text-strong">{section.title}</h3>
        <p className="mt-0.5 text-xs coding-text-soft">{section.description}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="inline-flex items-center rounded-full bg-emerald-100 dark:bg-emerald-900/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-800 dark:text-emerald-100">
          {data.length} configured
        </span>
        <button
          type="button"
          onClick={onAdd}
          className="rounded-md bg-[var(--brand-primary)] text-white px-2.5 py-1 text-[11px] font-semibold hover:opacity-90"
        >
          + Add
        </button>
      </div>
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
              <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wide coding-text-muted" aria-label="actions" />
            </tr>
          </thead>
          <tbody className="divide-y coding-border">
            {data.length === 0 && (
              <tr>
                <td colSpan={section.columns.length + 1} className="px-4 py-4 text-xs coding-text-soft">
                  No records yet.
                </td>
              </tr>
            )}
            {data.map((item) => (
              <tr key={item.id} className="group">
                {section.renderRow(item).map((cell, idx) => (
                  <td key={idx} className="px-4 py-2 coding-text-strong">{cell}</td>
                ))}
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => onEdit(item)}
                    className="rounded-md coding-surface coding-text-strong ring-1 ring-black/5 dark:ring-white/10 px-2 py-1 text-[11px] hover:opacity-80 mr-1.5"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(item)}
                    className="rounded-md bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-200 ring-1 ring-rose-200 dark:ring-rose-700/40 px-2 py-1 text-[11px] hover:opacity-80"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  </section>
);

// ── Page ─────────────────────────────────────────────────────────────────-─-

const Member360LabAdminPage = () => {
  const { token, tenant } = useContext(AuthContext) || {};
  const { isAdmin } = usePermissions();
  const [sectionData, setSectionData] = useState({});
  const [sectionLoading, setSectionLoading] = useState({});
  const [sectionError, setSectionError] = useState({});

  const [auditEvents, setAuditEvents] = useState([]);
  const [auditLoading, setAuditLoading] = useState(true);
  const [auditError, setAuditError] = useState(null);

  // Editing state: which section + which row (null row = "add new").
  const [editing, setEditing] = useState(null);

  const loadSection = useCallback(async (section) => {
    setSectionLoading((prev) => ({ ...prev, [section.key]: true }));
    try {
      const data = await section.fetch(token, tenant);
      setSectionData((prev) => ({ ...prev, [section.key]: data || [] }));
      setSectionError((prev) => ({ ...prev, [section.key]: null }));
    } catch (err) {
      setSectionError((prev) => ({ ...prev, [section.key]: err.message || 'Failed to load' }));
    } finally {
      setSectionLoading((prev) => ({ ...prev, [section.key]: false }));
    }
  }, [token, tenant]);

  const loadAllSections = useCallback(async () => {
    await Promise.all(SECTIONS.map(loadSection));
  }, [loadSection]);

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
    if (!isAdmin) return;
    loadAllSections();
    loadAudit();
  }, [isAdmin, loadAllSections, loadAudit]);

  const handleDelete = async (section, item) => {
    const confirmed = window.confirm(
      `Delete this ${section.singular}?\n\n${section.rowLabel(item)}\n\nThis action cannot be undone.`,
    );
    if (!confirmed) return;
    try {
      await section.remove(token, tenant, item.id);
      await loadSection(section);
      await loadAudit();
    } catch (err) {
      setSectionError((prev) => ({ ...prev, [section.key]: err.message || 'Delete failed' }));
    }
  };

  if (!isAdmin) {
    return (
      <PortalPageLayout
        eyebrow="Arc-8 Member360"
        title="Admin Settings"
        subtitle="Access restricted to platform and tenant administrators."
        navItems={PORTAL_NAV_ITEMS}
        currentNav="member360-lab"
        navProps={{ align: 'center', tone: 'surface' }}
        align="left"
        maxWidthClassName="max-w-7xl"
        mainClassName="space-y-4"
      >
        <LabSubNav />
        <AlertShell
          tone="critical"
          title="Administrative Access Restricted"
          description="Your current role does not have authorization to view or configure Member 360 administrative templates, routing queues, or risk rules. Please switch to an Administrator persona or contact your supervisor."
        />
      </PortalPageLayout>
    );
  }

  return (
    <PortalPageLayout
      eyebrow="Arc-8 Member360"
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
        description="Tables below are read directly from the tenant database. Click Add or Edit on any row to change configuration — all writes go through the audited admin API."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {SECTIONS.map((section) => (
          <SectionPanel
            key={section.key}
            section={section}
            data={sectionData[section.key] || []}
            loading={sectionLoading[section.key]}
            error={sectionError[section.key]}
            onAdd={() => setEditing({ section, row: null })}
            onEdit={(row) => setEditing({ section, row })}
            onDelete={(row) => handleDelete(section, row)}
          />
        ))}
        <AuditSection events={auditEvents} loading={auditLoading} error={auditError} />
      </div>

      {editing && (
        <EditDrawer
          section={editing.section}
          row={editing.row}
          token={token}
          tenant={tenant}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            await loadSection(editing.section);
            await loadAudit();
            setEditing(null);
          }}
        />
      )}
    </PortalPageLayout>
  );
};

export default Member360LabAdminPage;
