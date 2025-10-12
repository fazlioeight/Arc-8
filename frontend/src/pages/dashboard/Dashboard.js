import React, { useState, useEffect, useContext, useMemo } from "react";
import "../../index.css";
import "../portal_page/portalPage.sfdc.css";
import { AuthContext } from "../../context/AuthContext";
import D3BarChart from "../../components/D3BarChart";
import PortalUtilityBar from "../../components/PortalUtilityBar";
import PortalHero from '../../components/PortalHero';
import Icon from "../../components/ui/Icon";
import InfoTooltip from "../../components/ui/InfoTooltip";
import Skeleton, { SkeletonGroup } from "../../components/ui/Skeleton";

const Dashboard = () => {
  const [data, setData] = useState({
    bur: 0,
    raf: 0,
    memberCount: 0,
    gaps: 0,
    loading: true,
    error: null,
  });
  const { user } = useContext(AuthContext);

  useEffect(() => {
    // Mocked metrics until backend integration
    const mockMetrics = {
      bur: 12345,
      raf: 1.25,
      memberCount: 5000,
      gaps: 150,
    };
    setData({
      ...mockMetrics,
      loading: false,
    });

    // Real fetch placeholder
    /*
    const fetchCompanyMetrics = async () => {
      try {
        const response = await fetch("https://api.nexora.com/company-metrics", {
          method: "GET",
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          throw new Error("Failed to fetch metrics");
        }

        const metrics = await response.json();
        setData({
          bur: metrics.bur || 0,
          raf: metrics.raf || 0,
          memberCount: metrics.memberCount || 0,
          gaps: metrics.gaps || 0,
          loading: false,
        });
      } catch (err) {
        setData((prev) => ({ ...prev, loading: false, error: err.message }));
      }
    };

    fetchCompanyMetrics();
    */
  }, []);

  const tenantName = user?.tenant || localStorage.getItem("companyName") || "Tenant";
  const companyLabel = localStorage.getItem("companyName") || "Your Company";

  const metricCards = useMemo(() => [
    {
      key: "bur",
      title: "BUR",
      formattedValue: data.bur.toLocaleString(),
      hint: "Business Utilization Report",
      tooltip: "Tracks total cost utilization across all active contracts.",
      icon: "spark",
    },
    {
      key: "raf",
      title: "RAF",
      formattedValue: data.raf.toFixed(2),
      hint: "Risk Adjustment Factor",
      tooltip: "Blended RAF score across current risk models.",
      icon: "info",
    },
    {
      key: "memberCount",
      title: "Member count",
      formattedValue: data.memberCount.toLocaleString(),
      hint: "Total active members",
      tooltip: "Aggregated active members synced in the last 24 hours.",
      icon: "clock",
    },
    {
      key: "gaps",
      title: "Open gaps",
      formattedValue: data.gaps.toLocaleString(),
      hint: "Care or compliance gaps",
      tooltip: "Members with at least one open compliance or quality gap.",
      icon: "warning",
    },
  ], [data.bur, data.raf, data.memberCount, data.gaps]);

  if (data.loading) {
    return (
      <div className="sfdc-portal">
        <PortalUtilityBar />
        <PortalHero
          align="left"
          title={tenantName}
          subtitle={`${companyLabel} Portal`}
        />
        <div className="ds-container" style={{ paddingBlock: "var(--space-xl)" }}>
          <div className="ds-grid ds-grid--balanced">
            {metricCards.map((metric) => (
              <div key={metric.key} className="ds-card ds-card--compact ds-card--interactive">
                <Skeleton variant="pill" width="40%" />
                <Skeleton variant="title" width="60%" />
                <SkeletonGroup lines={3} />
              </div>
            ))}
          </div>
          <div className="ds-card ds-card--compact" style={{ marginTop: "var(--space-xl)" }}>
            <Skeleton variant="pill" width="25%" />
            <Skeleton height="260px" style={{ marginTop: "var(--space-sm)" }} />
          </div>
        </div>
      </div>
    );
  }

  if (data.error) {
    return (
      <div className="sfdc-portal">
        <PortalUtilityBar />
        <PortalHero
          align="left"
          title={tenantName}
          subtitle={`${companyLabel} Portal`}
        />
        <div className="ds-container" style={{ paddingBlock: "var(--space-xl)" }}>
          <div className="ds-card ds-card--compact">
            <div className="ds-card__header">
              <div>
                <div className="ds-card__title">We hit a snag loading metrics</div>
                <div className="ds-card__meta">Error details are below. Retry shortly or refresh the page.</div>
              </div>
              <InfoTooltip content="These metrics fetch live once the API integration is configured." placement="top" />
            </div>
            <pre className="ds-card__meta" style={{ whiteSpace: "pre-wrap" }}>Error: {data.error}</pre>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="sfdc-portal">
      <PortalUtilityBar />
      <PortalHero
        align="left"
        title={tenantName}
        subtitle={`${companyLabel} Portal`}
      />

      <main className="sfdc-grid">
        {metricCards.map((metric, index) => (
          <div
            key={metric.key}
            className="sfdc-card ds-card ds-card--compact ds-card--interactive fade-in"
            style={{ animationDelay: `${40 + index * 40}ms` }}
          >
            <div className="ds-card__header">
              <div className="ds-inline">
                <span className="ds-icon-mask">
                  <Icon name={metric.icon} size={18} aria-hidden="true" />
                </span>
                <div>
                  <div className="ds-card__title">{metric.title}</div>
                  <div className="ds-card__meta">{metric.hint}</div>
                </div>
              </div>
              <InfoTooltip content={metric.tooltip} placement="top" />
            </div>
            <div className="ds-heading-xl">{metric.formattedValue}</div>
          </div>
        ))}

        <div className="sfdc-card sfdc-card--full ds-card ds-card--compact slide-up" style={{ animationDelay: "200ms" }}>
          <div className="ds-card__header">
            <div>
              <div className="ds-card__title">Metrics overview</div>
              <div className="ds-card__meta">Snapshot of key signals this week.</div>
            </div>
            <InfoTooltip content="Sample chart data until live metrics are wired up." placement="top" />
          </div>
          <div className="sfdc-card__body">
            <D3BarChart
              height={260}
              data={[
                { label: "BUR", value: data.bur },
                { label: "RAF", value: data.raf },
                { label: "Members", value: data.memberCount },
                { label: "Gaps", value: data.gaps },
              ]}
            />
          </div>
        </div>
      </main>

      <footer className="sfdc-footer">
        <p>&copy; 2025 Nexora - Multi-tenant Analytics Platform</p>
      </footer>
    </div>
  );
};

export default Dashboard;

