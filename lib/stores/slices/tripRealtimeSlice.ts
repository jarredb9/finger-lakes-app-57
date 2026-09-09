import { StateCreator } from 'zustand';
import { RealtimeChannel } from '@supabase/supabase-js';
import { createClient } from '@/utils/supabase/client';
import type { TripState } from '../tripStore';

export interface TripRealtimeSlice {
  subscription: RealtimeChannel | null;
  lastActionTimestamp: number | null;
  lastActionTimestamps: Record<string, number>;
  subscribeToTripUpdates: () => void;
  unsubscribeFromTripUpdates: () => void;
  setLastActionTimestamp: (tripId: string, timestamp: number | null) => void;
}

export const createTripRealtimeSlice: StateCreator<
  TripState,
  [],
  [],
  TripRealtimeSlice
> = (set, get) => ({
  subscription: null,
  lastActionTimestamp: null,
  lastActionTimestamps: {},

  setLastActionTimestamp: (tripId: string, timestamp: number | null) =>
    set((state) => {
      const next = { ...state.lastActionTimestamps };
      if (timestamp === null) {
        delete next[tripId];
      } else {
        next[tripId] = timestamp;
        const keys = Object.keys(next);
        if (keys.length > 50) {
          const oldestKey = keys.reduce((a, b) => (next[a] < next[b] ? a : b));
          delete next[oldestKey];
        }
      }
      return { lastActionTimestamps: next };
    }),

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
          const { lastActionTimestamp, lastActionTimestamps } = get();
          const newData = payload.new as any;
          const changedTripId = (newData?.id || (payload.old as any)?.id)?.toString();
          const updatedAt = newData?.updated_at;

          if (changedTripId && lastActionTimestamps[changedTripId] && updatedAt) {
            const payloadTime = new Date(updatedAt).getTime();
            if (payloadTime < lastActionTimestamps[changedTripId] - 1000) {
              return;
            }
          }

          if (lastActionTimestamp && updatedAt && !changedTripId) {
            const payloadTime = new Date(updatedAt).getTime();
            if (payloadTime < lastActionTimestamp - 1000) {
              return;
            }
          }

          await get().fetchTrips(get().page, 'upcoming', true);
          await get().fetchUpcomingTrips();

          const { selectedTrip } = get();
          if (selectedTrip?.id?.toString() === changedTripId) {
            await get().fetchTripById(changedTripId);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trip_wineries' },
        async (payload) => {
          const { lastActionTimestamp, lastActionTimestamps } = get();
          const newData = payload.new as any;
          const changedTripId = (newData?.trip_id || (payload.old as any)?.trip_id)?.toString();
          const updatedAt = newData?.updated_at;

          if (changedTripId && lastActionTimestamps[changedTripId] && updatedAt) {
            const payloadTime = new Date(updatedAt).getTime();
            if (payloadTime < lastActionTimestamps[changedTripId] - 1000) {
              return;
            }
          }

          if (lastActionTimestamp && updatedAt && !changedTripId) {
            const payloadTime = new Date(updatedAt).getTime();
            if (payloadTime < lastActionTimestamp - 1000) {
              return;
            }
          }

          const { selectedTrip } = get();
          if (selectedTrip?.id?.toString() === changedTripId) {
            await get().fetchTripById(changedTripId);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trip_members' },
        async (payload) => {
          const { lastActionTimestamp, lastActionTimestamps } = get();
          const newData = payload.new as any;
          const changedTripId = (newData?.trip_id || (payload.old as any)?.trip_id)?.toString();
          const updatedAt = newData?.updated_at;

          if (changedTripId && lastActionTimestamps[changedTripId] && updatedAt) {
            const payloadTime = new Date(updatedAt).getTime();
            if (payloadTime < lastActionTimestamps[changedTripId] - 1000) {
              return;
            }
          }

          if (lastActionTimestamp && updatedAt && !changedTripId) {
            const payloadTime = new Date(updatedAt).getTime();
            if (payloadTime < lastActionTimestamp - 1000) {
              return;
            }
          }

          const { selectedTrip } = get();
          if (selectedTrip?.id?.toString() === changedTripId) {
            await get().fetchTripById(changedTripId);
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
});
