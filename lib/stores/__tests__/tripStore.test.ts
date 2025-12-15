import { useTripStore } from '../tripStore';
import { TripService } from '@/lib/services/tripService';
import { useWineryStore } from '@/lib/stores/wineryStore';
import { act } from '@testing-library/react';
import { createClient } from '@/utils/supabase/client';

// Mock dependencies
jest.mock('@/lib/services/tripService');
jest.mock('@/lib/stores/wineryStore', () => ({
  useWineryStore: {
    getState: jest.fn(() => ({
      ensureWineryDetails: jest.fn().mockResolvedValue({}),
      updateWinery: jest.fn(),
    })),
  },
}));
jest.mock('@/utils/supabase/client');

// Typed mocks
const mockedTripService = TripService as jest.Mocked<typeof TripService>;
const mockedCreateClient = createClient as jest.Mock;

describe('tripStore', () => {
  const mockTrips = [{ id: 1, name: 'Test Trip' }];
  const mockCount = 1;

  beforeEach(() => {
    jest.clearAllMocks();
    useTripStore.setState({
      trips: [],
      tripsForDate: [],
      upcomingTrips: [],
      isLoading: false,
      isSaving: false,
      selectedTrip: null,
      page: 1,
      count: 0,
      hasMore: true,
    });
  });

  describe('fetchTrips', () => {
    it('should fetch trips successfully and update state', async () => {
      mockedTripService.getTrips.mockResolvedValue({ trips: mockTrips, count: mockCount });

      await act(async () => {
        await useTripStore.getState().fetchTrips(1, 'upcoming');
      });

      const state = useTripStore.getState();
      expect(state.trips).toEqual(mockTrips);
      expect(state.count).toBe(mockCount);
      expect(state.isLoading).toBe(false);
      expect(state.hasMore).toBe(false); // 1 < 6 (limit) is false? Logic check: 1 < 1 is false. 
    });

    it('should handle errors gracefully', async () => {
      mockedTripService.getTrips.mockRejectedValue(new Error('Network error'));

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
      mockedTripService.createTrip.mockResolvedValue(createdTrip as any);

      await act(async () => {
        await useTripStore.getState().createTrip(newTrip);
      });

      const state = useTripStore.getState();
      expect(state.tripsForDate).toContainEqual(createdTrip);
    });
  });

  describe('deleteTrip', () => {
    it('should optimistically remove a trip', async () => {
      // Setup initial state
      const initialTrip = { id: 123, name: 'To Delete' };
      useTripStore.setState({ trips: [initialTrip as any], tripsForDate: [initialTrip as any] });

      mockedTripService.deleteTrip.mockResolvedValue(undefined);

      await act(async () => {
        await useTripStore.getState().deleteTrip('123');
      });

      const state = useTripStore.getState();
      expect(state.trips).toHaveLength(0);
      expect(state.tripsForDate).toHaveLength(0);
      expect(mockedTripService.deleteTrip).toHaveBeenCalledWith('123');
    });
  });
});
