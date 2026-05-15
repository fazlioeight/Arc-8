import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PortalPageLayout from '../../../components/PortalPageLayout';
import { AuthContext } from '../../../context/AuthContext';
import { LoadingState, ErrorState } from '../../../components/ehr/Primitives';
import { PORTAL_NAV_ITEMS } from '../portal_page/portalNavItems';
import { ROUTES } from '../../../constants/routes';
import {
  fetchMember360AllJourneys,
  fetchMember360JourneyTemplates,
} from '../../../services/member360LabService';
import { CareJourneyCard, LabSubNav, RiskBadge, SectionCard } from './components';

const JOURNEY_STATUSES = ['any', 'active', 'paused', 'completed', 'cancelled'];

const Member360LabCareJourneysPage = () => {
  const navigate = useNavigate();
  const { token, tenant } = useContext(AuthContext) || {};
  const [templates, setTemplates] = useState([]);
  const [journeys, setJourneys] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [statusFilter, setStatusFilter] = useState('active');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetchMember360JourneyTemplates(token, tenant),
      fetchMember360AllJourneys(token, tenant),
    ])
      .then(([tpl, js]) => {
        if (cancelled) return;
        setTemplates(tpl || []);
        setJourneys(js || []);
        setSelectedTemplateId((prev) => prev ?? (tpl && tpl[0]?.id) ?? null);
        setError(null);
      })
      .catch((err) => { if (!cancelled) setError(err.message || String(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, tenant]);

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === selectedTemplateId) || null,
    [templates, selectedTemplateId]
  );

  const filteredJourneys = useMemo(() => {
    return journeys.filter((j) => {
      if (statusFilter !== 'any' && j.status !== statusFilter) return false;
      if (search) {
        const term = search.toLowerCase();
        const hay = [j.name, j.template_name, j.member_name, j.member_key, j.assigned_to].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [journeys, statusFilter, search]);

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
        <div className="grid grid-cols-12 gap-4">
          {/* Template list */}
          <div className="col-span-12 lg:col-span-4">
            <SectionCard title="Journey templates" subtitle="Reusable playbooks with default stages and tasks.">
              <ul className="space-y-1.5">
                {templates.map((tpl) => {
                  const active = tpl.id === selectedTemplateId;
                  return (
                    <li key={tpl.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedTemplateId(tpl.id)}
                        className={`w-full text-left rounded-lg px-3 py-2 ring-1 transition ${active ? 'bg-[var(--brand-primary)]/10 ring-[var(--brand-primary)]/40' : 'coding-surface-subtle ring-black/5 dark:ring-white/10 hover:opacity-90'}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold coding-text-strong">{tpl.name}</p>
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
                  <li className="text-xs coding-text-soft">No templates configured.</li>
                )}
              </ul>
            </SectionCard>
          </div>

          {/* Template detail */}
          <div className="col-span-12 lg:col-span-8 space-y-4">
            {selectedTemplate ? (
              <SectionCard
                title={selectedTemplate.name}
                subtitle={`${selectedTemplate.category || 'General'} · Recommended for ${selectedTemplate.recommended_for_risk_tier || 'all risk tiers'}`}
              >
                <p className="text-sm coding-text-strong">{selectedTemplate.description}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                  <div>
                    <h4 className="text-xs uppercase tracking-wider coding-text-muted mb-2">Default stages</h4>
                    <ol className="space-y-1.5">
                      {(selectedTemplate.default_stages || []).map((s, idx) => (
                        <li key={idx} className="coding-surface-subtle rounded-lg px-3 py-2 text-sm coding-text-strong flex items-center gap-2">
                          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--brand-primary)] text-white text-[10px] font-semibold">{idx + 1}</span>
                          {s.name}
                        </li>
                      ))}
                      {(selectedTemplate.default_stages || []).length === 0 && (
                        <li className="text-xs coding-text-soft">No stages defined.</li>
                      )}
                    </ol>
                  </div>
                  <div>
                    <h4 className="text-xs uppercase tracking-wider coding-text-muted mb-2">Default tasks</h4>
                    <ul className="space-y-1.5">
                      {(selectedTemplate.default_tasks || []).map((t, idx) => (
                        <li key={idx} className="coding-surface-subtle rounded-lg px-3 py-2 text-sm">
                          <div className="flex items-center justify-between">
                            <span className="coding-text-strong">{t.title}</span>
                            <span className="text-[10px] uppercase tracking-wider coding-text-muted">{t.priority || 'medium'}</span>
                          </div>
                        </li>
                      ))}
                      {(selectedTemplate.default_tasks || []).length === 0 && (
                        <li className="text-xs coding-text-soft">No default tasks defined.</li>
                      )}
                    </ul>
                  </div>
                </div>
                <p className="text-[11px] coding-text-muted mt-3">
                  Editing templates from this surface is part of the Admin phase — for now this view documents the structure rendered into each member workspace.
                </p>
              </SectionCard>
            ) : (
              <SectionCard title="Select a template">
                <p className="text-xs coding-text-soft">Pick a template on the left to see its stages and default tasks.</p>
              </SectionCard>
            )}

            <SectionCard
              title="Active journeys"
              subtitle="Every journey currently attached to a member."
              action={(
                <div className="flex items-center gap-2">
                  <input
                    type="search"
                    placeholder="Search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="coding-input rounded-md px-2 py-1 text-xs"
                  />
                  <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="coding-input rounded-md px-2 py-1 text-xs">
                    {JOURNEY_STATUSES.map((s) => <option key={s} value={s}>{s === 'any' ? 'Any status' : s}</option>)}
                  </select>
                </div>
              )}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredJourneys.map((j) => (
                  <div key={j.id} className="space-y-2">
                    <div className="flex items-center justify-between gap-2 px-1">
                      <button
                        type="button"
                        onClick={() => navigate(`${ROUTES.MEMBER360_LAB.MEMBER_WORKSPACE_ROOT}/${j.member_id}`)}
                        className="text-xs coding-text-strong font-semibold hover:underline"
                      >
                        {j.member_name || `Member ${j.member_id}`}
                      </button>
                      <RiskBadge tier={j.risk_tier} />
                    </div>
                    <CareJourneyCard journey={j} />
                  </div>
                ))}
                {filteredJourneys.length === 0 && (
                  <p className="text-xs coding-text-soft col-span-full">No journeys match the current filters.</p>
                )}
              </div>
            </SectionCard>
          </div>
        </div>
      )}
    </PortalPageLayout>
  );
};

export default Member360LabCareJourneysPage;
