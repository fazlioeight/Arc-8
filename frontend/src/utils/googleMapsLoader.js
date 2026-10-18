let googleMapsPromise;

const getGoogleMapsApiKey = () => process.env.REACT_APP_GOOGLE_MAPS_API_KEY;

export const loadGoogleMapsApi = (libraries = ["places"]) => {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Maps API is only available in the browser"));
  }

  const apiKey = getGoogleMapsApiKey();

  if (!apiKey) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("Missing REACT_APP_GOOGLE_MAPS_API_KEY env var; autocomplete disabled.");
    }

    return Promise.reject(new Error("Missing Google Maps API key"));
  }

  if (window.google && window.google.maps && window.google.maps.places) {
    return Promise.resolve(window.google);
  }

  if (!googleMapsPromise) {
    googleMapsPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=${libraries.join(",")}`;
      script.async = true;
      script.defer = true;
      script.setAttribute("data-google-maps", "loader");
      script.onload = () => resolve(window.google);
      script.onerror = (event) => reject(event);
      document.head.appendChild(script);
    }).catch((error) => {
      googleMapsPromise = undefined;

      if (process.env.NODE_ENV !== "production") {
        console.warn("Failed to load Google Maps API", error);
      }

      throw error;
    });
  }

  return googleMapsPromise;
};
