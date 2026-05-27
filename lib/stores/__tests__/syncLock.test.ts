import { act } from '@testing-library/react';
import { createClient } from '@/utils/supabase/client';

jest.mock('@/utils/supabase/client', () => ({
  createClient: jest.fn(),
}));

jest.mock('../wineryStore', () => ({
  useWineryStore: {
    getState: jest.fn(() => ({
      getWineries: jest.fn(() => []),
    })),
  },
}));

jest.mock('../wineryDataStore', () => ({
  useWineryDataStore: {
    getState: jest.fn(() => ({
      upsertWinery: jest.fn(),
    })),
  },
}));

describe('Sync Lock Race Condition (Global -> Per-Entity)', () => {
  let useVisitStore: any;
  let useTripStore: any;

  beforeEach(() => {
    jest.isolateModules(() => {
      useVisitStore = require('../visitStore').useVisitStore;
      useTripStore = require('../tripStore').useTripStore;
    });
    useVisitStore.getState().reset();
    useTripStore.getState().reset();
    jest.clearAllMocks();
  });

  describe('visitStore', () => {
    it('should NOT ignore update for Visit B when Visit A was recently updated', async () => {
      const store = useVisitStore;
      
      // 1. Simulate recent action on Visit A at T=2000
      act(() => {
        store.setState({ lastActionTimestamp: 2000 });
      });

      const mockFetchVisits = jest.fn();
      act(() => {
        store.setState({ fetchVisits: mockFetchVisits });
      });

      let capturedCallback: any;
      const mockChannel = {
        on: jest.fn().mockImplementation((event, _filter, callback) => {
          if (event === 'postgres_changes') capturedCallback = callback;
          return mockChannel;
        }),
        subscribe: jest.fn().mockReturnThis(),
      };

      (createClient as jest.Mock).mockReturnValue({
        channel: () => mockChannel
      });

      await act(async () => {
        store.getState().subscribeToVisitUpdates();
      });

      expect(capturedCallback).toBeDefined();

      // 2. Trigger callback for Visit B at T=500
      await act(async () => {
        await capturedCallback({
          new: { id: 'visit-B', updated_at: new Date(500).toISOString() },
          old: {}
        });
      });

      // EXPECTATION: Should NOT be ignored
      expect(mockFetchVisits).toHaveBeenCalled();
    });

    it('should IGNORE stale update for Visit A when Visit A was recently updated', async () => {
      const store = useVisitStore;
      
      // 1. Simulate recent action on Visit A at T=2000
      act(() => {
        store.getState().setLastActionTimestamp('visit-A', 2000);
      });

      const mockFetchVisits = jest.fn();
      act(() => {
        store.setState({ fetchVisits: mockFetchVisits });
      });

      let capturedCallback: any;
      const mockChannel = {
        on: jest.fn().mockImplementation((event, _filter, callback) => {
          if (event === 'postgres_changes') capturedCallback = callback;
          return mockChannel;
        }),
        subscribe: jest.fn().mockReturnThis(),
      };

      (createClient as jest.Mock).mockReturnValue({
        channel: () => mockChannel
      });

      await act(async () => {
        store.getState().subscribeToVisitUpdates();
      });

      // 2. Trigger callback for Visit A at T=500 (STALE)
      await act(async () => {
        await capturedCallback({
          new: { id: 'visit-A', updated_at: new Date(500).toISOString() },
          old: {}
        });
      });

      // EXPECTATION: Should BE ignored
      expect(mockFetchVisits).not.toHaveBeenCalled();
    });
  });

  describe('tripStore', () => {
    it('should NOT ignore update for Trip B when Trip A was recently updated', async () => {
      const store = useTripStore;
      
      act(() => {
        store.setState({ lastActionTimestamp: 2000 });
      });

      const mockFetchTrips = jest.fn();
      act(() => {
        store.setState({ fetchTrips: mockFetchTrips });
        store.setState({ fetchUpcomingTrips: jest.fn() });
      });

      let tripCallback: any;
      const mockChannel = {
        on: jest.fn().mockImplementation((event, _filter, callback) => {
          if (event === 'postgres_changes' && _filter.table === 'trips') tripCallback = callback;
          return mockChannel;
        }),
        subscribe: jest.fn().mockReturnThis(),
      };

      (createClient as jest.Mock).mockReturnValue({
        channel: () => mockChannel
      });

      await act(async () => {
        store.getState().subscribeToTripUpdates();
      });

      expect(tripCallback).toBeDefined();

      await act(async () => {
        await tripCallback({
          new: { id: 'trip-B', updated_at: new Date(500).toISOString() },
          old: {}
        });
      });

      expect(mockFetchTrips).toHaveBeenCalled();
    });

    it('should IGNORE stale update for Trip A when Trip A was recently updated', async () => {
      const store = useTripStore;
      
      act(() => {
        store.getState().setLastActionTimestamp('trip-A', 2000);
      });

      const mockFetchTrips = jest.fn();
      act(() => {
        store.setState({ fetchTrips: mockFetchTrips });
        store.setState({ fetchUpcomingTrips: jest.fn() });
      });

      let tripCallback: any;
      const mockChannel = {
        on: jest.fn().mockImplementation((event, _filter, callback) => {
          if (event === 'postgres_changes' && _filter.table === 'trips') tripCallback = callback;
          return mockChannel;
        }),
        subscribe: jest.fn().mockReturnThis(),
      };

      (createClient as jest.Mock).mockReturnValue({
        channel: () => mockChannel
      });

      await act(async () => {
        store.getState().subscribeToTripUpdates();
      });

      await act(async () => {
        await tripCallback({
          new: { id: 'trip-A', updated_at: new Date(500).toISOString() },
          old: {}
        });
      });

      expect(mockFetchTrips).not.toHaveBeenCalled();
    });
  });
});
