import defaultRawData from '../data/mock/planPerformanceData.json';
import simulatedQ3Data from '../data/mock/simulatedQ3Dataset.json';

/**
 * Service to manage multi-scenario plan performance & Medicare Advantage (MA) payer analytics data.
 * Supports switching between multiple pre-loaded and custom uploaded datasets via Combobox.
 */

const CATALOG_KEY = 'arc8_plan_performance_dataset_catalog';
const ACTIVE_ID_KEY = 'arc8_plan_performance_active_id';
const DATA_PREFIX = 'arc8_plan_performance_data_';

export const MARKETS = [
  { id: 'all', name: 'All Markets' },
  { id: 'nnv', name: 'Northern Nevada' },
  { id: 'fl', name: 'Florida' },
  { id: 'ntx', name: 'North Texas' },
  { id: 'stx', name: 'South Texas' },
];

export const BUILTIN_DATASETS = [
  {
    id: 'baseline',
    name: "Jessica's Baseline Mock (Original)",
    filename: 'Plan_Performance_Console_Baseline.json',
    isBuiltIn: true,
    uploadedAt: null,
    summary: {
      entityCount: (defaultRawData.fact_entity_summary || []).length,
      marketCount: 4,
      providerGroupCount: 12,
      monthlyRows: (defaultRawData.fact_monthly_by_entity || []).length,
    },
  },
  {
    id: 'simulated_q3',
    name: 'Simulated Revised Q3 (Growth Scenario)',
    filename: 'Simulated_Revised_Q3_Dataset.json',
    isBuiltIn: true,
    uploadedAt: null,
    summary: {
      entityCount: (simulatedQ3Data.fact_entity_summary || []).length,
      marketCount: 4,
      providerGroupCount: 12,
      monthlyRows: (simulatedQ3Data.fact_monthly_by_entity || []).length,
    },
  },
];

/**
 * Retrieves the full catalog of available datasets (built-ins + custom uploads).
 */
export const getDatasetCatalog = () => {
  let customList = [];
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const stored = window.localStorage.getItem(CATALOG_KEY);
      if (stored) {
        customList = JSON.parse(stored) || [];
      }
    } catch (e) {
      console.warn('Failed to parse dataset catalog from localStorage:', e);
    }
  }
  return [...BUILTIN_DATASETS, ...customList];
};

/**
 * Retrieves the ID of the currently selected dataset.
 */
export const getActiveDatasetId = () => {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const activeId = window.localStorage.getItem(ACTIVE_ID_KEY);
      if (activeId) {
        const catalog = getDatasetCatalog();
        if (catalog.some((d) => d.id === activeId)) {
          return activeId;
        }
      }
    } catch (_) {}
  }
  return 'baseline';
};

/**
 * Sets the active dataset by ID.
 */
export const setActiveDatasetId = (id) => {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(ACTIVE_ID_KEY, id);
  }
};

/**
 * Retrieves the active dataset object.
 */
export const getCurrentData = () => {
  const activeId = getActiveDatasetId();

  if (activeId === 'baseline') return defaultRawData;
  if (activeId === 'simulated_q3') return simulatedQ3Data;

  // Check custom storage in localStorage
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const stored = window.localStorage.getItem(`${DATA_PREFIX}${activeId}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && Array.isArray(parsed.fact_entity_summary)) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn(`Failed to parse custom dataset ${activeId}:`, e);
    }
  }

  return defaultRawData;
};

/**
 * Validates a candidate JSON dataset before saving.
 */
export const validateDataset = (jsonObj) => {
  if (!jsonObj || typeof jsonObj !== 'object') {
    return { valid: false, error: 'Uploaded file is not a valid JSON object.' };
  }

  if (!Array.isArray(jsonObj.fact_entity_summary) || jsonObj.fact_entity_summary.length === 0) {
    return {
      valid: false,
      error: 'Missing required "fact_entity_summary" table or table is empty.',
    };
  }

  const sampleEntity = jsonObj.fact_entity_summary[0];
  if (!sampleEntity.entity_id || !sampleEntity.entity_name || !sampleEntity.level) {
    return {
      valid: false,
      error: 'Invalid "fact_entity_summary" format. Each record must include "entity_id", "entity_name", and "level".',
    };
  }

  const entityCount = jsonObj.fact_entity_summary.length;
  const markets = jsonObj.fact_entity_summary.filter((r) => r.level === 'market');
  const providerGroups = jsonObj.fact_entity_summary.filter((r) => r.level === 'provider_group');
  const monthlyRows = Array.isArray(jsonObj.fact_monthly_by_entity) ? jsonObj.fact_monthly_by_entity.length : 0;
  const hasCostCategories = Array.isArray(jsonObj.fact_medical_cost_pmpm_category) && jsonObj.fact_medical_cost_pmpm_category.length > 0;

  return {
    valid: true,
    summary: {
      entityCount,
      marketCount: markets.length,
      providerGroupCount: providerGroups.length,
      monthlyRows,
      hasCostCategories,
    },
  };
};

/**
 * Saves a new dataset into the catalog and sets it as the active dataset.
 */
export const saveDatasetToCatalog = (jsonObj, displayName, filename = 'uploaded_dataset.json') => {
  const check = validateDataset(jsonObj);
  if (!check.valid) {
    throw new Error(check.error);
  }

  const id = `custom_${Date.now()}`;
  const name = displayName && displayName.trim() ? displayName.trim() : filename.replace(/\.json$/i, '');

  const newEntry = {
    id,
    name,
    filename,
    isBuiltIn: false,
    uploadedAt: new Date().toISOString(),
    summary: check.summary,
  };

  if (typeof window !== 'undefined' && window.localStorage) {
    // Save dataset payload
    window.localStorage.setItem(`${DATA_PREFIX}${id}`, JSON.stringify(jsonObj));

    // Save into catalog list
    let customList = [];
    try {
      const stored = window.localStorage.getItem(CATALOG_KEY);
      if (stored) customList = JSON.parse(stored) || [];
    } catch (_) {}
    customList.push(newEntry);
    window.localStorage.setItem(CATALOG_KEY, JSON.stringify(customList));

    // Set as active
    window.localStorage.setItem(ACTIVE_ID_KEY, id);
  }

  return newEntry;
};

/**
 * Deletes a custom dataset from the catalog.
 */
export const deleteDatasetFromCatalog = (id) => {
  if (id === 'baseline' || id === 'simulated_q3') {
    throw new Error('Built-in baseline datasets cannot be deleted.');
  }

  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.removeItem(`${DATA_PREFIX}${id}`);

    let customList = [];
    try {
      const stored = window.localStorage.getItem(CATALOG_KEY);
      if (stored) customList = JSON.parse(stored) || [];
    } catch (_) {}

    customList = customList.filter((d) => d.id !== id);
    window.localStorage.setItem(CATALOG_KEY, JSON.stringify(customList));

    // If active was deleted, reset to baseline
    const currentActive = window.localStorage.getItem(ACTIVE_ID_KEY);
    if (currentActive === id) {
      window.localStorage.setItem(ACTIVE_ID_KEY, 'baseline');
    }
  }
};

/**
 * Renames a custom dataset in the catalog.
 */
export const renameDatasetInCatalog = (id, newName) => {
  if (!newName || !newName.trim()) {
    throw new Error('Scenario name cannot be empty.');
  }

  if (id === 'baseline' || id === 'simulated_q3') {
    throw new Error('Built-in baseline dataset names cannot be modified.');
  }

  if (typeof window !== 'undefined' && window.localStorage) {
    let customList = [];
    try {
      const stored = window.localStorage.getItem(CATALOG_KEY);
      if (stored) customList = JSON.parse(stored) || [];
    } catch (_) {}

    const idx = customList.findIndex((d) => d.id === id);
    if (idx !== -1) {
      customList[idx].name = newName.trim();
      window.localStorage.setItem(CATALOG_KEY, JSON.stringify(customList));
      return customList[idx];
    }
  }
  throw new Error('Dataset not found in custom catalog.');
};

/**
 * Retrieves the raw JSON data for any specific dataset ID in the catalog.
 */
export const getDatasetDataById = (id) => {
  if (id === 'baseline') return defaultRawData;
  if (id === 'simulated_q3') return simulatedQ3Data;

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const stored = window.localStorage.getItem(`${DATA_PREFIX}${id}`);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.warn(`Failed to retrieve dataset ${id}:`, e);
    }
  }
  return defaultRawData;
};

/**
 * Gets details about the currently active dataset.
 */
export const getActiveDatasetMeta = () => {
  const activeId = getActiveDatasetId();
  const catalog = getDatasetCatalog();
  return catalog.find((d) => d.id === activeId) || catalog[0];
};

export const getMarkets = () => MARKETS;

export const getProviderGroups = (marketId = 'all') => {
  const data = getCurrentData();
  const groups = (data.fact_entity_summary || []).filter(
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
  const data = getCurrentData();
  const summaryList = data.fact_entity_summary || [];

  if (providerGroupId && providerGroupId !== 'all') {
    const found = summaryList.find((r) => r.entity_id === providerGroupId);
    if (found) return found;
  }

  if (marketId && marketId !== 'all') {
    const found = summaryList.find((r) => r.level === 'market' && r.entity_id === marketId);
    if (found) return found;
  }

  return summaryList.find((r) => r.level === 'plan') || summaryList[0] || {};
};

export const getMonthlyTrend = (marketId = 'all', providerGroupId = 'all') => {
  const data = getCurrentData();
  const monthlyList = data.fact_monthly_by_entity || [];
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
  const data = getCurrentData();
  const costList = data.fact_medical_cost_pmpm_category || [];
  let targetEntityId = 'plan';

  if (providerGroupId && providerGroupId !== 'all') {
    targetEntityId = providerGroupId;
  } else if (marketId && marketId !== 'all') {
    targetEntityId = marketId;
  }

  return costList.find((r) => r.entity_id === targetEntityId) || costList[0] || {};
};

export const getComparisonTableRows = (marketId = 'all') => {
  const data = getCurrentData();
  const allRows = data.fact_entity_summary || [];
  if (!marketId || marketId === 'all') {
    return allRows;
  }
  // Include plan total, the selected market row, and its child provider groups
  return allRows.filter(
    (r) => r.level === 'plan' || r.entity_id === marketId || r.market_id === marketId
  );
};

export const getQualityData = () => {
  const data = getCurrentData();
  return {
    hedis: data.fact_hedis_measures || [],
    qualityOverview: data.fact_quality || [],
    healthPlan: data.fact_quality_hplan || [],
  };
};

export const getTargets = () => {
  const data = getCurrentData();
  return data.targets_and_goals || [];
};
