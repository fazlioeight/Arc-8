import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import PortalPageLayout from "../../../components/PortalPageLayout";
import PortalCard from "../../../components/PortalCard";
import KpiTile from "../../../components/ui/KpiTile";
import { AuthContext } from "../../../context/AuthContext";
import { useCommandPalette } from "../../../context/CommandPaletteContext";
import {
  fetchImportJobs,
  queueFhirImportJob,
  testFhirImportConnection,
  uploadImportFile,
} from "../../../services/importsService";
import "../../../styles/memberWorkspace.css";

const IMPORT_ENTITIES = [
  { key: "members", label: "Members", description: "Demographics, eligibility, and attribution data." },
  { key: "providers", label: "Providers", description: "Rosters, contract attributes, and specialties." },
  { key: "claims", label: "Claims", description: "837/835 extracts or capitation equivalents." },
  { key: "mao004", label: "MAO-004", description: "Risk adjustment submissions and CMS response files." },
  { key: "charts", label: "Charts", description: "Extraction manifests and chart metadata indexes." },
];

const ACCEPTED_EXTENSIONS = ["txt", "csv", "xlsx"];
const ACCEPT_ATTR = ".txt,.csv,.xlsx";
const STATUS_VARIANTS = {
  queued: "bg-amber-100 text-amber-800 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-100 dark:ring-amber-500/30",
  running: "bg-sky-100 text-sky-700 ring-1 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-100 dark:ring-sky-500/30",
  processing: "bg-sky-100 text-sky-700 ring-1 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-100 dark:ring-sky-500/30",
  completed: "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-100 dark:ring-emerald-500/30",
  failed: "bg-rose-100 text-rose-700 ring-1 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-100 dark:ring-rose-500/30",
};

const FHIR_RESOURCES = [
  { key: "Patient", label: "Patient", description: "Demographics and identifiers." },
  { key: "Coverage", label: "Coverage", description: "Plan enrollment and payers." },
  { key: "Claim", label: "Claim", description: "Billing lines and adjudication details." },
  { key: "Encounter", label: "Encounter", description: "Visits, locations, and providers of service." },
  { key: "Observation", label: "Observation", description: "Labs, vitals, and clinical findings." },
];

const FHIR_STATUS_VARIANTS = {
  idle: "bg-slate-100 text-slate-600 ring-1 ring-slate-200 dark:bg-slate-800/80 dark:text-slate-200 dark:ring-slate-700",
  testing: "bg-amber-100 text-amber-800 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-100 dark:ring-amber-500/30",
  connected: "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-100 dark:ring-emerald-500/30",
  queued: "bg-sky-100 text-sky-700 ring-1 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-100 dark:ring-sky-500/30",
  error: "bg-rose-100 text-rose-700 ring-1 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-100 dark:ring-rose-500/30",
};

const IMPORT_DATA_COMMAND_SCOPE = "import-data-commands";
const QUEUE_REFRESH_MS = 4000;

const formatBytes = (size) => {
  if (!size && size !== 0) return "-";
  const units = ["B", "KB", "MB", "GB"];
  let value = size;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  const precision = value < 10 ? 1 : 0;
  return `${value.toFixed(precision)} ${units[idx]}`;
};

const getExtension = (fileName = "") => fileName.split(".").pop()?.toLowerCase() || "";

const ImportDataPage = () => {
  const navigate = useNavigate();
  const { token, tenant, recordAuditEvent } = useContext(AuthContext) || {};
  const { registerCommands } = useCommandPalette();

  const [selectedFiles, setSelectedFiles] = useState({});
  const [previews, setPreviews] = useState({});
  const [errors, setErrors] = useState({});
  const [queue, setQueue] = useState([]);
  const [dropTarget, setDropTarget] = useState(null);
  const [uploadingEntity, setUploadingEntity] = useState(null);
  const [fhirConfig, setFhirConfig] = useState({
    baseUrl: "",
    tokenUrl: "",
    clientId: "",
    clientSecret: "",
    scopes: "system/*.read patient/*.read",
    since: "",
  });
  const [fhirResources, setFhirResources] = useState(["Patient", "Claim", "Coverage"]);
  const [fhirStatus, setFhirStatus] = useState({
    state: "idle",
    message: "Provide your FHIR base URL and OAuth details to begin.",
  });
  const [isTestingFhir, setIsTestingFhir] = useState(false);
  const [pageError, setPageError] = useState(null);
  const timersRef = useRef([]);

  const refreshQueue = useCallback(async () => {
    try {
      const data = await fetchImportJobs(token, tenant, { limit: 50 });
      setQueue(data.items || []);
    } catch (err) {
      setPageError(err.message || "Unable to load import jobs");
    }
  }, [token, tenant]);

  useEffect(() => {
    recordAuditEvent?.("import_data.visit", { tenant });
    refreshQueue();
    return () => {
      timersRef.current.forEach((id) => window.clearTimeout(id));
      timersRef.current = [];
    };
  }, [recordAuditEvent, tenant, refreshQueue]);

  // Background refresh when any job is in flight
  useEffect(() => {
    const hasInFlight = queue.some((j) => j.status === "queued" || j.status === "running");
    if (!hasInFlight) return undefined;
    const t = window.setInterval(refreshQueue, QUEUE_REFRESH_MS);
    return () => window.clearInterval(t);
  }, [queue, refreshQueue]);

  const summary = useMemo(() => {
    const total = queue.length;
    const completed = queue.filter((item) => item.status === "completed").length;
    const processing = queue.filter((item) => item.status === "running" || item.status === "queued").length;
    const failed = queue.filter((item) => item.status === "failed").length;
    const latest = queue.find((item) => item.status === "completed");
    return { total, completed, processing, failed, latest };
  }, [queue]);

  const readPreview = useCallback((entityKey, file) => {
    if (!file) {
      setPreviews((prev) => ({ ...prev, [entityKey]: "" }));
      return;
    }
    const ext = getExtension(file.name);
    if (ext === "xlsx") {
      setPreviews((prev) => ({
        ...prev,
        [entityKey]: "Preview not available for spreadsheet files.",
      }));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const content = typeof reader.result === "string" ? reader.result : "";
      const snippet = content.slice(0, 900);
      setPreviews((prev) => ({ ...prev, [entityKey]: snippet || "File is empty." }));
    };
    reader.onerror = () => {
      setPreviews((prev) => ({ ...prev, [entityKey]: "Unable to read file preview." }));
    };
    reader.readAsText(file);
  }, []);

  const resetSelection = useCallback((entityKey) => {
    setSelectedFiles((prev) => ({ ...prev, [entityKey]: null }));
    setPreviews((prev) => ({ ...prev, [entityKey]: "" }));
    setErrors((prev) => ({ ...prev, [entityKey]: "" }));
  }, []);

  const acceptFile = useCallback(
    (entityKey, file) => {
      if (!file) return;
      const extension = getExtension(file.name);
      if (!ACCEPTED_EXTENSIONS.includes(extension)) {
        setErrors((prev) => ({
          ...prev,
          [entityKey]: "Unsupported file type. Please upload .txt, .csv, or .xlsx files.",
        }));
        setSelectedFiles((prev) => ({ ...prev, [entityKey]: null }));
        setPreviews((prev) => ({ ...prev, [entityKey]: "" }));
        return;
      }
      if (file.size === 0) {
        setErrors((prev) => ({ ...prev, [entityKey]: "This file appears to be empty." }));
        setSelectedFiles((prev) => ({ ...prev, [entityKey]: null }));
        setPreviews((prev) => ({ ...prev, [entityKey]: "" }));
        return;
      }
      setErrors((prev) => ({ ...prev, [entityKey]: "" }));
      setSelectedFiles((prev) => ({ ...prev, [entityKey]: file }));
      readPreview(entityKey, file);
    },
    [readPreview],
  );

  const handleFileInput = useCallback(
    (entityKey, event) => {
      const file = event.target.files?.[0];
      acceptFile(entityKey, file);
      event.target.value = "";
    },
    [acceptFile],
  );

  const handleDrop = useCallback(
    (entityKey, event) => {
      event.preventDefault();
      event.stopPropagation();
      setDropTarget(null);
      const file = event.dataTransfer?.files?.[0];
      acceptFile(entityKey, file);
    },
    [acceptFile],
  );

  const startImport = useCallback(
    async (entityKey) => {
      const file = selectedFiles[entityKey];
      if (!file) return;
      setUploadingEntity(entityKey);
      setErrors((prev) => ({ ...prev, [entityKey]: "" }));
      try {
        const job = await uploadImportFile(token, tenant, { entity: entityKey, file });
        recordAuditEvent?.("import_data.queued", {
          entity: entityKey,
          fileName: file.name,
          size: file.size,
          jobId: job.id,
          tenant,
        });
        setSelectedFiles((prev) => ({ ...prev, [entityKey]: null }));
        setPreviews((prev) => ({ ...prev, [entityKey]: "" }));
        await refreshQueue();
      } catch (err) {
        setErrors((prev) => ({
          ...prev,
          [entityKey]: err.message || "Upload failed.",
        }));
      } finally {
        setUploadingEntity(null);
      }
    },
    [recordAuditEvent, refreshQueue, selectedFiles, tenant, token],
  );

  const removeQueueItem = useCallback((uploadId) => {
    // Server is the source of truth; just hide locally until next refresh.
    setQueue((prev) => prev.filter((item) => item.id !== uploadId));
  }, []);

  const clearCompleted = useCallback(() => {
    setQueue((prev) => prev.filter((item) => item.status !== "completed"));
  }, []);

  const updateFhirConfig = (key, value) => {
    setFhirConfig((prev) => ({ ...prev, [key]: value }));
  };

  const toggleFhirResource = useCallback((resourceKey) => {
    setFhirResources((prev) =>
      prev.includes(resourceKey) ? prev.filter((r) => r !== resourceKey) : [...prev, resourceKey],
    );
  }, []);

  const buildFhirPayload = useCallback(
    () => ({
      baseUrl: fhirConfig.baseUrl,
      tokenUrl: fhirConfig.tokenUrl || undefined,
      clientId: fhirConfig.clientId || undefined,
      clientSecret: fhirConfig.clientSecret || undefined,
      scopes: fhirConfig.scopes || undefined,
      since: fhirConfig.since || undefined,
      resources: fhirResources,
    }),
    [fhirConfig, fhirResources],
  );

  const testFhirConnection = useCallback(async () => {
    if (!fhirConfig.baseUrl.trim()) {
      setFhirStatus({ state: "error", message: "Base URL is required before testing." });
      return;
    }
    setIsTestingFhir(true);
    setFhirStatus({ state: "testing", message: "Validating FHIR metadata and OAuth scope coverage..." });
    try {
      await testFhirImportConnection(token, tenant, buildFhirPayload());
      setFhirStatus({
        state: "connected",
        message: `Connected to ${fhirConfig.baseUrl} - ${fhirResources.length} resource${
          fhirResources.length === 1 ? "" : "s"
        } selected.`,
      });
      recordAuditEvent?.("import_data.fhir_test", {
        baseUrl: fhirConfig.baseUrl,
        resources: fhirResources,
        tenant,
      });
    } catch (err) {
      setFhirStatus({ state: "error", message: err.message || "FHIR test failed" });
    } finally {
      setIsTestingFhir(false);
    }
  }, [buildFhirPayload, fhirConfig, fhirResources, recordAuditEvent, tenant, token]);

  const startFhirImport = useCallback(async () => {
    if (!fhirConfig.baseUrl.trim()) {
      setFhirStatus({ state: "error", message: "Base URL is required before queuing a FHIR import." });
      return;
    }
    if (!fhirResources.length) {
      setFhirStatus({ state: "error", message: "Select at least one FHIR resource type to sync." });
      return;
    }
    try {
      await queueFhirImportJob(token, tenant, buildFhirPayload());
      setFhirStatus({ state: "queued", message: `Queued FHIR import from ${fhirConfig.baseUrl}` });
      recordAuditEvent?.("import_data.fhir_queued", {
        baseUrl: fhirConfig.baseUrl,
        resources: fhirResources,
        tenant,
      });
      await refreshQueue();
    } catch (err) {
      setFhirStatus({ state: "error", message: err.message || "FHIR queue failed" });
    }
  }, [buildFhirPayload, fhirConfig.baseUrl, fhirResources, recordAuditEvent, refreshQueue, tenant, token]);

  useEffect(() => {
    const unregister = registerCommands(
      [
        {
          id: "import-data-open-status",
          label: "Open Job Status Center",
          category: "Imports",
          action: () => navigate("/jobs/status-center"),
        },
        {
          id: "import-data-test-fhir",
          label: "Test FHIR connectivity",
          category: "Imports",
          action: testFhirConnection,
        },
        {
          id: "import-data-queue-fhir",
          label: "Queue FHIR API import",
          category: "Imports",
          action: startFhirImport,
        },
        queue.some((item) => item.status === "completed")
          ? {
              id: "import-data-clear-complete",
              label: "Clear completed imports",
              category: "Imports",
              action: clearCompleted,
            }
          : null,
      ].filter(Boolean),
      { id: IMPORT_DATA_COMMAND_SCOPE },
    );
    return unregister;
  }, [clearCompleted, navigate, queue, registerCommands, startFhirImport, testFhirConnection]);

  const layoutProps = useMemo(
    () => ({
      backgroundClassName: "",
      maxWidthClassName: "max-w-6xl",
      paddingClassName: "px-4",
    }),
    [],
  );

  const headerContent = (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] coding-text-muted">Imports</p>
      <h1 className="text-3xl font-semibold coding-text-strong">Import Data</h1>
      <p className="text-sm coding-text-soft">Load members, providers, claims, MAO-004, or chart manifests. Imports run as background jobs.</p>
    </div>
  );

  return (
    <PortalPageLayout
      {...layoutProps}
      headerContent={headerContent}
      mainClassName="space-y-6"
      utilityBar
    >
      {pageError && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100">
          {pageError}
        </div>
      )}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiTile label="Queued" value={summary.total} hint="Total" />
        <KpiTile label="In flight" value={summary.processing} tone="warning" hint="Running/queued" />
        <KpiTile label="Completed" value={summary.completed} tone="success" hint="Finished" />
        <KpiTile label="Failed" value={summary.failed} tone="critical" hint="Attention" />
      </section>
      <PortalCard
        title="Connect to FHIR endpoints"
        subtitle="Authenticate and pull resources via background jobs."
        tone="info"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className={`portal-pill ${FHIR_STATUS_VARIANTS[fhirStatus.state] || ""}`}>
            {fhirStatus.state === "testing"
              ? "Testing connection"
              : fhirStatus.state === "connected"
              ? "Connected"
              : fhirStatus.state === "queued"
              ? "Queued"
              : fhirStatus.state === "error"
              ? "Needs attention"
              : "Not connected"}
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Current tenant: {tenant || "prominencehealth"}
          </span>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-3 lg:col-span-2">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
                FHIR base URL
                <input
                  type="url"
                  placeholder="https://fhir.your-org.com/r4"
                  value={fhirConfig.baseUrl}
                  onChange={(event) => updateFhirConfig("baseUrl", event.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900 shadow-inner outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-sky-400 dark:focus:ring-sky-500/40"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
                OAuth token URL
                <input
                  type="url"
                  placeholder="https://auth.your-org.com/oauth2/token"
                  value={fhirConfig.tokenUrl}
                  onChange={(event) => updateFhirConfig("tokenUrl", event.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900 shadow-inner outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-sky-400 dark:focus:ring-sky-500/40"
                />
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
                Client ID
                <input
                  type="text"
                  autoComplete="off"
                  placeholder="client-id"
                  value={fhirConfig.clientId}
                  onChange={(event) => updateFhirConfig("clientId", event.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900 shadow-inner outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-sky-400 dark:focus:ring-sky-500/40"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
                Client secret
                <input
                  type="password"
                  autoComplete="new-password"
                  placeholder="**********"
                  value={fhirConfig.clientSecret}
                  onChange={(event) => updateFhirConfig("clientSecret", event.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900 shadow-inner outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-sky-400 dark:focus:ring-sky-500/40"
                />
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="flex flex-col gap-1 text-sm font-semibold text-slate-800 dark:text-slate-100 sm:col-span-2">
                Scopes
                <input
                  type="text"
                  placeholder="system/*.read patient/*.read"
                  value={fhirConfig.scopes}
                  onChange={(event) => updateFhirConfig("scopes", event.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900 shadow-inner outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-sky-400 dark:focus:ring-sky-500/40"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
                Since date (optional)
                <input
                  type="date"
                  value={fhirConfig.since}
                  onChange={(event) => updateFhirConfig("since", event.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900 shadow-inner outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-sky-400 dark:focus:ring-sky-500/40"
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-slate-500 dark:hover:bg-slate-700"
                type="button"
                onClick={testFhirConnection}
                disabled={isTestingFhir}
              >
                {isTestingFhir ? "Testing..." : "Test connection"}
              </button>
              <button
                className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                type="button"
                onClick={startFhirImport}
                disabled={isTestingFhir}
              >
                Queue FHIR import
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              We will request the selected resources with your provided scopes, run the import as a background job, and surface it below and in the Job Status Center.
            </p>
          </div>

          <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 shadow-inner dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">FHIR payload scope</h3>
                <p className="text-xs text-slate-600 dark:text-slate-300">Choose the resources to request via _type and _since parameters.</p>
              </div>
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
                {fhirResources.length} selected
              </span>
            </div>
            <div className="space-y-2">
              {FHIR_RESOURCES.map((resource) => (
                <label
                  key={resource.key}
                  className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm transition hover:border-sky-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:checked:bg-slate-100"
                    checked={fhirResources.includes(resource.key)}
                    onChange={() => toggleFhirResource(resource.key)}
                  />
                  <span>
                    <span className="block font-semibold">{resource.label}</span>
                    <span className="block text-xs text-slate-600 dark:text-slate-300">{resource.description}</span>
                  </span>
                </label>
              ))}
            </div>
            <div className="rounded-xl border border-dashed border-slate-300 bg-white px-3 py-2 text-xs text-slate-700 shadow-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200">
              <div className="font-semibold text-slate-900 dark:text-slate-100">Connection notes</div>
              <p className="mt-1 text-slate-600 dark:text-slate-300">{fhirStatus.message}</p>
              <p className="mt-2 text-slate-600 dark:text-slate-300">
                We will use <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">{fhirConfig.since || "no _since filter"}</code>{" "}
                and scopes <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">{fhirConfig.scopes || "system/*.read"}</code> when available.
              </p>
            </div>
          </div>
        </div>
      </PortalCard>

      <div className="portal-section-grid">
        <PortalCard title="Import summary" subtitle="Quick metrics across all imports." compact>
          <div className="grid grid-cols-2 gap-3 text-sm text-slate-700 dark:text-slate-200">
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Total</div>
              <div className="text-lg font-semibold">{summary.total}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">In flight</div>
              <div className="text-lg font-semibold">{summary.processing}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Completed</div>
              <div className="text-lg font-semibold">{summary.completed}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Failed</div>
              <div className="text-lg font-semibold">{summary.failed}</div>
            </div>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-300">
            Last completed: {summary.latest ? `${summary.latest.entity || summary.latest.source_type} - ${summary.latest.file_name || summary.latest.name}` : "None yet"}
          </div>
        </PortalCard>

        {IMPORT_ENTITIES.map((entity) => {
          const file = selectedFiles[entity.key];
          const preview = previews[entity.key];
          const error = errors[entity.key];
          const dropActive = dropTarget === entity.key;
          const isUploading = uploadingEntity === entity.key;

          return (
            <PortalCard key={entity.key} title={entity.label} subtitle={entity.description} compact>
              <div className="flex items-start justify-between gap-2">
                <span className={`portal-pill ${file ? "portal-pill--solid" : "portal-pill--ghost"}`}>
                  {file ? "Ready" : "Idle"}
                </span>
              </div>

              <div
                className={`relative rounded-xl border-2 border-dashed px-4 py-6 text-sm transition ${
                  dropActive
                    ? "border-sky-400 bg-sky-50/50 dark:border-sky-400 dark:bg-sky-500/10"
                    : "border-slate-300 hover:border-slate-400 dark:border-slate-700 dark:hover:border-slate-500"
                }`}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setDropTarget(entity.key);
                }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={(event) => {
                  event.preventDefault();
                  setDropTarget(null);
                }}
                onDrop={(event) => handleDrop(entity.key, event)}
              >
                <label htmlFor={`file-input-${entity.key}`} className="block cursor-pointer text-center">
                  <strong>Drop a file</strong> or <span className="text-sky-600">browse</span>
                  <input
                    id={`file-input-${entity.key}`}
                    type="file"
                    accept={ACCEPT_ATTR}
                    className="hidden"
                    onChange={(event) => handleFileInput(entity.key, event)}
                  />
                </label>
                <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  Accepts .txt, .csv, .xlsx - Max preview 900 chars
                </div>
              </div>

              <div
                className={`min-h-[68px] rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 shadow-inner dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 ${
                  preview ? "" : "italic text-slate-500 dark:text-slate-400"
                }`}
              >
                {preview || "No preview yet. Upload a file to inspect the first lines."}
              </div>

              <div className="flex items-center justify-between text-sm text-slate-700 dark:text-slate-200">
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">Selected file</div>
                  <div className="font-semibold">{file ? file.name : "Nothing selected"}</div>
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">{file ? formatBytes(file.size) : "-"}</div>
              </div>

              {error && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-500/50 dark:bg-rose-500/10 dark:text-rose-100">
                  {error}
                </div>
              )}

              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap gap-2">
                  <button
                    className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-slate-500 dark:hover:bg-slate-700"
                    disabled={!file || isUploading}
                    onClick={() => startImport(entity.key)}
                  >
                    {isUploading ? "Uploading..." : "Queue import"}
                  </button>
                  <button
                    className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-slate-500 dark:hover:bg-slate-700"
                    disabled={!file && !previews[entity.key]}
                    onClick={() => resetSelection(entity.key)}
                  >
                    Clear
                  </button>
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Latest runs appear in the Job Status Center.</div>
              </div>
            </PortalCard>
          );
        })}
      </div>

      <PortalCard title="Import activity" subtitle="Track queued files and monitor progress.">
        <div className="flex flex-wrap gap-2">
          <button
            className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-slate-500 dark:hover:bg-slate-700"
            disabled={!queue.some((item) => item.status === "completed")}
            onClick={clearCompleted}
          >
            Hide completed
          </button>
          <button
            className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-slate-500 dark:hover:bg-slate-700"
            onClick={() => navigate("/jobs/status-center")}
          >
            Open status center
          </button>
          <button
            className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-slate-500 dark:hover:bg-slate-700"
            onClick={refreshQueue}
          >
            Refresh
          </button>
        </div>

        {queue.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
            <strong className="block text-base text-slate-900 dark:text-slate-100">No imports yet</strong>
            <span>Queue a file above to kick off a background job.</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                    Dataset
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                    File
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                    Size
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                    Owner
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                    Progress
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                    Queued at
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {queue.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                    <td className="px-4 py-3">
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{item.entity || item.source_type}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-300 uppercase">{item.source_type}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-800 dark:text-slate-100">{item.file_name || item.name}</td>
                    <td className="px-4 py-3 text-slate-800 dark:text-slate-100">{formatBytes(item.file_size || 0)}</td>
                    <td className="px-4 py-3 text-slate-800 dark:text-slate-100">{item.initiated_by || "system"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-800">
                          <div
                            className="h-full rounded-full bg-sky-500 transition"
                            style={{ width: `${item.progress || 0}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-600 dark:text-slate-300">{item.progress || 0}%</span>
                      </div>
                      <span className={`mt-1 inline-flex items-center rounded-full px-2 py-1 text-[11px] font-semibold uppercase tracking-wide ${STATUS_VARIANTS[item.status] || STATUS_VARIANTS.queued}`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-800 dark:text-slate-100">
                      {item.started_at ? new Date(item.started_at).toLocaleTimeString() : "-"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-slate-500 dark:hover:bg-slate-700"
                        onClick={() => removeQueueItem(item.id)}
                      >
                        Hide
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PortalCard>
    </PortalPageLayout>
  );
};

export default ImportDataPage;
