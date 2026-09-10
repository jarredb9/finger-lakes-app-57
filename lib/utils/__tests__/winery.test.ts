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
      geometry: { location: { lat: existingWinery.latitude, lng: existingWinery.longitude } },
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

  it('standardizes Google V1 data with property-based coordinates and enrichment', () => {
    const v1Data = {
      id: 'place_v1',
      displayName: { text: 'V1 Winery' }, // This is actually GoogleV1Place structure, but standardizeWineryData uses source.name fallback
      name: 'V1 Winery', // standardizeWineryData expects source.name
      address: 'V1 Address',
      location: { latitude: 42.5, longitude: -76.5 },
      enrichment_tier: 'enriched',
      generative_summary: 'AI Summary',
      allows_dogs: true,
      primary_photo_reference: 'places/place_v1/photos/photo_abc',
      photo_references: ['places/place_v1/photos/photo_abc', 'places/place_v1/photos/photo_xyz'],
    };

    const result = standardizeWineryData(v1Data);

    expect(result?.id).toBe('place_v1');
    expect(result?.latitude).toBe(42.5);
    expect(result?.longitude).toBe(-76.5);
    expect(result?.enrichment_tier).toBe('enriched');
    expect(result?.generative_summary).toBe('AI Summary');
    expect(result?.allows_dogs).toBe(true);
    expect(result?.primary_photo_reference).toBe('places/place_v1/photos/photo_abc');
    expect(result?.photo_references).toEqual(['places/place_v1/photos/photo_abc', 'places/place_v1/photos/photo_xyz']);
  });

  it('standardizes accessibility_flags from database RPC as accessibility_options', () => {
    const dbRpcData = {
      id: 123 as WineryDbId,
      google_place_id: 'ChIJ-mock-id',
      name: 'Mock Winery',
      address: '123 Fake St',
      latitude: 42,
      longitude: -76,
      accessibility_flags: {
        wheelchairAccessibleParking: true,
        wheelchairAccessibleSeating: true,
        wheelchairAccessibleEntrance: true,
        wheelchairAccessibleRestroom: true
      }
    };

    const result = standardizeWineryData(dbRpcData);

    expect(result).not.toBeNull();
    expect(result?.accessibility_options).toEqual({
      wheelchairAccessibleParking: true,
      wheelchairAccessibleSeating: true,
      wheelchairAccessibleEntrance: true,
      wheelchairAccessibleRestroom: true
    });
  });

  it('derives freeParking boolean from subfields when freeParking is undefined', () => {
    const wineryWithFree = standardizeWineryData({
      id: 'mock_place',
      name: 'Mock',
      latitude: 42,
      longitude: -76,
      parking_options: {
        freeParkingLot: true,
      }
    });
    expect(wineryWithFree?.parking_options?.freeParking).toBe(true);

    const wineryWithGarageFree = standardizeWineryData({
      id: 'mock_place',
      name: 'Mock',
      latitude: 42,
      longitude: -76,
      parking_options: {
        freeGarageParking: true,
      }
    });
    expect(wineryWithGarageFree?.parking_options?.freeParking).toBe(true);

    const wineryWithPaid = standardizeWineryData({
      id: 'mock_place',
      name: 'Mock',
      latitude: 42,
      longitude: -76,
      parking_options: {
        paidParkingLot: true,
      }
    });
    expect(wineryWithPaid?.parking_options?.freeParking).toBe(false);

    const wineryWithGaragePaid = standardizeWineryData({
      id: 'mock_place',
      name: 'Mock',
      latitude: 42,
      longitude: -76,
      parking_options: {
        paidGarageParking: true,
      }
    });
    expect(wineryWithGaragePaid?.parking_options?.freeParking).toBe(false);

    const wineryWithExplicit = standardizeWineryData({
      id: 'mock_place',
      name: 'Mock',
      latitude: 42,
      longitude: -76,
      parking_options: {
        freeParking: false,
        freeParkingLot: true,
      }
    });
    expect(wineryWithExplicit?.parking_options?.freeParking).toBe(false); // Explicit overrides derivation
  });

  it('normalizes rating 0 and non-positive rating values to null', () => {
    const wineryWithZero = standardizeWineryData({
      id: 'mock_place_zero',
      name: 'Zero Rating Winery',
      latitude: 42,
      longitude: -76,
      rating: 0,
      userRatingCount: 0,
    });
    expect(wineryWithZero?.rating).toBeFalsy();
    expect(wineryWithZero?.userRatingCount).toBeFalsy();

    const wineryWithNegative = standardizeWineryData({
      id: 'mock_place_neg',
      name: 'Negative Rating Winery',
      latitude: 42,
      longitude: -76,
      rating: -1,
    });
    expect(wineryWithNegative?.rating).toBeFalsy();

    const wineryWithValid = standardizeWineryData({
      id: 'mock_place_valid',
      name: 'Valid Rating Winery',
      latitude: 42,
      longitude: -76,
      rating: 4.8,
      userRatingCount: 200,
    });
    expect(wineryWithValid?.rating).toBe(4.8);
    expect(wineryWithValid?.userRatingCount).toBe(200);

    // Merging with existing winery that had corrupted 0 rating
    const existingCorrupted = {
      ...wineryWithValid!,
      rating: 0,
      userRatingCount: 0,
    };
    const mergedUnrated = standardizeWineryData({
      id: 'mock_place_valid',
      name: 'Valid Rating Winery',
      latitude: 42,
      longitude: -76,
      rating: null,
      userRatingCount: null,
    }, existingCorrupted);
    expect(mergedUnrated?.rating).toBeNull();
    expect(mergedUnrated?.userRatingCount).toBeNull();
  });

  it('clears existing visits when source explicitly sets camelCase userVisited to false (ST-06)', () => {
    const existingWinery: Winery = {
      ...createMockWinery(),
      userVisited: true,
      visits: [createMockVisitWithWinery()],
    };

    const camelCaseUpdate = {
      id: existingWinery.id,
      name: existingWinery.name,
      latitude: existingWinery.latitude,
      longitude: existingWinery.longitude,
      userVisited: false,
    };

    const result = standardizeWineryData(camelCaseUpdate, existingWinery);

    expect(result).not.toBeNull();
    expect(result?.userVisited).toBe(false);
    expect(result?.visits).toEqual([]);
  });

  it('strictly coerces relational trip_id to a number upon standardization (ST-04)', () => {
    const sourceWithStringTripId = {
      id: 'ChIJ_mock_winery_id',
      name: 'Winery with string tripId',
      latitude: 42.5,
      longitude: -76.5,
      trip_id: '105' as any,
    };

    const result = standardizeWineryData(sourceWithStringTripId);

    expect(result?.trip_id).toBe(105);
    expect(typeof result?.trip_id).toBe('number');
  });

  it('standardizes place from Google location object with direct latitude/longitude properties (ST-05)', () => {
    const googlePlaceLike = {
      id: 'ChIJ_place_with_direct_coords',
      displayName: 'Direct Coords Winery',
      formattedAddress: '123 Main St',
      location: {
        latitude: 42.88,
        longitude: -76.99,
      },
    };

    const result = standardizeWineryData(googlePlaceLike);

    expect(result).not.toBeNull();
    expect(result?.latitude).toBe(42.88);
    expect(result?.longitude).toBe(-76.99);
  });
});

