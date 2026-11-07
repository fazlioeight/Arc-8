import React, { useMemo, useState } from 'react';
import PortalPageLayout from '../../../components/PortalPageLayout';
import { PORTAL_NAV_ITEMS } from '../portal_page/portalNavItems';
import { ROUTES } from '../../../constants/routes';
import { LabSubNav } from './components';
import KpiTile from '../../../components/ui/KpiTile';
import {
  MARKETS,
  getProviderGroups,
  getEntitySummary,
  getMonthlyTrend,
  getCostCategories,
  getComparisonTableRows,
} from '../../../services/planPerformanceService';

const currencyM = (v) => {
  if (v === null || v === undefined) return '—';
  return `$${Number(v).toFixed(1)}M`;
};

const currencyPMPM = (v) => {
  if (v === null || v === undefined) return '—';
  return `$${Math.round(Number(v)).toLocaleString()}`;
};

const pct = (v) => {
  if (v === null || v === undefined) return '—';
  return `${Number(v).toFixed(1)}%`;
};

const statusTone = (status) => {
  const s = String(status || '').toLowerCase();
  if (s.includes('track') || s.includes('good') || s.includes('fav')) return 'success';
  if (s.includes('watch') || s.includes('warn')) return 'amber';
  if (s.includes('crit') || s.includes('risk') || s.includes('bad')) return 'critical';
  return 'neutral';
};

export default function Member360LabPlanPerformancePage() {
  const [selectedMarket, setSelectedMarket] = useState('all');
  const [selectedGroup, setSelectedGroup] = useState('all');
  const [comparisonMode, setComparisonMode] = useState('budget'); // 'budget' | 'prior_year'
  const [tableSearch, setTableSearch] = useState('');

  // Dropdown options
  const availableGroups = useMemo(() => getProviderGroups(selectedMarket), [selectedMarket]);

  // Current entity focus
  const entity = useMemo(
    () => getEntitySummary(selectedMarket, selectedGroup),
    [selectedMarket, selectedGroup]
  );

  // Monthly trends for current entity
  const monthlyData = useMemo(
    () => getMonthlyTrend(selectedMarket, selectedGroup),
    [selectedMarket, selectedGroup]
  );

  // Cost categories for current entity
  const costCategories = useMemo(
    () => getCostCategories(selectedMarket, selectedGroup),
    [selectedMarket, selectedGroup]
  );

  // Comparison table rows
  const comparisonRows = useMemo(() => {
    const raw = getComparisonTableRows(selectedMarket);
    if (!tableSearch.trim()) return raw;
    const q = tableSearch.toLowerCase();
    return raw.filter((r) => r.entity_name.toLowerCase().includes(q));
  }, [selectedMarket, tableSearch]);

  const handleMarketChange = (e) => {
    setSelectedMarket(e.target.value);
    setSelectedGroup('all');
  };

  const handleGroupChange = (e) => {
    setSelectedGroup(e.target.value);
  };

  const resetFilters = () => {
    setSelectedMarket('all');
    setSelectedGroup('all');
    setTableSearch('');
  };

  // Monthly chart max value for scaling
  const maxMonthlyVal = useMemo(() => {
    if (!monthlyData.length) return 200;
    return Math.max(...monthlyData.map((m) => Math.max(m.premium_revenue_musd || 0, m.medical_cost_musd || 0))) * 1.15;
  }, [monthlyData]);

  return (
    <PortalPageLayout
      navItems={PORTAL_NAV_ITEMS}
      activeHref={ROUTES.MEMBER360_LAB.PLAN_PERFORMANCE}
      title="Plan Performance & Commercial Finance"
      subtitle="Executive payer analytics, MLR benchmarks, and provider network performance."
    >
      <div className="space-y-4">
        {/* Top Member360 SubNav */}
        <LabSubNav />

        {/* Filter Strip & Scope Controls */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                  Market Region
                </label>
                <select
                  value={selectedMarket}
                  onChange={handleMarketChange}
                  className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white px-3 py-1.5 text-sm focus:ring-2 focus:ring-sky-500"
                >
                  {MARKETS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                  Provider Group
                </label>
                <select
                  value={selectedGroup}
                  onChange={handleGroupChange}
                  className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white px-3 py-1.5 text-sm focus:ring-2 focus:ring-sky-500 min-w-[200px]"
                >
                  <option value="all">All Groups ({availableGroups.length})</option>
                  {availableGroups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                  Benchmark Baseline
                </label>
                <div className="inline-flex rounded-lg border border-slate-300 dark:border-slate-700 p-0.5 bg-slate-100 dark:bg-slate-800">
                  <button
                    type="button"
                    onClick={() => setComparisonMode('budget')}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition ${
                      comparisonMode === 'budget'
                        ? 'bg-white dark:bg-sky-600 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    }`}
                  >
                    Budget (83% Goal)
                  </button>
                  <button
                    type="button"
                    onClick={() => setComparisonMode('prior_year')}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition ${
                      comparisonMode === 'prior_year'
                        ? 'bg-white dark:bg-sky-600 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    }`}
                  >
                    Prior Year (2025)
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {(selectedMarket !== 'all' || selectedGroup !== 'all') && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="text-xs font-medium text-sky-600 hover:text-sky-700 dark:text-sky-400 underline"
                >
                  Reset to Plan Total
                </button>
              )}
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800">
                <span className="h-2 w-2 rounded-full bg-sky-500"></span>
                Scope: {entity.entity_name}
              </span>
            </div>
          </div>
        </section>

        {/* Top KPI Cards */}
        <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiTile
            label="Premium Revenue"
            value={currencyM(entity.premium_revenue_musd)}
            subtext={`${currencyPMPM(entity.revenue_pmpm)} PMPM (${entity.revenue_pmpm_vs_prior_year_pct ? `+${entity.revenue_pmpm_vs_prior_year_pct}% YoY` : 'YTD'})`}
            tone="info"
          />
          <KpiTile
            label="Medical Cost"
            value={currencyM(entity.medical_cost_musd)}
            subtext={`${currencyPMPM(entity.medical_cost_pmpm)} PMPM (${entity.medical_cost_pmpm_vs_prior_year_pct ? `+${entity.medical_cost_pmpm_vs_prior_year_pct}% YoY` : 'YTD'})`}
            tone="neutral"
          />
          <KpiTile
            label="Headline MLR (Part A/B)"
            value={pct(entity.mlr_part_ab_pct)}
            subtext={`Goal: ${pct(entity.mlr_goal_pct)} · ${entity.mlr_status || 'Watch'}`}
            tone={statusTone(entity.mlr_status)}
          />
          <KpiTile
            label="SG&A Expenses"
            value={currencyM(entity.sga_musd)}
            subtext={`${pct(entity.ocr_pct)} OCR`}
            tone="neutral"
          />
          <KpiTile
            label="Net Margin (IOI)"
            value={currencyM(entity.ioi_musd)}
            subtext={comparisonMode === 'budget' ? `Budget: ${currencyM(entity.budget_ioi_musd)}` : `PY: ${currencyM(entity.prior_year_ioi_musd)}`}
            tone={Number(entity.ioi_musd) >= 0 ? 'success' : 'amber'}
          />
          <KpiTile
            label="Active Enrollment"
            value={Number(entity.members_latest || 0).toLocaleString()}
            subtext={`${Number(entity.member_months_ytd || 0).toLocaleString()} Member Months`}
            tone="info"
          />
        </section>

        {/* Visual Charts: Monthly Trend & Cost Categories */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Monthly Trend Chart (2 cols) */}
          <section className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                  2026 YTD Financial Trend (Jan – Aug)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Monthly Premium Revenue vs. Medical Cost ({entity.entity_name})
                </p>
              </div>
              <div className="flex items-center gap-4 text-xs font-medium">
                <span className="inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                  <span className="h-3 w-3 rounded-sm bg-sky-500"></span>
                  Revenue
                </span>
                <span className="inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                  <span className="h-3 w-3 rounded-sm bg-indigo-500"></span>
                  Medical Cost
                </span>
                <span className="inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                  <span className="h-1.5 w-4 rounded-full bg-emerald-500"></span>
                  MLR %
                </span>
              </div>
            </div>

            {/* SVG Bar & Trend Chart */}
            <div className="h-64 w-full flex items-end justify-between gap-2 pt-6 pb-2 px-2 border-b border-slate-100 dark:border-slate-800">
              {monthlyData.map((m) => {
                const revHeight = ((m.premium_revenue_musd || 0) / maxMonthlyVal) * 100;
                const costHeight = ((m.medical_cost_musd || 0) / maxMonthlyVal) * 100;
                return (
                  <div key={m.month_seq || m.month_label} className="flex-1 flex flex-col items-center h-full justify-end group relative">
                    {/* Tooltip */}
                    <div className="absolute -top-12 opacity-0 group-hover:opacity-100 transition pointer-events-none z-10 bg-slate-900 text-white text-[11px] rounded-lg py-1 px-2 shadow-lg whitespace-nowrap">
                      <div>Rev: {currencyM(m.premium_revenue_musd)}</div>
                      <div>Cost: {currencyM(m.medical_cost_musd)}</div>
                      <div>MLR: {pct(m.mlr_part_ab_pct)}</div>
                    </div>

                    <div className="w-full flex items-end justify-center gap-1 h-full pb-1">
                      {/* Revenue Bar */}
                      <div
                        className="w-1/2 max-w-[28px] bg-sky-500 rounded-t-sm transition-all duration-300 group-hover:bg-sky-400"
                        style={{ height: `${revHeight}%` }}
                      ></div>
                      {/* Cost Bar */}
                      <div
                        className="w-1/2 max-w-[28px] bg-indigo-500 rounded-t-sm transition-all duration-300 group-hover:bg-indigo-400"
                        style={{ height: `${costHeight}%` }}
                      ></div>
                    </div>
                    {/* Month Label */}
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 mt-1">
                      {m.month_label}
                    </span>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">
                      {pct(m.mlr_part_ab_pct)}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500 mt-2 px-1">
              <span>* Prior year benchmark MLR: 85.35%</span>
              <span>Source: General Ledger & Closed Claims</span>
            </div>
          </section>

          {/* Cost Categories Breakdown (1 col) */}
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-1">
                Medical Cost Breakdown (PMPM)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                Total Medical Cost: <strong>{currencyPMPM(costCategories.total_pmpm || 1317)}</strong> ({costCategories.yoy_change_pct ? `+${costCategories.yoy_change_pct}% YoY` : ''})
              </p>

              <div className="space-y-3.5">
                {[
                  { label: 'Part D Pharmacy', val: costCategories.part_d_pharmacy || 300, max: 400, color: 'bg-emerald-500' },
                  { label: 'Institutional Inpatient', val: costCategories.inst_inpatient || 295, max: 400, color: 'bg-sky-500' },
                  { label: 'Institutional Outpatient', val: costCategories.inst_outpatient || 240, max: 400, color: 'bg-indigo-500' },
                  { label: 'Professional Services', val: costCategories.professional || 265, max: 400, color: 'bg-amber-500' },
                  { label: 'Capitation', val: costCategories.capitation || 80, max: 400, color: 'bg-violet-500' },
                  { label: 'Other Ancillary', val: costCategories.other || 137, max: 400, color: 'bg-slate-400' },
                ].map((item) => {
                  const sharePct = costCategories.total_pmpm ? ((item.val / costCategories.total_pmpm) * 100).toFixed(1) : 0;
                  return (
                    <div key={item.label}>
                      <div className="flex justify-between text-xs font-medium mb-1">
                        <span className="text-slate-700 dark:text-slate-300">{item.label}</span>
                        <span className="text-slate-900 dark:text-white font-bold">
                          {currencyPMPM(item.val)} <span className="text-slate-400 font-normal">({sharePct}%)</span>
                        </span>
                      </div>
                      <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${item.color} rounded-full transition-all duration-300`}
                          style={{ width: `${Math.min(100, (item.val / (costCategories.total_pmpm || 1317)) * 100 * 2.2)}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 mt-4 text-[11px] text-slate-400">
              Allocated across 1,065,982 member months YTD.
            </div>
          </section>
        </div>

        {/* Entity Comparison Hierarchy Table */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Network Performance Comparison (Plan &gt; Markets &gt; Provider Groups)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Click any row to filter top KPIs and monthly trends.
              </p>
            </div>
            <div>
              <input
                type="text"
                placeholder="Search network or group..."
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white px-3 py-1.5 text-xs focus:ring-2 focus:ring-sky-500 w-64"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[11px]">
                  <th className="py-2.5 px-3">Entity Name</th>
                  <th className="py-2.5 px-3">Level</th>
                  <th className="py-2.5 px-3 text-right">Active Members</th>
                  <th className="py-2.5 px-3 text-right">Revenue (YTD)</th>
                  <th className="py-2.5 px-3 text-right">Rev PMPM</th>
                  <th className="py-2.5 px-3 text-right">Cost PMPM</th>
                  <th className="py-2.5 px-3 text-right">Headline MLR</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                  <th className="py-2.5 px-3 text-right">Budget MLR Var</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {comparisonRows.map((r) => {
                  const isSelected =
                    (r.level === 'plan' && selectedMarket === 'all' && selectedGroup === 'all') ||
                    (r.level === 'market' && selectedMarket === r.entity_id && selectedGroup === 'all') ||
                    (r.level === 'provider_group' && selectedGroup === r.entity_id);

                  const indentClass =
                    r.level === 'market' ? 'pl-6 font-semibold' : r.level === 'provider_group' ? 'pl-10 text-slate-600 dark:text-slate-300' : 'font-extrabold text-slate-900 dark:text-white';

                  const budgetVar = r.budget_mlr_part_ab_pct ? (r.mlr_part_ab_pct - r.budget_mlr_part_ab_pct).toFixed(2) : null;

                  return (
                    <tr
                      key={r.entity_id}
                      onClick={() => {
                        if (r.level === 'plan') {
                          setSelectedMarket('all');
                          setSelectedGroup('all');
                        } else if (r.level === 'market') {
                          setSelectedMarket(r.entity_id);
                          setSelectedGroup('all');
                        } else if (r.level === 'provider_group') {
                          setSelectedMarket(r.market_id);
                          setSelectedGroup(r.entity_id);
                        }
                      }}
                      className={`cursor-pointer transition hover:bg-slate-50 dark:hover:bg-slate-800/60 ${
                        isSelected ? 'bg-sky-50 dark:bg-sky-950/40 border-l-4 border-sky-500' : ''
                      }`}
                    >
                      <td className={`py-2.5 px-3 ${indentClass}`}>
                        {r.level === 'market' && '↳ '}
                        {r.level === 'provider_group' && '• '}
                        {r.entity_name}
                      </td>
                      <td className="py-2.5 px-3 uppercase text-[10px] text-slate-400">
                        {r.level.replace('_', ' ')}
                      </td>
                      <td className="py-2.5 px-3 text-right font-medium">
                        {Number(r.members_latest || 0).toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 text-right font-medium">
                        {currencyM(r.premium_revenue_musd)}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {currencyPMPM(r.revenue_pmpm)}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {currencyPMPM(r.medical_cost_pmpm)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-slate-900 dark:text-white">
                        {pct(r.mlr_part_ab_pct)}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            statusTone(r.mlr_status) === 'success'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400'
                              : statusTone(r.mlr_status) === 'amber'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-400'
                              : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-400'
                          }`}
                        >
                          {r.mlr_status || 'Watch'}
                        </span>
                      </td>
                      <td className={`py-2.5 px-3 text-right font-semibold ${
                        Number(budgetVar) > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
                      }`}>
                        {budgetVar ? `${Number(budgetVar) > 0 ? '+' : ''}${budgetVar} pt` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </PortalPageLayout>
  );
}
