import {
  getTripNavigationUrls,
  launchTripNavigation,
  isIOS,
  isStandalonePWA,
  TripStopWinery,
} from '@/lib/utils/trip-navigation';

describe('Trip Navigation Utilities', () => {
  const sampleStops: TripStopWinery[] = [
    {
      id: 'stop-1',
      name: 'Alpha Winery',
      latitude: 38.3001,
      longitude: -122.2991,
      address: '100 Alpha Rd, Napa, CA',
    },
    {
      id: 'stop-2',
      name: 'Beta Vineyards',
      latitude: 38.4002,
      longitude: -122.3992,
      address: '200 Beta Hwy, St Helena, CA',
    },
    {
      id: 'stop-3',
      name: 'Gamma Cellars',
      latitude: 38.5003,
      longitude: -122.4993,
      address: '300 Gamma Trail, Calistoga, CA',
    },
  ];

  describe('getTripNavigationUrls', () => {
    it('should generate Google Maps URL omitting explicit origin so it defaults to device current GPS location', () => {
      const urls = getTripNavigationUrls(sampleStops);
      expect(urls.google).toContain('https://www.google.com/maps/dir/?api=1');
      expect(urls.google).not.toContain('origin=');
      // Destination should be the final stop
      expect(urls.google).toContain('destination=38.5003%2C-122.4993');
      // Waypoints should be intermediate stops separated by pipe
      expect(urls.google).toContain('waypoints=38.3001%2C-122.2991%7C38.4002%2C-122.3992');
    });

    it('should generate single stop Google Maps URL without waypoints', () => {
      const urls = getTripNavigationUrls([sampleStops[0]]);
      expect(urls.google).toContain('https://www.google.com/maps/dir/?api=1');
      expect(urls.google).toContain('destination=38.3001%2C-122.2991');
      expect(urls.google).not.toContain('waypoints=');
    });

    it('should generate Apple Maps URL without upfront in-app origin coordinate', () => {
      const urls = getTripNavigationUrls(sampleStops);
      expect(urls.apple).toMatch(/^https:\/\/maps\.apple\.com\//);
      expect(urls.apple).toContain('daddr=38.5003,-122.4993');
      expect(urls.apple).not.toContain('saddr=');
    });

    it('should generate Waze URL pointing to the first stop', () => {
      const urls = getTripNavigationUrls(sampleStops);
      expect(urls.waze).toContain('https://waze.com/ul');
      expect(urls.waze).toContain('ll=38.3001,-122.2991');
      expect(urls.waze).toContain('navigate=yes');
    });

    it('should throw an error or handle empty stops array gracefully', () => {
      expect(() => getTripNavigationUrls([])).toThrow('Trip navigation requires at least one stop');
    });
  });

  describe('isIOS', () => {
    it('should detect iPhone user agent', () => {
      const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1';
      expect(isIOS(ua)).toBe(true);
    });

    it('should detect iPad user agent', () => {
      const ua = 'Mozilla/5.0 (iPad; CPU OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1';
      expect(isIOS(ua)).toBe(true);
    });

    it('should return false for Android or desktop user agents', () => {
      const androidUA = 'Mozilla/5.0 (Linux; Android 13; SM-S901U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36';
      const desktopUA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36';
      expect(isIOS(androidUA)).toBe(false);
      expect(isIOS(desktopUA)).toBe(false);
    });
  });

  describe('isStandalonePWA', () => {
    it('should detect standalone mode when navigator.standalone is true (iOS Safari)', () => {
      const mockWindow = {
        navigator: { standalone: true },
        matchMedia: () => ({ matches: false }),
      } as unknown as Window;
      expect(isStandalonePWA(mockWindow)).toBe(true);
    });

    it('should detect standalone mode when matchMedia matches display-mode: standalone', () => {
      const mockWindow = {
        navigator: { standalone: false },
        matchMedia: (query: string) => ({
          matches: query === '(display-mode: standalone)',
        }),
      } as unknown as Window;
      expect(isStandalonePWA(mockWindow)).toBe(true);
    });

    it('should return false for standard browser context', () => {
      const mockWindow = {
        navigator: { standalone: false },
        matchMedia: () => ({ matches: false }),
      } as unknown as Window;
      expect(isStandalonePWA(mockWindow)).toBe(false);
    });
  });

  describe('launchTripNavigation', () => {
    it('should execute navigation immediately without calling navigator.geolocation', () => {
      const geolocationSpy = jest.fn();
      const originalGeolocation = global.navigator.geolocation;
      Object.defineProperty(global.navigator, 'geolocation', {
        value: { getCurrentPosition: geolocationSpy },
        configurable: true,
      });

      const navigateFn = jest.fn();
      launchTripNavigation('apple', sampleStops, { navigateFn });

      expect(geolocationSpy).not.toHaveBeenCalled();
      expect(navigateFn).toHaveBeenCalledTimes(1);
      expect(navigateFn).toHaveBeenCalledWith(expect.stringContaining('maps.apple.com'));

      Object.defineProperty(global.navigator, 'geolocation', {
        value: originalGeolocation,
        configurable: true,
      });
    });

    it('should dispatch to google navigation when requested', () => {
      const navigateFn = jest.fn();
      launchTripNavigation('google', sampleStops, { navigateFn });
      expect(navigateFn).toHaveBeenCalledWith(expect.stringContaining('google.com/maps/dir'));
    });

    it('should dispatch to waze navigation when requested', () => {
      const navigateFn = jest.fn();
      launchTripNavigation('waze', sampleStops, { navigateFn });
      expect(navigateFn).toHaveBeenCalledWith(expect.stringContaining('waze.com/ul'));
    });
  });
});
