import React from "react";
import { ChartTabHeader, ChartKeyValue } from "./chartPrimitives";

export default function SettingsPage() {
  return (
    <div>
      <ChartTabHeader title="Member settings" subtitle="Member-level preferences and care team" />
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-3">
        <ChartKeyValue k="Preferred language" v={null} />
        <ChartKeyValue k="Communication" v={null} />
        <ChartKeyValue k="Care team" v={null} />
        <ChartKeyValue k="Time zone" v={null} />
        <ChartKeyValue k="Risk tier override" v={null} />
        <ChartKeyValue k="Auto-route queue" v={null} />
      </div>
    </div>
  );
}
