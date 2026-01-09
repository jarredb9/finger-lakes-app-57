import { standardizeWineryData } from '../winery';
import { createMockWinery, createMockVisitWithWinery, createMockMapMarkerRpc } from '@/lib/test-utils/fixtures';
import { Winery, MapMarkerRpc, WineryDbId } from '@/lib/types';

describe('standardizeWineryData', () => {
  it('clears existing visits when source explicitly sets user_visited to false', () => {
    // 1. Setup: An existing winery in the local cache that has visits (The "Ghost" state)
    const existingWinery: Winery = {
      ...createMockWinery(),
      userVisited: true,
      visits: [createMockVisitWithWinery()]
    };

    // 2. Action: Received a lightweight MapMarker from RPC saying "Not Visited" (e.g., after deletion sync)
    const freshUpdate: MapMarkerRpc = {
      ...createMockMapMarkerRpc(),
      id: (existingWinery.dbId || 1) as WineryDbId,
      google_place_id: existingWinery.id,
      user_visited: false, // Server says NO
      on_wishlist: false,
      is_favorite: false,
    };

    // 3. Execution
    const result = standardizeWineryData(freshUpdate, existingWinery);

    // 4. Assertion
    expect(result).not.toBeNull();
    expect(result?.userVisited).toBe(false);
    expect(result?.visits).toEqual([]); // Critical: Must be empty array, not the preserved one
  });

  it('preserves existing visits when source does NOT contain user_visited (partial update)', () => {
    // 1. Setup: Existing winery with visits
    const existingVisit = createMockVisitWithWinery();
    const existingWinery: Winery = {
      ...createMockWinery(),
      userVisited: true,
      visits: [existingVisit]
    };

    // 2. Action: Received data from Google API (no user data)
    const googleUpdate = {
      place_id: existingWinery.id,
      name: existingWinery.name,
      geometry: { location: { lat: existingWinery.lat, lng: existingWinery.lng } },
      // No user_visited field
    };

    // 3. Execution
    // @ts-ignore - simulating partial Google object
    const result = standardizeWineryData(googleUpdate, existingWinery);

    // 4. Assertion
    expect(result?.userVisited).toBe(true); // Should preserve existing true
    expect(result?.visits).toHaveLength(1); // Should preserve existing visits
    expect(result?.visits?.[0].id).toBe(existingVisit.id);
  });

  it('correctly identifies RPC data even without trip_info', () => {
    // 1. Mock RPC data (WineryDetailsRpc without trip_info)
    const rpcData: any = {
      id: 123 as WineryDbId,
      google_place_id: 'ChIJ-mock-id',
      name: 'Mock Winery',
      address: '123 Fake St',
      lat: 42,
      lng: -76,
      visits: [{ id: 'visit-1', visit_date: '2023-01-01', user_review: 'Great!' }],
      opening_hours: { weekday_text: ['Mon: Open'] },
      user_visited: true,
      is_favorite: false,
      on_wishlist: false
    };

    // 2. Execution
    const result = standardizeWineryData(rpcData);

    // 3. Assertion
    expect(result).not.toBeNull();
    expect(result?.visits).toHaveLength(1);
    expect(result?.visits?.[0].user_review).toBe('Great!');
  });
});
