import { create } from 'zustand';
import { Trip } from '@/lib/types';
import { createClient } from '@/utils/supabase/client';

interface TripState {
  trips: Trip[];
  upcomingTrips: Trip[];
  isLoading: boolean;
  fetchAllTrips: () => Promise<void>;
  fetchUpcomingTrips: () => Promise<void>;
  fetchTripsForDate: (date: Date) => Promise<void>;
  createTrip: (date: Date) => Promise<Trip | null>;
  deleteTrip: (tripId: string) => Promise<void>;
  updateTrip: (tripId: string, updates: Partial<Trip>) => Promise<void>;
  updateWineryOrder: (tripId: string, wineryIds: number[]) => Promise<void>;
  removeWineryFromTrip: (tripId: string, wineryId: number) => Promise<void>;
  saveWineryNote: (tripId: string, wineryId: number, notes: string) => Promise<void>;
  addMembersToTrip: (tripId: string, memberIds: string[]) => Promise<void>;
}

const supabase = createClient();

export const useTripStore = create<TripState>((set, get) => ({
  trips: [],
  upcomingTrips: [],
  isLoading: false,

  fetchAllTrips: async () => {
    console.log("[tripStore] fetchAllTrips: Starting fetch.");
    set({ isLoading: true });
    try {
      const response = await fetch(`/api/trips`);
      if (response.ok) {
        const data = await response.json();
        console.log("[tripStore] fetchAllTrips: Data fetched successfully.", data);
        if (Array.isArray(data)) {
          data.forEach(trip => console.log("[tripStore] Fetched trip ID:", trip.id, "(type:", typeof trip.id, ")"));
        } else if (data.trips && Array.isArray(data.trips)) {
          data.trips.forEach((trip: any) => console.log("[tripStore] Fetched trip ID:", trip.id, "(type:", typeof trip.id, ")"));
        }
        set({ trips: Array.isArray(data) ? data : [], isLoading: false });
      } else {
        console.error("[tripStore] fetchAllTrips: Failed to fetch data.", response.status, response.statusText);
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
      const response = await fetch(`/api/trips?type=upcoming`);
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
    try {
      const response = await fetch(`/api/trips?date=${dateString}`);
      if (response.ok) {
        const data = await response.json();
        set({ trips: Array.isArray(data) ? data : [], isLoading: false });
      } else {
        set({ trips: [], isLoading: false });
      }
    } catch (error) {
      console.error("Failed to fetch trips", error);
      set({ trips: [], isLoading: false });
    }
  },

  createTrip: async (date: Date) => {
    const response = await fetch('/api/trips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: date.toISOString().split('T')[0], name: "New Trip" })
    });
    if (response.ok) {
      // After successfully creating a trip, refetch the trips for that date.
      // This ensures the new trip, with its database-generated ID, is correctly
      // loaded into the state, preventing errors when you try to update it.
      await get().fetchTripsForDate(date);

      // You can still return the response JSON if you need it for UI feedback (e.g., toasts).
      try {
        return await response.json();
      } catch (e) {
        return { success: true } as any; // Handle cases with no JSON response body.
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

  saveWineryNote: async (tripId: string, wineryId: number, notes: string) => {
    get().updateTrip(tripId, { updateNote: { wineryId, notes } });
  },
  
  addMembersToTrip: async (tripId: string, memberIds: string[]) => {
    get().updateTrip(tripId, { members: memberIds });
  },
}));