import { act } from '@testing-library/react';

// Define the mock outside to share it across tests
const mockTripService = {
  getTrips: jest.fn(),
  getTripById: jest.fn(),
  getUpcomingTrips: jest.fn(),
  getTripsForDate: jest.fn(),
  createTrip: jest.fn(),
  deleteTrip: jest.fn(),
  updateTrip: jest.fn(),
};

// COMPREHENSIVE MOCKING
jest.mock('@/lib/services/tripService', () => ({
  TripService: mockTripService
}));

jest.mock('@/lib/stores/wineryStore', () => ({
  useWineryStore: {
    getState: jest.fn(() => ({
      ensureWineryDetails: jest.fn().mockResolvedValue({}),
      updateWinery: jest.fn(),
    })),
  },
}));

jest.mock('@/utils/supabase/client', () => ({
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
    }
  })),
}));

describe('tripStore', () => {
  // Use let for the store so we can reset it if needed
  let useTripStore: any;

  beforeEach(() => {
    jest.clearAllMocks();
    // Re-require to ensure mocks are applied to the store instance
    jest.isolateModules(() => {
        useTripStore = require('../tripStore').useTripStore;
    });
  });

  describe('fetchTrips', () => {
    it('should fetch trips successfully and update state', async () => {
      const mockTrips = [{ id: 1, name: 'Test Trip' }];
      const mockCount = 1;
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
      const newTrip = { name: 'New Trip', trip_date: '2023-01-01' };
      const createdTrip = { ...newTrip, id: 123, user_id: 'user1', wineries: [], members: [] };
      mockTripService.createTrip.mockResolvedValue(createdTrip);

      await act(async () => {
        await useTripStore.getState().createTrip(newTrip);
      });

      const state = useTripStore.getState();
      expect(state.trips).toContainEqual(createdTrip);
    });
  });

  describe('deleteTrip', () => {
    it('should optimistically remove a trip', async () => {
      const initialTrip = { id: 123, name: 'To Delete' };
      
      await act(async () => {
          useTripStore.setState({ trips: [initialTrip as any], tripsForDate: [initialTrip as any] });
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
});
