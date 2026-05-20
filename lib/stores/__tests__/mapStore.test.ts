import { useMapStore } from '../mapStore';

describe('mapStore cleanup', () => {
  it('should not have selectedTrip property', () => {
    // @ts-expect-error - selectedTrip should be removed
    expect(useMapStore.getState().selectedTrip).toBeUndefined();
  });

  it('should not have setSelectedTrip property', () => {
    // @ts-expect-error - setSelectedTrip should be removed
    expect(useMapStore.getState().setSelectedTrip).toBeUndefined();
  });
});
