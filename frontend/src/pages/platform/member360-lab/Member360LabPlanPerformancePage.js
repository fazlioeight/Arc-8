import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import PortalPageLayout from '../../../components/PortalPageLayout';
import { PORTAL_NAV_ITEMS } from '../portal_page/portalNavItems';
import { ROUTES } from '../../../constants/routes';
import { usePermissions } from '../../../hooks/usePermissions';
import './planPerformanceConsole.css';
import {
  CONSOLE_TABS,
  buildConsoleModel,
  renderConsoleTab,
} from '../../../services/planPerformanceConsoleEngine';
import {
  MARKETS,
  getProviderGroups,
  getCurrentData,
  getDatasetCatalog,
  getActiveDatasetId,
  setActiveDatasetId,
  saveDatasetToCatalog,
  deleteDatasetFromCatalog,
  renameDatasetInCatalog,
  getDatasetDataById,
  validateDataset,
} from '../../../services/planPerformanceService';

const TAB_PERMISSIONS = {
  overview: 'tab:pp_overview',
  fin: 'tab:pp_financials',
  cost: 'tab:pp_medical_cost',
  mlr: 'tab:pp_mlr',
  util: 'tab:pp_utilization',
  qual: 'tab:pp_quality',
  risk: 'tab:pp_risk',
  defs: 'tab:pp_defs',
};

export default function Member360LabPlanPerformancePage() {
  const { can, isAdmin, currentRole } = usePermissions();
  const fileInputRef = useRef(null);

  // Administrative authority to upload/manage datasets
  const canManageDataset =
    isAdmin ||
    can('menu:master_admin') ||
    can('sub:gov_tenant_config') ||
    currentRole === 'platform_admin' ||
    currentRole === 'admin' ||
    currentRole === 'business_admin' ||
    currentRole === 'payer_executive' ||
    currentRole === 'billing';

  // Available tabs filtered dynamically by user role and tab-level privileges
  const authorizedTabs = useMemo(() => {
    return CONSOLE_TABS.filter(([tabKey]) => {
      // Platform and System Administrators have full authority over all tabs
      if (
        isAdmin ||
        currentRole === 'platform_admin' ||
        currentRole === 'admin'
      ) {
        return true;
      }
      const permKey = TAB_PERMISSIONS[tabKey];
      return !permKey || can(permKey);
    });
  }, [can, isAdmin, currentRole]);

  // Console Navigation & Filter State
  const location = useLocation();
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedMarket, setSelectedMarket] = useState('all');
  const [selectedGroup, setSelectedGroup] = useState('all');
  const [comparisonMode, setComparisonMode] = useState('budget'); // 'budget' | 'prior'
  const [cs, setCs] = useState('inst'); // 'inst' | 'prof'
  const [spec, setSpec] = useState(null);
  const [datasetVersion, setDatasetVersion] = useState(0);

  // Sync tab with URL query parameter ?tab=
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tabParam = params.get('tab');
    if (tabParam && CONSOLE_TABS.some(([k]) => k === tabParam)) {
      setActiveTab(tabParam);
    }
  }, [location.search]);

  // Auto-select first authorized tab if current tab is denied
  useEffect(() => {
    if (authorizedTabs.length > 0 && !authorizedTabs.some(([k]) => k === activeTab)) {
      setActiveTab(authorizedTabs[0][0]);
    }
  }, [authorizedTabs, activeTab]);

  // Dataset switching state
  const [activeDatasetId, setActiveDatasetIdState] = useState(() => getActiveDatasetId());
  const [datasetCatalog, setDatasetCatalog] = useState(() => getDatasetCatalog());

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState('list'); // 'list' | 'upload'
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState('');

  // Upload fields
  const [candidateJson, setCandidateJson] = useState(null);
  const [candidateFilename, setCandidateFilename] = useState('');
  const [candidateScenarioName, setCandidateScenarioName] = useState('');
  const [validationResult, setValidationResult] = useState(null);
  const [modalError, setModalError] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  // Sync catalog whenever version changes
  useEffect(() => {
    setDatasetCatalog(getDatasetCatalog());
    setActiveDatasetIdState(getActiveDatasetId());
  }, [datasetVersion]);

  const switchDataset = (id) => {
    setActiveDatasetId(id);
    setActiveDatasetIdState(id);
    setDatasetVersion((v) => v + 1);
    const target = datasetCatalog.find((d) => d.id === id);
    setToastMessage(`Switched active scenario to: "${target?.name || id}"`);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Build the complete analytical model from active dataset
  const currentDataset = useMemo(() => {
    return getCurrentData();
  }, [datasetVersion, activeDatasetId]);

  const consoleModel = useMemo(() => {
    return buildConsoleModel(currentDataset);
  }, [currentDataset]);

  // Dropdown options
  const availableGroups = useMemo(() => {
    return getProviderGroups(selectedMarket);
  }, [selectedMarket, datasetVersion]);

  // Render the active tab view from the engine
  const renderedConsole = useMemo(() => {
    return renderConsoleTab(consoleModel, {
      tab: activeTab,
      market: selectedMarket,
      group: selectedGroup,
      cmp: comparisonMode === 'budget' ? 'budget' : 'prior',
      cs,
      spec,
    });
  }, [consoleModel, activeTab, selectedMarket, selectedGroup, comparisonMode, cs, spec]);

  // Compute dynamic brand header metadata reactive to filters, dataset scenarios, and baselines
  const dynamicHeaderSubtitle = useMemo(() => {
    // 1. Focus / Scope text
    let scopeText = 'Provider Performance';
    if (selectedGroup !== 'all') {
      const grp = consoleModel?.E?.[selectedGroup];
      scopeText = grp?.name || renderedConsole?.scopeName || 'Provider Group';
    } else if (selectedMarket !== 'all') {
      const mkt = MARKETS.find((m) => m.id === selectedMarket);
      scopeText = mkt ? `${mkt.name} Performance` : 'Provider Performance';
    }

    // 2. Date range text
    const months = consoleModel?.months || ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'];
    const startMonth = months[0] || 'Jan';
    const endMonth = months[months.length - 1] || 'Aug';
    const dateText = `Calendar 2026 year to date · ${startMonth}–${endMonth}`;

    // 3. Markets text
    let marketText = 'Northern Nevada · Florida · North TX · South TX';
    if (selectedMarket !== 'all') {
      const mkt = MARKETS.find((m) => m.id === selectedMarket);
      marketText = mkt?.name?.replace('Texas', 'TX') || 'Selected Market';
    } else if (selectedGroup !== 'all' && consoleModel?.E?.[selectedGroup]?.market) {
      const mktId = consoleModel.E[selectedGroup].market;
      const mkt = MARKETS.find((m) => m.id === mktId);
      if (mkt) {
        marketText = mkt.name.replace('Texas', 'TX');
      }
    }

    // 4. Baseline & Scenario Dataset text
    const activeDataset = datasetCatalog.find((d) => d.id === activeDatasetId);
    let scenarioText = 'Sample data';
    if (activeDataset && activeDataset.id !== 'baseline') {
      scenarioText = activeDataset.name;
    }
    const baselineText = comparisonMode === 'budget' ? 'Budget (83% Goal)' : 'Prior Year (2025)';
    const datasetBaselineText = `${scenarioText} · ${baselineText}`;

    return {
      scopeText,
      dateText,
      marketText,
      datasetBaselineText,
      scenarioText,
    };
  }, [
    selectedGroup,
    selectedMarket,
    consoleModel,
    renderedConsole,
    activeDatasetId,
    datasetCatalog,
    comparisonMode,
  ]);

  const handleMarketChange = (e) => {
    setSelectedMarket(e.target.value);
    setSelectedGroup('all');
  };

  const handleGroupChange = (e) => {
    const val = e.target.value;
    setSelectedGroup(val);
    if (val !== 'all' && consoleModel.E[val]?.market) {
      setSelectedMarket(consoleModel.E[val].market);
    }
  };

  const resetFilters = () => {
    setSelectedMarket('all');
    setSelectedGroup('all');
    setComparisonMode('budget');
    setCs('inst');
    setSpec(null);
  };

  // Handle interactive clicks inside the HTML console
  const handleConsoleClick = (e) => {
    const csBtn = e.target.closest('[data-cs]');
    if (csBtn) {
      setCs(csBtn.dataset.cs);
      setSpec(null);
      return;
    }
    const specRow = e.target.closest('[data-spec]');
    if (specRow) {
      setSpec(specRow.dataset.spec);
      return;
    }
    const entRow = e.target.closest('tr[data-entity]');
    if (entRow) {
      const entId = entRow.dataset.entity;
      if (entId === 'plan') {
        setSelectedMarket('all');
        setSelectedGroup('all');
      } else if (['nnv', 'fl', 'ntx', 'stx'].includes(entId)) {
        setSelectedMarket(entId);
        setSelectedGroup('all');
      } else {
        const targetNode = consoleModel.E[entId];
        if (targetNode) {
          if (targetNode.market) setSelectedMarket(targetNode.market);
          setSelectedGroup(entId);
        }
      }
    }
  };

  // Open modal
  const openModal = (tab = 'list') => {
    setModalTab(tab);
    setCandidateJson(null);
    setCandidateFilename('');
    setCandidateScenarioName('');
    setValidationResult(null);
    setModalError(null);
    setEditingId(null);
    setIsModalOpen(true);
  };

  // Handle file select in modal
  const handleFileChange = (e) => {
    setModalError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.json')) {
      setModalError('Please upload a valid .json file.');
      return;
    }

    setCandidateFilename(file.name);
    setCandidateScenarioName(file.name.replace(/\.json$/i, '').replace(/[_-]/g, ' '));

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result);
        const check = validateDataset(parsed);
        if (!check.valid) {
          setModalError(check.error);
          setValidationResult(null);
          setCandidateJson(null);
        } else {
          setValidationResult(check.summary);
          setCandidateJson(parsed);
          setModalError(null);
        }
      } catch (err) {
        setModalError(`JSON parse error: ${err.message}`);
        setValidationResult(null);
        setCandidateJson(null);
      }
    };
    reader.readAsText(file);
  };

  // Commit uploaded dataset as a new scenario
  const handleSaveUpload = () => {
    if (!candidateJson) return;
    try {
      const newEntry = saveDatasetToCatalog(candidateJson, candidateScenarioName, candidateFilename);
      setDatasetVersion((v) => v + 1);
      setActiveDatasetIdState(newEntry.id);
      setIsModalOpen(false);
      setToastMessage(`Scenario "${newEntry.name}" added to list and activated.`);
      setTimeout(() => setToastMessage(null), 5000);
    } catch (err) {
      setModalError(err.message || 'Failed to save dataset.');
    }
  };

  // Start inline rename
  const handleStartRename = (item) => {
    setEditingId(item.id);
    setEditingName(item.name);
  };

  // Save inline rename
  const handleSaveRename = (id) => {
    try {
      renameDatasetInCatalog(id, editingName);
      setDatasetVersion((v) => v + 1);
      setEditingId(null);
      setToastMessage('Scenario renamed successfully.');
      setTimeout(() => setToastMessage(null), 3000);
    } catch (err) {
      alert(err.message);
    }
  };

  // Delete a custom dataset
  const handleDeleteDataset = (id, name) => {
    if (window.confirm(`Are you sure you want to remove scenario "${name}"?`)) {
      try {
        deleteDatasetFromCatalog(id);
        setDatasetVersion((v) => v + 1);
        setToastMessage(`Removed scenario "${name}".`);
        setTimeout(() => setToastMessage(null), 4000);
      } catch (err) {
        alert(err.message);
      }
    }
  };

  // Export specific dataset
  const handleExportDataset = (id, name) => {
    const raw = getDatasetDataById(id);
    if (!raw) {
      alert('Could not retrieve dataset content.');
      return;
    }
    const blob = new Blob([JSON.stringify(raw, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name.replace(/\s+/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileChange({ target: { files: [file] } });
    }
  };

  return (
    <PortalPageLayout
      activeNavId="member360"
      activeSubNavId="member360-plan-performance"
      navItems={PORTAL_NAV_ITEMS}
      hideHeader
    >
      <div className="space-y-4 pb-12">
        {/* Plan Performance Console Brand Header Banner */}
        <div className="rounded-2xl bg-[#131930] border border-slate-800 shadow-sm overflow-hidden border-b-2 border-b-[#00b5b0] p-5 sm:p-6">
          <div className="flex items-center justify-between text-[11px] font-medium tracking-wide">
            <span className="font-extrabold uppercase tracking-wider text-slate-200">
              PROMINENCE <span className="text-[#00b5b0]">HEALTH</span>
            </span>
            <span className="text-slate-400">
              Plan Performance Console · {dynamicHeaderSubtitle.scenarioText.toLowerCase()}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mt-2.5 mb-1.5">
            Plan Performance Console
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-[#00b5b0]">
            <span>{dynamicHeaderSubtitle.scopeText}</span>
            <span className="opacity-40 text-slate-400">|</span>
            <span>{dynamicHeaderSubtitle.dateText}</span>
            <span className="opacity-40 text-slate-400">|</span>
            <span>{dynamicHeaderSubtitle.marketText}</span>
            <span className="opacity-40 text-slate-400">|</span>
            <span>{dynamicHeaderSubtitle.datasetBaselineText}</span>
          </div>
        </div>

        {/* Global Toast Banner */}
        {toastMessage && (
          <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-200 flex items-center justify-between shadow-sm animate-fade-in">
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
              {toastMessage}
            </span>
            <button type="button" onClick={() => setToastMessage(null)} className="text-emerald-600 hover:text-emerald-800">
              ✕
            </button>
          </div>
        )}

        {/* Top Header Filter Strip & Scope Controls */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              {/* Dataset Scenario Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                  Dataset Scenario
                </label>
                <select
                  value={activeDatasetId}
                  onChange={(e) => switchDataset(e.target.value)}
                  className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white px-3 py-1.5 text-sm font-semibold focus:ring-2 focus:ring-sky-500"
                >
                  {datasetCatalog.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} {d.isBuiltIn ? '• (Built-in)' : '• (Custom)'}
                    </option>
                  ))}
                </select>
              </div>

              {/* Market Filter */}
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

              {/* Provider Group Filter */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                  Provider Group
                </label>
                <select
                  value={selectedGroup}
                  onChange={handleGroupChange}
                  className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white px-3 py-1.5 text-sm focus:ring-2 focus:ring-sky-500 min-w-[190px]"
                >
                  <option value="all">All Groups ({availableGroups.length})</option>
                  {availableGroups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Benchmark Baseline Mode */}
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
                    onClick={() => setComparisonMode('prior')}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition ${
                      comparisonMode === 'prior'
                        ? 'bg-white dark:bg-sky-600 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    }`}
                  >
                    Prior Year (2025)
                  </button>
                </div>
              </div>
            </div>

            {/* Scope & The Single Manage Button */}
            <div className="flex flex-wrap items-center gap-2.5">
              {(selectedMarket !== 'all' || selectedGroup !== 'all') && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="text-xs font-medium text-sky-600 hover:text-sky-700 dark:text-sky-400 underline mr-1"
                >
                  Reset Filter
                </button>
              )}

              {/* Scope Tag */}
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800">
                <span className="h-2 w-2 rounded-full bg-sky-500" />
                Scope: {renderedConsole.scopeName}
              </span>

              {/* LOB Tag */}
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                LOB: Medicare Advantage (MA)
              </span>

              {/* The Single Manage Button */}
              {canManageDataset && (
                <div className="flex items-center pl-2 border-l border-slate-200 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => openModal('list')}
                    className="inline-flex items-center gap-2 rounded-lg bg-sky-600 hover:bg-sky-700 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition"
                    title="Manage, Edit, Delete, or Upload Datasets"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Manage Datasets
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Console Navigation Tabs (Filtered by Role & Tab-Level Privileges) */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
          {authorizedTabs.map(([k, label]) => {
            const isSelected = activeTab === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setActiveTab(k)}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition shadow-xs ${
                  isSelected
                    ? 'bg-[#1b2348] text-white border-b-2 border-[#00b5b0]'
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/60'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Main Content Area (Matching Jessica's Dashboard 9) */}
        <div className="pp-console" onClick={handleConsoleClick}>
          <div dangerouslySetInnerHTML={{ __html: renderedConsole.html }} />
        </div>

        {/* POPUP MODAL: DATASET & SCENARIO MANAGER */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
            <div className="w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
              {/* Modal Header */}
              <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-sky-100 dark:bg-sky-950 text-sky-600 dark:text-sky-400">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      Dataset &amp; Scenario Manager
                    </h3>
                    <p className="text-xs text-slate-500">
                      Switch active scenarios, upload revised datasets, rename, or delete custom test files.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  ✕
                </button>
              </div>

              {/* Modal Navigation Tabs */}
              <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/50 px-5 pt-2">
                <button
                  type="button"
                  onClick={() => setModalTab('list')}
                  className={`px-4 py-2 text-xs font-bold border-b-2 transition ${
                    modalTab === 'list'
                      ? 'border-sky-600 text-sky-600 dark:text-sky-400'
                      : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >
                  Saved Scenarios ({datasetCatalog.length})
                </button>
                <button
                  type="button"
                  onClick={() => setModalTab('upload')}
                  className={`px-4 py-2 text-xs font-bold border-b-2 transition ${
                    modalTab === 'upload'
                      ? 'border-sky-600 text-sky-600 dark:text-sky-400'
                      : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >
                  + Upload New JSON
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-5 overflow-y-auto space-y-4 flex-1">
                {modalTab === 'list' ? (
                  <div className="space-y-3">
                    <p className="text-xs text-slate-500">
                      Click <strong>Activate</strong> to switch the active dataset immediately across the dashboard without reloading the page.
                    </p>

                    <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                      {datasetCatalog.map((item) => {
                        const isActive = item.id === activeDatasetId;
                        const isEditing = editingId === item.id;

                        return (
                          <div
                            key={item.id}
                            className={`p-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 transition ${
                              isActive ? 'bg-sky-50/60 dark:bg-sky-950/30' : 'bg-white dark:bg-slate-900'
                            }`}
                          >
                            <div className="flex-1 min-w-0">
                              {isEditing ? (
                                <div className="flex items-center gap-2">
                                  <input
                                    type="text"
                                    value={editingName}
                                    onChange={(e) => setEditingName(e.target.value)}
                                    className="px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleSaveRename(item.id)}
                                    className="px-2 py-1 rounded bg-sky-600 text-white text-xs font-semibold"
                                  >
                                    Save
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingId(null)}
                                    className="px-2 py-1 rounded text-slate-500 text-xs"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                                    {item.name}
                                  </span>
                                  {item.isBuiltIn ? (
                                    <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                                      Built-in
                                    </span>
                                  ) : (
                                    <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400">
                                      Custom Upload
                                    </span>
                                  )}
                                  {isActive && (
                                    <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-sky-600 text-white">
                                      Active
                                    </span>
                                  )}
                                </div>
                              )}
                              <div className="text-[11px] text-slate-400 mt-0.5 flex flex-wrap gap-x-3">
                                <span>File: {item.filename || 'dataset.json'}</span>
                                {item.summary && (
                                  <span>
                                    {item.summary.entityCount} entities · {item.summary.monthlyRows} monthly rows
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-2 shrink-0">
                              {!isActive && (
                                <button
                                  type="button"
                                  onClick={() => switchDataset(item.id)}
                                  className="px-2.5 py-1 rounded-md text-xs font-bold bg-sky-600 hover:bg-sky-700 text-white shadow-xs"
                                >
                                  Activate
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleExportDataset(item.id, item.name)}
                                title="Download JSON"
                                className="px-2 py-1 rounded text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                              >
                                Export
                              </button>
                              {!item.isBuiltIn && !isEditing && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleStartRename(item)}
                                    title="Rename Scenario"
                                    className="px-2 py-1 rounded text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                                  >
                                    Rename
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteDataset(item.id, item.name)}
                                    title="Delete Scenario"
                                    className="px-2 py-1 rounded text-xs text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50"
                                  >
                                    Delete
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Drag and Drop Zone */}
                    <div
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                      className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition ${
                        candidateJson
                          ? 'border-emerald-400 bg-emerald-50/40 dark:bg-emerald-950/20'
                          : 'border-slate-300 dark:border-slate-700 hover:border-sky-500 bg-slate-50 dark:bg-slate-800/50'
                      }`}
                    >
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        accept=".json,application/json"
                        className="hidden"
                      />
                      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-sky-100 dark:bg-sky-950/80 text-sky-600 dark:text-sky-400 mb-2">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        {candidateFilename ? candidateFilename : 'Click to select or drag & drop JSON file'}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Accepts standard Plan Performance export format (.json)
                      </p>
                    </div>

                    {/* Scenario Display Name Input */}
                    {candidateJson && (
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Scenario Display Name (shown in Combobox)
                        </label>
                        <input
                          type="text"
                          value={candidateScenarioName}
                          onChange={(e) => setCandidateScenarioName(e.target.value)}
                          placeholder="e.g. Revised Q4 Forecast"
                          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white px-3 py-2 text-xs font-medium focus:ring-2 focus:ring-sky-500"
                        />
                      </div>
                    )}

                    {/* Error Banner */}
                    {modalError && (
                      <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
                        <strong>Validation Error:</strong> {modalError}
                      </div>
                    )}

                    {/* Validation Preview Card */}
                    {validationResult && (
                      <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-2">
                        <div className="flex items-center justify-between text-xs font-bold text-emerald-600 dark:text-emerald-400">
                          <span>✓ Valid Dataset Structure Detected</span>
                          <span>Ready to Add to Catalog</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-300">
                          <div>• Total Entities: <strong>{validationResult.entityCount}</strong></div>
                          <div>• Market Regions: <strong>{validationResult.marketCount}</strong></div>
                          <div>• Provider Groups: <strong>{validationResult.providerGroupCount}</strong></div>
                          <div>• Monthly Records: <strong>{validationResult.monthlyRows}</strong></div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Close
                </button>

                {modalTab === 'upload' && (
                  <button
                    type="button"
                    disabled={!candidateJson}
                    onClick={handleSaveUpload}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold text-white shadow-sm transition ${
                      candidateJson
                        ? 'bg-sky-600 hover:bg-sky-700 cursor-pointer'
                        : 'bg-slate-300 dark:bg-slate-700 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    Save Scenario &amp; Activate
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </PortalPageLayout>
  );
}
