import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import PortalPageLayout from '../../../components/PortalPageLayout';
import PortalPageHeader from '../../../components/PortalPageHeader';
import PortalCard from '../../../components/PortalCard';
import PortalStat from '../../../components/PortalStat';
import { AuthContext } from '../../../context/AuthContext';
import { fetchCodingProviderDetail, fetchCodingProviders } from '../../../services/codingService';
import BackLink from '../../../components/BackLink';
import AlertShell from '../../../components/ui/AlertShell';
import { PORTAL_NAV_ITEMS } from '../portal_page/portalNavItems';
import { ROUTES } from '../../../constants/routes';
import '../../../styles/memberWorkspace.css';

const ProviderDetailPage = () => {
  const navigate = useNavigate();
  const location = useLocation();

  let params = {};
  try {
    params = useParams();
  } catch (err) {
    params = {};
  }
  let providerId = params?.providerId;
  if (!providerId) {
    const pieces = (location?.pathname || '').split('/').filter(Boolean);
    providerId = pieces[pieces.length - 1];
  }
  const { token, tenant, isAuthenticated } = useContext(AuthContext) || {};

  const [provider, setProvider] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const canQuery = useMemo(() => Boolean(token && tenant && providerId), [token, tenant, providerId]);
  const referralFromState = location.state;
  const query = new URLSearchParams(location.search);
  const referral = referralFromState || (
    query.has('fromMemberId')
      ? {
          fromMemberId: Number(query.get('fromMemberId')),
          providerName: query.get('providerName') || undefined,
          providerNpi: query.get('providerNpi') || undefined,
        }
      : undefined
  );

  const loadProvider = async () => {
    if (!canQuery) return;
    setLoading(true);
    setError(null);
    try {
      const decodedKey = decodeURIComponent(providerId);
      let lookupId = decodedKey;
      if (!/^\d+$/.test(decodedKey)) {
        const response = await fetchCodingProviders(token, tenant, { search: decodedKey });
        const items = response.items || [];
        if (items.length === 0) {
          throw new Error('Provider not found');
        }
        const normalizedKey = decodedKey.toLowerCase();
        const best =
          items.find((item) => {
            const npiMatch = item.npi && item.npi.toLowerCase() === normalizedKey;
            const nameMatch = item.name && item.name.toLowerCase() === normalizedKey;
            return npiMatch || nameMatch;
          }) || items[0];
        lookupId = best.id;
      }
      const detail = await fetchCodingProviderDetail(token, tenant, lookupId);
      setProvider(detail);
    } catch (err) {
      setError(err.message || 'Unable to load provider');
      setProvider(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated || !canQuery) return;
    void loadProvider();
    // eslint-disable-next-line
  }, [isAuthenticated, canQuery]);

  const layoutProps = useMemo(
    () => ({
      backgroundClassName: '',
      maxWidthClassName: 'max-w-5xl',
      paddingClassName: 'px-4',
      navItems: PORTAL_NAV_ITEMS,
      currentNav: 'providers',
      navProps: { align: 'center', tone: 'surface' },
    }),
    []
  );

  const headerContent = (
    <PortalPageHeader
      eyebrow="Providers"
      title={provider?.name || 'Provider workspace'}
      subtitle="Review partner profiles, locations, and contact information."
      actions={
        <div className="flex flex-wrap items-center gap-3">
          <PortalStat label="Members" value={provider?.member_count ?? 0} meta="Panel" tone="info" />
          <PortalStat label="Open gaps" value={provider?.open_gaps ?? 0} meta="Pending" tone="warning" />
          <PortalStat label="ID" value={provider ? provider.id : '-'} meta="Provider" tone="success" />
        </div>
      }
    />
  );

  return (
    <PortalPageLayout {...layoutProps} headerContent={headerContent}>
      {!isAuthenticated ? (
        <PortalCard tone="warning" title="Authentication required" subtitle="You must be logged in to view provider information." />
      ) : null}

      <PortalCard
        title="Navigation"
        subtitle="Jump back to the provider directory or previous page."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button className="portal-ghost-button" onClick={() => navigate(-1)}>&larr; Back</button>
            <button className="portal-ghost-button" onClick={() => navigate(ROUTES.PROVIDERS.LANDING)}>
              Browse providers
            </button>
          </div>
        }
      >
        <BackLink fallback={ROUTES.PROVIDERS.LANDING}>Back to provider directory</BackLink>
        {referral?.fromMemberId ? (
          <AlertShell
            tone="info"
            title="Linked from member"
            description={`Member #${referral.fromMemberId}${referral.providerName ? ` (${referral.providerName})` : ''}`}
            className="mt-3"
          />
        ) : null}
      </PortalCard>

      {error ? (
        <PortalCard tone="danger" title="Unable to load provider" subtitle={error} />
      ) : null}

      <PortalCard
        title={provider?.name || 'Provider details'}
        subtitle={provider ? provider.npi || provider.tax_id || provider.id : 'Select a provider'}
      >
        {loading && <div className="text-sm text-slate-500 dark:text-slate-300">Loading provider detail...</div>}
        {!loading && !provider && !error ? (
          <AlertShell tone="warning" title="Provider details are unavailable." />
        ) : null}
        {!loading && provider ? (
          <div className="space-y-4 text-sm text-slate-800 dark:text-slate-100">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-300">Tax ID</div>
                <div className="font-semibold">{provider.tax_id || 'Not provided'}</div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-300">NPI</div>
                <div className="font-semibold">{provider.npi || 'Not provided'}</div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-300">Members</div>
                <div className="font-semibold">{provider.member_count ?? '-'}</div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-300">Assigned queue</div>
                <div className="font-semibold">{provider.queue_name || 'Not assigned'}</div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-300">Location</div>
              <div className="font-semibold">
                {provider.location
                  ? [
                      provider.location.address_line1,
                      provider.location.city,
                      provider.location.state,
                      provider.location.postal_code,
                    ]
                      .filter(Boolean)
                      .join(', ')
                  : 'Not provided'}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button className="portal-ghost-button" onClick={() => navigate(ROUTES.PROVIDERS.LANDING)}>
                Back to provider list
              </button>
            </div>
          </div>
        ) : null}
      </PortalCard>
    </PortalPageLayout>
  );
};

export default ProviderDetailPage;
