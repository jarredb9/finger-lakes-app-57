import { createWithEqualityFn } from 'zustand/traditional';
import { Winery } from '@/lib/types';
import { getCoordinatesFromBounds } from '@/lib/utils/map-utils';

export interface SerializableBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export function sanitizeBounds(bounds: any): SerializableBounds | null {
  if (!bounds) return null;

  if (
    typeof bounds.north === 'number' &&
    typeof bounds.south === 'number' &&
    typeof bounds.east === 'number' &&
    typeof bounds.west === 'number' &&
    typeof bounds.getNorthEast === 'undefined'
  ) {
    return {
      north: bounds.north,
      south: bounds.south,
      east: bounds.east,
      west: bounds.west,
    };
  }

  const coords = getCoordinatesFromBounds(bounds);
  if (coords) {
    return {
      north: coords.neLat,
      south: coords.swLat,
      east: coords.neLng,
      west: coords.swLng,
    };
  }

  return null;
}

export interface MapState {
  center: { lat: number; lng: number };
  zoom: number;
  bounds: SerializableBounds | null;
  lastSearchedBounds: SerializableBounds | null;
  lastSearchedZoom: number | null;
  isSearching: boolean;
  hitApiLimit: boolean;
  searchResults: Winery[];
  filter: string[];
  autoSearch: boolean;
  searchLocation: string;
  error: string | null;
  isStreetViewActive: boolean;
  setCenter: (center: { lat: number; lng: number }) => void;
  setZoom: (zoom: number) => void;
  setBounds: (bounds: any | null) => void;
  setLastSearchedBounds: (bounds: any | null) => void;
  setLastSearchedZoom: (zoom: number | null) => void;
  setIsSearching: (isSearching: boolean) => void;
  setHitApiLimit: (hitApiLimit: boolean) => void;
  setSearchResults: (results: Winery[]) => void;
  setFilter: (filter: string[]) => void;
  setAutoSearch: (autoSearch: boolean) => void;
  setSearchLocation: (searchLocation: string) => void;
  setError: (error: string | null) => void;
  setIsStreetViewActive: (active: boolean) => void;
  reset: () => void;
}

export const useMapStore = createWithEqualityFn<MapState>((set) => ({
  center: { lat: 42.7, lng: -76.9 },
  zoom: 9,
  bounds: null,
  lastSearchedBounds: null,
  lastSearchedZoom: null,
  isSearching: false,
  hitApiLimit: false,
  searchResults: [],
  filter: ['all'],
  autoSearch: false,
  searchLocation: "",
  error: null,
  isStreetViewActive: false,
  setCenter: (center) => set({ center }),
  setZoom: (zoom) => set({ zoom }),
  setBounds: (bounds) => set({ bounds: sanitizeBounds(bounds) }),
  setLastSearchedBounds: (bounds) => set({ lastSearchedBounds: sanitizeBounds(bounds) }),
  setLastSearchedZoom: (zoom) => set({ lastSearchedZoom: zoom }),
  setIsSearching: (isSearching) => set({ isSearching }),
  setHitApiLimit: (hitApiLimit) => set({ hitApiLimit }),
  setSearchResults: (results) => set({ searchResults: results }),
  setFilter: (filter) => set({ filter }),
  setAutoSearch: (autoSearch) => set({ autoSearch }),
  setSearchLocation: (searchLocation) => set({ searchLocation }),
  setError: (error) => set({ error }),
  setIsStreetViewActive: (active) => set({ isStreetViewActive: active }),
  reset: () => set({
    center: { lat: 42.7, lng: -76.9 },
    zoom: 9,
    bounds: null,
    lastSearchedBounds: null,
    lastSearchedZoom: null,
    isSearching: false,
    hitApiLimit: false,
    searchResults: [],
    filter: ['all'],
    autoSearch: false,
    searchLocation: "",
    error: null,
    isStreetViewActive: false,
  }),
}));

// Expose store for E2E testing
if (typeof window !== 'undefined') {
  (window as any).useMapStore = useMapStore;
}
