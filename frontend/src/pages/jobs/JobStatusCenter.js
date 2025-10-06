import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, Col, Form, Row, Spinner, Table } from 'react-bootstrap';
import PortalUtilityBar from '../../components/PortalUtilityBar';
import { AuthContext } from '../../context/AuthContext';
import { useCommandPalette } from '../../context/CommandPaletteContext';
import { SAMPLE_JOBS, SAMPLE_JOB_LOGS, sampleDownload } from '../../utils/sampleData';
import '../../styles/jobCenter.css';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'running', label: 'Running' },
  { value: 'queued', label: 'Queued' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
];

const STATUS_COLORS = {
  running: 'info',
  queued: 'secondary',
  completed: 'success',
  failed: 'danger',
};

const JobStatusCenter = () => {
  const { tenant, availableTenants = [], recordAuditEvent } = useContext(AuthContext) || {};
  
  const navigate = useNavigate();
  const { registerCommands } = useCommandPalette();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [tenantFilter, setTenantFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRows, setSelectedRows] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [page, setPage] = useState(1);
  const pageSize = 6;

  const handleDownload = useCallback((jobId) => {
    sampleDownload(jobId);
    recordAuditEvent?.('job_center.download_logs', { jobId });
  }, [recordAuditEvent]);

  const handleRetry = useCallback((job) => {
    setJobs((prev) =>
      prev.map((item) =>
        item.id === job.id
          ? { ...item, status: 'queued', progress: 0, error: undefined }
          : item
      )
    );
    recordAuditEvent?.('job_center.retry_job', { jobId: job.id });
  }, [recordAuditEvent]);

  const toggleRow = useCallback((jobId) => {
    setSelectedRows((prev) =>
      prev.includes(jobId) ? prev.filter((id) => id !== jobId) : [...prev, jobId]
    );
  }, []);

  const bulkRetry = useCallback(() => {
    setJobs((prev) =>
      prev.map((job) =>
        selectedRows.includes(job.id)
          ? { ...job, status: 'queued', progress: 0, error: undefined }
          : job
      )
    );
    if (selectedRows.length) {
      recordAuditEvent?.('job_center.bulk_retry', { count: selectedRows.length });
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
    registerCommands([
      {
        id: 'job-center-filter-failed',
        label: 'Show failed jobs',
        category: 'Job Center',
        action: () => setStatusFilter('failed'),
      },
      {
        id: 'job-center-clear-filters',
        label: 'Clear job filters',
        category: 'Job Center',
        action: () => {
          setStatusFilter('');
          setTenantFilter('');
          setSearchTerm('');
        },
      },
      {
        id: 'job-center-import-data',
        label: 'Go to Import Data',
        category: 'Job Center',
        action: () => navigate('/jobs/import-data'),
      },
      selectedJobId
        ? {
            id: 'job-center-download-logs',
            label: 'Download logs for selected job',
            category: 'Job Center',
            action: () => handleDownload(selectedJobId),
          }
        : null,
    ].filter(Boolean));
    return () => registerCommands([]);
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

  const selectedJob = useMemo(
    () => jobs.find((job) => job.id === selectedJobId) || null,
    [jobs, selectedJobId]
  );

  const handleRefresh = useCallback(() => {
    setLoading(true);
    setTimeout(() => {
      setJobs((prev) =>
        prev.map((job) =>
          job.status === 'running'
            ? { ...job, progress: Math.min(job.progress + 8, 100), status: job.progress >= 92 ? 'completed' : job.status }
            : job
        )
      );
      setLoading(false);
      setLastUpdated(new Date());
      recordAuditEvent?.('job_center.refresh');
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

  return (
    <div className="sfdc-portal job-center">
      <PortalUtilityBar />
      <div className="job-center__header">
        <div>
          <h1>Job & Status Center</h1>
          <p className="text-muted">
            Track imports, model runs, and exports across tenants. Retry failures or download logs without leaving the page.
          </p>
        </div>
        <div className="job-center__actions">
          <Button variant="outline-primary" onClick={() => navigate('/jobs/import-data')}>
            Go to Import Data
          </Button>
          <Button variant="outline-secondary" onClick={handleRefresh} disabled={loading}>
            {loading ? <Spinner size="sm" animation="border" /> : 'Manual refresh'}
          </Button>
          <span className="job-center__timestamp">
            Last updated {lastUpdated ? lastUpdated.toLocaleTimeString() : '-'}
          </span>
        </div>
      </div>

      <div className="job-center__filters">
        <Row className="g-3 align-items-end">
          <Col md={4}>
            <Form.Label htmlFor="job-search">Search</Form.Label>
            <Form.Control
              id="job-search"
              placeholder="Job name, ID, or submitted by"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </Col>
          <Col md={3}>
            <Form.Label>Status</Form.Label>
            <Form.Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Form.Select>
          </Col>
          <Col md={3}>
            <Form.Label>Tenant</Form.Label>
            <Form.Select value={tenantFilter} onChange={(event) => setTenantFilter(event.target.value)}>
              <option value="">All tenants</option>
              {availableTenants.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.name}
                </option>
              ))}
            </Form.Select>
          </Col>
          <Col md={2} className="d-grid">
            <Button variant="outline-secondary" onClick={() => { setStatusFilter(''); setTenantFilter(''); setSearchTerm(''); }}>
              Clear filters
            </Button>
          </Col>
        </Row>
      </div>

      <div className="job-center__bulkbar">
        <Form.Check
          type="checkbox"
          id="bulk-select"
          label="Select page"
          checked={allVisibleSelected}
          onChange={toggleSelectAll}
        />
        <div className="job-center__bulk-actions">
          <Button
            size="sm"
            variant="outline-primary"
            disabled={!selectedRows.length}
            onClick={bulkRetry}
          >
            Retry selected
          </Button>
          <Button
            size="sm"
            variant="outline-secondary"
            disabled={!selectedRows.length}
            onClick={() => selectedRows.forEach(handleDownload)}
          >
            Download logs
          </Button>
        </div>
      </div>

      <div className="job-center__tablewrap">
        <Table striped hover responsive className="job-center__table">
          <thead>
            <tr>
              <th style={{ width: 36 }}>
                <Form.Check
                  type="checkbox"
                  aria-label="Select page"
                  checked={allVisibleSelected}
                  onChange={toggleSelectAll}
                />
              </th>
              <th>Job</th>
              <th>Status</th>
              <th>Progress</th>
              <th>Tenant</th>
              <th>Started</th>
              <th>Owner</th>
              <th style={{ width: 120 }} className="text-end">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr className="job-center__skeleton-row">
                <td colSpan={8} className="job-center__skeleton">Loading jobs…</td>
              </tr>
            )}
            {!loading && paginatedJobs.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center py-4">
                  <div className="job-center__empty">
                    <h3>No jobs match your filters</h3>
                    <p>Need data to explore? Load the sandbox tenant to view sample jobs.</p>
                    <Button variant="outline-primary" onClick={() => setTenantFilter(tenant || 'demo')}>
                      Show my tenant jobs
                    </Button>
                  </div>
                </td>
              </tr>
            )}
            {paginatedJobs.map((job) => (
              <tr
                key={job.id}
                className={job.id === selectedJobId ? 'job-center__row--active' : ''}
                onClick={() => setSelectedJobId(job.id)}
                onFocus={() => handleRowFocus(job)}
                tabIndex={0}
              >
                <td>
                  <Form.Check
                    type="checkbox"
                    checked={selectedRows.includes(job.id)}
                    onChange={(event) => {
                      event.stopPropagation();
                      toggleRow(job.id);
                    }}
                    aria-label={`Select job ${job.name}`}
                  />
                </td>
                <td>
                  <div className="fw-semibold">{job.name}</div>
                  <div className="text-muted small">{job.id}</div>
                </td>
                <td>
                  <Badge bg={STATUS_COLORS[job.status] || 'secondary'}>{job.status}</Badge>
                </td>
                <td>
                  <div className="job-center__progress">
                    <div style={{ width: `${job.progress}%` }} />
                  </div>
                  <span className="small text-muted">{job.progress}%</span>
                </td>
                <td>{job.tenant}</td>
                <td>{job.startedAt ? new Date(job.startedAt).toLocaleTimeString() : '—'}</td>
                <td>{job.initiatedBy}</td>
                <td className="text-end">
                  <div className="d-flex justify-content-end gap-2">
                    <Button size="sm" variant="outline-secondary" onClick={(event) => { event.stopPropagation(); handleDownload(job.id); }}>
                      Logs
                    </Button>
                    {job.status === 'failed' && (
                      <Button size="sm" variant="outline-danger" onClick={(event) => { event.stopPropagation(); handleRetry(job); }}>
                        Retry
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>

      <div className="job-center__pagination">
        <div>{filteredJobs.length} job(s)</div>
        <div className="job-center__pagination-controls">
          <Button size="sm" variant="outline-secondary" disabled={currentPage === 1} onClick={() => setPage((prev) => Math.max(1, prev - 1))}>
            Previous
          </Button>
          <span>Page {currentPage} / {totalPages}</span>
          <Button size="sm" variant="outline-secondary" disabled={currentPage === totalPages} onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}>
            Next
          </Button>
        </div>
      </div>

      <section className="job-center__detail" aria-live="polite">
        {selectedJob ? (
          <div className="job-center__detail-card">
            <header>
              <h2>{selectedJob.name}</h2>
              <Badge bg={STATUS_COLORS[selectedJob.status] || 'secondary'}>{selectedJob.status}</Badge>
            </header>
            <dl>
              <div>
                <dt>Job ID</dt>
                <dd>{selectedJob.id}</dd>
              </div>
              <div>
                <dt>Tenant</dt>
                <dd>{selectedJob.tenant}</dd>
              </div>
              <div>
                <dt>Submitted by</dt>
                <dd>{selectedJob.initiatedBy}</dd>
              </div>
              <div>
                <dt>Records</dt>
                <dd>
                  {selectedJob.recordsProcessed.toLocaleString()} processed
                  {typeof selectedJob.recordsFailed === 'number' && selectedJob.recordsFailed > 0 && (
                    <span className="text-danger ms-2">{selectedJob.recordsFailed} failed</span>
                  )}
                </dd>
              </div>
              <div>
                <dt>Last activity</dt>
                <dd>{selectedJob.finishedAt ? new Date(selectedJob.finishedAt).toLocaleTimeString() : 'In progress'}</dd>
              </div>
            </dl>
            {selectedJob.error && (
              <div className="job-center__alert">
                <strong>Error:</strong> {selectedJob.error}
              </div>
            )}
            <div className="job-center__detail-actions">
              <Button variant="outline-primary" onClick={() => handleDownload(selectedJob.id)}>
                Download detailed logs
              </Button>
              {selectedJob.status === 'failed' && (
                <Button variant="outline-danger" onClick={() => handleRetry(selectedJob)}>
                  Retry job
                </Button>
              )}
            </div>
            <div className="job-center__logs">
              <h3>Recent log lines</h3>
              <ul>
                {(SAMPLE_JOB_LOGS[selectedJob.id.split('-')[0]] || []).map((entry, idx) => (
                  <li key={idx}>
                    <span>{entry.ts}</span>
                    <span>{entry.line}</span>
                  </li>
                ))}
                {!SAMPLE_JOB_LOGS[selectedJob.id.split('-')[0]] && (
                  <li>No logs available for this synthetic job yet.</li>
                )}
              </ul>
            </div>
          </div>
        ) : (
          <div className="job-center__detail-empty">
            <h2>Select a job to view details</h2>
            <p>Jobs show progress, audit history, and downloadable logs. Use the command palette (?K) to jump to filters quickly.</p>
          </div>
        )}
      </section>
    </div>
  );
};

export default JobStatusCenter;










