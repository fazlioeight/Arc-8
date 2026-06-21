import React, { useEffect, useRef } from 'react';

import useGoogleMaps from '../hooks/useGoogleMaps';
import { useI18n } from '../i18n/I18nContext';

// Renders provider locations + the search origin on a Google map. Falls back to
// a neutral placeholder when no browser key is configured or the script fails.
export default function ProviderMap({ apiKey, providers, origin, activeId }) {
  const { t } = useI18n();
  const { status } = useGoogleMaps(apiKey);
  const ref = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);

  useEffect(() => {
    if (status !== 'ready' || !ref.current || !window.google) return;
    if (!mapRef.current) {
      mapRef.current = new window.google.maps.Map(ref.current, {
        center: origin ? { lat: origin.latitude, lng: origin.longitude } : { lat: 39.5, lng: -98.35 },
        zoom: origin ? 10 : 4,
        mapTypeControl: false,
        streetViewControl: false,
      });
    }
    const map = mapRef.current;

    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    const bounds = new window.google.maps.LatLngBounds();
    let hasPoint = false;

    if (origin) {
      const o = new window.google.maps.Marker({
        position: { lat: origin.latitude, lng: origin.longitude },
        map,
        title: '★',
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 7,
          fillColor: '#0a66c2',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
        },
      });
      markersRef.current.push(o);
      bounds.extend(o.getPosition());
      hasPoint = true;
    }

    providers.forEach((p) => {
      (p.locations || []).forEach((loc) => {
        if (loc.latitude == null || loc.longitude == null) return;
        const marker = new window.google.maps.Marker({
          position: { lat: loc.latitude, lng: loc.longitude },
          map,
          title: p.name,
        });
        markersRef.current.push(marker);
        bounds.extend(marker.getPosition());
        hasPoint = true;
      });
    });

    if (hasPoint && (providers.length > 1 || origin)) {
      map.fitBounds(bounds);
    }
  }, [status, providers, origin, activeId]);

  if (status === 'unavailable') {
    return (
      <div className="mp-card h-72 flex items-center justify-center text-sm text-canvas-muted" role="img" aria-label={t('providers.mapUnavailable')}>
        {t('providers.mapUnavailable')}
      </div>
    );
  }

  return <div ref={ref} className="mp-card h-72 md:h-[28rem] w-full" aria-label="Provider map" role="application" />;
}
