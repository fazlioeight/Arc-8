import React, { useMemo } from "react";
import ToggleSwitch from "../../../../components/ToggleSwitch";

const MODEL_YEAR_SPAN = 4;
const LOBS = ["MA", "MMP", "DSNP", "Commercial"];
const STAGES = [
  { value: "suspected", label: "Suspected" },
  { value: "coder_reviewed", label: "Coder Reviewed" },
  { value: "accepted", label: "Accepted" },
  { value: "submitted", label: "Submitted" },
  { value: "payer_accepted", label: "Payer Accepted" },
  { value: "on_score", label: "Present on Score" },
];

const DashboardFilters = ({
  filters,
  onChange,
  providerGroups = [],
  allowForecast = true,
  showNormalize = true,
}) => {
  const modelYears = useMemo(() => {
    const baseYear = new Date().getFullYear();
    return Array.from({ length: MODEL_YEAR_SPAN }, (_, index) => baseYear + 1 - index);
  }, []);

  const handleChange = (key, value) => {
    if (typeof onChange === "function") {
      onChange({ [key]: value });
    }
  };

  return (
    <div className="dashboard-filters" role="region" aria-label="Dashboard filters">
      <div className="dashboard-filters__group">
        <label htmlFor="filter-model-year">Model Year</label>
        <select
          id="filter-model-year"
          value={filters.modelYear}
          onChange={(event) => handleChange("modelYear", Number(event.target.value))}
        >
          {modelYears.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </div>

      <div className="dashboard-filters__group">
        <label htmlFor="filter-lob">Line of Business</label>
        <select
          id="filter-lob"
          value={filters.lob}
          onChange={(event) => handleChange("lob", event.target.value)}
        >
          {LOBS.map((lob) => (
            <option key={lob} value={lob}>
              {lob}
            </option>
          ))}
        </select>
      </div>

      <div className="dashboard-filters__group">
        <label htmlFor="filter-provider-group">Provider Group</label>
        <select
          id="filter-provider-group"
          value={filters.providerGroup}
          onChange={(event) => handleChange("providerGroup", event.target.value)}
        >
          {["All", ...providerGroups].map((group) => (
            <option key={group} value={group}>
              {group}
            </option>
          ))}
        </select>
      </div>

      <div className="dashboard-filters__group dashboard-filters__group--range">
        <label htmlFor="filter-date-from">Date Range</label>
        <div className="dashboard-filters__range-inputs">
          <input
            id="filter-date-from"
            type="date"
            value={filters.from}
            max={filters.to}
            onChange={(event) => handleChange("from", event.target.value)}
          />
          <span aria-hidden="true">-</span>
          <input
            id="filter-date-to"
            type="date"
            value={filters.to}
            min={filters.from}
            onChange={(event) => handleChange("to", event.target.value)}
          />
        </div>
      </div>

      <div className="dashboard-filters__group">
        <label htmlFor="filter-cutoff">Cutoff date</label>
        <input
          id="filter-cutoff"
          type="date"
          value={filters.cutoff}
          onChange={(event) => handleChange("cutoff", event.target.value)}
        />
      </div>

      <div className="dashboard-filters__group">
        <label htmlFor="filter-stage">Stage</label>
        <select
          id="filter-stage"
          value={filters.stage}
          onChange={(event) => handleChange("stage", event.target.value)}
        >
          {STAGES.map((stage) => (
            <option key={stage.value} value={stage.value}>
              {stage.label}
            </option>
          ))}
        </select>
      </div>

      {allowForecast ? (
        <div className="dashboard-filters__group dashboard-filters__group--toggle">
          <span id="filter-forecast-label">Forecast</span>
          <ToggleSwitch
            id="filter-forecast"
            aria-labelledby="filter-forecast-label"
            checked={filters.forecastEnabled}
            onChange={(value) => handleChange("forecastEnabled", value)}
          />
        </div>
      ) : null}

      {showNormalize ? (
        <div className="dashboard-filters__group dashboard-filters__group--toggle">
          <span id="filter-normalize-label">Normalize</span>
          <ToggleSwitch
            id="filter-normalize"
            aria-labelledby="filter-normalize-label"
            checked={filters.normalize}
            onChange={(value) => handleChange("normalize", value)}
          />
        </div>
      ) : null}
    </div>
  );
};

export default DashboardFilters;
