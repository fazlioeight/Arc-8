import React from "react";
import { SectionHeader, DataTable, KeyValue, Chip } from "../../../../../components/ehr/Primitives";

const authorizationColumns = [
  { label: "Auth#", accessor: "authNumber" },
  { label: "Service", accessor: "service" },
  { label: "From", accessor: "from" },
  { label: "To", accessor: "to" },
  {
    label: "Status",
    render: (row) => <Chip label={row.status} title={`Authorization status: ${row.status}`} />,
  },
];

const authorizationRows = [
  {
    id: "auth-1",
    authNumber: "A-482193",
    service: "Cardiac rehab sessions (12 visits)",
    from: "Sep 01, 2025",
    to: "Nov 30, 2025",
    status: "Approved",
  },
  {
    id: "auth-2",
    authNumber: "A-479812",
    service: "Home health nursing",
    from: "Oct 10, 2025",
    to: "Dec 10, 2025",
    status: "Pending",
  },
];

export default function EligibilityCoveragePage() {
  return (
    <div className="space-y-4">
      <div className="coding-surface rounded-xl p-4">
        <SectionHeader title="Eligibility & Coverage" subtitle="Payer & plan details" />
        <div className="mt-3 grid grid-cols-2 gap-6 text-xs md:grid-cols-3">
          <KeyValue k="Payer" v="N/A" />
          <KeyValue k="Plan" v="N/A" />
          <KeyValue k="Member ID" v="N/A" />
          <KeyValue k="Effective" v="N/A" />
          <KeyValue k="Group" v="N/A" />
        </div>
      </div>

      <div className="coding-surface rounded-xl p-4">
        <SectionHeader title="Authorizations" subtitle="Active & historical" />
        <div className="mt-3">
          <DataTable columns={authorizationColumns} rows={authorizationRows} />
        </div>
      </div>
    </div>
  );
}
