import React from "react";
import { SectionHeader, TableSkeleton, KeyValue, AlertBanner } from "../../../../components/ehr/Primitives";
import { useOutletContext } from "react-router-dom";

export default function OverviewPage() {
  const { detail, gap, loading } = useOutletContext();
  const member = detail?.member || {};
  const priority = detail?.priority || gap?.priority || {};
  const riskScore = typeof member?.risk_score === "number" ? member.risk_score : null;
  const opps = priority?.hcc_opportunity_count || 0;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <SectionHeader title="Patient Snapshot" subtitle="Key facts and trends" />
        <div className="mt-3 grid grid-cols-2 gap-6 md:grid-cols-3 text-xs">
          <KeyValue k="Status" v={member?.status || "—"} />
          <KeyValue k="Line of Business" v={member?.line_of_business || "—"} />
          <KeyValue k="PCP" v={member?.pcp_name || "—"} />
          <KeyValue k="Risk Score" v={riskScore != null ? riskScore.toFixed(2) : "—"} />
          <KeyValue k="Opportunities" v={opps} />
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <SectionHeader title="HCC Suspect List" subtitle="Machine-suggested conditions for review" />
        <div className="mt-3">
          {loading ? (
            <TableSkeleton columns={["HCC", "Reason", "ICD-10", "Action"]} rows={4} />
          ) : (gap?.missing_hcc || []).length ? (
            <TableSkeleton columns={["HCC", "Reason", "ICD-10", "Action"]} rows={3} />
          ) : (
            <AlertBanner level="success" title="No outstanding HCC opportunities" />
          )}
        </div>
      </div>
    </div>
  );
}
