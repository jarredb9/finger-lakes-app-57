export type NavigationProvider = 'google' | 'apple' | 'waze';

export interface NavigationStop {
  name: string;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  location?: {
    latitude: number;
    longitude: number;
  } | null;
}

export function formatStopQuery(_stop: NavigationStop): string {
  throw new Error('Not implemented');
}

export function buildTripNavigationUrl(
  _provider: NavigationProvider,
  _stops: NavigationStop[]
): string {
  throw new Error('Not implemented');
}

export function launchTripNavigation(
  _provider: NavigationProvider,
  _stops: NavigationStop[],
  _windowRef?: Window | null
): void {
  throw new Error('Not implemented');
}
