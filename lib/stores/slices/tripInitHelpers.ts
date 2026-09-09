import { Trip } from '@/lib/types';
import { useSyncStore } from '../syncStore';
import { createClient } from '@/utils/supabase/client';
import type { StoreApi } from 'zustand';
import type { TripState } from '../tripStore';

type GetTripState = StoreApi<TripState>['getState'];
type SetTripState = StoreApi<TripState>['setState'];

let tripInitPromise: Promise<void> | null = null;
let isTripStoreInitialized = false;

export function resetTripInitState(): void {
  tripInitPromise = null;
  isTripStoreInitialized = false;
}

export async function initializeTripStoreHelper(
  _get: GetTripState,
  set: SetTripState
): Promise<void> {
  if (isTripStoreInitialized) return;
  if (tripInitPromise) return tripInitPromise;

  tripInitPromise = (async () => {
    const syncStore = useSyncStore.getState();
    if (!syncStore.isInitialized) {
      await syncStore.initialize();
    }

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const queue = useSyncStore.getState().queue;
    const pendingTrips: Trip[] = [];
    const pendingUpdates: { tripId: string; updates: any }[] = [];

    for (const item of queue) {
      try {
        if (item.type === 'create_trip') {
          const payload = await syncStore.getDecryptedPayload<any>(item, user.id);
          pendingTrips.push({
            id: (payload.tempId && !isNaN(Number(payload.tempId))) ? Number(payload.tempId) : -Date.now(),
            user_id: user.id,
            name: payload.name,
            trip_date: payload.trip_date,
            wineries: payload.wineries || [],
            members: [],
            syncStatus: 'pending'
          });
        } else if (item.type === 'update_trip') {
          const payload = await syncStore.getDecryptedPayload<any>(item, user.id);
          pendingUpdates.push({ tripId: payload.tripId, updates: payload.updates });
        }
      } catch (e) {
        console.error('[TripStore] Failed to decrypt pending item:', e);
      }
    }

    set(state => {
      let nextTrips = [...state.trips];

      for (const pt of pendingTrips) {
        if (!nextTrips.find(t => t.id === pt.id)) {
          nextTrips.unshift(pt);
        }
      }

      nextTrips = nextTrips.map(t => {
        const updates = pendingUpdates.filter(u => u.tripId === t.id.toString());
        if (updates.length === 0) return t;

        let updatedTrip = { ...t, syncStatus: 'pending' as const };
        for (const u of updates) {
          if (u.updates.addWinery) {
            updatedTrip.wineries = [...updatedTrip.wineries, u.updates.addWinery.winery];
          } else if (u.updates.removeWineryId) {
            updatedTrip.wineries = updatedTrip.wineries.filter(w => w.dbId !== u.updates.removeWineryId);
          } else {
            updatedTrip = { ...updatedTrip, ...u.updates };
          }
        }
        return updatedTrip;
      });

      return { trips: nextTrips };
    });
    isTripStoreInitialized = true;
  })();

  return tripInitPromise;
}
