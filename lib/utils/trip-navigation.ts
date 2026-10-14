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

export function isIOS(_userAgent?: string): boolean {
  throw new Error('Not implemented');
}

export function isStandalonePWA(_windowObj?: Window | null): boolean {
  throw new Error('Not implemented');
}

export function getTripNavigationUrls(_tripStops: TripStopWinery[]): TripNavigationUrls {
  throw new Error('Not implemented');
}

export function launchTripNavigation(
  _provider: NavigationProvider,
  _tripStops: TripStopWinery[],
  _options?: LaunchNavigationOptions
): void {
  throw new Error('Not implemented');
}
