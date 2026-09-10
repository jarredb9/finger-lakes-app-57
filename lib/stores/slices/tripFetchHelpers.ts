import { Trip, Winery } from '@/lib/types';
import { TripService } from '@/lib/services/tripService';
import { useWineryStore } from '../wineryStore';
import type { StoreApi } from 'zustand';
import type { TripState } from '../tripStore';

type GetTripState = StoreApi<TripState>['getState'];
type SetTripState = StoreApi<TripState>['setState'];

export async function fetchTripsHelper(
  get: GetTripState,
  set: SetTripState,
  page: number,
  type: 'upcoming' | 'past',
  refresh = false
): Promise<void> {
  set({ isLoading: true, error: null });
  try {
    const { trips: rawTrips, count } = await TripService.getTrips(page, type);
    const newTrips = rawTrips.map(t => ({ ...t, syncStatus: 'synced' as const }));
    const { lastActionTimestamp, lastActionTimestamps } = get();

    if (process.env.NEXT_PUBLIC_IS_E2E === 'true') {
      console.log('[DIAGNOSTIC] fetchTrips incoming:', { 
        type, 
        lastActionTimestamp, 
        lastActionTimestamps,
        incomingCount: newTrips.length,
        incomingNames: newTrips.map(t => t.name)
      });
    }

    set(state => {
      const filteredNewTrips = newTrips.filter((newTrip: Trip) => {
        const tripId = newTrip.id.toString();
        if (lastActionTimestamps[tripId] && newTrip.updated_at) {
          const payloadTime = new Date(newTrip.updated_at).getTime();
          const isOk = payloadTime >= lastActionTimestamps[tripId] - 1000;
          if (!isOk && process.env.NEXT_PUBLIC_IS_E2E === 'true') {
            console.log(`[Sync] fetchTrips FILTERED OUT stale trip (per-entity): ${newTrip.name}`, { payloadTime, lastActionTimestamp: lastActionTimestamps[tripId] });
          }
          return isOk;
        }

        if (!tripId && lastActionTimestamp && newTrip.updated_at) {
          const payloadTime = new Date(newTrip.updated_at).getTime();
          return payloadTime >= lastActionTimestamp - 1000;
        }

        return true;
      });

      let updatedTrips: Trip[];
      if (refresh) {
        const staleIds = new Set(newTrips.filter((t: Trip) => !filteredNewTrips.includes(t)).map((t: Trip) => t.id));
        updatedTrips = state.trips.map((oldTrip: Trip) => {
          if (staleIds.has(oldTrip.id)) return oldTrip;
          const matchingNew = newTrips.find((t: Trip) => t.id === oldTrip.id);
          return matchingNew || oldTrip;
        });
        
        const existingIds = new Set(updatedTrips.map((t: Trip) => t.id));
        const trulyNew = filteredNewTrips.filter((t: Trip) => !existingIds.has(t.id));
        updatedTrips = [...trulyNew, ...updatedTrips];
      } else {
        updatedTrips = [...state.trips, ...filteredNewTrips];
      }

      return {
        trips: updatedTrips,
        count,
        page,
        hasMore: updatedTrips.length < count,
        isLoading: false,
      };
    });
  } catch (error: any) {
    console.error("Failed to fetch trips", error);
    if (get().trips.length > 0) {
      set({ isLoading: false });
    } else {
      set({ isLoading: false, error: error.message || "Failed to load trips." });
    }
  }
}

export async function fetchTripByIdHelper(
  get: GetTripState,
  set: SetTripState,
  tripId: string
): Promise<void> {
  set({ isLoading: true, error: null });
  try {
    const rawTrip = await TripService.getTripById(tripId);
    const trip = { ...rawTrip, syncStatus: 'synced' as const };
    const { lastActionTimestamp, lastActionTimestamps } = get();

    if (lastActionTimestamps[tripId] && trip.updated_at) {
      const payloadTime = new Date(trip.updated_at).getTime();
      if (payloadTime < lastActionTimestamps[tripId] - 1000) {
        set({ isLoading: false });
        return;
      }
    }

    if (!tripId && lastActionTimestamp && trip.updated_at) {
      const payloadTime = new Date(trip.updated_at).getTime();
      if (payloadTime < lastActionTimestamp - 1000) {
        set({ isLoading: false });
        return;
      }
    }
    
    set(state => {
      const numericId = Number(trip.id);
      const filteredTrips = state.trips.filter(t => Number(t.id) !== numericId);
      return {
        trips: [...filteredTrips, trip],
        selectedTrip: state.selectedTrip && Number(state.selectedTrip.id) === numericId ? trip : state.selectedTrip,
        isLoading: false,
        error: null
      };
    });

    const { ensureWineryDetails } = useWineryStore.getState();
    const wineryDetailPromises = trip.wineries.map((winery: Winery) => ensureWineryDetails(winery.id));
    
    const detailedWineries = (await Promise.all(wineryDetailPromises)).filter(Boolean) as Winery[];
    const detailedWineriesMap = new Map(detailedWineries.map((w: Winery) => [w.id, w]));

    set(state => {
      const numericId = Number(trip.id);
      const newTrips = state.trips.map((t: Trip) => {
        if (Number(t.id) !== numericId) return t;

        const updatedWineries = t.wineries.map(wineryInTrip => {
          const detailedWinery = detailedWineriesMap.get(wineryInTrip.id);
          return detailedWinery ? { ...detailedWinery, ...wineryInTrip } : wineryInTrip;
        });
        
        return { ...t, wineries: updatedWineries };
      });
      return { trips: newTrips };
    });
  } catch (error: any) {
    console.error("Failed to fetch trip details", error);
    set({ isLoading: false, error: error.message || "Failed to load trip details." });
  }
}

export async function fetchUpcomingTripsHelper(
  get: GetTripState,
  set: SetTripState
): Promise<void> {
  set({ isLoading: true });
  try {
    const rawTrips = await TripService.getUpcomingTrips();
    const trips = rawTrips.map(t => ({ ...t, syncStatus: 'synced' as const }));
    const { lastActionTimestamps } = get();

    set(state => {
      const filteredTrips = trips.filter((t: Trip) => {
        const tripId = t.id.toString();
        if (lastActionTimestamps[tripId] && t.updated_at) {
          const payloadTime = new Date(t.updated_at).getTime();
          return payloadTime >= lastActionTimestamps[tripId] - 1000;
        }
        return true;
      });

      const staleIds = new Set(trips.filter((t: Trip) => !filteredTrips.includes(t)).map((t: Trip) => t.id));
      const updatedUpcoming = trips.map((newTrip: Trip) => {
        if (staleIds.has(newTrip.id)) {
          return state.upcomingTrips.find((t: Trip) => t.id === newTrip.id) || newTrip;
        }
        return newTrip;
      });

      return { upcomingTrips: updatedUpcoming, isLoading: false };
    });
  } catch (error) {
    console.error("Failed to fetch upcoming trips", error);
    set({ isLoading: false });
  }
}

export async function fetchTripsForDateHelper(
  get: GetTripState,
  set: SetTripState,
  dateString: string
): Promise<void> {
  set({ isLoading: true });
  try {
    const rawTrips = await TripService.getTripsForDate(dateString);
    const tripsForDate = rawTrips.map((t: Trip) => ({ ...t, syncStatus: 'synced' as const }));
    const { lastActionTimestamps } = get();

    set(state => {
      const filteredTrips = tripsForDate.filter((t: Trip) => {
        const tripId = t.id.toString();
        if (lastActionTimestamps[tripId] && t.updated_at) {
          const payloadTime = new Date(t.updated_at).getTime();
          return payloadTime >= lastActionTimestamps[tripId] - 1000;
        }
        return true;
      });

      const staleIds = new Set(tripsForDate.filter((t: Trip) => !filteredTrips.includes(t)).map((t: Trip) => t.id));
      const updatedTripsForDate = tripsForDate.map((newTrip: Trip) => {
        if (staleIds.has(newTrip.id)) {
          return state.tripsForDate.find((t: Trip) => t.id === newTrip.id) || newTrip;
        }
        return newTrip;
      });

      return {
        tripsForDate: updatedTripsForDate,
        isLoading: false
      };
    });
  } catch (error) {
    set({ isLoading: false });
  }
}
