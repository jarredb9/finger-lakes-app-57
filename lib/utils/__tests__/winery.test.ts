import {
  standardizeWineryData,
  isRecord,
  isGoogleWinery,
  isMapMarkerRpc,
  isWineryDetailsRpc,
  isRawDbWinery,
  parseOpeningHoursJson,
  parseParkingOptionsJson,
  parseAccessibilityOptionsJson,
} from '../winery';
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

describe('Winery Type Guards & Invariant Protection (Issue #53 - Red Phase)', () => {
  describe('isRecord', () => {
    it('returns false for null and undefined', () => {
      expect(isRecord(null)).toBe(false);
      expect(isRecord(undefined)).toBe(false);
    });

    it('returns false for primitives (numbers, strings, booleans, symbols)', () => {
      expect(isRecord(0)).toBe(false);
      expect(isRecord(42)).toBe(false);
      expect(isRecord(-1)).toBe(false);
      expect(isRecord(NaN)).toBe(false);
      expect(isRecord('')).toBe(false);
      expect(isRecord('winery')).toBe(false);
      expect(isRecord(true)).toBe(false);
      expect(isRecord(false)).toBe(false);
      expect(isRecord(Symbol('test'))).toBe(false);
    });

    it('returns false for arrays', () => {
      expect(isRecord([])).toBe(false);
      expect(isRecord([1, 2, 3])).toBe(false);
      expect(isRecord([{ a: 1 }])).toBe(false);
    });

    it('returns false for functions', () => {
      expect(isRecord(() => {})).toBe(false);
      expect(isRecord(function() {})).toBe(false);
    });

    it('returns true for plain objects and dictionary records', () => {
      expect(isRecord({})).toBe(true);
      expect(isRecord({ id: 1, name: 'Test' })).toBe(true);
      expect(isRecord(Object.create(null))).toBe(true);
    });
  });

  describe('isGoogleWinery', () => {
    it('returns false on null and undefined without throwing TypeError', () => {
      expect(() => isGoogleWinery(null)).not.toThrow();
      expect(isGoogleWinery(null)).toBe(false);

      expect(() => isGoogleWinery(undefined)).not.toThrow();
      expect(isGoogleWinery(undefined)).toBe(false);
    });

    it('returns false on primitives without throwing TypeError', () => {
      expect(() => isGoogleWinery(0)).not.toThrow();
      expect(isGoogleWinery(0)).toBe(false);

      expect(() => isGoogleWinery(42)).not.toThrow();
      expect(isGoogleWinery(42)).toBe(false);

      expect(() => isGoogleWinery('ChIJ_test_id')).not.toThrow();
      expect(isGoogleWinery('ChIJ_test_id')).toBe(false);

      expect(() => isGoogleWinery(true)).not.toThrow();
      expect(isGoogleWinery(true)).toBe(false);
    });

    it('returns false on arrays without throwing TypeError', () => {
      expect(() => isGoogleWinery([])).not.toThrow();
      expect(isGoogleWinery([])).toBe(false);

      expect(() => isGoogleWinery([{ place_id: 'x' }])).not.toThrow();
      expect(isGoogleWinery([{ place_id: 'x' }])).toBe(false);
    });

    it('returns false on malformed or incomplete objects', () => {
      expect(isGoogleWinery({})).toBe(false);
      expect(isGoogleWinery({ place_id: 'ChIJ123' })).toBe(false);
      expect(isGoogleWinery({ geometry: { location: { lat: 42, lng: -76 } } })).toBe(false);
    });

    it('returns true on valid GoogleWinery structure', () => {
      const valid = {
        place_id: 'ChIJ123',
        name: 'Valid Google Winery',
        geometry: {
          location: { lat: 42.44, lng: -77.16 }
        }
      };
      expect(isGoogleWinery(valid)).toBe(true);
    });
  });

  describe('isMapMarkerRpc', () => {
    it('returns false on null and undefined without throwing TypeError', () => {
      expect(() => isMapMarkerRpc(null)).not.toThrow();
      expect(isMapMarkerRpc(null)).toBe(false);

      expect(() => isMapMarkerRpc(undefined)).not.toThrow();
      expect(isMapMarkerRpc(undefined)).toBe(false);
    });

    it('returns false on primitives without throwing TypeError', () => {
      expect(() => isMapMarkerRpc(0)).not.toThrow();
      expect(isMapMarkerRpc(0)).toBe(false);

      expect(() => isMapMarkerRpc(42)).not.toThrow();
      expect(isMapMarkerRpc(42)).toBe(false);

      expect(() => isMapMarkerRpc('some-id')).not.toThrow();
      expect(isMapMarkerRpc('some-id')).toBe(false);

      expect(() => isMapMarkerRpc(true)).not.toThrow();
      expect(isMapMarkerRpc(true)).toBe(false);
    });

    it('returns false on arrays without throwing TypeError', () => {
      expect(() => isMapMarkerRpc([])).not.toThrow();
      expect(isMapMarkerRpc([])).toBe(false);
    });

    it('returns false on malformed objects missing required fields', () => {
      expect(isMapMarkerRpc({})).toBe(false);
      expect(isMapMarkerRpc({ google_place_id: 'ChIJ123' })).toBe(false);
      expect(isMapMarkerRpc({ latitude: 42.5, longitude: -76.5 })).toBe(false);
    });

    it('returns false if visits property exists (differentiating WineryDetailsRpc)', () => {
      const withVisits = {
        google_place_id: 'ChIJ123',
        latitude: 42.5,
        longitude: -76.5,
        visits: []
      };
      expect(isMapMarkerRpc(withVisits)).toBe(false);
    });

    it('returns true on valid MapMarkerRpc structure', () => {
      const valid = {
        google_place_id: 'ChIJ123',
        latitude: 42.5,
        longitude: -76.5
      };
      expect(isMapMarkerRpc(valid)).toBe(true);
    });
  });

  describe('isWineryDetailsRpc', () => {
    it('returns false on null and undefined without throwing TypeError', () => {
      expect(() => isWineryDetailsRpc(null)).not.toThrow();
      expect(isWineryDetailsRpc(null)).toBe(false);

      expect(() => isWineryDetailsRpc(undefined)).not.toThrow();
      expect(isWineryDetailsRpc(undefined)).toBe(false);
    });

    it('returns false on primitives without throwing TypeError', () => {
      expect(() => isWineryDetailsRpc(0)).not.toThrow();
      expect(isWineryDetailsRpc(0)).toBe(false);

      expect(() => isWineryDetailsRpc(42)).not.toThrow();
      expect(isWineryDetailsRpc(42)).toBe(false);

      expect(() => isWineryDetailsRpc('rpc-id')).not.toThrow();
      expect(isWineryDetailsRpc('rpc-id')).toBe(false);

      expect(() => isWineryDetailsRpc(true)).not.toThrow();
      expect(isWineryDetailsRpc(true)).toBe(false);
    });

    it('returns false on arrays without throwing TypeError', () => {
      expect(() => isWineryDetailsRpc([])).not.toThrow();
      expect(isWineryDetailsRpc([])).toBe(false);
    });

    it('returns false on malformed objects missing google id or visits', () => {
      expect(isWineryDetailsRpc({})).toBe(false);
      expect(isWineryDetailsRpc({ google_place_id: 'ChIJ123' })).toBe(false);
      expect(isWineryDetailsRpc({ visits: [] })).toBe(false);
    });

    it('returns true on valid WineryDetailsRpc structure', () => {
      const valid = {
        google_place_id: 'ChIJ123',
        visits: []
      };
      expect(isWineryDetailsRpc(valid)).toBe(true);
    });
  });

  describe('isRawDbWinery', () => {
    it('returns false on null and undefined without throwing TypeError', () => {
      expect(() => isRawDbWinery(null)).not.toThrow();
      expect(isRawDbWinery(null)).toBe(false);

      expect(() => isRawDbWinery(undefined)).not.toThrow();
      expect(isRawDbWinery(undefined)).toBe(false);
    });

    it('returns false on primitives without throwing TypeError', () => {
      expect(() => isRawDbWinery(0)).not.toThrow();
      expect(isRawDbWinery(0)).toBe(false);

      expect(() => isRawDbWinery(42)).not.toThrow();
      expect(isRawDbWinery(42)).toBe(false);

      expect(() => isRawDbWinery('db-winery')).not.toThrow();
      expect(isRawDbWinery('db-winery')).toBe(false);

      expect(() => isRawDbWinery(true)).not.toThrow();
      expect(isRawDbWinery(true)).toBe(false);
    });

    it('returns false on arrays without throwing TypeError', () => {
      expect(() => isRawDbWinery([])).not.toThrow();
      expect(isRawDbWinery([])).toBe(false);
    });

    it('returns false on objects matching GoogleWinery, MapMarkerRpc, or WineryDetailsRpc', () => {
      const google = {
        place_id: 'ChIJ123',
        geometry: { location: { lat: 42, lng: -76 } },
        created_at: '2026-01-01'
      };
      expect(isRawDbWinery(google)).toBe(false);

      const mapMarker = {
        google_place_id: 'ChIJ123',
        latitude: 42,
        longitude: -76,
        created_at: '2026-01-01'
      };
      expect(isRawDbWinery(mapMarker)).toBe(false);

      const wineryDetails = {
        google_place_id: 'ChIJ123',
        visits: [],
        created_at: '2026-01-01'
      };
      expect(isRawDbWinery(wineryDetails)).toBe(false);
    });

    it('returns false on objects missing created_at', () => {
      expect(isRawDbWinery({ id: 1, name: 'Db Winery Without Created At' })).toBe(false);
    });

    it('returns true on valid DbWinery with created_at and no higher-level source markers', () => {
      const valid = {
        id: 10,
        name: 'Raw DB Winery',
        created_at: '2026-01-01T00:00:00Z'
      };
      expect(isRawDbWinery(valid)).toBe(true);
    });
  });

  describe('standardizeWineryData non-object primitive resilience', () => {
    it('returns null safely without throwing TypeError when passed primitive numbers, strings, or booleans', () => {
      expect(() => standardizeWineryData(123 as any)).not.toThrow();
      expect(standardizeWineryData(123 as any)).toBeNull();

      expect(() => standardizeWineryData('invalid-source' as any)).not.toThrow();
      expect(standardizeWineryData('invalid-source' as any)).toBeNull();

      expect(() => standardizeWineryData(true as any)).not.toThrow();
      expect(standardizeWineryData(true as any)).toBeNull();
    });
  });

  describe('standardizeWineryData Branded IDs & Deep Invariants (Task 3 - Red Phase)', () => {
    describe('Google Place ID validation', () => {
      it('returns null on whitespace-only Google Place IDs', () => {
        const resultWhitespaceId = standardizeWineryData({
          id: '   ',
          name: 'Whitespace ID Winery',
          latitude: 42.5,
          longitude: -76.5,
        });
        expect(resultWhitespaceId).toBeNull();

        const resultWhitespaceGoogleId = standardizeWineryData({
          google_place_id: '   ',
          name: 'Whitespace Google ID Winery',
          latitude: 42.5,
          longitude: -76.5,
        });
        expect(resultWhitespaceGoogleId).toBeNull();
      });

      it('returns null on empty string Google Place IDs', () => {
        const resultEmptyId = standardizeWineryData({
          id: '',
          name: 'Empty ID Winery',
          latitude: 42.5,
          longitude: -76.5,
        });
        expect(resultEmptyId).toBeNull();

        const resultEmptyGoogleId = standardizeWineryData({
          google_place_id: '',
          name: 'Empty Google ID Winery',
          latitude: 42.5,
          longitude: -76.5,
        });
        expect(resultEmptyGoogleId).toBeNull();
      });
    });

    describe('DB ID resolution via toWineryDbId', () => {
      it('rejects float / non-integer dbId numbers', () => {
        const resultFloat = standardizeWineryData({
          id: 'valid_google_place_id',
          name: 'Float DB ID Winery',
          latitude: 42.5,
          longitude: -76.5,
          dbId: 1.5,
        });
        expect(resultFloat?.dbId).toBeUndefined();
      });

      it('rejects zero or negative dbId numbers', () => {
        const resultZero = standardizeWineryData({
          id: 'valid_google_place_id',
          name: 'Zero DB ID Winery',
          latitude: 42.5,
          longitude: -76.5,
          dbId: 0,
        });
        expect(resultZero?.dbId).toBeUndefined();

        const resultNegative = standardizeWineryData({
          id: 'valid_google_place_id',
          name: 'Negative DB ID Winery',
          latitude: 42.5,
          longitude: -76.5,
          dbId: -5,
        });
        expect(resultNegative?.dbId).toBeUndefined();
      });

      it('preserves valid positive integer dbId numbers', () => {
        const resultValid = standardizeWineryData({
          id: 'valid_google_place_id',
          name: 'Valid DB ID Winery',
          latitude: 42.5,
          longitude: -76.5,
          dbId: 42,
        });
        expect(resultValid?.dbId).toBe(42);
      });
    });

    describe('Store dictionary primitive sanitization', () => {
      it('sanitizes parking_options to null when passed primitive strings or numbers', () => {
        const resultStringParking = standardizeWineryData({
          id: 'valid_google_place_id',
          name: 'Primitive Parking Winery',
          latitude: 42.5,
          longitude: -76.5,
          parking_options: 'street' as any,
        });
        expect(resultStringParking?.parking_options).toBeNull();

        const resultNumberParking = standardizeWineryData({
          id: 'valid_google_place_id',
          name: 'Primitive Parking Winery',
          latitude: 42.5,
          longitude: -76.5,
          parkingOptions: 123 as any,
        });
        expect(resultNumberParking?.parking_options).toBeNull();
      });

      it('sanitizes accessibility_options and accessibility_flags to null when passed primitives', () => {
        const resultStringAccess = standardizeWineryData({
          id: 'valid_google_place_id',
          name: 'Primitive Accessibility Winery',
          latitude: 42.5,
          longitude: -76.5,
          accessibility_options: 'wheelchair' as any,
        });
        expect(resultStringAccess?.accessibility_options).toBeNull();

        const resultNumberAccess = standardizeWineryData({
          id: 'valid_google_place_id',
          name: 'Primitive Accessibility Winery',
          latitude: 42.5,
          longitude: -76.5,
          accessibility_flags: 456 as any,
        });
        expect(resultNumberAccess?.accessibility_options).toBeNull();
      });
    });

    describe('Enrichment tier domain union validation', () => {
      it('falls back to basic on unvetted / arbitrary tier strings when no existing tier', () => {
        const resultArbitrary = standardizeWineryData({
          id: 'valid_google_place_id',
          name: 'Custom Tier Winery',
          latitude: 42.5,
          longitude: -76.5,
          enrichment_tier: 'custom' as any,
        });
        expect(resultArbitrary?.enrichment_tier).toBe('basic');
      });

      it('falls back to existing valid tier on unvetted tier strings', () => {
        const existingFull = {
          ...createMockWinery(),
          enrichment_tier: 'full' as const,
        };
        const resultFallback = standardizeWineryData(
          {
            id: existingFull.id,
            name: existingFull.name,
            latitude: existingFull.latitude,
            longitude: existingFull.longitude,
            enrichment_tier: 'invalid_tier_string' as any,
          },
          existingFull
        );
        expect(resultFallback?.enrichment_tier).toBe('full');
      });
    });

    describe('Type guard tightening', () => {
      it('isGoogleWinery returns false for undefined place_id, empty string place_id, or whitespace place_id', () => {
        expect(isGoogleWinery({ place_id: undefined, geometry: undefined })).toBe(false);
        expect(isGoogleWinery({ place_id: '', geometry: { location: { lat: 42, lng: -76 } } })).toBe(false);
        expect(isGoogleWinery({ place_id: '   ', geometry: { location: { lat: 42, lng: -76 } } })).toBe(false);
        expect(isGoogleWinery({ place_id: 'valid_id', geometry: null })).toBe(false);
      });

      it('isMapMarkerRpc returns false for empty string or whitespace google_place_id', () => {
        expect(isMapMarkerRpc({ google_place_id: '', latitude: 42.5, longitude: -76.5 })).toBe(false);
        expect(isMapMarkerRpc({ google_place_id: '   ', latitude: 42.5, longitude: -76.5 })).toBe(false);
      });

      it('isWineryDetailsRpc returns false for empty string or whitespace google_place_id', () => {
        expect(isWineryDetailsRpc({ google_place_id: '', visits: [] })).toBe(false);
        expect(isWineryDetailsRpc({ google_place_id: '   ', visits: [] })).toBe(false);
      });
    });

    describe('Review timestamp parsing resilience', () => {
      it('parseReviewsJson returns time: 0 without throwing or producing NaN when publishTime is invalid date', () => {
        const result = standardizeWineryData({
          id: 'valid_google_place_id',
          name: 'Invalid Date Review Winery',
          latitude: 42.5,
          longitude: -76.5,
          reviews: [
            {
              author_name: 'Test Reviewer',
              rating: 5,
              publishTime: 'not-a-valid-date-string',
            },
          ],
        });
        expect(result?.reviews).toHaveLength(1);
        expect(result?.reviews?.[0].time).toBe(0);
        expect(Number.isNaN(result?.reviews?.[0].time)).toBe(false);
      });
    });
  });

  describe('Phase 5 Adversarial Red Phase: Boundary Parsers & Tightened RPC Guards', () => {
    describe('parseOpeningHoursJson Adversarial Red Phase', () => {
      it('returns undefined on undefined and null on null', () => {
        expect(parseOpeningHoursJson(undefined)).toBeUndefined();
        expect(parseOpeningHoursJson(null)).toBeNull();
      });

      it('rejects primitives (string, number, boolean, array) and returns null', () => {
        expect(parseOpeningHoursJson('open' as any)).toBeNull();
        expect(parseOpeningHoursJson(123 as any)).toBeNull();
        expect(parseOpeningHoursJson(true as any)).toBeNull();
        expect(parseOpeningHoursJson([] as any)).toBeNull();
      });

      it('filters out corrupt period items and invalid day ranges (0-6)', () => {
        // Missing open point
        const missingOpen = { periods: [{ close: { day: 1, time: '1700' } }] };
        expect(parseOpeningHoursJson(missingOpen)).toBeNull();

        // Corrupt open.day (string instead of number)
        const stringDay = {
          periods: [
            { open: { day: 'Monday' as any, time: '0900' }, close: { day: 1, time: '1700' } },
          ],
        };
        expect(parseOpeningHoursJson(stringDay)).toBeNull();

        // Out of bounds open.day (< 0 or > 6)
        const negativeDay = { periods: [{ open: { day: -1, time: '0900' } }] };
        expect(parseOpeningHoursJson(negativeDay)).toBeNull();

        const excessiveDay = { periods: [{ open: { day: 7, time: '0900' } }] };
        expect(parseOpeningHoursJson(excessiveDay)).toBeNull();

        // Out of bounds close.day
        const invalidClose = {
          periods: [
            { open: { day: 1, time: '0900' }, close: { day: 8, time: '1700' } },
          ],
        };
        expect(parseOpeningHoursJson(invalidClose)).toBeNull();

        // Point missing day completely
        const missingDayInPoint = { periods: [{ open: { time: '0900' } as any }] };
        expect(parseOpeningHoursJson(missingDayInPoint)).toBeNull();

        // Mixed valid and corrupt periods: discards corrupt ones, preserves valid ones
        const mixed = {
          periods: [
            { open: { day: 'Monday' as any } },
            { open: { day: 1, time: '0900' }, close: { day: 1, time: '1700' } },
            null,
            123,
            { open: { day: 8 } },
          ],
        };
        const resMixed = parseOpeningHoursJson(mixed);
        expect(resMixed).not.toBeNull();
        expect(resMixed?.periods).toHaveLength(1);
        expect(resMixed?.periods?.[0]?.open?.day).toBe(1);

        // Corrupt periods list with 0 valid periods sets periods to undefined
        const allCorrupt = {
          periods: [{ open: { day: 'invalid' as any } }, { invalid: true }],
          weekday_text: ['Mon: 9am - 5pm'],
        };
        const resAllCorrupt = parseOpeningHoursJson(allCorrupt);
        expect(resAllCorrupt).not.toBeNull();
        expect(resAllCorrupt?.periods).toBeUndefined();
        expect(resAllCorrupt?.weekday_text).toEqual(['Mon: 9am - 5pm']);

        // Valid 24/7 or closing-unspecified schedule (valid open, omitted close)
        const open247 = {
          periods: [{ open: { day: 0, time: '0000' } }],
        };
        const res247 = parseOpeningHoursJson(open247);
        expect(res247?.periods).toHaveLength(1);
        expect(res247?.periods?.[0]?.open?.day).toBe(0);
        expect(res247?.periods?.[0]?.close).toBeUndefined();
      });

      it('sanitizes weekday descriptions and drops non-string entries', () => {
        const corruptWeekday = {
          periods: [{ open: { day: 1, time: '0900' }, close: { day: 1, time: '1700' } }],
          weekday_text: ['Mon: 9-5', 123 as any, null as any, { text: 'Tue: 9-5' } as any, 'Wed: 9-5'],
        };
        const res = parseOpeningHoursJson(corruptWeekday);
        expect(res?.weekday_text).toEqual(['Mon: 9-5', 'Wed: 9-5']);
      });

      it('accepts alternative weekday description keys (weekdayDescriptions, weekday_descriptions)', () => {
        const altWeekday = {
          periods: [{ open: { day: 2, time: '1000' } }],
          weekdayDescriptions: ['Tue: 10am - 6pm', 456 as any],
        };
        const res = parseOpeningHoursJson(altWeekday);
        expect(res?.weekday_text).toEqual(['Tue: 10am - 6pm']);

        const altWeekdaySnake = {
          periods: [{ open: { day: 3, time: '1000' } }],
          weekday_descriptions: ['Wed: 10am - 6pm'],
        };
        const resSnake = parseOpeningHoursJson(altWeekdaySnake);
        expect(resSnake?.weekday_text).toEqual(['Wed: 10am - 6pm']);
      });

      it('returns null if both periods and weekday_text are empty or contain only invalid entries', () => {
        expect(parseOpeningHoursJson({ periods: [], weekday_text: [] })).toBeNull();
        expect(parseOpeningHoursJson({ periods: [{ invalid: true }], weekday_text: [123 as any] })).toBeNull();
        expect(parseOpeningHoursJson({ periods: [] })).toBeNull();
        expect(parseOpeningHoursJson({ weekday_text: [] })).toBeNull();
      });

      it('safely validates boolean open_now / openNow flag', () => {
        const withOpenNow = {
          periods: [{ open: { day: 1, time: '0900' } }],
          open_now: true,
        };
        expect(parseOpeningHoursJson(withOpenNow)?.open_now).toBe(true);

        const withOpenNowAlt = {
          periods: [{ open: { day: 1, time: '0900' } }],
          openNow: false,
        };
        expect(parseOpeningHoursJson(withOpenNowAlt)?.open_now).toBe(false);

        const withInvalidOpenNow = {
          periods: [{ open: { day: 1, time: '0900' } }],
          open_now: 'true' as any,
        };
        expect(parseOpeningHoursJson(withInvalidOpenNow)?.open_now).toBeUndefined();
      });
    });

    describe('parseParkingOptionsJson Adversarial Red Phase', () => {
      it('returns null on primitives, arrays, null, and undefined', () => {
        expect(parseParkingOptionsJson(null)).toBeNull();
        expect(parseParkingOptionsJson(undefined)).toBeNull();
        expect(parseParkingOptionsJson('free' as any)).toBeNull();
        expect(parseParkingOptionsJson(123 as any)).toBeNull();
        expect(parseParkingOptionsJson(true as any)).toBeNull();
        expect(parseParkingOptionsJson([] as any)).toBeNull();
      });

      it('returns null when input has no recognized parking attributes', () => {
        expect(parseParkingOptionsJson({})).toBeNull();
        expect(parseParkingOptionsJson({ someRandomProp: true })).toBeNull();
      });

      it('ignores non-boolean values for known flags', () => {
        expect(parseParkingOptionsJson({ freeParkingLot: 'true' as any, paidParkingLot: 1 as any })).toBeNull();
      });

      it('extracts known boolean flags and synthesizes freeParking attribute', () => {
        const valid = {
          freeParkingLot: true,
          paidStreetParking: false,
          valetParking: true,
        };
        const parsed = parseParkingOptionsJson(valid);
        expect(parsed).toEqual({
          freeParkingLot: true,
          paidStreetParking: false,
          freeParking: true,
        });
      });

      it('synthesizes freeParking: true if any free parking flag is true', () => {
        expect(parseParkingOptionsJson({ freeStreetParking: true })?.freeParking).toBe(true);
        expect(parseParkingOptionsJson({ freeGarageParking: true, paidParkingLot: true })?.freeParking).toBe(true);
      });

      it('synthesizes freeParking: false if any paid parking flag is true and no free parking flag is true', () => {
        expect(parseParkingOptionsJson({ paidParkingLot: true })?.freeParking).toBe(false);
        expect(parseParkingOptionsJson({ paidGarageParking: true, freeStreetParking: false })?.freeParking).toBe(false);
      });
    });

    describe('parseAccessibilityOptionsJson Adversarial Red Phase', () => {
      it('returns null on primitives, arrays, null, and undefined', () => {
        expect(parseAccessibilityOptionsJson(null)).toBeNull();
        expect(parseAccessibilityOptionsJson(undefined)).toBeNull();
        expect(parseAccessibilityOptionsJson('wheelchair' as any)).toBeNull();
        expect(parseAccessibilityOptionsJson(123 as any)).toBeNull();
        expect(parseAccessibilityOptionsJson(true as any)).toBeNull();
        expect(parseAccessibilityOptionsJson([] as any)).toBeNull();
      });

      it('returns null when input has no recognized accessibility attributes', () => {
        expect(parseAccessibilityOptionsJson({})).toBeNull();
        expect(parseAccessibilityOptionsJson({ otherFlag: true })).toBeNull();
      });

      it('ignores non-boolean values for known flags', () => {
        expect(parseAccessibilityOptionsJson({ wheelchairAccessibleEntrance: 'yes' as any })).toBeNull();
      });

      it('extracts known boolean accessibility flags', () => {
        const valid = {
          wheelchairAccessibleParking: true,
          wheelchairAccessibleEntrance: true,
          wheelchairAccessibleRestroom: false,
          wheelchairAccessibleSeating: true,
        };
        expect(parseAccessibilityOptionsJson(valid)).toEqual({
          wheelchairAccessibleParking: true,
          wheelchairAccessibleEntrance: true,
          wheelchairAccessibleRestroom: false,
          wheelchairAccessibleSeating: true,
        });
      });
    });

    describe('RPC Type Guard Tightening Adversarial Red Phase', () => {
      describe('isGoogleWinery tightening', () => {
        it('rejects objects without non-empty string name', () => {
          expect(isGoogleWinery({ place_id: 'ChIJ123', geometry: { location: { lat: 42, lng: -76 } } })).toBe(false);
          expect(isGoogleWinery({ place_id: 'ChIJ123', name: '', geometry: { location: { lat: 42, lng: -76 } } })).toBe(false);
          expect(isGoogleWinery({ place_id: 'ChIJ123', name: '   ', geometry: { location: { lat: 42, lng: -76 } } })).toBe(false);
          expect(isGoogleWinery({ place_id: 'ChIJ123', name: 123 as any, geometry: { location: { lat: 42, lng: -76 } } })).toBe(false);
        });

        it('rejects objects where geometry is not a record', () => {
          expect(isGoogleWinery({ place_id: 'ChIJ123', name: 'Winery', geometry: null })).toBe(false);
          expect(isGoogleWinery({ place_id: 'ChIJ123', name: 'Winery', geometry: 'coords' as any })).toBe(false);
          expect(isGoogleWinery({ place_id: 'ChIJ123', name: 'Winery', geometry: [] as any })).toBe(false);
        });

        it('accepts valid GoogleWinery with non-empty place_id, name, and record geometry', () => {
          expect(isGoogleWinery({ place_id: 'ChIJ123', name: 'Valid Google Winery', geometry: { location: { lat: 42, lng: -76 } } })).toBe(true);
        });
      });

      describe('isMapMarkerRpc tightening', () => {
        it('rejects objects without non-empty string name', () => {
          expect(isMapMarkerRpc({ google_place_id: 'ChIJ123', latitude: 42.5, longitude: -76.5 })).toBe(false);
          expect(isMapMarkerRpc({ google_place_id: 'ChIJ123', name: '', latitude: 42.5, longitude: -76.5 })).toBe(false);
          expect(isMapMarkerRpc({ google_place_id: 'ChIJ123', name: '   ', latitude: 42.5, longitude: -76.5 })).toBe(false);
          expect(isMapMarkerRpc({ google_place_id: 'ChIJ123', name: 123 as any, latitude: 42.5, longitude: -76.5 })).toBe(false);
        });

        it('rejects objects with invalid or missing coordinates', () => {
          expect(isMapMarkerRpc({ google_place_id: 'ChIJ123', name: 'Winery' })).toBe(false);
          expect(isMapMarkerRpc({ google_place_id: 'ChIJ123', name: 'Winery', latitude: '42.5' as any, longitude: -76.5 })).toBe(false);
          expect(isMapMarkerRpc({ google_place_id: 'ChIJ123', name: 'Winery', latitude: NaN, longitude: -76.5 })).toBe(false);
          expect(isMapMarkerRpc({ google_place_id: 'ChIJ123', name: 'Winery', lat: '42.5' as any, lng: -76.5 })).toBe(false);
        });

        it('rejects objects containing visits property', () => {
          expect(isMapMarkerRpc({ google_place_id: 'ChIJ123', name: 'Winery', latitude: 42.5, longitude: -76.5, visits: [] })).toBe(false);
        });

        it('accepts valid MapMarkerRpc with valid name and coordinates', () => {
          expect(isMapMarkerRpc({ google_place_id: 'ChIJ123', name: 'Marker Winery', latitude: 42.5, longitude: -76.5 })).toBe(true);
          expect(isMapMarkerRpc({ id: 'ChIJ123', name: 'Marker Winery', lat: 42.5, lng: -76.5 })).toBe(true);
        });
      });

      describe('isWineryDetailsRpc tightening', () => {
        it('rejects objects without non-empty string name', () => {
          expect(isWineryDetailsRpc({ google_place_id: 'ChIJ123', latitude: 42.5, longitude: -76.5, visits: [] })).toBe(false);
          expect(isWineryDetailsRpc({ google_place_id: 'ChIJ123', name: '', latitude: 42.5, longitude: -76.5, visits: [] })).toBe(false);
          expect(isWineryDetailsRpc({ google_place_id: 'ChIJ123', name: '   ', latitude: 42.5, longitude: -76.5, visits: [] })).toBe(false);
        });

        it('rejects objects without valid coordinates', () => {
          expect(isWineryDetailsRpc({ google_place_id: 'ChIJ123', name: 'Winery', visits: [] })).toBe(false);
          expect(isWineryDetailsRpc({ google_place_id: 'ChIJ123', name: 'Winery', latitude: '42.5' as any, longitude: -76.5, visits: [] })).toBe(false);
          expect(isWineryDetailsRpc({ google_place_id: 'ChIJ123', name: 'Winery', latitude: NaN, longitude: -76.5, visits: [] })).toBe(false);
        });

        it('rejects objects without visits property', () => {
          expect(isWineryDetailsRpc({ google_place_id: 'ChIJ123', name: 'Winery', latitude: 42.5, longitude: -76.5 })).toBe(false);
        });

        it('accepts valid WineryDetailsRpc with name, coordinates, and visits', () => {
          expect(isWineryDetailsRpc({ google_place_id: 'ChIJ123', name: 'Details Winery', latitude: 42.5, longitude: -76.5, visits: [] })).toBe(true);
          expect(isWineryDetailsRpc({ id: 'ChIJ123', name: 'Details Winery', lat: 42.5, lng: -76.5, visits: [] })).toBe(true);
        });
      });

      describe('isRawDbWinery tightening', () => {
        it('rejects objects without non-empty string name', () => {
          expect(isRawDbWinery({ created_at: '2026-01-01' })).toBe(false);
          expect(isRawDbWinery({ name: '', created_at: '2026-01-01' })).toBe(false);
          expect(isRawDbWinery({ name: '   ', created_at: '2026-01-01' })).toBe(false);
          expect(isRawDbWinery({ name: 123 as any, created_at: '2026-01-01' })).toBe(false);
        });

        it('rejects objects missing created_at', () => {
          expect(isRawDbWinery({ name: 'Raw Winery' })).toBe(false);
        });

        it('accepts valid DbWinery with non-empty name and created_at', () => {
          expect(isRawDbWinery({ id: 10, name: 'Raw DB Winery', created_at: '2026-01-01T00:00:00Z' })).toBe(true);
        });
      });
    });
  });
});
