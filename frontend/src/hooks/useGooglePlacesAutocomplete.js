import { useEffect, useMemo, useState } from "react";
import { loadGoogleMapsApi } from "../utils/googleMapsLoader";

const DEFAULT_FIELDS = [
  "formatted_address",
  "address_components",
  "geometry",
  "name",
  "place_id"
];

const DEFAULT_TYPES = ["geocode"];

const useGooglePlacesAutocomplete = (inputRef, onPlaceSelected, options = {}) => {
  const [isReady, setIsReady] = useState(false);

  const optionsSignature = useMemo(
    () => JSON.stringify(options || {}),
    [options]
  );

  useEffect(() => {
    let autocomplete;
    let listener;
    let isActive = true;

    setIsReady(false);

    loadGoogleMapsApi()
      .then((google) => {
        if (!isActive || !inputRef?.current) {
          return;
        }

        const mergedOptions = {
          fields: DEFAULT_FIELDS,
          types: DEFAULT_TYPES,
          ...options
        };

        autocomplete = new google.maps.places.Autocomplete(
          inputRef.current,
          mergedOptions
        );

        listener = autocomplete.addListener("place_changed", () => {
          if (!onPlaceSelected) {
            return;
          }

          const place = autocomplete.getPlace();
          const derivedAddress =
            place?.formatted_address || place?.name || inputRef.current?.value || "";

          onPlaceSelected(derivedAddress, place);
        });

        setIsReady(true);
      })
      .catch((error) => {
        if (process.env.NODE_ENV !== "production") {
          console.warn("Google Maps address autocomplete unavailable", error);
        }

        setIsReady(false);
      });

    return () => {
      isActive = false;
      if (listener && typeof listener.remove === "function") {
        listener.remove();
      }
    };
  }, [inputRef, onPlaceSelected, optionsSignature]);

  return isReady;
};

export default useGooglePlacesAutocomplete;
