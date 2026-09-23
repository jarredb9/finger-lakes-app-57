import { act } from '@testing-library/react';
import { createMockWinery, createMockVisit, createMockMapMarkerRpc } from '@/lib/test-utils/fixtures';
import { WineryDbId, GooglePlaceId, Winery } from '@/lib/types';
import { useWineryStore } from '../wineryStore';

let mockRpc: any = jest.fn((name: string) => {
  if (name === 'get_map_markers') {
    return Promise.resolve({ data: [], error: null });
  }
  return Promise.resolve({ data: null, error: null });
});

(globalThis as any)._WINERY_ENRICH_RPC = mockRpc;

jest.mock('@/utils/supabase/client', () => ({
  createClient: jest.fn(() => ({
    rpc: (...args: any[]) => (globalThis as any)._WINERY_ENRICH_RPC(...args),
  })),
}));

describe('WineryDataStore', () => {
  beforeEach(() => {
    (globalThis as any)._E2E_ENABLE_REAL_SYNC = true;

    mockRpc = jest.fn((name: string) => {
      if (name === 'get_map_markers') {
        return Promise.resolve({ data: [], error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });
    (globalThis as any)._WINERY_ENRICH_RPC = mockRpc;

    useWineryStore.getState().reset();
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
});
