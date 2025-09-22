import { create } from 'zustand';
import { Trip, Winery } from '@/lib/types';
import { createClient } from '@/utils/supabase/client';
import { useWineryStore } from './wineryStore';

interface TripState {
  trips: Trip[];
  tripsForDate: Trip[];
  upcomingTrips: Trip[];
  isLoading: boolean;
  selectedTrip: Trip | null;
  fetchTripById: (tripId: string) => Promise<void>;
  fetchAllTrips: () => Promise<void>;
  fetchUpcomingTrips: () => Promise<void>;
  fetchTripsForDate: (date: Date) => Promise<void>;
  createTrip: (date: Date, name?: string, notes?: string, wineryId?: number) => Promise<any | null>;
  deleteTrip: (tripId: string) => Promise<void>;
  updateTrip: (tripId: string, updates: Partial<Trip>) => Promise<void>;
  updateWineryOrder: (tripId: string, wineryIds: number[]) => Promise<void>;
  removeWineryFromTrip: (tripId: string, wineryId: number) => Promise<void>;
  saveWineryNote: (tripId: string, wineryId: number, notes: string) => Promise<void>;
  addMembersToTrip: (tripId: string, memberIds: string[]) => Promise<void>;
  setSelectedTrip: (trip: Trip | null) => void;
  addWineryToTrips: (winery: Winery, tripDate: Date, selectedTrips: Set<string>, newTripName: string, addTripNotes: string) => Promise<void>;
  toggleWineryOnTrip: (winery: Winery, trip: Trip) => Promise<void>;
}

const supabase = createClient();

export const useTripStore = create<TripState>((set, get) => ({
  trips: [],
  tripsForDate: [],
  upcomingTrips: [],
  isLoading: false,
  selectedTrip: null,

  fetchTripById: async (tripId: string) => {
    console.log(`[tripStore] fetchTripById: Starting fetch for trip ${tripId}.`);
    set({ isLoading: true });
    try {
      const response = await fetch(`/api/trips/${tripId}`);
      if (response.ok) {
        const trip = await response.json();
        console.log(`[tripStore] fetchTripById: Data fetched successfully for trip ${tripId}.`, trip);
        set(state => ({
          trips: [...state.trips.filter(t => t.id !== trip.id), trip],
          isLoading: false
        }));
      } else {
        console.error(`[tripStore] fetchTripById: Failed to fetch data for trip ${tripId}.`, response.status, response.statusText);
        set({ isLoading: false });
      }
    } catch (error) {
      console.error(`[tripStore] fetchTripById: Error during fetch for trip ${tripId}.`, error);
      set({ isLoading: false });
    }
  },

  fetchAllTrips: async () => {
    set({ isLoading: true });
    try {
      const response = await fetch(`/api/trips?full=true`);
      if (response.ok) {
        const data = await response.json();
        console.log("[tripStore] fetchAllTrips: Data fetched successfully.", data);
        if (Array.isArray(data)) {
          data.forEach(trip => console.log("[tripStore] Fetched trip ID:", trip.id, "(type:", typeof trip.id, ")"));
        } else if (data.trips && Array.isArray(data.trips)) {
          data.trips.forEach((trip: any) => console.log("[tripStore] Fetched trip ID:", trip.id, "(type:", typeof trip.id, ")"));
        }
        set({ trips: data.trips || (Array.isArray(data) ? data : []), isLoading: false });
      } else {
        set({ trips: [], isLoading: false });
      }
    } catch (error) {
      console.error("[tripStore] fetchAllTrips: Error during fetch.", error);
      set({ trips: [], isLoading: false });
    }
  },

  fetchUpcomingTrips: async () => {
    set({ isLoading: true });
    try {
      const response = await fetch(`/api/trips?type=upcoming&full=true`);
      if (response.ok) {
        const data = await response.json();
        set({ upcomingTrips: Array.isArray(data.trips) ? data.trips : [], isLoading: false });
      } else {
        set({ upcomingTrips: [], isLoading: false });
      }
    } catch (error) {
      console.error("Failed to fetch upcoming trips", error);
      set({ upcomingTrips: [], isLoading: false });
    }
  },

  fetchTripsForDate: async (date: Date) => {
    set({ isLoading: true });
    const dateString = date.toISOString().split("T")[0];
    console.log(`[tripStore] fetchTripsForDate: Starting fetch for date ${dateString}.`);
    try {
      const response = await fetch(`/api/trips?date=${dateString}`);
      if (response.ok) {
        const data = await response.json();
        console.log(`[tripStore] fetchTripsForDate: Data fetched successfully for date ${dateString}.`, data);
        const tripsForDate = data.trips || (Array.isArray(data) ? data : []);
        set(state => ({
          tripsForDate: tripsForDate,
          trips: [...state.trips.filter(t => !tripsForDate.some(tfd => tfd.id === t.id)), ...tripsForDate],
          isLoading: false
        }));
      } else {
        console.error(`[tripStore] fetchTripsForDate: Failed to fetch data for date ${dateString}.`, response.status, response.statusText);
        set({ tripsForDate: [], isLoading: false });
      }
    } catch (error) {
      console.error(`[tripStore] fetchTripsForDate: Error during fetch for date ${dateString}.`, error);
      set({ tripsForDate: [], isLoading: false });
    }
  },

  createTrip: async (date: Date, name: string = "New Trip", notes: string = "", wineryId?: number) => {
    const response = await fetch('/api/trips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: date.toISOString().split('T')[0], name, notes, wineryId })
    });
    if (response.ok) {
      await get().fetchTripsForDate(date);
      try {
        return await response.json();
      } catch (e) {
        return { success: true } as any;
      }
    }
    return null;
  },

  deleteTrip: async (tripId: string) => {
    const response = await fetch(`/api/trips/${tripId}`, { method: 'DELETE' });
    if (response.ok) {
      set(state => ({ trips: state.trips.filter(t => t.id !== tripId) }));
    } else {
      throw new Error("Failed to delete trip");
    }
  },

  updateTrip: async (tripId: string, updates: Partial<Trip>) => {
    console.log(`[tripStore] Attempting to update trip ${tripId} with:`, updates);
    const originalTrips = get().trips;
    console.log(`[tripStore] Current trips state before optimistic update:`, originalTrips);
    
    set(state => {
      const newTrips = state.trips.map(trip =>
        trip.id === tripId ? { ...trip, ...updates } : trip
      );
      console.log(`[tripStore] Optimistically updated trips state:`, newTrips);
      return { trips: newTrips };
    });

    try {
      const response = await fetch(`/api/trips/${tripId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!response.ok) {
        const errorData = await response.json();
        console.error("[tripStore] API update failed, reverting state:", errorData);
        set({ trips: originalTrips }); // Revert on API failure
        throw new Error(errorData.message || "Failed to update trip");
      }
      console.log(`[tripStore] Trip ${tripId} updated successfully via API with:`, updates);
    } catch (error) {
      console.error("[tripStore] Error updating trip, reverting state:", error);
      set({ trips: originalTrips }); // Revert on network error
      throw error;
    }
  },

  updateWineryOrder: async (tripId: string, wineryIds: number[]) => {
    get().updateTrip(tripId, { wineryOrder: wineryIds });
  },

  removeWineryFromTrip: async (tripId: string, wineryId: number) => {
    get().updateTrip(tripId, { removeWineryId: wineryId });
  },

  saveWineryNote: (tripId: string, wineryId: number, notes: string) => {
    get().updateTrip(tripId, { updateNote: { wineryId, notes } });
  },
  
  addMembersToTrip: async (tripId: string, memberIds: string[]) => {
    get().updateTrip(tripId, { members: memberIds });
  },

  setSelectedTrip: (trip) => set({ selectedTrip: trip }),

  addWineryToTrips: async (winery, tripDate, selectedTrips, newTripName, addTripNotes) => {
    const { ensureWineryInDb } = useWineryStore.getState();
    const wineryDbId = await ensureWineryInDb(winery);
    if (!wineryDbId) {
      throw new Error("Could not save winery. Please try again.");
    }

    const tripPromises = Array.from(selectedTrips).map(tripId => {
        const payload: { date: string; wineryId: number; name?: string; tripIds?: number[]; notes?: string; } = {
            date: tripDate.toISOString().split("T")[0],
            wineryId: wineryDbId,
        };

        if (tripId === 'new') {
            if (!newTripName.trim()) {
                return Promise.reject("New trip requires a name.");
            }
            payload.name = newTripName;
            payload.notes = addTripNotes;
        } else {
            payload.tripIds = [parseInt(tripId, 10)];
            payload.notes = addTripNotes;
        }

        return fetch('/api/trips', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }).then(response => {
            if (!response.ok) {
                return response.json().then(errorData => { throw new Error(errorData.error || "Failed to add to trip."); });
            }
        });
    });

    await Promise.all(tripPromises);
    get().fetchUpcomingTrips();
  },

  toggleWineryOnTrip: async (winery, trip) => {
    const { ensureWineryInDb } = useWineryStore.getState();
    const wineryDbId = await ensureWineryInDb(winery);
    if (!wineryDbId) {
        throw new Error("Could not save winery for trip. Please try again.");
    }

    const isOnTrip = trip.wineries.some(w => w.dbId === wineryDbId);
    
    if (isOnTrip) {
        const response = await fetch(`/api/trips/${trip.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ removeWineryId: wineryDbId }),
        });
        if (!response.ok) {
            throw new Error("Failed to remove winery from trip.");
        }
    } else {
        const response = await fetch('/api/trips', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                date: trip.trip_date.split('T')[0],
                wineryId: wineryDbId,
                tripIds: [trip.id]
            }),
        });
        if (!response.ok) {
            throw new Error("Failed to add winery to trip.");
        }
    }
    get().fetchTripById(trip.id);
  },
}));