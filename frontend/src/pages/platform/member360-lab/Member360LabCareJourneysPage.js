import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PortalPageLayout from '../../../components/PortalPageLayout';
import { AuthContext } from '../../../context/AuthContext';
import { LoadingState, ErrorState } from '../../../components/ehr/Primitives';
import { PORTAL_NAV_ITEMS } from '../portal_page/portalNavItems';
import { ROUTES } from '../../../constants/routes';
import {
  fetchMember360CareJourneys,
  fetchMember360JourneyTemplates,
} from '../../../services/member360LabService';
import { CareJourneyCard, LabSubNav, Pagination, RiskBadge } from './components';

const PAGE_SIZE = 100;
import FilterDropdown from '../../../components/ui/FilterDropdown';
import KpiTile from '../../../components/ui/KpiTile';
import SearchInput from '../../../components/ui/SearchInput';

const JOURNEY_STATUSES = [
  { key: 'active', label: 'Active' },
  { key: 'paused', label: 'Paused' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
];

const Member360LabCareJourneysPage = () => {
  const navigate = useNavigate();
  const { token, tenant } = useContext(AuthContext) || {};
  const [templates, setTemplates] = useState([]);
  const [journeys, setJourneys] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [statuses, setStatuses] = useState(['active']);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetchMember360JourneyTemplates(token, tenant),
      fetchMember360CareJourneys(token, tenant, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    ])
      .then(([tpl, res]) => {
        if (cancelled) return;
        setTemplates(tpl || []);
        setJourneys(res?.items || []);
        setTotal(res?.total || 0);
        setSelectedTemplateId((prev) => prev ?? (tpl && tpl[0]?.id) ?? null);
        setError(null);
      })
      .catch((err) => { if (!cancelled) setError(err.message || String(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, tenant, page]);

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === selectedTemplateId) || null,
    [templates, selectedTemplateId]
  );

  const filteredJourneys = useMemo(() => {
    return journeys.filter((j) => {
      if (statuses.length > 0 && !statuses.includes(j.status)) return false;
      if (search) {
        const term = search.toLowerCase();
        const hay = [j.name, j.template_name, j.member_name, j.member_key, j.assigned_to].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [journeys, statuses, search]);

  const summary = useMemo(() => {
    const total = journeys.length;
    const active = journeys.filter((j) => j.status === 'active').length;
    const paused = journeys.filter((j) => j.status === 'paused').length;
    const completed = journeys.filter((j) => j.status === 'completed').length;
    return { templates: templates.length, total, active, paused, completed };
  }, [journeys, templates]);

  const toggleStatus = (key) =>
    setStatuses((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  return (
    <PortalPageLayout
      eyebrow="Nexora Lab Member360"
      title="Care Journeys"
      subtitle="Templates that codify outreach playbooks, and the live journeys running against your population."
      navItems={PORTAL_NAV_ITEMS}
      currentNav="member360-lab"
      navProps={{ align: 'center', tone: 'surface' }}
      align="left"
      maxWidthClassName="max-w-7xl"
      mainClassName="space-y-4"
    >
      <LabSubNav />

      {loading && <LoadingState title="Loading journeys" />}
      {error && <ErrorState title="Care journeys unavailable" description={error} />}

      {!loading && !error && (
        <>
          <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiTile label="Templates" value={summary.templates} />
            <KpiTile label="Active journeys" value={summary.active} tone="info" />
            <KpiTile label="Paused" value={summary.paused} tone="warning" />
            <KpiTile label="Completed" value={summary.completed} tone="success" />
          </section>

          <div className="grid grid-cols-12 gap-4">
            {/* Template list */}
            <div className="col-span-12 lg:col-span-4">
              <section className="coding-surface rounded-2xl shadow-sm overflow-hidden">
                <header className="px-4 py-2.5 border-b coding-border">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.14em] coding-text-muted">Journey templates</h3>
                  <p className="mt-0.5 text-[11px] coding-text-soft">Reusable playbooks with default stages and tasks.</p>
                </header>
                <ul>
                  {templates.map((tpl) => {
                    const active = tpl.id === selectedTemplateId;
                    return (
                      <li key={tpl.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedTemplateId(tpl.id)}
                          className={`w-full text-left border-b coding-border-subtle px-4 py-3 transition ${
                            active
                              ? 'bg-brand-50 dark:bg-brand-900/20 border-l-4 border-l-[var(--brand-primary)]'
                              : 'hover:bg-[var(--coding-hover)] border-l-4 border-l-transparent'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className={`text-sm font-medium ${active ? 'text-[var(--brand-primary)]' : 'coding-text-strong'}`}>{tpl.name}</p>
                            {tpl.recommended_for_risk_tier && (
                              <span className="text-[10px] uppercase tracking-wider rounded-full bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 coding-text-muted">{tpl.recommended_for_risk_tier}</span>
                            )}
                          </div>
                          <p className="text-[11px] coding-text-soft mt-0.5">{tpl.category || 'General'}</p>
                          <p className="text-xs coding-text-strong mt-1 line-clamp-2">{tpl.description}</p>
                        </button>
                      </li>
                    );
                  })}
                  {templates.length === 0 && (
                    <li className="px-4 py-8 text-center text-xs coding-text-soft">No templates configured.</li>
                  )}
                </ul>
              </section>
            </div>

            {/* Template detail + journeys */}
            <div className="col-span-12 lg:col-span-8 space-y-4">
              {selectedTemplate ? (
                <section className="coding-surface rounded-2xl shadow-sm p-5">
                  <header className="mb-3">
                    <h3 className="text-base font-semibold coding-text-strong">{selectedTemplate.name}</h3>
                    <p className="text-xs coding-text-soft">{selectedTemplate.category || 'General'} · Recommended for {selectedTemplate.recommended_for_risk_tier || 'all risk tiers'}</p>
                  </header>
                  <p className="text-sm coding-text-strong">{selectedTemplate.description}</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                    <div>
                      <h4 className="text-[11px] font-semibold uppercase tracking-[0.14em] coding-text-muted mb-2">Default stages</h4>
                      <ol className="space-y-1.5">
                        {(selectedTemplate.default_stages || []).map((s, idx) => (
                          <li key={idx} className="coding-surface-subtle rounded-md px-3 py-2 text-sm coding-text-strong flex items-center gap-2">
                            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--brand-primary)] text-white text-[10px] font-semibold">{idx + 1}</span>
                            {s.name}
                          </li>
                        ))}
                        {(selectedTemplate.default_stages || []).length === 0 && (
                          <li className="text-xs coding-text-soft italic">No stages defined.</li>
                        )}
                      </ol>
                    </div>
                    <div>
                      <h4 className="text-[11px] font-semibold uppercase tracking-[0.14em] coding-text-muted mb-2">Default tasks</h4>
                      <ul className="space-y-1.5">
                        {(selectedTemplate.default_tasks || []).map((t, idx) => (
                          <li key={idx} className="coding-surface-subtle rounded-md px-3 py-2 text-sm">
                            <div className="flex items-center justify-between">
                              <span className="coding-text-strong">{t.title}</span>
                              <span className="text-[10px] uppercase tracking-wider coding-text-muted">{t.priority || 'medium'}</span>
                            </div>
                          </li>
                        ))}
                        {(selectedTemplate.default_tasks || []).length === 0 && (
                          <li className="text-xs coding-text-soft italic">No default tasks defined.</li>
                        )}
                      </ul>
                    </div>
                  </div>
                  <p className="text-[11px] coding-text-muted mt-3">
                    Editing templates from this surface is part of the Admin phase — for now this view documents the structure rendered into each member workspace.
                  </p>
                </section>
              ) : (
                <section className="coding-surface rounded-2xl shadow-sm p-5">
                  <p className="text-sm coding-text-soft">Pick a template on the left to see its stages and default tasks.</p>
                </section>
              )}

              <section className="coding-surface rounded-2xl shadow-sm">
                <header className="flex items-start justify-between gap-3 px-5 py-3 border-b coding-border">
                  <div>
                    <h3 className="text-sm font-semibold coding-text-strong">Active journeys</h3>
                    <p className="text-xs coding-text-soft">Every journey currently attached to a member.</p>
                  </div>
                </header>
                <div className="px-3 py-2 flex items-center gap-2 border-b coding-border">
                  <SearchInput
                    placeholder="Search journey, member, or assignee"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <FilterDropdown label="Status" count={statuses.length}>
                    <div className="flex flex-col gap-1 min-w-[180px]">
                      {JOURNEY_STATUSES.map((s) => (
                        <label key={s.key} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-[var(--coding-hover)] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={statuses.includes(s.key)}
                            onChange={() => toggleStatus(s.key)}
                            className="accent-[var(--brand-primary)]"
                          />
                          <span className="coding-text-strong">{s.label}</span>
                        </label>
                      ))}
                    </div>
                  </FilterDropdown>
                </div>
                <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                  {filteredJourneys.map((j) => (
                    <div key={j.id} className="space-y-2">
                      <div className="flex items-center justify-between gap-2 px-1">
                        <button
                          type="button"
                          onClick={() => navigate(`${ROUTES.MEMBER360_LAB.MEMBER_WORKSPACE_ROOT}/${j.member_id}`)}
                          className="text-xs coding-text-strong font-semibold hover:text-[var(--brand-primary)] hover:underline"
                        >
                          {j.member_name || `Member ${j.member_id}`}
                        </button>
                        <RiskBadge tier={j.risk_tier} />
                      </div>
                      <CareJourneyCard journey={j} />
                    </div>
                  ))}
                  {filteredJourneys.length === 0 && (
                    <p className="text-sm coding-text-soft col-span-full text-center py-8">No journeys match the current filters.</p>
                  )}
                </div>
                <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} label="journeys" />
              </section>
            </div>
          </div>
        </>
      )}
    </PortalPageLayout>
  );
};

export default Member360LabCareJourneysPage;
