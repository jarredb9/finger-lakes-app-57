import { MapMarkerRpc, WineryDbId, GooglePlaceId } from '@/lib/types';
import { createMockMapMarkerRpc } from '@/lib/test-utils/fixtures';

/**
 * Canonical mock wineries for E2E testing within the Finger Lakes region.
 */
export const MOCK_MARKERS: MapMarkerRpc[] = [
  createMockMapMarkerRpc({
    id: 1 as WineryDbId,
    google_place_id: 'ch-12345-mock-winery-1' as GooglePlaceId,
    name: 'Mock Winery One',
    address: '123 Vineyard Way, NY',
    latitude: 42.5,
    longitude: -76.8,
    google_rating: 4.8,
    user_rating_count: 120,
    allows_dogs: true,
    good_for_children: false,
    outdoor_seating: true,
    has_ev_charging: false,
    enrichment_tier: 'enriched',
  }),
  createMockMapMarkerRpc({
    id: 2 as WineryDbId,
    google_place_id: 'ch-67890-mock-winery-2' as GooglePlaceId,
    name: 'Vineyard of Illusion',
    address: '456 Mirage Ln, NY',
    latitude: 42.6,
    longitude: -76.9,
    google_rating: 4.7,
    user_rating_count: 85,
    allows_dogs: null,
    good_for_children: null,
    outdoor_seating: null,
    has_ev_charging: null,
    enrichment_tier: 'basic',
  }),
  createMockMapMarkerRpc({
    id: 3 as WineryDbId,
    google_place_id: 'ch-abcde-mock-winery-3' as GooglePlaceId,
    name: 'The Phantom Cellar',
    address: '789 Ethereal Rd, NY',
    latitude: 42.7,
    longitude: -77.0,
    google_rating: 4.9,
    user_rating_count: 210,
    allows_dogs: false,
    good_for_children: true,
    outdoor_seating: true,
    has_ev_charging: true,
    enrichment_tier: 'enriched',
  }),
];

/**
 * Normalizes any winery ID (numeric dbId or string google_place_id) into a canonical list of matching keys.
 */
export function getEquivalentWineryIds(
  rawId: string | number | undefined | null,
  markersList: MapMarkerRpc[] = MOCK_MARKERS
): string[] {
  if (!rawId) return ['ch-12345-mock-winery-1', '1', '999123'];
  const strId = String(rawId);

  if (strId === '1' || strId === 'ch-12345-mock-winery-1' || strId === '999123') {
    return ['ch-12345-mock-winery-1', '1', '999123'];
  }

  const marker = markersList.find(m => String(m.id) === strId || m.google_place_id === strId);
  if (marker) {
    const aliases = [strId, String(marker.id), marker.google_place_id];
    if (String(marker.id) === '1' || marker.google_place_id === 'ch-12345-mock-winery-1') {
      aliases.push('999123');
    }
    return Array.from(new Set(aliases));
  }

  return [strId];
}

/**
 * Extracts numeric latitude with Finger Lakes region fallback.
 */
export function markerLat(m?: Partial<MapMarkerRpc> | Record<string, unknown> | null): number {
  const obj = m as Record<string, unknown> | undefined | null;
  return Number(obj?.latitude ?? obj?.lat ?? 42.5);
}

/**
 * Extracts numeric longitude with Finger Lakes region fallback.
 */
export function markerLng(m?: Partial<MapMarkerRpc> | Record<string, unknown> | null): number {
  const obj = m as Record<string, unknown> | undefined | null;
  return Number(obj?.longitude ?? obj?.lng ?? -76.8);
}
