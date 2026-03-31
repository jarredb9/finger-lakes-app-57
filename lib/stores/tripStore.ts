import { createWithEqualityFn } from 'zustand/traditional';
import { persist } from 'zustand/middleware';
import { Trip, Winery, WineryDbId } from '@/lib/types';
import { useWineryStore } from './wineryStore';
import { TripService } from '@/lib/services/tripService';
import { createClient } from '@/utils/supabase/client';
import { RealtimeChannel } from '@supabase/supabase-js';
import { formatDateLocal, getTodayLocal } from '@/lib/utils';

interface TripState {
  trips: Trip[];
  tripsForDate: Trip[];
  upcomingTrips: Trip[];
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  selectedTrip: Trip | null;
  subscription: RealtimeChannel | null;
  page: number;
  count: number;
  hasMore: boolean;
  subscribeToTripUpdates: () => void;
  unsubscribeFromTripUpdates: () => void;
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
  reset: () => void;
}

export const useTripStore = createWithEqualityFn<TripState>()(
  persist(
    (set, get) => ({
      trips: [],
      tripsForDate: [],
      upcomingTrips: [],
      isLoading: false,
      isSaving: false,
      error: null,
      selectedTrip: null,
      subscription: null,
      page: 1,
      count: 0,
      hasMore: true,

      setPage: (page: number) => set({ page }),

      subscribeToTripUpdates: () => {
        const { subscription: existingSub } = get();
        if (existingSub) return;

        const supabase = createClient();
        const subscription = supabase
          .channel('trip-updates')
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'trips' },
            async (payload) => {
              const changedTripId = (payload.new as any)?.id || (payload.old as any)?.id;
              
              // Always refresh lists
              await get().fetchTrips(get().page, 'upcoming', true);
              await get().fetchUpcomingTrips();
              
              const { selectedTrip } = get();
              if (selectedTrip?.id === changedTripId) {
                await get().fetchTripById(changedTripId.toString());
              }
            }
          )
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'trip_wineries' },
            async (payload) => {
              const changedTripId = (payload.new as any)?.trip_id || (payload.old as any)?.trip_id;
              const { selectedTrip } = get();
              
              if (selectedTrip?.id === changedTripId) {
                await get().fetchTripById(changedTripId.toString());
              }
            }
          )
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'trip_members' },
            async (payload) => {
              const changedTripId = (payload.new as any)?.trip_id || (payload.old as any)?.trip_id;
              const { selectedTrip } = get();
              
              if (selectedTrip?.id === changedTripId) {
                await get().fetchTripById(changedTripId.toString());
              }
            }
          )
          .subscribe();

        set({ subscription });
      },

      unsubscribeFromTripUpdates: () => {
        const { subscription } = get();
        if (subscription) {
          subscription.unsubscribe();
          set({ subscription: null });
        }
      },

      fetchTrips: async (page: number, type: 'upcoming' | 'past', refresh = false) => {
        set({ isLoading: true, error: null });
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
        } catch (error: any) {
          console.error("Failed to fetch trips", error);
          // Only set global error if we have no trips, otherwise silent failure (keep data)
          if (get().trips.length > 0) {
            set({ isLoading: false });
          } else {
            set({ isLoading: false, error: error.message || "Failed to load trips." });
          }
        }
      },

      fetchTripById: async (tripId: string) => {
        set({ isLoading: true, error: null });
        try {
          const trip = await TripService.getTripById(tripId);
          
          set(state => {
            const numericId = Number(trip.id);
            const filteredTrips = state.trips.filter(t => Number(t.id) !== numericId);
            return {
              trips: [...filteredTrips, trip],
              selectedTrip: state.selectedTrip && Number(state.selectedTrip.id) === numericId ? trip : state.selectedTrip,
              isLoading: false,
              error: null
            };
          });

          // After setting the trip, ensure all its wineries have their details.
          const { ensureWineryDetails } = useWineryStore.getState();
          const wineryDetailPromises = trip.wineries.map((winery: Winery) => ensureWineryDetails(winery.id));
          
          const detailedWineries = (await Promise.all(wineryDetailPromises)).filter(Boolean) as Winery[];
          const detailedWineriesMap = new Map(detailedWineries.map((w: Winery) => [w.id, w]));

          // Update the trip in the store with the newly fetched details
          set(state => {
            const numericId = Number(trip.id);
            const newTrips = state.trips.map(t => {
              if (Number(t.id) !== numericId) return t;

              const updatedWineries = t.wineries.map(wineryInTrip => {
                const detailedWinery = detailedWineriesMap.get(wineryInTrip.id);
                return detailedWinery ? { ...detailedWinery, ...wineryInTrip } : wineryInTrip;
              });
              
              return { ...t, wineries: updatedWineries };
            });
            return { trips: newTrips };
          });
        } catch (error: any) {
          console.error("Failed to fetch trip details", error);
          set({ isLoading: false, error: error.message || "Failed to load trip details." });
        }
      },

      fetchUpcomingTrips: async () => {
        set({ isLoading: true });
        try {
          const trips = await TripService.getUpcomingTrips();
          set({ upcomingTrips: trips, isLoading: false });
        } catch (error) {
          console.error("Failed to fetch upcoming trips", error);
          // Do NOT clear data on error. Just stop loading.
          set({ isLoading: false });
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
          // Do NOT clear data on error. Just stop loading.
          set({ isLoading: false });
        }
      },

      createTrip: async (trip: Partial<Trip>) => {
        const tempId = -Date.now();
        const tempTrip: Trip = {
          id: tempId,
          user_id: trip.user_id || '',
          trip_date: trip.trip_date || getTodayLocal(),
          name: trip.name,
          wineries: trip.wineries || [],
          members: [],
        };

        const isFuture = new Date(tempTrip.trip_date + 'T00:00:00') >= new Date(new Date().setHours(0, 0, 0, 0));

        // Optimistically update ALL lists
        set(state => {
          const newUpcoming = isFuture ? [...state.upcomingTrips, tempTrip] : state.upcomingTrips;
          const newTrips = [tempTrip, ...state.trips];

          // Only add to tripsForDate if it matches the current view's date context
          // If tripsForDate is empty, we can't be sure, so we skip optimistic update for safety.
          const currentViewDate = state.tripsForDate[0]?.trip_date;
          const shouldAddToPlanner = currentViewDate && currentViewDate === tempTrip.trip_date;
          
          return {
            tripsForDate: shouldAddToPlanner ? [...state.tripsForDate, tempTrip] : state.tripsForDate,
            upcomingTrips: newUpcoming,
            trips: newTrips
          };
        });

        try {
          const createdTrip = await TripService.createTrip(trip);

          // Replace temporary trip with the real one from the server in ALL lists
          set(state => {
            return {
              tripsForDate: state.tripsForDate.map(t => Number(t.id) === tempId ? createdTrip! : t),
              upcomingTrips: state.upcomingTrips.map(t => Number(t.id) === tempId ? createdTrip! : t),
              trips: state.trips.map(t => Number(t.id) === tempId ? createdTrip! : t)
            };
          });

          return createdTrip;
        } catch (error) {
          console.error("Failed to create trip, reverting optimistic update.", error);
          // On failure, remove the temporary trip from ALL lists
          set(state => ({ 
            tripsForDate: state.tripsForDate.filter(t => Number(t.id) !== tempId),
            upcomingTrips: state.upcomingTrips.filter(t => Number(t.id) !== tempId),
            trips: state.trips.filter(t => Number(t.id) !== tempId)
          }));
          throw error; // Re-throw to be caught by the UI
        }
      },

      deleteTrip: async (tripId: string) => {
        const tripIdAsNumber = parseInt(tripId, 10);
        const originalTrips = get().trips;
        const originalTripsForDate = get().tripsForDate;

        // Optimistically remove from both lists
        set(state => ({ 
          trips: state.trips.filter(t => Number(t.id) !== tripIdAsNumber),
          tripsForDate: state.tripsForDate.filter(t => Number(t.id) !== tripIdAsNumber),
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
            Number(trip.id) === tripIdAsNumber ? { ...trip, ...updates } : trip
          );
          return { trips: newTrips };
        });

        try {
          await TripService.updateTrip(tripId, updates);
        } catch (error) {
          set({ trips: originalTrips }); // Revert on network error
          throw error;
        }
      },

      updateWineryOrder: async (tripId: string, wineryIds: number[]) => {
        const tripIdAsNumber = parseInt(tripId, 10);
        const originalTrips = get().trips;
        const tripToUpdate = originalTrips.find(t => Number(t.id) === tripIdAsNumber);

        if (!tripToUpdate) return;

        // Create the new ordered winery list for the optimistic update
        const reorderedWineries = wineryIds.map(id => 
          tripToUpdate.wineries.find(w => w.dbId === id)
        ).filter((w): w is Winery => w !== undefined);

        // Optimistically update the state
          set(state => ({
            trips: state.trips.map(t => 
              Number(t.id) === tripIdAsNumber ? { ...t, wineries: reorderedWineries } : t
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
        const tripIndex = originalTrips.findIndex(t => Number(t.id) === tripIdAsNumber);
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
        const originalTrips = get().trips;
        const tripIdAsNumber = parseInt(tripId, 10);
        
        // Optimistic Update
        set(state => ({
          trips: state.trips.map(t => {
            if (Number(t.id) !== tripIdAsNumber) return t;
            return {
              ...t,
              wineries: t.wineries.map(w => 
                w.dbId === wineryId ? { ...w, notes } : w
              )
            };
          })
        }));

        try {
          await TripService.updateTrip(tripId, { updateNote: { wineryId, notes } });
        } catch (error) {
          console.error("Failed to save winery note, reverting.", error);
          set({ trips: originalTrips });
          throw error;
        }
      },

      saveAllWineryNotes: async (tripId: string, notes: Record<number, string>) => {
        const originalTrips = get().trips;
        const tripIdAsNumber = parseInt(tripId, 10);

        // Optimistic Update
        set(state => ({
          trips: state.trips.map(t => {
            if (Number(t.id) !== tripIdAsNumber) return t;
            return {
              ...t,
              wineries: t.wineries.map(w => 
                w.dbId && notes[w.dbId] ? { ...w, notes: notes[w.dbId] } : w
              )
            };
          })
        }));

        try {
          await TripService.updateTrip(tripId, { updateNote: { notes } });
        } catch (error) {
          console.error("Failed to save all winery notes, reverting.", error);
          set({ trips: originalTrips });
          throw error;
        }
      },
      
      addMembersToTrip: async (tripId: string, _memberIds: string[]) => {
        const tripIdAsNumber = parseInt(tripId, 10);
        const originalTrips = get().trips;
        const tripToUpdate = originalTrips.find(t => Number(t.id) === tripIdAsNumber);
        
        if (!tripToUpdate) return;

        // Note: Full member objects (TripMember) are needed for the UI.
        // Optimistically we only have the IDs. Since the UI (TripShareDialog) 
        // usually handles one-by-one addition via RPC and then we refetch, 
        // this bulk 'addMembersToTrip' is more of a sync helper.
        // However, to fulfill the 'optimistic' requirement, we'll refetch.
        
        try {
          // If this is called, we assume the backend is already being updated or 
          // we want to ensure sync.
          await get().fetchTripById(tripId);
        } catch (error) {
            console.error("Failed to sync members:", error);
        }
      },

      setSelectedTrip: (trip) => set({ selectedTrip: trip }),

      addWineryToTrips: async (winery, tripDate, selectedTrips, newTripName, addTripNotes) => {
        set({ isSaving: true });
        const supabase = createClient(); // Direct Supabase client for RPCs
        const dateString = formatDateLocal(tripDate);

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
              get().fetchTripsForDate(dateString),
              get().fetchTrips(1, 'upcoming', true) // NEW: Refresh the main list used by TripList
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

      reset: () => set({
        trips: [],
        tripsForDate: [],
        upcomingTrips: [],
        isLoading: false,
        isSaving: false,
        error: null,
        selectedTrip: null,
        page: 1,
        count: 0,
        hasMore: true,
      }),
    }),
    {
      name: process.env.NEXT_PUBLIC_IS_E2E === 'true' ? 'trip-storage-e2e' : 'trip-storage',
      partialize: (state) => ({ 
        trips: state.trips, 
        upcomingTrips: state.upcomingTrips,
        tripsForDate: state.tripsForDate,
        page: state.page,
        count: state.count,
        hasMore: state.hasMore
      }),
    }
  )
);

// Expose store for E2E testing
if (typeof window !== 'undefined') {
  (window as any).useTripStore = useTripStore;
}