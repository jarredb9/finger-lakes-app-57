import { act } from '@testing-library/react';
import { useMapStore } from '../mapStore';
import { useUIStore } from '../uiStore';

describe('ST-12: Store Serializability & Pure State Architecture', () => {
  beforeEach(() => {
    act(() => {
      useMapStore.getState().reset();
      useUIStore.getState().reset();
    });
  });

  describe('mapStore serializability', () => {
    it('does not store map SDK DOM or MapRef instances', () => {
      const state = useMapStore.getState() as any;
      expect(state.map).toBeUndefined();
      expect(state.setMap).toBeUndefined();
    });

    it('stores bounds as strictly serializable coordinate boundaries', () => {
      const serializableBounds = {
        north: 43.1,
        south: 42.4,
        east: -76.8,
        west: -77.2,
      };

      act(() => {
        useMapStore.getState().setBounds(serializableBounds as any);
      });

      const state = useMapStore.getState();
      expect(state.bounds).toEqual(serializableBounds);
      // Ensure no prototype functions exist on stored bounds
      expect(typeof (state.bounds as any)?.getNorthEast).toBe('undefined');
    });

    it('can be serialized to JSON without circular references or non-serializable objects', () => {
      const state = useMapStore.getState();
      expect(() => JSON.stringify(state)).not.toThrow();
    });
  });

  describe('uiStore serializability', () => {
    it('does not store ReactNode JSX elements in modalContent', () => {
      const state = useUIStore.getState() as any;
      expect(state.modalContent).toBeUndefined();
    });

    it('does not store closure callback functions in onNoteSave', () => {
      const state = useUIStore.getState() as any;
      expect(state.onNoteSave).toBeUndefined();
    });

    it('uses serializable modal state identifiers instead of JSX elements', () => {
      const state = useUIStore.getState() as any;
      // Should support serializable active modal pattern
      expect(state).toHaveProperty('activeModal');
    });

    it('can be serialized to JSON without React Fiber symbols or DOM elements', () => {
      const state = useUIStore.getState();
      const serialized = JSON.stringify(state);
      expect(serialized).not.toContain('$$typeof');
      expect(() => JSON.parse(serialized)).not.toThrow();
    });
  });
});
