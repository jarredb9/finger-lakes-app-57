import { act } from '@testing-library/react';
import { createMockWinery, createMockVisit, createMockMapMarkerRpc } from '@/lib/test-utils/fixtures';
import { WineryDbId, GooglePlaceId } from '@/lib/types';

describe('WineryDataStore', () => {
  let useWineryDataStore: any;
  let mockRpc: any;

  beforeEach(() => {
    jest.resetModules();
    
    // Ensure hydrateWineries is not skipped in Jest tests
    (globalThis as any)._E2E_ENABLE_REAL_SYNC = true;

    // Name-aware mockRpc
    mockRpc = jest.fn((name) => {
      if (name === 'get_map_markers') {
         // Default empty return for markers, specific tests override this
         return Promise.resolve({ data: [], error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });

    // Mock Supabase
    jest.doMock('@/utils/supabase/client', () => ({
      createClient: () => ({
        rpc: mockRpc,
      }),
    }));

    // Mock IDB to prevent errors during persist middleware init
    jest.doMock('idb-keyval', () => ({
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    }));

    // Re-require store
    useWineryDataStore = require('../wineryDataStore').useWineryDataStore;
    useWineryDataStore.getState().reset();
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
      useWineryDataStore.setState({ persistentWineries: [existingWinery] });
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
      useWineryDataStore.getState().hydrateWineries([freshMarker]);
    });

    // 4. Assertions
    const updatedWineries = useWineryDataStore.getState().persistentWineries;
    const updatedWinery = updatedWineries.find((w: any) => w.id === 'ch-test-winery');

    expect(updatedWinery).toBeDefined();
    // Verify updates from marker applied
    expect(updatedWinery?.name).toBe('Rich Winery (Updated)'); 
    // Verify RICH DATA PRESERVED
    expect(updatedWinery?.visits).toHaveLength(1);
    expect(updatedWinery?.visits?.[0].user_review).toBe('Preserve me!');
    expect(updatedWinery?.reviews).toHaveLength(1);
  });

  it('should not overwrite existing enriched fields with basic/null/undefined marker fields in upsertWinery and bulkUpsertWineries', () => {
    // 1. Setup Initial State with Rich/Enriched Data
    const existingWinery = {
      id: 'winery-1',
      dbId: 1,
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
      visits: [{ id: 'visit-1', user_review: 'Preserve me!' }],
    };

    act(() => {
      useWineryDataStore.setState({ persistentWineries: [existingWinery] });
    });

    // 2. Prepare basic/partial marker updates
    const basicUpdate = {
      id: 'winery-1',
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
      useWineryDataStore.getState().upsertWinery(basicUpdate);
    });

    let updatedWineries = useWineryDataStore.getState().persistentWineries;
    let updatedWinery = updatedWineries.find((w: any) => w.id === 'winery-1');
    expect(updatedWinery.name).toBe('Enriched Winery (Updated)');
    expect(updatedWinery.phone).toBe('123-456-7890');
    expect(updatedWinery.website).toBe('https://winery.com');
    expect(updatedWinery.rating).toBe(4.8);
    expect(updatedWinery.userRatingCount).toBe(150);
    expect(updatedWinery.enrichment_tier).toBe('enriched');
    expect(updatedWinery.generative_summary).toBe('A great winery.');
    expect(updatedWinery.allows_dogs).toBe(true);
    expect(updatedWinery.has_ev_charging).toBe(true);
    expect(updatedWinery.openingHours).toBeDefined();
    expect(updatedWinery.reviews).toHaveLength(1);

    // Reset and test bulkUpsertWineries
    act(() => {
      useWineryDataStore.setState({ persistentWineries: [existingWinery] });
    });

    act(() => {
      useWineryDataStore.getState().bulkUpsertWineries([basicUpdate]);
    });

    updatedWineries = useWineryDataStore.getState().persistentWineries;
    updatedWinery = updatedWineries.find((w: any) => w.id === 'winery-1');
    expect(updatedWinery.name).toBe('Enriched Winery (Updated)');
    expect(updatedWinery.phone).toBe('123-456-7890');
    expect(updatedWinery.website).toBe('https://winery.com');
    expect(updatedWinery.rating).toBe(4.8);
    expect(updatedWinery.userRatingCount).toBe(150);
    expect(updatedWinery.enrichment_tier).toBe('enriched');
    expect(updatedWinery.generative_summary).toBe('A great winery.');
    expect(updatedWinery.allows_dogs).toBe(true);
    expect(updatedWinery.has_ev_charging).toBe(true);
    expect(updatedWinery.openingHours).toBeDefined();
    expect(updatedWinery.reviews).toHaveLength(1);
  });
});

