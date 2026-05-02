import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import PortalPageLayout from "../../../components/PortalPageLayout";
import PortalPageHeader from "../../../components/PortalPageHeader";
import PortalCard from "../../../components/PortalCard";
import PortalStat from "../../../components/PortalStat";
import { AuthContext } from "../../../context/AuthContext";
import { useCommandPalette } from "../../../context/CommandPaletteContext";
import { SAMPLE_JOBS, SAMPLE_JOB_LOGS, sampleDownload } from "../../../utils/sampleData";
import "../coding/member/memberWorkspace.css";

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "running", label: "Running" },
  { value: "queued", label: "Queued" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
];

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

const JobStatusCenter = () => {
  const { tenant, availableTenants = [], recordAuditEvent } = useContext(AuthContext) || {};
  const navigate = useNavigate();
  const { registerCommands } = useCommandPalette();

  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [tenantFilter, setTenantFilter] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRows, setSelectedRows] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [page, setPage] = useState(1);
  const pageSize = 6;

  const handleDownload = useCallback(
    (jobId) => {
      sampleDownload(jobId);
      recordAuditEvent?.("job_center.download_logs", { jobId });
    },
    [recordAuditEvent]
  );

  const handleRetry = useCallback(
    (job) => {
      setJobs((prev) =>
        prev.map((item) =>
          item.id === job.id ? { ...item, status: "queued", progress: 0, error: undefined } : item
        )
      );
      recordAuditEvent?.("job_center.retry_job", { jobId: job.id });
    },
    [recordAuditEvent]
  );

  const toggleRow = useCallback((jobId) => {
    setSelectedRows((prev) => (prev.includes(jobId) ? prev.filter((id) => id !== jobId) : [...prev, jobId]));
  }, []);

  const bulkRetry = useCallback(() => {
    setJobs((prev) =>
      prev.map((job) =>
        selectedRows.includes(job.id)
          ? { ...job, status: "queued", progress: 0, error: undefined }
          : job
      )
    );
    if (selectedRows.length) {
      recordAuditEvent?.("job_center.bulk_retry", { count: selectedRows.length });
    }
  }, [recordAuditEvent, selectedRows]);

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => {
      const expanded = Array.from({ length: 12 }, (_, idx) => {
        const base = SAMPLE_JOBS[idx % SAMPLE_JOBS.length];
        return {
          ...base,
          id: `${base.id}-${idx}`,
          name: idx === 0 ? base.name : `${base.name} (${idx})`,
        };
      });
      setJobs(expanded);
      setLoading(false);
      setLastUpdated(new Date());
    }, 400);
    return () => clearTimeout(timer);
  }, []);

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
      { id: JOB_CENTER_COMMAND_SCOPE }
    );
    return unregister;
  }, [registerCommands, selectedJobId, handleDownload, navigate]);

  const filteredJobs = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return jobs.filter((job) => {
      if (statusFilter && job.status !== statusFilter) return false;
      if (tenantFilter && job.tenant !== tenantFilter) return false;
      if (term) {
        const haystack = `${job.name} ${job.initiatedBy} ${job.id}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [jobs, statusFilter, tenantFilter, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredJobs.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedJobs = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredJobs.slice(start, start + pageSize);
  }, [filteredJobs, currentPage]);

  const selectedJob = useMemo(() => jobs.find((job) => job.id === selectedJobId) || null, [jobs, selectedJobId]);

  const handleRefresh = useCallback(() => {
    setLoading(true);
    setTimeout(() => {
      setJobs((prev) =>
        prev.map((job) =>
          job.status === "running"
            ? {
                ...job,
                progress: Math.min(job.progress + Math.floor(Math.random() * 18) + 12, 100),
                status: job.progress >= 92 ? "completed" : job.status,
              }
            : job
        )
      );
      setLoading(false);
      setLastUpdated(new Date());
      recordAuditEvent?.("job_center.refresh");
    }, 350);
  }, [recordAuditEvent]);

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
      backgroundClassName:
        "",
      maxWidthClassName: "max-w-6xl",
      paddingClassName: "px-4",
    }),
    []
  );

  const headerContent = (
    <PortalPageHeader
      eyebrow="Operations"
      title="Job & Status Center"
      subtitle="Track imports, model runs, and exports across tenants. Retry failures or download logs without leaving the page."
      actions={
        <div className="flex flex-wrap items-center gap-3">
          <PortalStat label="Jobs" value={totalCount} meta="Filtered" tone="info" />
          <PortalStat label="In flight" value={processingCount} meta="Running/queued" tone="warning" />
          <PortalStat label="Completed" value={completedCount} meta="Done" tone="success" />
          <PortalStat label="Failed" value={failedCount} meta="Attention" tone="danger" />
        </div>
      }
    />
  );

  const detailTone = useMemo(() => {
    if (!selectedJob) return "neutral";
    if (selectedJob.status === "failed") return "danger";
    if (selectedJob.status === "completed") return "success";
    return "info";
  }, [selectedJob]);

  return (
    <PortalPageLayout {...layoutProps} headerContent={headerContent}>
      <PortalCard
        title="Filters & shortcuts"
        subtitle="Narrow down jobs by status, tenant, or keyword."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button className="portal-ghost-button" onClick={() => navigate("/jobs/import-data")}>
              Go to Import Data
            </button>
            <button className="portal-ghost-button" onClick={handleRefresh} disabled={loading}>
              {loading ? "Refreshing..." : "Manual refresh"}
            </button>
          </div>
        }
      >
        <div className="portal-section-grid">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300" htmlFor="job-search">
              Search
            </label>
            <input
              id="job-search"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-inner outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-sky-400 dark:focus:ring-sky-500/40"
              placeholder="Job name, ID, or submitted by"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Status</label>
            <select
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-sky-400 dark:focus:ring-sky-500/40"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Tenant</label>
            <select
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-sky-400 dark:focus:ring-sky-500/40"
              value={tenantFilter}
              onChange={(event) => setTenantFilter(event.target.value)}
            >
              <option value="">All tenants</option>
              {availableTenants.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              <button
                className="portal-ghost-button"
                onClick={() => {
                  setStatusFilter("");
                  setTenantFilter("");
                  setSearchTerm("");
                }}
              >
                Clear filters
              </button>
              <span className="portal-pill portal-pill--ghost">{filteredJobs.length} job(s) visible</span>
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Last updated {lastUpdated ? lastUpdated.toLocaleTimeString() : "-"}
            </span>
          </div>
        </div>
      </PortalCard>

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
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Tenant</th>
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
                          Need data to explore? Load the sandbox tenant to view sample jobs.
                        </p>
                        <button
                          className="portal-ghost-button"
                          onClick={() => setTenantFilter(tenant || "prominencehealth")}
                        >
                          Show my tenant jobs
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
                    <td className="px-4 py-3 text-sm text-slate-800 dark:text-slate-100">{job.tenant}</td>
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
                        {job.status === "failed" && (
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
                <span className="portal-pill portal-pill--ghost">{selectedJob.tenant}</span>
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
                  {selectedJob.recordsProcessed.toLocaleString()} processed
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
              {selectedJob.status === "failed" && (
                <button className="portal-ghost-button" onClick={() => handleRetry(selectedJob)}>
                  Retry job
                </button>
              )}
            </div>
            <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800 shadow-inner dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Recent log lines</h3>
              <ul className="space-y-1">
                {(SAMPLE_JOB_LOGS[selectedJob.id.split("-")[0]] || []).map((entry, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-xs">
                    <span className="text-slate-500 dark:text-slate-300">{entry.ts}</span>
                    <span>{entry.line}</span>
                  </li>
                ))}
                {!SAMPLE_JOB_LOGS[selectedJob.id.split("-")[0]] && (
                  <li className="text-xs text-slate-500 dark:text-slate-300">No logs available for this synthetic job yet.</li>
                )}
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
