import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PortalPageLayout from '../../../components/PortalPageLayout';
import { AuthContext } from '../../../context/AuthContext';
import { LoadingState, ErrorState } from '../../../components/ehr/Primitives';
import { PORTAL_NAV_ITEMS } from '../portal_page/portalNavItems';
import { ROUTES } from '../../../constants/routes';
import {
  createMember360Message,
  createMember360Note,
  fetchMember360Members,
  fetchMember360Messages,
  fetchMember360Notes,
} from '../../../services/member360LabService';
import { LabSubNav, Pagination, RiskBadge } from './components';
import FilterDropdown from '../../../components/ui/FilterDropdown';
import KpiTile from '../../../components/ui/KpiTile';
import SavedViewsBar from '../../../components/ui/SavedViewsBar';
import SearchInput from '../../../components/ui/SearchInput';

const PAGE_SIZE = 100;
const CHANNELS = ['SMS', 'Phone', 'Email', 'Portal', 'Chat', 'Secure Message', 'Internal'];
const DIRECTIONS = [
  { key: 'inbound', label: 'Inbound' },
  { key: 'outbound', label: 'Outbound' },
  { key: 'clinical_note', label: 'Clinical Note' },
];

const SAVED_VIEWS = [
  { key: 'all', label: 'All communications' },
  { key: 'notes', label: 'Clinical Outreach & Call Notes', direction: 'clinical_note' },
  { key: 'inbound', label: 'Inbound messages', direction: 'inbound' },
  { key: 'outbound', label: 'Outbound messages', direction: 'outbound' },
  { key: 'recent', label: 'Last 24 hours', recent: true },
];

const DIRECTION_ACCENT = {
  inbound: 'border-l-violet-400 dark:border-l-violet-500/60',
  outbound: 'border-l-sky-400 dark:border-l-sky-500/60',
  clinical_note: 'border-l-emerald-400 dark:border-l-emerald-500/60',
};

const STATUS_BADGE = {
  delivered: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  received: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200',
  logged: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200',
};

const Member360LabMessagesPage = () => {
  const navigate = useNavigate();
  const { token, tenant } = useContext(AuthContext) || {};
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [bannerMsg, setBannerMsg] = useState(null);
  const [search, setSearch] = useState('');
  const [channels, setChannels] = useState([]);
  const [direction, setDirection] = useState(null);
  const [recent, setRecent] = useState(false);
  const [activeView, setActiveView] = useState('all');
  const [refreshKey, setRefreshKey] = useState(0);

  // Log Communication / Send Message Modal (A8S-79 / A8S-80)
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [membersRoster, setMembersRoster] = useState([]);
  const [logForm, setLogForm] = useState({
    member_id: '',
    entry_kind: 'message',
    channel: 'SMS',
    direction: 'outbound',
    note_type: 'Outreach Call',
    body: '',
  });
  const [logBusy, setLogBusy] = useState(false);
  const [logErr, setLogErr] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetchMember360Messages(token, tenant, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
      fetchMember360Notes(token, tenant, { limit: PAGE_SIZE, offset: 0 }).catch(() => ({ items: [], total: 0 })),
    ])
      .then(([msgRes, noteRes]) => {
        if (cancelled) return;
        const msgItems = (msgRes?.items || []).map((m) => ({
          ...m,
          _uid: `msg-${m.id}`,
          record_kind: 'message',
        }));
        const noteItems = (noteRes?.items || []).map((n) => ({
          id: n.id,
          _uid: `note-${n.id}`,
          record_kind: 'note',
          member_id: n.member_id,
          member_name: n.member_name,
          member_key: n.member_key,
          risk_tier: n.risk_tier,
          channel: n.channel || 'Phone',
          direction: 'clinical_note',
          note_type: n.note_type || 'Clinical Outreach',
          sender: n.author_name || n.author_email,
          body: n.body,
          status: 'logged',
          timestamp: n.created_at,
        }));
        const combined = [...msgItems, ...noteItems].sort(
          (a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0)
        );
        setRows(combined);
        setTotal((msgRes?.total || 0) + (noteRes?.total || 0));
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, tenant, page, refreshKey]);

  useEffect(() => {
    if (!logModalOpen || membersRoster.length > 0 || !token || !tenant) return;
    fetchMember360Members(token, tenant, { limit: 150 })
      .then((res) => {
        const items = res?.items || [];
        setMembersRoster(items);
        if (items.length > 0) {
          setLogForm((prev) => ({ ...prev, member_id: prev.member_id || String(items[0].id) }));
        }
      })
      .catch(() => {});
  }, [logModalOpen, membersRoster.length, token, tenant]);

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
        if (
          channels.length > 0 &&
          !channels.some((c) => c.toLowerCase() === String(m.channel || '').toLowerCase())
        ) {
          return false;
        }
        if (direction && m.direction !== direction) return false;
        if (recent && new Date(m.timestamp || 0).getTime() < dayAgo) return false;
        if (search && search.trim()) {
          const term = search.trim().toLowerCase();
          const hay = [m.body, m.member_name, m.member_key, m.sender, m.recipient, m.channel, m.note_type]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          if (!hay.includes(term)) return false;
        }
        return true;
      })
      .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
  }, [rows, search, channels, direction, recent]);

  const summary = useMemo(() => {
    const totalCount = rows.length;
    const inbound = rows.filter((m) => m.direction === 'inbound').length;
    const outbound = rows.filter((m) => m.direction === 'outbound').length;
    const notesCount = rows.filter((m) => m.direction === 'clinical_note').length;
    const now = Date.now();
    const last24 = rows.filter((m) => now - new Date(m.timestamp || 0).getTime() < 86400000).length;
    return { total: totalCount, inbound, outbound, notesCount, last24 };
  }, [rows]);

  const handleLogSubmit = async (e) => {
    e.preventDefault();
    setLogErr(null);
    if (!logForm.member_id) {
      setLogErr('Please select a member.');
      return;
    }
    if (!logForm.body.trim()) {
      setLogErr('Communication text is required.');
      return;
    }
    setLogBusy(true);
    try {
      const mid = Number(logForm.member_id);
      if (logForm.entry_kind === 'note') {
        await createMember360Note(token, tenant, mid, {
          channel: logForm.channel || 'Phone',
          note_type: logForm.note_type || 'Outreach Call',
          body: logForm.body.trim(),
        });
        setBannerMsg(`Clinical ${logForm.channel} outreach note logged to member communication timeline.`);
      } else {
        await createMember360Message(token, tenant, mid, {
          channel: logForm.channel || 'SMS',
          direction: logForm.direction || 'outbound',
          body: logForm.body.trim(),
        });
        setBannerMsg(`${logForm.channel} message dispatched and recorded in communication log.`);
      }
      setLogModalOpen(false);
      setLogForm((prev) => ({ ...prev, body: '' }));
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setLogErr(err.message || String(err));
    } finally {
      setLogBusy(false);
    }
  };

  const activeFilterCount =
    (channels.length > 0 ? 1 : 0) + (direction ? 1 : 0) + (recent ? 1 : 0);

  const directionLabel = useMemo(() => {
    if (!direction) return null;
    return DIRECTIONS.find((d) => d.key === direction)?.label;
  }, [direction]);

  return (
    <PortalPageLayout
      eyebrow="Arc-8 Member360"
      title="Communication Log & Member Outreach"
      subtitle="Unified omnichannel communication log combining SMS, Phone, Email, Portal messages, and clinical call notes."
      navItems={PORTAL_NAV_ITEMS}
      currentNav="member360-lab"
      navProps={{ align: 'center', tone: 'surface' }}
      align="left"
      maxWidthClassName="max-w-7xl"
      mainClassName="space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <LabSubNav />
        <button
          type="button"
          onClick={() => setLogModalOpen(true)}
          className="rounded-lg bg-[var(--brand-primary)] text-white px-3.5 py-1.5 text-xs font-semibold shadow-xs hover:opacity-90"
        >
          + Log Communication / Send Message
        </button>
      </div>

      {bannerMsg && (
        <div
          role="status"
          className="flex items-center justify-between gap-3 rounded-xl ring-1 ring-emerald-200 dark:ring-emerald-700/40 bg-emerald-50/80 dark:bg-emerald-900/20 px-4 py-2.5 text-xs coding-text-strong"
        >
          <span>{bannerMsg}</span>
          <button type="button" onClick={() => setBannerMsg(null)} className="text-xs coding-text-muted">
            ✕
          </button>
        </div>
      )}

      <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="cursor-pointer" onClick={() => applySavedView('all')}>
          <KpiTile label="Total touchpoints" value={summary.total} />
        </div>
        <div className="cursor-pointer" onClick={() => applySavedView('inbound')}>
          <KpiTile label="Inbound" value={summary.inbound} tone="violet" />
        </div>
        <div className="cursor-pointer" onClick={() => applySavedView('outbound')}>
          <KpiTile label="Outbound" value={summary.outbound} tone="info" />
        </div>
        <div className="cursor-pointer" onClick={() => applySavedView('notes')}>
          <KpiTile label="Clinical Call Notes" value={summary.notesCount} tone="success" />
        </div>
        <div className="cursor-pointer" onClick={() => applySavedView('recent')}>
          <KpiTile label="Last 24 hours" value={summary.last24} />
        </div>
      </section>

      <SavedViewsBar views={SAVED_VIEWS} activeKey={activeView} onChange={applySavedView} />

      <section className="coding-surface rounded-2xl shadow-sm">
        <div className="p-3">
          <SearchInput
            placeholder="Search communication body, member name/ID, channel, or coordinator"
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
          <FilterDropdown label="Type / Direction" count={direction ? 1 : 0} display={directionLabel}>
            {({ close }) => (
              <div className="flex flex-col gap-1 min-w-[160px]">
                <button
                  type="button"
                  onClick={() => {
                    setDirection(null);
                    close();
                  }}
                  className={`text-left px-2 py-1 rounded hover:bg-[var(--coding-hover)] ${
                    !direction ? 'coding-text-strong font-semibold' : 'coding-text-soft'
                  }`}
                >
                  Any type
                </button>
                {DIRECTIONS.map((d) => (
                  <button
                    key={d.key}
                    type="button"
                    onClick={() => {
                      setDirection(d.key);
                      close();
                    }}
                    className={`text-left px-2 py-1 rounded hover:bg-[var(--coding-hover)] ${
                      direction === d.key ? 'coding-text-strong font-semibold' : 'coding-text-soft'
                    }`}
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

      {loading && <LoadingState title="Loading communication log" />}
      {error && <ErrorState title="Communication log unavailable" description={error} />}

      {!loading && !error && (
        <section className="coding-surface rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 flex items-center justify-between text-xs coding-text-muted border-b coding-border">
            <span>
              {filtered.length} communication record{filtered.length === 1 ? '' : 's'} shown
              {rows.length !== filtered.length ? ` (filtered from ${rows.length} on this page)` : ''}
            </span>
          </div>
          <ul>
            {filtered.map((m) => (
              <li
                key={m._uid || m.id}
                className={`border-b coding-border-subtle border-l-2 ${
                  DIRECTION_ACCENT[m.direction] || 'border-l-transparent'
                } cursor-pointer hover:bg-[var(--coding-hover)] transition`}
                onClick={() => navigate(`${ROUTES.MEMBER360_LAB.MEMBER_WORKSPACE_ROOT}/${m.member_id}`)}
              >
                <div className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold coding-text-strong capitalize">{m.channel}</span>
                      <span className="text-[10px] uppercase tracking-wider coding-text-muted">·</span>
                      <span className="text-[11px] coding-text-soft capitalize">
                        {m.direction === 'clinical_note' ? m.note_type || 'Clinical Outreach Note' : m.direction}
                      </span>
                      {m.status && (
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${
                            STATUS_BADGE[m.status] || 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                          }`}
                        >
                          {m.status}
                        </span>
                      )}
                      {m.sender && <span className="text-[11px] coding-text-muted">by {m.sender}</span>}
                      {m.risk_tier && <RiskBadge tier={m.risk_tier} />}
                    </div>
                    <p className="text-sm coding-text-strong mt-1 whitespace-pre-line line-clamp-3">{m.body}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs coding-text-strong font-medium">{m.member_name || '—'}</p>
                    <p className="text-[11px] coding-text-muted">{m.member_key}</p>
                    <p className="text-[10px] coding-text-soft mt-1">
                      {m.timestamp ? new Date(m.timestamp).toLocaleString() : '—'}
                    </p>
                  </div>
                </div>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="px-3 py-12 text-center text-sm coding-text-soft">
                No communication entries match the current filters.
              </li>
            )}
          </ul>
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} label="communications" />
        </section>
      )}

      {/* Log Communication / Send Message Modal */}
      {logModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="coding-surface rounded-2xl shadow-xl max-w-lg w-full p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold coding-text-strong">Log Member Communication / Send Outreach</h3>
              <button type="button" onClick={() => setLogModalOpen(false)} className="text-xs coding-text-muted">
                ✕
              </button>
            </div>
            {logErr && (
              <div className="rounded-lg bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-200 px-3 py-2 text-xs">
                {logErr}
              </div>
            )}
            <form onSubmit={handleLogSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold coding-text-strong mb-1">Member *</label>
                <select
                  value={logForm.member_id}
                  onChange={(e) => setLogForm((p) => ({ ...p, member_id: e.target.value }))}
                  className="coding-input w-full rounded-md px-3 py-2"
                  required
                >
                  <option value="">Select member…</option>
                  {membersRoster.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.first_name} {m.last_name} ({m.member_key} · Preferred: {m.preferred_channel || 'Phone'})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold coding-text-strong mb-1">Communication Type</label>
                  <select
                    value={logForm.entry_kind}
                    onChange={(e) =>
                      setLogForm((p) => ({
                        ...p,
                        entry_kind: e.target.value,
                        channel: e.target.value === 'note' ? 'Phone' : 'SMS',
                      }))
                    }
                    className="coding-input w-full rounded-md px-3 py-2"
                  >
                    <option value="message">Direct Member Message (SMS / Email / Portal)</option>
                    <option value="note">Clinical Call / Outreach Note</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold coding-text-strong mb-1">Channel</label>
                  <select
                    value={logForm.channel}
                    onChange={(e) => setLogForm((p) => ({ ...p, channel: e.target.value }))}
                    className="coding-input w-full rounded-md px-3 py-2"
                  >
                    {CHANNELS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {logForm.entry_kind === 'note' ? (
                <div>
                  <label className="block font-semibold coding-text-strong mb-1">Outreach Call / Encounter Category</label>
                  <input
                    type="text"
                    value={logForm.note_type}
                    onChange={(e) => setLogForm((p) => ({ ...p, note_type: e.target.value }))}
                    placeholder="e.g., 48-Hour Post-Discharge Call, Medication Adherence Check"
                    className="coding-input w-full rounded-md px-3 py-2"
                  />
                </div>
              ) : (
                <div>
                  <label className="block font-semibold coding-text-strong mb-1">Direction</label>
                  <select
                    value={logForm.direction}
                    onChange={(e) => setLogForm((p) => ({ ...p, direction: e.target.value }))}
                    className="coding-input w-full rounded-md px-3 py-2"
                  >
                    <option value="outbound">Outbound to Member</option>
                    <option value="inbound">Inbound from Member (Logged)</option>
                  </select>
                </div>
              )}
              <div>
                <label className="block font-semibold coding-text-strong mb-1">Message / Clinical Summary *</label>
                <textarea
                  rows={4}
                  value={logForm.body}
                  onChange={(e) => setLogForm((p) => ({ ...p, body: e.target.value }))}
                  placeholder="Enter outreach message or structured call summary…"
                  className="coding-input w-full rounded-md px-3 py-2"
                  required
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setLogModalOpen(false)}
                  className="rounded-md ring-1 coding-border px-3 py-1.5 text-xs font-semibold coding-text-strong"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={logBusy}
                  className="rounded-md bg-[var(--brand-primary)] text-white px-4 py-1.5 text-xs font-semibold disabled:opacity-50"
                >
                  {logBusy ? 'Saving…' : logForm.entry_kind === 'note' ? 'Log Call Note' : 'Send & Log Message'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PortalPageLayout>
  );
};

export default Member360LabMessagesPage;
