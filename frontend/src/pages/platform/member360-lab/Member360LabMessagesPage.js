import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PortalPageLayout from '../../../components/PortalPageLayout';
import { AuthContext } from '../../../context/AuthContext';
import { LoadingState, ErrorState } from '../../../components/ehr/Primitives';
import { PORTAL_NAV_ITEMS } from '../portal_page/portalNavItems';
import { ROUTES } from '../../../constants/routes';
import { fetchMember360AllMessages } from '../../../services/member360LabService';
import { LabSubNav, MetricCard, RiskBadge, SectionCard } from './components';

const CHANNEL_OPTIONS = ['any', 'SMS', 'Chat', 'Secure Message', 'Email', 'Phone'];
const DIRECTION_OPTIONS = ['any', 'inbound', 'outbound'];

const DIRECTION_STYLES = {
  inbound: 'ring-violet-200 dark:ring-violet-700/40 bg-violet-50/40 dark:bg-violet-900/15',
  outbound: 'ring-sky-200 dark:ring-sky-700/40 bg-sky-50/40 dark:bg-sky-900/15',
};

const Member360LabMessagesPage = () => {
  const navigate = useNavigate();
  const { token, tenant } = useContext(AuthContext) || {};
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [channelFilter, setChannelFilter] = useState('any');
  const [directionFilter, setDirectionFilter] = useState('any');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchMember360AllMessages(token, tenant)
      .then((items) => { if (!cancelled) { setRows(items); setError(null); } })
      .catch((err) => { if (!cancelled) setError(err.message || String(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, tenant]);

  const filtered = useMemo(() => {
    return rows
      .filter((m) => {
        if (channelFilter !== 'any' && (m.channel || '').toLowerCase() !== channelFilter.toLowerCase()) return false;
        if (directionFilter !== 'any' && m.direction !== directionFilter) return false;
        if (search) {
          const term = search.toLowerCase();
          const hay = [m.body, m.member_name, m.member_key, m.sender, m.recipient].filter(Boolean).join(' ').toLowerCase();
          if (!hay.includes(term)) return false;
        }
        return true;
      })
      .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
  }, [rows, search, channelFilter, directionFilter]);

  const summary = useMemo(() => {
    const total = rows.length;
    const inbound = rows.filter((m) => m.direction === 'inbound').length;
    const outbound = rows.filter((m) => m.direction === 'outbound').length;
    const now = Date.now();
    const last24 = rows.filter((m) => now - new Date(m.timestamp || 0).getTime() < 86400000).length;
    return { total, inbound, outbound, last24 };
  }, [rows]);

  return (
    <PortalPageLayout
      eyebrow="Nexora Lab Member360"
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Messages" value={summary.total} />
        <MetricCard label="Inbound" value={summary.inbound} />
        <MetricCard label="Outbound" value={summary.outbound} />
        <MetricCard label="Last 24 hours" value={summary.last24} />
      </div>

      <section className="coding-surface rounded-2xl p-4 shadow-sm">
        <div className="flex flex-col lg:flex-row gap-3">
          <input
            type="search"
            placeholder="Search by message body, member, or sender"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="coding-input w-full rounded-lg px-3 py-2 text-sm"
          />
          <select value={channelFilter} onChange={(e) => setChannelFilter(e.target.value)} className="coding-input rounded-lg px-3 py-2 text-sm lg:w-44">
            {CHANNEL_OPTIONS.map((c) => <option key={c} value={c}>{c === 'any' ? 'Any channel' : c}</option>)}
          </select>
          <select value={directionFilter} onChange={(e) => setDirectionFilter(e.target.value)} className="coding-input rounded-lg px-3 py-2 text-sm lg:w-44">
            {DIRECTION_OPTIONS.map((d) => <option key={d} value={d}>{d === 'any' ? 'Any direction' : d}</option>)}
          </select>
        </div>
      </section>

      {loading && <LoadingState title="Loading messages" />}
      {error && <ErrorState title="Messages unavailable" description={error} />}

      {!loading && !error && (
        <SectionCard title={`${filtered.length} message${filtered.length === 1 ? '' : 's'}`}>
          <ul className="space-y-2">
            {filtered.map((m) => (
              <li
                key={m.id}
                className={`rounded-lg ring-1 px-3 py-2 cursor-pointer hover:opacity-90 ${DIRECTION_STYLES[m.direction] || 'ring-black/5 dark:ring-white/10 coding-surface-subtle'}`}
                onClick={() => navigate(`${ROUTES.MEMBER360_LAB.MEMBER_WORKSPACE_ROOT}/${m.member_id}`)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold coding-text-strong capitalize">{m.channel} · {m.direction}</span>
                      {m.risk_tier && <RiskBadge tier={m.risk_tier} />}
                    </div>
                    <p className="text-sm coding-text-strong mt-1 whitespace-pre-line line-clamp-3">{m.body}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs coding-text-strong">{m.member_name || '—'}</p>
                    <p className="text-[11px] coding-text-muted">{m.member_key}</p>
                    <p className="text-[10px] coding-text-soft mt-1">{m.timestamp ? new Date(m.timestamp).toLocaleString() : '—'}</p>
                  </div>
                </div>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="px-3 py-8 text-center text-sm coding-text-soft">No messages match the current filters.</li>
            )}
          </ul>
        </SectionCard>
      )}
    </PortalPageLayout>
  );
};

export default Member360LabMessagesPage;
