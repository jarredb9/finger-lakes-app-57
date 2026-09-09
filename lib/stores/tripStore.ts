import { createWithEqualityFn } from 'zustand/traditional';
import { persist, createJSONStorage } from 'zustand/middleware';
import { idbStorage } from './idb-persist-storage';
import { TripDataSlice, createTripDataSlice } from './slices/tripDataSlice';
import { TripUISlice, createTripUISlice } from './slices/tripUISlice';
import { TripRealtimeSlice, createTripRealtimeSlice } from './slices/tripRealtimeSlice';

export interface TripState extends TripDataSlice, TripUISlice, TripRealtimeSlice {
  reset: () => void;
}

export const useTripStore = createWithEqualityFn<TripState>()(
  persist(
    (set, get, store) => ({
      ...createTripDataSlice(set, get, store),
      ...createTripUISlice(set, get, store),
      ...createTripRealtimeSlice(set, get, store),

      reset: () => {
        // ST-11: Teardown Realtime WebSocket subscription cleanly on reset/logout
        const { subscription } = get();
        if (subscription) {
          subscription.unsubscribe();
        }

        set({
          trips: [],
          tripsForDate: [],
          upcomingTrips: [],
          isLoading: false,
          isSaving: false,
          error: null,
          selectedTrip: null,
          lastActionTimestamp: null,
          lastActionTimestamps: {},
          subscription: null,
          page: 1,
          count: 0,
          hasMore: true,
        });
      },
    }),
    {
      name: process.env.NEXT_PUBLIC_IS_E2E === 'true' ? 'trip-storage-e2e' : 'trip-storage',
      storage: createJSONStorage(() => idbStorage),
      partialize: (state): Partial<TripState> => {
        // Support state persistence in E2E for reload-based tests
        // ST-13: Omit action timestamps from IndexedDB persistence to prevent rehydration locks
        return {
          trips: state.trips.slice(0, 20),
          page: state.page,
          count: state.count,
          hasMore: state.hasMore,
        };
      },
    }
  )
);

if (typeof window !== 'undefined') {
  (window as any).useTripStore = useTripStore;
}
