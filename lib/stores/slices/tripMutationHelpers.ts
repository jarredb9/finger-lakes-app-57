import { Trip, TripUpdateInput } from '@/lib/types';
import { isRecord } from '@/lib/utils/winery';
import { TripService } from '@/lib/services/tripService';
import { createClient } from '@/utils/supabase/client';
import { getTodayLocal } from '@/lib/utils';
import { enqueueIfOffline, handleSyncError } from '../sync-utils';
import type { StoreApi } from 'zustand';
import type { TripState } from '../tripStore';

type GetTripState = StoreApi<TripState>['getState'];
type SetTripState = StoreApi<TripState>['setState'];

export async function createTripHelper(
  get: GetTripState,
  set: SetTripState,
  trip: Partial<Trip>
): Promise<Trip | null> {
  const idempotencyKey = crypto.randomUUID();
  const tempId = -Date.now();
  const tempTrip: Trip = {
    id: tempId,
    user_id: trip.user_id || '',
    trip_date: trip.trip_date || getTodayLocal(),
    name: trip.name,
    wineries: trip.wineries || [],
    members: [],
    syncStatus: 'pending',
  };

  const isFuture = new Date(tempTrip.trip_date + 'T00:00:00') >= new Date(new Date().setHours(0, 0, 0, 0));
  const now = Date.now();
  set(state => {
    const newUpcoming = isFuture ? [...state.upcomingTrips, tempTrip] : state.upcomingTrips;
    const newTrips = [tempTrip, ...state.trips];
    const currentViewDate = state.tripsForDate[0]?.trip_date;
    const shouldAddToPlanner = currentViewDate && currentViewDate === tempTrip.trip_date;
    
    return {
      tripsForDate: shouldAddToPlanner ? [...state.tripsForDate, tempTrip] : state.tripsForDate,
      upcomingTrips: newUpcoming,
      trips: newTrips,
      lastActionTimestamp: now
    };
  });
  get().setLastActionTimestamp(tempId.toString(), now);

  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  const syncPayload = { ...trip, tempId };

  if (await enqueueIfOffline('create_trip', user?.id, syncPayload, idempotencyKey)) {
    return tempTrip;
  }

  try {
    const createdTrip = await TripService.createTrip(trip, idempotencyKey);
    const finishedNow = Date.now();
    if (createdTrip?.id) {
      get().setLastActionTimestamp(createdTrip.id.toString(), finishedNow);
    }
    set(state => {
      const syncedTrip = createdTrip ? { ...createdTrip, syncStatus: 'synced' as const } : null;
      return {
        tripsForDate: state.tripsForDate.map(t => Number(t.id) === tempId ? syncedTrip! : t),
        upcomingTrips: state.upcomingTrips.map(t => Number(t.id) === tempId ? syncedTrip! : t),
        trips: state.trips.map(t => Number(t.id) === tempId ? syncedTrip! : t),
        lastActionTimestamp: finishedNow
      };
    });

    return createdTrip;
  } catch (error) {
    if (await handleSyncError(error, 'create_trip', user?.id, syncPayload, idempotencyKey)) {
      return tempTrip;
    }

    console.error("Failed to create trip, rolling back optimistic state.", error);
    set(state => ({ 
      tripsForDate: state.tripsForDate.filter(t => Number(t.id) !== tempId),
      upcomingTrips: state.upcomingTrips.filter(t => Number(t.id) !== tempId),
      trips: state.trips.filter(t => Number(t.id) !== tempId),
      lastActionTimestamp: Date.now()
    }));
    throw error;
  }
}

export async function deleteTripHelper(
  get: GetTripState,
  set: SetTripState,
  tripId: string
): Promise<void> {
  const tripIdAsNumber = Number(tripId);
  const originalTrips = get().trips;
  const originalTripsForDate = get().tripsForDate;

  const now = Date.now();
  set(state => ({ 
    trips: state.trips.filter(t => Number(t.id) !== tripIdAsNumber),
    tripsForDate: state.tripsForDate.filter(t => Number(t.id) !== tripIdAsNumber),
    lastActionTimestamp: now
  }));
  get().setLastActionTimestamp(tripId.toString(), now);

  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  const syncPayload = { tripId };

  if (await enqueueIfOffline('delete_trip', user?.id, syncPayload)) {
    return;
  }

  try {
    await TripService.deleteTrip(tripId);
  } catch (error) {
    if (await handleSyncError(error, 'delete_trip', user?.id, syncPayload)) {
      return;
    }

    console.error("Failed to delete trip, marking as error:", error);
    const revertedTrips = originalTrips.map(t => 
      Number(t.id) === tripIdAsNumber ? { ...t, syncStatus: 'error' as const } : t
    );
    const revertedTripsForDate = originalTripsForDate.map(t => 
      Number(t.id) === tripIdAsNumber ? { ...t, syncStatus: 'error' as const } : t
    );
    set({ trips: revertedTrips, tripsForDate: revertedTripsForDate, lastActionTimestamp: Date.now() });
    throw error;
  }
}

const ALLOWED_TRIP_UPDATE_KEYS = new Set<string>(['name', 'trip_date']);

export async function updateTripHelper(
  get: GetTripState,
  set: SetTripState,
  tripId: string,
  updates: TripUpdateInput
): Promise<void> {
  if (!isRecord(updates)) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[updateTrip] Warning: Invalid or non-object updates payload received:', updates);
    }
    return;
  }

  const unpermittedKeys = Object.keys(updates).filter(
    key => !ALLOWED_TRIP_UPDATE_KEYS.has(key)
  );
  if (unpermittedKeys.length > 0 && process.env.NODE_ENV !== 'production') {
    console.warn(
      '[updateTrip] Warning: Unpermitted or invalid keys stripped from update payload:',
      unpermittedKeys
    );
  }

  const sanitizedUpdates: TripUpdateInput = {};
  let hasInvalidValues = false;

  if ('name' in updates) {
    if (typeof updates.name === 'string') {
      sanitizedUpdates.name = updates.name;
    } else if (updates.name !== undefined) {
      hasInvalidValues = true;
    }
  }

  if ('trip_date' in updates) {
    if (
      typeof updates.trip_date === 'string' &&
      !isNaN(new Date(updates.trip_date).getTime())
    ) {
      sanitizedUpdates.trip_date = updates.trip_date;
    } else if (updates.trip_date !== undefined) {
      hasInvalidValues = true;
    }
  }

  if (hasInvalidValues && process.env.NODE_ENV !== 'production') {
    console.warn('[updateTrip] Warning: Invalid field types received in updates payload:', updates);
  }

  if (Object.keys(sanitizedUpdates).length === 0) {
    return;
  }

  const tripIdAsNumber = Number(tripId);
  const now = Date.now();
  
  set(state => ({
    trips: state.trips.map(trip =>
      Number(trip.id) === tripIdAsNumber ? { ...trip, ...sanitizedUpdates, syncStatus: 'pending' as const } : trip
    ),
    tripsForDate: state.tripsForDate.map(trip =>
      Number(trip.id) === tripIdAsNumber ? { ...trip, ...sanitizedUpdates, syncStatus: 'pending' as const } : trip
    ),
    upcomingTrips: state.upcomingTrips.map(trip =>
      Number(trip.id) === tripIdAsNumber ? { ...trip, ...sanitizedUpdates, syncStatus: 'pending' as const } : trip
    ),
    lastActionTimestamp: now
  }));
  get().setLastActionTimestamp(tripId.toString(), now);

  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  const syncPayload = { tripId, updates: sanitizedUpdates };

  if (await enqueueIfOffline('update_trip', user?.id, syncPayload)) {
    return;
  }

  try {
    await TripService.updateTrip(tripId, sanitizedUpdates);
    set(state => ({
      trips: state.trips.map(trip =>
        Number(trip.id) === tripIdAsNumber ? { ...trip, syncStatus: 'synced' as const } : trip
      ),
      tripsForDate: state.tripsForDate.map(trip =>
        Number(trip.id) === tripIdAsNumber ? { ...trip, syncStatus: 'synced' as const } : trip
      ),
      upcomingTrips: state.upcomingTrips.map(trip =>
        Number(trip.id) === tripIdAsNumber ? { ...trip, syncStatus: 'synced' as const } : trip
      ),
      lastActionTimestamp: Date.now()
    }));
  } catch (error) {
    if (await handleSyncError(error, 'update_trip', user?.id, syncPayload)) {
      return;
    }

    set(state => ({
      trips: state.trips.map(trip =>
        Number(trip.id) === tripIdAsNumber ? { ...trip, syncStatus: 'error' as const } : trip
      ),
      tripsForDate: state.tripsForDate.map(trip =>
        Number(trip.id) === tripIdAsNumber ? { ...trip, syncStatus: 'error' as const } : trip
      ),
      upcomingTrips: state.upcomingTrips.map(trip =>
        Number(trip.id) === tripIdAsNumber ? { ...trip, syncStatus: 'error' as const } : trip
      ),
      lastActionTimestamp: Date.now()
    }));
    throw error;
  }
}

export function replaceTripTempIdHelper(
  set: SetTripState,
  tempId: number | string,
  syncedTrip: Trip
): void {
  const numericTempId = Number(tempId);
  const normalizedSyncedTrip: Trip = {
    ...syncedTrip,
    id: Number(syncedTrip.id),
    syncStatus: 'synced',
  };

  const replaceInList = (list: Trip[]): Trip[] => {
    const hasSyncedId = list.some(t => Number(t.id) === Number(normalizedSyncedTrip.id));
    if (hasSyncedId) {
      return list.filter(t => Number(t.id) !== numericTempId);
    }
    return list.map(t => Number(t.id) === numericTempId ? normalizedSyncedTrip : t);
  };

  set(state => ({
    trips: replaceInList(state.trips),
    upcomingTrips: replaceInList(state.upcomingTrips),
    tripsForDate: replaceInList(state.tripsForDate),
    lastActionTimestamp: Date.now(),
  }));
}

