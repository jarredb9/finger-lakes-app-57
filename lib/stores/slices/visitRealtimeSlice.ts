import { StateCreator } from 'zustand';
import { RealtimeChannel } from '@supabase/supabase-js';
import { createClient } from '@/utils/supabase/client';
import type { VisitState } from '../visitStore';

export interface VisitRealtimeSlice {
  subscription: RealtimeChannel | null;
  isSyncing: boolean;
  lastActionTimestamp: number | null;
  lastActionTimestamps: Record<string, number>;
  subscribeToVisitUpdates: () => void;
  unsubscribeFromVisitUpdates: () => void;
  setLastActionTimestamp: (visitId: string, timestamp: number | null) => void;
}

export const createVisitRealtimeSlice: StateCreator<
  VisitState,
  [],
  [],
  VisitRealtimeSlice
> = (set, get) => ({
  subscription: null,
  isSyncing: false,
  lastActionTimestamp: null,
  lastActionTimestamps: {},

  setLastActionTimestamp: (visitId: string, timestamp: number | null) =>
    set((state) => {
      const next = { ...state.lastActionTimestamps };
      if (timestamp === null) {
        delete next[visitId];
      } else {
        next[visitId] = timestamp;
        const keys = Object.keys(next);
        if (keys.length > 50) {
          const oldestKey = keys.reduce((a, b) => (next[a] < next[b] ? a : b));
          delete next[oldestKey];
        }
      }
      return { lastActionTimestamps: next };
    }),

  subscribeToVisitUpdates: () => {
    const { subscription: existingSub } = get();
    if (existingSub) return;

    const supabase = createClient();
    const subscription = supabase
      .channel('visit-updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'visits' },
        async (payload) => {
          const { lastActionTimestamp, lastActionTimestamps } = get();
          const newData = payload.new as any;
          const visitId = (newData?.id || (payload.old as any)?.id)?.toString();
          const updatedAt = newData?.updated_at;

          if (visitId && lastActionTimestamps[visitId] && updatedAt) {
            const payloadTime = new Date(updatedAt).getTime();
            if (payloadTime < lastActionTimestamps[visitId] - 1000) {
              console.log(`[Sync] Ignoring stale update for visit ${visitId}`, {
                payloadTime,
                lastActionTimestamp: lastActionTimestamps[visitId],
              });
              return;
            }
          }

          if (lastActionTimestamp && updatedAt && !visitId) {
            const payloadTime = new Date(updatedAt).getTime();
            if (payloadTime < lastActionTimestamp - 1000) {
              console.log('[Sync] Ignoring stale visits update (global)', {
                payloadTime,
                lastActionTimestamp,
              });
              return;
            }
          }

          await get().fetchVisits(get().page, true);
        }
      )
      .subscribe();

    set({ subscription });
  },

  unsubscribeFromVisitUpdates: () => {
    const { subscription } = get();
    if (subscription) {
      subscription.unsubscribe();
      set({ subscription: null });
    }
  },
});
