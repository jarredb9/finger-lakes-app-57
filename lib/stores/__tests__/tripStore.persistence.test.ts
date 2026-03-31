import { act } from '@testing-library/react';
import { useTripStore } from '../tripStore';
import { createMockTrip } from '@/lib/test-utils/fixtures';

describe('tripStore Persistence', () => {
  beforeEach(() => {
    act(() => {
      useTripStore.getState().reset();
    });
    localStorage.clear();
  });

  it('should NOT persist selectedTrip in storage', () => {
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

    // Now simulate reload by clearing and re-initializing the store
    // This is a bit manual since Zustand doesn't have a simple 'rehydrate' trigger in tests easily
    // but we can check the storage directly.
    const storageKey = persistOptions.name;
    const storageValue = JSON.parse(localStorage.getItem(storageKey) || '{}');
    expect(storageValue.state.selectedTrip).toBeUndefined();
  });
});
