/* eslint-disable no-console */
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";

let isConfigured = false;
const libraryCache: Record<string, any> = {};

export function isMockGoogleMapsKey(apiKey?: string): boolean {
  const key = apiKey ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  if (!key) return true;
  return key === "e2e-mock-google-maps-key" || key.startsWith("e2e-mock") || key.startsWith("mock-");
}

export function isGoogleMapsMockMode(apiKey?: string): boolean {
  if (isMockGoogleMapsKey(apiKey)) return true;
  if (process.env.NEXT_PUBLIC_IS_E2E === "true") return true;
  if (typeof window !== "undefined" && Boolean((window as any)._E2E_MOCKS_ACTIVE)) return true;
  return false;
}

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

class MockMap {
  public center: { lat: number; lng: number };
  public zoom: number;
  public mapTypeId: string = "roadmap";
  private listeners: Record<string, Function[]> = {};

  constructor(_container?: HTMLElement | null, options?: any) {
    const initCenter = options?.center || { lat: 42.7, lng: -76.9 };
    const lat = typeof initCenter.lat === "function" ? initCenter.lat() : initCenter.lat;
    const lng = typeof initCenter.lng === "function" ? initCenter.lng() : initCenter.lng;
    this.center = { lat: lat ?? 42.7, lng: lng ?? -76.9 };
    this.zoom = options?.zoom ?? 9;
  }

  setMapTypeId(id: string) {
    this.mapTypeId = id;
  }

  getMapTypeId() {
    return this.mapTypeId;
  }

  getStreetView() {
    return null;
  }

  getZoom() {
    return this.zoom;
  }

  setZoom(z: number) {
    this.zoom = z;
  }

  setCenter(c: any) {
    if (!c) return;
    const lat = typeof c.lat === "function" ? c.lat() : c.lat;
    const lng = typeof c.lng === "function" ? c.lng() : c.lng;
    this.center = { lat: Number(lat) || 42.7, lng: Number(lng) || -76.9 };
  }

  getCenter() {
    const { lat, lng } = this.center;
    return {
      lat: () => lat,
      lng: () => lng,
    };
  }

  getBounds() {
    return {
      getNorthEast: () => ({ lat: () => 43.0, lng: () => -76.0 }),
      getSouthWest: () => ({ lat: () => 42.0, lng: () => -77.0 }),
      contains: () => true,
    };
  }

  fitBounds(_bounds: any) {}

  addListener(event: string, handler: Function) {
    this.listeners[event] = this.listeners[event] || [];
    this.listeners[event].push(handler);
    return {
      remove: () => {
        if (this.listeners[event]) {
          this.listeners[event] = this.listeners[event].filter((h) => h !== handler);
        }
      },
    };
  }
}

class MockMarker {
  public map: any;
  public position: any;
  public title: string;
  private listeners: Record<string, Function[]> = {};

  constructor(options?: any) {
    this.map = options?.map;
    this.position = options?.position;
    this.title = options?.title || "";
  }

  getPosition() {
    return this.position;
  }

  getTitle() {
    return this.title;
  }

  setMap(m: any) {
    this.map = m;
  }

  getMap() {
    return this.map;
  }

  addListener(event: string, handler: Function) {
    this.listeners[event] = this.listeners[event] || [];
    this.listeners[event].push(handler);
    return {
      remove: () => {
        if (this.listeners[event]) {
          this.listeners[event] = this.listeners[event].filter((h) => h !== handler);
        }
      },
    };
  }
}

class MockPinElement {
  public element: HTMLElement | Record<string, unknown>;
  constructor(public options?: any) {
    this.element = typeof document !== "undefined" ? document.createElement("div") : {};
  }
}

class MockAdvancedMarkerElement {
  public map: any;
  public position: any;
  public title: string;
  public content: any;
  public gmpClickable: boolean;
  public element: HTMLElement | Record<string, unknown>;
  private listeners: Record<string, Function[]> = {};

  constructor(options?: any) {
    this.map = options?.map;
    this.position = options?.position;
    this.title = options?.title || "";
    this.content = options?.content;
    this.gmpClickable = options?.gmpClickable ?? true;
    this.element = typeof document !== "undefined" ? document.createElement("div") : {};
  }

  addEventListener(event: string, handler: Function) {
    this.listeners[event] = this.listeners[event] || [];
    this.listeners[event].push(handler);
  }

  removeEventListener(event: string, handler: Function) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter((h) => h !== handler);
    }
  }

  setMap(m: any) {
    this.map = m;
  }
}

class MockLatLngBounds {
  constructor(public sw?: any, public ne?: any) {}
  getNorthEast() {
    const lat = typeof this.ne?.lat === "function" ? this.ne.lat() : this.ne?.lat ?? 43.0;
    const lng = typeof this.ne?.lng === "function" ? this.ne.lng() : this.ne?.lng ?? -76.0;
    return { lat: () => lat, lng: () => lng };
  }
  getSouthWest() {
    const lat = typeof this.sw?.lat === "function" ? this.sw.lat() : this.sw?.lat ?? 42.0;
    const lng = typeof this.sw?.lng === "function" ? this.sw.lng() : this.sw?.lng ?? -77.0;
    return { lat: () => lat, lng: () => lng };
  }
  contains() {
    return true;
  }
  extend() {
    return this;
  }
}

class MockLatLng {
  constructor(private _lat: number, private _lng: number) {}
  lat() { return this._lat; }
  lng() { return this._lng; }
}

class MockGeocoder {
  geocode(_request: any, callback?: Function) {
    const results: any[] = [];
    const status = "OK";
    if (callback) callback(results, status);
    return Promise.resolve({ results });
  }
}

class MockAutocompleteSessionToken {}

const mockPlaces = {
  AutocompleteSessionToken: MockAutocompleteSessionToken,
  AutocompleteSuggestion: class MockAutocompleteSuggestion {},
  Place: class MockPlace {
    static async searchByText() { return { places: [] }; }
    static async searchNearby() { return { places: [] }; }
  },
};

const selfImportLibrary = (name: string) => getGoogleLibrary(name as any);

function syncWindowGoogleMaps() {
  if (typeof window === "undefined") return;
  const win = window as any;
  win.google = win.google || {};
  const maps = win.google.maps = win.google.maps || {};

  maps.Map = maps.Map || MockMap;
  maps.Marker = maps.Marker || MockMarker;
  maps.LatLngBounds = maps.LatLngBounds || MockLatLngBounds;
  maps.LatLng = maps.LatLng || MockLatLng;
  maps.Geocoder = maps.Geocoder || MockGeocoder;
  maps.marker = maps.marker || {
    AdvancedMarkerElement: MockAdvancedMarkerElement,
    PinElement: MockPinElement,
  };
  maps.places = maps.places || mockPlaces;
  if (!maps.importLibrary) {
    maps.importLibrary = selfImportLibrary;
  }
}

function getOrCreateMockLibrary(libraryName: string): any {
  syncWindowGoogleMaps();
  switch (libraryName) {
    case "maps":
      return {
        Map: (window as any).google?.maps?.Map || MockMap,
        Marker: (window as any).google?.maps?.Marker || MockMarker,
        LatLngBounds: (window as any).google?.maps?.LatLngBounds || MockLatLngBounds,
        LatLng: (window as any).google?.maps?.LatLng || MockLatLng,
      };
    case "marker":
      return (window as any).google?.maps?.marker || {
        AdvancedMarkerElement: MockAdvancedMarkerElement,
        PinElement: MockPinElement,
      };
    case "places":
      return (window as any).google?.maps?.places || mockPlaces;
    case "geocoding":
      return (window as any).google?.maps?.geocoding || {
        Geocoder: (window as any).google?.maps?.Geocoder || MockGeocoder,
      };
    case "core":
      return {
        LatLng: (window as any).google?.maps?.LatLng || MockLatLng,
        LatLngBounds: (window as any).google?.maps?.LatLngBounds || MockLatLngBounds,
      };
    case "streetView":
      return {
        StreetViewPanorama: class MockStreetViewPanorama {},
      };
    default:
      return (window as any).google?.maps || {};
  }
}

function getDirectLibraryFromWindow(libraryName: string): any {
  if (typeof window === "undefined" || !(window as any).google?.maps) return null;
  const maps = (window as any).google.maps;
  switch (libraryName) {
    case "maps":
      return maps.Map ? { Map: maps.Map, Marker: maps.Marker, LatLngBounds: maps.LatLngBounds, LatLng: maps.LatLng } : null;
    case "marker":
      return maps.marker || (maps.AdvancedMarkerElement ? { AdvancedMarkerElement: maps.AdvancedMarkerElement, PinElement: maps.PinElement } : null);
    case "places":
      return maps.places || null;
    case "geocoding":
      return maps.geocoding || (maps.Geocoder ? { Geocoder: maps.Geocoder } : null);
    case "core":
      return maps.core || (maps.LatLngBounds ? { LatLng: maps.LatLng, LatLngBounds: maps.LatLngBounds } : null);
    case "streetView":
      return maps.streetView || null;
    default:
      return maps[libraryName] || null;
  }
}

export function loadGoogleMaps(): Promise<any> {
  if (typeof window === "undefined") {
    return Promise.resolve(null);
  }
  if (isGoogleMapsMockMode()) {
    return getGoogleLibrary("core");
  }
  ensureConfigured();
  try {
    return importLibrary("core");
  } catch (err) {
    console.error("Error loading Google Maps core library:", err);
    return getGoogleLibrary("core");
  }
}

export async function getGoogleLibrary(
  libraryName: "places" | "geocoding" | "maps" | "core" | "marker" | "streetView"
): Promise<any> {
  if (typeof window === "undefined") return null;

  if (libraryCache[libraryName]) {
    return libraryCache[libraryName];
  }

  // Check if window.google.maps already has this library or importLibrary
  if ((window as any).google?.maps) {
    const customImport = (window as any).google.maps.importLibrary;
    if (typeof customImport === "function" && customImport !== selfImportLibrary) {
      try {
        const lib = await customImport(libraryName);
        if (lib) {
          libraryCache[libraryName] = lib;
          return lib;
        }
      } catch {
        // Fall back to direct property or mock
      }
    }

    const directLib = getDirectLibraryFromWindow(libraryName);
    if (directLib) {
      libraryCache[libraryName] = directLib;
      return directLib;
    }
  }

  if (isGoogleMapsMockMode()) {
    const mockLib = getOrCreateMockLibrary(libraryName);
    libraryCache[libraryName] = mockLib;
    return mockLib;
  }

  try {
    ensureConfigured();
    const lib = await importLibrary(libraryName as any);
    libraryCache[libraryName] = lib;
    return lib;
  } catch (err) {
    console.error(`Error loading Google Maps library ${libraryName}:`, err);
    const fallbackMock = getOrCreateMockLibrary(libraryName);
    libraryCache[libraryName] = fallbackMock;
    return fallbackMock;
  }
}

export function __resetGoogleMapsLoaderStateForTesting() {
  isConfigured = false;
  for (const key of Object.keys(libraryCache)) {
    delete libraryCache[key];
  }
}
