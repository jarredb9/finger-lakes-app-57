import {
  NavigationStop,
  formatStopQuery,
  buildTripNavigationUrl,
  launchTripNavigation,
} from '../trip-navigation';

describe('trip-navigation utility', () => {
  const mockStop1: NavigationStop = {
    name: 'Dr. Konstantin Frank',
    address: '9749 Middle Rd, Hammondsport, NY',
    latitude: 42.44,
    longitude: -76.5,
  };

  const mockStop2: NavigationStop = {
    name: 'Ravines Wine Cellars',
    address: '400 Barracks Rd, Geneva, NY',
    location: {
      latitude: 42.85,
      longitude: -76.98,
    },
  };

  const mockStop3: NavigationStop = {
    name: 'Weis Vineyards',
    address: '10014 Day Rd, Hammondsport, NY',
    latitude: 42.46,
    longitude: -77.15,
  };

  describe('formatStopQuery', () => {
    it('formats stop with both name and address', () => {
      expect(formatStopQuery(mockStop1)).toBe('Dr. Konstantin Frank, 9749 Middle Rd, Hammondsport, NY');
    });

    it('formats stop with name only when address is omitted or null', () => {
      expect(formatStopQuery({ name: 'Ravines Wine Cellars' })).toBe('Ravines Wine Cellars');
      expect(formatStopQuery({ name: 'Ravines Wine Cellars', address: null })).toBe('Ravines Wine Cellars');
      expect(formatStopQuery({ name: 'Ravines Wine Cellars', address: '' })).toBe('Ravines Wine Cellars');
    });

    it('trims leading and trailing whitespace from query strings', () => {
      const stop: NavigationStop = {
        name: '  Heron Hill Winery  ',
        address: '  9301 Co Rd 76, Hammondsport, NY  ',
      };
      expect(formatStopQuery(stop)).toBe('Heron Hill Winery, 9301 Co Rd 76, Hammondsport, NY');
    });
  });

  describe('buildTripNavigationUrl', () => {
    it('returns empty string when stops array is empty', () => {
      expect(buildTripNavigationUrl('google', [])).toBe('');
      expect(buildTripNavigationUrl('apple', [])).toBe('');
      expect(buildTripNavigationUrl('waze', [])).toBe('');
    });

    describe('Google Maps', () => {
      it('builds single-destination url without origin parameter', () => {
        const urlStr = buildTripNavigationUrl('google', [mockStop1]);
        const url = new URL(urlStr);

        expect(url.origin + url.pathname).toBe('https://www.google.com/maps/dir/');
        expect(url.searchParams.get('api')).toBe('1');
        expect(url.searchParams.get('destination')).toBe('Dr. Konstantin Frank, 9749 Middle Rd, Hammondsport, NY');
        expect(url.searchParams.has('origin')).toBe(false);
      });

      it('builds multi-stop url setting last stop as destination and intermediate stops as waypoints without origin', () => {
        const urlStr = buildTripNavigationUrl('google', [mockStop1, mockStop2, mockStop3]);
        const url = new URL(urlStr);

        expect(url.origin + url.pathname).toBe('https://www.google.com/maps/dir/');
        expect(url.searchParams.get('api')).toBe('1');
        expect(url.searchParams.get('destination')).toBe('Weis Vineyards, 10014 Day Rd, Hammondsport, NY');
        expect(url.searchParams.get('waypoints')).toBe(
          'Dr. Konstantin Frank, 9749 Middle Rd, Hammondsport, NY|Ravines Wine Cellars, 400 Barracks Rd, Geneva, NY'
        );
        expect(url.searchParams.has('origin')).toBe(false);
      });
    });

    describe('Apple Maps', () => {
      it('builds single-stop url with daddr and no saddr parameter', () => {
        const urlStr = buildTripNavigationUrl('apple', [mockStop1]);
        const url = new URL(urlStr);

        expect(url.origin + url.pathname).toBe('https://maps.apple.com/');
        expect(url.searchParams.get('daddr')).toBe('Dr. Konstantin Frank, 9749 Middle Rd, Hammondsport, NY');
        expect(url.searchParams.has('saddr')).toBe(false);
      });

      it('chains daddr parameters for multi-stop navigation without saddr', () => {
        const urlStr = buildTripNavigationUrl('apple', [mockStop1, mockStop2]);
        const url = new URL(urlStr);

        expect(url.origin + url.pathname).toBe('https://maps.apple.com/');
        expect(url.searchParams.getAll('daddr')).toEqual([
          'Dr. Konstantin Frank, 9749 Middle Rd, Hammondsport, NY',
          'Ravines Wine Cellars, 400 Barracks Rd, Geneva, NY',
        ]);
        expect(url.searchParams.has('saddr')).toBe(false);
      });
    });

    describe('Waze', () => {
      it('builds navigation url targeting coordinates of first stop when latitude/longitude are present', () => {
        const urlStr = buildTripNavigationUrl('waze', [mockStop1, mockStop2]);
        const url = new URL(urlStr);

        expect(url.origin + url.pathname).toBe('https://waze.com/ul');
        expect(url.searchParams.get('ll')).toBe('42.44,-76.5');
        expect(url.searchParams.get('navigate')).toBe('yes');
      });

      it('supports coordinates nested inside location object', () => {
        const urlStr = buildTripNavigationUrl('waze', [mockStop2]);
        const url = new URL(urlStr);

        expect(url.origin + url.pathname).toBe('https://waze.com/ul');
        expect(url.searchParams.get('ll')).toBe('42.85,-76.98');
        expect(url.searchParams.get('navigate')).toBe('yes');
      });

      it('falls back to search query parameter q when coordinates are missing', () => {
        const stopWithoutCoords: NavigationStop = {
          name: 'Pleasant Valley Wine Co',
          address: '8260 Pleasant Valley Rd, Hammondsport, NY',
        };
        const urlStr = buildTripNavigationUrl('waze', [stopWithoutCoords]);
        const url = new URL(urlStr);

        expect(url.origin + url.pathname).toBe('https://waze.com/ul');
        expect(url.searchParams.get('q')).toBe('Pleasant Valley Wine Co, 8260 Pleasant Valley Rd, Hammondsport, NY');
        expect(url.searchParams.get('navigate')).toBe('yes');
        expect(url.searchParams.has('ll')).toBe(false);
      });
    });
  });

  describe('launchTripNavigation', () => {
    it('does not open window if stops array is empty', () => {
      const mockOpen = jest.fn();
      const mockWindow = { open: mockOpen } as unknown as Window;

      launchTripNavigation('google', [], mockWindow);
      expect(mockOpen).not.toHaveBeenCalled();
    });

    it('synchronously opens window with noopener and noreferrer using provided windowRef', () => {
      const mockOpen = jest.fn();
      const mockWindow = { open: mockOpen } as unknown as Window;

      launchTripNavigation('apple', [mockStop1], mockWindow);
      expect(mockOpen).toHaveBeenCalledTimes(1);
      expect(mockOpen).toHaveBeenCalledWith(
        expect.stringContaining('maps.apple.com'),
        '_blank',
        'noopener,noreferrer'
      );
    });

    it('defaults to global window when windowRef is omitted', () => {
      const originalOpen = window.open;
      window.open = jest.fn();

      try {
        launchTripNavigation('google', [mockStop1]);
        expect(window.open).toHaveBeenCalledWith(
          expect.stringContaining('google.com/maps/dir/'),
          '_blank',
          'noopener,noreferrer'
        );
      } finally {
        window.open = originalOpen;
      }
    });
  });
});
