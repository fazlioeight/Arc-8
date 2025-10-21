import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Spinner } from 'react-bootstrap';
import './DocumentViewer.css';

const DocumentViewer = ({
  documents = [],
  activeSnippet,
  onRequestDocument,
  onUploadDocument,
}) => {
  const [selectedId, setSelectedId] = useState(() => documents[0]?.id || null);
  const [viewerSrc, setViewerSrc] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [uploadError, setUploadError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const objectUrlRef = useRef(null);
  const fileInputRef = useRef(null);

  const disposeObjectUrl = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  const selectedDoc = useMemo(
    () => documents.find((doc) => doc.id === selectedId) || null,
    [documents, selectedId],
  );

  useEffect(() => {
    if (!documents.length) {
      setSelectedId(null);
      disposeObjectUrl();
      setViewerSrc(null);
      return;
    }
    if (!selectedId || !documents.some((doc) => doc.id === selectedId)) {
      setSelectedId(documents[0].id);
    }
  }, [documents, selectedId, disposeObjectUrl]);

  useEffect(() => {
    if (!activeSnippet) return;
    const matchById =
      documents.find((doc) => doc.id && doc.id === activeSnippet.document_id) || null;
    const matchByMeta =
      matchById ||
      documents.find((doc) => {
        if (!activeSnippet.source_type) return false;
        const sameType = doc.source_type === activeSnippet.source_type;
        if (activeSnippet.dos && doc.dos) {
          return sameType && doc.dos === activeSnippet.dos;
        }
        return sameType;
      });
    if (matchByMeta && matchByMeta.id !== selectedId) {
      setSelectedId(matchByMeta.id);
    }
  }, [activeSnippet, documents, selectedId]);

  const resolveDocumentSource = useCallback(
    async (doc) => {
      if (!doc) {
        throw new Error('Document not found.');
      }
      if (doc.file instanceof Blob) {
        return doc.file;
      }
      if (doc.blob instanceof Blob) {
        return doc.blob;
      }
      if (doc.viewer_url || doc.pdf_url || doc.url) {
        return doc.viewer_url || doc.pdf_url || doc.url;
      }
      if (doc.pdf_base64) {
        return `data:application/pdf;base64,${doc.pdf_base64}`;
      }
      if (typeof onRequestDocument === 'function') {
        const result = await onRequestDocument(doc);
        if (!result) {
          throw new Error('Document stream unavailable.');
        }
        if (typeof result === 'string') return result;
        if (result instanceof Blob) return result;
      }
      if (doc.preview) {
        const safePreview = escapeHtml(String(doc.preview));
        const html = `<html><head><meta charset="utf-8" /></head><body style="font-family: Arial, sans-serif; padding: 16px;"><h2 style="margin-top: 0;">${escapeHtml(
          formatDocTitle(doc),
        )}</h2><pre style="white-space: pre-wrap; font-family: inherit;">${safePreview}</pre></body></html>`;
        return new Blob([html], { type: 'text/html' });
      }
      throw new Error('No preview available for this document.');
    },
    [onRequestDocument],
  );

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      if (!selectedDoc) {
        disposeObjectUrl();
        setViewerSrc(null);
        setError(null);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const source = await resolveDocumentSource(selectedDoc);
        if (!isMounted) {
          return;
        }
        disposeObjectUrl();
        if (source instanceof Blob) {
          const blobUrl = URL.createObjectURL(source);
          objectUrlRef.current = blobUrl;
          setViewerSrc(blobUrl);
        } else {
          setViewerSrc(source);
        }
      } catch (err) {
        if (isMounted) {
          disposeObjectUrl();
          setViewerSrc(null);
          setError(err.message || 'Unable to load document.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      isMounted = false;
    };
  }, [selectedDoc, resolveDocumentSource, disposeObjectUrl]);

  useEffect(() => disposeObjectUrl, [disposeObjectUrl]);

  const uploadEnabled = typeof onUploadDocument === 'function';

  const handleFileUpload = useCallback(
    async (file) => {
      if (!uploadEnabled || !file) return;
      if (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf')) {
        setUploadError('Only PDF files can be uploaded.');
        return;
      }
      setUploadError(null);
      setUploading(true);
      try {
        const result = await onUploadDocument(file);
        if (result && typeof result === 'object' && result.id) {
          setSelectedId(result.id);
        } else if (typeof result === 'string') {
          setSelectedId(result);
        }
      } catch (err) {
        setUploadError(err.message || 'Unable to upload document.');
      } finally {
        setUploading(false);
      }
    },
    [onUploadDocument, uploadEnabled],
  );

  const handleFileInputChange = useCallback(
    (event) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (file) {
        void handleFileUpload(file);
      }
    },
    [handleFileUpload],
  );

  const handleDragOver = useCallback(
    (event) => {
      if (!uploadEnabled) return;
      event.preventDefault();
      event.stopPropagation();
      setIsDragging(true);
    },
    [uploadEnabled],
  );

  const handleDragLeave = useCallback(
    (event) => {
      if (!uploadEnabled) return;
      event.preventDefault();
      event.stopPropagation();
      setIsDragging(false);
    },
    [uploadEnabled],
  );

  const handleDrop = useCallback(
    (event) => {
      if (!uploadEnabled) return;
      event.preventDefault();
      event.stopPropagation();
      setIsDragging(false);
      const file = event.dataTransfer?.files?.[0];
      if (file) {
        void handleFileUpload(file);
      }
    },
    [handleFileUpload, uploadEnabled],
  );

  const triggerBrowse = useCallback(() => {
    if (!uploadEnabled) return;
    fileInputRef.current?.click();
  }, [uploadEnabled]);

  return (
    <div className="document-viewer">
      <div className="document-viewer__list">
        {uploadEnabled ? (
          <div
            className={`document-viewer__dropzone${isDragging ? ' is-dragging' : ''}${
              uploading ? ' is-uploading' : ''
            }`}
            onDragOver={handleDragOver}
            onDragEnter={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <input
              type="file"
              accept="application/pdf"
              ref={fileInputRef}
              onChange={handleFileInputChange}
              disabled={uploading}
              aria-label="Upload PDF document"
            />
            <div className="document-viewer__dropzone-body">
              <span className="document-viewer__dropzone-text">
                {uploading ? 'Uploading document…' : 'Drag and drop a PDF here'}
              </span>
              <button
                type="button"
                className="btn btn-outline-primary btn-sm document-viewer__upload-button"
                onClick={triggerBrowse}
                disabled={uploading}
              >
                {uploading ? (
                  <>
                    <Spinner animation="border" size="sm" /> Uploading
                  </>
                ) : (
                  'Browse files'
                )}
              </button>
            </div>
            {uploadError ? (
              <div className="document-viewer__upload-error">{uploadError}</div>
            ) : null}
          </div>
        ) : null}
        <div className="list-group list-group-flush document-viewer__list-group">
          {documents.map((doc) => {
            const isActive = doc.id === selectedId;
            return (
              <button
                key={doc.id}
                type="button"
                className={`list-group-item list-group-item-action document-viewer__item${
                  isActive ? ' active' : ''
                }`}
                onClick={() => setSelectedId(doc.id)}
              >
                <div className="document-viewer__item-title">{formatDocTitle(doc)}</div>
                <div className="document-viewer__item-meta">
                  {doc.dos || 'Unknown DOS'}
                  {doc.provider?.name ? ` • ${doc.provider.name}` : ''}
                </div>
              </button>
            );
          })}
          {!documents.length ? (
            <div className="document-viewer__empty text-muted">
              No documents have been attached for this encounter yet.
            </div>
          ) : null}
        </div>
      </div>

      <div className="document-viewer__preview">
        {selectedDoc ? (
          <>
            <div className="document-viewer__preview-header">
              <div>
                <div className="document-viewer__preview-title">{formatDocTitle(selectedDoc)}</div>
                {activeSnippet?.location?.page ? (
                  <div className="document-viewer__snippet-hint">
                    Focus snippet located on page {activeSnippet.location.page}
                  </div>
                ) : null}
              </div>
              {viewerSrc && !loading ? (
                <a
                  href={viewerSrc}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-outline-secondary btn-sm"
                >
                  Open in new tab
                </a>
              ) : null}
            </div>
            <div className="document-viewer__preview-body">
              {loading ? (
                <div className="document-viewer__loading">
                  <Spinner animation="border" role="status" size="sm" />
                  <span>Loading document…</span>
                </div>
              ) : viewerSrc ? (
                <iframe
                  title={`Document ${selectedDoc.id}`}
                  src={viewerSrc}
                  className="document-viewer__iframe"
                />
              ) : (
                <div className="document-viewer__empty text-muted">
                  Select a document to view the contents.
                </div>
              )}
            </div>
            {error ? (
              <div className="alert alert-warning document-viewer__error" role="alert">
                {error}
              </div>
            ) : null}
          </>
        ) : (
          <div className="document-viewer__empty text-muted">
            No documents available for this encounter.
          </div>
        )}
      </div>
    </div>
  );
};

function formatDocTitle(doc) {
  if (!doc) return 'Document';
  const label = doc.label || doc.name || doc.title || doc.source_type || 'Document';
  return label.replace(/_/g, ' ');
}

function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, (match) => {
    switch (match) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case "'":
        return '&#39;';
      case '"':
        return '&quot;';
      default:
        return match;
    }
  });
}

export default DocumentViewer;

