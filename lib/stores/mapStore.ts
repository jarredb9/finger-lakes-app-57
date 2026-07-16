import { createWithEqualityFn } from 'zustand/traditional';
import { Winery } from '@/lib/types';

interface MapState {
  map: any | null;
  center: { lat: number; lng: number };
  zoom: number;
  bounds: any | null;
  lastSearchedBounds: any | null;
  lastSearchedZoom: number | null;
  isSearching: boolean;
  hitApiLimit: boolean;
  searchResults: Winery[];
  filter: string[];
  autoSearch: boolean;
  searchLocation: string;
  error: string | null;
  isStreetViewActive: boolean;
  setMap: (map: any | null) => void;
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
  map: null,
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
  setMap: (map) => set({ map }),
  setCenter: (center) => set({ center }),
  setZoom: (zoom) => set({ zoom }),
  setBounds: (bounds) => set({ bounds }),
  setLastSearchedBounds: (bounds) => set({ lastSearchedBounds: bounds }),
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
    map: null,
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
