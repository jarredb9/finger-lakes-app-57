import { coordToMapbox, mapboxToCoord } from '../map-utils';

describe('Map Utilities', () => {
  describe('coordToMapbox', () => {
    it('converts latitude/longitude object to [longitude, latitude] array', () => {
      const coord = { latitude: 42.4433, longitude: -76.5019 };
      const expected: [number, number] = [-76.5019, 42.4433];
      expect(coordToMapbox(coord)).toEqual(expected);
    });
  });

  describe('mapboxToCoord', () => {
    it('converts [longitude, latitude] array to latitude/longitude object', () => {
      const coords: [number, number] = [-76.5019, 42.4433];
      const expected = { latitude: 42.4433, longitude: -76.5019 };
      expect(mapboxToCoord(coords)).toEqual(expected);
    });
  });
});
