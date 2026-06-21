import { useEffect, useState } from 'react';

// Loads the Google Maps JS API exactly once with the public (referrer-restricted)
// browser key fetched from the backend. Returns { status }. PRIVACY: the only
// data the Maps script receives is provider coordinates and the member's chosen
// search location — never member identity.

let loadPromise = null;

function loadScript(apiKey) {
  if (window.google && window.google.maps) return Promise.resolve();
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places`;
    s.async = true;
    s.defer = true;
    s.onload = resolve;
    s.onerror = () => reject(new Error('maps_failed'));
    document.head.appendChild(s);
  });
  return loadPromise;
}

export default function useGoogleMaps(apiKey) {
  const [status, setStatus] = useState(() =>
    window.google && window.google.maps ? 'ready' : apiKey ? 'loading' : 'unavailable'
  );

  useEffect(() => {
    if (!apiKey) {
      setStatus('unavailable');
      return;
    }
    if (window.google && window.google.maps) {
      setStatus('ready');
      return;
    }
    let cancelled = false;
    loadScript(apiKey)
      .then(() => !cancelled && setStatus('ready'))
      .catch(() => !cancelled && setStatus('unavailable'));
    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  return { status };
}
