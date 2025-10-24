import React from "react";
import { SectionHeader, DataTable } from "../../../../../components/ehr/Primitives";

const labColumns = [
  { label: "Date", accessor: "date" },
  { label: "Test", accessor: "test" },
  { label: "Result", accessor: "result" },
  { label: "Reference", accessor: "reference" },
  { label: "Ordering", accessor: "ordering" },
];

const labRows = [
  {
    id: "lab-1",
    date: "Oct 05, 2025",
    test: "HbA1c",
    result: "7.4 %",
    reference: "Goal < 7.0 %",
    ordering: "Dr. Kim (Endocrinology)",
  },
  {
    id: "lab-2",
    date: "Sep 22, 2025",
    test: "Chest CT (low dose)",
    result: "Stable pulmonary nodules",
    reference: "Prior study 06/2025",
    ordering: "Dr. Singh (Pulmonology)",
  },
];

export default function LabsImagingPage() {
  return (
    <div className="space-y-4">
      <div className="coding-surface rounded-xl p-4">
        <SectionHeader title="Labs & Imaging" subtitle="Results & studies" />
        <div className="mt-3">
          <DataTable columns={labColumns} rows={labRows} />
        </div>
      </div>
    </div>
  );
}
