import { act } from '@testing-library/react';
import { createMockTrip } from '@/lib/test-utils/fixtures';
import { useTripStore } from '../tripStore';

let mockTripService = {
  getTrips: jest.fn(),
  getTripById: jest.fn(),
  getUpcomingTrips: jest.fn(),
  getTripsForDate: jest.fn(),
  createTrip: jest.fn(),
  deleteTrip: jest.fn(),
  updateTrip: jest.fn(),
};

let mockAddMutation = jest.fn().mockResolvedValue(undefined);
let mockRpc = jest.fn();
let mockGetSession = jest.fn().mockResolvedValue({ data: { session: { user: { id: 'test-user' } } }, error: null });

(globalThis as any)._TRIP_MOCKS = {
  mockTripService,
  mockAddMutation,
  mockRpc,
  mockGetSession,
};

jest.mock('@/lib/services/tripService', () => ({
  TripService: {
    getTrips: (...args: any[]) => (globalThis as any)._TRIP_MOCKS.mockTripService.getTrips(...args),
    getTripById: (...args: any[]) => (globalThis as any)._TRIP_MOCKS.mockTripService.getTripById(...args),
    getUpcomingTrips: (...args: any[]) => (globalThis as any)._TRIP_MOCKS.mockTripService.getUpcomingTrips(...args),
    getTripsForDate: (...args: any[]) => (globalThis as any)._TRIP_MOCKS.mockTripService.getTripsForDate(...args),
    createTrip: (...args: any[]) => (globalThis as any)._TRIP_MOCKS.mockTripService.createTrip(...args),
    deleteTrip: (...args: any[]) => (globalThis as any)._TRIP_MOCKS.mockTripService.deleteTrip(...args),
    updateTrip: (...args: any[]) => (globalThis as any)._TRIP_MOCKS.mockTripService.updateTrip(...args),
  },
}));

jest.mock('@/lib/stores/wineryStore', () => ({
  useWineryStore: {
    getState: jest.fn(() => ({
      ensureWineryDetails: jest.fn().mockResolvedValue({}),
      updateWinery: jest.fn(),
    })),
  },
}));

jest.mock('@/lib/stores/syncStore', () => ({
  useSyncStore: {
    getState: jest.fn(() => ({
      addMutation: (...args: any[]) => (globalThis as any)._TRIP_MOCKS.mockAddMutation(...args),
      queue: [],
      initialize: jest.fn(),
    })),
  },
}));

jest.mock('@/utils/supabase/client', () => ({
  createClient: jest.fn(() => ({
    rpc: (...args: any[]) => (globalThis as any)._TRIP_MOCKS.mockRpc(...args),
    from: jest.fn(() => ({
      select: jest.fn(),
      insert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    })),
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'test-user' } }, error: null }),
      getSession: (...args: any[]) => (globalThis as any)._TRIP_MOCKS.mockGetSession(...args),
    },
  })),
}));

describe('tripStore', () => {
  const mockTrip = createMockTrip();
  const mockTrips = [mockTrip];
  const mockCount = 1;

  beforeEach(() => {
    mockTripService = {
      getTrips: jest.fn(),
      getTripById: jest.fn(),
      getUpcomingTrips: jest.fn(),
      getTripsForDate: jest.fn(),
      createTrip: jest.fn(),
      deleteTrip: jest.fn(),
      updateTrip: jest.fn(),
    };

    mockAddMutation = jest.fn().mockResolvedValue(undefined);
    mockRpc = jest.fn();
    mockGetSession = jest.fn().mockResolvedValue({ data: { session: { user: { id: 'test-user' } } }, error: null });

    (globalThis as any)._TRIP_MOCKS = {
      mockTripService,
      mockAddMutation,
      mockRpc,
      mockGetSession,
    };

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
      expect(mockTripService.getTrips).toHaveBeenCalled();
    });

    it('should handle fetch trips error', async () => {
      const error = new Error('Fetch failed');
      mockTripService.getTrips.mockRejectedValue(error);

      await act(async () => {
        await useTripStore.getState().fetchTrips(1, 'upcoming');
      });

      const state = useTripStore.getState();
      expect(state.isLoading).toBe(false);
      expect(state.trips).toEqual([]);
    });
  });

  describe('createTrip', () => {
    it('should create a trip successfully and add it to state', async () => {
      const newTripData = { title: 'New Trip' };
      mockTripService.createTrip.mockResolvedValue(mockTrip);

      let createdTrip;
      await act(async () => {
        createdTrip = await useTripStore.getState().createTrip(newTripData as any);
      });

      const state = useTripStore.getState();
      expect(state.trips).toContainEqual(mockTrip);
      expect(createdTrip).toEqual(mockTrip);
      expect(mockTripService.createTrip).toHaveBeenCalledWith(newTripData, expect.any(String));
    });
  });

  describe('updateTrip', () => {
    it('should update a trip successfully and update state', async () => {
      useTripStore.setState({ trips: [mockTrip] });
      const updatedTrip = { ...mockTrip, name: 'Updated Title' };
      mockTripService.updateTrip.mockResolvedValue(updatedTrip);

      await act(async () => {
        await useTripStore.getState().updateTrip(String(mockTrip.id), { name: 'Updated Title' } as any);
      });

      const state = useTripStore.getState();
      expect((state.trips[0] as any).name).toBe('Updated Title');
      expect(mockTripService.updateTrip).toHaveBeenCalledWith(String(mockTrip.id), { name: 'Updated Title' });
    });
  });

  describe('deleteTrip', () => {
    it('should delete a trip successfully and remove it from state', async () => {
      useTripStore.setState({ trips: [mockTrip], tripsForDate: [mockTrip] });
      mockTripService.deleteTrip.mockResolvedValue(true);

      await act(async () => {
        await useTripStore.getState().deleteTrip(String(mockTrip.id));
      });

      const state = useTripStore.getState();
      expect(state.trips).toHaveLength(0);
      expect(state.tripsForDate).toHaveLength(0);
    });
  });

  describe('addWineryToTrips network failure (ST-07)', () => {
    it('does not enqueue empty {} or log_visit mutation on multi-trip network failure', async () => {
      mockAddMutation = jest.fn().mockResolvedValue(undefined);
      mockRpc = jest.fn().mockRejectedValue(new Error('Failed to fetch'));
      mockGetSession = jest.fn().mockResolvedValue({
        data: { session: { user: { id: 'user-test-123' } } },
        error: null,
      });

      (globalThis as any)._TRIP_MOCKS = {
        mockTripService,
        mockAddMutation,
        mockRpc,
        mockGetSession,
      };

      const mockWinery = { id: 'winery-1', dbId: 10, name: 'Seneca Estate' };

      await act(async () => {
        await useTripStore.getState().addWineryToTrips(mockWinery as any, new Date('2026-09-02T12:00:00Z'), new Set(['456']), 'New Trip', 'Note');
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
