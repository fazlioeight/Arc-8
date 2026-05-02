import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import PortalPageLayout from "../../../components/PortalPageLayout";
import PortalPageHeader from "../../../components/PortalPageHeader";
import PortalCard from "../../../components/PortalCard";
import PortalStat from "../../../components/PortalStat";
import { AuthContext } from "../../../context/AuthContext";
import { useUserPreferences } from "../../../context/UserPreferencesContext";
import { fetchCodingProviderDetail, fetchCodingProviders } from "../../../services/codingService";
import InfoTooltip from "../../../components/ui/InfoTooltip";
import AlertShell from "../../../components/ui/AlertShell";
import "../coding/member/memberWorkspace.css";
import { CODING_NAV_ITEMS } from "./codingNavItems";

const CodingProvidersPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { token, tenant, isAuthenticated } = useContext(AuthContext) || {};
  const { getViewPreference, recordViewPreference } = useUserPreferences();
  const canQuery = useMemo(() => token && tenant, [token, tenant]);

  const [providers, setProviders] = useState([]);
  const [total, setTotal] = useState(0);
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");

  const loadProviders = useCallback(
    async (term = search) => {
      if (!canQuery) return;
      setLoading(true);
      setError(null);
      try {
        const response = await fetchCodingProviders(token, tenant, { search: term });
        setProviders(response.items || []);
        setTotal(response.total || 0);
      } catch (err) {
        setError(err.message || "Unable to load providers");
      } finally {
        setLoading(false);
      }
    },
    [canQuery, search, tenant, token]
  );

  const selectProvider = useCallback(
    async (providerId) => {
      if (!canQuery || !providerId) return;
      setDetailLoading(true);
      setError(null);
      try {
        const detail = await fetchCodingProviderDetail(token, tenant, providerId);
        setSelectedProvider(detail);
        recordViewPreference("coding-providers", { search, lastSelected: providerId });
      } catch (err) {
        setError(err.message || "Unable to load provider detail");
      } finally {
        setDetailLoading(false);
      }
    },
    [canQuery, recordViewPreference, search, tenant, token]
  );

  useEffect(() => {
    if (!isAuthenticated || !canQuery) return;
    const saved = getViewPreference("coding-providers");
    const initialSearch = saved?.search || "";
    setSearch(initialSearch);
    void loadProviders(initialSearch);
    if (saved?.lastSelected) {
      void selectProvider(saved.lastSelected);
    }
  }, [isAuthenticated, canQuery, getViewPreference, loadProviders, selectProvider]);

  const handleSubmit = (event) => {
    event.preventDefault();
    recordViewPreference("coding-providers", { search, lastSelected: selectedProvider?.id });
    void loadProviders(search);
  };

  const layoutProps = useMemo(
    () => ({
      backgroundClassName:
        "",
      maxWidthClassName: "max-w-6xl",
      paddingClassName: "px-4",
      navItems: CODING_NAV_ITEMS,
      currentNav: "providers",
      utilityBar: true,
    }),
    []
  );

  const headerContent = (
    <PortalPageHeader
      eyebrow="Coding"
      title="Coding providers"
      subtitle="Search providers, open details, and pivot to assignments."
      actions={
        <div className="flex flex-wrap items-center gap-3">
          <PortalStat label="Providers" value={total} meta="Matching" tone="info" />
          <PortalStat label="Selected" value={selectedProvider ? 1 : 0} meta="Detail" tone="success" />
          <PortalStat label="Status" value={loading ? "Loading" : "Ready"} meta="State" tone={loading ? "warning" : "info"} />
        </div>
      }
    />
  );

  return (
    <PortalPageLayout {...layoutProps} headerContent={headerContent}>
      {!isAuthenticated ? (
        <PortalCard tone="warning" title="Authentication required" subtitle="Sign in to load provider data." />
      ) : null}

      <PortalCard
        title="Filters"
        subtitle="Search by provider name, NPI, or tax ID."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button className="portal-ghost-button" onClick={() => void loadProviders(search)} disabled={loading || !canQuery}>
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        }
      >
        <form onSubmit={handleSubmit} className="portal-section-grid">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300" htmlFor="provider-search">
              Provider search
            </label>
            <input
              id="provider-search"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-inner outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-sky-400 dark:focus:ring-sky-500/40"
              placeholder="Name, NPI, or tax ID"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              disabled={!canQuery}
            />
          </div>
          <div className="flex items-end">
            <button type="submit" className="portal-ghost-button" disabled={loading || !canQuery}>
              {loading ? "Searching..." : "Search"}
            </button>
          </div>
        </form>
        {error ? <AlertShell tone="danger" title="Unable to load providers" description={error} className="mt-3" /> : null}
      </PortalCard>

      <PortalCard
        title="Providers"
        subtitle="Select a row to view provider details."
        actions={<span className="portal-pill portal-pill--ghost">{total} result(s)</span>}
      >
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Provider</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">NPI</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Tax ID</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Members</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {loading && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-300">
                    Loading providers...
                  </td>
                </tr>
              )}
              {!loading && providers.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-300">
                    No providers match the current filters.
                  </td>
                </tr>
              )}
              {providers.map((provider) => (
                <tr key={provider.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                  <td className="px-4 py-3 text-slate-900 dark:text-slate-100">
                    <div className="font-semibold">{provider.name || "Unknown"}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-300">{provider.id}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-900 dark:text-slate-100">{provider.npi || "-"}</td>
                  <td className="px-4 py-3 text-slate-900 dark:text-slate-100">{provider.tax_id || "-"}</td>
                  <td className="px-4 py-3 text-slate-900 dark:text-slate-100">{provider.member_count ?? "-"}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      className="portal-ghost-button"
                      onClick={() => {
                        setSelectedProvider(null);
                        void selectProvider(provider.id);
                      }}
                    >
                      View detail
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PortalCard>

      <PortalCard
        title={selectedProvider ? selectedProvider.name || "Provider detail" : "Provider detail"}
        subtitle={selectedProvider ? selectedProvider.npi || selectedProvider.tax_id || selectedProvider.id : "Select a provider to view details"}
      >
        {detailLoading && (
          <div className="text-sm text-slate-500 dark:text-slate-300">Loading provider detail...</div>
        )}
        {!detailLoading && !selectedProvider ? (
          <AlertShell
            tone="info"
            title="Select a provider"
            description="Choose a row above to preview provider detail and navigate to assignments."
          />
        ) : null}
        {!detailLoading && selectedProvider ? (
          <div className="space-y-3 text-sm text-slate-800 dark:text-slate-100">
            <div className="flex flex-wrap items-center gap-2">
              <span className="portal-pill portal-pill--ghost">{selectedProvider.tax_id || "No tax ID"}</span>
              <InfoTooltip id="provider-id" text={`Provider ID: ${selectedProvider.id}`} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-300">NPI</div>
                <div className="font-semibold">{selectedProvider.npi || "Not provided"}</div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-300">Tax ID</div>
                <div className="font-semibold">{selectedProvider.tax_id || "Not provided"}</div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-300">Members</div>
                <div className="font-semibold">{selectedProvider.member_count ?? "-"}</div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-300">Assigned queue</div>
                <div className="font-semibold">{selectedProvider.queue_name || "Not assigned"}</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className="portal-ghost-button"
                onClick={() =>
                  navigate(`/coding/providers/${encodeURIComponent(selectedProvider.id)}`, {
                    state: {
                      from: `${location.pathname}${location.search}`,
                      breadcrumb: selectedProvider.name || selectedProvider.id,
                    },
                  })
                }
              >
                Open provider page
              </button>
            </div>
          </div>
        ) : null}
      </PortalCard>
    </PortalPageLayout>
  );
};

export default CodingProvidersPage;
