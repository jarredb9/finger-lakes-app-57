import { act } from '@testing-library/react';
import { createMockTrip } from '@/lib/test-utils/fixtures';
import { Trip } from '@/lib/types';

describe('Phase 6 Task 1: tripMutationHelpers & Optimistic Rollback Tests', () => {
  let useTripStore: any;
  let mockTripService: any;
  let createTripHelper: any;

  beforeEach(() => {
    jest.resetModules();

    mockTripService = {
      createTrip: jest.fn(),
      deleteTrip: jest.fn(),
      updateTrip: jest.fn(),
    };

    jest.doMock('@/lib/services/tripService', () => ({
      TripService: mockTripService,
    }));

    jest.doMock('@/utils/supabase/client', () => ({
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

    jest.doMock('@/lib/stores/sync-utils', () => ({
      enqueueIfOffline: jest.fn().mockResolvedValue(false),
      handleSyncError: jest.fn().mockImplementation((error: any) => {
        if (error?.message?.includes('400') || error?.status === 400) {
          return Promise.resolve(false);
        }
        return Promise.resolve(false);
      }),
      isNetworkError: jest.fn().mockReturnValue(false),
    }));

    useTripStore = require('@/lib/stores/tripStore').useTripStore;
    createTripHelper = require('../tripMutationHelpers').createTripHelper;
    useTripStore.getState().reset();
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
      const tempTripInTrips = state.trips.find((t: any) => Number(t.id) < 0 || t.name === 'Temporary Optimistic Trip');
      const tempTripInUpcoming = state.upcomingTrips.find((t: any) => Number(t.id) < 0 || t.name === 'Temporary Optimistic Trip');
      const tempTripInDate = state.tripsForDate.find((t: any) => Number(t.id) < 0 || t.name === 'Temporary Optimistic Trip');

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
      const state = useTripStore.getState() as any;

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

      const store = useTripStore.getState() as any;
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
});
