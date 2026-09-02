import { act } from '@testing-library/react';
import { createMockTrip } from '@/lib/test-utils/fixtures';

describe('tripStore', () => {
  let useTripStore: any;
  let mockTripService: any;
  const mockTrip = createMockTrip();
  const mockTrips = [mockTrip];
  const mockCount = 1;

  beforeEach(() => {
    jest.resetModules();

    mockTripService = {
      getTrips: jest.fn(),
      getTripById: jest.fn(),
      getUpcomingTrips: jest.fn(),
      getTripsForDate: jest.fn(),
      createTrip: jest.fn(),
      deleteTrip: jest.fn(),
      updateTrip: jest.fn(),
    };

    jest.doMock('@/lib/services/tripService', () => ({
      TripService: mockTripService
    }));

    jest.doMock('@/lib/stores/wineryStore', () => ({
      useWineryStore: {
        getState: jest.fn(() => ({
          ensureWineryDetails: jest.fn().mockResolvedValue({}),
          updateWinery: jest.fn(),
        })),
      },
    }));

    jest.doMock('@/utils/supabase/client', () => ({
      createClient: jest.fn(() => ({
        rpc: jest.fn(),
        from: jest.fn(() => ({
          select: jest.fn(),
          insert: jest.fn(),
          update: jest.fn(),
          delete: jest.fn(),
        })),
        auth: {
          getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'test-user' } }, error: null }),
          getSession: jest.fn().mockResolvedValue({ data: { session: { user: { id: 'test-user' } } }, error: null }),
        }
      })),
    }));

    // Re-require to ensure mocks are applied
    useTripStore = require('../tripStore').useTripStore;
    useTripStore.getState().reset();
  });

  describe('fetchTrips', () => {
    it('should fetch trips successfully and update state', async () => {
      mockTripService.getTrips.mockResolvedValue({ trips: mockTrips, count: mockCount });

      await act(async () => {
        await useTripStore.getState().fetchTrips(1, 'upcoming');
      });

      const state = useTripStore.getState();
      expect(state.trips).toEqual(mockTrips);
      expect(state.count).toBe(mockCount);
      expect(state.isLoading).toBe(false);
    });

    it('should handle errors gracefully', async () => {
      mockTripService.getTrips.mockRejectedValue(new Error('Network error'));

      await act(async () => {
        await useTripStore.getState().fetchTrips(1, 'upcoming');
      });

      const state = useTripStore.getState();
      expect(state.isLoading).toBe(false);
      expect(state.trips).toEqual([]);
    });
  });

  describe('createTrip', () => {
    it('should optimistically add a trip and update with server response', async () => {
      const newTripParams = { name: 'New Trip', trip_date: '2023-01-01' };
      const createdTrip = createMockTrip({ ...newTripParams, id: 123 });
      mockTripService.createTrip.mockResolvedValue(createdTrip);

      await act(async () => {
        await useTripStore.getState().createTrip(newTripParams);
      });

      const state = useTripStore.getState();
      expect(state.trips).toContainEqual(createdTrip);
    });
  });

  describe('deleteTrip', () => {
    it('should optimistically remove a trip', async () => {
      const initialTrip = createMockTrip({ id: 123, name: 'To Delete' });
      
      await act(async () => {
          useTripStore.setState({ trips: [initialTrip], tripsForDate: [initialTrip] });
      });

      mockTripService.deleteTrip.mockResolvedValue(undefined);

      await act(async () => {
        await useTripStore.getState().deleteTrip('123');
      });

      const state = useTripStore.getState();
      expect(state.trips).toHaveLength(0);
      expect(state.tripsForDate).toHaveLength(0);
    });
  });

  describe('addWineryToTrips network failure (ST-07)', () => {
    it('does not enqueue empty {} or log_visit mutation on multi-trip network failure', async () => {
      jest.resetModules();
      const mockAddMutation = jest.fn().mockResolvedValue(undefined);
      jest.doMock('@/lib/stores/syncStore', () => ({
        useSyncStore: {
          getState: jest.fn(() => ({
            addMutation: mockAddMutation,
            queue: [],
            initialize: jest.fn(),
          })),
        },
      }));

      const mockRpc = jest.fn().mockRejectedValue(new Error('Failed to fetch'));
      jest.doMock('@/utils/supabase/client', () => ({
        createClient: jest.fn(() => ({
          rpc: mockRpc,
          auth: {
            getSession: jest.fn().mockResolvedValue({
              data: { session: { user: { id: 'user-test-123' } } },
              error: null,
            }),
          },
        })),
      }));

      const freshTripStore = require('../tripStore').useTripStore;
      const mockWinery = { id: 'winery-1', dbId: 10, name: 'Seneca Estate' };

      await act(async () => {
        await freshTripStore.getState().addWineryToTrips(mockWinery as any, new Date('2026-09-02T12:00:00Z'), new Set(['456']), 'New Trip', 'Note');
      });

      // Valid update_trip mutation SHOULD be enqueued
      expect(mockAddMutation).toHaveBeenCalledWith(expect.objectContaining({
        type: 'update_trip',
        userId: 'user-test-123',
      }));

      // Corrupting empty {} and log_visit mutations MUST NOT be enqueued
      expect(mockAddMutation).not.toHaveBeenCalledWith(expect.objectContaining({
        type: 'log_visit',
      }));
      expect(mockAddMutation).not.toHaveBeenCalledWith(expect.objectContaining({
        payload: {},
      }));
    });
  });
});
