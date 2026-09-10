import { Trip, Winery, WineryDbId } from '@/lib/types';
import { WineryService } from '@/lib/services/wineryService';
import { useWineryStore } from '../wineryStore';
import { useSyncStore } from '../syncStore';
import { createClient } from '@/utils/supabase/client';
import { formatDateLocal } from '@/lib/utils';
import { isNetworkError } from '../sync-utils';
import type { StoreApi } from 'zustand';
import type { TripState } from '../tripStore';

type GetTripState = StoreApi<TripState>['getState'];
type SetTripState = StoreApi<TripState>['setState'];

export async function addWineryToTripsHelper(
  get: GetTripState,
  set: SetTripState,
  winery: Winery,
  tripDate: Date,
  selectedTrips: Set<string>,
  newTripName: string,
  addTripNotes: string
): Promise<void> {
  set({ isSaving: true });
  const supabase = createClient();
  const dateString = formatDateLocal(tripDate);

  const originalTrips = get().trips;
  const originalTripsForDate = get().tripsForDate;
  const existingTripIds = Array.from(selectedTrips).filter(id => id !== 'new');

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
          wineries: [...trip.wineries, optimisticWinery],
          syncStatus: 'pending' as const
        };
      }
      return trip;
    });
  };

  if (existingTripIds.length > 0) {
    set({
      trips: updateTripLists(originalTrips),
      tripsForDate: updateTripLists(originalTripsForDate),
      lastActionTimestamp: Date.now()
    });
  }

  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;

  const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
  if (isOffline && user) {
    for (const tripId of Array.from(selectedTrips)) {
      if (tripId === 'new') {
        await useSyncStore.getState().addMutation({
          type: 'create_trip',
          userId: user.id,
          payload: {
            name: newTripName,
            trip_date: dateString,
            wineries: [optimisticWinery],
            notes: addTripNotes,
            tempId: -Date.now()
          }
        });
      } else {
        await useSyncStore.getState().addMutation({
          type: 'update_trip',
          userId: user.id,
          payload: {
            tripId: tripId,
            updates: {
              addWinery: {
                winery: optimisticWinery,
                notes: addTripNotes
              }
            }
          }
        });
      }
    }
    set({ isSaving: false });
    return;
  }

  try {
    const rpcWineryData = WineryService.getRpcData(winery);
    const tripPromises = Array.from(selectedTrips).map(async (tripId) => {
      if (tripId === 'new') {
        if (!newTripName.trim()) throw new Error("New trip requires a name.");
        const { data, error } = await supabase.rpc('create_trip_with_winery', {
          p_trip_name: newTripName,
          p_trip_date: dateString,
          p_winery_data: rpcWineryData,
          p_notes: addTripNotes || null
        });
        if (error) throw error;
        return { tripId: data.trip_id, wineryId: data.winery_id, isNew: true };
      } else {
        const numericTripId = Number(tripId);
        const { data, error } = await supabase.rpc('add_winery_to_trip', {
          p_trip_id: numericTripId,
          p_winery_data: rpcWineryData,
          p_notes: addTripNotes || null
        });
        if (error) throw error;
        return { tripId: numericTripId, wineryId: (data as any)?.winery_id, isNew: false };
      }
    });

    const results = await Promise.all(tripPromises);
    set(state => {
      const updateSynced = (list: Trip[]) => {
        return list.map(trip => {
          if (existingTripIds.includes(trip.id.toString())) {
            return { ...trip, syncStatus: 'synced' as const };
          }
          return trip;
        });
      };
      return {
        trips: updateSynced(state.trips),
        tripsForDate: updateSynced(state.tripsForDate),
        lastActionTimestamp: Date.now()
      };
    });

    let badgeTripId: number | undefined;
    let badgeTripName: string | undefined;
    let finalWineryDbId: number | undefined;

    const newTripResult = results.find(r => r.isNew);
    if (newTripResult) {
      badgeTripId = newTripResult.tripId;
      badgeTripName = newTripName;
      finalWineryDbId = newTripResult.wineryId;
    } else if (selectedTrips.size > 0) {
      const firstTripId = Array.from(selectedTrips).find(id => id !== 'new');
      if (firstTripId) {
        badgeTripId = Number(firstTripId);
        const trip = get().tripsForDate.find(t => t.id === badgeTripId);
        badgeTripName = trip?.name;
        finalWineryDbId = results[0].wineryId;
      }
    }

    if (finalWineryDbId && finalWineryDbId !== winery.dbId) {
      useWineryStore.getState().upsertWinery({ ...winery, dbId: finalWineryDbId as WineryDbId });
    }

    if (badgeTripId && badgeTripName) {
      useWineryStore.getState().updateWinery(winery.id, { 
        trip_id: badgeTripId, 
        trip_name: badgeTripName, 
        trip_date: dateString,
        dbId: (finalWineryDbId || winery.dbId) as WineryDbId
      });
    }

    await Promise.all([
      get().fetchUpcomingTrips(),
      get().fetchTripsForDate(dateString),
      get().fetchTrips(1, 'upcoming', true)
    ]);
    set({ lastActionTimestamp: Date.now() });

  } catch (error) {
    if (isNetworkError(error) && user) {
      for (const tripId of Array.from(selectedTrips)) {
        if (tripId === 'new') {
          await useSyncStore.getState().addMutation({
            type: 'create_trip',
            userId: user.id,
            payload: {
              name: newTripName,
              trip_date: dateString,
              wineries: [optimisticWinery],
              notes: addTripNotes,
              tempId: -Date.now()
            }
          });
        } else {
          await useSyncStore.getState().addMutation({
            type: 'update_trip',
            userId: user.id,
            payload: {
              tripId: tripId,
              updates: { addWinery: { winery: optimisticWinery, notes: addTripNotes } }
            }
          });
        }
      }
      return;
    }
    console.error("Error adding winery to trips:", error);
    set(state => {
      const updateError = (list: Trip[]) => {
        return list.map(trip => {
          if (existingTripIds.includes(trip.id.toString())) {
            return { ...trip, syncStatus: 'error' as const };
          }
          return trip;
        });
      };
      return {
        trips: updateError(state.trips),
        tripsForDate: updateError(state.tripsForDate),
        lastActionTimestamp: Date.now()
      };
    });
    throw error;
  } finally {
    set({ isSaving: false });
  }
}
