import { StateCreator } from 'zustand';
import { Trip, TripUpdateInput, Winery } from '@/lib/types';
import type { TripState } from '../tripStore';
import {
  fetchTripsHelper,
  fetchTripByIdHelper,
  fetchUpcomingTripsHelper,
  fetchTripsForDateHelper,
  createTripHelper,
  deleteTripHelper,
  updateTripHelper,
  replaceTripTempIdHelper,
  updateWineryOrderHelper,
  removeWineryFromTripHelper,
  saveWineryNoteHelper,
  saveAllWineryNotesHelper,
  addWineryToTripsHelper,
  toggleWineryOnTripHelper,
  initializeTripStoreHelper,
} from './tripDataHelpers';

export interface TripDataSlice {
  trips: Trip[];
  tripsForDate: Trip[];
  upcomingTrips: Trip[];
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  fetchTrips: (page: number, type: 'upcoming' | 'past', refresh?: boolean) => Promise<void>;
  fetchTripById: (tripId: string) => Promise<void>;
  fetchUpcomingTrips: () => Promise<void>;
  fetchTripsForDate: (date: string) => Promise<void>;
  createTrip: (trip: Partial<Trip>) => Promise<Trip | null>;
  replaceTripTempId: (tempId: number | string, syncedTrip: Trip) => void;
  deleteTrip: (tripId: string) => Promise<void>;
  updateTrip: (tripId: string, updates: TripUpdateInput) => Promise<void>;
  updateWineryOrder: (tripId: string, wineryIds: number[]) => Promise<void>;
  removeWineryFromTrip: (tripId: string, wineryId: number) => Promise<void>;
  saveWineryNote: (tripId: string, wineryId: number, notes: string) => Promise<void>;
  saveAllWineryNotes: (tripId: string, notes: Record<number, string>) => Promise<void>;
  addMembersToTrip: (tripId: string, memberIds: string[]) => Promise<void>;
  addWineryToTrips: (winery: Winery, tripDate: Date, selectedTrips: Set<string>, newTripName: string, addTripNotes: string) => Promise<void>;
  toggleWineryOnTrip: (winery: Winery, trip: Trip) => Promise<void>;
  initialize: () => Promise<void>;
}

export const createTripDataSlice: StateCreator<
  TripState,
  [],
  [],
  TripDataSlice
> = (set, get) => ({
  trips: [],
  tripsForDate: [],
  upcomingTrips: [],
  isLoading: false,
  isSaving: false,
  error: null,

  fetchTrips: (page, type, refresh) => fetchTripsHelper(get, set, page, type, refresh),
  fetchTripById: (tripId) => fetchTripByIdHelper(get, set, tripId),
  fetchUpcomingTrips: () => fetchUpcomingTripsHelper(get, set),
  fetchTripsForDate: (dateString) => fetchTripsForDateHelper(get, set, dateString),
  createTrip: (trip) => createTripHelper(get, set, trip),
  replaceTripTempId: (tempId, syncedTrip) => replaceTripTempIdHelper(set, tempId, syncedTrip),
  deleteTrip: (tripId) => deleteTripHelper(get, set, tripId),
  updateTrip: (tripId, updates) => updateTripHelper(get, set, tripId, updates),
  updateWineryOrder: (tripId, wineryIds) => updateWineryOrderHelper(get, set, tripId, wineryIds),
  removeWineryFromTrip: (tripId, wineryId) => removeWineryFromTripHelper(get, set, tripId, wineryId),
  saveWineryNote: (tripId, wineryId, notes) => saveWineryNoteHelper(get, set, tripId, wineryId, notes),
  saveAllWineryNotes: (tripId, notes) => saveAllWineryNotesHelper(get, set, tripId, notes),
  addMembersToTrip: async (tripId: string, _memberIds: string[]) => {
    try {
      await get().fetchTripById(tripId);
    } catch (error) {
      console.error("Failed to sync members:", error);
    }
  },
  addWineryToTrips: (winery, tripDate, selectedTrips, newTripName, addTripNotes) =>
    addWineryToTripsHelper(get, set, winery, tripDate, selectedTrips, newTripName, addTripNotes),
  toggleWineryOnTrip: (winery, trip) => toggleWineryOnTripHelper(get, set, winery, trip),
  initialize: () => initializeTripStoreHelper(get, set),
});
