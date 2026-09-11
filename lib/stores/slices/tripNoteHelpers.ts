import { Trip } from '@/lib/types';
import { TripService } from '@/lib/services/tripService';
import { createClient } from '@/utils/supabase/client';
import { enqueueIfOffline, handleSyncError } from '../sync-utils';
import type { StoreApi } from 'zustand';
import type { TripState } from '../tripStore';

type GetTripState = StoreApi<TripState>['getState'];
type SetTripState = StoreApi<TripState>['setState'];

export async function saveWineryNoteHelper(
  get: GetTripState,
  set: SetTripState,
  tripId: string,
  wineryId: number,
  notes: string
): Promise<void> {
  const tripIdAsNumber = Number(tripId);
  const originalTrips = get().trips;

  set(state => ({
    trips: state.trips.map((t: Trip) => {
      if (Number(t.id) !== tripIdAsNumber) return t;
      return {
        ...t,
        wineries: t.wineries.map(w => 
          w.dbId === wineryId ? { ...w, notes } : w
        ),
        syncStatus: 'pending' as const
      };
    }),
    lastActionTimestamp: Date.now()
  }));

  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  const syncPayload = { tripId, updates: { updateNote: { wineryId, notes } } };

  if (await enqueueIfOffline('update_trip', user?.id, syncPayload)) {
    return;
  }

  try {
    await TripService.updateTrip(tripId, { updateNote: { wineryId, notes } });
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

    console.error("Failed to save winery note, reverting.", error);
    set({
      trips: originalTrips.map(t => 
        Number(t.id) === tripIdAsNumber ? { ...t, syncStatus: 'error' as const } : t
      ),
      lastActionTimestamp: Date.now()
    });
    throw error;
  }
}

export async function saveAllWineryNotesHelper(
  get: GetTripState,
  set: SetTripState,
  tripId: string,
  notes: Record<number, string>
): Promise<void> {
  const tripIdAsNumber = Number(tripId);
  const originalTrips = get().trips;

  set(state => ({
    trips: state.trips.map((t: Trip) => {
      if (Number(t.id) !== tripIdAsNumber) return t;
      return {
        ...t,
        wineries: t.wineries.map(w => 
          w.dbId && notes[w.dbId] ? { ...w, notes: notes[w.dbId] } : w
        ),
        syncStatus: 'pending' as const
      };
    }),
    lastActionTimestamp: Date.now()
  }));

  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  const syncPayload = { tripId, updates: { updateNote: { notes } } };

  if (await enqueueIfOffline('update_trip', user?.id, syncPayload)) {
    return;
  }

  try {
    await TripService.updateTrip(tripId, { updateNote: { notes } });
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

    console.error("Failed to save all winery notes, reverting.", error);
    set({
      trips: originalTrips.map(t => 
        Number(t.id) === tripIdAsNumber ? { ...t, syncStatus: 'error' as const } : t
      ),
      lastActionTimestamp: Date.now()
    });
    throw error;
  }
}
