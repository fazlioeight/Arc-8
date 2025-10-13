import React from "react";
import { SectionHeader, TableSkeleton, KeyValue } from "../../../../components/ehr/Primitives";

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
          <TableSkeleton columns={["Auth#", "Service", "From", "To", "Status"]} rows={6} />
        </div>
      </div>
    </div>
  );
}
