import { createWithEqualityFn } from 'zustand/traditional';
import { Trip, Winery } from '@/lib/types';
import { useWineryStore } from './wineryStore';
import { TripService } from '@/lib/services/tripService';

interface TripState {
  trips: Trip[];
  tripsForDate: Trip[];
  upcomingTrips: Trip[];
  isLoading: boolean;
  selectedTrip: Trip | null;
  page: number;
  count: number;
  hasMore: boolean;
  fetchTrips: (page: number, type: 'upcoming' | 'past', refresh?: boolean) => Promise<void>;
  fetchTripById: (tripId: string) => Promise<void>;
  fetchUpcomingTrips: () => Promise<void>;
  fetchTripsForDate: (date: string) => Promise<void>;
  createTrip: (trip: Partial<Trip>) => Promise<Trip | null>;
  deleteTrip: (tripId: string) => Promise<void>;  
  updateTrip: (tripId: string, updates: Partial<Omit<Trip, 'updateNote'> & {
    updateNote?: { wineryId: number; notes: string; } | { notes: Record<number, string>; };
  }>) => Promise<void>;
  updateWineryOrder: (tripId: string, wineryIds: number[]) => Promise<void>;
  removeWineryFromTrip: (tripId: string, wineryId: number) => Promise<void>;
  saveWineryNote: (tripId: string, wineryId: number, notes: string) => Promise<void>;
  saveAllWineryNotes: (tripId: string, notes: Record<number, string>) => Promise<void>;
  addMembersToTrip: (tripId: string, memberIds: string[]) => Promise<void>;
  setSelectedTrip: (trip: Trip | null) => void;
  addWineryToTrips: (winery: Winery, tripDate: Date, selectedTrips: Set<string>, newTripName: string, addTripNotes: string) => Promise<void>;
  toggleWineryOnTrip: (winery: Winery, trip: Trip) => Promise<void>;
  setPage: (page: number) => void;
}

export const useTripStore = createWithEqualityFn<TripState>((set, get) => ({
  trips: [],
  tripsForDate: [],
  upcomingTrips: [],
  isLoading: false,
  selectedTrip: null,
  page: 1,
  count: 0,
  hasMore: true,

  setPage: (page: number) => set({ page }),

  fetchTrips: async (page: number, type: 'upcoming' | 'past', refresh = false) => {
    set({ isLoading: true });
    try {
      const { trips: newTrips, count } = await TripService.getTrips(page, type);
      set(state => {
        const updatedTrips = refresh ? newTrips : [...state.trips, ...newTrips];
        return {
          trips: updatedTrips,
          count,
          page,
          hasMore: updatedTrips.length < count,
          isLoading: false,
        };
      });
    } catch (error) {
      console.error("Failed to fetch trips", error);
      set({ isLoading: false });
    }
  },

  fetchTripById: async (tripId: string) => {
    set({ isLoading: true });
    try {
      const trip = await TripService.getTripById(tripId);
      set(state => ({
        trips: [...state.trips.filter(t => t.id !== trip.id), trip],
        isLoading: false
      }));

      // After setting the trip, ensure all its wineries have their details.
      const { ensureWineryDetails } = useWineryStore.getState();
      const wineryDetailPromises = trip.wineries.map((winery: Winery) => ensureWineryDetails(winery.id));
      
      const detailedWineries = (await Promise.all(wineryDetailPromises)).filter(Boolean) as Winery[];
      const detailedWineriesMap = new Map(detailedWineries.map((w: Winery) => [w.id, w]));

      // Update the trip in the store with the newly fetched details
      set(state => {
        const newTrips = state.trips.map(t => {
          if (t.id !== trip.id) return t;

          const updatedWineries = t.wineries.map(wineryInTrip => {
            const detailedWinery = detailedWineriesMap.get(wineryInTrip.id);
            // Start with detailed data, then spread trip-specific data over it
            // to ensure `notes` and `visits` are preserved.
            return detailedWinery ? { ...detailedWinery, ...wineryInTrip } : wineryInTrip;
          });
          
          const finalTrip = { ...t, wineries: updatedWineries };
          return finalTrip;
        });
        return { trips: newTrips };
      });
    } catch (error) {
      console.error(`[tripStore] fetchTripById: Error during fetch for trip ${tripId}.`, error);
      set({ isLoading: false });
    }
  },

  fetchUpcomingTrips: async () => {
    set({ isLoading: true });
    try {
      const trips = await TripService.getUpcomingTrips();
      set({ upcomingTrips: trips, isLoading: false });
    } catch (error) {
      console.error("Failed to fetch upcoming trips", error);
      set({ upcomingTrips: [], isLoading: false });
    }
  },

  fetchTripsForDate: async (dateString: string) => {
    set({ isLoading: true });
    try {
      const tripsForDate = await TripService.getTripsForDate(dateString);
      set({
        tripsForDate: tripsForDate,
        isLoading: false
      });
    } catch (error) {
      console.error(`[tripStore] fetchTripsForDate: Error during fetch for date ${dateString}.`, error);
      set({ tripsForDate: [], isLoading: false });
    }
  },

  createTrip: async (trip: Partial<Trip>) => {
    const tempId = -Date.now();
    const tempTrip: Trip = {
      id: tempId,
      user_id: trip.user_id || '',
      trip_date: trip.trip_date || new Date().toISOString(),
      name: trip.name,
      wineries: trip.wineries || [],
      members: trip.members || [],
    };

    // Optimistically add to tripsForDate
    set(state => ({
      tripsForDate: [...state.tripsForDate, tempTrip]
    }));

    try {
      const createdTrip = await TripService.createTrip(trip);

      // Replace temporary trip with the real one from the server
      set(state => ({
        tripsForDate: state.tripsForDate.map(t => t.id === tempId ? { ...tempTrip, ...createdTrip, id: createdTrip.tripId } : t)
      }));

      return createdTrip;
    } catch (error) {
      console.error("Failed to create trip, reverting optimistic update.", error);
      // On failure, remove the temporary trip
      set(state => ({ tripsForDate: state.tripsForDate.filter(t => t.id !== tempId) }));
      throw error; // Re-throw to be caught by the UI
    }
  },

  deleteTrip: async (tripId: string) => {
    const tripIdAsNumber = parseInt(tripId, 10);
    const originalTrips = get().trips;
    const originalTripsForDate = get().tripsForDate;

    // Optimistically remove from both lists
    set(state => ({ 
      trips: state.trips.filter(t => t.id !== tripIdAsNumber),
      tripsForDate: state.tripsForDate.filter(t => t.id !== tripIdAsNumber),
    }));

    try {
      await TripService.deleteTrip(tripId);
    } catch (error) {
      set({ trips: originalTrips, tripsForDate: originalTripsForDate }); // Revert on failure
      throw error;
    }
  },

  updateTrip: async (tripId: string, updates: Partial<Trip>) => {
    const originalTrips = get().trips;
    const tripIdAsNumber = parseInt(tripId, 10);
    set(state => {
      const newTrips = state.trips.map(trip =>
        trip.id === tripIdAsNumber ? { ...trip, ...updates } : trip
      );
      return { trips: newTrips };
    });

    try {
      await TripService.updateTrip(tripId, updates);
    } catch (error) {
      console.error("[tripStore] Error updating trip, reverting state:", error);
      set({ trips: originalTrips }); // Revert on network error
      throw error;
    }
  },

  updateWineryOrder: async (tripId: string, wineryIds: number[]) => {
    const tripIdAsNumber = parseInt(tripId, 10);
    const originalTrips = get().trips;
    const tripToUpdate = originalTrips.find(t => t.id === tripIdAsNumber);

    if (!tripToUpdate) return;

    // Create the new ordered winery list for the optimistic update
    const reorderedWineries = wineryIds.map(id => 
      tripToUpdate.wineries.find(w => w.dbId === id)
    ).filter((w): w is Winery => w !== undefined);

    // Optimistically update the state
    set(state => ({
      trips: state.trips.map(t => 
        t.id === tripIdAsNumber ? { ...t, wineries: reorderedWineries } : t
      )
    }));

    try {
      // Send the update to the backend. The backend only needs the order of IDs.
      await TripService.updateTrip(tripId, { wineryOrder: wineryIds });
    } catch (error) {
      console.error("Failed to update winery order, reverting.", error);
      // On failure, revert to the original order
      set({ trips: originalTrips });
      throw new Error("Failed to save new winery order.");
    }
  },

  removeWineryFromTrip: async (tripId: string, wineryId: number) => {
    const tripIdAsNumber = parseInt(tripId, 10);
    const originalTrips = get().trips;
    const tripIndex = originalTrips.findIndex(t => t.id === tripIdAsNumber);
    if (tripIndex === -1) return;

    const tripToUpdate = originalTrips[tripIndex];
    const originalWineries = tripToUpdate.wineries;

    // --- Optimistic Update --- //
    const updatedWineries = originalWineries.filter(w => w.dbId !== wineryId);
    const updatedTrip = { ...tripToUpdate, wineries: updatedWineries };
    const updatedTrips = [...originalTrips];
    updatedTrips[tripIndex] = updatedTrip;

    set({ trips: updatedTrips, selectedTrip: updatedTrip });
    // --- End Optimistic Update --- //

    try {
      await TripService.updateTrip(tripId, { removeWineryId: wineryId });
    } catch (error) {
      console.error("Failed to remove winery, reverting:", error);
      set({ trips: originalTrips, selectedTrip: tripToUpdate }); // Revert
    }
  },

  saveWineryNote: async (tripId: string, wineryId: number, notes: string) => {
    await TripService.updateTrip(tripId, { updateNote: { wineryId, notes } });
  },

  saveAllWineryNotes: async (tripId: string, notes: Record<number, string>) => {
    await TripService.updateTrip(tripId, { updateNote: { notes } });
  },
  
  addMembersToTrip: async (tripId: string, memberIds: string[]) => {
    await TripService.updateTrip(tripId, { members: memberIds });
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
        dbId: winery.dbId ?? await ensureWineryInDb(winery) 
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
                const tripIndex = list.findIndex(t => t.id === parseInt(tripId, 10));
                if (tripIndex > -1) {
                    const updatedTrip = { ...list[tripIndex] };
                    const currentWineries = updatedTrip.wineries || []; // Safeguard against undefined
                    if (!currentWineries.some(w => w.id === winery.id)) {
                        updatedTrip.wineries = [...currentWineries, wineryForTrip];
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
            id: -tempTripIdCounter++,
            user_id: "",
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
      let numericTripId: number;

      if (firstTripId === 'new') {
        numericTripId = -Math.abs(tempTripIdCounter - 1);
      } else {
        // Parse the existing string ID into a number.
        numericTripId = parseInt(firstTripId, 10);
      }
        const updatedWinery = { 
            ...originalWinery, 
            trip_name: tripName,
            trip_date: dateString,
            trip_id: numericTripId
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
            // If it's a new trip, we still use the API because it handles creating the trip AND adding the winery
            if (tripId === 'new') {
                if (!newTripName.trim()) throw new Error("New trip requires a name.");
                return TripService.addWineryToNewTrip(dateString, wineryDbId, addTripNotes, newTripName);
            } else {
                // For existing trips, use the atomic RPC function to prevent race conditions
                const numericTripId = parseInt(tripId, 10);
                return TripService.addWineryToExistingTrip(numericTripId, wineryDbId, addTripNotes || null);
            }
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
    const { ensureWineryInDb } = useWineryStore.getState();
    
    // --- Optimistic Update --- //
    const originalTrips = get().trips;
    const tripIndex = originalTrips.findIndex(t => t.id === trip.id);
    if (tripIndex === -1) return;

    const wineryDbId = winery.dbId || await ensureWineryInDb(winery);
    if (!wineryDbId) throw new Error("Could not get winery DB ID.");

    const tripToUpdate = originalTrips[tripIndex];
    const isOnTrip = tripToUpdate.wineries.some(w => w.dbId === wineryDbId);
    
    const updatedWineries = isOnTrip
        ? tripToUpdate.wineries.filter(w => w.dbId !== wineryDbId)
        : [...tripToUpdate.wineries, { ...winery, dbId: wineryDbId }];

    const updatedTrip = { ...tripToUpdate, wineries: updatedWineries };
    const updatedTrips = [...originalTrips];
    updatedTrips[tripIndex] = updatedTrip;

    set({ trips: updatedTrips, selectedTrip: updatedTrip });
    // --- End Optimistic Update --- //

    try {
        if (isOnTrip) {
             await TripService.updateTrip(trip.id.toString(), { removeWineryId: wineryDbId });
        } else {
             await TripService.addWineryToTripByApi(wineryDbId, [trip.id], trip.trip_date.split('T')[0]);
        }
    } catch (error) {
        console.error("Failed to toggle winery on trip, reverting:", error);
        set({ trips: originalTrips, selectedTrip: tripToUpdate }); // Revert
        throw error;
    }
  },
}));