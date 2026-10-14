import * as mapUtilsModule from '../map-utils';

const {
  coordToMapbox,
  mapboxToCoord,
  isCoordinateInBounds,
  getCoordinatesFromBounds,
  calculateDistanceKm,
} = mapUtilsModule;

export interface GeoLocationCoord {
  latitude: number;
  longitude: number;
}

export interface TestNavigationStop {
  id?: string;
  name?: string;
  latitude?: number;
  longitude?: number;
  winery?: {
    name: string;
    latitude: number;
    longitude: number;
  };
}

export type NavigationProvider = 'google' | 'apple' | 'waze';

type MapUtilsWithNav = typeof mapUtilsModule & {
  getTripNavigationUrl?: (
    provider: NavigationProvider,
    stops: TestNavigationStop[],
    userLocation?: GeoLocationCoord | null
  ) => string;
  getAppStoreUrl?: (
    provider: NavigationProvider,
    platform: 'ios' | 'android'
  ) => string;
  isIosStandalonePwa?: (
    customNavigator?: unknown,
    customWindow?: unknown
  ) => boolean;
  launchTripNavigation?: (
    provider: NavigationProvider,
    stops: TestNavigationStop[],
    options?: {
      userLocation?: GeoLocationCoord | null;
      platform?: 'ios' | 'android';
      isStandalone?: boolean;
      navigate?: (url: string) => void;
    }
  ) => void;
};

const {
  getTripNavigationUrl,
  getAppStoreUrl,
  isIosStandalonePwa,
  launchTripNavigation,
} = mapUtilsModule as MapUtilsWithNav;

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
        getNorthEast: () => ({ lat: 43.0, lng: -76.0 }),
      };
      expect(getCoordinatesFromBounds(bounds)).toEqual({
        swLat: 42.0,
        swLng: -77.0,
        neLat: 43.0,
        neLng: -76.0,
      });
    });

    it('extracts coords from plain literal bounds', () => {
      const bounds = { west: -77.0, south: 42.0, east: -76.0, north: 43.0 };
      expect(getCoordinatesFromBounds(bounds)).toEqual({
        swLat: 42.0,
        swLng: -77.0,
        neLat: 43.0,
        neLng: -76.0,
      });
    });
  });

  describe('calculateDistanceKm', () => {
    it('returns 0 when coordinates are identical', () => {
      const coord = { latitude: 42.7, longitude: -76.9 };
      expect(calculateDistanceKm(coord, coord)).toBe(0);
    });

    it('calculates accurate Haversine distance in km between known landmarks', () => {
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
      const nearPoint = { latitude: 42.7270, longitude: -76.9000 };
      const farPoint = { latitude: 42.7630, longitude: -76.9000 };

      const nearDistance = calculateDistanceKm(center, nearPoint);
      const farDistance = calculateDistanceKm(center, farPoint);

      expect(nearDistance).toBeLessThan(5);
      expect(farDistance).toBeGreaterThan(5);
    });

    it('calculates large global distances accurately (Equator to North Pole)', () => {
      const equator = { lat: 0, lng: 0 };
      const northPole = { lat: 90, lng: 0 };

      expect(calculateDistanceKm(equator, northPole)).toBeCloseTo(10007.5, 0);
    });

    it('handles missing or invalid coordinate fields gracefully', () => {
      expect(calculateDistanceKm({} as any, { lat: 42.7, lng: -76.9 })).toBeNaN();
      expect(calculateDistanceKm(undefined as any, { lat: 42.7, lng: -76.9 })).toBeNaN();
    });
  });

  describe('Trip Navigation Utilities (Issue #63)', () => {
    const singleStop: TestNavigationStop[] = [
      { id: '1', name: 'Boundary Breaks', latitude: 42.6186, longitude: -76.8824 },
    ];

    const multiStops: TestNavigationStop[] = [
      { id: '1', name: 'Boundary Breaks', latitude: 42.6186, longitude: -76.8824 },
      { id: '2', name: 'Dr. Konstantin Frank', latitude: 42.5028, longitude: -77.1601 },
      { id: '3', name: 'Weis Vineyards', latitude: 42.4411, longitude: -77.1264 },
    ];

    const nestedStops: TestNavigationStop[] = [
      {
        id: '1',
        winery: { name: 'Boundary Breaks', latitude: 42.6186, longitude: -76.8824 },
      },
      {
        id: '2',
        winery: { name: 'Dr. Konstantin Frank', latitude: 42.5028, longitude: -77.1601 },
      },
    ];

    describe('getTripNavigationUrl', () => {
      it('builds Google Maps turn-by-turn navigation URL for single stop without origin', () => {
        const url = getTripNavigationUrl!('google', singleStop);
        expect(url).toMatch(/google\.com\/maps\/dir/);
        expect(url).toContain('api=1');
        expect(url).toMatch(/destination=42\.6186%2C-76\.8824|destination=42\.6186,-76\.8824/);
        expect(url).not.toContain('origin=');
      });

      it('builds Google Maps navigation URL with waypoints for multiple stops', () => {
        const url = getTripNavigationUrl!('google', multiStops);
        expect(url).toMatch(/google\.com\/maps\/dir/);
        expect(url).toMatch(/destination=42\.4411%2C-77\.1264|destination=42\.4411,-77\.1264/);
        expect(url).toContain('waypoints=');
        expect(url).toMatch(/42\.6186.*42\.5028/);
        expect(url).not.toContain('origin=');
      });

      it('includes origin in Google Maps URL only when userLocation is explicitly provided', () => {
        const explicitLocation: GeoLocationCoord = { latitude: 42.4433, longitude: -76.5019 };
        const url = getTripNavigationUrl!('google', singleStop, explicitLocation);
        expect(url).toMatch(/origin=42\.4433%2C-76\.5019|origin=42\.4433,-76\.5019/);
      });

      it('builds Apple Maps URL for single stop omitting origin so native app uses current GPS', () => {
        const url = getTripNavigationUrl!('apple', singleStop);
        expect(url).toMatch(/^maps:\/\/|https:\/\/maps\.apple\.com/);
        expect(url).toMatch(/daddr=42\.6186.*-76\.8824/);
        expect(url).not.toContain('saddr=');
      });

      it('includes saddr in Apple Maps URL when userLocation is explicitly provided', () => {
        const explicitLocation: GeoLocationCoord = { latitude: 42.4433, longitude: -76.5019 };
        const url = getTripNavigationUrl!('apple', singleStop, explicitLocation);
        expect(url).toMatch(/saddr=42\.4433.*-76\.5019/);
      });

      it('builds Waze navigation URL targeting the next stop coordinate', () => {
        const url = getTripNavigationUrl!('waze', singleStop);
        expect(url).toMatch(/waze\.com\/ul|waze:\/\//);
        expect(url).toMatch(/ll=42\.6186.*-76\.8824/);
        expect(url).toContain('navigate=yes');
      });

      it('correctly handles stops with nested winery coordinates', () => {
        const url = getTripNavigationUrl!('google', nestedStops);
        expect(url).toMatch(/destination=42\.5028.*-77\.1601/);
        expect(url).toMatch(/waypoints=.*42\.6186.*-76\.8824/);
      });

      it('returns empty string or handles safely when stops list is empty', () => {
        const url = getTripNavigationUrl!('google', []);
        expect(url).toBe('');
      });
    });

    describe('getAppStoreUrl', () => {
      it('returns Apple App Store URL for Google Maps on iOS', () => {
        const url = getAppStoreUrl!('google', 'ios');
        expect(url).toContain('apps.apple.com');
        expect(url).toContain('google-maps');
      });

      it('returns Google Play Store URL for Google Maps on Android', () => {
        const url = getAppStoreUrl!('google', 'android');
        expect(url).toContain('play.google.com/store/apps');
        expect(url).toContain('com.google.android.apps.maps');
      });

      it('returns Apple Maps link for iOS and web fallback for Android', () => {
        const iosUrl = getAppStoreUrl!('apple', 'ios');
        const androidUrl = getAppStoreUrl!('apple', 'android');
        expect(iosUrl).toMatch(/apps\.apple\.com|maps\.apple\.com/);
        expect(androidUrl).toContain('maps.apple.com');
      });

      it('returns correct App Store and Play Store URLs for Waze', () => {
        const iosUrl = getAppStoreUrl!('waze', 'ios');
        const androidUrl = getAppStoreUrl!('waze', 'android');
        expect(iosUrl).toContain('apps.apple.com');
        expect(iosUrl).toContain('waze');
        expect(androidUrl).toContain('play.google.com/store/apps');
        expect(androidUrl).toContain('com.waze');
      });
    });

    describe('isIosStandalonePwa', () => {
      it('returns true when navigator.standalone is true (iOS WebKit standalone PWA)', () => {
        const mockNav = { standalone: true, userAgent: 'iPhone' };
        expect(isIosStandalonePwa!(mockNav)).toBe(true);
      });

      it('returns true when display-mode: standalone matches on iOS device', () => {
        const mockNav = { standalone: false, userAgent: 'iPad; CPU OS 16_5' };
        const mockWin = {
          matchMedia: jest.fn().mockImplementation((query: string) => ({
            matches: query.includes('standalone'),
          })),
        };
        expect(isIosStandalonePwa!(mockNav, mockWin)).toBe(true);
      });

      it('returns false for standard Safari browser on iOS', () => {
        const mockNav = { standalone: false, userAgent: 'iPhone; CPU iPhone OS 16_5 like Mac OS X' };
        const mockWin = {
          matchMedia: jest.fn().mockReturnValue({ matches: false }),
        };
        expect(isIosStandalonePwa!(mockNav, mockWin)).toBe(false);
      });

      it('returns false for Android or desktop browsers', () => {
        const mockAndroidNav = { standalone: false, userAgent: 'Mozilla/5.0 (Linux; Android 13)' };
        const mockDesktopNav = { standalone: false, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)' };
        expect(isIosStandalonePwa!(mockAndroidNav)).toBe(false);
        expect(isIosStandalonePwa!(mockDesktopNav)).toBe(false);
      });

      it('handles undefined or SSR environment safely without crashing', () => {
        expect(isIosStandalonePwa!(undefined, undefined)).toBe(false);
      });
    });

    describe('launchTripNavigation', () => {
      it('synchronously invokes navigate callback without waiting for async geolocation', () => {
        const mockNavigate = jest.fn();
        launchTripNavigation!('google', singleStop, {
          navigate: mockNavigate,
        });
        expect(mockNavigate).toHaveBeenCalledTimes(1);
        expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining('google.com/maps'));
      });

      it('uses maps:// protocol or direct link when standalone iOS PWA is detected', () => {
        const mockNavigate = jest.fn();
        launchTripNavigation!('apple', singleStop, {
          navigate: mockNavigate,
          platform: 'ios',
          isStandalone: true,
        });
        expect(mockNavigate).toHaveBeenCalledTimes(1);
        expect(mockNavigate).toHaveBeenCalledWith(expect.stringMatching(/^maps:\/\/|https:\/\/maps\.apple\.com/));
      });
    });
  });
});
