import React from "react";
import { SectionHeader, KeyValue } from "../../../../components/ehr/Primitives";

export default function SettingsPage() {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <SectionHeader title="Settings" subtitle="Member-level preferences" />
        <div className="mt-3 grid grid-cols-2 gap-6 md:grid-cols-3 text-xs">
          <KeyValue k="Preferred Language" v="—" />
          <KeyValue k="Communication" v="—" />
          <KeyValue k="Care Team" v="—" />
        </div>
      </div>
    </div>
  );
}
