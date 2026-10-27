import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PortalPageLayout from '../../../components/PortalPageLayout';
import { AuthContext } from '../../../context/AuthContext';
import { usePermissions } from '../../../hooks/usePermissions';
import { useUserPreferences } from '../../../context/UserPreferencesContext';
import { LoadingState, ErrorState } from '../../../components/ehr/Primitives';
import { PORTAL_NAV_ITEMS } from '../portal_page/portalNavItems';
import { ROUTES } from '../../../constants/routes';
import {
  fetchMember360Documents,
  fetchMember360Members,
  uploadMember360Document,
} from '../../../services/member360LabService';
import { LabSubNav, Pagination, RiskBadge } from './components';

const PAGE_SIZE = 100;
const DEFAULT_DOCUMENT_TYPES = [
  'Care Summary',
  'Care Waiver',
  'Discharge Summary',
  'EOB',
  'Lab Report',
];
const DEFAULT_DOCUMENT_STATUSES = ['active', 'pending', 'expired'];
import FilterDropdown from '../../../components/ui/FilterDropdown';
import KpiTile from '../../../components/ui/KpiTile';
import SavedViewsBar from '../../../components/ui/SavedViewsBar';
import SearchInput from '../../../components/ui/SearchInput';

const SAVED_VIEWS = [
  { key: 'all', label: 'All documents' },
  { key: 'active', label: 'Active', status: 'active' },
  { key: 'waivers', label: 'Care waivers', waiversOnly: true },
  { key: 'recent', label: 'Last 7 days', recent: true },
];

const STATUS_TONE = {
  active: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200',
  expired: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200',
  pending: 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200',
};

const Member360LabDocumentsPage = () => {
  const navigate = useNavigate();
  const { token, tenant } = useContext(AuthContext) || {};
  const { currentRole } = usePermissions();
  const { t } = useUserPreferences();
  const isPatientRole = currentRole === 'patient';

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [types, setTypes] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [activeView, setActiveView] = useState('all');
  const [waiversOnly, setWaiversOnly] = useState(false);
  const [recent, setRecent] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  // Upload Document modal state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [memberRoster, setMemberRoster] = useState([]);
  const [uploadMemberId, setUploadMemberId] = useState('');
  const [uploadDocType, setUploadDocType] = useState('Care Summary');
  const [uploadFile, setUploadFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchMember360Documents(token, tenant, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE })
      .then((res) => {
        if (cancelled) return;
        setRows(res.items || []);
        setTotal(res.total || 0);
        setError(null);
      })
      .catch((err) => { if (!cancelled) setError(err.message || String(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, tenant, page, refreshTick]);

  useEffect(() => {
    if (!showUploadModal || isPatientRole || memberRoster.length > 0) return;
    fetchMember360Members(token, tenant, { limit: 100, offset: 0 })
      .then((res) => {
        const list = res?.items || [];
        setMemberRoster(list);
        if (list.length > 0 && !uploadMemberId) {
          setUploadMemberId(String(list[0].id));
        }
      })
      .catch(() => {});
  }, [showUploadModal, isPatientRole, memberRoster.length, token, tenant, uploadMemberId]);

  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    if (!uploadMemberId || !uploadFile) {
      setUploadError('Please select a member and a document file to upload.');
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      await uploadMember360Document(token, tenant, Number(uploadMemberId), uploadFile, {
        documentType: uploadDocType,
      });
      setShowUploadModal(false);
      setUploadFile(null);
      setRefreshTick((n) => n + 1);
    } catch (err) {
      setUploadError(err.message || 'Failed to upload document');
    } finally {
      setUploading(false);
    }
  };

  const allTypes = useMemo(() => {
    const set = new Set(DEFAULT_DOCUMENT_TYPES);
    rows.forEach((r) => { if (r.document_type) set.add(r.document_type); });
    return Array.from(set).sort();
  }, [rows]);

  const allStatuses = useMemo(() => {
    const set = new Set(DEFAULT_DOCUMENT_STATUSES);
    rows.forEach((r) => { if (r.status) set.add(r.status); });
    return Array.from(set).sort();
  }, [rows]);

  const applySavedView = (key) => {
    const view = SAVED_VIEWS.find((v) => v.key === key);
    setActiveView(key);
    setStatuses(view?.status ? [view.status] : []);
    setWaiversOnly(Boolean(view?.waiversOnly));
    setRecent(Boolean(view?.recent));
    setTypes([]);
  };

  const toggleType = (t) =>
    setTypes((prev) => (prev.includes(t) ? prev.filter((k) => k !== t) : [...prev, t]));
  const toggleStatus = (s) =>
    setStatuses((prev) => (prev.includes(s) ? prev.filter((k) => k !== s) : [...prev, s]));

  const filtered = useMemo(() => {
    const weekAgo = Date.now() - 7 * 86400000;
    return rows
      .filter((d) => {
        if (types.length > 0 && !types.includes(d.document_type)) return false;
        if (statuses.length > 0 && !statuses.includes(d.status)) return false;
        if (waiversOnly && !(d.document_type || '').toLowerCase().includes('waiver')) return false;
        if (recent && new Date(d.uploaded_at || 0).getTime() < weekAgo) return false;
        if (search) {
          const term = search.toLowerCase();
          const hay = [d.file_name, d.document_type, d.member_name, d.member_key, d.uploaded_by].filter(Boolean).join(' ').toLowerCase();
          if (!hay.includes(term)) return false;
        }
        return true;
      })
      .sort((a, b) => new Date(b.uploaded_at || 0) - new Date(a.uploaded_at || 0));
  }, [rows, search, types, statuses, waiversOnly, recent]);

  const summary = useMemo(() => {
    const total = rows.length;
    const active = rows.filter((d) => d.status === 'active').length;
    const waivers = rows.filter((d) => (d.document_type || '').toLowerCase().includes('waiver')).length;
    const memberCount = new Set(rows.map((d) => d.member_id)).size;
    return { total, active, waivers, memberCount };
  }, [rows]);

  const activeFilterCount =
    (types.length > 0 ? 1 : 0) + (statuses.length > 0 ? 1 : 0) + (waiversOnly ? 1 : 0) + (recent ? 1 : 0);

  return (
    <PortalPageLayout
      eyebrow="Nexora Lab Member360"
      title={isPatientRole ? t('My Health Documents') : t('Documents')}
      subtitle={
        isPatientRole
          ? 'Your personal care summaries, waivers, EOBs, and clinical records.'
          : 'Care waivers, consents, and attached files surfaced across the population.'
      }
      navItems={PORTAL_NAV_ITEMS}
      currentNav="member360-lab"
      navProps={{ align: 'center', tone: 'surface' }}
      align="left"
      maxWidthClassName="max-w-7xl"
      mainClassName="space-y-4"
    >
      {!isPatientRole && <LabSubNav />}

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile label="All documents" value={summary.total} />
        <KpiTile label="Active" value={summary.active} tone="success" />
        <KpiTile label="Care waivers" value={summary.waivers} />
        <KpiTile label={isPatientRole ? 'Document types' : 'Members with files'} value={isPatientRole ? new Set(rows.map((d) => d.document_type)).size : summary.memberCount} />
      </section>

      <SavedViewsBar views={SAVED_VIEWS} activeKey={activeView} onChange={applySavedView} />

      <section className="coding-surface rounded-2xl shadow-sm">
        <div className="p-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <SearchInput
            placeholder="Search file, type, member, or uploader"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            wrapperClassName="flex-1"
          />
          {!isPatientRole && (
            <button
              type="button"
              onClick={() => setShowUploadModal(true)}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[var(--brand-primary)] px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:opacity-90 shrink-0"
            >
              + Upload Document
            </button>
          )}
        </div>
        <div className="border-t coding-border px-3 py-2 flex flex-wrap items-center gap-1.5 text-xs">
          <FilterDropdown label="Type" count={types.length}>
            <div className="flex flex-col gap-1 min-w-[220px] max-h-[280px] overflow-y-auto">
              {allTypes.map((tItem) => (
                <label key={tItem} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-[var(--coding-hover)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={types.includes(tItem)}
                    onChange={() => toggleType(tItem)}
                    className="accent-[var(--brand-primary)]"
                  />
                  <span className="coding-text-strong">{tItem}</span>
                </label>
              ))}
            </div>
          </FilterDropdown>
          <FilterDropdown label="Status" count={statuses.length}>
            <div className="flex flex-col gap-1 min-w-[180px]">
              {allStatuses.map((s) => (
                <label key={s} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-[var(--coding-hover)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={statuses.includes(s)}
                    onChange={() => toggleStatus(s)}
                    className="accent-[var(--brand-primary)]"
                  />
                  <span className="coding-text-strong capitalize">{s}</span>
                </label>
              ))}
            </div>
          </FilterDropdown>
          <button
            type="button"
            onClick={() => setWaiversOnly((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-md ring-1 px-2.5 py-1.5 text-xs font-medium transition ${
              waiversOnly
                ? 'ring-[var(--brand-primary)] text-[var(--brand-primary)] bg-brand-50 dark:bg-brand-900/20'
                : 'coding-border coding-text-strong bg-transparent hover:bg-[var(--coding-hover)]'
            }`}
          >
            Waivers only
          </button>
          <button
            type="button"
            onClick={() => setRecent((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-md ring-1 px-2.5 py-1.5 text-xs font-medium transition ${
              recent
                ? 'ring-[var(--brand-primary)] text-[var(--brand-primary)] bg-brand-50 dark:bg-brand-900/20'
                : 'coding-border coding-text-strong bg-transparent hover:bg-[var(--coding-hover)]'
            }`}
          >
            Last 7 days
          </button>
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={() => applySavedView('all')}
              className="ml-1 text-xs font-medium text-[var(--brand-primary)] hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      </section>

      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl border coding-border coding-surface p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b coding-border pb-3">
              <h3 className="text-base font-bold coding-text-strong">Upload Clinical Document</h3>
              <button
                type="button"
                onClick={() => setShowUploadModal(false)}
                className="coding-text-muted hover:coding-text-strong"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleUploadSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold coding-text-muted mb-1">Member *</label>
                <select
                  value={uploadMemberId}
                  onChange={(e) => setUploadMemberId(e.target.value)}
                  required
                  className="w-full rounded-lg border coding-border bg-transparent px-3 py-2 text-xs coding-text-strong"
                >
                  {memberRoster.map((m) => (
                    <option key={m.id} value={m.id} className="bg-slate-900 text-white">
                      {m.first_name} {m.last_name} ({m.member_key})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold coding-text-muted mb-1">Document Type *</label>
                <select
                  value={uploadDocType}
                  onChange={(e) => setUploadDocType(e.target.value)}
                  className="w-full rounded-lg border coding-border bg-transparent px-3 py-2 text-xs coding-text-strong"
                >
                  {DEFAULT_DOCUMENT_TYPES.map((dt) => (
                    <option key={dt} value={dt} className="bg-slate-900 text-white">
                      {dt}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold coding-text-muted mb-1">Select File *</label>
                <input
                  type="file"
                  required
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  className="w-full text-xs coding-text-soft"
                />
              </div>
              {uploadError && <p className="text-xs text-rose-500">{uploadError}</p>}
              <div className="flex items-center justify-end gap-2 pt-2 border-t coding-border">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="px-3 py-1.5 rounded-lg text-xs coding-text-muted hover:coding-text-strong"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading}
                  className="px-4 py-1.5 rounded-lg bg-[var(--brand-primary)] text-xs font-semibold text-white"
                >
                  {uploading ? 'Uploading...' : 'Upload'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading && <LoadingState title="Loading documents" />}
      {error && <ErrorState title="Documents unavailable" description={error} />}

      {!loading && !error && (
        <section className="coding-surface rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 flex items-center justify-between text-xs coding-text-muted border-b coding-border">
            <span>
              {filtered.length} document{filtered.length === 1 ? '' : 's'} shown
              {rows.length !== filtered.length ? ` (filtered from ${rows.length} on this page)` : ''}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wider coding-text-muted">
                <tr className="border-b coding-border">
                  <th className="text-left px-4 py-2.5 font-semibold">File</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Type</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Member</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Uploaded</th>
                  <th className="text-left px-3 py-2.5 font-semibold">By</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => (
                  <tr
                    key={d.id}
                    className={`${isPatientRole ? '' : 'cursor-pointer'} border-b coding-border-subtle hover:bg-[var(--coding-hover)] transition`}
                    onClick={() => {
                      if (!isPatientRole) {
                        navigate(`${ROUTES.MEMBER360_LAB.MEMBER_WORKSPACE_ROOT}/${d.member_id}`);
                      }
                    }}
                  >
                    <td className="px-4 py-3 font-mono text-xs coding-text-strong">{d.file_name}</td>
                    <td className="px-3 py-3 text-xs">
                      <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 coding-text-muted">{d.document_type || '—'}</span>
                    </td>
                    <td className="px-3 py-3">
                      <p className="coding-text-strong font-medium">{d.member_name || '—'}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-[11px] coding-text-muted">{d.member_key}</p>
                        {d.risk_tier && <RiskBadge tier={d.risk_tier} />}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs coding-text-soft">{d.uploaded_at ? new Date(d.uploaded_at).toLocaleString() : '—'}</td>
                    <td className="px-3 py-3 text-xs coding-text-soft">{d.uploaded_by || '—'}</td>
                    <td className="px-3 py-3 text-xs">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 capitalize ${STATUS_TONE[d.status] || STATUS_TONE.active}`}>
                        {d.status || 'active'}
                      </span>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="px-3 py-12 text-center text-sm coding-text-soft">No documents on file.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} label="documents" />
          <p className="text-[11px] coding-text-muted px-4 py-2 border-t coding-border">
            Upload, preview, and audit workflows arrive in a future phase — this surface indexes existing files attached to member workspaces.
          </p>
        </section>
      )}
    </PortalPageLayout>
  );
};

export default Member360LabDocumentsPage;
