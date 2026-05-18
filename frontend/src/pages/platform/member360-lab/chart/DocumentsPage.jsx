import React, { useContext, useRef, useState } from "react";
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

// Triggers a browser download for the blob returned by the API. Uses an
// object URL + temporary anchor — same pattern as the submission export
// download in Member360LabWorkspace.
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

export default function DocumentsPage({ detail, memberId, onUploaded }) {
  const { token, tenant } = useContext(AuthContext) || {};
  const fileInputRef = useRef(null);
  const [docType, setDocType] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [busyDocId, setBusyDocId] = useState(null);

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
      // Tell the workspace to refetch so the new row appears immediately.
      onUploaded?.();
    } catch (err) {
      setError(err.message || "Upload failed");
    } finally {
      setUploading(false);
      // Reset the input so re-selecting the same file fires onChange again.
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDownload = async (doc) => {
    setError(null);
    setBusyDocId(doc.id);
    try {
      const { blob, filename } = await downloadMember360Document(token, tenant, doc.id);
      triggerBlobDownload(blob, filename || doc.file_name);
    } catch (err) {
      setError(err.message || "Download failed");
    } finally {
      setBusyDocId(null);
    }
  };

  const rows = (detail?.documents || []).map((d) => ({
    id: d.id,
    uploaded_at: formatDate(d.uploaded_at),
    document_type: d.document_type || "—",
    file_name: d.storage_path || d.storage_backend ? (
      <button
        type="button"
        onClick={() => handleDownload(d)}
        disabled={busyDocId === d.id}
        className="text-[var(--brand-primary)] underline-offset-2 hover:underline disabled:opacity-60"
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
    </div>
  );
}
