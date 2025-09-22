import { create } from 'zustand';
import { Winery, Trip } from '@/lib/types';

interface MapState {
  map: google.maps.Map | null;
  center: { lat: number; lng: number };
  zoom: number;
  bounds: google.maps.LatLngBounds | null;
  isSearching: boolean;
  hitApiLimit: boolean;
  searchResults: Winery[];
  filter: string[];
  autoSearch: boolean;
  selectedTrip: Trip | null;
  searchLocation: string; // Add searchLocation to the store
  setMap: (map: google.maps.Map | null) => void;
  setCenter: (center: { lat: number; lng: number }) => void;
  setZoom: (zoom: number) => void;
  setBounds: (bounds: google.maps.LatLngBounds | null) => void;
  setIsSearching: (isSearching: boolean) => void;
  setHitApiLimit: (hitApiLimit: boolean) => void;
  setSearchResults: (results: Winery[]) => void;
  setFilter: (filter: string[]) => void;
  setAutoSearch: (autoSearch: boolean) => void;
  setSelectedTrip: (trip: Trip | null) => void;
  setSearchLocation: (searchLocation: string) => void; // Add setter for searchLocation
}

export const useMapStore = create<MapState>((set) => ({
  map: null,
  center: { lat: 40, lng: -98 },
  zoom: 4,
  bounds: null,
  isSearching: false,
  hitApiLimit: false,
  searchResults: [],
  filter: ['all'],
  autoSearch: true,
  selectedTrip: null,
  searchLocation: "", // Initialize searchLocation
  setMap: (map) => set({ map }),
  setCenter: (center) => set({ center }),
  setZoom: (zoom) => set({ zoom }),
  setBounds: (bounds) => set({ bounds }),
  setIsSearching: (isSearching) => set({ isSearching }),
  setHitApiLimit: (hitApiLimit) => set({ hitApiLimit }),
  setSearchResults: (results) => set({ searchResults: results }),
  setFilter: (filter) => set({ filter }),
  setAutoSearch: (autoSearch) => set({ autoSearch }),
  setSelectedTrip: (trip) => set({ selectedTrip: trip }),
  setSearchLocation: (searchLocation) => set({ searchLocation }),
}));