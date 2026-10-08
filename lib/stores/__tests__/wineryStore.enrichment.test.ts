import { act, renderHook } from '@testing-library/react';
import { createMockWinery, createMockVisit, createMockMapMarkerRpc } from '@/lib/test-utils/fixtures';
import { WineryDbId, GooglePlaceId, Winery, VisitWithWinery } from '@/lib/types';
import { useWineryStore } from '../wineryStore';
import { useMapStore } from '../mapStore';
import { useVisitStore } from '../visitStore';
import { useTripStore } from '../tripStore';
import { useWineryFilter } from '@/hooks/use-winery-filter';

let mockRpc: any = jest.fn((name: string) => {
  if (name === 'get_map_markers') {
    return Promise.resolve({ data: [], error: null });
  }
  return Promise.resolve({ data: null, error: null });
});
let mockInvoke: any = jest.fn().mockResolvedValue({ data: null, error: null });
let mockFrom: any = jest.fn(() => ({
  select: jest.fn(() => ({
    eq: jest.fn(() => ({
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
    })),
  })),
}));

(globalThis as any)._WINERY_ENRICH_RPC = mockRpc;
(globalThis as any)._WINERY_ENRICH_INVOKE = mockInvoke;
(globalThis as any)._WINERY_ENRICH_FROM = mockFrom;

jest.mock('@/utils/supabase/client', () => ({
  createClient: jest.fn(() => ({
    rpc: (...args: any[]) => (globalThis as any)._WINERY_ENRICH_RPC(...args),
    from: (...args: any[]) => (globalThis as any)._WINERY_ENRICH_FROM(...args),
    auth: {
      getSession: jest.fn().mockResolvedValue({
        data: { session: { user: { id: 'test-user-123' } } },
        error: null,
      }),
      getUser: jest.fn().mockResolvedValue({
        data: { user: { id: 'test-user-123' } },
        error: null,
      }),
    },
    storage: {
      from: jest.fn(() => ({
        upload: jest.fn().mockResolvedValue({ data: { path: 'test-path.jpg' }, error: null }),
        remove: jest.fn().mockResolvedValue({ data: null, error: null }),
      })),
    },
  })),
}));

jest.mock('@/lib/utils', () => {
  const actual = jest.requireActual('@/lib/utils');
  return {
    ...actual,
    invokeFunction: (...args: any[]) => (globalThis as any)._WINERY_ENRICH_INVOKE(...args),
  };
});

describe('WineryDataStore', () => {
  beforeEach(() => {
    (globalThis as any)._E2E_ENABLE_REAL_SYNC = true;

    mockRpc = jest.fn((name: string) => {
      if (name === 'get_map_markers') {
        return Promise.resolve({ data: [], error: null });
      }
      if (name === 'toggle_favorite') {
        return Promise.resolve({ data: { is_favorite: true, winery_id: 101 }, error: null });
      }
      if (name === 'toggle_wishlist') {
        return Promise.resolve({ data: { on_wishlist: true, winery_id: 101 }, error: null });
      }
      if (name === 'log_visit') {
        return Promise.resolve({ data: { visit_id: 555, winery_id: 101 }, error: null });
      }
      if (name === 'delete_visit') {
        return Promise.resolve({ data: true, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });
    mockInvoke = jest.fn().mockResolvedValue({ data: null, error: null });
    mockFrom = jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
          single: jest.fn().mockResolvedValue({ data: null, error: null }),
        })),
      })),
    }));
    (globalThis as any)._WINERY_ENRICH_RPC = mockRpc;
    (globalThis as any)._WINERY_ENRICH_INVOKE = mockInvoke;
    (globalThis as any)._WINERY_ENRICH_FROM = mockFrom;

    useWineryStore.getState().reset();
    useMapStore.getState().reset();
    useVisitStore.getState().reset();
    useTripStore.getState().reset();
  });

  afterEach(() => {
    delete (globalThis as any)._E2E_ENABLE_REAL_SYNC;
  });

  it('should preserve existing winery details (visits) when hydrating from map markers', async () => {
    // 1. Setup Initial State with Rich Data
    const existingVisit = createMockVisit({ id: 'visit-1', user_review: 'Preserve me!' });
    const existingWinery = createMockWinery({
      id: 'ch-test-winery' as GooglePlaceId,
      dbId: 100 as WineryDbId,
      name: 'Rich Winery',
      visits: [existingVisit], // Crucial: Has visits
      reviews: [{ author_name: 'Tester', rating: 5, text: 'Great!', time: 123, relative_time_description: 'Now' }],
    });

    // Manually seed the store (simulating persistence or previous navigation)
    act(() => {
      useWineryStore.setState({ persistentWineries: [existingWinery] });
    });

    // 2. Setup RPC Mock (Returns "Fresh" Map Marker without visits)
    const freshMarker = createMockMapMarkerRpc({
      id: 100 as WineryDbId,
      google_place_id: 'ch-test-winery' as GooglePlaceId,
      name: 'Rich Winery (Updated)', // Name might change
      user_visited: true, // Marker says visited, but doesn't have the array
    });

    // Override mockRpc for this specific test
    mockRpc.mockImplementation((name: string) => {
      if (name === 'get_map_markers') {
        return Promise.resolve({ data: [freshMarker], error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });

    // 3. Trigger Hydration
    act(() => {
      useWineryStore.getState().hydrateWineries([freshMarker as any]);
    });

    // 4. Assertions
    const updatedWineries = useWineryStore.getState().persistentWineries;
    const updatedWinery = updatedWineries.find((w: any) => w.id === 'ch-test-winery');

    expect(updatedWinery).toBeDefined();
    // Verify updates from marker applied
    expect(updatedWinery?.name).toBe('Rich Winery (Updated)'); 
    // ST-03: visits array is stripped from winery cache (single source of truth in visitStore)
    expect(updatedWinery?.visits).toEqual([]);
    expect(updatedWinery?.userVisited).toBe(true);
    expect(updatedWinery?.reviews).toHaveLength(1);
  });

  it('should not overwrite existing enriched fields with basic/null/undefined marker fields in upsertWinery and bulkUpsertWineries', () => {
    // 1. Setup Initial State with Rich/Enriched Data
    const existingWinery: Winery = createMockWinery({
      id: 'winery-1' as GooglePlaceId,
      dbId: 1 as WineryDbId,
      name: 'Enriched Winery',
      address: '123 Wine St',
      latitude: 42.5,
      longitude: -76.5,
      phone: '123-456-7890',
      website: 'https://winery.com',
      rating: 4.8,
      userRatingCount: 150,
      enrichment_tier: 'enriched',
      last_enriched_at: '2026-07-13T13:26:14-04:00',
      generative_summary: 'A great winery.',
      allows_dogs: true,
      has_ev_charging: true,
      serves_wine: true,
      good_for_children: false,
      outdoor_seating: true,
      openingHours: { open_now: true, weekday_text: ['Monday: Open'] },
      reviews: [{ author_name: 'Tester', rating: 5, text: 'Great!', time: 123, relative_time_description: 'Now' }],
      visits: [{ id: 'visit-1', user_review: 'Preserve me!' }] as any,
    });

    act(() => {
      useWineryStore.setState({ persistentWineries: [existingWinery] });
    });

    // 2. Prepare basic/partial marker updates
    const basicUpdate: any = {
      id: 'winery-1' as GooglePlaceId,
      name: 'Enriched Winery (Updated)',
      address: '123 Wine St (Updated)',
      latitude: 42.5,
      longitude: -76.5,
      phone: null,
      website: undefined,
      rating: null,
      userRatingCount: null,
      enrichment_tier: undefined,
      generative_summary: null,
      allows_dogs: null,
      has_ev_charging: null,
      openingHours: null,
      reviews: null,
    };

    // Test upsertWinery
    act(() => {
      useWineryStore.getState().upsertWinery(basicUpdate as Winery);
    });

    let updatedWineries = useWineryStore.getState().persistentWineries;
    let updatedWinery = updatedWineries.find((w: any) => w.id === 'winery-1');
    expect(updatedWinery).toBeDefined();
    expect(updatedWinery?.name).toBe('Enriched Winery (Updated)');
    expect(updatedWinery?.phone).toBe('123-456-7890');
    expect(updatedWinery?.website).toBe('https://winery.com');
    expect(updatedWinery?.rating).toBe(4.8);
    expect(updatedWinery?.userRatingCount).toBe(150);
    expect(updatedWinery?.enrichment_tier).toBe('enriched');
    expect(updatedWinery?.generative_summary).toBe('A great winery.');
    expect(updatedWinery?.allows_dogs).toBe(true);
    expect(updatedWinery?.has_ev_charging).toBe(true);
    expect(updatedWinery?.openingHours).toBeDefined();
    expect(updatedWinery?.reviews).toHaveLength(1);

    // Reset and test bulkUpsertWineries
    act(() => {
      useWineryStore.setState({ persistentWineries: [existingWinery] });
    });

    act(() => {
      useWineryStore.getState().bulkUpsertWineries([basicUpdate as Winery]);
    });

    updatedWineries = useWineryStore.getState().persistentWineries;
    updatedWinery = updatedWineries.find((w: any) => w.id === 'winery-1');
    expect(updatedWinery).toBeDefined();
    expect(updatedWinery?.name).toBe('Enriched Winery (Updated)');
    expect(updatedWinery?.phone).toBe('123-456-7890');
    expect(updatedWinery?.website).toBe('https://winery.com');
    expect(updatedWinery?.rating).toBe(4.8);
    expect(updatedWinery?.userRatingCount).toBe(150);
    expect(updatedWinery?.enrichment_tier).toBe('enriched');
    expect(updatedWinery?.generative_summary).toBe('A great winery.');
    expect(updatedWinery?.allows_dogs).toBe(true);
    expect(updatedWinery?.has_ev_charging).toBe(true);
    expect(updatedWinery?.openingHours).toBeDefined();
    expect(updatedWinery?.reviews).toHaveLength(1);
  });

  describe('Search Merging & Authoritative Cache Ingestion', () => {
    it('should preserve existing user flags and rich enrichment when merging search results via bulkUpsertWineries', () => {
      // 1. Setup Initial State with User Flags and Rich Enriched Data
      const existingWinery: Winery = createMockWinery({
        id: 'ChIJ_seneca_lake' as GooglePlaceId,
        dbId: 101 as WineryDbId,
        name: 'Seneca Shore Winery',
        address: '123 Seneca Rd',
        latitude: 42.5,
        longitude: -76.5,
        isFavorite: true,
        onWishlist: true,
        userVisited: true,
        rating: 4.5,
        userRatingCount: 100,
        enrichment_tier: 'enriched',
        generative_summary: 'Scenic vineyard on Seneca Lake.',
        allows_dogs: true,
        has_ev_charging: true,
        vibe_tags: ['Dog Friendly', 'Scenic Views'],
        reviews: [{ author_name: 'Tester', rating: 5, text: 'Great!', time: 123, relative_time_description: 'Now' }],
      });

      act(() => {
        useWineryStore.setState({ persistentWineries: [existingWinery] });
      });

      // 2. Incoming search candidate with updated basic fields but unpersonalized / default false flags
      const searchCandidate: any = {
        id: 'ChIJ_seneca_lake' as GooglePlaceId,
        google_place_id: 'ChIJ_seneca_lake' as GooglePlaceId,
        name: 'Seneca Shore Wine Cellars (Updated)',
        address: '123 Seneca Rd Suite A',
        latitude: 42.55,
        longitude: -76.55,
        rating: 4.8,
        userRatingCount: 150,
        // Search results from Google Places API or text searches do not carry user personalization:
        isFavorite: false,
        onWishlist: false,
        userVisited: false,
        is_favorite: false,
        on_wishlist: false,
        user_visited: false,
        enrichment_tier: 'basic',
        generative_summary: null,
        allows_dogs: null,
      };

      // 3. Ingest search candidate
      act(() => {
        useWineryStore.getState().bulkUpsertWineries([searchCandidate]);
      });

      // 4. Assertions
      const cached = useWineryStore.getState().getWinery('ChIJ_seneca_lake');
      expect(cached).toBeDefined();
      // Basic info updated from search
      expect(cached?.name).toBe('Seneca Shore Wine Cellars (Updated)');
      expect(cached?.address).toBe('123 Seneca Rd Suite A');
      expect(cached?.latitude).toBe(42.55);
      expect(cached?.longitude).toBe(-76.55);
      expect(cached?.rating).toBe(4.8);
      expect(cached?.userRatingCount).toBe(150);

      // User state flags MUST NOT be wiped by search results
      expect(cached?.isFavorite).toBe(true);
      expect(cached?.onWishlist).toBe(true);
      expect(cached?.userVisited).toBe(true);

      // Enriched fields MUST NOT be overwritten by basic/null search fields
      expect(cached?.enrichment_tier).toBe('enriched');
      expect(cached?.generative_summary).toBe('Scenic vineyard on Seneca Lake.');
      expect(cached?.allows_dogs).toBe(true);
      expect(cached?.vibe_tags).toEqual(['Dog Friendly', 'Scenic Views']);
      expect(cached?.reviews).toHaveLength(1);
    });

    it('should seamlessly ingest newly discovered wineries from search results into persistentWineries with default user state', () => {
      const existingWinery = createMockWinery({
        id: 'ChIJ_existing_1' as GooglePlaceId,
        name: 'Existing Estate',
        isFavorite: true,
      });

      act(() => {
        useWineryStore.setState({ persistentWineries: [existingWinery] });
      });

      const newSearchCandidate: any = {
        id: 'ChIJ_newly_discovered' as GooglePlaceId,
        google_place_id: 'ChIJ_newly_discovered' as GooglePlaceId,
        name: 'Newly Discovered Vineyard',
        latitude: 42.75,
        longitude: -76.85,
        rating: 4.6,
        userRatingCount: 42,
      };

      act(() => {
        useWineryStore.getState().bulkUpsertWineries([newSearchCandidate]);
      });

      const wineries = useWineryStore.getState().persistentWineries;
      expect(wineries).toHaveLength(2);

      const added = useWineryStore.getState().getWinery('ChIJ_newly_discovered');
      expect(added).toBeDefined();
      expect(added?.name).toBe('Newly Discovered Vineyard');
      expect(added?.rating).toBe(4.6);
      expect(added?.userRatingCount).toBe(42);
      expect(added?.isFavorite).toBe(false);
      expect(added?.onWishlist).toBe(false);
      expect(added?.userVisited).toBe(false);
      expect(added?.visits).toEqual([]);

      // Existing winery was not affected
      expect(useWineryStore.getState().getWinery('ChIJ_existing_1')?.isFavorite).toBe(true);
    });

    it('should deduplicate search candidates matching by id or google_place_id without duplicating entries', () => {
      const initial = createMockWinery({
        id: 'ChIJ_dedup_test' as GooglePlaceId,
        name: 'Dedup Winery',
      });

      act(() => {
        useWineryStore.setState({ persistentWineries: [initial] });
      });

      const batch: any[] = [
        { id: 'ChIJ_dedup_test', name: 'Dedup Winery (Pass 1)', latitude: 42.5, longitude: -76.5 },
        { id: 'ChIJ_dedup_test', name: 'Dedup Winery (Pass 2)', latitude: 42.5, longitude: -76.5 },
        { id: 'ChIJ_other_place', name: 'Other Winery', latitude: 42.6, longitude: -76.6 },
      ];

      act(() => {
        useWineryStore.getState().bulkUpsertWineries(batch);
      });

      const wineries = useWineryStore.getState().persistentWineries;
      expect(wineries).toHaveLength(2);
      expect(useWineryStore.getState().getWinery('ChIJ_dedup_test')?.name).toBe('Dedup Winery (Pass 2)');
      expect(useWineryStore.getState().getWinery('ChIJ_other_place')?.name).toBe('Other Winery');
    });
  });

  describe('ensureWineryDetails Seamless Cache Hydration', () => {
    it('should seamlessly hydrate and update a basic winery in persistentWineries when enriched details are fetched', async () => {
      const basicWinery: Winery = createMockWinery({
        id: 'ChIJ_basic_to_enrich' as GooglePlaceId,
        dbId: 200 as WineryDbId,
        name: 'Basic Winery',
        enrichment_tier: 'basic',
        isFavorite: true,
        userVisited: true,
        rating: 4.2,
        openingHours: null,
        reviews: [],
        vibe_tags: [],
      });

      act(() => {
        useWineryStore.setState({ persistentWineries: [basicWinery] });
      });

      mockRpc.mockImplementation((name: string) => {
        if (name === 'get_winery_details_by_id') {
          return Promise.resolve({ data: null, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      });

      mockInvoke.mockResolvedValueOnce({
        data: {
          id: 'ChIJ_basic_to_enrich',
          name: 'Basic Winery (Enriched)',
          rating: 4.8,
          user_rating_count: 320,
          userRatingCount: 320,
          enrichment_tier: 'enriched',
          opening_hours: { weekday_text: ['Mon-Sun: 10am-6pm'] },
          reviews: [{ author_name: 'Wine Connoisseur', rating: 5, text: 'Outstanding Pinot Noir!', time: 12345 }],
          generative_summary: 'Premier Finger Lakes estate.',
          allows_dogs: true,
          vibe_tags: ['Dog Friendly', 'Scenic Views'],
          // External Edge Function does not know user state:
          is_favorite: false,
          isFavorite: false,
          user_visited: false,
          userVisited: false,
        },
        error: null,
      });

      const enrichedResult: Winery | null = await act(async () => {
        return await useWineryStore.getState().ensureWineryDetails('ChIJ_basic_to_enrich' as GooglePlaceId);
      });

      expect(enrichedResult).toBeDefined();
      expect(enrichedResult?.name).toBe('Basic Winery (Enriched)');
      expect(enrichedResult?.enrichment_tier).toBe('enriched');
      expect(enrichedResult?.openingHours?.weekday_text).toEqual(['Mon-Sun: 10am-6pm']);
      expect(enrichedResult?.generative_summary).toBe('Premier Finger Lakes estate.');
      expect(enrichedResult?.allows_dogs).toBe(true);

      // Verify persistentWineries was updated in place
      const cached = useWineryStore.getState().getWinery('ChIJ_basic_to_enrich');
      expect(cached).toBeDefined();
      expect(cached?.name).toBe('Basic Winery (Enriched)');
      expect(cached?.enrichment_tier).toBe('enriched');
      expect(cached?.openingHours?.weekday_text).toEqual(['Mon-Sun: 10am-6pm']);
      expect(cached?.reviews).toHaveLength(1);
      expect(cached?.rating).toBe(4.8);
      expect(cached?.userRatingCount).toBe(320);

      // Verify user flags were preserved and not wiped out by enrichment payload
      expect(cached?.isFavorite).toBe(true);
      expect(cached?.userVisited).toBe(true);
      expect(useWineryStore.getState().loadingWineryId).toBeNull();
    });

    it('should hydrate uncached winery directly into persistentWineries when ensureWineryDetails is called', async () => {
      act(() => {
        useWineryStore.setState({ persistentWineries: [] });
      });

      mockInvoke.mockResolvedValueOnce({
        data: {
          id: 'ChIJ_uncached_123',
          name: 'Uncached Winery',
          latitude: 42.65,
          longitude: -76.88,
          rating: 4.5,
          user_rating_count: 55,
          userRatingCount: 55,
          enrichment_tier: 'enriched',
          opening_hours: { weekday_text: ['Wed-Sun: 11am-5pm'] },
          generative_summary: 'Hidden gem with picturesque vistas.',
          allows_dogs: true,
        },
        error: null,
      });

      const result: Winery | null = await act(async () => {
        return await useWineryStore.getState().ensureWineryDetails('ChIJ_uncached_123' as GooglePlaceId);
      });

      expect(result).toBeDefined();
      expect(result?.name).toBe('Uncached Winery');
      expect(useWineryStore.getState().persistentWineries).toHaveLength(1);

      const cached = useWineryStore.getState().getWinery('ChIJ_uncached_123');
      expect(cached).toBeDefined();
      expect(cached?.name).toBe('Uncached Winery');
      expect(cached?.openingHours?.weekday_text).toEqual(['Wed-Sun: 11am-5pm']);
      expect(cached?.allows_dogs).toBe(true);
      expect(cached?.isFavorite).toBe(false);
      expect(cached?.userVisited).toBe(false);
      expect(useWineryStore.getState().loadingWineryId).toBeNull();
    });

    it('should seamlessly update persistentWineries during background revalidation for stale enriched record without losing user flags', async () => {
      // Stale timestamp (more than 30 days old)
      const staleDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
      const staleWinery: Winery = createMockWinery({
        id: 'ChIJ_stale_revalidate' as GooglePlaceId,
        name: 'Stale Estate',
        enrichment_tier: 'enriched',
        last_enriched_at: staleDate,
        isFavorite: true,
        onWishlist: true,
        userVisited: true,
        rating: 4.1,
        userRatingCount: 50,
        openingHours: { weekday_text: ['Mon: 12pm-4pm'] },
        reviews: [{ author_name: 'Old User', rating: 4, text: 'Decent', time: 100, relative_time_description: 'old' }],
        generative_summary: 'Old summary.',
        vibe_tags: ['Dog Friendly'],
      });

      act(() => {
        useWineryStore.setState({ persistentWineries: [staleWinery] });
      });

      mockInvoke.mockResolvedValueOnce({
        data: {
          id: 'ChIJ_stale_revalidate',
          name: 'Stale Estate (Fresh)',
          rating: 4.9,
          user_rating_count: 140,
          userRatingCount: 140,
          enrichment_tier: 'enriched',
          last_enriched_at: new Date().toISOString(),
          opening_hours: { weekday_text: ['Mon-Sun: 10am-6pm'] },
          reviews: [{ author_name: 'New User', rating: 5, text: 'Fantastic!', time: 200, relative_time_description: 'recent' }],
          generative_summary: 'Fresh summary with newly added deck.',
          allows_dogs: true,
          vibe_tags: ['Dog Friendly', 'Outdoor Seating'],
          // External Places payload without user flags:
          is_favorite: false,
          user_visited: false,
        },
        error: null,
      });

      let returnedWinery: Winery | null = null;
      await act(async () => {
        returnedWinery = await useWineryStore.getState().ensureWineryDetails('ChIJ_stale_revalidate' as GooglePlaceId);
      });

      // Immediate return gives cached version while background revalidation executes
      expect(returnedWinery).toBeDefined();

      // Verify invokeFunction was called in background
      expect(mockInvoke).toHaveBeenCalledWith('get-winery-details', { body: { placeId: 'ChIJ_stale_revalidate' } });

      // After background promise resolves, persistentWineries has fresh data
      const cached = useWineryStore.getState().getWinery('ChIJ_stale_revalidate');
      expect(cached?.name).toBe('Stale Estate (Fresh)');
      expect(cached?.rating).toBe(4.9);
      expect(cached?.userRatingCount).toBe(140);
      expect(cached?.openingHours?.weekday_text).toEqual(['Mon-Sun: 10am-6pm']);

      // User state flags MUST NOT be wiped out
      expect(cached?.isFavorite).toBe(true);
      expect(cached?.onWishlist).toBe(true);
      expect(cached?.userVisited).toBe(true);
    });
  });

  describe('Reactive User State Synchronization (Favorites, Wishlist, Visits)', () => {
    beforeEach(() => {
      useWineryStore.getState().reset();
      useMapStore.getState().reset();
      useVisitStore.getState().reset();
      useTripStore.getState().reset();
    });

    it('should immediately update persistentWineries and synchronize searchResults, map pins, and sidebar on toggleFavorite', async () => {
      const searchWinery: Winery = createMockWinery({
        id: 'ChIJ_search_fav_1' as GooglePlaceId,
        dbId: 101 as WineryDbId,
        name: 'Favorite Test Estate',
        isFavorite: false,
        onWishlist: false,
        userVisited: false,
      });

      // Seed mapStore searchResults simulating an active search
      act(() => {
        useMapStore.setState({
          searchResults: [searchWinery],
          filter: ['all'],
          bounds: { north: 43.0, south: 42.0, east: -76.0, west: -77.0 },
        });
      });

      // Execute toggleFavorite passing the Winery object from search results
      await act(async () => {
        await useWineryStore.getState().toggleFavorite(searchWinery);
      });

      // 1. Authoritative cache assertion: persistentWineries has the winery marked as favorite
      const cached = useWineryStore.getState().getWinery('ChIJ_search_fav_1');
      expect(cached).toBeDefined();
      expect(cached?.isFavorite).toBe(true);
      expect(useWineryStore.getState().getFavorites().map(w => w.id)).toContain('ChIJ_search_fav_1');

      // 2. Disconnected entity prevention: mapStore searchResults must also reflect isFavorite
      const searchResultItem = useMapStore.getState().searchResults.find(w => w.id === 'ChIJ_search_fav_1');
      expect(searchResultItem).toBeDefined();
      expect(searchResultItem?.isFavorite).toBe(true);

      // 3. Reactive UI propagation: hook reflects favorite status in pins and sidebar list
      const { result } = renderHook(() => useWineryFilter());
      expect(result.current.mapWineries.favorites.map(w => w.id)).toContain('ChIJ_search_fav_1');
      const inView = result.current.listResultsInView.find(w => w.id === 'ChIJ_search_fav_1');
      expect(inView).toBeDefined();
      expect(inView?.isFavorite).toBe(true);
    });

    it('should immediately update persistentWineries and synchronize searchResults, map pins, and sidebar on toggleWishlist', async () => {
      const searchWinery: Winery = createMockWinery({
        id: 'ChIJ_search_wish_1' as GooglePlaceId,
        dbId: 202 as WineryDbId,
        name: 'Wishlist Test Estate',
        isFavorite: false,
        onWishlist: false,
        userVisited: false,
      });

      act(() => {
        useMapStore.setState({
          searchResults: [searchWinery],
          filter: ['all'],
          bounds: { north: 43.0, south: 42.0, east: -76.0, west: -77.0 },
        });
      });

      await act(async () => {
        await useWineryStore.getState().toggleWishlist(searchWinery);
      });

      // 1. Authoritative cache assertion: persistentWineries has the winery on wishlist
      const cached = useWineryStore.getState().getWinery('ChIJ_search_wish_1');
      expect(cached).toBeDefined();
      expect(cached?.onWishlist).toBe(true);
      expect(useWineryStore.getState().getWishlist().map(w => w.id)).toContain('ChIJ_search_wish_1');

      // 2. Disconnected entity prevention: mapStore searchResults must also reflect onWishlist
      const searchResultItem = useMapStore.getState().searchResults.find(w => w.id === 'ChIJ_search_wish_1');
      expect(searchResultItem).toBeDefined();
      expect(searchResultItem?.onWishlist).toBe(true);

      // 3. Reactive UI propagation: hook reflects wishlist status in pins and sidebar list
      const { result } = renderHook(() => useWineryFilter());
      expect(result.current.mapWineries.wishlist.map(w => w.id)).toContain('ChIJ_search_wish_1');
      const inView = result.current.listResultsInView.find(w => w.id === 'ChIJ_search_wish_1');
      expect(inView).toBeDefined();
      expect(inView?.onWishlist).toBe(true);
    });

    it('should immediately update persistentWineries, clear wishlist status, and synchronize searchResults on visit save (ADR-0001)', async () => {
      const winery: Winery = createMockWinery({
        id: 'ChIJ_visit_save_1' as GooglePlaceId,
        dbId: 303 as WineryDbId,
        name: 'Visit Logging Estate',
        isFavorite: false,
        onWishlist: true,
        wishlistIsPrivate: true,
        userVisited: false,
      });

      act(() => {
        useWineryStore.setState({ persistentWineries: [winery] });
        useMapStore.setState({
          searchResults: [winery],
          filter: ['all'],
          bounds: { north: 43.0, south: 42.0, east: -76.0, west: -77.0 },
        });
      });

      const visitData = {
        visit_date: '2026-10-08',
        user_review: 'Exceptional Dry Riesling tasting',
        rating: 5,
        photos: [],
      };

      await act(async () => {
        await useVisitStore.getState().saveVisit(winery, visitData);
      });

      // 1. Authoritative cache assertion: persistentWineries reflects userVisited: true and onWishlist: false
      const cached = useWineryStore.getState().getWinery('ChIJ_visit_save_1');
      expect(cached).toBeDefined();
      expect(cached?.userVisited).toBe(true);
      expect(cached?.onWishlist).toBe(false);
      expect(cached?.wishlistIsPrivate).toBe(false);
      expect(useWineryStore.getState().getVisited().map(w => w.id)).toContain('ChIJ_visit_save_1');
      expect(useWineryStore.getState().getWishlist().map(w => w.id)).not.toContain('ChIJ_visit_save_1');

      // 2. Disconnected entity prevention: mapStore searchResults reflects userVisited and cleared wishlist
      const searchResultItem = useMapStore.getState().searchResults.find(w => w.id === 'ChIJ_visit_save_1');
      expect(searchResultItem).toBeDefined();
      expect(searchResultItem?.userVisited).toBe(true);
      expect(searchResultItem?.onWishlist).toBe(false);

      // 3. Reactive UI propagation: map pins and sidebar reflect visited status and cleared wishlist
      const { result } = renderHook(() => useWineryFilter());
      expect(result.current.mapWineries.visited.map(w => w.id)).toContain('ChIJ_visit_save_1');
      expect(result.current.mapWineries.wishlist.map(w => w.id)).not.toContain('ChIJ_visit_save_1');
      const inView = result.current.listResultsInView.find(w => w.id === 'ChIJ_visit_save_1');
      expect(inView).toBeDefined();
      expect(inView?.userVisited).toBe(true);
      expect(inView?.onWishlist).toBe(false);
    });

    it('should seamlessly ingest an unpersisted search candidate into persistentWineries when saving a visit', async () => {
      const unpersistedWinery: Winery = createMockWinery({
        id: 'ChIJ_unpersisted_candidate' as GooglePlaceId,
        dbId: 404 as WineryDbId,
        name: 'Unpersisted Candidate Estate',
        isFavorite: false,
        onWishlist: false,
        userVisited: false,
      });

      // Not in persistentWineries, only in searchResults
      act(() => {
        useWineryStore.setState({ persistentWineries: [] });
        useMapStore.setState({
          searchResults: [unpersistedWinery],
          filter: ['all'],
          bounds: { north: 43.0, south: 42.0, east: -76.0, west: -77.0 },
        });
      });

      await act(async () => {
        await useVisitStore.getState().saveVisit(unpersistedWinery, {
          visit_date: '2026-10-08',
          user_review: 'Spontaneous drop-in',
          rating: 4,
          photos: [],
        });
      });

      const cached = useWineryStore.getState().getWinery('ChIJ_unpersisted_candidate');
      expect(cached).toBeDefined();
      expect(cached?.userVisited).toBe(true);
      expect(useWineryStore.getState().getVisited().map(w => w.id)).toContain('ChIJ_unpersisted_candidate');

      const searchItem = useMapStore.getState().searchResults.find(w => w.id === 'ChIJ_unpersisted_candidate');
      expect(searchItem?.userVisited).toBe(true);
    });

    it('should revert userVisited to false when deleting the only visit for a winery (ghost visit prevention)', async () => {
      const winery: Winery = createMockWinery({
        id: 'ChIJ_del_visit_winery' as GooglePlaceId,
        dbId: 505 as WineryDbId,
        name: 'Single Visit Winery',
        userVisited: true,
        onWishlist: false,
      });

      const singleVisit: VisitWithWinery = {
        id: 'visit-to-delete-101',
        user_id: 'test-user-123',
        visit_date: '2026-10-01',
        rating: 4,
        user_review: 'Nice visit',
        is_private: false,
        photos: [],
        wineryName: winery.name,
        wineryId: winery.id,
        syncStatus: 'synced',
        wineries: {
          id: 505 as WineryDbId,
          google_place_id: winery.id,
          name: winery.name,
          address: winery.address,
          latitude: winery.latitude,
          longitude: winery.longitude,
        },
      };

      act(() => {
        useWineryStore.setState({ persistentWineries: [winery] });
        useVisitStore.setState({ visits: [singleVisit] });
        useMapStore.setState({
          searchResults: [winery],
          filter: ['all'],
          bounds: { north: 43.0, south: 42.0, east: -76.0, west: -77.0 },
        });
      });

      await act(async () => {
        await useVisitStore.getState().deleteVisit('visit-to-delete-101');
      });

      // 1. Authoritative cache assertion: userVisited reverted to false
      const cached = useWineryStore.getState().getWinery('ChIJ_del_visit_winery');
      expect(cached).toBeDefined();
      expect(cached?.userVisited).toBe(false);
      expect(useWineryStore.getState().getVisited().map(w => w.id)).not.toContain('ChIJ_del_visit_winery');

      // 2. Disconnected entity prevention: searchResults also updated
      const searchItem = useMapStore.getState().searchResults.find(w => w.id === 'ChIJ_del_visit_winery');
      expect(searchItem?.userVisited).toBe(false);

      // 3. Reactive UI propagation: pin moves from visited to discovered
      const { result } = renderHook(() => useWineryFilter());
      expect(result.current.mapWineries.visited.map(w => w.id)).not.toContain('ChIJ_del_visit_winery');
      expect(result.current.mapWineries.discovered.map(w => w.id)).toContain('ChIJ_del_visit_winery');
    });

    it('should maintain userVisited: true when deleting a visit if other visits remain for that winery', async () => {
      const winery: Winery = createMockWinery({
        id: 'ChIJ_multi_visit_winery' as GooglePlaceId,
        dbId: 606 as WineryDbId,
        name: 'Multi Visit Winery',
        userVisited: true,
      });

      const visit1: VisitWithWinery = {
        id: 'visit-multi-1',
        user_id: 'test-user-123',
        visit_date: '2026-09-01',
        rating: 4,
        user_review: 'First visit',
        is_private: false,
        photos: [],
        wineryName: winery.name,
        wineryId: winery.id,
        syncStatus: 'synced',
        wineries: {
          id: 606 as WineryDbId,
          google_place_id: winery.id,
          name: winery.name,
          address: winery.address,
          latitude: winery.latitude,
          longitude: winery.longitude,
        },
      };

      const visit2: VisitWithWinery = {
        id: 'visit-multi-2',
        user_id: 'test-user-123',
        visit_date: '2026-10-01',
        rating: 5,
        user_review: 'Second visit',
        is_private: false,
        photos: [],
        wineryName: winery.name,
        wineryId: winery.id,
        syncStatus: 'synced',
        wineries: {
          id: 606 as WineryDbId,
          google_place_id: winery.id,
          name: winery.name,
          address: winery.address,
          latitude: winery.latitude,
          longitude: winery.longitude,
        },
      };

      act(() => {
        useWineryStore.setState({ persistentWineries: [winery] });
        useVisitStore.setState({ visits: [visit1, visit2] });
      });

      await act(async () => {
        await useVisitStore.getState().deleteVisit('visit-multi-1');
      });

      const cached = useWineryStore.getState().getWinery('ChIJ_multi_visit_winery');
      expect(cached).toBeDefined();
      expect(cached?.userVisited).toBe(true);
      expect(useWineryStore.getState().getVisited().map(w => w.id)).toContain('ChIJ_multi_visit_winery');
    });
  });
});
