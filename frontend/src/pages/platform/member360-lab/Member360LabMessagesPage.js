import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PortalPageLayout from '../../../components/PortalPageLayout';
import { AuthContext } from '../../../context/AuthContext';
import { LoadingState, ErrorState } from '../../../components/ehr/Primitives';
import { PORTAL_NAV_ITEMS } from '../portal_page/portalNavItems';
import { ROUTES } from '../../../constants/routes';
import { fetchMember360Messages } from '../../../services/member360LabService';
import { LabSubNav, Pagination, RiskBadge } from './components';

const PAGE_SIZE = 100;
import FilterDropdown from '../../../components/ui/FilterDropdown';
import KpiTile from '../../../components/ui/KpiTile';
import SavedViewsBar from '../../../components/ui/SavedViewsBar';
import SearchInput from '../../../components/ui/SearchInput';

const CHANNELS = ['SMS', 'Chat', 'Secure Message', 'Email', 'Phone'];
const DIRECTIONS = [
  { key: 'inbound', label: 'Inbound' },
  { key: 'outbound', label: 'Outbound' },
];

const SAVED_VIEWS = [
  { key: 'all', label: 'All messages' },
  { key: 'inbound', label: 'Inbound', direction: 'inbound' },
  { key: 'outbound', label: 'Outbound', direction: 'outbound' },
  { key: 'recent', label: 'Last 24 hours', recent: true },
];

const DIRECTION_ACCENT = {
  inbound: 'border-l-violet-400 dark:border-l-violet-500/60',
  outbound: 'border-l-sky-400 dark:border-l-sky-500/60',
};

const Member360LabMessagesPage = () => {
  const navigate = useNavigate();
  const { token, tenant } = useContext(AuthContext) || {};
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [channels, setChannels] = useState([]);
  const [direction, setDirection] = useState(null);
  const [recent, setRecent] = useState(false);
  const [activeView, setActiveView] = useState('all');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchMember360Messages(token, tenant, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE })
      .then((res) => {
        if (cancelled) return;
        setRows(res.items || []);
        setTotal(res.total || 0);
        setError(null);
      })
      .catch((err) => { if (!cancelled) setError(err.message || String(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, tenant, page]);

  const applySavedView = (key) => {
    const view = SAVED_VIEWS.find((v) => v.key === key);
    setActiveView(key);
    setDirection(view?.direction || null);
    setRecent(Boolean(view?.recent));
    setChannels([]);
  };

  const toggleChannel = (c) =>
    setChannels((prev) => (prev.includes(c) ? prev.filter((k) => k !== c) : [...prev, c]));

  const filtered = useMemo(() => {
    const dayAgo = Date.now() - 86400000;
    return rows
      .filter((m) => {
        if (channels.length > 0 && !channels.includes(m.channel)) return false;
        if (direction && m.direction !== direction) return false;
        if (recent && new Date(m.timestamp || 0).getTime() < dayAgo) return false;
        if (search) {
          const term = search.toLowerCase();
          const hay = [m.body, m.member_name, m.member_key, m.sender, m.recipient].filter(Boolean).join(' ').toLowerCase();
          if (!hay.includes(term)) return false;
        }
        return true;
      })
      .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
  }, [rows, search, channels, direction, recent]);

  const summary = useMemo(() => {
    const total = rows.length;
    const inbound = rows.filter((m) => m.direction === 'inbound').length;
    const outbound = rows.filter((m) => m.direction === 'outbound').length;
    const now = Date.now();
    const last24 = rows.filter((m) => now - new Date(m.timestamp || 0).getTime() < 86400000).length;
    return { total, inbound, outbound, last24 };
  }, [rows]);

  const activeFilterCount =
    (channels.length > 0 ? 1 : 0) + (direction ? 1 : 0) + (recent ? 1 : 0);

  const directionLabel = useMemo(() => {
    if (!direction) return null;
    return DIRECTIONS.find((d) => d.key === direction)?.label;
  }, [direction]);

  return (
    <PortalPageLayout
      eyebrow="Arc-8 Member360"
      title="Messages"
      subtitle="Inbound and outbound member messaging across every channel."
      navItems={PORTAL_NAV_ITEMS}
      currentNav="member360-lab"
      navProps={{ align: 'center', tone: 'surface' }}
      align="left"
      maxWidthClassName="max-w-7xl"
      mainClassName="space-y-4"
    >
      <LabSubNav />

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile label="Messages" value={summary.total} />
        <KpiTile label="Inbound" value={summary.inbound} tone="violet" />
        <KpiTile label="Outbound" value={summary.outbound} tone="info" />
        <KpiTile label="Last 24 hours" value={summary.last24} />
      </section>

      <SavedViewsBar views={SAVED_VIEWS} activeKey={activeView} onChange={applySavedView} />

      <section className="coding-surface rounded-2xl shadow-sm">
        <div className="p-3">
          <SearchInput
            placeholder="Search message body, member, or sender"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            wrapperClassName="w-full"
          />
        </div>
        <div className="border-t coding-border px-3 py-2 flex flex-wrap items-center gap-1.5 text-xs">
          <FilterDropdown label="Channel" count={channels.length}>
            <div className="flex flex-col gap-1 min-w-[180px]">
              {CHANNELS.map((c) => (
                <label key={c} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-[var(--coding-hover)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={channels.includes(c)}
                    onChange={() => toggleChannel(c)}
                    className="accent-[var(--brand-primary)]"
                  />
                  <span className="coding-text-strong">{c}</span>
                </label>
              ))}
            </div>
          </FilterDropdown>
          <FilterDropdown label="Direction" count={direction ? 1 : 0} display={directionLabel}>
            {({ close }) => (
              <div className="flex flex-col gap-1 min-w-[160px]">
                <button
                  type="button"
                  onClick={() => { setDirection(null); close(); }}
                  className={`text-left px-2 py-1 rounded hover:bg-[var(--coding-hover)] ${!direction ? 'coding-text-strong font-semibold' : 'coding-text-soft'}`}
                >
                  Any direction
                </button>
                {DIRECTIONS.map((d) => (
                  <button
                    key={d.key}
                    type="button"
                    onClick={() => { setDirection(d.key); close(); }}
                    className={`text-left px-2 py-1 rounded hover:bg-[var(--coding-hover)] ${direction === d.key ? 'coding-text-strong font-semibold' : 'coding-text-soft'}`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            )}
          </FilterDropdown>
          <button
            type="button"
            onClick={() => setRecent((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-md ring-1 px-2.5 py-1.5 text-xs font-medium transition ${
              recent
                ? 'ring-[var(--brand-primary)] text-[var(--brand-primary)] bg-brand-50 dark:bg-brand-900/20'
                : 'coding-border coding-text-strong bg-transparent hover:bg-[var(--coding-hover)]'
            }`}
          >
            Last 24 hours
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

      {loading && <LoadingState title="Loading messages" />}
      {error && <ErrorState title="Messages unavailable" description={error} />}

      {!loading && !error && (
        <section className="coding-surface rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 flex items-center justify-between text-xs coding-text-muted border-b coding-border">
            <span>
              {filtered.length} message{filtered.length === 1 ? '' : 's'} shown
              {rows.length !== filtered.length ? ` (filtered from ${rows.length} on this page)` : ''}
            </span>
          </div>
          <ul>
            {filtered.map((m) => (
              <li
                key={m.id}
                className={`border-b coding-border-subtle border-l-2 ${DIRECTION_ACCENT[m.direction] || 'border-l-transparent'} cursor-pointer hover:bg-[var(--coding-hover)] transition`}
                onClick={() => navigate(`${ROUTES.MEMBER360_LAB.MEMBER_WORKSPACE_ROOT}/${m.member_id}`)}
              >
                <div className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold coding-text-strong capitalize">{m.channel}</span>
                      <span className="text-[10px] uppercase tracking-wider coding-text-muted">·</span>
                      <span className="text-[11px] coding-text-soft capitalize">{m.direction}</span>
                      {m.risk_tier && <RiskBadge tier={m.risk_tier} />}
                    </div>
                    <p className="text-sm coding-text-strong mt-1 whitespace-pre-line line-clamp-3">{m.body}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs coding-text-strong font-medium">{m.member_name || '—'}</p>
                    <p className="text-[11px] coding-text-muted">{m.member_key}</p>
                    <p className="text-[10px] coding-text-soft mt-1">{m.timestamp ? new Date(m.timestamp).toLocaleString() : '—'}</p>
                  </div>
                </div>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="px-3 py-12 text-center text-sm coding-text-soft">No messages match the current filters.</li>
            )}
          </ul>
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} label="messages" />
        </section>
      )}
    </PortalPageLayout>
  );
};

export default Member360LabMessagesPage;
