import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import PortalPageLayout from '../../../components/PortalPageLayout';
import RecordHeader from '../../../components/ui/RecordHeader';
import PropertyList, { PropertyRow, PropertySection } from '../../../components/ui/PropertyList';
import AlertShell from '../../../components/ui/AlertShell';
import { LoadingState, ErrorState } from '../../../components/ehr/Primitives';
import { AuthContext } from '../../../context/AuthContext';
import { fetchCodingProviderDetail, fetchCodingProviders, updateCodingProvider } from '../../../services/codingService';
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

  const saveProviderField = (field) => async (value) => {
    if (!provider?.id) return;
    // Provider PATCH endpoint expects top-level contact fields. Location is
    // stored on the provider record as flat columns (address_line1/city/etc.),
    // so we route those through the same call.
    const payload = { [field]: value === '' ? null : value };
    const updated = await updateCodingProvider(token, tenant, provider.id, payload);
    setProvider((prev) => ({ ...(prev || {}), ...(updated || {}) }));
  };

  const locationText = useMemo(() => {
    if (!provider?.location) return null;
    return [
      provider.location.address_line1,
      provider.location.city,
      provider.location.state,
      provider.location.postal_code,
    ].filter(Boolean).join(', ');
  }, [provider]);

  if (!isAuthenticated) {
    return (
      <PortalPageLayout
        eyebrow="Providers"
        title="Authentication required"
        navItems={PORTAL_NAV_ITEMS}
        currentNav="providers"
        navProps={{ align: 'center', tone: 'surface' }}
        maxWidthClassName="max-w-5xl"
      >
        <AlertShell tone="warning" title="Authentication required" description="You must be logged in to view provider information." />
      </PortalPageLayout>
    );
  }

  if (loading && !provider) {
    return (
      <PortalPageLayout
        eyebrow="Providers"
        title="Loading provider"
        navItems={PORTAL_NAV_ITEMS}
        currentNav="providers"
        navProps={{ align: 'center', tone: 'surface' }}
        maxWidthClassName="max-w-7xl"
      >
        <LoadingState title="Loading provider" />
      </PortalPageLayout>
    );
  }

  if (error || !provider) {
    return (
      <PortalPageLayout
        eyebrow="Providers"
        title="Provider unavailable"
        navItems={PORTAL_NAV_ITEMS}
        currentNav="providers"
        navProps={{ align: 'center', tone: 'surface' }}
        maxWidthClassName="max-w-5xl"
        mainClassName="space-y-4"
      >
        <ErrorState title="Could not open provider" description={error || 'Provider not found'} />
        <button
          type="button"
          onClick={() => navigate(ROUTES.PROVIDERS.LANDING)}
          className="rounded-md bg-[var(--brand-primary)] text-white px-3 py-1.5 text-xs font-semibold hover:bg-brand-700"
        >
          Back to providers
        </button>
      </PortalPageLayout>
    );
  }

  const meta = [
    provider.npi && `NPI ${provider.npi}`,
    provider.tax_id && `Tax ID ${provider.tax_id}`,
    provider.location?.city && provider.location?.state && `${provider.location.city}, ${provider.location.state}`,
  ].filter(Boolean);

  const badges = (
    <>
      {provider.member_count != null && provider.member_count > 0 && (
        <span className="inline-flex items-center rounded-full bg-brand-50 text-[var(--brand-primary)] ring-1 ring-brand-200 px-2 py-0.5 text-[11px] font-semibold dark:bg-brand-900/20 dark:ring-brand-800/60">
          {provider.member_count} member{provider.member_count === 1 ? '' : 's'}
        </span>
      )}
      {provider.open_gaps != null && provider.open_gaps > 0 && (
        <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 ring-1 ring-amber-200 px-2 py-0.5 text-[11px] font-semibold dark:bg-amber-900/30 dark:text-amber-200 dark:ring-amber-700/40">
          {provider.open_gaps} open gap{provider.open_gaps === 1 ? '' : 's'}
        </span>
      )}
    </>
  );

  const rightSlot = (
    <button
      type="button"
      onClick={() => navigate(ROUTES.PROVIDERS.LANDING)}
      className="rounded-md ring-1 coding-border coding-text-strong bg-transparent hover:bg-[var(--coding-hover)] px-2.5 py-1.5 text-xs font-semibold"
    >
      Providers
    </button>
  );

  return (
    <PortalPageLayout
      eyebrow="Providers"
      title={provider.name || 'Provider workspace'}
      navItems={PORTAL_NAV_ITEMS}
      currentNav="providers"
      navProps={{ align: 'center', tone: 'surface' }}
      maxWidthClassName="max-w-7xl"
      mainClassName="space-y-4"
      hideHeader
    >
      <RecordHeader
        title={provider.name || 'Provider'}
        meta={meta}
        badges={badges}
        rightSlot={rightSlot}
      />

      {referral?.fromMemberId && (
        <AlertShell
          tone="info"
          title="Linked from member"
          description={`Member #${referral.fromMemberId}${referral.providerName ? ` (${referral.providerName})` : ''}`}
        />
      )}

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-4 space-y-4">
          <section className="coding-surface rounded-2xl shadow-sm overflow-hidden">
            <header className="px-4 py-2.5 border-b coding-border flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-[0.14em] coding-text-muted">About this provider</h3>
            </header>
            <dl>
              <PropertyRow label="Name" value={provider.name} onEdit={saveProviderField('name')} />
              <PropertyRow label="NPI" value={provider.npi} onEdit={saveProviderField('npi')} />
              <PropertyRow label="Tax ID" value={provider.tax_id} onEdit={saveProviderField('tax_id')} />
              <PropertyRow label="Phone" value={provider.phone} type="tel" onEdit={saveProviderField('phone')} />
              <PropertyRow
                label="Email"
                value={provider.email}
                type="email"
                validate={(v) => v && !/.+@.+\..+/.test(v) ? 'Enter a valid email' : null}
                onEdit={saveProviderField('email')}
              />
            </dl>

            <PropertySection title="Location">
              <dl>
                <PropertyRow label="Address" value={provider.location?.address_line1} onEdit={saveProviderField('address_line1')} />
                <PropertyRow label="City" value={provider.location?.city} onEdit={saveProviderField('city')} />
                <PropertyRow
                  label="State"
                  value={provider.location?.state}
                  validate={(v) => v && v.length !== 2 ? 'Use 2-letter state code' : null}
                  onEdit={saveProviderField('state')}
                />
                <PropertyRow label="Postal" value={provider.location?.postal_code} onEdit={saveProviderField('postal_code')} />
              </dl>
            </PropertySection>
          </section>
        </div>

        <div className="col-span-12 lg:col-span-8 space-y-4">
          <section className="coding-surface rounded-2xl shadow-sm p-5">
            <header className="flex items-start justify-between gap-3 mb-3">
              <div>
                <h3 className="text-sm font-semibold coding-text-strong">Provider snapshot</h3>
                <p className="text-xs coding-text-soft">High-level numbers for this provider's panel.</p>
              </div>
            </header>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <SnapshotTile label="Members" value={provider.member_count ?? 0} />
              <SnapshotTile label="Open gaps" value={provider.open_gaps ?? 0} />
              <SnapshotTile label="MAO records" value={provider.mao_records ?? '—'} />
              <SnapshotTile label="Last contacted" value={provider.last_contacted_at ? new Date(provider.last_contacted_at).toLocaleDateString() : '—'} />
            </div>
          </section>

          <section className="coding-surface rounded-2xl shadow-sm p-5">
            <header className="flex items-start justify-between gap-3 mb-3">
              <div>
                <h3 className="text-sm font-semibold coding-text-strong">Address</h3>
                <p className="text-xs coding-text-soft">Primary location on record.</p>
              </div>
            </header>
            {locationText ? (
              <p className="text-sm coding-text-strong">{locationText}</p>
            ) : (
              <p className="text-sm coding-text-soft italic">No address on file.</p>
            )}
          </section>
        </div>
      </div>
    </PortalPageLayout>
  );
};

function SnapshotTile({ label, value }) {
  return (
    <div className="coding-surface-subtle rounded-lg px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wider coding-text-muted">{label}</p>
      <p className="mt-0.5 text-lg font-semibold coding-text-strong tabular-nums">{value}</p>
    </div>
  );
}

export default ProviderDetailPage;
