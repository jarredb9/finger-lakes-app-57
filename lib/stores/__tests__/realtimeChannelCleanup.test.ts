import { act } from '@testing-library/react';

describe('ST-11: Realtime Channel Cleanup on Reset and Logout', () => {
  let useTripStore: any;
  let useVisitStore: any;
  let useFriendStore: any;
  let useUserStore: any;
  let mockTripChannel: any;
  let mockVisitChannel: any;
  let mockFriendChannel: any;
  let mockSupabase: any;

  beforeEach(() => {
    jest.resetModules();

    mockTripChannel = {
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn().mockReturnThis(),
      unsubscribe: jest.fn(),
    };

    mockVisitChannel = {
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn().mockReturnThis(),
      unsubscribe: jest.fn(),
    };

    mockFriendChannel = {
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn().mockReturnThis(),
      unsubscribe: jest.fn(),
    };

    mockSupabase = {
      channel: jest.fn((name: string) => {
        if (name === 'trip-updates') return mockTripChannel;
        if (name === 'visit-updates') return mockVisitChannel;
        if (name === 'social-updates') return mockFriendChannel;
        return {
          on: jest.fn().mockReturnThis(),
          subscribe: jest.fn().mockReturnThis(),
          unsubscribe: jest.fn(),
        };
      }),
      auth: {
        signOut: jest.fn().mockResolvedValue({ error: null }),
        getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: null }),
        getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
      },
    };

    jest.doMock('@/utils/supabase/client', () => ({
      createClient: jest.fn(() => mockSupabase),
    }));

    useTripStore = require('../tripStore').useTripStore;
    useVisitStore = require('../visitStore').useVisitStore;
    useFriendStore = require('../friendStore').useFriendStore;
    useUserStore = require('../userStore').useUserStore;

    act(() => {
      useTripStore.getState().reset();
      useVisitStore.getState().reset();
      useFriendStore.getState().reset();
      useUserStore.getState().reset();
    });
  });

  describe('individual store reset unsubscription', () => {
    it('unsubscribes and nullifies tripStore Realtime channel on tripStore.reset()', () => {
      act(() => {
        useTripStore.getState().subscribeToTripUpdates();
      });
      expect(useTripStore.getState().subscription).toBe(mockTripChannel);

      act(() => {
        useTripStore.getState().reset();
      });
      expect(mockTripChannel.unsubscribe).toHaveBeenCalledTimes(1);
      expect(useTripStore.getState().subscription).toBeNull();
    });

    it('unsubscribes and nullifies visitStore Realtime channel on visitStore.reset()', () => {
      act(() => {
        useVisitStore.getState().subscribeToVisitUpdates();
      });
      expect(useVisitStore.getState().subscription).toBe(mockVisitChannel);

      act(() => {
        useVisitStore.getState().reset();
      });
      expect(mockVisitChannel.unsubscribe).toHaveBeenCalledTimes(1);
      expect(useVisitStore.getState().subscription).toBeNull();
    });

    it('unsubscribes and nullifies friendStore Realtime channel on friendStore.reset()', () => {
      act(() => {
        useFriendStore.getState().subscribeToSocialUpdates();
      });
      expect(useFriendStore.getState().subscription).toBe(mockFriendChannel);

      act(() => {
        useFriendStore.getState().reset();
      });
      expect(mockFriendChannel.unsubscribe).toHaveBeenCalledTimes(1);
      expect(useFriendStore.getState().subscription).toBeNull();
    });
  });

  describe('userStore.logout() channel teardown across all stores', () => {
    it('unsubscribes all active Realtime channels across tripStore, visitStore, and friendStore on logout', async () => {
      act(() => {
        useTripStore.getState().subscribeToTripUpdates();
        useVisitStore.getState().subscribeToVisitUpdates();
        useFriendStore.getState().subscribeToSocialUpdates();
      });

      expect(useTripStore.getState().subscription).toBe(mockTripChannel);
      expect(useVisitStore.getState().subscription).toBe(mockVisitChannel);
      expect(useFriendStore.getState().subscription).toBe(mockFriendChannel);

      await act(async () => {
        await useUserStore.getState().logout();
      });

      expect(mockTripChannel.unsubscribe).toHaveBeenCalledTimes(1);
      expect(mockVisitChannel.unsubscribe).toHaveBeenCalledTimes(1);
      expect(mockFriendChannel.unsubscribe).toHaveBeenCalledTimes(1);

      expect(useTripStore.getState().subscription).toBeNull();
      expect(useVisitStore.getState().subscription).toBeNull();
      expect(useFriendStore.getState().subscription).toBeNull();
      expect(mockSupabase.auth.signOut).toHaveBeenCalledTimes(1);
    });
  });
});
