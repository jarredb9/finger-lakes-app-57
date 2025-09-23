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
  fetchTripsForDate: (date: string) => Promise<void>;
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

  fetchTripsForDate: async (dateString: string) => {
    set({ isLoading: true });
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
    const dateString = date.toISOString().split('T')[0];
    const response = await fetch('/api/trips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: dateString, name, notes, wineryId })
    });
    if (response.ok) {
      await get().fetchTripsForDate(dateString);
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
    const { ensureWineryInDb, persistentWineries, updateWinery } = useWineryStore.getState();
    const dateString = tripDate.toISOString().split("T")[0];

    // --- Optimistic Update --- //
    const originalUpcomingTrips = get().upcomingTrips;
    const originalTripsForDate = get().tripsForDate;
    const originalWinery = persistentWineries.find(w => w.id === winery.id);

    let tempTripIdCounter = Date.now();

    // Create a winery object shape that can be added to a trip
    const wineryForTrip = { 
        ...winery, 
        notes: addTripNotes, 
        // Ensure dbId is present, even if temporary
        dbId: winery.dbId || await ensureWineryInDb(winery) 
    };
    if (!wineryForTrip.dbId) {
        throw new Error("Could not ensure winery in database for optimistic update.");
    }

    const newUpcomingTrips = [...originalUpcomingTrips];
    const newTripsForDate = [...originalTripsForDate];

    // Update existing trips
    selectedTrips.forEach(tripId => {
        if (tripId !== 'new') {
            const updateTripInList = (list: Trip[]) => {
                const tripIndex = list.findIndex(t => t.id.toString() === tripId);
                if (tripIndex > -1) {
                    const updatedTrip = { ...list[tripIndex] };
                    if (!updatedTrip.wineries.some(w => w.id === winery.id)) {
                        updatedTrip.wineries = [...updatedTrip.wineries, wineryForTrip];
                    }
                    list[tripIndex] = updatedTrip;
                }
            };
            updateTripInList(newUpcomingTrips);
            updateTripInList(newTripsForDate);
        }
    });

    // Create new trip
    if (selectedTrips.has('new')) {
        const tempNewTrip: Trip = {
            id: `temp-${tempTripIdCounter++}`,
            trip_date: dateString,
            name: newTripName.trim() || "New Trip",
            notes: "", // Trip notes, not winery notes
            wineries: [wineryForTrip],
            owner_id: "", // Will be set by the server
            members: [],
            wineryOrder: [wineryForTrip.dbId]
        };
        newUpcomingTrips.push(tempNewTrip);
        newTripsForDate.push(tempNewTrip);
    }
    
    // Optimistically update the winery itself to show the trip badge
    const firstTripId = Array.from(selectedTrips)[0];
    const tripName = firstTripId === 'new' ? (newTripName.trim() || "New Trip") : (originalTripsForDate.find(t => t.id.toString() === firstTripId)?.name || "Trip");
    
    if (originalWinery) {
        const updatedWinery = { 
            ...originalWinery, 
            trip_name: tripName,
            trip_date: dateString,
            trip_id: firstTripId === 'new' ? `temp-${tempTripIdCounter-1}` : firstTripId
        };
        updateWinery(originalWinery.id, updatedWinery);
    }

    set({ upcomingTrips: newUpcomingTrips, tripsForDate: newTripsForDate });
    // --- End Optimistic Update --- //

    try {
        const wineryDbId = await ensureWineryInDb(winery);
        if (!wineryDbId) {
            throw new Error("Could not save winery. Please try again.");
        }

        const tripPromises = Array.from(selectedTrips).map(async (tripId) => {
            const payload: any = { date: dateString, wineryId: wineryDbId, notes: addTripNotes };
            if (tripId === 'new') {
                if (!newTripName.trim()) throw new Error("New trip requires a name.");
                payload.name = newTripName;
            } else {
                payload.tripIds = [parseInt(tripId, 10)];
            }

            const response = await fetch('/api/trips', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `Failed to add to trip ${tripId}.`);
            }
            return response.json();
        });

        await Promise.all(tripPromises);

        // Re-fetch to get actual IDs and confirm data
        get().fetchUpcomingTrips();
        get().fetchTripsForDate(dateString);

    } catch (error) {
        console.error("Error adding winery to trips, reverting:", error);
        // Revert optimistic updates
        set({ upcomingTrips: originalUpcomingTrips, tripsForDate: originalTripsForDate });
        if (originalWinery) {
            updateWinery(originalWinery.id, originalWinery);
        }
        throw error; // Re-throw to be caught by the UI
    }
  },

  toggleWineryOnTrip: async (winery, trip) => {
    const { ensureWineryInDb, updateWinery } = useWineryStore.getState();
    
    // --- Optimistic Update --- //
    const originalTrip = get().selectedTrip;
    if (!originalTrip || originalTrip.id !== trip.id) {
        // This should not happen if the UI is consistent
        console.warn("Selected trip mismatch during toggle!");
        return;
    }

    const wineryDbId = winery.dbId || await ensureWineryInDb(winery);
    if (!wineryDbId) throw new Error("Could not get winery DB ID.");

    const isOnTrip = originalTrip.wineries.some(w => w.dbId === wineryDbId);
    
    const updatedWineries = isOnTrip
        ? originalTrip.wineries.filter(w => w.dbId !== wineryDbId)
        : [...originalTrip.wineries, { ...winery, dbId: wineryDbId }];

    const updatedTrip = { ...originalTrip, wineries: updatedWineries };

    set({ selectedTrip: updatedTrip });
    // --- End Optimistic Update --- //

    try {
        const requestBody = isOnTrip
            ? { removeWineryId: wineryDbId }
            : { wineryId: wineryDbId, tripIds: [trip.id], date: trip.trip_date.split('T')[0] };
        
        const method = isOnTrip ? 'PUT' : 'POST';
        const url = isOnTrip ? `/api/trips/${trip.id}` : '/api/trips';

        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            throw new Error(isOnTrip ? "Failed to remove winery from trip." : "Failed to add winery to trip.");
        }

        // Re-fetch for consistency, could also merge response data
        get().fetchTripById(trip.id);

    } catch (error) {
        console.error("Failed to toggle winery on trip, reverting:", error);
        set({ selectedTrip: originalTrip }); // Revert
        throw error;
    }
  },
}));
