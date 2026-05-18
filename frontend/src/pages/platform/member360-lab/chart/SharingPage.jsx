import React from "react";
import { ChartTabHeader, ChartTable } from "./chartPrimitives";

const SHARING_COLUMNS = [
  { label: "User / Group", accessor: "subject" },
  { label: "Role", accessor: "role" },
  { label: "Added", accessor: "added" },
  { label: "Owner", accessor: "owner" },
];

// Member-level sharing is not yet modeled. Access today is governed by the
// tenant + app_permissions on the User record. When per-member sharing lands
// (a m360_member_collaborators or similar table) this page should fetch and
// edit those rows. Until then the tab shows an empty state instead of
// hardcoded user names.
export default function SharingPage() {
  return (
    <div>
      <ChartTabHeader
        title="Sharing"
        subtitle="Access and collaboration"
      />
      <ChartTable
        columns={SHARING_COLUMNS}
        rows={[]}
        emptyMessage="Per-member sharing is pending. Access is currently controlled by tenant role and member360 app permissions."
      />
    </div>
  );
}
