import { act } from '@testing-library/react';
import { useTripStore } from '../tripStore';
import { useVisitStore } from '../visitStore';

describe('ST-13: Action Timestamp Persistence Isolation', () => {
  beforeEach(() => {
    act(() => {
      useTripStore.getState().reset();
      useVisitStore.getState().reset();
    });
  });

  describe('tripStore persistence isolation', () => {
    it('excludes lastActionTimestamp and lastActionTimestamps from IndexedDB partialize', () => {
      act(() => {
        useTripStore.setState({
          lastActionTimestamp: 1725880000,
          lastActionTimestamps: { 'trip-1': 1725880000, 'trip-2': 1725880500 },
        });
      });

      const persistOptions = (useTripStore as any).persist.getOptions();
      const currentState = useTripStore.getState();
      const partialState = persistOptions.partialize(currentState);

      expect(partialState.lastActionTimestamp).toBeUndefined();
      expect(partialState.lastActionTimestamps).toBeUndefined();
    });

    it('clears both lastActionTimestamp and lastActionTimestamps on store.reset()', () => {
      act(() => {
        useTripStore.setState({
          lastActionTimestamp: 1725880000,
          lastActionTimestamps: { 'trip-1': 1725880000 },
        });
      });

      act(() => {
        useTripStore.getState().reset();
      });

      expect(useTripStore.getState().lastActionTimestamp).toBeNull();
      expect(useTripStore.getState().lastActionTimestamps).toEqual({});
    });
  });

  describe('visitStore persistence isolation', () => {
    it('excludes lastActionTimestamp and lastActionTimestamps from IndexedDB partialize', () => {
      act(() => {
        useVisitStore.setState({
          lastActionTimestamp: 1725880000,
          lastActionTimestamps: { 'visit-1': 1725880000, 'visit-2': 1725880500 },
        });
      });

      const persistOptions = (useVisitStore as any).persist.getOptions();
      const currentState = useVisitStore.getState();
      const partialState = persistOptions.partialize(currentState);

      expect(partialState.lastActionTimestamp).toBeUndefined();
      expect(partialState.lastActionTimestamps).toBeUndefined();
    });

    it('clears both lastActionTimestamp and lastActionTimestamps on store.reset()', () => {
      act(() => {
        useVisitStore.setState({
          lastActionTimestamp: 1725880000,
          lastActionTimestamps: { 'visit-1': 1725880000 },
        });
      });

      act(() => {
        useVisitStore.getState().reset();
      });

      expect(useVisitStore.getState().lastActionTimestamp).toBeNull();
      expect(useVisitStore.getState().lastActionTimestamps).toEqual({});
    });
  });
});
