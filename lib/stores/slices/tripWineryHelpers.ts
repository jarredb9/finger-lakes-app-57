import { Trip, Winery, WineryDbId } from '@/lib/types';
import { TripService } from '@/lib/services/tripService';
import { WineryService } from '@/lib/services/wineryService';
import { useWineryStore } from '../wineryStore';
import { createClient } from '@/utils/supabase/client';
import { enqueueIfOffline, handleSyncError } from '../sync-utils';
import type { StoreApi } from 'zustand';
import type { TripState } from '../tripStore';

type GetTripState = StoreApi<TripState>['getState'];
type SetTripState = StoreApi<TripState>['setState'];

export async function updateWineryOrderHelper(
  get: GetTripState,
  set: SetTripState,
  tripId: string,
  wineryIds: number[]
): Promise<void> {
  const tripIdAsNumber = Number(tripId);
  const originalTrips = get().trips;
  const tripToUpdate = originalTrips.find(t => Number(t.id) === tripIdAsNumber);

  if (!tripToUpdate) return;

  const reorderedWineries = wineryIds.map(id => 
    tripToUpdate.wineries.find(w => w.dbId === id)
  ).filter((w): w is Winery => w !== undefined);

  set(state => ({
    trips: state.trips.map(t =>
      Number(t.id) === tripIdAsNumber ? { ...t, wineries: reorderedWineries, syncStatus: 'pending' as const } : t
    ),
    lastActionTimestamp: Date.now()
  }));

  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  const syncPayload = { tripId, updates: { wineryOrder: wineryIds } };

  if (await enqueueIfOffline('update_trip', user?.id, syncPayload)) {
    return;
  }

  try {
    await TripService.updateTrip(tripId, { wineryOrder: wineryIds });
    set(state => ({
      trips: state.trips.map(t =>
        Number(t.id) === tripIdAsNumber ? { ...t, syncStatus: 'synced' as const } : t
      ),
      lastActionTimestamp: Date.now()
    }));
  } catch (error) {
    if (await handleSyncError(error, 'update_trip', user?.id, syncPayload)) {
      return;
    }
    console.error("Failed to update winery order, reverting.", error);
    set(state => ({
      trips: state.trips.map(t => 
        Number(t.id) === tripIdAsNumber ? { ...t, syncStatus: 'error' as const } : t
      ),
      lastActionTimestamp: Date.now()
    }));
    throw new Error("Failed to save new winery order.");
  }
}

export async function removeWineryFromTripHelper(
  get: GetTripState,
  set: SetTripState,
  tripId: string,
  wineryId: number
): Promise<void> {
  const tripIdAsNumber = Number(tripId);
  const originalTrips = get().trips;
  const tripIndex = originalTrips.findIndex(t => Number(t.id) === tripIdAsNumber);
  if (tripIndex === -1) return;

  const tripToUpdate = originalTrips[tripIndex];
  const updatedWineries = tripToUpdate.wineries.filter(w => w.dbId !== wineryId);
  const updatedTrip = { ...tripToUpdate, wineries: updatedWineries, syncStatus: 'pending' as const } as Trip;
  const updatedTrips = [...originalTrips];
  updatedTrips[tripIndex] = updatedTrip;

  set({ trips: updatedTrips, selectedTrip: updatedTrip, lastActionTimestamp: Date.now() });

  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  const syncPayload = { tripId, updates: { removeWineryId: wineryId } };

  if (await enqueueIfOffline('update_trip', user?.id, syncPayload)) {
    return;
  }

  try {
    const { error } = await supabase.rpc('remove_winery_from_trip', { 
      p_trip_id: tripIdAsNumber, 
      p_winery_id: wineryId 
    });

    if (error) {
      if (await handleSyncError(error, 'update_trip', user?.id, syncPayload)) {
        return;
      }
      throw error;
    }

    set(state => ({
      trips: state.trips.map(t =>
        Number(t.id) === tripIdAsNumber ? { ...t, syncStatus: 'synced' as const } : t
      ),
      lastActionTimestamp: Date.now()
    }));
  } catch (error) {
    if (await handleSyncError(error, 'update_trip', user?.id, syncPayload)) {
      return;
    }
    console.error("Failed to remove winery, reverting:", error);
    set(state => ({
      trips: state.trips.map(t => 
        Number(t.id) === tripIdAsNumber ? { ...t, syncStatus: 'error' as const } : t
      ),
      lastActionTimestamp: Date.now()
    }));
  }
}

export async function toggleWineryOnTripHelper(
  get: GetTripState,
  set: SetTripState,
  winery: Winery,
  trip: Trip
): Promise<void> {
  const originalTrips = get().trips;
  const tripIndex = originalTrips.findIndex(t => t.id === trip.id);
  if (tripIndex === -1) return;

  const tripToUpdate = originalTrips[tripIndex];
  const existingWineryOnTrip = tripToUpdate.wineries.find(w => w.id === winery.id || (w.dbId && w.dbId === winery.dbId));
  const isOnTrip = !!existingWineryOnTrip;
  const wineryDbId = (winery.dbId || -Date.now()) as WineryDbId; 

  const updatedWineries = isOnTrip
    ? tripToUpdate.wineries.filter(w => w.id !== winery.id && w.dbId !== winery.dbId)
    : [...tripToUpdate.wineries, { ...winery, dbId: wineryDbId }];

  const updatedTrip = { ...tripToUpdate, wineries: updatedWineries, syncStatus: 'pending' as const };
  const updatedTrips = [...originalTrips];
  updatedTrips[tripIndex] = updatedTrip;

  const originalTripsForDate = get().tripsForDate;
  const tripForDateIndex = originalTripsForDate.findIndex(t => t.id === trip.id);
  let updatedTripsForDate = originalTripsForDate;
  
  if (tripForDateIndex !== -1) {
    updatedTripsForDate = [...originalTripsForDate];
    updatedTripsForDate[tripForDateIndex] = updatedTrip;
  }

  set({ trips: updatedTrips, selectedTrip: updatedTrip, tripsForDate: updatedTripsForDate, lastActionTimestamp: Date.now() });

  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  const syncPayload = {
    tripId: trip.id.toString(),
    updates: isOnTrip 
      ? { removeWineryId: existingWineryOnTrip?.dbId || winery.dbId }
      : { addWinery: { winery: { ...winery, dbId: wineryDbId }, notes: null } }
  };

  if (await enqueueIfOffline('update_trip', user?.id, syncPayload)) {
    return;
  }

  try {
    if (isOnTrip) {
      const removeId = existingWineryOnTrip?.dbId || winery.dbId;
      if (!removeId) throw new Error("Cannot remove winery without DB ID.");
      
      const { error } = await supabase.rpc('remove_winery_from_trip', {
        p_trip_id: trip.id,
        p_winery_id: removeId
      });
      if (error) {
        if (await handleSyncError(error, 'update_trip', user?.id, syncPayload)) {
          return;
        }
        throw error;
      }
    } else {
      const rpcWineryData = WineryService.getRpcData(winery);
      const { data, error } = await supabase.rpc('add_winery_to_trip', {
        p_trip_id: trip.id,
        p_winery_data: rpcWineryData,
        p_notes: null
      });

      if (error) {
        if (await handleSyncError(error, 'update_trip', user?.id, syncPayload)) {
          return;
        }
        throw error;
      }

      const wineryDbIdResult = (data as any)?.winery_id;
      if (wineryDbIdResult && wineryDbIdResult !== winery.dbId) {
        useWineryStore.getState().upsertWinery({ ...winery, dbId: wineryDbIdResult as WineryDbId });
      }
    }
    set(state => ({
      trips: state.trips.map(t => 
        Number(t.id) === Number(trip.id) ? { ...t, syncStatus: 'synced' as const } : t
      ),
      lastActionTimestamp: Date.now()
    }));
  } catch (error) {
    console.error("Failed to toggle winery on trip, reverting:", error);
    set(state => ({
      trips: state.trips.map(t => 
        Number(t.id) === Number(trip.id) ? { ...t, syncStatus: 'error' as const } : t
      ),
      lastActionTimestamp: Date.now()
    }));
    throw error;
  }
}
