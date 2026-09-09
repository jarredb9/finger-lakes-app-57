import { Trip } from '@/lib/types';
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

    console.error("Failed to create trip, marking as error.", error);
    set(state => ({ 
      tripsForDate: state.tripsForDate.map(t => Number(t.id) === tempId ? { ...t, syncStatus: 'error' as const } : t),
      upcomingTrips: state.upcomingTrips.map(t => Number(t.id) === tempId ? { ...t, syncStatus: 'error' as const } : t),
      trips: state.trips.map(t => Number(t.id) === tempId ? { ...t, syncStatus: 'error' as const } : t),
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

export async function updateTripHelper(
  get: GetTripState,
  set: SetTripState,
  tripId: string,
  updates: any
): Promise<void> {
  const tripIdAsNumber = Number(tripId);
  const now = Date.now();
  
  set(state => ({
    trips: state.trips.map(trip =>
      Number(trip.id) === tripIdAsNumber ? { ...trip, ...updates, syncStatus: 'pending' as const } : trip
    ),
    tripsForDate: state.tripsForDate.map(trip =>
      Number(trip.id) === tripIdAsNumber ? { ...trip, ...updates, syncStatus: 'pending' as const } : trip
    ),
    upcomingTrips: state.upcomingTrips.map(trip =>
      Number(trip.id) === tripIdAsNumber ? { ...trip, ...updates, syncStatus: 'pending' as const } : trip
    ),
    lastActionTimestamp: now
  }));
  get().setLastActionTimestamp(tripId.toString(), now);

  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  const syncPayload = { tripId, updates };

  if (await enqueueIfOffline('update_trip', user?.id, syncPayload)) {
    return;
  }

  try {
    await TripService.updateTrip(tripId, updates);
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
