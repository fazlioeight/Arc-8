import React from "react";
import { SectionHeader, TableSkeleton, KeyValue } from "../../../../components/ehr/Primitives";

export default function EligibilityCoveragePage() {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <SectionHeader title="Eligibility & Coverage" subtitle="Payer & plan details" />
        <div className="mt-3 grid grid-cols-2 gap-6 md:grid-cols-3 text-xs">
          <KeyValue k="Payer" v="—" />
          <KeyValue k="Plan" v="—" />
          <KeyValue k="Member ID" v="—" />
          <KeyValue k="Effective" v="—" />
          <KeyValue k="Group" v="—" />
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <SectionHeader title="Authorizations" subtitle="Active & historical" />
        <div className="mt-3">
          <TableSkeleton columns={["Auth#", "Service", "From", "To", "Status"]} rows={6} />
        </div>
      </div>
    </div>
  );
}
