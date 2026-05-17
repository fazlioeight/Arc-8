import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import PortalPageLayout from "../../../components/PortalPageLayout";
import AlertShell from "../../../components/ui/AlertShell";
import FilterDropdown from "../../../components/ui/FilterDropdown";
import SavedViewsBar from "../../../components/ui/SavedViewsBar";
import SearchInput from "../../../components/ui/SearchInput";
import { LoadingState, ErrorState } from "../../../components/ehr/Primitives";
import { AuthContext } from "../../../context/AuthContext";
import { useUserPreferences } from "../../../context/UserPreferencesContext";
import { fetchCodingProviders } from "../../../services/codingService";
import { PORTAL_NAV_ITEMS } from "../portal_page/portalNavItems";
import { ROUTES } from "../../../constants/routes";
import "../../../styles/memberWorkspace.css";

const SAVED_VIEWS = [
  { key: "all", label: "All providers" },
  { key: "with_npi", label: "Has NPI", hasNpi: true },
  { key: "with_taxid", label: "Has Tax ID", hasTaxId: true },
];

const ProvidersPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { token, tenant, isAuthenticated } = useContext(AuthContext) || {};
  const { getViewPreference, recordViewPreference } = useUserPreferences();
  const canQuery = useMemo(() => Boolean(token && tenant), [token, tenant]);

  const [providers, setProviders] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [activeView, setActiveView] = useState("all");
  const [hasNpi, setHasNpi] = useState(false);
  const [hasTaxId, setHasTaxId] = useState(false);

  const loadProviders = useCallback(
    async (term = search) => {
      if (!canQuery) return;
      setLoading(true);
      setError(null);
      try {
        const response = await fetchCodingProviders(token, tenant, { search: term });
        setProviders(response.items || []);
        setTotal(response.total || (response.items || []).length);
      } catch (err) {
        setError(err.message || "Unable to load providers");
      } finally {
        setLoading(false);
      }
    },
    [canQuery, search, tenant, token]
  );

  useEffect(() => {
    if (!isAuthenticated || !canQuery) return;
    const saved = getViewPreference("providers");
    const initialSearch = saved?.search || "";
    setSearch(initialSearch);
    void loadProviders(initialSearch);
  }, [isAuthenticated, canQuery, getViewPreference, loadProviders]);

  const applySavedView = (key) => {
    const view = SAVED_VIEWS.find((v) => v.key === key);
    setActiveView(key);
    setHasNpi(Boolean(view?.hasNpi));
    setHasTaxId(Boolean(view?.hasTaxId));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    recordViewPreference("providers", { search });
    void loadProviders(search);
  };

  const openProvider = (providerId) => {
    if (!providerId) return;
    navigate(`${ROUTES.PROVIDERS.LANDING}/${encodeURIComponent(providerId)}`, {
      state: { from: `${location.pathname}${location.search}` },
    });
  };

  const filtered = useMemo(() => {
    return providers.filter((p) => {
      if (hasNpi && !p.npi) return false;
      if (hasTaxId && !p.tax_id) return false;
      return true;
    });
  }, [providers, hasNpi, hasTaxId]);

  const activeFilterCount = (hasNpi ? 1 : 0) + (hasTaxId ? 1 : 0);

  return (
    <PortalPageLayout
      eyebrow="Providers"
      title="Provider directory"
      subtitle="Search providers and open a record to review profile, locations, and contact information."
      navItems={PORTAL_NAV_ITEMS}
      currentNav="providers"
      navProps={{ align: "center", tone: "surface" }}
      maxWidthClassName="max-w-7xl"
      mainClassName="space-y-4"
    >
      {!isAuthenticated && (
        <AlertShell tone="warning" title="Authentication required" description="Sign in to load provider data." />
      )}

      <SavedViewsBar views={SAVED_VIEWS} activeKey={activeView} onChange={applySavedView} />

      <section className="coding-surface rounded-2xl shadow-sm">
        <form className="p-3 flex flex-col lg:flex-row gap-2 lg:items-center" onSubmit={handleSubmit}>
          <SearchInput
            placeholder="Search name, NPI, or tax ID"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            disabled={!canQuery}
          />
          <button
            type="submit"
            disabled={loading || !canQuery}
            className="rounded-md bg-[var(--brand-primary)] text-white px-3 py-2 text-sm font-semibold hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Searching..." : "Search"}
          </button>
        </form>

        <div className="border-t coding-border px-3 py-2 flex flex-wrap items-center gap-1.5 text-xs">
          <FilterDropdown label="Identifiers" count={activeFilterCount}>
            <div className="flex flex-col gap-1 min-w-[180px]">
              <label className="flex items-center gap-2 px-2 py-1 rounded hover:bg-[var(--coding-hover)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasNpi}
                  onChange={() => setHasNpi((v) => !v)}
                  className="accent-[var(--brand-primary)]"
                />
                <span className="coding-text-strong">Has NPI</span>
              </label>
              <label className="flex items-center gap-2 px-2 py-1 rounded hover:bg-[var(--coding-hover)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasTaxId}
                  onChange={() => setHasTaxId((v) => !v)}
                  className="accent-[var(--brand-primary)]"
                />
                <span className="coding-text-strong">Has Tax ID</span>
              </label>
            </div>
          </FilterDropdown>
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={() => applySavedView("all")}
              className="ml-1 text-xs font-medium text-[var(--brand-primary)] hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      </section>

      {error && <ErrorState title="Unable to load providers" description={error} />}

      {!error && loading && providers.length === 0 && (
        <LoadingState title="Loading providers" />
      )}

      {!error && (loading || providers.length > 0) && (
        <section className="coding-surface rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 flex items-center justify-between text-xs coding-text-muted border-b coding-border">
            <span>
              {filtered.length} provider{filtered.length === 1 ? "" : "s"}
              {total !== filtered.length ? ` of ${total}` : ""}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wider coding-text-muted">
                <tr className="border-b coding-border">
                  <th className="text-left px-4 py-2.5 font-semibold">Provider</th>
                  <th className="text-left px-3 py-2.5 font-semibold">NPI</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Tax ID</th>
                  <th className="text-right px-3 py-2.5 font-semibold">Members</th>
                  <th className="text-right px-3 py-2.5 font-semibold">Open gaps</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr
                    key={p.id}
                    className="cursor-pointer border-b coding-border-subtle hover:bg-[var(--coding-hover)] transition"
                    onClick={() => openProvider(p.id)}
                  >
                    <td className="px-4 py-3">
                      <p className="coding-text-strong font-medium">{p.name || "Unknown"}</p>
                      <p className="text-[11px] coding-text-muted font-mono">{p.id}</p>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs coding-text-strong">{p.npi || <span className="coding-text-soft">—</span>}</td>
                    <td className="px-3 py-3 font-mono text-xs coding-text-strong">{p.tax_id || <span className="coding-text-soft">—</span>}</td>
                    <td className="px-3 py-3 text-right tabular-nums coding-text-strong">{p.member_count ?? 0}</td>
                    <td className="px-3 py-3 text-right tabular-nums coding-text-strong">{p.open_gaps ?? 0}</td>
                  </tr>
                ))}
                {filtered.length === 0 && !loading && (
                  <tr><td colSpan={5} className="px-3 py-12 text-center text-sm coding-text-soft">No providers match the current filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </PortalPageLayout>
  );
};

export default ProvidersPage;
