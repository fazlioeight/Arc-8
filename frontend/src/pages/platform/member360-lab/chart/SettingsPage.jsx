import React from "react";
import { ChartTabHeader, ChartKeyValue } from "./chartPrimitives";

export default function SettingsPage({ member }) {
  return (
    <div>
      <ChartTabHeader
        title="Member settings"
        subtitle="Member-level preferences. Edit on the left rail to save changes."
      />
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-3">
        <ChartKeyValue k="Preferred language" v={member?.preferred_language} />
        <ChartKeyValue k="Preferred channel" v={member?.preferred_channel} />
        <ChartKeyValue k="Primary care provider" v={member?.primary_care_provider} />
        <ChartKeyValue k="Line of business" v={member?.line_of_business} />
        <ChartKeyValue k="Plan" v={member?.plan_name} />
        <ChartKeyValue k="Risk tier" v={member?.risk_tier} />
      </div>
    </div>
  );
}
