import { act } from '@testing-library/react';
import { useVisitStore } from '../visitStore';
import { useTripStore } from '../tripStore';
import { useWineryDataStore } from '../wineryDataStore';
import { useFriendStore } from '../friendStore';
import { createMockTrip, createMockWinery, createMockVisitWithWinery, createMockFriend, createMockFriendActivity } from '@/lib/test-utils/fixtures';

// Mock idb-keyval
jest.mock('idb-keyval', () => ({
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
}));

describe('Selective Persistence across Stores', () => {
  const { get: mockGet } = require('idb-keyval');

  beforeEach(() => {
    act(() => {
      useVisitStore.getState().reset();
      useTripStore.getState().reset();
      useWineryDataStore.getState().reset();
      useFriendStore.getState().reset();
    });
    jest.clearAllMocks();
  });

  it('should persist first 20 visits in visitStore', async () => {
    const manyVisits = Array.from({ length: 30 }, (_, i) => createMockVisitWithWinery({ id: (i + 1) as any }));
    
    act(() => {
      useVisitStore.setState({ visits: manyVisits });
    });

    const persistOptions = (useVisitStore as any).persist.getOptions();
    const partialState = persistOptions.partialize(useVisitStore.getState());

    expect(partialState.visits).toHaveLength(20);
    expect((partialState.visits![0] as any).id).toBe(1);
    expect((partialState.visits![19] as any).id).toBe(20);
  });

  it('should persist first 20 trips in tripStore', async () => {
    const manyTrips = Array.from({ length: 30 }, (_, i) => createMockTrip({ id: i + 1 }));
    
    act(() => {
      useTripStore.setState({ trips: manyTrips });
    });

    const persistOptions = (useTripStore as any).persist.getOptions();
    const partialState = persistOptions.partialize(useTripStore.getState());

    expect(partialState.trips).toHaveLength(20);
    expect(partialState.trips[0].id).toBe(1);
  });

  it('should persist first 50 wineries in wineryDataStore', async () => {
    const manyWineries = Array.from({ length: 60 }, (_, i) => createMockWinery({ id: `w${i + 1}` as any }));
    
    act(() => {
      useWineryDataStore.setState({ persistentWineries: manyWineries });
    });

    const persistOptions = (useWineryDataStore as any).persist.getOptions();
    const partialState = persistOptions.partialize(useWineryDataStore.getState());

    expect(partialState.persistentWineries).toHaveLength(50);
    expect(partialState.persistentWineries[0].id).toBe('w1');
  });

  it('should persist friends and first 20 activities in friendStore', async () => {
    const manyFriends = Array.from({ length: 5 }, (_, i) => createMockFriend({ id: `f${i + 1}` }));
    const manyActivities = Array.from({ length: 30 }, (_, i) => createMockFriendActivity({ id: i + 1 }));
    
    act(() => {
      useFriendStore.setState({ 
        friends: manyFriends,
        friendActivityFeed: manyActivities
      });
    });

    const persistOptions = (useFriendStore as any).persist.getOptions();
    const partialState = persistOptions.partialize(useFriendStore.getState());

    expect(partialState.friends).toHaveLength(5);
    expect(partialState.friendActivityFeed).toHaveLength(20);
  });

  it('should rehydrate friendStore from IndexedDB', async () => {
    const mockFriends = [createMockFriend({ id: 'f1', name: 'Friend 1' })];
    
    (mockGet as jest.Mock).mockResolvedValue(JSON.stringify({
      state: {
        friends: mockFriends,
        friendActivityFeed: []
      },
      version: 0
    }));

    await useFriendStore.persist.rehydrate();

    expect(useFriendStore.getState().friends).toEqual(mockFriends);
  });
});
