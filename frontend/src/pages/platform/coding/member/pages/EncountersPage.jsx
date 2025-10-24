import React from "react";
import { SectionHeader, DataTable } from "../../../../../components/ehr/Primitives";

const encounterColumns = [
  { label: "Date", accessor: "date" },
  { label: "Type", accessor: "type" },
  { label: "Location", accessor: "location" },
  { label: "Paid", accessor: "paid" },
  { label: "Dx (summary)", accessor: "dxSummary" },
];

const encounterRows = [
  {
    id: "enc-1",
    date: "Oct 12, 2025",
    type: "Outpatient visit",
    location: "Harborview Clinics",
    paid: "$1,285.00",
    dxSummary: "E11.9, I50.22, J44.9",
  },
  {
    id: "enc-2",
    date: "Sep 29, 2025",
    type: "Inpatient stay",
    location: "St. Mary's Medical Center",
    paid: "$7,945.38",
    dxSummary: "J18.9, I10",
  },
];

export default function EncountersPage() {
  return (
    <div className="space-y-4">
      <div className="coding-surface rounded-xl p-4">
        <SectionHeader title="Encounters" subtitle="Past 12 months" />
        <div className="mt-3">
          <DataTable columns={encounterColumns} rows={encounterRows} />
        </div>
      </div>
    </div>
  );
}
