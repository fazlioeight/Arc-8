import React, { useCallback, useEffect, useState } from 'react';

import ProviderMap from '../components/ProviderMap';
import { Card, EmptyState, Field, Spinner, StatusBadge } from '../components/ui';
import * as api from '../services/memberApi';
import { useI18n } from '../i18n/I18nContext';
import { titleCase } from '../utils/format';

export default function Providers() {
  const { t } = useI18n();
  const [filters, setFilters] = useState({ specialty: '', name: '', zip: '', pcp: false });
  const [results, setResults] = useState({ items: [], origin: null });
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [mapKey, setMapKey] = useState('');

  useEffect(() => {
    // Fetch the public browser Maps key (server-side geocoding key stays server-side).
    api.getMapConfig().then((c) => setMapKey(c.has_key ? c.maps_api_key : '')).catch(() => setMapKey(''));
  }, []);

  const runSearch = useCallback(async (e) => {
    if (e) e.preventDefault();
    setLoading(true);
    setSearched(true);
    try {
      const params = {};
      if (filters.specialty) params.specialty = filters.specialty;
      if (filters.name) params.name = filters.name;
      if (filters.zip) params.zip = filters.zip;
      if (filters.pcp) params.pcp = true;
      // PRIVACY: only the specialty/name/ZIP the member typed is sent. No identity.
      const data = await api.searchProviders(params);
      setResults({ items: data.items || [], origin: data.origin || null });
    } catch {
      setResults({ items: [], origin: null });
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const set = (key) => (e) =>
    setFilters((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{t('providers.title')}</h1>
        <p className="text-sm text-canvas-muted">{t('providers.subtitle')}</p>
      </div>

      <Card>
        <form onSubmit={runSearch} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-4 items-end">
          <Field id="specialty" label={t('providers.specialty')}>
            <input id="specialty" className="mp-input" value={filters.specialty} onChange={set('specialty')} />
          </Field>
          <Field id="name" label={t('providers.name')}>
            <input id="name" className="mp-input" value={filters.name} onChange={set('name')} />
          </Field>
          <Field id="zip" label={t('providers.location')}>
            <input id="zip" className="mp-input" value={filters.zip} onChange={set('zip')} inputMode="numeric" />
          </Field>
          <div className="mb-4">
            <label className="flex items-center gap-2 text-sm mb-2">
              <input type="checkbox" checked={filters.pcp} onChange={set('pcp')} className="rounded border-canvas-border" />
              {t('providers.pcpOnly')}
            </label>
            <button type="submit" className="mp-btn-primary w-full">
              {t('providers.search')}
            </button>
          </div>
        </form>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          {loading ? (
            <Spinner />
          ) : !searched ? (
            <Card>
              <EmptyState message={t('providers.subtitle')} />
            </Card>
          ) : results.items.length === 0 ? (
            <Card>
              <EmptyState message={t('providers.none')} />
            </Card>
          ) : (
            <ul className="space-y-3">
              {results.items.map((p) => (
                <li key={p.id}>
                  <Card>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold truncate">{p.name}</h3>
                          {p.is_pcp && <StatusBadge status="active" label={t('providers.pcpBadge')} />}
                        </div>
                        <p className="text-sm text-canvas-muted">{titleCase(p.specialty)}</p>
                        {p.locations?.[0] && (
                          <p className="text-sm text-canvas-muted mt-1">
                            {[p.locations[0].address_line1, p.locations[0].city, p.locations[0].state, p.locations[0].postal_code]
                              .filter(Boolean)
                              .join(', ')}
                          </p>
                        )}
                        {p.accepting_new_patients && (
                          <p className="text-xs text-green-700 mt-1">{t('providers.acceptingNew')}</p>
                        )}
                      </div>
                      {p.nearest_distance_miles != null && (
                        <span className="text-sm font-medium whitespace-nowrap">
                          {t('providers.distance', { miles: p.nearest_distance_miles.toFixed(1) })}
                        </span>
                      )}
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="lg:sticky lg:top-4 self-start w-full">
          <ProviderMap apiKey={mapKey} providers={results.items} origin={results.origin} />
        </div>
      </div>
    </div>
  );
}
