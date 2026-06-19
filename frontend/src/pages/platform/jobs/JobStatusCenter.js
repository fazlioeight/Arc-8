import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import PortalPageLayout from "../../../components/PortalPageLayout";
import PortalCard from "../../../components/PortalCard";
import KpiTile from "../../../components/ui/KpiTile";
import SearchInput from "../../../components/ui/SearchInput";
import { AuthContext } from "../../../context/AuthContext";
import { useCommandPalette } from "../../../context/CommandPaletteContext";
import {
  downloadImportJobLogs,
  fetchImportJob,
  fetchImportJobs,
  retryImportJob,
} from "../../../services/importsService";
import "../../../styles/memberWorkspace.css";

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "running", label: "Running" },
  { value: "queued", label: "Queued" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
];

const REFRESH_MS = 4000;

const badgeTone = (status) => {
  switch (status) {
    case "failed":
      return "bg-rose-100 text-rose-700 ring-1 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-100 dark:ring-rose-500/30";
    case "completed":
      return "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-100 dark:ring-emerald-500/30";
    case "running":
      return "bg-sky-100 text-sky-700 ring-1 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-100 dark:ring-sky-500/30";
    case "queued":
      return "bg-amber-100 text-amber-800 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-100 dark:ring-amber-500/30";
    default:
      return "bg-slate-100 text-slate-700 ring-1 ring-slate-200 dark:bg-slate-700/40 dark:text-slate-100 dark:ring-slate-600/50";
  }
};

const JOB_CENTER_COMMAND_SCOPE = "job-center-commands";

const normaliseJob = (row) => ({
  id: row.id,
  name: row.name || row.file_name || row.entity || row.id,
  status: row.status,
  progress: row.progress ?? 0,
  startedAt: row.started_at,
  finishedAt: row.completed_at,
  initiatedBy: row.initiated_by || "system",
  recordsProcessed: row.records_processed ?? 0,
  recordsFailed: row.records_failed ?? 0,
  error: row.error,
  sourceType: row.source_type,
  entity: row.entity,
  fileName: row.file_name,
});

const JobStatusCenter = () => {
  const { token, tenant, recordAuditEvent } = useContext(AuthContext) || {};
  const navigate = useNavigate();
  const { registerCommands } = useCommandPalette();

  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [selectedJobDetail, setSelectedJobDetail] = useState(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRows, setSelectedRows] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState(null);
  const pageSize = 6;

  const loadJobs = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) setLoading(true);
      try {
        const data = await fetchImportJobs(token, tenant, {
          status: statusFilter || undefined,
          search: searchTerm || undefined,
          limit: 200,
        });
        const rows = (data.items || []).map(normaliseJob);
        setJobs(rows);
        setError(null);
      } catch (err) {
        setError(err.message || "Unable to load jobs");
        if (!silent) setJobs([]);
      } finally {
        setLoading(false);
        setLastUpdated(new Date());
      }
    },
    [token, tenant, statusFilter, searchTerm],
  );

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  // Background refresh when something is in flight
  useEffect(() => {
    const hasInFlight = jobs.some((j) => j.status === "running" || j.status === "queued");
    if (!hasInFlight) return undefined;
    const timer = window.setInterval(() => loadJobs({ silent: true }), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [jobs, loadJobs]);

  // Load job detail when selection changes
  useEffect(() => {
    if (!selectedJobId) {
      setSelectedJobDetail(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const detail = await fetchImportJob(token, tenant, selectedJobId);
        if (!cancelled) setSelectedJobDetail(detail);
      } catch (err) {
        if (!cancelled) setSelectedJobDetail({ error: err.message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedJobId, token, tenant, jobs]);

  const handleDownload = useCallback(
    async (jobId) => {
      try {
        await downloadImportJobLogs(token, tenant, jobId);
        recordAuditEvent?.("job_center.download_logs", { jobId });
      } catch (err) {
        setError(err.message || "Unable to download logs");
      }
    },
    [token, tenant, recordAuditEvent],
  );

  const handleRetry = useCallback(
    async (job) => {
      try {
        await retryImportJob(token, tenant, job.id);
        recordAuditEvent?.("job_center.retry_job", { jobId: job.id });
        await loadJobs({ silent: true });
      } catch (err) {
        setError(err.message || "Unable to retry job");
      }
    },
    [token, tenant, recordAuditEvent, loadJobs],
  );

  const toggleRow = useCallback((jobId) => {
    setSelectedRows((prev) => (prev.includes(jobId) ? prev.filter((id) => id !== jobId) : [...prev, jobId]));
  }, []);

  const bulkRetry = useCallback(async () => {
    for (const jobId of selectedRows) {
      try {
        await retryImportJob(token, tenant, jobId);
      } catch (err) {
        /* ignore individual failures; surfaced via reload */
      }
    }
    if (selectedRows.length) recordAuditEvent?.("job_center.bulk_retry", { count: selectedRows.length });
    setSelectedRows([]);
    await loadJobs({ silent: true });
  }, [selectedRows, token, tenant, recordAuditEvent, loadJobs]);

  useEffect(() => {
    const unregister = registerCommands(
      [
        {
          id: "job-center-filter-failed",
          label: "Show failed jobs",
          category: "Job Center",
          action: () => setStatusFilter("failed"),
        },
        {
          id: "job-center-clear-filters",
          label: "Clear job filters",
          category: "Job Center",
          action: () => {
            setStatusFilter("");
            setTenantFilter("");
            setSearchTerm("");
          },
        },
        {
          id: "job-center-import-data",
          label: "Go to Import Data",
          category: "Job Center",
          action: () => navigate("/jobs/import-data"),
        },
        selectedJobId
          ? {
              id: "job-center-download-logs",
              label: "Download logs for selected job",
              category: "Job Center",
              action: () => handleDownload(selectedJobId),
            }
          : null,
      ].filter(Boolean),
      { id: JOB_CENTER_COMMAND_SCOPE },
    );
    return unregister;
  }, [registerCommands, selectedJobId, handleDownload, navigate]);

  const filteredJobs = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return jobs.filter((job) => {
      if (statusFilter && job.status !== statusFilter) return false;
      if (term) {
        const haystack = `${job.name} ${job.initiatedBy} ${job.id}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [jobs, statusFilter, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredJobs.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedJobs = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredJobs.slice(start, start + pageSize);
  }, [filteredJobs, currentPage]);

  const selectedJob = useMemo(() => jobs.find((job) => job.id === selectedJobId) || null, [jobs, selectedJobId]);

  const handleRefresh = useCallback(() => {
    recordAuditEvent?.("job_center.refresh");
    loadJobs();
  }, [recordAuditEvent, loadJobs]);

  const allVisibleSelected = paginatedJobs.length > 0 && paginatedJobs.every((job) => selectedRows.includes(job.id));

  const toggleSelectAll = useCallback(() => {
    setSelectedRows((prev) => {
      if (allVisibleSelected) {
        return prev.filter((id) => !paginatedJobs.some((job) => job.id === id));
      }
      return Array.from(new Set([...prev, ...paginatedJobs.map((job) => job.id)]));
    });
  }, [allVisibleSelected, paginatedJobs]);

  const handleRowFocus = useCallback((job) => {
    setSelectedJobId(job.id);
  }, []);

  const totalCount = filteredJobs.length;
  const processingCount = filteredJobs.filter((job) => job.status === "running" || job.status === "queued").length;
  const completedCount = filteredJobs.filter((job) => job.status === "completed").length;
  const failedCount = filteredJobs.filter((job) => job.status === "failed").length;

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
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] coding-text-muted">Operations</p>
      <h1 className="text-3xl font-semibold coding-text-strong">Job &amp; Status Center</h1>
      <p className="text-sm coding-text-soft">Track imports, model runs, and exports. Retry failures or download logs without leaving the page.</p>
    </div>
  );

  const kpiStrip = (
    <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <KpiTile label="Jobs" value={totalCount} hint="Filtered" />
      <KpiTile label="In flight" value={processingCount} tone="warning" hint="Running/queued" />
      <KpiTile label="Completed" value={completedCount} tone="success" hint="Done" />
      <KpiTile label="Failed" value={failedCount} tone="critical" hint="Attention" />
    </section>
  );

  const detailTone = useMemo(() => {
    if (!selectedJob) return "neutral";
    if (selectedJob.status === "failed") return "danger";
    if (selectedJob.status === "completed") return "success";
    return "info";
  }, [selectedJob]);

  const detailLogs = selectedJobDetail?.logs || [];

  return (
    <PortalPageLayout {...layoutProps} headerContent={headerContent}>
      {kpiStrip}

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100">
          {error}
        </div>
      )}

      <section className="coding-surface rounded-2xl shadow-sm">
        <div className="p-3 flex flex-col lg:flex-row gap-2 lg:items-center">
          <SearchInput
            placeholder="Search job name, ID, or submitted by"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="coding-input rounded-md px-3 py-2 text-sm lg:w-44"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
        <div className="border-t coding-border px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { setStatusFilter(""); setSearchTerm(""); }}
              className="text-[var(--brand-primary)] font-medium hover:underline"
            >
              Clear filters
            </button>
            <span className="coding-text-muted">·</span>
            <span className="coding-text-soft">{filteredJobs.length} visible</span>
            {lastUpdated && (
              <>
                <span className="coding-text-muted">·</span>
                <span className="coding-text-soft">Updated {lastUpdated.toLocaleTimeString()}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => navigate("/jobs/import-data")}
              className="rounded-md ring-1 coding-border coding-text-strong bg-transparent hover:bg-[var(--coding-hover)] px-2.5 py-1.5 text-xs font-semibold"
            >
              Go to Import Data
            </button>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={loading}
              className="rounded-md bg-[var(--brand-primary)] text-white px-2.5 py-1.5 text-xs font-semibold hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>
      </section>

      <PortalCard
        title="Job feed"
        subtitle="Select a row to preview logs, ownership, and retry options."
        actions={<span className="portal-pill">{selectedRows.length} selected</span>}
        footer={
          <div className="flex w-full items-center justify-between gap-3 text-sm text-slate-700 dark:text-slate-300">
            <div>{filteredJobs.length} job(s)</div>
            <div className="flex items-center gap-2">
              <button
                className="portal-ghost-button"
                disabled={currentPage === 1}
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              >
                Previous
              </button>
              <span>
                Page {currentPage} / {totalPages}
              </span>
              <button
                className="portal-ghost-button"
                disabled={currentPage === totalPages}
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              >
                Next
              </button>
            </div>
          </div>
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:checked:bg-slate-100"
              checked={allVisibleSelected}
              onChange={toggleSelectAll}
            />
            Select page
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="portal-ghost-button"
              disabled={!selectedRows.length}
              onClick={bulkRetry}
            >
              Retry selected
            </button>
            <button
              className="portal-ghost-button"
              disabled={!selectedRows.length}
              onClick={() => selectedRows.forEach(handleDownload)}
            >
              Download logs
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  <th className="w-10 px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:checked:bg-slate-100"
                      aria-label="Select page"
                      checked={allVisibleSelected}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Job</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Progress</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Source</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Started</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Owner</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {loading && (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-300">
                      Loading jobs...
                    </td>
                  </tr>
                )}
                {!loading && paginatedJobs.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 text-center">
                      <div className="space-y-2">
                        <h3 className="text-base font-semibold">No jobs match your filters</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-300">
                          Queue an import from the Import Data page to see it appear here.
                        </p>
                        <button
                          className="portal-ghost-button"
                          onClick={() => navigate("/jobs/import-data")}
                        >
                          Go to Import Data
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
                {paginatedJobs.map((job) => (
                  <tr
                    key={job.id}
                    className={`cursor-pointer transition hover:bg-slate-50 dark:hover:bg-slate-800/60 ${
                      job.id === selectedJobId ? "bg-sky-50 dark:bg-slate-800/80" : ""
                    }`}
                    onClick={() => setSelectedJobId(job.id)}
                    onFocus={() => handleRowFocus(job)}
                    tabIndex={0}
                  >
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:checked:bg-slate-100"
                        checked={selectedRows.includes(job.id)}
                        onChange={(event) => {
                          event.stopPropagation();
                          toggleRow(job.id);
                        }}
                        aria-label={`Select job ${job.name}`}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{job.name}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-300">{job.id}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold capitalize ${badgeTone(job.status)}`}>
                        {job.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-800">
                          <div className="h-full rounded-full bg-sky-500 transition" style={{ width: `${job.progress}%` }} />
                        </div>
                        <span className="text-xs text-slate-600 dark:text-slate-300">{job.progress}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-800 dark:text-slate-100">{job.sourceType || "-"}</td>
                    <td className="px-4 py-3 text-sm text-slate-800 dark:text-slate-100">
                      {job.startedAt ? new Date(job.startedAt).toLocaleTimeString() : "-"}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-800 dark:text-slate-100">{job.initiatedBy}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          className="portal-ghost-button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleDownload(job.id);
                          }}
                        >
                          Logs
                        </button>
                        {(job.status === "failed" || job.status === "completed") && (
                          <button
                            className="portal-ghost-button"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleRetry(job);
                            }}
                          >
                            Retry
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </PortalCard>

      <PortalCard
        tone={detailTone}
        title={selectedJob ? selectedJob.name : "Job details"}
        subtitle={selectedJob ? selectedJob.id : "Select a job to view logs and retry options."}
      >
        {selectedJob ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                <span className="portal-pill portal-pill--solid">{selectedJob.status}</span>
                {selectedJob.sourceType && <span className="portal-pill portal-pill--ghost">{selectedJob.sourceType}</span>}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-300">
                Last activity {selectedJob.finishedAt ? new Date(selectedJob.finishedAt).toLocaleTimeString() : "In progress"}
              </div>
            </div>
            <dl className="grid gap-4 text-sm text-slate-800 dark:text-slate-100 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">Job ID</dt>
                <dd>{selectedJob.id}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">Submitted by</dt>
                <dd>{selectedJob.initiatedBy}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">Records</dt>
                <dd>
                  {(selectedJob.recordsProcessed || 0).toLocaleString()} processed
                  {typeof selectedJob.recordsFailed === "number" && selectedJob.recordsFailed > 0 && (
                    <span className="ml-2 text-rose-600 dark:text-rose-300">{selectedJob.recordsFailed} failed</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">Progress</dt>
                <dd className="flex items-center gap-2">
                  <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-800">
                    <div className="h-full rounded-full bg-sky-500 transition" style={{ width: `${selectedJob.progress}%` }} />
                  </div>
                  <span className="text-xs text-slate-600 dark:text-slate-300">{selectedJob.progress}%</span>
                </dd>
              </div>
            </dl>
            {selectedJob.error && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-500/50 dark:bg-rose-500/10 dark:text-rose-100">
                <strong>Error:</strong> {selectedJob.error}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <button className="portal-ghost-button" onClick={() => handleDownload(selectedJob.id)}>
                Download detailed logs
              </button>
              {(selectedJob.status === "failed" || selectedJob.status === "completed") && (
                <button className="portal-ghost-button" onClick={() => handleRetry(selectedJob)}>
                  Retry job
                </button>
              )}
            </div>
            <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800 shadow-inner dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Recent log lines</h3>
              <ul className="space-y-1">
                {detailLogs.length === 0 && (
                  <li className="text-xs text-slate-500 dark:text-slate-300">
                    {selectedJobDetail?.error ? selectedJobDetail.error : "No log lines yet."}
                  </li>
                )}
                {detailLogs.map((entry) => (
                  <li key={entry.id} className="flex items-start gap-2 text-xs">
                    <span className="text-slate-500 dark:text-slate-300">
                      {entry.created_at ? new Date(entry.created_at).toLocaleTimeString() : ""}
                    </span>
                    <span className="text-slate-400 dark:text-slate-500 uppercase">{entry.level}</span>
                    <span>{entry.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-5 text-center text-sm text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Select a job to view details</h2>
            <p className="mt-2">
              Jobs show progress, audit history, and downloadable logs. Use the command palette (?K) to jump to filters quickly.
            </p>
          </div>
        )}
      </PortalCard>
    </PortalPageLayout>
  );
};

export default JobStatusCenter;
