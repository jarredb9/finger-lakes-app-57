import { act } from '@testing-library/react';
import { createMockTrip, createMockWinery } from '@/lib/test-utils/fixtures';
import { GooglePlaceId, WineryDbId } from '@/lib/types';
import { resetTripInitState } from '../slices/tripInitHelpers';

describe('tripStore Domain Invariants & Concurrency Resilience', () => {
  let useTripStore: any;
  let useSyncStore: any;
  let mockTripService: any;
  let mockSupabase: any;

  beforeEach(() => {
    jest.resetModules();
    resetTripInitState();

    mockTripService = {
      getTrips: jest.fn(),
      getTripById: jest.fn(),
      getUpcomingTrips: jest.fn(),
      getTripsForDate: jest.fn(),
      createTrip: jest.fn(),
      deleteTrip: jest.fn(),
      updateTrip: jest.fn(),
    };

    mockSupabase = {
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: { id: 'user-invariant-123' } },
          error: null,
        }),
        getSession: jest.fn().mockResolvedValue({
          data: { session: { user: { id: 'user-invariant-123' } } },
          error: null,
        }),
      },
      rpc: jest.fn().mockResolvedValue({ data: {}, error: null }),
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockResolvedValue({ data: [], error: null, count: 0 }),
      }),
    };

    jest.doMock('@/lib/services/tripService', () => ({
      TripService: mockTripService,
    }));

    jest.doMock('@/utils/supabase/client', () => ({
      createClient: jest.fn(() => mockSupabase),
    }));

    jest.doMock('@/lib/stores/wineryStore', () => ({
      useWineryStore: {
        getState: jest.fn(() => ({
          ensureWineryDetails: jest.fn().mockImplementation((id: string) =>
            Promise.resolve({ id, name: `Enriched ${id}`, description: 'Detailed' })
          ),
          updateWinery: jest.fn(),
          upsertWinery: jest.fn(),
        })),
      },
    }));

    useSyncStore = require('../syncStore').useSyncStore;
    useTripStore = require('../tripStore').useTripStore;

    useTripStore.getState().reset();
    useSyncStore.setState({ queue: [], isInitialized: true });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Invariant 1: React 19 StrictMode Concurrent Initialization Mutex', () => {
    it('deduplicates concurrent initialize() calls and reconstitutes offline queued mutations with negative numeric IDs', async () => {
      const mockQueue = [
        {
          id: 'mutation-1',
          type: 'create_trip',
          userId: 'user-invariant-123',
          timestamp: Date.now(),
          retries: 0,
        },
        {
          id: 'mutation-2',
          type: 'update_trip',
          userId: 'user-invariant-123',
          timestamp: Date.now(),
          retries: 0,
        },
      ];

      const getDecryptedPayloadSpy = jest.fn().mockImplementation((item: any) => {
        if (item.type === 'create_trip') {
          return Promise.resolve({
            tempId: '-999',
            name: 'Queued Seneca Trip',
            trip_date: '2026-10-15',
            wineries: [{ id: 'w-1', dbId: 10, name: 'Fox Run' }],
          });
        }
        if (item.type === 'update_trip') {
          return Promise.resolve({
            tripId: '101',
            updates: { name: 'Renamed Existing Trip' },
          });
        }
        return Promise.resolve({});
      });

      useSyncStore.setState({
        queue: mockQueue,
        isInitialized: true,
        getDecryptedPayload: getDecryptedPayloadSpy,
      });

      // Existing server trip in state
      const existingTrip = createMockTrip({ id: 101, name: 'Original Name' });
      useTripStore.setState({ trips: [existingTrip] });

      // Simulate React 19 StrictMode concurrent double-mount
      await act(async () => {
        await Promise.all([
          useTripStore.getState().initialize(),
          useTripStore.getState().initialize(),
        ]);
      });

      // Assert Mutex: getDecryptedPayload should only have been called once per queued item (2 total, not 4)
      expect(getDecryptedPayloadSpy).toHaveBeenCalledTimes(2);

      const state = useTripStore.getState();

      // Assert zero duplicate trips: 1 queued + 1 existing = 2
      expect(state.trips).toHaveLength(2);

      // Assert Negative Integer Temporary ID invariant (ST-04)
      const queuedTrip = state.trips.find((t: any) => t.name === 'Queued Seneca Trip');
      expect(queuedTrip).toBeDefined();
      expect(typeof queuedTrip.id).toBe('number');
      expect(queuedTrip.id).toBe(-999);
      expect(queuedTrip.syncStatus).toBe('pending');

      // Assert pending update applied to existing trip
      const updatedExisting = state.trips.find((t: any) => t.id === 101);
      expect(updatedExisting.name).toBe('Renamed Existing Trip');
      expect(updatedExisting.syncStatus).toBe('pending');
    });
  });

  describe('Invariant 2: Per-Entity Staleness & 1000ms Clock-Skew Buffer', () => {
    it('discards stale server response when payloadTime is older than local action minus 1000ms', async () => {
      const tripId = '200';
      const initialTrip = createMockTrip({
        id: 200,
        name: 'Local Optimistic Trip Name',
        updated_at: new Date(5000).toISOString(),
      });

      useTripStore.setState({
        trips: [initialTrip],
        selectedTrip: initialTrip,
        lastActionTimestamps: { [tripId]: 5000 },
      });

      // Server payload timestamp is 3500ms (older than 5000 - 1000 = 4000ms threshold)
      const staleServerTrip = createMockTrip({
        id: 200,
        name: 'Stale Remote Database Name',
        updated_at: new Date(3500).toISOString(),
      });
      mockTripService.getTripById.mockResolvedValue(staleServerTrip);

      await act(async () => {
        await useTripStore.getState().fetchTripById(tripId);
      });

      const state = useTripStore.getState();
      // Local optimistic name MUST NOT be overwritten by stale server payload
      const tripInStore = state.trips.find((t: any) => Number(t.id) === 200);
      expect(tripInStore.name).toBe('Local Optimistic Trip Name');
      expect(state.selectedTrip.name).toBe('Local Optimistic Trip Name');
    });

    it('accepts fresh server response when payloadTime satisfies clock-skew threshold and enriches wineries', async () => {
      const tripId = '200';
      const initialTrip = createMockTrip({
        id: 200,
        name: 'Local Name',
        updated_at: new Date(5000).toISOString(),
      });

      useTripStore.setState({
        trips: [initialTrip],
        selectedTrip: initialTrip,
        lastActionTimestamps: { [tripId]: 5000 },
      });

      // Server timestamp is 4500ms (>= 5000 - 1000 = 4000ms threshold)
      const freshServerTrip = createMockTrip({
        id: 200,
        name: 'Fresh Authoritative Name',
        updated_at: new Date(4500).toISOString(),
        wineries: [
          createMockWinery({
            id: 'winery-fresh-1' as GooglePlaceId,
            dbId: 12 as WineryDbId,
            name: 'Dr. Frank',
          }),
        ],
      });
      mockTripService.getTripById.mockResolvedValue(freshServerTrip);

      await act(async () => {
        await useTripStore.getState().fetchTripById(tripId);
      });

      const state = useTripStore.getState();
      const tripInStore = state.trips.find((t: any) => Number(t.id) === 200);
      expect(tripInStore.name).toBe('Fresh Authoritative Name');
      expect(tripInStore.syncStatus).toBe('synced');
      // Enriched by useWineryStore
      expect(tripInStore.wineries[0].description).toBe('Detailed');
    });
  });

  describe('Invariant 3: Multi-Entity Synchronized Mutations (trips, selectedTrip, tripsForDate)', () => {
    it('synchronizes removeWineryFromTrip across trips, selectedTrip, and tripsForDate simultaneously', async () => {
      const winery1 = createMockWinery({ id: 'w-1' as GooglePlaceId, dbId: 10 as WineryDbId, name: 'Winery 10' });
      const winery2 = createMockWinery({ id: 'w-2' as GooglePlaceId, dbId: 20 as WineryDbId, name: 'Winery 20' });

      const trip = createMockTrip({
        id: 300,
        wineries: [winery1, winery2],
      });

      useTripStore.setState({
        trips: [trip],
        selectedTrip: trip,
        tripsForDate: [trip],
      });

      mockSupabase.rpc.mockResolvedValue({ data: {}, error: null });

      await act(async () => {
        await useTripStore.getState().removeWineryFromTrip('300', 10);
      });

      const state = useTripStore.getState();

      // All 3 collections must reflect the removal
      expect(state.trips[0].wineries).toHaveLength(1);
      expect(state.trips[0].wineries[0].dbId).toBe(20);

      expect(state.selectedTrip.wineries).toHaveLength(1);
      expect(state.selectedTrip.wineries[0].dbId).toBe(20);

      expect(state.tripsForDate[0].wineries).toHaveLength(1);
      expect(state.tripsForDate[0].wineries[0].dbId).toBe(20);

      expect(state.trips[0].syncStatus).toBe('synced');
    });

    it('synchronizes toggleWineryOnTrip across trips, selectedTrip, and tripsForDate', async () => {
      const winery1 = createMockWinery({ id: 'w-1' as GooglePlaceId, dbId: 10 as WineryDbId, name: 'Winery 10' });
      const winery2 = createMockWinery({ id: 'w-2' as GooglePlaceId, dbId: 20 as WineryDbId, name: 'Winery 20' });

      const trip = createMockTrip({
        id: 400,
        wineries: [winery1],
      });

      useTripStore.setState({
        trips: [trip],
        selectedTrip: trip,
        tripsForDate: [trip],
      });

      mockSupabase.rpc.mockResolvedValue({ data: 20, error: null });

      // Toggle winery2 onto trip
      await act(async () => {
        await useTripStore.getState().toggleWineryOnTrip(winery2, trip);
      });

      let state = useTripStore.getState();
      expect(state.trips[0].wineries).toHaveLength(2);
      expect(state.selectedTrip.wineries).toHaveLength(2);
      expect(state.tripsForDate[0].wineries).toHaveLength(2);

      // Toggle winery1 off trip
      await act(async () => {
        await useTripStore.getState().toggleWineryOnTrip(winery1, state.trips[0]);
      });

      state = useTripStore.getState();
      expect(state.trips[0].wineries).toHaveLength(1);
      expect(state.trips[0].wineries[0].dbId).toBe(20);
      expect(state.selectedTrip.wineries[0].dbId).toBe(20);
      expect(state.tripsForDate[0].wineries[0].dbId).toBe(20);
    });
  });

  describe('Invariant 4: True Optimistic Rollback on Server Failure', () => {
    it('reverts note edits to pre-mutation snapshot when server rejects update with 400 error', async () => {
      const winery = createMockWinery({ id: 'w-1' as GooglePlaceId, dbId: 10 as WineryDbId, notes: 'Original Untouched Note' });
      const trip = createMockTrip({
        id: 500,
        wineries: [winery],
      });

      useTripStore.setState({ trips: [trip] });

      // Simulate 400 Bad Request error (not a network error, so handleSyncError returns false)
      mockTripService.updateTrip.mockRejectedValue(new Error('400: Invalid note content'));

      await act(async () => {
        await expect(
          useTripStore.getState().saveWineryNote('500', 10, 'Malicious Injection Attempt')
        ).rejects.toThrow('400: Invalid note content');
      });

      const state = useTripStore.getState();
      const revertedTrip = state.trips.find((t: any) => t.id === 500);

      // Note MUST be reverted back to original snapshot, not left dirty
      expect(revertedTrip.wineries[0].notes).toBe('Original Untouched Note');
      expect(revertedTrip.syncStatus).toBe('error');
    });

    it('reverts winery removal across all collections when server rejects with non-network error', async () => {
      const winery1 = createMockWinery({ id: 'w-1' as GooglePlaceId, dbId: 10 as WineryDbId, name: 'Winery 10' });
      const winery2 = createMockWinery({ id: 'w-2' as GooglePlaceId, dbId: 20 as WineryDbId, name: 'Winery 20' });

      const trip = createMockTrip({
        id: 600,
        wineries: [winery1, winery2],
      });

      useTripStore.setState({
        trips: [trip],
        selectedTrip: trip,
        tripsForDate: [trip],
      });

      // 403 Forbidden error
      mockSupabase.rpc.mockResolvedValue({
        data: null,
        error: { message: '403: Permission Denied', code: '42501' },
      });

      await act(async () => {
        await useTripStore.getState().removeWineryFromTrip('600', 10);
      });

      const state = useTripStore.getState();

      // All collections must rollback to original wineries with error syncStatus
      expect(state.trips[0].wineries).toHaveLength(2);
      expect(state.trips[0].syncStatus).toBe('error');

      expect(state.selectedTrip.wineries).toHaveLength(2);
      expect(state.tripsForDate[0].wineries).toHaveLength(2);
      expect(state.tripsForDate[0].syncStatus).toBe('error');
    });
  });
});
