import React from "react";
import { SectionHeader, KeyValue } from "../../../../../components/ehr/Primitives";

export default function SettingsPage() {
  return (
    <div className="space-y-4">
      <div className="coding-surface rounded-xl p-4">
        <SectionHeader title="Settings" subtitle="Member-level preferences" />
        <div className="mt-3 grid grid-cols-2 gap-6 text-xs md:grid-cols-3">
          <KeyValue k="Preferred Language" v="N/A" />
          <KeyValue k="Communication" v="N/A" />
          <KeyValue k="Care Team" v="N/A" />
        </div>
      </div>
    </div>
  );
}
