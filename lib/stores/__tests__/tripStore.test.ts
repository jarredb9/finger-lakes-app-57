import { act } from 'react';
import { useTripStore } from '../tripStore';

// Mock the global fetch function
global.fetch = jest.fn();

// Helper to reset the store between tests
const resetStore = () => {
  useTripStore.setState({
    trips: [],
    tripsForDate: [],
    upcomingTrips: [],
    isLoading: false,
    selectedTrip: null,
    page: 1,
    count: 0,
    hasMore: true,
  }); 
};

describe('tripStore', () => {
  beforeEach(() => {
    resetStore();
    jest.clearAllMocks();
  });

  describe('fetchTrips', () => {
    it('should fetch trips successfully and update state', async () => {
      const mockTrips = [{ id: 1, name: 'Test Trip' }];
      const mockCount = 1;
      
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ trips: mockTrips, count: mockCount }),
      });

      await act(async () => {
        await useTripStore.getState().fetchTrips(1, 'upcoming');
      });

      const state = useTripStore.getState();
      expect(state.trips).toEqual(mockTrips);
      expect(state.count).toBe(mockCount);
      expect(state.isLoading).toBe(false);
      expect(state.hasMore).toBe(false); // 1 < 6 (limit) is false? Logic check: 1 < 1 is false.
    });

    it('should handle fetch errors gracefully', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

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
      const inputTrip = { name: 'New Adventure', user_id: 'user1' };
      const serverResponse = { tripId: 123, ...inputTrip };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => serverResponse,
      });

      await act(async () => {
        await useTripStore.getState().createTrip(inputTrip);
      });

      const state = useTripStore.getState();
      const createdTrip = state.tripsForDate.find(t => t.id === 123);
      
      expect(createdTrip).toBeDefined();
      expect(createdTrip?.name).toBe('New Adventure');
    });

    it('should revert optimistic update on failure', async () => {
      const inputTrip = { name: 'Failed Trip' };
      
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
      });

      await expect(useTripStore.getState().createTrip(inputTrip)).rejects.toThrow();

      const state = useTripStore.getState();
      // Should be empty because the optimistic one was removed
      expect(state.tripsForDate).toHaveLength(0);
    });
  });

  describe('deleteTrip', () => {
    it('should optimistically remove a trip', async () => {
        // Setup initial state
        const initialTrip = { id: 1, name: 'Trip to Delete', user_id: 'u1', trip_date: '2023-01-01', wineries: [] };
        useTripStore.setState({ trips: [initialTrip], tripsForDate: [initialTrip] });

        (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true });

        await act(async () => {
            await useTripStore.getState().deleteTrip('1');
        });

        const state = useTripStore.getState();
        expect(state.trips).toHaveLength(0);
        expect(state.tripsForDate).toHaveLength(0);
    });

    it('should revert deletion on server error', async () => {
        const initialTrip = { id: 1, name: 'Trip to Delete', user_id: 'u1', trip_date: '2023-01-01', wineries: [] };
        useTripStore.setState({ trips: [initialTrip], tripsForDate: [initialTrip] });

        (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false });

        await expect(useTripStore.getState().deleteTrip('1')).rejects.toThrow();

        const state = useTripStore.getState();
        expect(state.trips).toHaveLength(1);
        expect(state.tripsForDate).toHaveLength(1);
    });
  });
});
