import {
  coordToMapbox,
  mapboxToCoord,
  isCoordinateInBounds,
  getCoordinatesFromBounds,
  calculateDistanceKm,
} from '../map-utils';

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

  describe('calculateDistanceKm', () => {
    it('returns 0 when coordinates are identical', () => {
      const coord = { latitude: 42.7, longitude: -76.9 };
      expect(calculateDistanceKm(coord, coord)).toBe(0);
    });

    it('calculates accurate Haversine distance in km between known landmarks', () => {
      // Geneva, NY to Watkins Glen, NY: ~55.0 km (Haversine great-circle: ~54.95 km)
      const geneva = { latitude: 42.868, longitude: -76.980 };
      const watkinsGlen = { latitude: 42.380, longitude: -76.874 };

      const distance = calculateDistanceKm(geneva, watkinsGlen);
      expect(distance).toBeCloseTo(55.0, 1);
    });

    it('supports both { latitude, longitude } and { lat, lng } coordinate formats', () => {
      const p1 = { lat: 42.868, lng: -76.980 };
      const p2 = { lat: 42.380, lng: -76.874 };
      const p3 = { latitude: 42.380, longitude: -76.874 };

      expect(calculateDistanceKm(p1, p2)).toBeCloseTo(55.0, 1);
      expect(calculateDistanceKm(p1, p3)).toBeCloseTo(55.0, 1);
    });

    it('correctly discriminates viewport distance threshold of 5 km', () => {
      const center = { latitude: 42.7000, longitude: -76.9000 };
      // Small shift (~3.0 km north)
      const nearPoint = { latitude: 42.7270, longitude: -76.9000 };
      // Larger shift (~7.0 km north)
      const farPoint = { latitude: 42.7630, longitude: -76.9000 };

      const nearDistance = calculateDistanceKm(center, nearPoint);
      const farDistance = calculateDistanceKm(center, farPoint);

      expect(nearDistance).toBeLessThan(5);
      expect(farDistance).toBeGreaterThan(5);
    });

    it('calculates large global distances accurately (Equator to North Pole)', () => {
      const equator = { lat: 0, lng: 0 };
      const northPole = { lat: 90, lng: 0 };

      // Quarter circumference of Earth (~10,007.5 km)
      expect(calculateDistanceKm(equator, northPole)).toBeCloseTo(10007.5, 0);
    });

    it('handles missing or invalid coordinate fields gracefully', () => {
      expect(calculateDistanceKm({} as any, { lat: 42.7, lng: -76.9 })).toBeNaN();
      expect(calculateDistanceKm(undefined as any, { lat: 42.7, lng: -76.9 })).toBeNaN();
    });
  });
});
