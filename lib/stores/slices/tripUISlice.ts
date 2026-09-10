import { StateCreator } from 'zustand';
import { Trip } from '@/lib/types';
import type { TripState } from '../tripStore';

export interface TripUISlice {
  selectedTrip: Trip | null;
  page: number;
  count: number;
  hasMore: boolean;
  setSelectedTrip: (trip: Trip | null) => void;
  setPage: (page: number) => void;
}

export const createTripUISlice: StateCreator<
  TripState,
  [],
  [],
  TripUISlice
> = (set) => ({
  selectedTrip: null,
  page: 1,
  count: 0,
  hasMore: true,
  setSelectedTrip: (selectedTrip) => set({ selectedTrip }),
  setPage: (page) => set({ page }),
});
