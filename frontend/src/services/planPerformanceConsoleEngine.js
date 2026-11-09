/**
 * planPerformanceConsoleEngine.js
 * 
 * Direct port of the analytical model, SVG visualizations, dials, tables, 
 * and multi-tab rendering engine from Jessica Funiestas's Plan Performance Console (Dashboard 9).
 */

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const f1 = (v) => (v != null ? Number(v).toFixed(1) : '—');
const f0 = (v) => (v != null ? Math.round(Number(v)).toLocaleString('en-US') : '0');
const M = (v) => {
  if (v == null) return '—';
  const val = Number(v);
  return (val < 0 ? '−' : '') + '$' + (Math.abs(val) >= 1000 ? (Math.abs(val) / 1000).toFixed(2) + 'B' : Math.abs(val).toFixed(1) + 'M');
};
const sM = (v) => {
  if (v == null) return '—';
  const val = Number(v);
  return (val >= 0 ? '+' : '−') + '$' + (Math.abs(val) >= 1000 ? (Math.abs(val) / 1000).toFixed(2) + 'B' : Math.abs(val).toFixed(1) + 'M');
};
const sP = (v, d = 1) => {
  if (v == null) return '—';
  const val = Number(v);
  return (val >= 0 ? '+' : '−') + Math.abs(val).toFixed(d) + '%';
};
const sPt = (v) => {
  if (v == null) return '—';
  const val = Number(v);
  return (val >= 0 ? '+' : '−') + Math.abs(val).toFixed(1) + ' pts';
};
const pct = (v, d = 1) => (v != null ? Number(v).toFixed(d) + '%' : '—');
const $$ = (v) => (v != null ? (Number(v) < 0 ? '−' : '') + '$' + Math.abs(Math.round(Number(v))).toLocaleString('en-US') : '—');
const sum = (a) => (a || []).reduce((x, y) => x + (Number(y) || 0), 0);

export const CONSOLE_TABS = [
  ['overview', 'Overview'],
  ['fin', 'Financials'],
  ['cost', 'Medical cost'],
  ['mlr', 'Provider MLR'],
  ['util', 'Utilization'],
  ['qual', 'Quality'],
  ['risk', 'Risk adjustment'],
  ['defs', 'Definitions'],
];

/* ---------- SVG Chart Helpers ---------- */
function niceTicks(lo, hi, n) {
  const st = (hi - lo) / n;
  const p = Math.pow(10, Math.floor(Math.log10(st || 1)));
  const f = st / p;
  const s = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  const a = Math.floor(lo / s) * s;
  const b = Math.ceil(hi / s) * s;
  const t = [];
  for (let v = a; v <= b + s / 2; v += s) t.push(+v.toFixed(6));
  return t;
}

function lineChart(o) {
  const W = o.w || 560;
  const H = o.h || 240;
  const L = 44;
  const R = o.rightPad || 112;
  const Tp = 14;
  const B = 26;
  const all = [].concat(...o.series.map((s) => s.vals || []));
  if (o.target != null) all.push(o.target);
  let lo = Math.min(...all);
  let hi = Math.max(...all);
  const pad = (hi - lo) * 0.12 || 1;
  const tk = niceTicks(lo - pad, hi + pad, 4);
  lo = tk[0];
  hi = tk[tk.length - 1];
  const n = o.labels.length;
  const x = (i) => L + ((W - L - R) * i) / (n - 1 || 1);
  const y = (v) => Tp + (H - Tp - B) * (1 - (v - lo) / (hi - lo || 1));
  const fmt = o.fmt || ((v) => v.toFixed(0));

  let g = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.label || '')}">`;
  tk.forEach((v) => {
    g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--grid)"/><text x="${L - 6}" y="${y(v) + 3.5}" text-anchor="end" font-size="10" fill="var(--mute)">${fmt(v)}</text>`;
  });
  o.labels.forEach((l, i) => {
    if (n <= 12 || i % 2 === 0) {
      g += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" font-size="10" fill="var(--mute)">${l}</text>`;
    }
  });
  if (o.target != null) {
    g += `<line x1="${L}" x2="${W - R}" y1="${y(o.target)}" y2="${y(o.target)}" stroke="var(--mute)" stroke-dasharray="5 4"/><text x="${W - R + 6}" y="${y(o.target) + 3.5}" font-size="10" fill="var(--mute)">${esc(o.targetLabel || 'Target')}</text>`;
  }

  // End label de-collision
  const ends = o.series.map((s, k) => ({ k, y: y(s.vals[n - 1] || 0) })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) {
    if (ends[i].y - ends[i - 1].y < 12) ends[i].y = ends[i - 1].y + 12;
  }
  const ly = {};
  ends.forEach((e) => (ly[e.k] = e.y));

  o.series.forEach((s, k) => {
    const pts = (s.vals || []).map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    g += `<polyline fill="none" stroke="${s.color}" stroke-width="${s.w || 2.2}" ${s.dash ? 'stroke-dasharray="5 4"' : ''} opacity="${s.faded ? 0.4 : 1}" points="${pts}"><title>${esc(s.name)}</title></polyline>`;
    g += `<circle cx="${x(n - 1)}" cy="${y(s.vals[n - 1] || 0)}" r="3" fill="${s.color}"/>${s.lab === '' ? '' : `<text x="${W - R + 6}" y="${ly[k] + 3.5}" font-size="10.5" font-weight="600" fill="${s.color}">${s.lab != null ? esc(s.lab) : esc(s.name) + ' ' + fmt(s.vals[n - 1] || 0)}</text>`}`;
  });
  return g + '</svg>';
}

function divBars(rows, fmt, o = {}) {
  const W = o.w || 560;
  const rh = 22;
  const H = rows.length * rh + 22;
  const L = o.L || 205;
  const R = 20;
  const mx = Math.max(...rows.map((r) => Math.abs(r.v)), 0.1);
  const mid = L + (W - L - R) / 2;
  const sc = ((W - L - R) / 2 - 42) / mx;
  let g = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Income from operations variance by driver"><line x1="${mid}" x2="${mid}" y1="4" y2="${H - 18}" stroke="var(--mute)"/>`;
  rows.forEach((r, i) => {
    const yy = 6 + i * rh;
    const w = Math.abs(r.v) * sc;
    const fav = r.v >= 0;
    g += `<text x="${L - 8}" y="${yy + 12}" text-anchor="end" font-size="10.5" fill="var(--ink2)">${esc(r.label)}</text><rect x="${fav ? mid : mid - w}" y="${yy + 2}" width="${Math.max(w, 1)}" height="14" rx="2" fill="${fav ? 'var(--teal)' : 'var(--unfav)'}"><title>${esc(r.label)} ${fmt(r.v)}</title></rect><text x="${fav ? mid + w + 5 : mid - w - 5}" y="${yy + 13}" text-anchor="${fav ? 'start' : 'end'}" font-size="10.5" font-weight="600" fill="${fav ? 'var(--fav)' : 'var(--unfav)'}">${fmt(r.v)}</text>`;
  });
  return g + '</svg>';
}

function hBars(rows, o = {}) {
  const W = o.w || 560;
  const rh = o.rh || 22;
  const H = rows.length * rh + 16;
  const L = o.L || 150;
  const R = 60;
  const mx = o.max || Math.max(...rows.map((r) => r.v || 0)) * 1.08;
  const mn = o.min || 0;
  const x = (v) => L + ((W - L - R) * (v - mn)) / (mx - mn || 1);
  let g = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.label || '')}">`;
  if (o.ref != null) {
    g += `<line x1="${x(o.ref)}" x2="${x(o.ref)}" y1="2" y2="${H - 12}" stroke="var(--mute)" stroke-dasharray="4 3"/><text x="${x(o.ref)}" y="${H - 1}" text-anchor="middle" font-size="10" fill="var(--mute)">${esc(o.refLabel || '')}</text>`;
  }
  rows.forEach((r, i) => {
    const yy = 4 + i * rh;
    g += `<text x="${L - 8}" y="${yy + 13}" text-anchor="end" font-size="10.5" fill="var(--ink2)" ${r.bold ? 'font-weight="700"' : ''}>${esc(r.label)}</text><rect x="${L}" y="${yy + 3}" width="${Math.max(x(r.v || 0) - L, 1)}" height="${rh - 9}" rx="2" fill="${r.color || 'var(--c2)'}"><title>${esc(r.label)} ${o.fmt ? o.fmt(r.v) : r.v}</title></rect><text x="${x(r.v || 0) + 5}" y="${yy + 13}" font-size="10.5" font-weight="600" fill="var(--ink)">${o.fmt ? o.fmt(r.v) : r.v}</text>`;
  });
  return g + '</svg>';
}

function stackCols(labels, stacks, fmt, label, h) {
  const W = 560;
  const H = h || 230;
  const L = 40;
  const R = 10;
  const Tp = 10;
  const B = 24;
  const tot = labels.map((_, i) => sum(stacks.map((s) => s.vals[i])));
  const tk = niceTicks(0, Math.max(...tot) * 1.05, 4);
  const hi = tk[tk.length - 1];
  const bw = (W - L - R) / labels.length;
  const y = (v) => Tp + (H - Tp - B) * (1 - v / (hi || 1));
  let g = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">`;
  tk.forEach((v) => {
    g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--grid)"/><text x="${L - 5}" y="${y(v) + 3.5}" text-anchor="end" font-size="10" fill="var(--mute)">${fmt(v)}</text>`;
  });
  labels.forEach((l, i) => {
    let acc = 0;
    stacks.forEach((s) => {
      const v0 = s.vals[i];
      const v = Math.max(0, v0);
      g += `<rect x="${L + i * bw + bw * 0.16}" width="${bw * 0.68}" y="${y(acc + v)}" height="${y(acc) - y(acc + v)}" fill="${s.color}"><title>${l} · ${esc(s.name)} ${fmt(v0)}</title></rect>`;
      acc += v;
    });
    g += `<text x="${L + i * bw + bw / 2}" y="${H - 8}" text-anchor="middle" font-size="10" fill="var(--mute)">${l}</text>`;
  });
  return g + '</svg>';
}

function deltaCols(labels, vals, fmt, label) {
  const W = 560;
  const H = 210;
  const L = 44;
  const R = 10;
  const Tp = 16;
  const B = 26;
  const mx = Math.max(...vals.map((v) => (v != null ? Math.abs(v) : 0)), 0.05) * 1.25;
  const bw = (W - L - R) / labels.length;
  const y = (v) => Tp + (H - Tp - B) * (1 - (v + mx) / (2 * mx || 1));
  const z = y(0);
  let g = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}"><line x1="${L}" x2="${W - R}" y1="${z}" y2="${z}" stroke="var(--mute)"/>`;
  [-mx * 0.8, mx * 0.8].forEach((v) => {
    g += `<text x="${L - 5}" y="${y(v) + 3.5}" text-anchor="end" font-size="10" fill="var(--mute)">${fmt(v)}</text><line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--grid)"/>`;
  });
  labels.forEach((l, i) => {
    if (vals[i] == null) {
      g += `<text x="${L + i * bw + bw / 2}" y="${H - 8}" text-anchor="middle" font-size="10" fill="var(--mute)">${l}</text>`;
      return;
    }
    const v = vals[i];
    const yy = y(v);
    const fav = v >= 0;
    g += `<rect x="${L + i * bw + bw * 0.2}" width="${bw * 0.6}" y="${Math.min(yy, z)}" height="${Math.max(Math.abs(yy - z), 1)}" rx="2" fill="${fav ? 'var(--teal)' : 'var(--unfav)'}"><title>${l} ${fmt(v)}</title></rect><text x="${L + i * bw + bw / 2}" y="${fav ? yy - 4 : yy + 11}" text-anchor="middle" font-size="9.5" font-weight="600" fill="${fav ? 'var(--fav)' : 'var(--unfav)'}">${fmt(v)}</text><text x="${L + i * bw + bw / 2}" y="${H - 8}" text-anchor="middle" font-size="10" fill="var(--mute)">${l}</text>`;
  });
  return g + '</svg>';
}

function spark(v, color) {
  if (!v || !v.length) return '';
  const W = 100;
  const H = 24;
  const lo = Math.min(...v);
  const hi = Math.max(...v);
  const r = hi - lo || 1;
  const p = v.map((x, i) => `${((i / (v.length - 1)) * W).toFixed(1)},${(H - 3 - ((x - lo) / r) * (H - 6)).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><polyline fill="none" stroke="${color || 'var(--teal)'}" stroke-width="1.8" vector-effect="non-scaling-stroke" points="${p}"/></svg>`;
}

function dial(o) {
  const cx = 100;
  const cy = 98;
  const r = 70;
  const fr = (x) => Math.min(1, Math.max(0, (x - o.min) / (o.max - o.min || 1)));
  const pt = (f, rr) => {
    const a = Math.PI * (1 - f);
    return [cx + rr * Math.cos(a), cy - rr * Math.sin(a)];
  };
  const st = o.target == null ? 'ok' : heat(o.v, o.target, o.hb !== false);
  const col = o.dark ? '#2fd1cc' : { ok: 'var(--c2)', warn: 'var(--c4)', bad: 'var(--unfav)' }[st] || 'var(--c2)';
  const [vx, vy] = pt(fr(o.v), r);
  const [t1x, t1y] = o.target == null ? [0, 0] : pt(fr(o.target), r - 13);
  const [t2x, t2y] = o.target == null ? [0, 0] : pt(fr(o.target), r + 11);
  const word = { ok: 'On track', warn: 'Watch', bad: 'Off track' }[st] || 'Watch';
  return `<div class="dial"><svg viewBox="0 0 200 118" role="img" aria-label="${esc(o.label || '')} ${o.fmt ? o.fmt(o.v) : o.v}${o.target != null ? ', target ' + (o.tfmt ? o.tfmt(o.target) : o.target) : ''}"><path d="M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}" fill="none" stroke="${o.dark ? 'rgba(255,255,255,.2)' : 'var(--track)'}" stroke-width="15" stroke-linecap="round"/>${o.v > o.min ? `<path d="M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${vx.toFixed(1)} ${vy.toFixed(1)}" fill="none" stroke="${col}" stroke-width="15" stroke-linecap="round"/>` : ''}${o.target != null ? `<line x1="${t1x.toFixed(1)}" y1="${t1y.toFixed(1)}" x2="${t2x.toFixed(1)}" y2="${t2y.toFixed(1)}" stroke="${o.dark ? '#fff' : 'var(--ink)'}" stroke-width="2.4" stroke-linecap="round"/>` : ''}<text x="${cx}" y="${cy - 8}" text-anchor="middle" font-size="30" font-weight="700" fill="${o.dark ? '#fff' : 'var(--ink)'}">${o.fmt ? o.fmt(o.v) : o.v}</text></svg>${o.target != null ? `<div class="dsub">Target ${o.tfmt ? o.tfmt(o.target) : o.target} · <b class="${st === 'ok' ? 'fav' : st === 'warn' ? '' : 'unfav'}" ${st === 'warn' ? 'style="color:var(--c4)"' : ''}>${word}</b></div>` : ''}</div>`;
}

function heat(value, goal, higherBetter) {
  if (goal == null) return '';
  const sh = ((higherBetter ? goal - value : value - goal) / goal) * 100;
  if (goal === 83 && !higherBetter) return sh <= 0 ? 'ok' : sh < 20 ? 'warn' : 'bad';
  return sh < 1 ? 'ok' : sh < 20 ? 'warn' : 'bad';
}

const hc = (value, goal, hb) => {
  const c = heat(value, goal, hb);
  return c ? ` class="${c}"` : '';
};
const hcn = (value, goal, hb) => ` class="num ${heat(value, goal, hb)}"`;
const legendDots = (items) =>
  `<div style="display:flex;flex-wrap:wrap;gap:4px 14px;font-size:11px;color:var(--ink2);margin-top:4px">${items.map(([n, c]) => `<span><i style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${c};margin-right:5px"></i>${esc(n)}</span>`).join('')}</div>`;
const card = (t, sub, body, foot) =>
  `<section class="card"><h3>${esc(t)}<small>${sub ? esc(sub) : ''}</small></h3>${body}${foot ? `<div class="foot">${foot}</div>` : ''}</section>`;
const inner = (h) => `<div class="in">${h}</div>`;
const kpi = (l, v, d, spk) =>
  `<div class="kpi"><div class="l">${esc(l)}</div><div class="v num">${v}</div><div class="d num">${d}</div>${spk ? spark(spk) : ''}</div>`;
const dlt = (txt, isFav) => `<b class="${isFav ? 'fav' : 'unfav'}">${txt}</b>`;
const cellBar = (v, max, color) =>
  `<span class="track"><span class="bar" style="width:${Math.min(100, (v / max) * 100)}%;${color ? 'background:' + color : ''}"></span></span>`;

/**
 * Builds the interactive domain model E, ORDER, monthly cache, and comparison rows from raw or exported dataset.
 */
export function buildConsoleModel(rawData) {
  const D = rawData || {};
  const BENCH = 83;
  const T = {
    plan_mlr_benchmark_pct: 86.5,
    star_target: 4.0,
    quality_score_target_pct: 80,
    plan_avg_total_pmpm: 398,
    hcc_high_cost_claimant_threshold_usd: 50000,
    high_cost_member_share_pct: 1.2,
    high_cost_cost_share_pct: 18,
  };
  (D.targets_and_benchmarks || D.targets_and_goals || []).forEach((r) => {
    T[r.name] = r.value;
  });

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'];
  const E = {};
  const ORDER = { markets: [], groups: {} };

  // Index tables
  const by = (arr, key = 'entity_id') => {
    const m = {};
    (arr || []).forEach((r) => (m[r[key]] = r));
    return m;
  };

  const entitySummary = by(D.fact_entity_summary || []);
  const monthlyByEntity = {};
  (D.fact_monthly_by_entity || []).forEach((r) => {
    (monthlyByEntity[r.entity_id] = monthlyByEntity[r.entity_id] || []).push(r);
  });
  const costCatMap = by(D.fact_medical_cost_pmpm_category || []);
  const qualMap = by(D.fact_quality || []);
  const riskMap = by(D.fact_risk_adjustment || []);
  const utilMap = by(D.fact_utilization || []);

  // Populate entity nodes
  Object.keys(entitySummary).forEach((id) => {
    const row = entitySummary[id];
    const level = row.level === 'plan' ? 'plan' : row.level;
    const isPlan = id === 'plan';
    const name = isPlan ? 'Total' : row.entity_name || id;
    const market = row.market_id || (level === 'market' ? id : '');

    const e = {
      id,
      level,
      name,
      market,
      members: row.members_latest || 0,
      rev: row.premium_revenue_musd || 0,
      cost: row.medical_cost_musd || 0,
      sga: row.sga_musd || 0,
      ioi: row.ioi_musd || 0,
      mlr: row.mlr_part_ab_pct || 0,
      mlrT: row.mlr_incl_part_d_pct || 0,
      mlrD: row.mlr_part_d_pct || 0,
      ocr: row.ocr_pct || 0,
      revAB: row.part_ab_revenue_pmpm || 1195,
      revD: row.part_d_revenue_pmpm || 180,
      revPM: row.revenue_pmpm || 1375,
      rxD: row.part_d_cost_pmpm || 300,
      pmpm: row.medical_cost_pmpm || 1317,
      pmpmYoy: row.medical_cost_pmpm_vs_prior_year_pct || 1.8,
      bRev: row.budget_revenue_musd || 0,
      bCost: row.budget_medical_cost_musd || 0,
      bSga: row.budget_sga_musd || 0,
      bMem: row.budget_members || 0,
      bIoi: row.budget_ioi_musd || 0,
      bMlr: row.budget_mlr_part_ab_pct || 83,
      pRev: row.prior_year_revenue_musd || 0,
      pCost: row.prior_year_medical_cost_musd || 0,
      pSga: row.prior_year_sga_musd || 0,
      pMem: row.prior_year_members || 0,
      pMM: row.prior_year_member_months || row.prior_year_members * 12 || 1,
      pIoi: row.prior_year_ioi_musd || 0,
      pMlr: row.prior_year_mlr_part_ab_pct || 85.35,
    };

    // Quality fields
    const q = qualMap[id] || {};
    e.star = q.overall_star_rating || 4.2;
    e.sHedis = q.hedis_star || 4.1;
    e.sAdh = q.medication_adherence_star || 4.3;
    e.sExp = q.member_experience_star || q.cahps_of_5 || 4.1;
    e.hedis = q.hedis_composite_pct || 82;
    e.cahps = q.cahps_of_5 || 4.1;
    e.gap = q.care_gap_closure_pct || 74;
    e.adhPct = q.medication_adherence_pct || 88;

    // Risk fields
    const rk = riskMap[id] || {};
    e.raf = rk.avg_raf || 1.18;
    e.ebur = rk.ebur || 0.96;
    e.mbur = rk.mbur || 1.04;
    e.hcc = rk.hcc_capture_pct || 71;
    e.chart = rk.chart_review_pct || 64;
    e.assessed = rk.members_assessed || 97400;

    // Cost categories
    const cc = costCatMap[id] || {};
    e.ip = cc.inst_inpatient || 295;
    e.op = cc.inst_outpatient || 240;
    e.pro = cc.professional || 265;
    e.cap = cc.capitation || 80;
    e.oth = cc.other || 137;

    // Utilization fields
    const utRows = (D.fact_utilization || []).filter((u) => u.entity_id === id);
    const getU = (pattern) => {
      const match = utRows.find((u) => u.measure && u.measure.toLowerCase().includes(pattern));
      return match ? match.ytd_value : null;
    };
    e.adm = getU('admits / 1,000') || 71.2;
    e.er = getU('er visits') || 312;
    e.readm = getU('30-day readmit') || 14.1;
    e.obs = getU('obs stays') || 38.4;
    e.snf = getU('snf') || 142;

    E[id] = e;

    if (level === 'market') ORDER.markets.push(id);
    if (level === 'provider_group') {
      (ORDER.groups[market] = ORDER.groups[market] || []).push(id);
    }
  });

  const P = E.plan || Object.values(E)[0] || {};

  // Monthly data accessor
  const monthCache = {};
  const monthly = (id) => {
    if (monthCache[id]) return monthCache[id];
    const rows = (monthlyByEntity[id] || []).slice(0, 8);
    const rev = rows.map((r) => r.premium_revenue_musd || 0);
    const cost = rows.map((r) => r.medical_cost_musd || 0);
    const sga = rows.map((r) => r.sga_musd || 0);
    const fc = rows.map((r) => r.revenue_forecast_musd || r.premium_revenue_musd || 0);
    const mlr = rows.map((r) => r.mlr_part_ab_pct || 85);
    const mlrT = rows.map((r) => r.mlr_incl_part_d_pct || 95);
    const ioi = rows.map((r) => r.ioi_musd || 0);
    const mem = rows.map((r) => r.members || 138000);
    const revP = rows.map((r) => r.revenue_pmpm || 1375);
    const costP = rows.map((r) => r.medical_cost_pmpm || 1317);
    const sgaP = rows.map((r) => r.sga_pmpm || 140);
    const ioiP = rows.map((r) => r.margin_pmpm || -90);
    const revABP = rows.map((r) => r.part_ab_revenue_pmpm || 1195);
    const revDP = rows.map((r) => r.part_d_revenue_pmpm || 180);
    const mm = sum(mem);

    // Utilization monthly
    const utM = (D.fact_utilization_monthly || []).filter((u) => u.entity_id === id);
    const getUM = (pattern) => {
      const match = utM.filter((u) => u.measure && u.measure.toLowerCase().includes(pattern));
      if (match.length >= 8) return match.slice(0, 8).map((m) => m.value);
      return [72, 71.8, 71.4, 71, 70.8, 70.9, 71.1, 71.2];
    };

    return (monthCache[id] = {
      rev,
      cost,
      sga,
      fc,
      mlr,
      mlrT,
      ioi,
      mem,
      revP,
      costP,
      sgaP,
      ioiP,
      revABP,
      revDP,
      mm,
      adm: getUM('admits'),
      er: getUM('er visits'),
      readm: getUM('30-day'),
      obs: getUM('obs'),
      snf: getUM('snf'),
      yoy: [2.1, 2.4, 1.8, 3.0, 2.6, 2.2, 2.9, 3.1],
    });
  };

  const MMo = (e) => monthly(e.id).mm;
  const pm$ = (e, k) => (e[k] * 1e6) / (MMo(e) || 1);
  const cmpMM = (e, mk) => (mk === 'pMem' ? e.pMM : (MMo(e) * e[mk]) / (e.members || 1));
  const bk = {
    budget: { rev: 'bRev', cost: 'bCost', sga: 'bSga', mem: 'bMem', ioi: 'bIoi', mlr: 'bMlr' },
    prior: { rev: 'pRev', cost: 'pCost', sga: 'pSga', mem: 'pMem', ioi: 'pIoi', mlr: 'pMlr' },
  };
  const cv = (e, k, cmp) => e[(bk[cmp] || bk.budget)[k]] || 0;
  const cvPM = (e, k, cmp) => (cv(e, k, cmp) * 1e6) / (cmpMM(e, cmp === 'budget' ? 'bMem' : 'pMem') || 1);
  const cvL = (e, k, cmp) => (cmp === 'prior' && ['rev', 'cost', 'sga', 'ioi'].includes(k) ? (cvPM(e, k, cmp) * MMo(e)) / 1e6 : cv(e, k, cmp));

  return { D, E, P, ORDER, T, BENCH, MONTHS, monthly, MMo, pm$, cmpMM, cv, cvPM, cvL };
}

/**
 * Main renderer: produces the complete HTML and metadata for the requested tab.
 */
export function renderConsoleTab(model, S) {
  const { D, E, P, ORDER, T, BENCH, MONTHS, monthly, pm$, cv, cvPM, cvL } = model;
  const cmp = S.cmp || 'budget';
  const isPr = cmp === 'prior';
  const cmpLabel = () => (isPr ? 'Prior yr (FY25)' : 'Budget');
  const cmpWord = () => (isPr ? 'prior year (FY25)' : 'budget');

  function focus() {
    if (S.group && S.group !== 'all' && E[S.group]) return E[S.group];
    if (S.market && S.market !== 'all' && E[S.market]) return E[S.market];
    return P;
  }

  function rows() {
    if (S.market === 'all') return (ORDER.markets || []).map((i) => E[i]).filter(Boolean);
    return (ORDER.groups[S.market] || []).map((i) => E[i]).filter(Boolean);
  }

  function rowsLabel() {
    return S.market === 'all' ? 'Market' : 'Provider group';
  }

  function allGroups() {
    return [].concat(...ORDER.markets.map((m) => (ORDER.groups[m] || []).map((i) => E[i]))).filter(Boolean);
  }

  function scopeName() {
    const f = focus();
    return f === P ? 'All markets' : f.name;
  }

  function scopeHeader(extra) {
    const f = focus();
    return `<div class="scope"><b>${esc(scopeName())}</b><span>${f === P ? '4 markets · 12 provider groups' : f.level === 'market' ? `Market · ${(ORDER.groups[f.id] || []).length} provider groups` : `Provider group · ${esc(E[f.market] ? E[f.market].name : '')}`}</span>${extra || ''}</div>`;
  }

  /* ---------- Tab 1: Overview ---------- */
  function kpiRow(f) {
    const m = monthly(f.id);
    const cm = cmp === 'budget' ? 'vs budget' : 'vs FY25 PMPM';
    const cmpTxt = (k, fmtD) => (isPr ? $$(cvPM(f, k, cmp)) + ' PMPM' : fmtD(cv(f, k, cmp)));
    const dv = (a, b, fmt, lowerBetter) => {
      const d = a - b;
      const good = lowerBetter ? d <= 0 : d >= 0;
      return `${dlt(fmt(d), good)} ${cm}`;
    };
    return (
      `<div class="kpis">` +
      kpi('Members', f0(f.members), `${dv(((f.members / (cv(f, 'mem', cmp) || 1)) - 1) * 100, 0, (v) => sP(v))} · ${f0(cv(f, 'mem', cmp))}`, m.mem) +
      kpi('Premium revenue', M(f.rev), `${dlt(sP(((f.rev / (cvL(f, 'rev', cmp) || 1)) - 1) * 100), f.rev >= cvL(f, 'rev', cmp))} ${cm} · ${cmpTxt('rev', M)}`, m.rev) +
      kpi('Medical cost', M(f.cost), `${dlt(sP(((f.cost / (cvL(f, 'cost', cmp) || 1)) - 1) * 100), f.cost <= cvL(f, 'cost', cmp))} ${cm} · ${cmpTxt('cost', M)}`, m.cost) +
      kpi('MLR (Part A/B)', pct(f.mlr), `${dlt(sPt(f.mlr - cv(f, 'mlr', cmp)), f.mlr <= cv(f, 'mlr', cmp))} ${cm} · ${pct(cv(f, 'mlr', cmp))}`, m.mlr) +
      kpi('SG&A', M(f.sga), `${dlt(sP(((f.sga / (cvL(f, 'sga', cmp) || 1)) - 1) * 100), f.sga <= cvL(f, 'sga', cmp))} ${cm} · ${cmpTxt('sga', M)}`, m.sga) +
      kpi('Income from operations', M(f.ioi), `${dlt(sM(f.ioi - cvL(f, 'ioi', cmp)), f.ioi >= cvL(f, 'ioi', cmp))} ${cm} · ${cmpTxt('ioi', M)}`, m.ioi) +
      `</div>`
    );
  }

  function bvaTable(f) {
    const cl = isPr ? 'FY 2025' : 'Budget';
    const sg = (v) => (v >= 0 ? '+' : '−') + '$' + Math.abs(v).toFixed(0);
    const r = (label, a, b, fmt, vfmt, opts = {}) => {
      const d = a - b;
      const vp = ((a / (b || 1)) - 1) * 100;
      const good = opts.lower ? d <= 0 : d >= 0;
      if (opts.nov) {
        return `<tr class="${opts.cls || ''}"><td>${label}</td><td class="num">${fmt(a)}</td><td class="num">${fmt(b)}</td><td class="num" style="color:var(--mute)">—</td><td class="num" style="color:var(--mute)">—</td></tr>`;
      }
      return `<tr class="${opts.cls || ''}"><td>${label}</td><td class="num">${fmt(a)}</td><td class="num">${fmt(b)}</td><td class="num ${good ? 'fav' : 'unfav'}">${vfmt(d)}</td><td class="num ${good ? 'fav' : 'unfav'}">${opts.pts ? '' : b <= 0 || a <= 0 ? '—' : sP(vp)}</td></tr>`;
    };
    const nov = isPr ? { nov: 1 } : {};
    const body =
      r('Members', f.members, cv(f, 'mem', cmp), f0, (v) => (v >= 0 ? '+' : '−') + f0(Math.abs(v))) +
      r('Premium revenue', f.rev, cv(f, 'rev', cmp), M, sM, { cls: 'tot', ...nov }) +
      r('Medical cost', f.cost, cv(f, 'cost', cmp), M, sM, { lower: 1, ...nov }) +
      r('MLR (Part A/B)', f.mlr, cv(f, 'mlr', cmp), pct, sPt, { lower: 1, pts: 1, cls: 'ind' }) +
      r('MLR incl. Part D', f.mlrT, cv(f, 'mlr', cmp) * 1.12, pct, sPt, { lower: 1, pts: 1, cls: 'ind' }) +
      r('SG&A', f.sga, cv(f, 'sga', cmp), M, sM, { lower: 1, ...nov }) +
      r('OCR', f.ocr, 10.1, pct, sPt, { lower: 1, pts: 1, cls: 'ind' }) +
      r('Income from operations', f.ioi, cv(f, 'ioi', cmp), M, sM, { cls: 'tot', ...nov }) +
      r('Revenue PMPM', pm$(f, 'rev'), cvPM(f, 'rev', cmp), $$, sg) +
      r('Medical cost PMPM', pm$(f, 'cost'), cvPM(f, 'cost', cmp), $$, sg, { lower: 1 }) +
      (isPr ? r('SG&A PMPM', pm$(f, 'sga'), cvPM(f, 'sga', cmp), $$, sg, { lower: 1 }) + r('Income from operations PMPM', pm$(f, 'ioi'), cvPM(f, 'ioi', cmp), $$, sg) : '');
    return `<div class="tw"><table><thead><tr><th>Metric</th><th>${isPr ? '2026 YTD' : 'Actual'}</th><th>${cl}</th><th>Var</th><th>Var %</th></tr></thead><tbody>${body}</tbody></table></div>`;
  }

  function callouts() {
    const out = [];
    const f = focus();
    const rs = rows();
    const rl = rowsLabel().toLowerCase();
    const sortedMlr = [...rs].sort((a, b) => b.mlr - a.mlr);
    const hiM = sortedMlr[0] || f;
    const loM = sortedMlr[sortedMlr.length - 1] || f;

    out.push(
      `<b>${esc(scopeName())} MLR (Part A/B) is ${pct(f.mlr)}</b>, ${Math.abs(f.mlr - BENCH).toFixed(1)} pts ${f.mlr > BENCH ? 'over' : 'under'} the ${pct(BENCH)} goal and ${Math.abs(f.mlr - cv(f, 'mlr', cmp)).toFixed(1)} pts ${f.mlr > cv(f, 'mlr', cmp) ? 'above' : 'below'} ${cmpWord()}. Including Part D it is ${pct(f.mlrT)}.`
    );
    if (f.level !== 'provider_group') {
      out.push(
        `<b>${esc(hiM.name)}</b> has the highest MLR of the ${rl}s at ${pct(hiM.mlr)} (${pct(hiM.mlr - BENCH, 1).replace(/^(\d)/, '+$1')} pts vs goal); <b>${esc(loM.name)}</b> is lowest at ${pct(loM.mlr)}.`
      );
    }
    const drivers = [];
    (f.level === 'provider_group' ? [f] : rs).forEach((e) => {
      drivers.push([e.name + ' revenue', e.rev - cvL(e, 'rev', cmp)], [e.name + ' medical cost', -(e.cost - cvL(e, 'cost', cmp))], [e.name + ' SG&A', -(e.sga - cvL(e, 'sga', cmp))]);
    });
    drivers.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    const d0 = drivers[0] || ['Revenue', 0];
    out.push(`Biggest mover to income from operations is <b>${esc(d0[0])}</b> at ${sM(d0[1])}.`);
    out.push(
      `<b>Income from operations is ${M(f.ioi)}</b>, ${sM(f.ioi - cvL(f, 'ioi', cmp))} ${cmpLabel().toLowerCase() === 'budget' ? 'to budget' : 'vs 2025 rates on the same member months'}; OCR is ${pct(f.ocr)}.`
    );
    out.push(
      `<b>Part D is the cost pressure:</b> ${$$(f.rxD)} PMPM of cost against ${$$(f.revD)} PMPM of Part D revenue, a ${$$(f.rxD - f.revD)} PMPM gap. Part D is ${((f.rxD / (f.pmpm || 1)) * 100).toFixed(0)}% of medical cost.`
    );
    const sortedStars = [...allGroups()].sort((a, b) => a.star - b.star);
    const lq = sortedStars[0] || f;
    out.push(
      `<b>Quality:</b> ${f.star.toFixed(1)} stars and ${f.hedis}% HEDIS composite. ${f.star >= T.star_target ? 'Above' : 'Below'} the ${T.star_target.toFixed(1)}-star bonus threshold. Lowest provider group plan-wide is ${esc(lq.name)} at ${lq.star.toFixed(1)}.`
    );
    out.push(
      `<b>Risk adjustment:</b> average RAF ${f.raf.toFixed(2)}, HCC capture ${f.hcc}%, chart review completion ${f.chart}%. At plan level chart review is −6 pts QoQ.`
    );
    return `<ul class="callouts">${out.map((x) => `<li>${x}</li>`).join('')}</ul>`;
  }

  function scopeSeries() {
    const f = focus();
    const cols = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)'];
    let list;
    if (f === P) list = (ORDER.markets || []).map((i) => E[i]).filter(Boolean);
    else if (f.level === 'market') list = (ORDER.groups[f.id] || []).map((i) => E[i]).filter(Boolean);
    else list = [f, E[f.market] || P, P];
    const tag = (e) => {
      const n = (e.name || '').replace('Northern', 'N.');
      return n.length > 15 ? n.split(' ').slice(0, 2).join(' ') : n;
    };
    return list.map((e, i) => ({
      name: tag(e),
      color: f.level === 'provider_group' ? ['var(--c2)', 'var(--c1)', 'var(--c3)'][i] || cols[0] : cols[i % cols.length],
      vals: monthly(e.id).mlr,
      w: f.level === 'provider_group' && i > 0 ? 1.6 : 2.4,
      dash: f.level === 'provider_group' && i === 2,
    }));
  }

  function mlrChart() {
    return lineChart({
      series: scopeSeries(),
      labels: MONTHS,
      fmt: (v) => v.toFixed(1) + '%',
      target: BENCH,
      targetLabel: 'Goal ' + BENCH.toFixed(1) + '%',
      label: 'MLR by month',
      h: 250,
    });
  }

  function bridgeChart() {
    const rs = rows();
    const f = focus();
    const items = [];
    const list = f.level === 'provider_group' ? [f] : rs;
    [
      ['Revenue', (e) => e.rev - cvL(e, 'rev', cmp)],
      ['Medical cost', (e) => -(e.cost - cvL(e, 'cost', cmp))],
      ['SG&A', (e) => -(e.sga - cvL(e, 'sga', cmp))],
    ].forEach(([k, fn]) =>
      list.forEach((e) =>
        items.push({
          label: k + ' · ' + (e.name || '').replace('Northern', 'N.'),
          v: fn(e),
        })
      )
    );
    return divBars(items, (v) => sM(v));
  }

  function compareTable() {
    const rs = rows();
    const f = focus();
    const tot = f === P || f.level === 'market' ? f : E[f.market] || P;
    const line = (e, cls) =>
      `<tr class="${cls || ''}" data-entity="${esc(e.id)}" style="cursor:pointer"><td>${esc(e.name)}</td><td class="num">${f0(e.members)}</td><td class="num">${M(e.rev)}</td><td class="num">${$$(pm$(e, 'rev'))}</td><td class="num">${M(e.cost)}</td><td class="num">${$$(pm$(e, 'cost'))}</td><td ${hcn(e.mlr, BENCH, false)}>${pct(e.mlr)}</td><td class="num">${pct(e.ocr)}</td><td class="num">${M(e.ioi)}</td><td ${hcn(e.star, T.star_target, true)}>${e.star.toFixed(1)}</td></tr>`;
    return `<div class="tw"><table><thead><tr><th>${rowsLabel()}</th><th>Members</th><th>Revenue</th><th>Rev PMPM</th><th>Med cost</th><th>Med PMPM</th><th>MLR</th><th>OCR</th><th>IOI</th><th>Stars</th></tr></thead><tbody>${rs.map((e) => line(e, e.id === S.group ? 'sel' : '')).join('')}${line(tot, 'tot')}</tbody></table></div>`;
  }

  function vOverview() {
    const f = focus();
    const od = { '% Patients seen': { target_pct: 90, value_pct: 91 }, '% AWV seen': { target_pct: 75, value_pct: 69 } };
    (D.overview_dials || []).forEach((r) => (od[r.measure] = r));
    const dh = f.hedis - 82;
    const seen = Math.min(98, Math.max(70, od['% Patients seen'].value_pct + dh * 0.4));
    const awv = Math.min(95, Math.max(50, od['% AWV seen'].value_pct + dh * 0.8));

    const goals = card(
      'Goals at a glance',
      'tick marks the target',
      `<div class="dials">
        <div><div class="dl">MLR (Part A/B)</div>${dial({ v: f.mlr, min: 75, max: 100, target: BENCH, hb: false, fmt: (v) => v.toFixed(1) + '%', tfmt: (v) => v.toFixed(1) + '%', label: 'MLR' })}</div>
        <div><div class="dl">Overall star rating</div>${dial({ v: f.star, min: 1, max: 5, target: T.star_target, fmt: (v) => v.toFixed(1), tfmt: (v) => v.toFixed(1), label: 'Star rating' })}</div>
        <div><div class="dl">% Patients seen</div>${dial({ v: seen, min: 0, max: 100, target: od['% Patients seen'].target_pct, fmt: (v) => Math.round(v) + '%', tfmt: (v) => v + '%', label: 'Patients seen' })}</div>
        <div><div class="dl">% AWV seen</div>${dial({ v: awv, min: 0, max: 100, target: od['% AWV seen'].target_pct, fmt: (v) => Math.round(v) + '%', tfmt: (v) => v + '%', label: 'AWV seen' })}</div>
      </div>`,
      'MLR is lower-is-better. Care access dials for markets and groups are sample splits of the plan values.'
    );

    return (
      scopeHeader() +
      kpiRow(f) +
      goals +
      `<div class="grid2">${card(isPr ? 'Prior year vs actual summary' : 'Budget vs actual summary', '2026 YTD · ' + cmpLabel(), bvaTable(f), 'Budget and prior-year figures are sample values for the prototype. IOI = revenue − medical cost − SG&A.')}${card('Key callouts', 'from the data on this page', inner(callouts()))}</div>` +
      `<div class="grid2e">${card('MLR by ' + (focus() === P ? 'market' : focus().level === 'market' ? 'provider group' : 'month'), 'monthly · goal ' + pct(BENCH), inner(mlrChart() + (focus().level === 'provider_group' ? legendDots([['Group', 'var(--c2)'], ['Market', 'var(--c1)'], ['Total', 'var(--c3)']]) : '')))}${card('Income from operations: ' + cmpWord() + ' to actual', isPr ? 'YTD variance by driver (PMPM basis)' : 'YTD variance by driver', inner(bridgeChart() + legendDots([['Favorable', 'var(--teal)'], ['Unfavorable', 'var(--unfav)']])))}</div>` +
      card((S.market === 'all' ? 'Market' : 'Provider group') + ' comparison', '2026 YTD', compareTable(), 'MLR shaded against the ' + pct(BENCH) + ' provider MLR goal; stars against the ' + T.star_target.toFixed(1) + '-star bonus threshold.')
    );
  }

  /* ---------- Tab 2: Financials ---------- */
  const mom = (a) => a.map((v, i) => (i === 0 ? null : ((v / a[i - 1]) - 1) * 100));

  function finMonthTable(f) {
    const m = monthly(f.id);
    const rP = mom(m.revP);
    const cP = mom(m.costP);
    const dc = (v, lowerBetter) => (v == null ? '<td class="num">—</td>' : `<td class="num ${(lowerBetter ? v <= 0 : v >= 0) ? 'fav' : 'unfav'}">${sP(v, 2)}</td>`);
    let body = '';
    MONTHS.forEach((l, i) => {
      body += `<tr><td>${l}</td><td class="num">${f0(m.mem[i])}</td><td class="num">${M(m.rev[i])}</td><td class="num"><b>${$$(m.revP[i])}</b></td><td class="num">${$$(m.revABP[i])}</td><td class="num">${$$(m.revDP[i])}</td>${dc(rP[i])}<td class="num">${M(m.cost[i])}</td><td class="num"><b>${$$(m.costP[i])}</b></td>${dc(cP[i], true)}<td class="num">${M(m.sga[i])}</td><td class="num">${M(m.ioi[i])}</td><td class="num"${hcn(m.mlr[i], BENCH, false)}>${pct(m.mlr[i])}</td></tr>`;
    });
    const tr = ((m.revP[7] / m.revP[0]) - 1) * 100;
    const tc = ((m.costP[7] / m.costP[0]) - 1) * 100;
    body += `<tr class="tot"><td>2026 YTD</td><td class="num">${f0(m.mm / 8)} avg</td><td class="num">${M(f.rev)}</td><td class="num">${$$(pm$(f, 'rev'))}</td><td class="num">${$$(f.revAB)}</td><td class="num">${$$(f.revD)}</td><td class="num ${tr >= 0 ? 'fav' : 'unfav'}">${sP(tr, 1)} Jan→Aug</td><td class="num">${M(f.cost)}</td><td class="num">${$$(pm$(f, 'cost'))}</td><td class="num ${tc <= 0 ? 'fav' : 'unfav'}">${sP(tc, 1)} Jan→Aug</td><td class="num">${M(f.sga)}</td><td class="num">${M(f.ioi)}</td><td class="num">${pct(f.mlr)}</td></tr>`;
    return `<div class="tw"><table><thead><tr><th>Month</th><th>Members</th><th>Revenue $</th><th>Revenue PMPM</th><th>Part A/B PMPM</th><th>Part D PMPM</th><th>Rate MoM</th><th>Med cost $</th><th>Med cost PMPM</th><th>MoM</th><th>SG&A $</th><th>IOI $</th><th>MLR (A/B)</th></tr></thead><tbody>${body}</tbody></table></div>`;
  }

  function vFin() {
    const f = focus();
    const m = monthly(f.id);
    const rP = mom(m.revP);
    const first = m.revP[0];
    const last = m.revP[7];
    const down = rP.slice(1).filter((v) => v < 0).length;
    const tiles2 = `<div class="kpis" style="grid-template-columns:repeat(4,minmax(0,1fr))">${kpi('Revenue PMPM · Aug', $$(last), `${dlt(sP(((last / (m.revP[6] || 1)) - 1) * 100, 2), last >= m.revP[6])} vs Jul`, m.revP)}${kpi('Rate change Jan→Aug', sP(((last / (first || 1)) - 1) * 100, 1), `${$$(first)} → ${$$(last)} · ${down} of 7 months down`, m.revP)}${kpi('Part A/B revenue PMPM', $$(f.revAB), `YTD · ${((f.revAB / (f.revPM || 1)) * 100).toFixed(0)}% of revenue`, m.revABP)}${kpi('Part D revenue PMPM', $$(f.revD), `YTD · Part D cost ${$$(f.rxD)}`, m.revDP)}${kpi('Medical cost PMPM · Aug', $$(m.costP[7]), `${dlt(sP(((m.costP[7] / (m.costP[6] || 1)) - 1) * 100, 2), m.costP[7] <= m.costP[6])} vs Jul`, m.costP)}${kpi('Margin PMPM · Aug', $$(m.ioiP[7]), `${$$(m.ioiP[0])} in Jan`, m.ioiP)}${kpi('MLR incl. Part D', pct(f.mlrT), `Part A/B ${pct(f.mlr)} · Part D ${pct(f.mlrD)}`, m.mlrT)}${kpi('Member months (YTD)', f0(m.mm), `${f0(m.mm / 8)} average members · ${M(f.rev)} revenue`)}</div>`;
    const rev = lineChart({ series: [{ name: 'Actual', color: 'var(--c2)', vals: m.rev }, { name: 'Forecast', color: 'var(--c1)', vals: m.fc, dash: 1, w: 1.8 }], labels: MONTHS, fmt: (v) => '$' + v.toFixed(1), label: 'Premium revenue vs forecast ($M)', h: 230, rightPad: 104 });
    const rate = lineChart({ series: [{ name: 'Revenue PMPM', color: 'var(--c2)', vals: m.revP }, { name: 'Med cost PMPM', color: 'var(--c1)', vals: m.costP }], labels: MONTHS, fmt: (v) => '$' + v.toFixed(0), label: 'Revenue and medical cost per member per month', h: 230, rightPad: 136 });
    const delta = deltaCols(MONTHS, rP, (v) => sP(v, 1), 'Revenue rate change month over month');
    const stack = stackCols(MONTHS, [{ name: 'Medical cost', color: 'var(--c1)', vals: m.cost }, { name: 'SG&A', color: 'var(--c3)', vals: m.sga }, { name: 'Income from ops', color: 'var(--c2)', vals: m.ioi }], (v) => '$' + v.toFixed(0), 'Where each premium dollar goes ($M)', 210);
    const rs = rows();
    const tot = f === P || f.level === 'market' ? f : E[f.market] || P;
    const ln = (e, c) => `<tr class="${c || ''}" data-entity="${esc(e.id)}" style="cursor:pointer"><td>${esc(e.name)}</td><td class="num">${M(e.rev)}</td><td class="num">${((e.rev / (tot.rev || 1)) * 100).toFixed(0)}%</td><td class="num"><b>${$$(pm$(e, 'rev'))}</b></td><td class="num">${$$(e.revAB)}</td><td class="num">${$$(e.revD)}</td><td class="num">${M(e.cost)}</td><td class="num"><b>${$$(pm$(e, 'cost'))}</b></td><td class="num">${M(e.sga)}</td><td class="num">${M(e.ioi)}</td><td class="num"${hcn(e.mlr, BENCH, false)}>${pct(e.mlr)}</td><td class="num">${pct(e.ocr)}</td><td class="num ${e.rev >= cvL(e, 'rev', cmp) ? 'fav' : 'unfav'}">${sP(((e.rev / (cvL(e, 'rev', cmp) || 1)) - 1) * 100)}</td></tr>`;
    const ent = `<div class="tw"><table><thead><tr><th>${rowsLabel()}</th><th>Revenue $</th><th>Share</th><th>Revenue PMPM</th><th>A/B PMPM</th><th>Part D PMPM</th><th>Med cost $</th><th>Med cost PMPM</th><th>SG&A $</th><th>IOI $</th><th>MLR (A/B)</th><th>OCR</th><th>Rev vs ${isPr ? 'FY25' : 'budget'}</th></tr></thead><tbody>${rs.map((e) => ln(e, e.id === S.group ? 'sel' : '')).join('')}${ln(tot, 'tot')}</tbody></table></div>`;
    return (
      scopeHeader() +
      kpiRow(f) +
      tiles2 +
      `<div class="grid2e">${card('Revenue rate vs cost per member', 'PMPM by month', inner(rate + legendDots([['Revenue PMPM', 'var(--c2)'], ['Medical cost PMPM', 'var(--c1)']])), 'PMPM = monthly dollars ÷ members that month.')}${card('Revenue rate change', 'month over month', inner(delta), 'Teal means the revenue rate rose that month; coral means it fell.')}</div><div style="height:12px"></div>` +
      `<div class="grid2e">${card('Premium revenue vs forecast', '$M by month', inner(rev))}${card('Where the premium dollar goes', '$M by month', inner(stack + legendDots([['Medical cost', 'var(--c1)'], ['SG&A', 'var(--c3)'], ['Income from operations', 'var(--c2)']])))}</div><div style="height:12px"></div>` +
      card('Monthly financials · ' + scopeName(), 'total dollars and PMPM', finMonthTable(f), 'Months before March use members back-filled at the observed growth rate, and market and group monthly splits are scaled from the plan series.') +
      card((S.market === 'all' ? 'Market' : 'Provider group') + ' financials', 'YTD dollars and PMPM', ent)
    );
  }

  /* ---------- Tab 3: Medical Cost ---------- */
  function specSection(f) {
    const inst = (S.cs || 'inst') === 'inst';
    const seg = `<div class="seg" style="max-width:260px;margin:0 0 10px"><button data-cs="inst" aria-pressed="${inst}">Institutional</button><button data-cs="prof" aria-pressed="${!inst}">Professional</button></div>`;
    let tbl;
    let drill;
    let foot;

    if (inst) {
      const services = (D.fact_institutional_services || []).filter((s) => s.entity_id === f.id);
      const planServices = (D.fact_institutional_services || []).filter((s) => s.entity_id === 'plan');
      const curKey = S.spec || 'Admits';
      const cur = services.find((s) => s.service === curKey) || services[0] || { service: 'Admits', pmpm: 235, yoy_change_pct: -0.9 };
      const pcur = planServices.find((s) => s.service === cur.service) || cur;
      const totI = f.ip + f.op;

      const row = (s) => {
        const p = planServices.find((ps) => ps.service === s.service) || s;
        const diff = s.pmpm - p.pmpm;
        return `<tr data-spec="${esc(s.service)}" tabindex="0" role="button" class="ind ${s.service === cur.service ? 'sel' : ''}"><td>${esc(s.service)}</td><td class="num"><b>${$$(s.pmpm)}</b>${cellBar(s.pmpm, 150, 'var(--c2)')}</td><td class="num">${((s.pmpm / (totI || 1)) * 100).toFixed(0)}%</td><td class="num">${s.utilization_per_1000 ? s.utilization_per_1000.toFixed(1) : '—'}</td><td class="num">${s.cost_per_unit_usd ? $$(s.cost_per_unit_usd) : '—'}</td><td class="num ${s.yoy_change_pct <= 2 ? 'fav' : 'unfav'}">${sP(s.yoy_change_pct)}</td><td class="num ${diff <= 0 ? 'fav' : 'unfav'}">${f === P ? '—' : (diff >= 0 ? '+' : '−') + '$' + Math.abs(diff).toFixed(0)}</td></tr>`;
      };

      const ipRows = services.filter((s) => (s.group || '').includes('inpatient'));
      const opRows = services.filter((s) => (s.group || '').includes('outpatient'));

      tbl = `<div class="tw"><table><thead><tr><th>Service</th><th>PMPM</th><th>Share</th><th>Util / 1,000</th><th>Cost per unit</th><th>YoY</th><th>vs plan</th></tr></thead><tbody><tr class="tot"><td>Institutional inpatient</td><td class="num">${$$(f.ip)}</td><td class="num">${((f.ip / (totI || 1)) * 100).toFixed(0)}%</td><td></td><td></td><td></td><td></td></tr>${ipRows.map(row).join('')}<tr class="tot"><td>Institutional outpatient</td><td class="num">${$$(f.op)}</td><td class="num">${((f.op / (totI || 1)) * 100).toFixed(0)}%</td><td></td><td></td><td></td><td></td></tr>${opRows.map(row).join('')}<tr class="tot"><td>Total institutional</td><td class="num">${$$(totI)}</td><td class="num">100%</td><td></td><td></td><td></td><td></td></tr></tbody></table></div>`;

      const ents = rows().map((e) => {
        const eS = (D.fact_institutional_services || []).find((s) => s.entity_id === e.id && s.service === cur.service);
        return { e, v: eS ? eS.pmpm : cur.pmpm };
      });

      const bars = hBars(
        ents.sort((a, b) => b.v - a.v).map((x) => ({ label: x.e.name, v: x.v, color: x.v <= pcur.pmpm * 1.01 ? 'var(--c2)' : 'var(--c4)', bold: x.e.id === S.group })),
        { min: 0, max: Math.max(...ents.map((x) => x.v), pcur.pmpm) * 1.15, ref: pcur.pmpm, refLabel: $$(pcur.pmpm), fmt: (v) => $$(v), label: cur.service + ' PMPM', L: 158, rh: 24, w: 440 }
      );

      const mini = `<div class="kpis" style="grid-template-columns:repeat(2,minmax(0,1fr));margin-bottom:12px">${kpi(cur.service + ' PMPM', $$(cur.pmpm), f === P ? 'all markets' : `${dlt((cur.pmpm - pcur.pmpm >= 0 ? '+' : '−') + '$' + Math.abs(cur.pmpm - pcur.pmpm).toFixed(0), cur.pmpm <= pcur.pmpm)} vs plan`)}${kpi('Share of institutional', ((cur.pmpm / (totI || 1)) * 100).toFixed(0) + '%', 'of inpatient + outpatient')}${kpi('Utilization / 1,000', cur.utilization_per_1000 ? cur.utilization_per_1000.toFixed(1) : '—', cur.utilization_unit || 'feed')}${kpi('Cost per unit', cur.cost_per_unit_usd ? $$(cur.cost_per_unit_usd) : '—', 'per unit')}</div>`;

      drill = card('Drill-down: ' + cur.service, 'by ' + rowsLabel().toLowerCase(), inner(mini + bars), 'Teal means at or under plan PMPM; amber means above.');
      foot = 'Institutional inpatient is admits, LTAC, ARU and SNF; outpatient is ER, OBS and other outpatient.';
    } else {
      const specs = (D.fact_professional_specialty || []).filter((s) => s.entity_id === f.id);
      const planSpecs = (D.fact_professional_specialty || []).filter((s) => s.entity_id === 'plan');
      const curKey = S.spec || 'Primary care';
      const cur = specs.find((s) => s.specialty === curKey) || specs[0] || { specialty: 'Primary care', pmpm: 42, share_of_professional_pct: 16 };
      const pcur = planSpecs.find((s) => s.specialty === cur.specialty) || cur;

      tbl = `<div class="tw"><table><thead><tr><th>Specialty</th><th>PMPM</th><th>Share</th><th>YoY</th><th>vs plan</th></tr></thead><tbody>${specs.map((s) => {
        const p = planSpecs.find((ps) => ps.specialty === s.specialty) || s;
        const diff = s.pmpm - p.pmpm;
        return `<tr data-spec="${esc(s.specialty)}" tabindex="0" role="button" class="${s.specialty === cur.specialty ? 'sel' : ''}"><td>${esc(s.specialty)}</td><td class="num"><b>${$$(s.pmpm)}</b>${cellBar(s.pmpm, 50, 'var(--c2)')}</td><td class="num">${s.share_of_professional_pct}%</td><td class="num ${s.yoy_change_pct <= 2 ? 'fav' : 'unfav'}">${sP(s.yoy_change_pct)}</td><td class="num ${diff <= 0 ? 'fav' : 'unfav'}">${f === P ? '—' : (diff >= 0 ? '+' : '−') + '$' + Math.abs(diff).toFixed(0)}</td></tr>`;
      }).join('')}<tr class="tot"><td>Total professional</td><td class="num">${$$(f.pro)}</td><td class="num">100%</td><td></td><td></td></tr></tbody></table></div>`;

      const ents = rows().map((e) => {
        const eS = (D.fact_professional_specialty || []).find((s) => s.entity_id === e.id && s.specialty === cur.specialty);
        return { e, v: eS ? eS.pmpm : cur.pmpm };
      });

      const bars = hBars(
        ents.sort((a, b) => b.v - a.v).map((x) => ({ label: x.e.name, v: x.v, color: x.v <= pcur.pmpm * 1.01 ? 'var(--c2)' : 'var(--c4)', bold: x.e.id === S.group })),
        { min: 0, max: Math.max(...ents.map((x) => x.v), pcur.pmpm) * 1.15, ref: pcur.pmpm, refLabel: $$(pcur.pmpm), fmt: (v) => $$(v), label: cur.specialty + ' PMPM', L: 158, rh: 24, w: 440 }
      );

      const mini = `<div class="kpis" style="grid-template-columns:repeat(2,minmax(0,1fr));margin-bottom:12px">${kpi(cur.specialty + ' PMPM', $$(cur.pmpm), f === P ? 'all markets' : `${dlt((cur.pmpm - pcur.pmpm >= 0 ? '+' : '−') + '$' + Math.abs(cur.pmpm - pcur.pmpm).toFixed(0), cur.pmpm <= pcur.pmpm)} vs plan`)}${kpi('Share of professional', (cur.share_of_professional_pct || 16) + '%', 'of professional cost')}${kpi('YoY', sP(cur.yoy_change_pct || 1.2), dlt(cur.yoy_change_pct <= 2 ? 'Within trend' : 'Above trend', cur.yoy_change_pct <= 2))}${kpi('Rank', '1 of ' + specs.length, 'by PMPM in scope')}</div>`;

      drill = card('Drill-down: ' + cur.specialty, 'by ' + rowsLabel().toLowerCase(), inner(mini + bars), 'Teal means at or under plan PMPM for the specialty; amber means above.');
      foot = 'Professional cost by specialty.';
    }
    return `<div style="margin-top:0">${seg}</div><div class="grid2">${card(inst ? 'Institutional cost by service' : 'Professional cost by specialty', scopeName() + ' · click a row to drill', tbl, foot)}${drill}</div><div style="height:12px"></div>`;
  }

  function vCost() {
    const f = focus();
    const rs = rows();
    const list = [P].concat(rs.filter((e) => e !== P));
    const cat = [
      ['rxD', 'Part D', 'var(--c2)'],
      ['ip', 'Inst. inpatient', 'var(--c1)'],
      ['op', 'Inst. outpatient', 'var(--c3)'],
      ['pro', 'Professional', 'var(--c4)'],
      ['cap', 'Capitation', 'var(--c5)'],
      ['oth', 'Other', 'var(--c6)'],
    ];
    const PA = P.pmpm;
    const W = 560;
    const rh = 30;
    const L = 140;
    const R = 60;
    const H = list.length * rh + 30;
    const mx = Math.max(...list.map((e) => e.pmpm || 0)) * 1.08;
    const x = (v) => L + ((W - L - R) * v) / (mx || 1);
    let g = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Medical cost PMPM by category"><line x1="${x(PA)}" x2="${x(PA)}" y1="2" y2="${H - 18}" stroke="var(--mute)" stroke-dasharray="4 3"/><text x="${x(PA)}" y="${H - 5}" text-anchor="middle" font-size="10" fill="var(--mute)">${$$(PA)} avg</text>`;
    list.forEach((e, i) => {
      let acc = 0;
      const yy = 4 + i * rh;
      g += `<text x="${L - 8}" y="${yy + 16}" text-anchor="end" font-size="10.5" fill="var(--ink2)" ${e === P ? 'font-weight="700"' : ''}>${esc(e.name)}</text>`;
      cat.forEach(([k, n, c]) => {
        g += `<rect x="${x(acc)}" y="${yy + 4}" width="${x(e[k] || 0) - x(0)}" height="18" fill="${c}"><title>${esc(e.name)} · ${n} ${$$(e[k])}</title></rect>`;
        acc += e[k] || 0;
      });
      g += `<text x="${x(acc) + 5}" y="${yy + 17}" font-size="10.5" font-weight="600" fill="var(--ink)">${$$(acc)}</text>`;
    });
    g += '</svg>';

    const tbl = `<div class="tw"><table><thead><tr><th>Entity</th><th>Part D</th><th>Inst. IP</th><th>Inst. OP</th><th>Professional</th><th>Capitation</th><th>Other</th><th>Total PMPM</th><th>YoY</th><th>vs plan avg</th></tr></thead><tbody>${list.map((e) => `<tr class="${e === P ? 'tot' : e.id === S.group ? 'sel' : ''}" data-entity="${esc(e.id)}" style="cursor:pointer"><td>${esc(e.name)}</td><td ${hcn(e.rxD, P.rxD, false)}>${$$(e.rxD)}</td><td class="num">${$$(e.ip)}</td><td class="num">${$$(e.op)}</td><td class="num">${$$(e.pro)}</td><td class="num">${$$(e.cap)}</td><td class="num">${$$(e.oth)}</td><td ${hcn(e.pmpm, PA, false)}><b>${$$(e.pmpm)}</b></td><td class="num ${e.pmpmYoy <= 2 ? 'fav' : 'unfav'}">${sP(e.pmpmYoy)}</td><td class="num ${e.pmpm <= PA ? 'fav' : 'unfav'}">${e === P ? '—' : (e.pmpm - PA >= 0 ? '+' : '−') + '$' + Math.abs(e.pmpm - PA).toFixed(0)}</td></tr>`).join('')}</tbody></table></div>`;
    const sh = (k) => `${(((f[k] || 0) / (f.pmpm || 1)) * 100).toFixed(0)}% of total`;
    const tiles = `<div class="kpis">${kpi('Total medical cost PMPM', $$(f.pmpm), `${dlt(sP(f.pmpmYoy), f.pmpmYoy <= 2)} YoY · ${M(f.cost)} total`, monthly(f.id).costP)}${kpi('Part D PMPM', $$(f.rxD), `${sh('rxD')} · revenue ${$$(f.revD)}`)}${kpi('Inst. inpatient PMPM', $$(f.ip), sh('ip'))}${kpi('Inst. outpatient PMPM', $$(f.op), sh('op'))}${kpi('Professional PMPM', $$(f.pro), sh('pro'))}${kpi('Capitation PMPM', $$(f.cap), `${sh('cap')} · other ${$$(f.oth)}`)}</div>`;
    const hc2 = `<div class="in"><div style="display:flex;gap:18px;flex-wrap:wrap"><div><div class="v num" style="font-size:26px;font-weight:700">${T.high_cost_member_share_pct || 1.2}%</div><div class="d" style="color:var(--mute)">of members are high-cost claimants (over ${$$(T.hcc_high_cost_claimant_threshold_usd || 50000)})</div></div><div><div class="v num" style="font-size:26px;font-weight:700">${T.high_cost_cost_share_pct || 18}%</div><div class="d" style="color:var(--mute)">of total medical cost</div></div></div><p style="color:var(--ink2);margin:10px 0 0">Plan-level figures. A small group of claimants drives close to a fifth of cost, so a handful of cases can move a group’s MLR.</p></div>`;

    return (
      scopeHeader() +
      tiles +
      `<div class="grid2">${card('Medical cost PMPM by category', 'stacked · dashed line is the average', inner(g + legendDots(cat.map((c) => [c[1], c[2]]))))}${card('High-cost claimants', '', hc2)}</div><div style="height:12px"></div>` +
      specSection(f) +
      card('PMPM detail', 'shaded vs plan average', tbl, 'Medical cost PMPM here ties to financial medical cost ÷ member months.')
    );
  }

  /* ---------- Tab 4: Provider MLR ---------- */
  function vMlr() {
    const f = focus();
    const groups = allGroups().filter((g) => S.market === 'all' || g.market === S.market).sort((a, b) => b.mlr - a.mlr);
    const bars = hBars(
      groups.map((g) => ({ label: g.name, v: g.mlr, color: { ok: 'var(--c2)', warn: 'var(--c4)', bad: 'var(--unfav)' }[heat(g.mlr, BENCH, false) || 'ok'], bold: g.id === S.group })),
      { min: 70, max: 105, ref: BENCH, refLabel: 'Goal ' + BENCH.toFixed(1) + '%', fmt: (v) => v.toFixed(1) + '%', label: 'MLR by provider group', L: 170, rh: 24 }
    );
    const nets = D.fact_network_mlr || [];
    const ntbl = `<div class="tw"><table><thead><tr><th>Network</th><th>Members</th><th>MLR</th><th>PMPM cost</th><th>vs benchmark</th></tr></thead><tbody>${nets.map((n) => {
      const c = heat(n.mlr_pct, BENCH, false);
      return `<tr><td>${esc(n.network_name)}</td><td class="num">${f0(n.members)}</td><td class="num ${c}">${pct(n.mlr_pct)}${cellBar(n.mlr_pct - 70, 25, 'var(--c3)')}</td><td class="num">${$$(n.pmpm_cost)}</td><td><span class="pill ${c}">${{ ok: 'On track', warn: 'Above goal', bad: 'Off track' }[c]}</span></td></tr>`;
    }).join('')}</tbody></table></div>`;
    const k = (D.ref_plan_kpi_deltas || D.kpi_tiles || []).filter((r) => r.category === 'mlr');
    const tiles = `<div class="kpis" style="grid-template-columns:repeat(4,minmax(0,1fr))">${(k.length ? k : [
      { kpi_label: 'Network-wide MLR', value_display: '85.1%', delta_display: '-0.8 pt QoQ', delta_is_favorable: 'yes' },
      { kpi_label: 'Providers below MLR target', value_display: '12 of 145', delta_display: '+3 vs. last qtr', delta_is_favorable: 'no' },
      { kpi_label: 'Highest MLR (Network C · Rural)', value_display: '91.4%', delta_display: '+1.2 pt QoQ', delta_is_favorable: 'no' },
      { kpi_label: 'Provider cost variance index', value_display: '1.08', delta_display: '+0.02 QoQ', delta_is_favorable: 'no' },
    ]).map((r) => kpi(r.kpi_label, r.value_display, `${dlt(esc(r.delta_display), r.delta_is_favorable === 'yes')}`)).join('')}</div>`;
    const gt = `<div class="tw"><table><thead><tr><th>Provider group</th><th>Market</th><th>Members</th><th>Revenue</th><th>Med cost</th><th>MLR</th><th>vs goal</th><th>Rev PMPM</th><th>Med PMPM</th></tr></thead><tbody>${groups.map((g) => `<tr class="${g.id === S.group ? 'sel' : ''}" data-entity="${esc(g.id)}" style="cursor:pointer"><td>${esc(g.name)}</td><td>${esc(E[g.market] ? E[g.market].name : '')}</td><td class="num">${f0(g.members)}</td><td class="num">${M(g.rev)}</td><td class="num">${M(g.cost)}</td><td ${hcn(g.mlr, BENCH, false)}>${pct(g.mlr)}</td><td class="num ${g.mlr <= BENCH ? 'fav' : 'unfav'}">${sPt(g.mlr - BENCH)}</td><td class="num">${$$(pm$(g, 'rev'))}</td><td class="num">${$$(pm$(g, 'cost'))}</td></tr>`).join('')}</tbody></table></div>`;
    return (
      scopeHeader() +
      tiles +
      `<div class="grid2e">${card('Provider group MLR ranking', '2026 YTD · goal ' + pct(BENCH), inner(bars), 'Bars use the 1–19% (yellow) and 20%+ (red) variance-to-goal thresholds.')}${card('Network MLR', 'by network', ntbl)}</div>` +
      card('Provider group detail', 'sorted by MLR, highest first', gt, 'MLR includes provider and member incentives in cost.')
    );
  }

  /* ---------- Tab 5: Utilization ---------- */
  const UB = { adm: 153, er: 339, readm: 14, obs: 36.0, snf: 25 };
  function vUtil() {
    const f = focus();
    const m = monthly(f.id);
    const rs = rows();
    const tot = f === P || f.level === 'market' ? f : E[f.market] || P;
    const defs = [
      ['adm', 'Admits / 1,000', (v) => v.toFixed(0)],
      ['er', 'ER visits / 1,000', (v) => v.toFixed(0)],
      ['readm', '30-day readmit rate', (v) => v.toFixed(1) + '%'],
      ['obs', 'OBS stays / 1,000', (v) => v.toFixed(1)],
      ['snf', 'SNF admits / 1,000', (v) => v.toFixed(1)],
    ];
    const vb = (k) => ((f[k] / UB[k]) - 1) * 100;
    const tiles = `<div class="kpis" style="grid-template-columns:repeat(5,minmax(0,1fr))">${defs.map(([k, l, fm]) => kpi(l, fm(f[k] || 0), `${dlt(sP(vb(k)), vb(k) <= 0)} vs target ${fm(UB[k])}`, m[k])).join('')}</div>`;
    const mk = (arr) =>
      arr.map(([k, l, fm]) =>
        card(
          l,
          'monthly · target ' + fm(UB[k]),
          inner(
            lineChart({
              series: [{ name: 'Actual', color: 'var(--c2)', vals: m[k], lab: 'YTD ' + fm(f[k] || 0) }, ...(f !== P ? [{ name: 'All markets', color: 'var(--c1)', vals: monthly('plan')[k], w: 1.4, lab: '' }] : [])],
              labels: MONTHS,
              fmt: fm,
              label: l,
              h: 200,
              w: 400,
              rightPad: 70,
              target: UB[k],
              targetLabel: 'Target',
            })
          )
        )
      ).join('');
    const chartsA = mk(defs.slice(0, 3));
    const chartsB = mk(defs.slice(3));
    const bars = divBars(defs.map(([k, l]) => ({ label: l, v: -vb(k) })), (v) => sP(-v), { w: 420, L: 140 });
    const bcard = card('Variance to target', scopeName(), inner(bars + legendDots([['Better than target', 'var(--teal)'], ['Worse than target', 'var(--unfav)']])), 'Lower is better for every utilization measure shown.');
    const brow = `<tr class="tot"><td>Target <span style="color:var(--mute);font-weight:400"></span></td>${defs.map(([k, , fm]) => `<td class="num">${fm(UB[k])}</td>`).join('')}</tr>`;
    const tbl = `<div class="tw"><table><thead><tr><th>${rowsLabel()}</th>${defs.map((d) => `<th>${d[1]}</th>`).join('')}</tr></thead><tbody>${rs.concat([tot]).map((e) => `<tr class="${e === tot ? 'tot' : e.id === S.group ? 'sel' : ''}" data-entity="${esc(e.id)}" style="cursor:pointer"><td>${esc(e.name)}${e === tot && e.id !== 'plan' ? ' <span style="color:var(--mute);font-weight:400">(total)</span>' : ''}</td>${defs.map(([k, , fm]) => `<td${hcn(e[k], UB[k], false)}>${fm(e[k] || 0)}<span style="color:var(--mute);font-size:11px"> ${sP(((e[k] / UB[k]) - 1) * 100, 0)}</span></td>`).join('')}</tr>`).join('')}${brow}</tbody></table></div>`;
    return (
      scopeHeader() +
      tiles +
      `<div class="grid3">${chartsA}</div><div style="height:12px"></div><div class="grid3">${chartsB}${bcard}</div><div style="height:12px"></div>` +
      card('Utilization by ' + rowsLabel().toLowerCase(), 'per 1,000 members · shaded vs target', tbl, 'Targets for admits, ER, readmissions and SNF are agreed benchmarks.')
    );
  }

  /* ---------- Tab 6: Quality ---------- */
  function vQual() {
    const f = focus();
    const tot = f === P || f.level === 'market' ? f : E[f.market] || P;
    const TH = T.star_target;
    const gs = allGroups().filter((g) => S.market === 'all' || g.market === S.market);
    const stile = (cls, title, star, sub, note) =>
      `<div class="kpi ${cls}" style="padding-bottom:10px"><div class="l" style="text-align:center;font-weight:600">${title}</div>${dial({ v: star, min: 1, max: 5, target: TH, fmt: (v) => v.toFixed(1), tfmt: (v) => v.toFixed(1), dark: cls === 'roll', label: title })}<div class="d num" style="text-align:center;margin-top:4px">${sub}</div><div class="d" style="text-align:center;margin-top:1px">${note}</div></div>`;
    const tiles =
      `<div class="kpis four">` +
      stile('roll', 'Overall star rating', f.star, 'Roll-up of the three domains', 'Average of HEDIS, adherence and experience') +
      stile('', 'HEDIS', f.sHedis, `${f.hedis}% composite`, `Care gap closure ${f.gap}%`) +
      stile('', 'Medication adherence', f.sAdh, `${f.adhPct}% adherent`, `Overall ${P.adhPct}%`) +
      stile('', 'Member experience', f.sExp, `CAHPS ${f.cahps.toFixed(1)} / 5`, `Overall ${P.cahps.toFixed(1)}`) +
      `</div>`;
    const order = [...gs].sort((a, b) => b.star - a.star);
    const cell = (v) => `<td${hcn(v, TH, true)}>${v.toFixed(1)}</td>`;
    const heatTbl = `<div class="tw"><table><thead><tr><th>Provider group</th><th>HEDIS</th><th>Med adherence</th><th>Member exp.</th><th>Overall</th></tr></thead><tbody>${[tot].concat(order).map((e) => `<tr class="${e === tot ? 'tot' : e.id === S.group ? 'sel' : ''}" data-entity="${esc(e.id)}" style="cursor:pointer"><td>${esc(e.name)}${e === tot && e.id !== 'plan' ? ' <span style="color:var(--mute);font-weight:400">(total)</span>' : ''}</td>${cell(e.sHedis)}${cell(e.sAdh)}${cell(e.sExp)}<td${hcn(e.star, TH, true)}><b>${e.star.toFixed(1)}</b></td></tr>`).join('')}</tbody></table></div>`;
    const rank = (key, label, fmt, ref, refLabel, min, max) =>
      hBars(
        [...gs].sort((a, b) => b[key] - a[key]).map((g) => ({ label: g.name, v: g[key], color: g[key] >= ref ? 'var(--c2)' : 'var(--c4)', bold: g.id === S.group })),
        { min, max, ref, refLabel, fmt, label, L: 150, rh: 22, w: 430 }
      );
    const hed = D.fact_hedis_measures || [];
    const hOnly = hed.filter((h) => h.measure !== 'Medication adherence');
    const adh = hed.find((h) => h.measure === 'Medication adherence') || { measure: 'Medication adherence', score_pct: 88, target_pct: 85, status: 'On track' };
    const mrow = (h) =>
      `<tr><td>${esc(h.measure)}</td><td class="num">${h.score_pct.toFixed(0)}%${cellBar(h.score_pct, 100, h.score_pct >= h.target_pct ? 'var(--c2)' : 'var(--c4)')}</td><td class="num">${h.target_pct.toFixed(0)}%</td><td><span class="pill ${h.status === 'On track' ? 'ok' : 'warn'}">${esc(h.status)}</span></td></tr>`;
    const mt = (rowsHead) => `<div class="tw"><table><thead><tr><th>Measure</th><th>Score</th><th>Target</th><th>Status</th></tr></thead><tbody>${rowsHead}</tbody></table></div>`;
    const hp = D.fact_quality_hplan || [];
    const ptbl = `<div class="tw"><table><thead><tr><th>H-plan</th><th>Members</th><th>Overall stars</th><th>HEDIS composite</th></tr></thead><tbody>${hp.map((h) => `<tr><td>${esc(h.hplan_name)}</td><td class="num">${f0(h.members)}</td><td${hcn(h.star_rating, TH, true)}>${h.star_rating.toFixed(1)}</td><td${hcn(h.hedis_composite_pct, T.quality_score_target_pct, true)}>${h.hedis_composite_pct}%</td></tr>`).join('')}</tbody></table></div>`;
    return (
      scopeHeader() +
      tiles +
      `<div class="grid2e">${card('Overall star rating by provider group', 'roll-up · ' + TH.toFixed(1) + '-star bonus threshold', inner(rank('star', 'Overall star rating by provider group', (v) => v.toFixed(1), TH, 'Threshold ' + TH.toFixed(1), 3, 5)))}${card('Stars by domain', 'provider group × domain', heatTbl, 'Shaded against the ' + TH.toFixed(1) + '-star bonus threshold.')}</div><div style="height:12px"></div>` +
      `<div class="grid3">${card('HEDIS', 'care measures · plan level', mt(hOnly.map(mrow).join('')), `Plan closure rate ${P.gap}%.`)}${card('Medication adherence', 'plan level + by group', inner(mt(mrow(adh)).replace('class="tw"', 'class="tw" style="margin-bottom:8px"') + rank('adhPct', 'Medication adherence by provider group', (v) => v + '%', adh.target_pct, 'Target ' + adh.target_pct + '%', 70, 95)), 'Adherence measure summary.')}${card('Member experience', 'CAHPS · by group', inner(rank('sExp', 'CAHPS member experience by provider group', (v) => v.toFixed(1), TH, 'Bar ' + TH.toFixed(1), 3, 5)), 'Group-level CAHPS score.')}</div><div style="height:12px"></div>` +
      card('Quality by H-plan', 'plan level', ptbl, 'Quality follows the member.')
    );
  }

  /* ---------- Tab 7: Risk Adjustment ---------- */
  function vRisk() {
    const f = focus();
    const rs = rows();
    const tot = f === P || f.level === 'market' ? f : E[f.market] || P;
    const tiles = `<div class="kpis">${kpi('Average RAF', f.raf.toFixed(2), f === P ? dlt('+0.03 YoY', true) : `overall ${P.raf.toFixed(2)}`)}${kpi('eBUR', f.ebur.toFixed(2), f === P ? dlt('+0.02 YoY', true) : `overall ${P.ebur.toFixed(2)}`)}${kpi('mBUR', f.mbur.toFixed(2), f === P ? dlt('+0.03 YoY', true) : `overall ${P.mbur.toFixed(2)}`)}${kpi('HCC capture', f.hcc + '%', f === P ? dlt('+4 pt YoY', true) : `overall ${P.hcc}%`)}${kpi('Chart review completion', f.chart + '%', f === P ? dlt('-6 pt QoQ', false) : `overall ${P.chart}%`)}${kpi('Members assessed', f0(f.assessed), `${((f.assessed / (f.members || 1)) * 100).toFixed(0)}% of members`)}</div>`;
    const tbl = `<div class="tw"><table><thead><tr><th>${rowsLabel()}</th><th>Avg RAF</th><th>eBUR</th><th>mBUR</th><th>HCC capture</th><th>Chart review</th><th>Assessed</th></tr></thead><tbody>${rs.concat([tot]).map((e) => `<tr class="${e === tot ? 'tot' : e.id === S.group ? 'sel' : ''}" data-entity="${esc(e.id)}" style="cursor:pointer"><td>${esc(e.name)}</td><td class="num">${e.raf.toFixed(2)}</td><td class="num">${e.ebur.toFixed(2)}</td><td class="num">${e.mbur.toFixed(2)}</td><td class="num">${e.hcc}%${cellBar(e.hcc, 100)}</td><td class="num">${e.chart}%${cellBar(e.chart, 100, 'var(--c3)')}</td><td class="num">${f0(e.assessed)}</td></tr>`).join('')}</tbody></table></div>`;
    const gs = allGroups().filter((g) => S.market === 'all' || g.market === S.market).sort((a, b) => b.raf - a.raf);
    const bars = hBars(
      gs.map((g) => ({ label: g.name, v: g.raf, bold: g.id === S.group })),
      { min: 0.9, max: 1.3, ref: P.raf, refLabel: P.raf.toFixed(2), fmt: (v) => v.toFixed(2), label: 'Average RAF by provider group', L: 170, rh: 24 }
    );
    const cap = hBars(
      gs.sort((a, b) => b.chart - a.chart).map((g) => ({ label: g.name, v: g.chart, color: 'var(--c3)', bold: g.id === S.group })),
      { min: 40, max: 80, ref: P.chart, refLabel: P.chart + '%', fmt: (v) => v + '%', label: 'Chart review completion by provider group', L: 170, rh: 24 }
    );
    return (
      scopeHeader() +
      tiles +
      `<div class="grid2e">${card('Average RAF by provider group', '', inner(bars))}${card('Chart review completion', '', inner(cap))}</div><div style="height:12px"></div>` +
      card('Risk adjustment by ' + rowsLabel().toLowerCase(), '', tbl, 'RAF, eBUR and mBUR are delivered from Titan.')
    );
  }

  /* ---------- Tab 8: Definitions ---------- */
  function vDefs() {
    const rowsD = [
      ['Premium revenue', 'Revenue earned for the member and PCP for the time the member is assigned to that PCP. Split into Part A/B (about $1,195 PMPM) and Part D (about $180 PMPM).', 'QNXT eligibility; GL', 'Monthly, closed'],
      ['Medical cost', 'Claims plus provider and member incentives, with IBNR allocated to cover claims lag. Pharmacy arrives from a separate feed.', 'Claims (QNXT), pharmacy feed, GL', 'Trending live; monthly close by the 10th business day'],
      ['MLR', 'Shown on a Part A/B basis: medical cost excluding Part D divided by Part A/B revenue. Goal is 83%: at or under is on track, then yellow up to 19% over goal and red at 20%+. MLR including Part D and Part D MLR are shown on Financials.', 'GL and claims', 'Monthly'],
      ['SG&A and OCR', 'SG&A from the GL; OCR is SG&A divided by premium revenue.', 'GL', 'Monthly, closed'],
      ['Income from operations (IOI)', 'Premium revenue less medical cost less SG&A.', 'GL', 'Monthly'],
      ['Reporting period', 'Calendar basis. Current period is 2026 year to date, January through August (last closed month). Prior year is the full 2025 calendar year (12 months). Budget is the same January–August period.', 'GL; QNXT enrollment', 'Monthly'],
      ['Prior-year comparison', 'Because 2026 year to date is 8 months and 2025 is 12, prior-year variances are measured per member per month (PMPM), MLR points and per-1,000 rates. Dollar variances to prior year restate 2025 rates on the current member months.', 'GL; QNXT enrollment', 'Monthly'],
      ['PMPM (financials)', 'Revenue, medical cost or SG&A dollars divided by member months (members each month added up). Rate change is month over month.', 'GL; QNXT enrollment', 'Monthly'],
      ['PMPM by category', 'Medical cost per member per month by Part D, institutional inpatient, institutional outpatient, professional, capitation and other.', 'Claims, pharmacy feed, QNXT enrollment', 'Monthly'],
      ['Utilization', 'Admits, ER visits, OBS stays and SNF admits per 1,000 members, and 30-day readmit rate, compared to targets.', 'QNXT claims', 'Monthly'],
      ['HEDIS and care gaps', 'HEDIS composite and measure scores; care gaps are the HEDIS open gaps. Quality follows the member and uses the current PCP.', 'Cotiviti', 'Monthly'],
      ['RAF, eBUR, mBUR', 'Risk adjustment factor and the two utilization-ratio metrics, delivered as a feed.', 'Titan', 'Monthly'],
      ['Attribution', 'Members are assigned to their PCP in QNXT. Attribution flows from eligibility and supports retroactive views.', 'QNXT', 'As eligibility changes'],
      ['Budgets and targets', 'Budgets are the targets for MLR, revenue and medical cost. Quality and RAF targets come from the QRA team’s glide paths.', 'Finance; QRA team', 'Annual'],
    ];
    return card('Metric definitions', 'how each number is built', `<div class="tw"><table class="defs"><thead><tr><th>Metric</th><th>Definition</th><th>Source</th><th>Refresh</th></tr></thead><tbody>${rowsD.map((r) => `<tr><td><b>${r[0]}</b></td><td style="white-space:normal">${r[1]}</td><td style="white-space:normal">${r[2]}</td><td style="white-space:normal">${r[3]}</td></tr>`).join('')}</tbody></table></div>`);
  }

  const VIEWS = {
    overview: vOverview,
    fin: vFin,
    cost: vCost,
    mlr: vMlr,
    util: vUtil,
    qual: vQual,
    risk: vRisk,
    defs: vDefs,
  };

  const renderer = VIEWS[S.tab] || VIEWS.overview;
  return {
    html: renderer(),
    scopeName: scopeName(),
    isPlan: focus() === P,
  };
}
