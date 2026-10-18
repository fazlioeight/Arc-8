import React, { useCallback, useContext, useMemo, useState } from "react";
import PortalPageLayout from "../../../components/PortalPageLayout";
import AlertShell from "../../../components/ui/AlertShell";
import { LoadingState, EmptyState } from "../../../components/ehr/Primitives";
import { AuthContext } from "../../../context/AuthContext";
import { PORTAL_NAV_ITEMS } from "../portal_page/portalNavItems";
import useChartData from "../../../hooks/useChartData";
import {
  fetchRafDelta,
  fetchSuspectsFunnel,
  fetchDeadlineRadar,
  fetchProviderHeatmap,
} from "../../../services/dashboardService";
import ChartCard from "./components/ChartCard";
import DashboardFilters from "./components/DashboardFilters";
import LiveRafDeltaChart from "./components/LiveRafDeltaChart";
import SuspectsFunnelChart from "./components/SuspectsFunnelChart";
import DeadlineRadarChart from "./components/DeadlineRadarChart";
import ProviderHeatmap from "./components/ProviderHeatmap";
import "./dashboard.css";

const todayISO = () => new Date().toISOString().slice(0, 10);

// Renders loading / empty / chart consistently inside a ChartCard body.
const CardBody = ({ state, hasData, children, emptyTitle }) => {
  if (state.loading && !state.data) return <LoadingState title="Loading…" />;
  if (!hasData) return <EmptyState icon="info" title={emptyTitle} description="No data for the current filters." />;
  return children;
};

const DashboardPage = () => {
  const { token, tenant, isAuthenticated } = useContext(AuthContext) || {};
  const canQuery = useMemo(() => Boolean(token && tenant), [token, tenant]);
  const year = new Date().getFullYear();

  const [filters, setFilters] = useState({
    modelYear: year,
    lob: "MA",
    providerGroup: "All",
    from: `${year}-01-01`,
    to: todayISO(),
    cutoff: `${year}-12-31`,
    stage: "accepted",
    forecastEnabled: true,
    normalize: false,
  });
  const onFilterChange = useCallback((patch) => setFilters((f) => ({ ...f, ...patch })), []);

  // Fetchers wrapped to inject auth; useChartData only passes {params, signal}.
  const rafFetcher = useCallback(({ params, signal }) => fetchRafDelta({ params, signal, token, tenant }), [token, tenant]);
  const funnelFetcher = useCallback(({ params, signal }) => fetchSuspectsFunnel({ params, signal, token, tenant }), [token, tenant]);
  const radarFetcher = useCallback(({ params, signal }) => fetchDeadlineRadar({ params, signal, token, tenant }), [token, tenant]);
  const heatmapFetcher = useCallback(({ params, signal }) => fetchProviderHeatmap({ params, signal, token, tenant }), [token, tenant]);

  const rafParams = useMemo(
    () => ({ modelYear: filters.modelYear, lob: filters.lob, providerGroup: filters.providerGroup, forecastEnabled: filters.forecastEnabled }),
    [filters.modelYear, filters.lob, filters.providerGroup, filters.forecastEnabled]
  );
  const funnelParams = useMemo(() => ({ from: filters.from, to: filters.to }), [filters.from, filters.to]);
  const radarParams = useMemo(() => ({ cutoff: filters.cutoff, stage: filters.stage }), [filters.cutoff, filters.stage]);
  const heatmapParams = useMemo(
    () => ({ metric: "open_raf", lob: filters.lob, providerGroup: filters.providerGroup, normalize: filters.normalize }),
    [filters.lob, filters.providerGroup, filters.normalize]
  );

  const raf = useChartData(rafFetcher, rafParams, { enabled: canQuery, cacheKey: `raf:${JSON.stringify(rafParams)}` });
  const funnel = useChartData(funnelFetcher, funnelParams, { enabled: canQuery, cacheKey: `funnel:${JSON.stringify(funnelParams)}` });
  const radar = useChartData(radarFetcher, radarParams, { enabled: canQuery, cacheKey: `radar:${JSON.stringify(radarParams)}` });
  const heatmap = useChartData(heatmapFetcher, heatmapParams, { enabled: canQuery, cacheKey: `heatmap:${JSON.stringify(heatmapParams)}` });

  return (
    <PortalPageLayout
      eyebrow="Dashboard"
      title="RAF & coding analytics"
      subtitle="Live RAF delta, suspect funnel, deadline radar, and provider performance."
      navItems={PORTAL_NAV_ITEMS}
      currentNav="dashboard"
      navProps={{ align: "center", tone: "surface" }}
      maxWidthClassName="max-w-[1500px]"
      mainClassName="space-y-4"
    >
      {!isAuthenticated && (
        <AlertShell tone="warning" title="Authentication required" description="Sign in to load dashboard analytics." />
      )}

      <DashboardFilters filters={filters} onChange={onFilterChange} />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ChartCard
          title="Live RAF delta"
          subtitle={raf.data?.summary}
          partial={raf.partial}
          error={raf.error ? raf.error.message || "Failed to load" : null}
        >
          <CardBody state={raf} hasData={Boolean(raf.data?.series?.length)} emptyTitle="No RAF data">
            <LiveRafDeltaChart data={raf.data} forecastEnabled={filters.forecastEnabled} ariaLabel="Live RAF delta" />
          </CardBody>
        </ChartCard>

        <ChartCard
          title="Suspects funnel"
          partial={funnel.partial}
          error={funnel.error ? funnel.error.message || "Failed to load" : null}
        >
          <CardBody state={funnel} hasData={Boolean(funnel.data?.stages?.length)} emptyTitle="No funnel data">
            <SuspectsFunnelChart data={funnel.data} partial={funnel.partial} asOf={funnel.data?.asOf} />
          </CardBody>
        </ChartCard>

        <ChartCard
          title="Deadline radar"
          subtitle={`Stage: ${filters.stage}`}
          error={radar.error ? radar.error.message || "Failed to load" : null}
        >
          <CardBody state={radar} hasData={Boolean(radar.data?.buckets?.length)} emptyTitle="No deadline data">
            <DeadlineRadarChart data={radar.data} />
          </CardBody>
        </ChartCard>

        <ChartCard
          title="Provider heatmap"
          subtitle="Open RAF by provider"
          error={heatmap.error ? heatmap.error.message || "Failed to load" : null}
        >
          <CardBody state={heatmap} hasData={Boolean(heatmap.data?.providers?.length)} emptyTitle="No provider data">
            <ProviderHeatmap data={heatmap.data} />
          </CardBody>
        </ChartCard>
      </div>
    </PortalPageLayout>
  );
};

export default DashboardPage;
