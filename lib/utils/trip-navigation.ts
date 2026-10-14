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

export function formatStopQuery(stop: NavigationStop): string {
  const name = stop.name ? stop.name.trim() : '';
  const address = stop.address ? stop.address.trim() : '';
  if (name && address) {
    return `${name}, ${address}`;
  }
  return name || address || '';
}

export function buildTripNavigationUrl(
  provider: NavigationProvider,
  stops: NavigationStop[]
): string {
  if (!stops || stops.length === 0) return '';

  if (provider === 'google') {
    const url = new URL('https://www.google.com/maps/dir/');
    url.searchParams.set('api', '1');
    const destination = formatStopQuery(stops[stops.length - 1]);
    url.searchParams.set('destination', destination);

    const intermediateStops = stops.slice(0, -1);
    if (intermediateStops.length > 0) {
      const waypoints = intermediateStops.map(formatStopQuery).join('|');
      url.searchParams.set('waypoints', waypoints);
    }
    return url.toString();
  }

  if (provider === 'apple') {
    const url = new URL('https://maps.apple.com/');
    stops.forEach((stop) => {
      url.searchParams.append('daddr', formatStopQuery(stop));
    });
    return url.toString();
  }

  if (provider === 'waze') {
    const url = new URL('https://waze.com/ul');
    const firstStop = stops[0];
    const lat = firstStop.latitude ?? firstStop.location?.latitude;
    const lng = firstStop.longitude ?? firstStop.location?.longitude;

    if (lat !== undefined && lat !== null && lng !== undefined && lng !== null) {
      url.searchParams.set('ll', `${lat},${lng}`);
    } else {
      url.searchParams.set('q', formatStopQuery(firstStop));
    }
    url.searchParams.set('navigate', 'yes');
    return url.toString();
  }

  return '';
}

export function launchTripNavigation(
  provider: NavigationProvider,
  stops: NavigationStop[],
  windowRef?: Window | null
): void {
  if (!stops || stops.length === 0) return;
  const url = buildTripNavigationUrl(provider, stops);
  if (!url) return;

  const targetWindow =
    windowRef !== undefined ? windowRef : typeof window !== 'undefined' ? window : null;
  targetWindow?.open(url, '_blank', 'noopener,noreferrer');
}
