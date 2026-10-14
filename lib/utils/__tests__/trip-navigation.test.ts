import {
  formatWineryDestination,
  generateTripNavigationUrl,
  NAVIGATION_PROVIDERS,
  NavigationProvider,
} from '../trip-navigation';
import { createMockWinery } from '@/lib/test-utils/fixtures';
import { GooglePlaceId, WineryDbId } from '@/lib/types';

describe('trip-navigation utility', () => {
  const winery1 = createMockWinery({
    id: 'place_1' as GooglePlaceId,
    dbId: 101 as WineryDbId,
    name: 'Dr. Konstantin Frank',
    address: '9749 Middle Rd, Hammondsport, NY',
    latitude: 42.44,
    longitude: -76.5,
  });

  const winery2 = createMockWinery({
    id: 'place_2' as GooglePlaceId,
    dbId: 102 as WineryDbId,
    name: 'Ravines Wine Cellars',
    address: '400 Barracks Rd, Geneva, NY',
    latitude: 42.86,
    longitude: -76.98,
  });

  const winery3 = createMockWinery({
    id: 'place_3' as GooglePlaceId,
    dbId: 103 as WineryDbId,
    name: 'Fox Run Vineyards',
    address: '670 Route 14, Penn Yan, NY',
    latitude: 42.58,
    longitude: -76.95,
  });

  describe('NAVIGATION_PROVIDERS', () => {
    it('defines supported navigation providers: google, apple, and waze', () => {
      expect(NAVIGATION_PROVIDERS).toEqual([
        { id: 'google', label: 'Google Maps' },
        { id: 'apple', label: 'Apple Maps' },
        { id: 'waze', label: 'Waze' },
      ]);
    });
  });

  describe('formatWineryDestination', () => {
    it('formats destination with name and address when both are present', () => {
      expect(formatWineryDestination(winery1)).toBe(
        'Dr. Konstantin Frank, 9749 Middle Rd, Hammondsport, NY'
      );
    });

    it('formats destination with name only when address is missing or empty', () => {
      const wineryWithoutAddress = createMockWinery({
        name: 'Ravines Wine Cellars',
        address: '',
      });
      expect(formatWineryDestination(wineryWithoutAddress)).toBe('Ravines Wine Cellars');
    });

    it('falls back to coordinates when name and address are both missing', () => {
      const wineryCoordsOnly = createMockWinery({
        name: '',
        address: '',
        latitude: 42.44,
        longitude: -76.5,
      });
      expect(formatWineryDestination(wineryCoordsOnly)).toBe('42.44,-76.5');
    });

    it('returns empty string when no destination information is present', () => {
      const emptyWinery = createMockWinery({
        name: '',
        address: '',
        latitude: undefined,
        longitude: undefined,
      });
      expect(formatWineryDestination(emptyWinery)).toBe('');
    });
  });

  describe('generateTripNavigationUrl', () => {
    it('returns empty string when wineries list is empty', () => {
      expect(generateTripNavigationUrl('google', [])).toBe('');
      expect(generateTripNavigationUrl('apple', [])).toBe('');
      expect(generateTripNavigationUrl('waze', [])).toBe('');
    });

    describe('Google Maps', () => {
      it('generates direction URL for a single winery omitting origin to use device location', () => {
        const url = generateTripNavigationUrl('google', [winery1]);
        const expectedDest = encodeURIComponent('Dr. Konstantin Frank, 9749 Middle Rd, Hammondsport, NY');
        expect(url).toBe(`https://www.google.com/maps/dir/?api=1&destination=${expectedDest}`);
        expect(url).not.toContain('origin=');
        expect(url).not.toContain('waypoints=');
      });

      it('generates direction URL with waypoints for multiple wineries', () => {
        const url = generateTripNavigationUrl('google', [winery1, winery2]);
        const expectedDest = encodeURIComponent('Ravines Wine Cellars, 400 Barracks Rd, Geneva, NY');
        const expectedWaypoint = encodeURIComponent('Dr. Konstantin Frank, 9749 Middle Rd, Hammondsport, NY');
        expect(url).toBe(
          `https://www.google.com/maps/dir/?api=1&destination=${expectedDest}&waypoints=${expectedWaypoint}`
        );
        expect(url).not.toContain('origin=');
      });

      it('joins intermediate stops with %7C when there are three or more wineries', () => {
        const url = generateTripNavigationUrl('google', [winery1, winery2, winery3]);
        const expectedDest = encodeURIComponent('Fox Run Vineyards, 670 Route 14, Penn Yan, NY');
        const wp1 = encodeURIComponent('Dr. Konstantin Frank, 9749 Middle Rd, Hammondsport, NY');
        const wp2 = encodeURIComponent('Ravines Wine Cellars, 400 Barracks Rd, Geneva, NY');
        expect(url).toBe(
          `https://www.google.com/maps/dir/?api=1&destination=${expectedDest}&waypoints=${wp1}%7C${wp2}`
        );
        expect(url).not.toContain('origin=');
      });
    });

    describe('Apple Maps', () => {
      it('generates Apple Maps URL directing to the first trip stop omitting saddr', () => {
        const url = generateTripNavigationUrl('apple', [winery1]);
        const expectedDest = encodeURIComponent('Dr. Konstantin Frank, 9749 Middle Rd, Hammondsport, NY');
        expect(url).toBe(`https://maps.apple.com/?daddr=${expectedDest}&dirflg=d`);
        expect(url).not.toContain('saddr=');
      });

      it('directs to the first trip stop when multiple wineries are provided', () => {
        const url = generateTripNavigationUrl('apple', [winery1, winery2, winery3]);
        const expectedFirstStop = encodeURIComponent('Dr. Konstantin Frank, 9749 Middle Rd, Hammondsport, NY');
        expect(url).toBe(`https://maps.apple.com/?daddr=${expectedFirstStop}&dirflg=d`);
        expect(url).not.toContain('saddr=');
      });
    });

    describe('Waze', () => {
      it('generates coordinate navigation URL when first winery has latitude and longitude', () => {
        const url = generateTripNavigationUrl('waze', [winery1, winery2]);
        expect(url).toBe('https://waze.com/ul?ll=42.44,-76.5&navigate=yes');
      });

      it('falls back to search query navigation URL when first winery lacks coordinates', () => {
        const wineryNoCoords = createMockWinery({
          name: 'Keuka Spring Vineyards',
          address: '243 Route 54, East Lake Rd, Penn Yan, NY',
          latitude: undefined,
          longitude: undefined,
        });
        const url = generateTripNavigationUrl('waze', [wineryNoCoords]);
        const expectedQuery = encodeURIComponent('Keuka Spring Vineyards, 243 Route 54, East Lake Rd, Penn Yan, NY');
        expect(url).toBe(`https://waze.com/ul?q=${expectedQuery}&navigate=yes`);
      });
    });

    describe('Fallback Handling', () => {
      it('falls back to Google Maps when an unrecognized provider string is passed', () => {
        const url = generateTripNavigationUrl('unknown' as NavigationProvider, [winery1]);
        const expectedDest = encodeURIComponent('Dr. Konstantin Frank, 9749 Middle Rd, Hammondsport, NY');
        expect(url).toBe(`https://www.google.com/maps/dir/?api=1&destination=${expectedDest}`);
      });
    });
  });
});