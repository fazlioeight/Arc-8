import React, { useContext, useEffect, useRef, useState } from "react";
import { AuthContext } from "../../../../context/AuthContext";
import {
  downloadMember360Document,
  uploadMember360Document,
} from "../../../../services/member360LabService";
import { ChartTabHeader, ChartTable } from "./chartPrimitives";

const DOCUMENT_COLUMNS = [
  { label: "Uploaded", accessor: "uploaded_at" },
  { label: "Type", accessor: "document_type" },
  { label: "File", accessor: "file_name" },
  { label: "Size", accessor: "size_display" },
  { label: "Uploaded by", accessor: "uploaded_by" },
  { label: "Status", accessor: "status" },
];

const formatDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString();
};

const formatSize = (bytes) => {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const triggerBlobDownload = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "document";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

// Decide which renderer to use based on the document's content type. We
// only natively preview formats every browser can show without a plugin —
// PDF + image + plain text + JSON + HTML (sandboxed). Anything else falls
// through to a "download to view" hint so we never embed an arbitrary
// binary into the DOM.
const previewKindFor = (contentType) => {
  if (!contentType) return "unsupported";
  const ct = contentType.toLowerCase();
  if (ct === "application/pdf") return "pdf";
  if (ct.startsWith("image/")) return "image";
  if (ct === "application/json") return "text";
  if (ct === "text/html") return "html";
  if (ct.startsWith("text/")) return "text";
  return "unsupported";
};

export default function DocumentsPage({ detail, memberId, onUploaded }) {
  const { token, tenant } = useContext(AuthContext) || {};
  const fileInputRef = useRef(null);
  const [docType, setDocType] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [previewDoc, setPreviewDoc] = useState(null);

  const resolvedMemberId = memberId ?? detail?.member?.id;

  const handleUpload = async (event) => {
    setError(null);
    const file = event.target.files?.[0];
    if (!file || !resolvedMemberId) return;
    setUploading(true);
    try {
      await uploadMember360Document(token, tenant, resolvedMemberId, file, {
        documentType: docType || undefined,
      });
      onUploaded?.();
    } catch (err) {
      setError(err.message || "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const isPreviewable = (d) => d?.storage_path || d?.storage_backend;

  const rows = (detail?.documents || []).map((d) => ({
    id: d.id,
    uploaded_at: formatDate(d.uploaded_at),
    document_type: d.document_type || "—",
    file_name: isPreviewable(d) ? (
      <button
        type="button"
        onClick={() => setPreviewDoc(d)}
        className="text-[var(--brand-primary)] underline-offset-2 hover:underline"
      >
        {d.file_name}
      </button>
    ) : (
      d.file_name
    ),
    size_display: formatSize(d.size_bytes),
    uploaded_by: d.uploaded_by || "—",
    status: d.status || "active",
  }));

  return (
    <div className="space-y-3">
      <ChartTabHeader title="Documents" subtitle="Charts, PDFs and uploads attached to this member" />

      <div className="coding-surface-subtle rounded-lg p-3 flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="block text-[11px] font-semibold coding-text-muted uppercase tracking-wider mb-1">Document type (optional)</span>
          <input
            type="text"
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
            placeholder="Lab result, Consent form, etc."
            className="coding-input rounded-md px-2 py-1.5 text-sm w-64"
          />
        </label>
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleUpload}
          disabled={uploading || !resolvedMemberId}
          className="text-xs coding-text-strong file:mr-3 file:rounded-md file:border-0 file:bg-[var(--brand-primary)] file:text-white file:px-3 file:py-1.5 file:text-xs file:font-semibold file:cursor-pointer file:hover:opacity-90 disabled:opacity-60"
        />
        {uploading && <span className="text-xs coding-text-soft">Uploading…</span>}
      </div>

      {error && (
        <div className="rounded-lg ring-1 ring-rose-200 dark:ring-rose-700/40 bg-rose-50/60 dark:bg-rose-900/20 px-3 py-2 text-xs coding-text-strong">
          {error}
        </div>
      )}

      <ChartTable
        columns={DOCUMENT_COLUMNS}
        rows={rows}
        emptyMessage="No documents have been attached to this member yet."
      />

      {previewDoc && (
        <DocumentPreviewModal
          doc={previewDoc}
          token={token}
          tenant={tenant}
          onClose={() => setPreviewDoc(null)}
        />
      )}
    </div>
  );
}

/**
 * Full-screen-ish modal that fetches the blob and renders it inline by
 * content type. PDFs and images render natively (no JS deps). Text-like
 * formats are decoded and shown in a `<pre>`. HTML is rendered inside a
 * sandboxed iframe so embedded scripts can't reach the surrounding page.
 *
 * The blob is fetched exactly once per open and revoked on close so we
 * don't leak object URLs.
 */
function DocumentPreviewModal({ doc, token, tenant, onClose }) {
  const [state, setState] = useState({ status: "loading", body: null, text: null });
  const objectUrlRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading", body: null, text: null });

    const kind = previewKindFor(doc.content_type);
    if (kind === "unsupported") {
      setState({ status: "ready", body: null, text: null });
      return undefined;
    }

    (async () => {
      try {
        const { blob } = await downloadMember360Document(token, tenant, doc.id);
        if (cancelled) return;
        if (kind === "text" || kind === "html") {
          const text = await blob.text();
          setState({ status: "ready", body: null, text });
        } else {
          const url = URL.createObjectURL(blob);
          objectUrlRef.current = url;
          setState({ status: "ready", body: url, text: null });
        }
      } catch (err) {
        if (!cancelled) setState({ status: "error", error: err.message || "Preview failed" });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [doc.id, doc.content_type, token, tenant]);

  // Revoke the object URL on unmount or when swapping documents. We can't
  // do this inside the fetch effect's cleanup because we'd revoke the URL
  // we just handed to the iframe.
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [doc.id]);

  // Escape to close, lock body scroll while open — match WorkspaceDrawer.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const handleDownload = async () => {
    try {
      const { blob, filename } = await downloadMember360Document(token, tenant, doc.id);
      triggerBlobDownload(blob, filename || doc.file_name);
    } catch (err) {
      setState((prev) => ({ ...prev, status: "error", error: err.message || "Download failed" }));
    }
  };

  const kind = previewKindFor(doc.content_type);

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-slate-900/60 dark:bg-black/70"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        className="absolute inset-0 sm:inset-6 lg:inset-10 coding-surface shadow-xl rounded-none sm:rounded-xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 px-5 py-3 border-b coding-border">
          <div className="min-w-0">
            <h3 className="text-base font-semibold coding-text-strong truncate">{doc.file_name}</h3>
            <p className="mt-0.5 text-xs coding-text-soft">
              {doc.content_type || "unknown type"} · {formatSize(doc.size_bytes)}
              {doc.document_type ? ` · ${doc.document_type}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleDownload}
              className="rounded-md bg-[var(--brand-primary)] text-white px-3 py-1.5 text-xs font-semibold hover:opacity-90"
            >
              Download
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-md p-1 coding-text-muted hover:bg-[var(--coding-hover)] hover:coding-text-strong transition"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-auto coding-surface-subtle">
          {state.status === "loading" && (
            <div className="h-full flex items-center justify-center text-sm coding-text-soft">
              Loading preview…
            </div>
          )}

          {state.status === "error" && (
            <div className="h-full flex items-center justify-center px-6">
              <div className="rounded-lg ring-1 ring-rose-200 dark:ring-rose-700/40 bg-rose-50/60 dark:bg-rose-900/20 px-3 py-2 text-sm coding-text-strong max-w-md">
                {state.error}
              </div>
            </div>
          )}

          {state.status === "ready" && kind === "pdf" && state.body && (
            <iframe
              title={doc.file_name}
              src={state.body}
              className="w-full h-full border-0"
            />
          )}

          {state.status === "ready" && kind === "image" && state.body && (
            <div className="h-full flex items-center justify-center p-4">
              <img
                src={state.body}
                alt={doc.file_name}
                className="max-w-full max-h-full object-contain"
              />
            </div>
          )}

          {state.status === "ready" && kind === "text" && state.text != null && (
            <pre className="text-xs coding-text-strong whitespace-pre-wrap break-words p-4 font-mono">
              {state.text}
            </pre>
          )}

          {state.status === "ready" && kind === "html" && state.text != null && (
            // sandbox="" with no flags disables scripts, forms, same-origin
            // access — the iframe renders the markup but can't reach out.
            <iframe
              title={doc.file_name}
              srcDoc={state.text}
              sandbox=""
              className="w-full h-full border-0 bg-white"
            />
          )}

          {state.status === "ready" && kind === "unsupported" && (
            <div className="h-full flex flex-col items-center justify-center gap-2 px-6 text-center">
              <p className="text-sm coding-text-strong">
                Preview is not available for {doc.content_type || "this file type"}.
              </p>
              <p className="text-xs coding-text-soft">
                Use the Download button above to view it.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
