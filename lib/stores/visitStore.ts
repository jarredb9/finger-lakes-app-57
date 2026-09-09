import { createWithEqualityFn } from 'zustand/traditional';
import { shallow } from 'zustand/shallow';
import { persist, createJSONStorage } from 'zustand/middleware';
import { idbStorage } from './idb-persist-storage';
import { VisitDataSlice, createVisitDataSlice } from './slices/visitDataSlice';
import { VisitUISlice, createVisitUISlice } from './slices/visitUISlice';
import { VisitRealtimeSlice, createVisitRealtimeSlice } from './slices/visitRealtimeSlice';

export interface VisitState extends VisitDataSlice, VisitUISlice, VisitRealtimeSlice {
  reset: () => void;
}

export const useVisitStore = createWithEqualityFn<VisitState>()(
  persist(
    (set, get, store) => ({
      ...createVisitDataSlice(set, get, store),
      ...createVisitUISlice(set, get, store),
      ...createVisitRealtimeSlice(set, get, store),

      reset: () => {
        // ST-11: Teardown Realtime WebSocket subscription cleanly on reset/logout
        const { subscription } = get();
        if (subscription) {
          subscription.unsubscribe();
        }

        set({
          visits: [],
          isLoading: false,
          error: null,
          isSavingVisit: false,
          isSyncing: false,
          lastActionTimestamp: null,
          lastActionTimestamps: {},
          subscription: null,
          page: 1,
          totalPages: 1,
          hasMore: false,
        });
      },
    }),
    {
      name: process.env.NEXT_PUBLIC_IS_E2E === 'true' ? 'visit-storage-e2e' : 'visit-storage',
      storage: createJSONStorage(() => idbStorage),
      partialize: (state): Partial<VisitState> => {
        // Support state persistence in E2E for reload-based tests
        // ST-13: Omit action timestamps from IndexedDB persistence to prevent rehydration locks
        return {
          visits: state.visits.slice(0, 20),
          page: state.page,
          totalPages: state.totalPages,
          hasMore: state.hasMore,
        };
      },
    }
  ),
  shallow
);

// Expose store for E2E testing
if (typeof window !== 'undefined') {
  (window as any).useVisitStore = useVisitStore;
}
