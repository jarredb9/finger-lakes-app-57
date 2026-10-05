import { act } from '@testing-library/react';
import { createMockTrip, createMockWinery } from '@/lib/test-utils/fixtures';
import { Trip, GooglePlaceId, WineryDbId } from '@/lib/types';
import { useTripStore } from '@/lib/stores/tripStore';
import { createTripHelper } from '../tripMutationHelpers';
import { enqueueIfOffline, handleSyncError } from '@/lib/stores/sync-utils';

interface MockTripService {
  createTrip: jest.Mock;
  deleteTrip: jest.Mock;
  updateTrip: jest.Mock;
}

declare global {
  var _TRIP_MUTATION_HELPERS_MOCKS: {
    mockTripService: MockTripService;
  } | undefined;
}

let mockTripService: MockTripService = {
  createTrip: jest.fn(),
  deleteTrip: jest.fn(),
  updateTrip: jest.fn(),
};

globalThis._TRIP_MUTATION_HELPERS_MOCKS = {
  mockTripService,
};

jest.mock('@/lib/services/tripService', () => ({
  TripService: {
    createTrip: (...args: unknown[]) => globalThis._TRIP_MUTATION_HELPERS_MOCKS?.mockTripService.createTrip(...args),
    deleteTrip: (...args: unknown[]) => globalThis._TRIP_MUTATION_HELPERS_MOCKS?.mockTripService.deleteTrip(...args),
    updateTrip: (...args: unknown[]) => globalThis._TRIP_MUTATION_HELPERS_MOCKS?.mockTripService.updateTrip(...args),
  },
}));

jest.mock('@/utils/supabase/client', () => ({
  createClient: jest.fn(() => ({
    auth: {
      getSession: jest.fn().mockResolvedValue({
        data: { session: { user: { id: 'test-user-1' } } },
        error: null,
      }),
      getUser: jest.fn().mockResolvedValue({
        data: { user: { id: 'test-user-1' } },
        error: null,
      }),
    },
  })),
}));

jest.mock('@/lib/stores/sync-utils', () => ({
  enqueueIfOffline: jest.fn().mockResolvedValue(false),
  handleSyncError: jest.fn().mockImplementation((error: Error | { message?: string; status?: number }) => {
    if (error?.message?.includes('400') || ('status' in error && error.status === 400)) {
      return Promise.resolve(false);
    }
    return Promise.resolve(false);
  }),
  isNetworkError: jest.fn().mockReturnValue(false),
}));

describe('Phase 6 Task 1: tripMutationHelpers & Optimistic Rollback Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTripService = {
      createTrip: jest.fn(),
      deleteTrip: jest.fn(),
      updateTrip: jest.fn(),
    };
    globalThis._TRIP_MUTATION_HELPERS_MOCKS = {
      mockTripService,
    };

    (enqueueIfOffline as jest.Mock).mockResolvedValue(false);
    (handleSyncError as jest.Mock).mockImplementation((error: Error | { message?: string; status?: number }) => {
      if (error?.message?.includes('400') || ('status' in error && error.status === 400)) {
        return Promise.resolve(false);
      }
      return Promise.resolve(false);
    });

    useTripStore.getState().reset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('createTripHelper optimistic rollback on permanent server error (FM-6.4)', () => {
    it('completely rolls back and removes temporary trip (tempId < 0) from all store collections when server returns permanent 400 error', async () => {
      const existingTrip = createMockTrip({
        id: 100,
        name: 'Existing Established Trip',
        trip_date: '2026-10-01',
      });

      // Set initial store state
      useTripStore.setState({
        trips: [existingTrip],
        upcomingTrips: [existingTrip],
        tripsForDate: [existingTrip],
      });

      // Mock TripService.createTrip to reject with a permanent 400 Bad Request error
      mockTripService.createTrip.mockRejectedValueOnce(
        new Error('400: Bad Request - Malformed trip input')
      );

      const get = useTripStore.getState;
      const set = useTripStore.setState;

      const newTripInput: Partial<Trip> = {
        name: 'Temporary Optimistic Trip',
        trip_date: '2026-10-01',
        user_id: 'test-user-1',
        wineries: [],
      };

      // Expect createTripHelper to throw the error
      await act(async () => {
        await expect(createTripHelper(get, set, newTripInput)).rejects.toThrow(
          '400: Bad Request - Malformed trip input'
        );
      });

      const state = useTripStore.getState();

      // TRUE OPTIMISTIC ROLLBACK REQUIREMENT:
      // The temporary trip with negative numeric ID must NOT remain in trips, upcomingTrips, or tripsForDate!
      // In the pre-refactor implementation, it is retained with syncStatus: 'error'.
      const tempTripInTrips = state.trips.find((t: Trip) => Number(t.id) < 0 || t.name === 'Temporary Optimistic Trip');
      const tempTripInUpcoming = state.upcomingTrips.find((t: Trip) => Number(t.id) < 0 || t.name === 'Temporary Optimistic Trip');
      const tempTripInDate = state.tripsForDate.find((t: Trip) => Number(t.id) < 0 || t.name === 'Temporary Optimistic Trip');

      expect(tempTripInTrips).toBeUndefined();
      expect(tempTripInUpcoming).toBeUndefined();
      expect(tempTripInDate).toBeUndefined();

      // Existing trip must remain intact
      expect(state.trips).toHaveLength(1);
      expect(state.trips[0].id).toBe(100);
    });
  });

  describe('atomic replaceTripTempId sync reconciliation helper (FM-6.4)', () => {
    it('exposes atomic replaceTripTempId on tripStore to swap tempId with server trip across all collections', () => {
      const state = useTripStore.getState();

      // REQUIREMENT: tripDataSlice / tripStore must expose atomic replaceTripTempId(tempId, syncedTrip)
      // to eliminate ghost trip duplication when SyncService replays offline mutations.
      expect(typeof state.replaceTripTempId).toBe('function');
    });

    it('replaces temporary negative ID trip with synced positive ID trip without duplicating entries', () => {
      const tempId = -Date.now();
      const tempTrip: Trip = {
        id: tempId,
        user_id: 'test-user-1',
        trip_date: '2026-10-01',
        name: 'Offline Created Trip',
        wineries: [],
        members: [],
        syncStatus: 'pending',
      };

      useTripStore.setState({
        trips: [tempTrip],
        upcomingTrips: [tempTrip],
        tripsForDate: [tempTrip],
      });

      const syncedServerTrip: Trip = {
        id: 42,
        user_id: 'test-user-1',
        trip_date: '2026-10-01',
        name: 'Offline Created Trip (Synced)',
        wineries: [],
        members: [],
        syncStatus: 'synced',
      };

      const store = useTripStore.getState();
      if (typeof store.replaceTripTempId === 'function') {
        act(() => {
          store.replaceTripTempId(tempId, syncedServerTrip);
        });

        const updatedState = useTripStore.getState();

        // Must contain 1 trip with ID 42, zero negative IDs
        expect(updatedState.trips).toHaveLength(1);
        expect(updatedState.trips[0].id).toBe(42);
        expect(updatedState.trips[0].syncStatus).toBe('synced');

        expect(updatedState.upcomingTrips).toHaveLength(1);
        expect(updatedState.upcomingTrips[0].id).toBe(42);

        expect(updatedState.tripsForDate).toHaveLength(1);
        expect(updatedState.tripsForDate[0].id).toBe(42);
      } else {
        // Force fail if replaceTripTempId is not yet implemented
        expect(store.replaceTripTempId).toBeDefined();
      }
    });
  });

  describe('createTripHelper store invariants - wineries_count population', () => {
    const mockWinery1 = createMockWinery({
      id: 'place_1' as GooglePlaceId,
      dbId: 101 as WineryDbId,
      name: 'Dr. Konstantin Frank',
    });
    const mockWinery2 = createMockWinery({
      id: 'place_2' as GooglePlaceId,
      dbId: 102 as WineryDbId,
      name: 'Ravines Wine Cellars',
    });

    it('populates wineries_count on optimistic temporary trip during creation', async () => {
      const get = useTripStore.getState;
      const set = useTripStore.setState;

      const newTripInput: Partial<Trip> = {
        name: 'Keuka Wine Trail',
        trip_date: '2026-10-20',
        wineries: [mockWinery1, mockWinery2],
      };

      let capturedOptimisticTrip: Trip | undefined;
      mockTripService.createTrip.mockImplementationOnce(async () => {
        capturedOptimisticTrip = useTripStore.getState().trips.find(t => Number(t.id) < 0);
        return {
          id: 501,
          name: 'Keuka Wine Trail',
          trip_date: '2026-10-20',
          user_id: 'test-user-1',
          wineries: [mockWinery1, mockWinery2],
          wineries_count: 2,
          members: [],
          syncStatus: 'synced',
        };
      });

      await act(async () => {
        await createTripHelper(get, set, newTripInput);
      });

      expect(capturedOptimisticTrip).toBeDefined();
      expect(capturedOptimisticTrip?.wineries_count).toBe(2);
      expect(capturedOptimisticTrip?.wineries).toHaveLength(2);
    });

    it('populates wineries_count on returned tempTrip when offline enqueuing succeeds', async () => {
      const get = useTripStore.getState;
      const set = useTripStore.setState;

      (enqueueIfOffline as jest.Mock).mockResolvedValueOnce(true);

      const newTripInput: Partial<Trip> = {
        name: 'Offline Tour',
        trip_date: '2026-10-20',
        wineries: [mockWinery1, mockWinery2],
      };

      let returnedTrip: Trip | null = null;
      await act(async () => {
        returnedTrip = await createTripHelper(get, set, newTripInput);
      });

      expect(returnedTrip).toBeDefined();
      expect((returnedTrip as unknown as Trip)?.wineries_count).toBe(2);
      const storeTrip = useTripStore.getState().trips.find(t => Number(t.id) < 0);
      expect(storeTrip?.wineries_count).toBe(2);
    });

    it('populates wineries_count on synced trip in store after successful creation, falling back to wineries length', async () => {
      const get = useTripStore.getState;
      const set = useTripStore.setState;

      const newTripInput: Partial<Trip> = {
        name: 'Seneca Tour',
        trip_date: '2026-10-21',
        wineries: [mockWinery1, mockWinery2],
      };

      // Server response omitting wineries_count property
      const serverTripWithoutCount: Partial<Trip> = {
        id: 502,
        name: 'Seneca Tour',
        trip_date: '2026-10-21',
        user_id: 'test-user-1',
        wineries: [mockWinery1, mockWinery2],
        members: [],
      };
      mockTripService.createTrip.mockResolvedValueOnce(serverTripWithoutCount);

      await act(async () => {
        await createTripHelper(get, set, newTripInput);
      });

      const syncedTrip = useTripStore.getState().trips.find(t => t.id === 502);
      expect(syncedTrip).toBeDefined();
      expect(syncedTrip?.wineries_count).toBe(2);
      expect(syncedTrip?.syncStatus).toBe('synced');
    });

    it('preserves server wineries_count on synced trip if returned by TripService.createTrip', async () => {
      const get = useTripStore.getState;
      const set = useTripStore.setState;

      const newTripInput: Partial<Trip> = {
        name: 'Single Winery Trip',
        trip_date: '2026-10-21',
        wineries: [mockWinery1],
      };

      const serverTripWithCount: Partial<Trip> = {
        id: 503,
        name: 'Single Winery Trip',
        trip_date: '2026-10-21',
        user_id: 'test-user-1',
        wineries: [mockWinery1],
        wineries_count: 1,
        members: [],
      };
      mockTripService.createTrip.mockResolvedValueOnce(serverTripWithCount);

      await act(async () => {
        await createTripHelper(get, set, newTripInput);
      });

      const syncedTrip = useTripStore.getState().trips.find(t => t.id === 503);
      expect(syncedTrip).toBeDefined();
      expect(syncedTrip?.wineries_count).toBe(1);
    });
  });

  describe('createTripHelper background cache invalidation', () => {
    it('dispatches background cache re-fetches for upcomingTrips, tripsForDate, and trips after creation', async () => {
      const get = useTripStore.getState;
      const set = useTripStore.setState;

      const targetDate = '2026-10-25';
      const newTripInput: Partial<Trip> = {
        name: 'Cayuga Trail',
        trip_date: targetDate,
        wineries: [],
      };

      mockTripService.createTrip.mockResolvedValueOnce({
        id: 601,
        name: 'Cayuga Trail',
        trip_date: targetDate,
        user_id: 'test-user-1',
        wineries: [],
        wineries_count: 0,
        members: [],
      });

      const fetchUpcomingTripsSpy = jest.spyOn(useTripStore.getState(), 'fetchUpcomingTrips').mockResolvedValue(undefined);
      const fetchTripsForDateSpy = jest.spyOn(useTripStore.getState(), 'fetchTripsForDate').mockResolvedValue(undefined);
      const fetchTripsSpy = jest.spyOn(useTripStore.getState(), 'fetchTrips').mockResolvedValue(undefined);

      await act(async () => {
        await createTripHelper(get, set, newTripInput);
      });

      expect(fetchUpcomingTripsSpy).toHaveBeenCalledTimes(1);
      expect(fetchTripsForDateSpy).toHaveBeenCalledWith(targetDate);
      expect(fetchTripsSpy).toHaveBeenCalledWith(1, 'upcoming', true);
    });

    it('does not throw or fail trip creation if background cache re-fetches reject', async () => {
      const get = useTripStore.getState;
      const set = useTripStore.setState;

      const targetDate = '2026-10-25';
      const newTripInput: Partial<Trip> = {
        name: 'Resilient Trail',
        trip_date: targetDate,
        wineries: [],
      };

      mockTripService.createTrip.mockResolvedValueOnce({
        id: 602,
        name: 'Resilient Trail',
        trip_date: targetDate,
        user_id: 'test-user-1',
        wineries: [],
        wineries_count: 0,
        members: [],
      });

      jest.spyOn(useTripStore.getState(), 'fetchUpcomingTrips').mockRejectedValue(new Error('Network error on refresh'));
      jest.spyOn(useTripStore.getState(), 'fetchTripsForDate').mockRejectedValue(new Error('Network error on date refresh'));
      jest.spyOn(useTripStore.getState(), 'fetchTrips').mockRejectedValue(new Error('Network error on trips refresh'));

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      let result: Trip | null = null;
      await act(async () => {
        result = await createTripHelper(get, set, newTripInput);
      });

      expect(result).toBeDefined();
      expect((result as unknown as Trip)?.id).toBe(602);
      consoleErrorSpy.mockRestore();
    });
  });

  describe('createTripHelper error rollback & offline enqueue suppression', () => {
    it('bypasses handleSyncError and performs immediate optimistic rollback when error has preventOfflineEnqueue: true', async () => {
      const get = useTripStore.getState;
      const set = useTripStore.setState;

      const existingTrip = createMockTrip({
        id: 100,
        name: 'Existing Established Trip',
        trip_date: '2026-10-01',
      });

      useTripStore.setState({
        trips: [existingTrip],
        upcomingTrips: [existingTrip],
        tripsForDate: [existingTrip],
      });

      const chainedError = new Error('Chained stop addition failed: 404 Winery Not Found');
      (chainedError as any).preventOfflineEnqueue = true;

      mockTripService.createTrip.mockRejectedValueOnce(chainedError);
      // If handleSyncError were erroneously invoked, configure it to return true
      (handleSyncError as jest.Mock).mockResolvedValueOnce(true);

      const newTripInput: Partial<Trip> = {
        name: 'Multi-Stop Rollback Trip',
        trip_date: '2026-10-01',
        user_id: 'test-user-1',
        wineries: [
          createMockWinery({ id: 'place_1' as GooglePlaceId, dbId: 101 as WineryDbId }),
          createMockWinery({ id: 'place_2' as GooglePlaceId, dbId: 102 as WineryDbId }),
        ],
      };

      await act(async () => {
        await expect(createTripHelper(get, set, newTripInput)).rejects.toThrow(
          'Chained stop addition failed: 404 Winery Not Found'
        );
      });

      // CRITICAL: handleSyncError must NOT be called when preventOfflineEnqueue is true
      expect(handleSyncError).not.toHaveBeenCalled();

      // Optimistic rollback: temporary trip must be purged from all collections
      const state = useTripStore.getState();
      expect(state.trips.find(t => Number(t.id) < 0 || t.name === 'Multi-Stop Rollback Trip')).toBeUndefined();
      expect(state.upcomingTrips.find(t => Number(t.id) < 0 || t.name === 'Multi-Stop Rollback Trip')).toBeUndefined();
      expect(state.tripsForDate.find(t => Number(t.id) < 0 || t.name === 'Multi-Stop Rollback Trip')).toBeUndefined();

      // Existing trip must be preserved
      expect(state.trips).toHaveLength(1);
      expect(state.trips[0].id).toBe(100);
    });

    it('delegates to handleSyncError when error does NOT have preventOfflineEnqueue', async () => {
      const get = useTripStore.getState;
      const set = useTripStore.setState;

      const networkError = new Error('Failed to fetch: Network offline');
      mockTripService.createTrip.mockRejectedValueOnce(networkError);
      (handleSyncError as jest.Mock).mockResolvedValueOnce(true);

      const newTripInput: Partial<Trip> = {
        name: 'Offline Queued Trip',
        trip_date: '2026-10-01',
        user_id: 'test-user-1',
        wineries: [],
      };

      let returnedTrip: Trip | null = null;
      await act(async () => {
        returnedTrip = await createTripHelper(get, set, newTripInput);
      });

      expect(handleSyncError).toHaveBeenCalledWith(
        networkError,
        'create_trip',
        'test-user-1',
        expect.objectContaining({ name: 'Offline Queued Trip' }),
        expect.any(String)
      );
      expect(returnedTrip).toBeDefined();
      expect((returnedTrip as unknown as Trip)?.name).toBe('Offline Queued Trip');
    });
  });
});
