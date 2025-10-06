import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Badge, Button, ProgressBar, Table } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import PortalUtilityBar from '../../components/PortalUtilityBar';
import { AuthContext } from '../../context/AuthContext';
import { useCommandPalette } from '../../context/CommandPaletteContext';
import '../../styles/importData.css';

const IMPORT_ENTITIES = [
  { key: 'members', label: 'Members', description: 'Member demographics, eligibility, and attribution data.' },
  { key: 'providers', label: 'Providers', description: 'Provider rosters, contract attributes, and specialties.' },
  { key: 'claims', label: 'Claims', description: '837/835 extracts, adjudication summaries, or capitation equivalents.' },
  { key: 'mao004', label: 'MAO-004', description: 'Risk adjustment submissions and CMS response files.' },
  { key: 'charts', label: 'Charts', description: 'Chart extraction manifests and chart meta-data indexes.' },
];

const ACCEPTED_EXTENSIONS = ['txt', 'csv', 'xlsx'];
const ACCEPT_ATTR = '.txt,.csv,.xlsx';
const STATUS_VARIANTS = {
  queued: 'secondary',
  processing: 'info',
  completed: 'success',
  failed: 'danger',
};

const formatBytes = (size) => {
  if (!size && size !== 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = size;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  const precision = value < 10 ? 1 : 0;
  return `${value.toFixed(precision)} ${units[idx]}`;
};

const getExtension = (fileName = '') => fileName.split('.').pop()?.toLowerCase() || '';

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
    recordAuditEvent?.('import_data.visit', { tenant });
    return () => {
      timersRef.current.forEach((id) => window.clearTimeout(id));
      timersRef.current = [];
    };
  }, [recordAuditEvent, tenant]);

  const summary = useMemo(() => {
    const total = queue.length;
    const completed = queue.filter((item) => item.status === 'completed').length;
    const processing = queue.filter((item) => item.status === 'processing').length;
    const failed = queue.filter((item) => item.status === 'failed').length;
    const latest = queue.find((item) => item.status === 'completed');
    return { total, completed, processing, failed, latest };
  }, [queue]);

  const readPreview = useCallback((entityKey, file) => {
    if (!file) {
      setPreviews((prev) => ({ ...prev, [entityKey]: '' }));
      return;
    }
    const ext = getExtension(file.name);
    if (ext === 'xlsx') {
      setPreviews((prev) => ({ ...prev, [entityKey]: 'Preview not available for spreadsheet files.' }));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const content = typeof reader.result === 'string' ? reader.result : '';
      const snippet = content.slice(0, 900);
      setPreviews((prev) => ({ ...prev, [entityKey]: snippet || 'File is empty.' }));
    };
    reader.onerror = () => {
      setPreviews((prev) => ({ ...prev, [entityKey]: 'Unable to read file preview.' }));
    };
    reader.readAsText(file);
  }, []);

  const resetSelection = useCallback((entityKey) => {
    setSelectedFiles((prev) => ({ ...prev, [entityKey]: null }));
    setPreviews((prev) => ({ ...prev, [entityKey]: '' }));
    setErrors((prev) => ({ ...prev, [entityKey]: '' }));
  }, []);

  const acceptFile = useCallback((entityKey, file) => {
    if (!file) return;
    const extension = getExtension(file.name);
    if (!ACCEPTED_EXTENSIONS.includes(extension)) {
      setErrors((prev) => ({ ...prev, [entityKey]: 'Unsupported file type. Please upload .txt, .csv, or .xlsx files.' }));
      setSelectedFiles((prev) => ({ ...prev, [entityKey]: null }));
      setPreviews((prev) => ({ ...prev, [entityKey]: '' }));
      return;
    }
    if (file.size === 0) {
      setErrors((prev) => ({ ...prev, [entityKey]: 'This file appears to be empty.' }));
      setSelectedFiles((prev) => ({ ...prev, [entityKey]: null }));
      setPreviews((prev) => ({ ...prev, [entityKey]: '' }));
      return;
    }
    setErrors((prev) => ({ ...prev, [entityKey]: '' }));
    setSelectedFiles((prev) => ({ ...prev, [entityKey]: file }));
    readPreview(entityKey, file);
  }, [readPreview]);

  const handleFileInput = useCallback((entityKey, event) => {
    const file = event.target.files?.[0];
    acceptFile(entityKey, file);
    event.target.value = '';
  }, [acceptFile]);

  const handleDrop = useCallback((entityKey, event) => {
    event.preventDefault();
    event.stopPropagation();
    setDropTarget(null);
    const file = event.dataTransfer?.files?.[0];
    acceptFile(entityKey, file);
  }, [acceptFile]);

  const simulateUpload = useCallback((uploadId, metadata) => {
    const step = () => {
      let shouldContinue = false;
      setQueue((prev) => prev.map((item) => {
        if (item.id !== uploadId) return item;
        const nextProgress = Math.min(100, item.progress + Math.floor(Math.random() * 18) + 12);
        const isDone = nextProgress >= 100;
        if (isDone) {
          recordAuditEvent?.('import_data.completed', {
            entity: item.entityKey,
            fileName: item.fileName,
            tenant: metadata.tenant,
          });
          return {
            ...item,
            progress: 100,
            status: 'completed',
            completedAt: new Date().toISOString(),
          };
        }
        shouldContinue = true;
        return {
          ...item,
          progress: nextProgress,
          status: 'processing',
        };
      }));
      if (shouldContinue) {
        const timer = window.setTimeout(step, 450);
        timersRef.current.push(timer);
      }
    };
    const timer = window.setTimeout(step, 500);
    timersRef.current.push(timer);
  }, [recordAuditEvent]);

  const startImport = useCallback((entityKey) => {
    const file = selectedFiles[entityKey];
    if (!file) {
      setErrors((prev) => ({ ...prev, [entityKey]: 'Select a file before importing.' }));
      return;
    }
    const extension = getExtension(file.name);
    if (!ACCEPTED_EXTENSIONS.includes(extension)) {
      setErrors((prev) => ({ ...prev, [entityKey]: 'Unsupported file type.' }));
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
      status: 'processing',
      progress: 12,
      tenant: tenant || 'tenant-demo',
      startedAt: new Date().toISOString(),
    };
    recordAuditEvent?.('import_data.started', {
      entity: entityKey,
      fileName: file.name,
      size: file.size,
      tenant,
    });
    setQueue((prev) => [upload, ...prev]);
    resetSelection(entityKey);
    simulateUpload(uploadId, { tenant });
  }, [recordAuditEvent, resetSelection, selectedFiles, simulateUpload, tenant]);

  const removeQueueItem = useCallback((uploadId) => {
    setQueue((prev) => prev.filter((item) => item.id !== uploadId));
  }, []);

  const clearCompleted = useCallback(() => {
    setQueue((prev) => prev.filter((item) => item.status !== 'completed'));
  }, []);

  useEffect(() => {
    registerCommands([
      {
        id: 'import-data-open-status',
        label: 'Open Job Status Center',
        category: 'Imports',
        action: () => navigate('/jobs/status-center'),
      },
      queue.some((item) => item.status === 'completed')
        ? {
            id: 'import-data-clear-complete',
            label: 'Clear completed imports',
            category: 'Imports',
            action: clearCompleted,
          }
        : null,
    ].filter(Boolean));
    return () => registerCommands([]);
  }, [clearCompleted, navigate, queue, registerCommands]);

  return (
    <div className="sfdc-portal import-data" role="main">
      <PortalUtilityBar />
      <section className="import-data__header">
        <div>
          <h1>Import Data</h1>
          <p className="text-muted mb-0">
            Load members, providers, claims, MAO-004 submissions, or chart manifests using .txt, .csv, or .xlsx files.
            Imports run through the Job & Status Center once queued.
          </p>
        </div>
        <div className="d-flex flex-column gap-2 align-items-end">
          <Button variant="outline-primary" onClick={() => navigate('/jobs/status-center')}>
            View Job Status Center
          </Button>
          <small className="text-muted">
            Current tenant: {tenant || 'demo'}
          </small>
        </div>
      </section>

      <section className="import-data__grid" aria-label="Import targets">
        {IMPORT_ENTITIES.map((entity) => {
          const file = selectedFiles[entity.key];
          const preview = previews[entity.key];
          const error = errors[entity.key];
          const dropActive = dropTarget === entity.key;

          return (
            <div key={entity.key} className="import-data__card">
              <header>
                <div className="d-flex align-items-center justify-content-between gap-2">
                  <div>
                    <h2 className="h5 mb-1">{entity.label}</h2>
                    <p className="text-muted small mb-0">{entity.description}</p>
                  </div>
                  <Badge bg={file ? 'primary' : 'secondary'}>{file ? 'Ready' : 'Idle'}</Badge>
                </div>
              </header>

              <div
                className={`import-data__dropzone${dropActive ? ' is-active' : ''}`}
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
                <label htmlFor={`file-input-${entity.key}`} className="d-block">
                  <strong>Drop a file</strong> or <span className="text-primary">browse</span>
                  <input
                    id={`file-input-${entity.key}`}
                    type="file"
                    accept={ACCEPT_ATTR}
                    onChange={(event) => handleFileInput(entity.key, event)}
                  />
                </label>
                <div className="text-muted small mt-2">Accepts .txt, .csv, .xlsx • Max preview 900 chars</div>
              </div>

              <div className={`import-data__preview${preview ? '' : ' is-empty'}`}>
                {preview || 'No preview yet. Upload a file to inspect the first lines.'}
              </div>

              <div>
                <div className="d-flex justify-content-between small text-muted">
                  <span>Selected file</span>
                  <span>{file ? formatBytes(file.size) : '-'}</span>
                </div>
                <div className="fw-semibold">{file ? file.name : 'Nothing selected'}</div>
              </div>

              {error && <Alert variant="danger" className="mb-0">{error}</Alert>}

              <div className="import-data__actions">
                <div className="d-flex gap-2">
                  <Button variant="primary" disabled={!file} onClick={() => startImport(entity.key)}>
                    Queue import
                  </Button>
                  <Button variant="outline-secondary" disabled={!file && !previews[entity.key]} onClick={() => resetSelection(entity.key)}>
                    Clear
                  </Button>
                </div>
                <small>Latest runs appear in the Job Status Center.</small>
              </div>
            </div>
          );
        })}
      </section>

      <section className="import-data__queue" aria-label="Import activity">
        <header className="d-flex flex-column gap-2 mb-3">
          <div className="import-data__summary">
            <div>
              <strong>{summary.total}</strong>
              <span className="text-muted">Total queued</span>
            </div>
            <div>
              <strong>{summary.processing}</strong>
              <span className="text-muted">Processing</span>
            </div>
            <div>
              <strong>{summary.completed}</strong>
              <span className="text-muted">Completed</span>
            </div>
            <div>
              <strong>{summary.failed}</strong>
              <span className="text-muted">Failed</span>
            </div>
            <div>
              <span className="text-muted small">Last completed</span>
              <span>{summary.latest ? `${summary.latest.entityLabel} - ${summary.latest.fileName}` : '—'}</span>
            </div>
          </div>
          <div className="d-flex justify-content-between align-items-center">
            <h2 className="h5 mb-0">Import activity</h2>
            <div className="d-flex gap-2">
              <Button variant="outline-secondary" size="sm" disabled={!queue.some((item) => item.status === 'completed')} onClick={clearCompleted}>
                Clear completed
              </Button>
              <Button variant="outline-primary" size="sm" onClick={() => navigate('/jobs/status-center')}>
                Open status center
              </Button>
            </div>
          </div>
        </header>

        {queue.length === 0 ? (
          <div className="import-data__queue-table import-data__empty">
            <strong>No imports yet</strong>
            <span>Queue a file above to kick off a background job.</span>
          </div>
        ) : (
          <div className="import-data__queue-table">
            <Table responsive borderless hover mb-0>
              <thead>
                <tr>
                  <th scope="col">Dataset</th>
                  <th scope="col">File</th>
                  <th scope="col">Size</th>
                  <th scope="col">Tenant</th>
                  <th scope="col" style={{ minWidth: 180 }}>Progress</th>
                  <th scope="col">Queued at</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {queue.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div className="fw-semibold">{item.entityLabel}</div>
                      <div className="small text-muted text-uppercase">{item.extension}</div>
                    </td>
                    <td>{item.fileName}</td>
                    <td>{formatBytes(item.size)}</td>
                    <td>{item.tenant || '—'}</td>
                    <td style={{ minWidth: 180 }}>
                      <div className="d-flex align-items-center gap-2">
                        <ProgressBar now={item.progress} visuallyHidden max={100} className="flex-grow-1" />
                        <span className="small text-muted">{`${item.progress}%`}</span>
                      </div>
                      <div>
                        <Badge bg={STATUS_VARIANTS[item.status] || 'secondary'} className="mt-1">
                          {item.status}
                        </Badge>
                      </div>
                    </td>
                    <td>{item.startedAt ? new Date(item.startedAt).toLocaleTimeString() : '-'}</td>
                    <td className="text-end">
                      <Button variant="link" size="sm" className="p-0" onClick={() => removeQueueItem(item.id)}>
                        Remove
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
};

export default ImportDataPage;

