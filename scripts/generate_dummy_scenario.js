const fs = require('fs');
const path = require('path');

// Load baseline verified dataset
const baselinePath = path.join(__dirname, '../frontend/src/data/mock/planPerformanceData.json');
const baseData = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));

console.log('Generating Medicare Advantage Q4 Executive Forecast dummy scenario...');

const scenario = JSON.parse(JSON.stringify(baseData));

// Multipliers for Q4 High Performance & Growth Scenario
const MEMBER_MULT = 1.104;     // ~152.8k members (up from 138.4k)
const REVENUE_MULT = 1.15875;   // $1,698.4M revenue (up from $1,465.7M)
const COST_MULT = 1.0985;       // $1,542.2M medical cost (up from $1,403.9M)

// 1. Transform fact_entity_summary
scenario.fact_entity_summary = scenario.fact_entity_summary.map((entity) => {
  const e = { ...entity };
  e.members_latest = Math.round(e.members_latest * MEMBER_MULT);
  e.member_months_ytd = Math.round(e.member_months_ytd * MEMBER_MULT);
  e.premium_revenue_musd = +(e.premium_revenue_musd * REVENUE_MULT).toFixed(2);
  e.medical_cost_musd = +(e.medical_cost_musd * COST_MULT).toFixed(2);
  e.sga_musd = +(e.sga_musd * 0.998).toFixed(2); // Disciplined SG&A
  e.ioi_musd = +(e.premium_revenue_musd - e.medical_cost_musd - e.sga_musd).toFixed(2); // Net positive margin!

  // Recompute PMPMs
  const mm = e.member_months_ytd || 1;
  e.revenue_pmpm = Math.round((e.premium_revenue_musd * 1e6) / mm);
  e.medical_cost_pmpm = Math.round((e.medical_cost_musd * 1e6) / mm);
  e.part_ab_revenue_pmpm = Math.round(e.revenue_pmpm * 0.868);
  e.part_d_revenue_pmpm = Math.round(e.revenue_pmpm * 0.132);
  e.part_d_cost_pmpm = Math.round(e.medical_cost_pmpm * 0.218);

  // Improved MLRs
  e.mlr_part_ab_pct = +((e.mlr_part_ab_pct || 85.1) - 3.3).toFixed(1);
  if (e.mlr_part_ab_pct < 78.5) e.mlr_part_ab_pct = 78.5;
  e.mlr_incl_part_d_pct = +(e.mlr_part_ab_pct + 9.0).toFixed(2);
  e.ocr_pct = +((e.sga_musd / e.premium_revenue_musd) * 100).toFixed(2);

  // Status is On Track for groups <= 83.0%
  e.mlr_status = e.mlr_part_ab_pct <= 83.0 ? 'On Track' : 'Watch';

  return e;
});

// Explicit Plan Total Anchor
const planRow = scenario.fact_entity_summary.find((r) => r.entity_id === 'plan');
if (planRow) {
  planRow.entity_name = 'Plan total';
  planRow.members_latest = 152800;
  planRow.member_months_ytd = 1176840;
  planRow.premium_revenue_musd = 1698.40;
  planRow.revenue_pmpm = 1443;
  planRow.part_ab_revenue_pmpm = 1253;
  planRow.part_d_revenue_pmpm = 190;
  planRow.medical_cost_musd = 1542.20;
  planRow.medical_cost_pmpm = 1310;
  planRow.part_d_cost_pmpm = 285;
  planRow.sga_musd = 147.70;
  planRow.ioi_musd = 8.50; // Positive turnaround
  planRow.mlr_part_ab_pct = 81.8; // Favorable vs 83.0% target
  planRow.mlr_incl_part_d_pct = 90.80;
  planRow.ocr_pct = 8.70;
  planRow.mlr_status = 'On Track';
}

// 2. Transform fact_monthly_by_entity
scenario.fact_monthly_by_entity = scenario.fact_monthly_by_entity.map((row) => {
  const r = { ...row };
  r.members = Math.round(r.members * MEMBER_MULT);
  r.premium_revenue_musd = +(r.premium_revenue_musd * REVENUE_MULT).toFixed(3);
  r.revenue_forecast_musd = +(r.revenue_forecast_musd * REVENUE_MULT).toFixed(3);
  r.medical_cost_musd = +(r.medical_cost_musd * COST_MULT).toFixed(3);
  r.sga_musd = +(r.sga_musd * 0.998).toFixed(3);
  r.ioi_musd = +(r.premium_revenue_musd - r.medical_cost_musd - r.sga_musd).toFixed(3);

  const m = r.members || 1;
  r.revenue_pmpm = +((r.premium_revenue_musd * 1e6) / m).toFixed(2);
  r.medical_cost_pmpm = +((r.medical_cost_musd * 1e6) / m).toFixed(2);
  r.part_ab_revenue_pmpm = +(r.revenue_pmpm * 0.868).toFixed(2);
  r.part_d_revenue_pmpm = +(r.revenue_pmpm * 0.132).toFixed(2);
  r.sga_pmpm = +((r.sga_musd * 1e6) / m).toFixed(2);
  r.margin_pmpm = +(r.revenue_pmpm - r.medical_cost_pmpm - r.sga_pmpm).toFixed(2);

  r.mlr_part_ab_pct = +((r.mlr_part_ab_pct || 85) - 3.3).toFixed(2);
  r.mlr_incl_part_d_pct = +(r.mlr_part_ab_pct + 9.0).toFixed(2);
  return r;
});

// 3. Transform fact_medical_cost_pmpm_category
scenario.fact_medical_cost_pmpm_category = scenario.fact_medical_cost_pmpm_category.map((row) => {
  const r = { ...row };
  r.part_d_pharmacy = Math.round(r.part_d_pharmacy * 0.95); // Pharmacy savings
  r.inst_inpatient = Math.round(r.inst_inpatient * 0.96);   // Avoided readmissions
  r.inst_outpatient = Math.round(r.inst_outpatient * 1.02); // Outpatient shift
  r.professional = Math.round(r.professional * 1.01);
  r.capitation = r.capitation;
  r.other = Math.round(r.other * 0.97);
  r.total_pmpm = r.part_d_pharmacy + r.inst_inpatient + r.inst_outpatient + r.professional + r.capitation + r.other;
  r.yoy_change_pct = -1.2; // Favorable deflation
  return r;
});

// 4. Boost Star Ratings in fact_quality
if (Array.isArray(scenario.fact_quality)) {
  scenario.fact_quality = scenario.fact_quality.map((q) => {
    const item = { ...q };
    item.star_rating = item.star_rating ? +(Math.min(5.0, item.star_rating + 0.5)).toFixed(1) : 4.5;
    item.quality_score_pct = item.quality_score_pct ? Math.min(100, Math.round(item.quality_score_pct + 6)) : 88;
    return item;
  });
}

// 5. Enhance Risk Adjustment in fact_risk_adjustment
if (Array.isArray(scenario.fact_risk_adjustment)) {
  scenario.fact_risk_adjustment = scenario.fact_risk_adjustment.map((ra) => {
    const item = { ...ra };
    item.avg_raf_score = item.avg_raf_score ? +(item.avg_raf_score * 1.05).toFixed(3) : 1.185;
    item.ebur_pct = item.ebur_pct ? Math.min(100, Math.round(item.ebur_pct + 4)) : 86;
    item.mbur_pct = item.mbur_pct ? Math.min(100, Math.round(item.mbur_pct + 3)) : 82;
    return item;
  });
}

// 6. Network MLR adjustments in fact_network_mlr
if (Array.isArray(scenario.fact_network_mlr)) {
  scenario.fact_network_mlr = scenario.fact_network_mlr.map((row) => {
    const r = { ...row };
    if (r.mlr_pct) r.mlr_pct = +(r.mlr_pct - 3.2).toFixed(1);
    return r;
  });
}

// File output paths
const outDir1 = path.join(__dirname, '../data/dummy_scenarios');
const outDir2 = path.join(__dirname, '../frontend/public/sample_scenarios');
const outDir3 = 'C:/Users/DELL/.gemini/antigravity/brain/28d830a9-d150-477d-8826-54adb5355a6d';

[outDir1, outDir2].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const filename = 'Medicare_Advantage_Q4_Optimization_Forecast.json';
const payload = JSON.stringify(scenario, null, 2);

fs.writeFileSync(path.join(outDir1, filename), payload, 'utf8');
fs.writeFileSync(path.join(outDir2, filename), payload, 'utf8');
if (fs.existsSync(outDir3)) {
  fs.writeFileSync(path.join(outDir3, filename), payload, 'utf8');
}

console.log('SUCCESS! Generated dummy scenario at:');
console.log(' - ' + path.join(outDir1, filename));
console.log(' - ' + path.join(outDir2, filename));
console.log(' - ' + path.join(outDir3, filename));

// Quick validation check
const { fact_entity_summary, fact_monthly_by_entity, fact_medical_cost_pmpm_category } = scenario;
console.log('\nDataset Summary:');
console.log(' - Total Entities:', fact_entity_summary.length);
console.log(' - Markets:', fact_entity_summary.filter(r => r.level === 'market').length);
console.log(' - Provider Groups:', fact_entity_summary.filter(r => r.level === 'provider_group').length);
console.log(' - Monthly Rows:', fact_monthly_by_entity.length);
console.log(' - Plan Members:', planRow.members_latest.toLocaleString());
console.log(' - Plan Revenue:', '$' + planRow.premium_revenue_musd + 'M');
console.log(' - Plan Medical Cost:', '$' + planRow.medical_cost_musd + 'M');
console.log(' - Plan Net Margin (IOI):', '$' + planRow.ioi_musd + 'M');
console.log(' - Plan Part A/B MLR:', planRow.mlr_part_ab_pct + '% (Status: ' + planRow.mlr_status + ')');
