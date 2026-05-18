import React from "react";
import { ChartTabHeader, ChartTable } from "./chartPrimitives";

const DOCUMENT_COLUMNS = [
  { label: "Uploaded", accessor: "uploaded_at" },
  { label: "Type", accessor: "document_type" },
  { label: "File", accessor: "file_name" },
  { label: "Uploaded by", accessor: "uploaded_by" },
  { label: "Status", accessor: "status" },
];

const formatDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString();
};

export default function DocumentsPage({ detail }) {
  const rows = (detail?.documents || []).map((d) => ({
    id: d.id,
    uploaded_at: formatDate(d.uploaded_at),
    document_type: d.document_type || "—",
    file_name: d.file_name,
    uploaded_by: d.uploaded_by || "—",
    status: d.status || "active",
  }));

  return (
    <div>
      <ChartTabHeader title="Documents" subtitle="Charts, PDFs and uploads attached to this member" />
      <ChartTable
        columns={DOCUMENT_COLUMNS}
        rows={rows}
        emptyMessage="No documents have been attached to this member yet."
      />
    </div>
  );
}
