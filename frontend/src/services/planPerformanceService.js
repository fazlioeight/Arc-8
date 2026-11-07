import rawData from '../data/mock/planPerformanceData.json';

/**
 * Service to query mock plan performance & commercial payer analytics data.
 * Backed by Jessica Funiestas's verified export (Plan_Performance_Console_Final_Data_Export_CSV_2).
 */

export const MARKETS = [
  { id: 'all', name: 'All Markets' },
  { id: 'nnv', name: 'Northern Nevada' },
  { id: 'fl', name: 'Florida' },
  { id: 'ntx', name: 'North Texas' },
  { id: 'stx', name: 'South Texas' },
];

export const getMarkets = () => MARKETS;

export const getProviderGroups = (marketId = 'all') => {
  const groups = (rawData.fact_entity_summary || []).filter(
    (row) => row.level === 'provider_group'
  );
  if (!marketId || marketId === 'all') {
    return groups.map((g) => ({ id: g.entity_id, name: g.entity_name, marketId: g.market_id }));
  }
  return groups
    .filter((g) => g.market_id === marketId)
    .map((g) => ({ id: g.entity_id, name: g.entity_name, marketId: g.market_id }));
};

export const getEntitySummary = (marketId = 'all', providerGroupId = 'all') => {
  const summaryList = rawData.fact_entity_summary || [];

  if (providerGroupId && providerGroupId !== 'all') {
    const found = summaryList.find((r) => r.entity_id === providerGroupId);
    if (found) return found;
  }

  if (marketId && marketId !== 'all') {
    const found = summaryList.find((r) => r.level === 'market' && r.entity_id === marketId);
    if (found) return found;
  }

  return summaryList.find((r) => r.level === 'plan') || summaryList[0];
};

export const getMonthlyTrend = (marketId = 'all', providerGroupId = 'all') => {
  const monthlyList = rawData.fact_monthly_by_entity || [];
  let targetEntityId = 'plan';

  if (providerGroupId && providerGroupId !== 'all') {
    targetEntityId = providerGroupId;
  } else if (marketId && marketId !== 'all') {
    targetEntityId = marketId;
  }

  const rows = monthlyList.filter((r) => r.entity_id === targetEntityId);
  return rows.length > 0 ? rows : monthlyList.filter((r) => r.entity_id === 'plan');
};

export const getCostCategories = (marketId = 'all', providerGroupId = 'all') => {
  const costList = rawData.fact_medical_cost_pmpm_category || [];
  let targetEntityId = 'plan';

  if (providerGroupId && providerGroupId !== 'all') {
    targetEntityId = providerGroupId;
  } else if (marketId && marketId !== 'all') {
    targetEntityId = marketId;
  }

  return costList.find((r) => r.entity_id === targetEntityId) || costList[0] || {};
};

export const getComparisonTableRows = (marketId = 'all') => {
  const allRows = rawData.fact_entity_summary || [];
  if (!marketId || marketId === 'all') {
    return allRows;
  }
  // Include plan total, the selected market row, and its child provider groups
  return allRows.filter(
    (r) => r.level === 'plan' || r.entity_id === marketId || r.market_id === marketId
  );
};

export const getQualityData = () => {
  return {
    hedis: rawData.fact_hedis_measures || [],
    qualityOverview: rawData.fact_quality || [],
    healthPlan: rawData.fact_quality_hplan || [],
  };
};

export const getTargets = () => {
  return rawData.targets_and_goals || [];
};
