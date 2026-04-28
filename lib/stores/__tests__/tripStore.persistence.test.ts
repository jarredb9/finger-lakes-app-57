import { act } from '@testing-library/react';
import { useTripStore } from '../tripStore';
import { createMockTrip } from '@/lib/test-utils/fixtures';

// Mock idb-keyval
jest.mock('idb-keyval', () => ({
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
}));

describe('tripStore Persistence', () => {
  beforeEach(() => {
    act(() => {
      useTripStore.getState().reset();
    });
    jest.clearAllMocks();
  });

  it('should NOT persist selectedTrip in storage', async () => {
    const mockTrip = createMockTrip({ id: 999, name: 'Persistent Trip' });

    act(() => {
      useTripStore.getState().setSelectedTrip(mockTrip);
    });

    // Verify current state has it
    expect(useTripStore.getState().selectedTrip).toEqual(mockTrip);

    // Get what would be saved to storage according to the partialize function
    const persistOptions = (useTripStore as any).persist.getOptions();
    const state = useTripStore.getState();
    const partialState = persistOptions.partialize(state);

    expect(partialState.selectedTrip).toBeUndefined();

    // The persist middleware calls storage.setItem
    // Since it's async, we might need to wait or just check the partialize logic
    expect(partialState.selectedTrip).toBeUndefined();
  });

  it('should rehydrate trips from IndexedDB on initialization', async () => {
    const mockTrips = [createMockTrip({ id: 101, name: 'Cached Trip' })];
    const { get } = require('idb-keyval');
    
    // Simulate what's in IndexedDB
    (get as jest.Mock).mockResolvedValue(JSON.stringify({
      state: {
        trips: mockTrips,
        page: 1,
        count: 1,
        hasMore: false
      },
      version: 0
    }));

    // We need to re-initialize or trigger rehydration. 
    // In a test environment, the store might have already initialized.
    // We can use useTripStore.persist.rehydrate()
    await useTripStore.persist.rehydrate();

    expect(useTripStore.getState().trips).toEqual(mockTrips);
  });
});
