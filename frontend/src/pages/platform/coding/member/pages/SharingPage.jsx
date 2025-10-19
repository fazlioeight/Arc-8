import React from "react";
import { SectionHeader, TableSkeleton } from "../../../../../components/ehr/Primitives";

export default function SharingPage() {
  return (
    <div className="space-y-4">
      <div className="coding-surface rounded-xl p-4">
        <SectionHeader title="Sharing" subtitle="Access & collaboration" />
        <div className="mt-3">
          <TableSkeleton columns={["User / Group", "Role", "Added", "Owner", "Actions"]} rows={8} />
        </div>
      </div>
    </div>
  );
}
