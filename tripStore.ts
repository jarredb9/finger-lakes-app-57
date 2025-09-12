import { create } from 'zustand';
import { Trip } from '@/lib/types';
import { createClient } from '@/utils/supabase/client';

interface TripState {
  trips: Trip[];
  isLoading: boolean;
  fetchTripsForDate: (date: Date) => Promise<void>;
  createTrip: (date: Date) => Promise<Trip | null>;
  deleteTrip: (tripId: string) => Promise<void>;
  updateTrip: (tripId: string, updates: Partial<Trip>) => Promise<void>;
  updateWineryOrder: (tripId: string, wineryIds: number[]) => Promise<void>;
  removeWineryFromTrip: (tripId: string, wineryId: number) => Promise<void>;
  saveWineryNote: (tripId: string, wineryId: number, notes: string) => Promise<void>;
  addMembersToTrip: (tripId: string, memberIds: string[]) => Promise<void>;
}

const supabase = createClient();

export const useTripStore = create<TripState>((set, get) => ({
  trips: [],
  isLoading: false,

  fetchTripsForDate: async (date: Date) => {
    set({ isLoading: true });
    const dateString = date.toISOString().split("T")[0];
    try {
      const response = await fetch(`/api/trips?date=${dateString}`);
      if (response.ok) {
        const data = await response.json();
        set({ trips: Array.isArray(data) ? data : [], isLoading: false });
      } else {
        set({ trips: [], isLoading: false });
      }
    } catch (error) {
      console.error("Failed to fetch trips", error);
      set({ trips: [], isLoading: false });
    }
  },

  createTrip: async (date: Date) => {
    const response = await fetch('/api/trips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: date.toISOString().split('T')[0], name: "New Trip" })
    });
    if (response.ok) {
      const newTrip = await response.json();
      set(state => ({ trips: [...state.trips, newTrip] }));
      return newTrip;
    }
    return null;
  },

  deleteTrip: async (tripId: string) => {
    const response = await fetch(`/api/trips/${tripId}`, { method: 'DELETE' });
    if (response.ok) {
      set(state => ({ trips: state.trips.filter(t => t.id !== tripId) }));
    } else {
      throw new Error("Failed to delete trip");
    }
  },

  updateTrip: async (tripId: string, updates: Partial<Trip>) => {
    const response = await fetch(`/api/trips/${tripId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!response.ok) {
      throw new Error("Failed to update trip");
    }
  },

  updateWineryOrder: async (tripId: string, wineryIds: number[]) => {
    get().updateTrip(tripId, { wineryOrder: wineryIds });
  },

  removeWineryFromTrip: async (tripId: string, wineryId: number) => {
    get().updateTrip(tripId, { removeWineryId: wineryId });
  },

  saveWineryNote: async (tripId: string, wineryId: number, notes: string) => {
    get().updateTrip(tripId, { updateNote: { wineryId, notes } });
  },
  
  addMembersToTrip: async (tripId: string, memberIds: string[]) => {
    get().updateTrip(tripId, { members: memberIds });
  },
}));

