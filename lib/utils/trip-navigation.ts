export type NavigationProvider = 'apple' | 'google' | 'waze';

export interface TripStopWinery {
  id?: string | number;
  name: string;
  latitude: number;
  longitude: number;
  address?: string;
}

export interface TripNavigationUrls {
  apple: string;
  google: string;
  waze: string;
}

export interface LaunchNavigationOptions {
  navigateFn?: (url: string) => void;
  openNewTab?: boolean;
}

export function isIOS(userAgent?: string): boolean {
  const ua = userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  return /iPad|iPhone|iPod/i.test(ua);
}

export function isStandalonePWA(windowObj?: Window | null): boolean {
  const win = windowObj ?? (typeof window !== 'undefined' ? window : null);
  if (!win) return false;
  const nav = win.navigator as unknown as { standalone?: boolean };
  if (nav && nav.standalone === true) {
    return true;
  }
  if (typeof win.matchMedia === 'function') {
    return win.matchMedia('(display-mode: standalone)').matches;
  }
  return false;
}

export function getTripNavigationUrls(tripStops: TripStopWinery[]): TripNavigationUrls {
  if (!tripStops || tripStops.length === 0) {
    throw new Error('Trip navigation requires at least one stop');
  }

  const destinationStop = tripStops[tripStops.length - 1];
  const destCoords = `${destinationStop.latitude},${destinationStop.longitude}`;
  const encodedDestCoords = encodeURIComponent(destCoords);

  let googleUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodedDestCoords}`;
  if (tripStops.length > 1) {
    const waypoints = tripStops
      .slice(0, tripStops.length - 1)
      .map((stop) => `${stop.latitude},${stop.longitude}`)
      .join('|');
    googleUrl += `&waypoints=${encodeURIComponent(waypoints)}`;
  }

  const appleUrl = `https://maps.apple.com/?daddr=${destCoords}`;

  const firstStop = tripStops[0];
  const wazeUrl = `https://waze.com/ul?ll=${firstStop.latitude},${firstStop.longitude}&navigate=yes`;

  return {
    apple: appleUrl,
    google: googleUrl,
    waze: wazeUrl,
  };
}

export function launchTripNavigation(
  provider: NavigationProvider,
  tripStops: TripStopWinery[],
  options: LaunchNavigationOptions = {}
): void {
  const urls = getTripNavigationUrls(tripStops);
  const targetUrl = urls[provider];

  if (options.navigateFn) {
    options.navigateFn(targetUrl);
    return;
  }

  if (typeof window !== 'undefined') {
    if (options.openNewTab) {
      window.open(targetUrl, '_blank', 'noopener,noreferrer');
    } else {
      window.location.href = targetUrl;
    }
  }
}
