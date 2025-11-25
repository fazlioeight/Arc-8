import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import PortalUtilityBar from "../../../components/PortalUtilityBar";
import { AuthContext } from "../../../context/AuthContext";
import { useCommandPalette } from "../../../context/CommandPaletteContext";
import "../coding/member/memberWorkspace.css";

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
  processing: "bg-sky-100 text-sky-700 ring-1 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-100 dark:ring-sky-500/30",
  completed: "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-100 dark:ring-emerald-500/30",
  failed: "bg-rose-100 text-rose-700 ring-1 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-100 dark:ring-rose-500/30",
};

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
  const { tenant, recordAuditEvent } = useContext(AuthContext) || {};
  const { registerCommands } = useCommandPalette();

  const [selectedFiles, setSelectedFiles] = useState({});
  const [previews, setPreviews] = useState({});
  const [errors, setErrors] = useState({});
  const [queue, setQueue] = useState([]);
  const [dropTarget, setDropTarget] = useState(null);
  const timersRef = useRef([]);

  useEffect(() => {
    recordAuditEvent?.("import_data.visit", { tenant });
    return () => {
      timersRef.current.forEach((id) => window.clearTimeout(id));
      timersRef.current = [];
    };
  }, [recordAuditEvent, tenant]);

  const summary = useMemo(() => {
    const total = queue.length;
    const completed = queue.filter((item) => item.status === "completed").length;
    const processing = queue.filter((item) => item.status === "processing").length;
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
    [readPreview]
  );

  const handleFileInput = useCallback(
    (entityKey, event) => {
      const file = event.target.files?.[0];
      acceptFile(entityKey, file);
      event.target.value = "";
    },
    [acceptFile]
  );

  const handleDrop = useCallback(
    (entityKey, event) => {
      event.preventDefault();
      event.stopPropagation();
      setDropTarget(null);
      const file = event.dataTransfer?.files?.[0];
      acceptFile(entityKey, file);
    },
    [acceptFile]
  );

  const simulateUpload = useCallback(
    (uploadId, metadata) => {
      const step = () => {
        let shouldContinue = false;
        setQueue((prev) =>
          prev.map((item) => {
            if (item.id !== uploadId) return item;
            const nextProgress = Math.min(100, item.progress + Math.floor(Math.random() * 18) + 12);
            const isDone = nextProgress >= 100;
            if (isDone) {
              recordAuditEvent?.("import_data.completed", {
                entity: item.entityKey,
                fileName: item.fileName,
                tenant: metadata.tenant,
              });
              return {
                ...item,
                progress: 100,
                status: "completed",
                completedAt: new Date().toISOString(),
              };
            }
            shouldContinue = true;
            return {
              ...item,
              progress: nextProgress,
              status: "processing",
            };
          })
        );
        if (shouldContinue) {
          const timer = window.setTimeout(step, 450);
          timersRef.current.push(timer);
        }
      };
      const timer = window.setTimeout(step, 500);
      timersRef.current.push(timer);
    },
    [recordAuditEvent]
  );

  const startImport = useCallback(
    (entityKey) => {
      const file = selectedFiles[entityKey];
      if (!file) {
        setErrors((prev) => ({ ...prev, [entityKey]: "Select a file before importing." }));
        return;
      }
      const extension = getExtension(file.name);
      if (!ACCEPTED_EXTENSIONS.includes(extension)) {
        setErrors((prev) => ({ ...prev, [entityKey]: "Unsupported file type." }));
        return;
      }
      const uploadId = `${entityKey}-${Date.now().toString(36)}`;
      const entityMeta = IMPORT_ENTITIES.find((item) => item.key === entityKey);
      const upload = {
        id: uploadId,
        entityKey,
        entityLabel: entityMeta?.label || entityKey,
        fileName: file.name,
        size: file.size,
        extension,
        status: "processing",
        progress: 12,
        tenant: tenant || "prominencehealth",
        startedAt: new Date().toISOString(),
      };
      recordAuditEvent?.("import_data.started", {
        entity: entityKey,
        fileName: file.name,
        size: file.size,
        tenant,
      });
      setQueue((prev) => [upload, ...prev]);
      resetSelection(entityKey);
      simulateUpload(uploadId, { tenant });
    },
    [recordAuditEvent, resetSelection, selectedFiles, simulateUpload, tenant]
  );

  const removeQueueItem = useCallback((uploadId) => {
    setQueue((prev) => prev.filter((item) => item.id !== uploadId));
  }, []);

  const clearCompleted = useCallback(() => {
    setQueue((prev) => prev.filter((item) => item.status !== "completed"));
  }, []);

  useEffect(() => {
    registerCommands(
      [
        {
          id: "import-data-open-status",
          label: "Open Job Status Center",
          category: "Imports",
          action: () => navigate("/jobs/status-center"),
        },
        queue.some((item) => item.status === "completed")
          ? {
              id: "import-data-clear-complete",
              label: "Clear completed imports",
              category: "Imports",
              action: clearCompleted,
            }
          : null,
      ].filter(Boolean)
    );
    return () => registerCommands([]);
  }, [clearCompleted, navigate, queue, registerCommands]);

  return (
    <div className="coding-member-workspace portal-theme min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <PortalUtilityBar />

      <header className="border-b border-slate-200 bg-white/80 px-4 py-5 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/80">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500 dark:text-slate-400">
              Imports
            </p>
            <div>
              <h1 className="text-2xl font-semibold">Import Data</h1>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                Load members, providers, claims, MAO-004, or chart manifests. Imports run as background jobs.
              </p>
            </div>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <button
              className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-slate-500 dark:hover:bg-slate-700"
              onClick={() => navigate("/jobs/status-center")}
            >
              View Job Status Center
            </button>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Current tenant: {tenant || "prominencehealth"}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 space-y-6">
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Import summary</h2>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-slate-700 dark:text-slate-200">
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Total queued</div>
                <div className="text-lg font-semibold">{summary.total}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Processing</div>
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
            <div className="mt-3 text-xs text-slate-500 dark:text-slate-300">
              Last completed:{" "}
              {summary.latest ? `${summary.latest.entityLabel} - ${summary.latest.fileName}` : "None yet"}
            </div>
          </div>

          {IMPORT_ENTITIES.map((entity) => {
            const file = selectedFiles[entity.key];
            const preview = previews[entity.key];
            const error = errors[entity.key];
            const dropActive = dropTarget === entity.key;

            return (
              <div
                key={entity.key}
                className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{entity.label}</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-300">{entity.description}</p>
                  </div>
                  <span
                    className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                      file ? "bg-sky-100 text-sky-700 ring-1 ring-sky-200" : "bg-slate-100 text-slate-600 ring-1 ring-slate-200"
                    }`}
                  >
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
                    Accepts .txt, .csv, .xlsx · Max preview 900 chars
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
                      disabled={!file}
                      onClick={() => startImport(entity.key)}
                    >
                      Queue import
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
              </div>
            );
          })}
        </section>

        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900" aria-label="Import activity">
          <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Import activity</h2>
              <p className="text-sm text-slate-500 dark:text-slate-300">
                Track queued files and monitor progress.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-slate-500 dark:hover:bg-slate-700"
                disabled={!queue.some((item) => item.status === "completed")}
                onClick={clearCompleted}
              >
                Clear completed
              </button>
              <button
                className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-slate-500 dark:hover:bg-slate-700"
                onClick={() => navigate("/jobs/status-center")}
              >
                Open status center
              </button>
            </div>
          </header>

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
                      Tenant
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
                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{item.entityLabel}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-300 uppercase">{item.extension}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-800 dark:text-slate-100">{item.fileName}</td>
                      <td className="px-4 py-3 text-slate-800 dark:text-slate-100">{formatBytes(item.size)}</td>
                      <td className="px-4 py-3 text-slate-800 dark:text-slate-100">{item.tenant || "-"}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-800">
                            <div
                              className="h-full rounded-full bg-sky-500 transition"
                              style={{ width: `${item.progress}%` }}
                            />
                          </div>
                          <span className="text-xs text-slate-600 dark:text-slate-300">{item.progress}%</span>
                        </div>
                        <span className={`mt-1 inline-flex items-center rounded-full px-2 py-1 text-[11px] font-semibold uppercase tracking-wide ${STATUS_VARIANTS[item.status] || STATUS_VARIANTS.queued}`}>
                          {item.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-800 dark:text-slate-100">
                        {item.startedAt ? new Date(item.startedAt).toLocaleTimeString() : "-"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-slate-500 dark:hover:bg-slate-700"
                          onClick={() => removeQueueItem(item.id)}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default ImportDataPage;
