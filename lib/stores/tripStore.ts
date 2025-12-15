import { createWithEqualityFn } from 'zustand/traditional';
import { Trip, Winery, WineryDbId } from '@/lib/types';
import { useWineryStore } from './wineryStore';
import { TripService } from '@/lib/services/tripService';
import { createClient } from '@/utils/supabase/client';

interface TripState {
  trips: Trip[];
  tripsForDate: Trip[];
  upcomingTrips: Trip[];
  isLoading: boolean;
  isSaving: boolean;
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
  isSaving: false,
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
        tripsForDate: state.tripsForDate.map(t => t.id === tempId ? createdTrip! : t)
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
    const updatedTrip = { ...tripToUpdate, wineries: updatedWineries } as Trip;
    const updatedTrips = [...originalTrips];
    updatedTrips[tripIndex] = updatedTrip;

    set({ trips: updatedTrips, selectedTrip: updatedTrip });
    // --- End Optimistic Update --- //

    try {
      const supabase = createClient(); // Direct Supabase client
      const { error } = await supabase.rpc('remove_winery_from_trip', {
        p_trip_id: tripIdAsNumber,
        p_winery_id: wineryId
      });

      if (error) throw error;
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
    // Optimistic Update
    const originalTrips = get().trips;
    const tripIdNum = parseInt(tripId, 10);
    
    set(state => {
        const updateTripMembers = (t: Trip) => t.id === tripIdNum ? { ...t, members: memberIds } : t;
        return {
            trips: state.trips.map(updateTripMembers),
            // Update selectedTrip if it matches
            selectedTrip: state.selectedTrip?.id === tripIdNum ? { ...state.selectedTrip, members: memberIds } : state.selectedTrip,
            // Update tripsForDate if it matches
            tripsForDate: state.tripsForDate.map(updateTripMembers),
            // Update upcomingTrips if it matches
            upcomingTrips: state.upcomingTrips.map(updateTripMembers)
        };
    });

    try {
      await TripService.updateTrip(tripId, { members: memberIds });
    } catch (error) {
        console.error("Failed to add members, reverting:", error);
        // Revert to original state
        // Note: deeply reverting all lists might be complex, but fetching fresh data is safer on error
        // For now, we can just restore 'trips' and assume a refetch is needed or rely on the originalTrips snapshot for the main list
        set({ trips: originalTrips });
        // Trigger a refetch to ensure consistency
        get().fetchTripById(tripId);
    }
  },

  setSelectedTrip: (trip) => set({ selectedTrip: trip }),

  addWineryToTrips: async (winery, tripDate, selectedTrips, newTripName, addTripNotes) => {
    set({ isSaving: true });
    const supabase = createClient(); // Direct Supabase client for RPCs
    const dateString = tripDate.toISOString().split("T")[0];

    // Optimistic Update for EXISTING trips
    const originalTrips = get().trips;
    const originalTripsForDate = get().tripsForDate;
    const existingTripIds = Array.from(selectedTrips).filter(id => id !== 'new');

    if (existingTripIds.length > 0) {
        const optimisticWinery: Winery = {
            ...winery,
            dbId: (winery.dbId || -Date.now()) as WineryDbId
        };

        const updateTripLists = (list: Trip[]) => {
            return list.map(trip => {
                if (existingTripIds.includes(trip.id.toString())) {
                    if (trip.wineries.some(w => w.id === winery.id)) return trip;
                    
                    return { 
                        ...trip, 
                        wineries: [...trip.wineries, optimisticWinery] 
                    };
                }
                return trip;
            });
        };

        set({
            trips: updateTripLists(originalTrips),
            tripsForDate: updateTripLists(originalTripsForDate),
        });
    }

    try {
        // Prepare generic winery data object for RPCs
        const rpcWineryData = {
          id: winery.id,
          name: winery.name,
          address: winery.address,
          lat: winery.lat,
          lng: winery.lng,
          phone: winery.phone || null,
          website: winery.website || null,
          rating: winery.rating || null,
        };

        const tripPromises = Array.from(selectedTrips).map(async (tripId) => {
            if (tripId === 'new') {
                if (!newTripName.trim()) throw new Error("New trip requires a name.");
                
                // Call RPC to create trip AND add winery in one transaction
                const { data, error } = await supabase.rpc('create_trip_with_winery', {
                    p_trip_name: newTripName,
                    p_trip_date: dateString,
                    p_winery_data: rpcWineryData,
                    p_notes: addTripNotes || null
                });

                if (error) throw error;
                return { tripId: data.trip_id, isNew: true };
            } else {
                // Call RPC to add winery to existing trip
                const numericTripId = parseInt(tripId, 10);
                const { error } = await supabase.rpc('add_winery_to_trip', {
                    p_trip_id: numericTripId,
                    p_winery_data: rpcWineryData,
                    p_notes: addTripNotes || null
                });

                if (error) throw error;
                return { tripId: numericTripId, isNew: false };
            }
        });

        const results = await Promise.all(tripPromises);

        // Update WineryStore to reflect trip status immediately (Badge support)
        let badgeTripId: number | undefined;
        let badgeTripName: string | undefined;

        // 1. Check for new trip result
        const newTripResult = results.find(r => r.isNew);
        if (newTripResult) {
            badgeTripId = newTripResult.tripId;
            badgeTripName = newTripName;
        } 
        // 2. If not new, find first existing trip ID
        else if (selectedTrips.size > 0) {
             const firstTripId = Array.from(selectedTrips).find(id => id !== 'new');
             if (firstTripId) {
                 badgeTripId = parseInt(firstTripId, 10);
                 // Find name from tripsForDate
                 const trip = get().tripsForDate.find(t => t.id === badgeTripId);
                 badgeTripName = trip?.name;
             }
        }

        if (badgeTripId && badgeTripName) {
             useWineryStore.getState().updateWinery(winery.id, { 
                 trip_id: badgeTripId, 
                 trip_name: badgeTripName, 
                 trip_date: dateString 
             });
        }

        // Re-fetch to get actual IDs and confirm data
        await Promise.all([
          get().fetchUpcomingTrips(),
          get().fetchTripsForDate(dateString)
        ]);

    } catch (error) {
        console.error("Error adding winery to trips:", error);
        // Revert optimistic update
        if (existingTripIds.length > 0) {
             set({ trips: originalTrips, tripsForDate: originalTripsForDate });
        }
        throw error; // Re-throw to be caught by the UI
    } finally {
        set({ isSaving: false });
    }
  },

  toggleWineryOnTrip: async (winery, trip) => {
    // --- Optimistic Update --- //
    const originalTrips = get().trips;
    const tripIndex = originalTrips.findIndex(t => t.id === trip.id);
    if (tripIndex === -1) return;

    // We assume the store has the dbId if the user is interacting with it,
    // but the RPC handles the upsert anyway, so we can use generic winery data.
    const tripToUpdate = originalTrips[tripIndex];
    // Find if the winery is already on the trip using google_place_id or dbId
    const existingWineryOnTrip = tripToUpdate.wineries.find(w => w.id === winery.id || (w.dbId && w.dbId === winery.dbId));
    const isOnTrip = !!existingWineryOnTrip;
    
    // For optimistic update display, we need a temp dbId if we don't have one
    const wineryDbId = (winery.dbId || -Date.now()) as WineryDbId; 

    const updatedWineries = isOnTrip
        ? tripToUpdate.wineries.filter(w => w.id !== winery.id && w.dbId !== winery.dbId)
        : [...tripToUpdate.wineries, { ...winery, dbId: wineryDbId }];

    const updatedTrip = { ...tripToUpdate, wineries: updatedWineries };
    const updatedTrips = [...originalTrips];
    updatedTrips[tripIndex] = updatedTrip;

    // Optimistically update tripsForDate as well to ensure UI consistency
    const originalTripsForDate = get().tripsForDate;
    const tripForDateIndex = originalTripsForDate.findIndex(t => t.id === trip.id);
    let updatedTripsForDate = originalTripsForDate;
    
    if (tripForDateIndex !== -1) {
        updatedTripsForDate = [...originalTripsForDate];
        updatedTripsForDate[tripForDateIndex] = updatedTrip;
    }

    set({ trips: updatedTrips, selectedTrip: updatedTrip, tripsForDate: updatedTripsForDate });
    // --- End Optimistic Update --- //

    const supabase = createClient();

    try {
        if (isOnTrip) {
             // For removal, we need the DB ID. 
             // If we don't have it in the store, we can't reliably delete by ID via RPC.
             // However, trips loaded from DB *should* have dbIds for their wineries.
             if (!existingWineryOnTrip?.dbId) throw new Error("Cannot remove winery without DB ID.");
             
             const { error } = await supabase.rpc('remove_winery_from_trip', {
                p_trip_id: trip.id,
                p_winery_id: existingWineryOnTrip.dbId
             });
             if (error) throw error;
        } else {
             // For adding, we use the RPC which handles upsert
             const rpcWineryData = {
                id: winery.id,
                name: winery.name,
                address: winery.address,
                lat: winery.lat,
                lng: winery.lng,
                phone: winery.phone || null,
                website: winery.website || null,
                rating: winery.rating || null,
              };
             
             const { error } = await supabase.rpc('add_winery_to_trip', {
                 p_trip_id: trip.id,
                 p_winery_data: rpcWineryData,
                 p_notes: null
             });
             if (error) throw error;
        }
    } catch (error) {
        console.error("Failed to toggle winery on trip, reverting:", error);
        set({ trips: originalTrips, selectedTrip: tripToUpdate }); // Revert
        throw error;
    }
  },
}));