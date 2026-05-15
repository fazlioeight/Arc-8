import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PortalPageLayout from '../../../components/PortalPageLayout';
import { AuthContext } from '../../../context/AuthContext';
import { LoadingState, ErrorState } from '../../../components/ehr/Primitives';
import { PORTAL_NAV_ITEMS } from '../portal_page/portalNavItems';
import { ROUTES } from '../../../constants/routes';
import { fetchMember360AllDocuments } from '../../../services/member360LabService';
import { LabSubNav, MetricCard, RiskBadge, SectionCard } from './components';

const Member360LabDocumentsPage = () => {
  const navigate = useNavigate();
  const { token, tenant } = useContext(AuthContext) || {};
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('any');
  const [statusFilter, setStatusFilter] = useState('any');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchMember360AllDocuments(token, tenant)
      .then((items) => { if (!cancelled) { setRows(items); setError(null); } })
      .catch((err) => { if (!cancelled) setError(err.message || String(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, tenant]);

  const types = useMemo(() => {
    const set = new Set();
    rows.forEach((r) => { if (r.document_type) set.add(r.document_type); });
    return ['any', ...Array.from(set).sort()];
  }, [rows]);

  const statuses = useMemo(() => {
    const set = new Set();
    rows.forEach((r) => { if (r.status) set.add(r.status); });
    return ['any', ...Array.from(set).sort()];
  }, [rows]);

  const filtered = useMemo(() => {
    return rows
      .filter((d) => {
        if (typeFilter !== 'any' && d.document_type !== typeFilter) return false;
        if (statusFilter !== 'any' && d.status !== statusFilter) return false;
        if (search) {
          const term = search.toLowerCase();
          const hay = [d.file_name, d.document_type, d.member_name, d.member_key, d.uploaded_by].filter(Boolean).join(' ').toLowerCase();
          if (!hay.includes(term)) return false;
        }
        return true;
      })
      .sort((a, b) => new Date(b.uploaded_at || 0) - new Date(a.uploaded_at || 0));
  }, [rows, search, typeFilter, statusFilter]);

  const summary = useMemo(() => {
    const total = rows.length;
    const active = rows.filter((d) => d.status === 'active').length;
    const waivers = rows.filter((d) => (d.document_type || '').toLowerCase().includes('waiver')).length;
    const memberCount = new Set(rows.map((d) => d.member_id)).size;
    return { total, active, waivers, memberCount };
  }, [rows]);

  return (
    <PortalPageLayout
      eyebrow="Nexora Lab Member360"
      title="Documents"
      subtitle="Care waivers, consents, and attached files surfaced across the population."
      navItems={PORTAL_NAV_ITEMS}
      currentNav="member360-lab"
      navProps={{ align: 'center', tone: 'surface' }}
      align="left"
      maxWidthClassName="max-w-7xl"
      mainClassName="space-y-4"
    >
      <LabSubNav />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="All documents" value={summary.total} />
        <MetricCard label="Active" value={summary.active} />
        <MetricCard label="Care waivers" value={summary.waivers} />
        <MetricCard label="Members with files" value={summary.memberCount} />
      </div>

      <section className="coding-surface rounded-2xl p-4 shadow-sm">
        <div className="flex flex-col lg:flex-row gap-3">
          <input
            type="search"
            placeholder="Search by file name, type, member, or uploader"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="coding-input w-full rounded-lg px-3 py-2 text-sm"
          />
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="coding-input rounded-lg px-3 py-2 text-sm lg:w-56">
            {types.map((t) => <option key={t} value={t}>{t === 'any' ? 'Any type' : t}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="coding-input rounded-lg px-3 py-2 text-sm lg:w-44">
            {statuses.map((s) => <option key={s} value={s}>{s === 'any' ? 'Any status' : s}</option>)}
          </select>
        </div>
      </section>

      {loading && <LoadingState title="Loading documents" />}
      {error && <ErrorState title="Documents unavailable" description={error} />}

      {!loading && !error && (
        <SectionCard title={`${filtered.length} document${filtered.length === 1 ? '' : 's'}`}>
          <div className="overflow-x-auto rounded-lg ring-1 ring-black/5 dark:ring-white/10">
            <table className="min-w-full text-sm">
              <thead className="coding-surface-subtle text-xs uppercase tracking-wide coding-text-muted">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">File</th>
                  <th className="text-left px-3 py-2 font-medium">Type</th>
                  <th className="text-left px-3 py-2 font-medium">Member</th>
                  <th className="text-left px-3 py-2 font-medium">Uploaded</th>
                  <th className="text-left px-3 py-2 font-medium">By</th>
                  <th className="text-left px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y coding-divider">
                {filtered.map((d) => (
                  <tr
                    key={d.id}
                    className="cursor-pointer coding-hoverable"
                    onClick={() => navigate(`${ROUTES.MEMBER360_LAB.MEMBER_WORKSPACE_ROOT}/${d.member_id}`)}
                  >
                    <td className="px-3 py-2 font-mono text-xs coding-text-strong">{d.file_name}</td>
                    <td className="px-3 py-2 text-xs"><span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 coding-text-muted">{d.document_type || '—'}</span></td>
                    <td className="px-3 py-2">
                      <p className="coding-text-strong">{d.member_name || '—'}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-[11px] coding-text-muted">{d.member_key}</p>
                        {d.risk_tier && <RiskBadge tier={d.risk_tier} />}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs coding-text-soft">{d.uploaded_at ? new Date(d.uploaded_at).toLocaleString() : '—'}</td>
                    <td className="px-3 py-2 text-xs coding-text-soft">{d.uploaded_by || '—'}</td>
                    <td className="px-3 py-2 text-xs capitalize">
                      <span className="rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200 px-2 py-0.5">{d.status || 'active'}</span>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="px-3 py-8 text-center text-sm coding-text-soft">No documents on file.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] coding-text-muted mt-3">
            Upload, preview, and audit workflows arrive in a future phase — this surface indexes existing files attached to member workspaces.
          </p>
        </SectionCard>
      )}
    </PortalPageLayout>
  );
};

export default Member360LabDocumentsPage;
