import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import "../../../../index.css";
import "../../portal_page/portalPage.sfdc.css";
import "../../dashboard/dashboard.css";
import { AuthContext } from "../../../../context/AuthContext";
import PortalUtilityBar from "../../../../components/PortalUtilityBar";
import PortalHero from "../../../../components/PortalHero";
import DashboardFilters from "../../dashboard/components/DashboardFilters";
import ChartCard from "../../dashboard/components/ChartCard";
import LiveRafDeltaChart from "../../dashboard/components/LiveRafDeltaChart";
import SuspectsFunnelChart from "../../dashboard/components/SuspectsFunnelChart";
import DeadlineRadarChart from "../../dashboard/components/DeadlineRadarChart";
import ProviderHeatmap from "../../dashboard/components/ProviderHeatmap";
import DetailDrawer from "../../dashboard/components/DetailDrawer";
import Skeleton from "../../../../components/ui/Skeleton";
import useChartData from "../../../../hooks/useChartData";
import {
  canExport,
  exportDeadlinesCsv,
  fetchDeadlineRadar,
  fetchProviderHeatmap,
  fetchRafDelta,
  fetchSuspectsFunnel,
} from "../../../../services/dashboardService";
import { TELEMETRY_EVENTS, logTelemetry } from "../../../../services/telemetryService";

const PACIFIC_TZ = "America/Los_Angeles";

const Dashboard = () => {
  const { user, recordAuditEvent } = useContext(AuthContext);
  const tenantName = user?.tenant || localStorage.getItem("companyName") || "Tenant";
  const companyLabel = localStorage.getItem("companyName") || "Your Company";

  const [filters, setFilters] = useState(() => {
    const today = new Date();
    const defaultTo = formatDateInput(today);
    const defaultFrom = formatDateInput(addDays(today, -30));
    const modelYear = today.getFullYear();
    return {
      modelYear,
      lob: "MA",
      providerGroup: "All",
      from: defaultFrom,
      to: defaultTo,
      cutoff: formatDateInput(defaultCutoff(modelYear)),
      stage: "accepted",
      forecastEnabled: true,
      normalize: false,
    };
  });

  const [heatmapMetric, setHeatmapMetric] = useState("open_raf");
  const [detailState, setDetailState] = useState({
    open: false,
    context: null,
    contributors: [],
    sparkline: [],
  });
  const [radarExportStatus, setRadarExportStatus] = useState(null);
  const hasLoggedViewRef = useRef(false);

  useEffect(() => {
    if (hasLoggedViewRef.current) return;
    hasLoggedViewRef.current = true;
    logTelemetry(recordAuditEvent, TELEMETRY_EVENTS.DASHBOARD_VIEW, {
      user_id: user?.email,
      lob: filters.lob,
      model_year: filters.modelYear,
      provider_group: filters.providerGroup,
      chart_id: "dashboard",
      duration_ms: 0,
    });
  }, [filters.lob, filters.modelYear, filters.providerGroup, recordAuditEvent, user?.email]);

  const handleFilterChange = useCallback(
    (update) => {
      setFilters((prev) => {
        const next = { ...prev, ...update };
        if (update.modelYear !== undefined && update.modelYear !== prev.modelYear) {
          next.cutoff = formatDateInput(defaultCutoff(update.modelYear));
        }
        return next;
      });
      logTelemetry(recordAuditEvent, TELEMETRY_EVENTS.FILTER_CHANGE, {
        user_id: user?.email,
        lob: update.lob ?? filters.lob,
        model_year: update.modelYear ?? filters.modelYear,
        provider_group: update.providerGroup ?? filters.providerGroup,
        chart_id: "global_filters",
        duration_ms: 0,
      });
    },
    [filters.lob, filters.modelYear, filters.providerGroup, recordAuditEvent, user?.email]
  );

  const rafParams = useMemo(
    () => ({
      modelYear: filters.modelYear,
      lob: filters.lob,
      providerGroup: filters.providerGroup,
      forecastEnabled: filters.forecastEnabled,
    }),
    [filters.modelYear, filters.lob, filters.providerGroup, filters.forecastEnabled]
  );

  const funnelParams = useMemo(
    () => ({
      from: filters.from,
      to: filters.to,
    }),
    [filters.from, filters.to]
  );

  const radarParams = useMemo(
    () => ({
      cutoff: filters.cutoff,
      stage: filters.stage,
    }),
    [filters.cutoff, filters.stage]
  );

  const heatmapParams = useMemo(
    () => ({
      metric: heatmapMetric,
      lob: filters.lob,
      providerGroup: filters.providerGroup,
      normalize: filters.normalize,
    }),
    [heatmapMetric, filters.lob, filters.providerGroup, filters.normalize]
  );

  const rafQuery = useChartData(fetchRafDelta, rafParams, {
    cacheKey: `raf-${filters.modelYear}-${filters.lob}-${filters.providerGroup}-${filters.forecastEnabled}`,
  });

  const funnelQuery = useChartData(fetchSuspectsFunnel, funnelParams, {
    cacheKey: `funnel-${filters.from}-${filters.to}`,
  });

  const radarQuery = useChartData(fetchDeadlineRadar, radarParams, {
    cacheKey: `radar-${filters.cutoff}-${filters.stage}`,
  });

  const heatmapQuery = useChartData(fetchProviderHeatmap, heatmapParams, {
    cacheKey: `heatmap-${heatmapMetric}-${filters.lob}-${filters.providerGroup}-${filters.normalize}`,
  });

  const providerGroups = useMemo(() => {
    const breakdown = rafQuery.data?.breakdown || [];
    return breakdown
      .map((item) => item.group)
      .filter((group) => group && group !== "All");
  }, [rafQuery.data]);

  useEffect(() => {
    if (
      filters.providerGroup !== "All" &&
      providerGroups.length &&
      !providerGroups.includes(filters.providerGroup)
    ) {
      setFilters((prev) => ({ ...prev, providerGroup: "All" }));
    }
  }, [filters.providerGroup, providerGroups]);

  const rafBadge = useMemo(() => {
    if (!rafQuery.data?.deltaToday && rafQuery.data?.deltaToday !== 0) return null;
    const delta = rafQuery.data.deltaToday;
    const formatted = delta > 0 ? `Delta -${Math.abs(delta).toFixed(2)}` : `Delta +${Math.abs(delta).toFixed(2)}`;
    return (
      <span aria-live="polite">
        {formatted}
        <span className="sr-only"> RAF delta to target</span>
      </span>
    );
  }, [rafQuery.data]);

  const rafFooter = useMemo(() => {
    if (!rafQuery.data?.trend) return null;
    return `7-day adds ${rafQuery.data.trend.trailing7.toFixed(3)} | 30-day adds ${rafQuery.data.trend.trailing30.toFixed(
      3
    )}`;
  }, [rafQuery.data]);

  const funnelSummary = useMemo(() => {
    if (!funnelQuery.data?.stages?.length) return null;
    const start = funnelQuery.data.stages[0];
    const end = funnelQuery.data.stages[funnelQuery.data.stages.length - 1];
    return `${start.label} to ${end.label} funnel; ${end.count.toLocaleString()} of ${start.count.toLocaleString()} present on score.`;
  }, [funnelQuery.data]);

  const deadlineSummary = useMemo(() => {
    if (!radarQuery.data?.buckets?.length) return null;
    const urgent = radarQuery.data.buckets.filter((bucket) => bucket.urgent);
    const urgentCount = urgent.reduce((acc, bucket) => acc + bucket.count, 0);
    return `${urgentCount.toLocaleString()} items within 7 days of cutoff ${formatDisplayDate(filters.cutoff)}.`;
  }, [radarQuery.data, filters.cutoff]);

  const heatmapSummary = useMemo(() => {
    if (!heatmapQuery.data?.providers?.length) return null;
    return `${heatmapQuery.data.providers.length} providers | metric ${metricLabel(heatmapMetric)} | ${
      filters.normalize ? "normalized" : "absolute"
    } values.`;
  }, [heatmapQuery.data, heatmapMetric, filters.normalize]);

  const openDetail = useCallback((payload) => {
    setDetailState({
      open: true,
      context: payload.context,
      contributors: payload.contributors || [],
      sparkline: payload.sparkline || [],
    });
  }, []);

  const closeDetail = useCallback(() => {
    setDetailState((prev) => ({ ...prev, open: false }));
  }, []);

  const handleRafSegmentClick = useCallback(
    ({ point }) => {
      if (!rafQuery.data) return;
      logTelemetry(recordAuditEvent, TELEMETRY_EVENTS.SEGMENT_CLICK, {
        user_id: user?.email,
        lob: filters.lob,
        model_year: filters.modelYear,
        provider_group: filters.providerGroup,
        chart_id: "raf_delta",
        duration_ms: 0,
      });
      openDetail({
        context: {
          type: "raf",
          title: "RAF trajectory",
          subtitle: `Model year ${filters.modelYear}`,
          label: formatDisplayDate(point.date),
          date: formatDisplayDate(point.date),
          realized: point.realized.toFixed(3),
          dailyAdd: point.dailyAdd?.toFixed(3) ?? "-",
          delta: (rafQuery.data.target - point.realized).toFixed(3),
          projected: rafQuery.data.forecast?.[0]?.p50?.toFixed(3) ?? null,
        },
      });
    },
    [filters.lob, filters.modelYear, filters.providerGroup, openDetail, rafQuery.data, recordAuditEvent, user?.email]
  );

  const handleFunnelStage = useCallback(
    (stage) => {
      const contributors = funnelQuery.data?.contributors?.filter((item) => item.stage === stage.key) || [];
      logTelemetry(recordAuditEvent, TELEMETRY_EVENTS.SEGMENT_CLICK, {
        user_id: user?.email,
        lob: filters.lob,
        model_year: filters.modelYear,
        provider_group: filters.providerGroup,
        chart_id: "suspects_funnel",
        duration_ms: 0,
      });
      openDetail({
        context: {
          type: "funnel",
          title: stage.label,
          subtitle: `Stage conversions`,
          label: stage.label,
          key: stage.key,
          count: stage.count.toLocaleString(),
          conversion: formatPercent(stage.conversion),
          medianDays: stage.medianDays,
        },
        contributors,
      });
    },
    [filters.lob, filters.modelYear, filters.providerGroup, funnelQuery.data, openDetail, recordAuditEvent, user?.email]
  );

  const handleDeadlineSegment = useCallback(
    (bucket) => {
      logTelemetry(recordAuditEvent, TELEMETRY_EVENTS.SEGMENT_CLICK, {
        user_id: user?.email,
        lob: filters.lob,
        model_year: filters.modelYear,
        provider_group: filters.providerGroup,
        chart_id: "deadline_radar",
        duration_ms: 0,
      });
      openDetail({
        context: {
          type: "deadline",
          title: "Deadline bucket",
          subtitle: `Cutoff ${formatDisplayDate(filters.cutoff)}`,
          label: `${bucket.range} days`,
          range: bucket.range,
          count: bucket.count.toLocaleString(),
          urgent: bucket.urgent,
        },
      });
    },
    [filters.cutoff, filters.lob, filters.modelYear, filters.providerGroup, openDetail, recordAuditEvent, user?.email]
  );

  const handleHeatmapCell = useCallback(
    (cell) => {
      const sparkline = heatmapQuery.data?.sparklines?.[cell.provider] || [];
      logTelemetry(recordAuditEvent, TELEMETRY_EVENTS.SEGMENT_CLICK, {
        user_id: user?.email,
        lob: filters.lob,
        model_year: filters.modelYear,
        provider_group: filters.providerGroup,
        chart_id: "provider_heatmap",
        duration_ms: 0,
      });
      openDetail({
        context: {
          type: "heatmap",
          title: "Provider snapshot",
          subtitle: metricLabel(cell.metric),
          label: metricLabel(cell.metric),
          provider: cell.provider,
          metric: metricLabel(cell.metric),
          value: formatHeatmapValue(cell.displayValue, cell.metric),
        },
        sparkline,
      });
    },
    [filters.lob, filters.modelYear, filters.providerGroup, heatmapQuery.data, openDetail, recordAuditEvent, user?.email]
  );

  const handleRadarExport = useCallback(async () => {
    if (!radarQuery.data) return;
    if (!canExport(user)) {
      setRadarExportStatus({ type: "error", message: "Export requires risk_ops or coding_mgr role." });
      return;
    }
    try {
      setRadarExportStatus({ type: "info", message: "Preparing CSV..." });
      const params = {
        cutoff: filters.cutoff,
        stage: filters.stage,
        lob: filters.lob,
        model_year: filters.modelYear,
        provider_group: filters.providerGroup,
      };
      let blob;
      try {
        const apiBlob = await exportDeadlinesCsv({ params });
        blob = apiBlob;
      } catch (err) {
        const fallback = buildDeadlineCsv(radarQuery.data, filters, user);
        blob = new Blob([fallback], { type: "text/csv;charset=utf-8" });
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `deadline_radar_${filters.cutoff}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      setRadarExportStatus({ type: "success", message: "Export ready." });
      logTelemetry(recordAuditEvent, TELEMETRY_EVENTS.EXPORT_CSV, {
        user_id: user?.email,
        lob: filters.lob,
        model_year: filters.modelYear,
        provider_group: filters.providerGroup,
        chart_id: "deadline_radar",
        duration_ms: 0,
      });
    } catch (err) {
      setRadarExportStatus({ type: "error", message: "Unable to export CSV at this time." });
    }
  }, [filters, radarQuery.data, recordAuditEvent, user]);

  const cardActionsHeatmap = (
    <div className="dashboard-card__actions">
      <label htmlFor="heatmap-metric" className="sr-only">
        Select metric
      </label>
      <select
        id="heatmap-metric"
        value={heatmapMetric}
        onChange={(event) => setHeatmapMetric(event.target.value)}
        aria-label="Select heatmap metric"
      >
        <option value="open_raf">Open RAF</option>
        <option value="denial_rate">Denial Rate</option>
        <option value="days_aging">Avg Days Aging</option>
        <option value="qa_fail_rate">QA Fail Rate</option>
      </select>
    </div>
  );

  return (
    <div className="sfdc-portal">
      <PortalUtilityBar />
      <PortalHero align="left" title={tenantName} subtitle={`${companyLabel} Portal`} />

      <div className="ds-container dashboard-page">
        <DashboardFilters
          filters={filters}
          onChange={handleFilterChange}
          providerGroups={providerGroups}
        />

        <main className="dashboard-main">
          <section className="dashboard-content">
            <div className="dashboard-grid-visuals">
              <ChartCard
                title="Live RAF Delta"
                subtitle={`Target ${rafQuery.data?.target?.toFixed(2) ?? "-"}`}
                badge={rafBadge}
                tooltip="Cumulative RAF realized vs target with forecast to CMS cutoff."
                description={rafQuery.data?.summary}
                partial={rafQuery.partial}
                partialLabel="Partial series - awaiting today's load."
                error={rafQuery.error}
                footer={rafFooter}
              >
                {rafQuery.loading ? (
                  <Skeleton height="300px" />
                ) : rafQuery.data ? (
                  <LiveRafDeltaChart
                    data={rafQuery.data}
                    forecastEnabled={filters.forecastEnabled}
                    onSegmentClick={handleRafSegmentClick}
                  />
                ) : (
                  <p className="dashboard-card__summary">No RAF data available for the selected filters.</p>
                )}
              </ChartCard>

              <ChartCard
                title="Suspects Funnel"
                subtitle="Conversion from suspected to score"
                tooltip="Shows throughput, conversion, and median days per stage."
                description={funnelSummary}
                partial={funnelQuery.partial}
                partialLabel={
                  funnelQuery.data?.asOf ? `Partial through ${formatDisplayDateTime(funnelQuery.data.asOf)}` : undefined
                }
                error={funnelQuery.error}
              >
                {funnelQuery.loading ? (
                  <Skeleton height="320px" />
                ) : funnelQuery.data?.stages?.length ? (
                  <SuspectsFunnelChart
                    data={funnelQuery.data}
                    partial={funnelQuery.partial}
                    asOf={funnelQuery.data?.asOf}
                    onStageSelect={handleFunnelStage}
                  />
                ) : (
                  <p className="dashboard-card__summary">No funnel data for this period.</p>
                )}
              </ChartCard>

              <ChartCard
                title="Deadline Radar"
                subtitle={`Cutoff ${formatDisplayDate(filters.cutoff)}`}
                tooltip="Radial distribution of items by days to cutoff. Buckets <=7 days are highlighted."
                description={deadlineSummary}
                error={radarQuery.error}
                actions={
                  <button
                    type="button"
                    onClick={handleRadarExport}
                    className="ds-button ds-button--ghost"
                    aria-label="Export deadline radar CSV"
                  >
                    Export CSV
                  </button>
                }
                footer={radarExportStatus?.message}
              >
                {radarQuery.loading ? (
                  <Skeleton height="340px" />
                ) : radarQuery.data?.buckets?.length ? (
                  <DeadlineRadarChart data={radarQuery.data} onSegmentClick={handleDeadlineSegment} />
                ) : (
                  <p className="dashboard-card__summary">No deadline data found.</p>
                )}
              </ChartCard>

              <ChartCard
                title="Provider Heatmap"
                subtitle={filters.normalize ? "Z-score normalized" : "Absolute values"}
                tooltip="Compare provider performance across key metrics."
                description={heatmapSummary}
                error={heatmapQuery.error}
                actions={cardActionsHeatmap}
              >
                {heatmapQuery.loading ? (
                  <Skeleton height="360px" />
                ) : heatmapQuery.data?.matrix?.length ? (
                  <ProviderHeatmap data={heatmapQuery.data} onCellSelect={handleHeatmapCell} />
                ) : (
                  <p className="dashboard-card__summary">No provider metrics matched the filters.</p>
                )}
              </ChartCard>
            </div>
          </section>

          <DetailDrawer
            isOpen={detailState.open}
            context={detailState.context}
            onClose={closeDetail}
            filters={filters}
            contributors={detailState.contributors}
            sparkline={detailState.sparkline}
          />
        </main>

        <footer className="sfdc-footer">
          <p>&copy; 2025 Nexora - Multi-tenant Analytics Platform</p>
        </footer>
      </div>
    </div>
  );
};

const formatDateInput = (date) => {
  const pacific = new Date(date.toLocaleString("en-US", { timeZone: PACIFIC_TZ }));
  const year = pacific.getFullYear();
  const month = String(pacific.getMonth() + 1).padStart(2, "0");
  const day = String(pacific.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const defaultCutoff = (modelYear) => new Date(modelYear + 1, 0, 31);

const addDays = (date, days) => {
  const clone = new Date(date);
  clone.setDate(clone.getDate() + days);
  return clone;
};

const formatDisplayDate = (value) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: PACIFIC_TZ,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));

const formatDisplayDateTime = (value) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: PACIFIC_TZ,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));

const formatPercent = (value) => {
  if (!Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("en-US", { style: "percent", minimumFractionDigits: 0 }).format(value);
};

const metricLabel = (metric) => {
  switch (metric) {
    case "open_raf":
      return "Open RAF";
    case "denial_rate":
      return "Denial Rate";
    case "days_aging":
      return "Avg Days Aging";
    case "qa_fail_rate":
      return "QA Fail Rate";
    default:
      return metric;
  }
};

const formatHeatmapValue = (value, metric) => {
  if (value === null || value === undefined) return "-";
  if (metric.includes("rate")) return `${(value * 100).toFixed(1)}%`;
  if (metric.includes("days")) return `${value.toFixed(0)} days`;
  return value.toFixed(1);
};

const buildDeadlineCsv = (data, filters, user) => {
  const header = ["member_id", "provider_id", "stage", "days_to_cutoff"];
  const watermark = `# exported_by=${user?.email || "anonymous"} time=${new Date().toISOString()} filters=${JSON.stringify(
    filters
  )}`;
  const rows = [header.join(",")];
  data?.buckets?.forEach((bucket) => {
    rows.push(["aggregate", "aggregate", filters.stage, bucket.range].join(","));
  });
  rows.push(watermark);
  return rows.join("\n");
};

export default Dashboard;

