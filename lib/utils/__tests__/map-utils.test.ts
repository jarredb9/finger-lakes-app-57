import { coordToMapbox, mapboxToCoord, isCoordinateInBounds, getCoordinatesFromBounds } from '../map-utils';

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

  describe('isCoordinateInBounds', () => {
    const coord = { latitude: 42.5, longitude: -76.8 };

    it('returns false if coordinate or bounds are undefined/null', () => {
      expect(isCoordinateInBounds(undefined, {})).toBe(false);
      expect(isCoordinateInBounds(coord, null)).toBe(false);
    });

    it('handles Google/Mapbox class style contains method', () => {
      const mockGoogleBounds = {
        contains: jest.fn().mockImplementation((c) => c.lat === 42.5 && c.lng === -76.8),
      };
      expect(isCoordinateInBounds(coord, mockGoogleBounds)).toBe(true);
      expect(mockGoogleBounds.contains).toHaveBeenCalled();
    });

    it('handles getSouthWest and getNorthEast bounds (Google/Mapbox mock objects)', () => {
      const mockBounds = {
        getSouthWest: () => ({ lat: 42.0, lng: -77.0 }),
        getNorthEast: () => ({ lat: 43.0, lng: -76.0 }),
      };
      expect(isCoordinateInBounds(coord, mockBounds)).toBe(true);
      expect(isCoordinateInBounds({ latitude: 41.0, longitude: -76.8 }, mockBounds)).toBe(false);
    });

    it('handles plain object bounds with sw/ne structures', () => {
      const mockBounds = {
        sw: { lat: 42.0, lng: -77.0 },
        ne: { lat: 43.0, lng: -76.0 },
      };
      expect(isCoordinateInBounds(coord, mockBounds)).toBe(true);
    });

    it('handles literal bounding boxes with west/south/east/north properties', () => {
      const literalBounds = { west: -77.0, south: 42.0, east: -76.0, north: 43.0 };
      expect(isCoordinateInBounds(coord, literalBounds)).toBe(true);
      expect(isCoordinateInBounds({ latitude: 45.0, longitude: -76.8 }, literalBounds)).toBe(false);
    });
  });

  describe('getCoordinatesFromBounds', () => {
    it('returns null for undefined/null bounds', () => {
      expect(getCoordinatesFromBounds(null)).toBeNull();
    });

    it('extracts coords from getSouthWest/getNorthEast functions', () => {
      const bounds = {
        getSouthWest: () => ({ lat: 42.0, lng: -77.0 }),
        getNorthEast: () => ({ lat: 43.0, lng: -76.0 })
      };
      expect(getCoordinatesFromBounds(bounds)).toEqual({
        swLat: 42.0,
        swLng: -77.0,
        neLat: 43.0,
        neLng: -76.0
      });
    });

    it('extracts coords from plain literal bounds', () => {
      const bounds = { west: -77.0, south: 42.0, east: -76.0, north: 43.0 };
      expect(getCoordinatesFromBounds(bounds)).toEqual({
        swLat: 42.0,
        swLng: -77.0,
        neLat: 43.0,
        neLng: -76.0
      });
    });
  });
});
