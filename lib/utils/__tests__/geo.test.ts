import { calculateDistance, formatDistance } from '../geo';

describe('Geolocation Utils', () => {
  describe('calculateDistance', () => {
    it('should return 0 for identical coordinates', () => {
      const coord = { lat: 42.0, lng: -76.0 };
      expect(calculateDistance(coord, coord)).toBe(0);
    });

    it('should calculate distance correctly between known points (Finger Lakes approx)', () => {
      // Approximate distance between Ithaca (42.4440, -76.5019) and Geneva (42.8688, -76.9777)
      // Should be around 38-40 miles straight line
      const ithaca = { lat: 42.4440, lng: -76.5019 };
      const geneva = { lat: 42.8688, lng: -76.9777 };
      
      const distance = calculateDistance(ithaca, geneva);
      expect(distance).toBeGreaterThan(35);
      expect(distance).toBeLessThan(45);
    });
  });

  describe('formatDistance', () => {
    it('should format small distances as "< 0.1 mi"', () => {
      expect(formatDistance(0.05)).toBe('< 0.1 mi');
    });

    it('should format normal distances with 1 decimal place', () => {
      expect(formatDistance(12.3456)).toBe('12.3 mi');
      expect(formatDistance(5.0)).toBe('5.0 mi');
    });
  });
});
