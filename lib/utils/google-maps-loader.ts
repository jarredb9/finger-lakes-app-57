import { setOptions, importLibrary } from "@googlemaps/js-api-loader";

let isConfigured = false;

function ensureConfigured() {
  if (!isConfigured) {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
    setOptions({
      key: apiKey,
      v: "weekly",
    });
    isConfigured = true;
  }
}

export function loadGoogleMaps(): Promise<any> {
  if (typeof window === "undefined") {
    return Promise.resolve(null);
  }
  ensureConfigured();
  return importLibrary("core");
}

const libraryCache: Record<string, any> = {};

export async function getGoogleLibrary(libraryName: "places" | "geocoding" | "maps" | "core" | "marker"): Promise<any> {
  if (typeof window === "undefined") return null;
  if (libraryCache[libraryName]) {
    return libraryCache[libraryName];
  }
  ensureConfigured();
  try {
    const lib = await importLibrary(libraryName as any);
    libraryCache[libraryName] = lib;
    return lib;
  } catch (err) {
    console.error(`Error loading Google Maps library ${libraryName}:`, err);
    // Fallback for older versions or mocks
    if (window.google?.maps?.importLibrary) {
      const lib = await window.google.maps.importLibrary(libraryName);
      libraryCache[libraryName] = lib;
      return lib;
    }
    return (window.google?.maps as any)?.[libraryName] || null;
  }
}
