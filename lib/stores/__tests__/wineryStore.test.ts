import { createMockWinery, createMockVisit } from '@/lib/test-utils/fixtures';
import { Winery, WineryDbId } from '@/lib/types';

describe('WineryUIStore: ensureWineryDetails', () => {
  let useWineryStore: any;
  let mockRpc: jest.Mock;
  let mockInvoke: jest.Mock;

  beforeEach(() => {
    jest.resetModules();
    
    mockRpc = jest.fn().mockResolvedValue({ data: [], error: null });
    mockInvoke = jest.fn().mockResolvedValue({ data: null, error: null });

    jest.doMock('@/utils/supabase/client', () => ({
      createClient: () => ({
        rpc: mockRpc,
        functions: {
          invoke: mockInvoke
        }
      })
    }));

    jest.doMock('@/lib/utils', () => {
      const actual = jest.requireActual('@/lib/utils');
      return {
        ...actual,
        invokeFunction: (...args: any[]) => mockInvoke(...args),
      };
    });

    // Re-import store to pick up the new mock
    useWineryStore = require('../wineryStore').useWineryStore;
    useWineryStore.getState().reset();
  });

  it('returns cached details if they exist and data is consistent', async () => {
    const winery: Winery = {
      ...createMockWinery(),
      openingHours: { weekday_text: ['Mon: Open'] },
      userVisited: true,
      visits: [createMockVisit()],
      enrichment_tier: 'enriched',
      reviews: [{ author_name: 'Tester', rating: 5, text: 'Great!', time: 12345, relative_time_description: 'today' }],
      userRatingCount: 10,
      generative_summary: 'Great winery summary',
      vibe_tags: ['Dog Friendly']
    };
    
    useWineryStore.setState({ persistentWineries: [winery] });

    const result = await useWineryStore.getState().ensureWineryDetails(winery.id);

    expect(result).toEqual(winery);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('triggers background revalidation (Stale-While-Revalidate) when cached winery is older than 30 days', async () => {
    const fortyDaysAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
    const staleWinery: Winery = {
      ...createMockWinery(),
      openingHours: { weekday_text: ['Mon: Open'] },
      userVisited: false,
      enrichment_tier: 'enriched',
      last_enriched_at: fortyDaysAgo,
      reviews: [{ author_name: 'Tester', rating: 5, text: 'Great!', time: 12345, relative_time_description: 'today' }],
      userRatingCount: 10,
      generative_summary: 'Great winery summary',
      vibe_tags: ['Dog Friendly']
    };
    
    useWineryStore.setState({ persistentWineries: [staleWinery] });

    // ensureWineryDetails should return the stale data immediately for snappy UI
    const result = await useWineryStore.getState().ensureWineryDetails(staleWinery.id);
    expect(result).toEqual(staleWinery);

    // And fire background revalidation to get-winery-details
    expect(mockInvoke).toHaveBeenCalledWith('get-winery-details', { body: { placeId: staleWinery.id } });
    expect(mockInvoke).toHaveBeenCalledTimes(1);

    // Calling it again while in-flight should NOT trigger duplicate background calls
    await useWineryStore.getState().ensureWineryDetails(staleWinery.id);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it('bypasses early cache return and fetches fresh details if cached winery has rating of 0', async () => {
    const zeroRatingWinery: Winery = {
      ...createMockWinery(),
      rating: 0,
      dbId: 456 as WineryDbId,
      openingHours: { weekday_text: ['Mon: Open'] },
      userVisited: false,
      enrichment_tier: 'enriched',
      reviews: [{ author_name: 'Tester', rating: 5, text: 'Great!', time: 12345, relative_time_description: 'today' }],
      userRatingCount: 10,
      generative_summary: 'Great winery summary',
      vibe_tags: ['Dog Friendly']
    };
    
    useWineryStore.setState({ persistentWineries: [zeroRatingWinery] });

    mockRpc.mockResolvedValueOnce({
      data: [{
        ...zeroRatingWinery,
        google_rating: 4.8
      }],
      error: null
    });

    await useWineryStore.getState().ensureWineryDetails(zeroRatingWinery.id);

    // Should fetch from DB because rating: 0 is treated as corrupted/invalid
    expect(mockRpc).toHaveBeenCalledWith('get_winery_details_by_id', { p_winery_id: 456 });
  });

  it('resolves targetDbId directly from numeric placeId string when winery is not in local cache', async () => {
    useWineryStore.setState({ persistentWineries: [] });

    mockRpc.mockResolvedValueOnce({
      data: [{
        ...createMockWinery(),
        id: 789,
        google_place_id: 'place_mock_789'
      }],
      error: null
    });

    await useWineryStore.getState().ensureWineryDetails('789');

    expect(mockRpc).toHaveBeenCalledWith('get_winery_details_by_id', { p_winery_id: 789 });
  });

  it('FORCES fetch if userVisited is true but visits are missing (Ghost State)', async () => {
    const ghostWinery: Winery = {
      ...createMockWinery(),
      dbId: 123 as WineryDbId,
      openingHours: { weekday_text: ['Mon: Open'] }, 
      userVisited: true, 
      visits: [] 
    };
    
    useWineryStore.setState({ persistentWineries: [ghostWinery] });

    // Mock RPC Success
    mockRpc.mockResolvedValueOnce({ 
      data: [{ 
        ...ghostWinery, 
        visits: [createMockVisit({ id: 'recovered-visit' })] 
      }], 
      error: null 
    });

    await useWineryStore.getState().ensureWineryDetails(ghostWinery.id);

    expect(mockRpc).toHaveBeenCalledWith('get_winery_details_by_id', { p_winery_id: 123 });
  });

  it('FORCES fetch if userVisited is true but visits is undefined', async () => {
    const ghostWinery: Winery = {
      ...createMockWinery(),
      dbId: 123 as WineryDbId,
      openingHours: { weekday_text: ['Mon: Open'] },
      userVisited: true,
      visits: undefined
    };
    
    useWineryStore.setState({ persistentWineries: [ghostWinery] });

    await useWineryStore.getState().ensureWineryDetails(ghostWinery.id);

    expect(mockRpc).toHaveBeenCalledWith('get_winery_details_by_id', { p_winery_id: 123 });
  });
});

describe('WineryUIStore: fetchWineryData', () => {
  let useWineryStore: any;
  let mockRpc: jest.Mock;

  beforeEach(() => {
    jest.resetModules();
    
    mockRpc = jest.fn().mockResolvedValue({ data: [], error: null });

    jest.doMock('@/utils/supabase/client', () => ({
      createClient: () => ({
        rpc: mockRpc
      })
    }));

    useWineryStore = require('../wineryStore').useWineryStore;
    useWineryStore.getState().reset();
  });

  it('fetches map markers and hydrates them into useWineryStore', async () => {
    const mockMarker = {
      id: 999,
      google_place_id: 'test-google-id',
      name: 'Test Winery',
      latitude: 42.123,
      longitude: -76.456,
      is_favorite: true,
      on_wishlist: false,
      user_visited: true,
      is_favorite_private: false,
      on_wishlist_private: false
    };

    mockRpc.mockResolvedValueOnce({
      data: [mockMarker],
      error: null
    });

    await useWineryStore.getState().fetchWineryData('test-user-id');

    expect(mockRpc).toHaveBeenCalledWith('get_map_markers', { p_user_id: 'test-user-id' });
    
    const persistentWineries = useWineryStore.getState().persistentWineries;
    expect(persistentWineries).toHaveLength(1);
    expect(persistentWineries[0].id).toBe('test-google-id');
    expect(persistentWineries[0].dbId).toBe(999);
    expect(persistentWineries[0].isFavorite).toBe(true);
    expect(persistentWineries[0].userVisited).toBe(true);
  });

  it('handles database errors gracefully', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: new Error('DB Error')
    });

    await useWineryStore.getState().fetchWineryData('test-user-id');

    expect(consoleSpy).toHaveBeenCalledWith('Failed to fetch map markers:', expect.any(Error));
    consoleSpy.mockRestore();
  });

  describe('Canonical useWineryStore State Consolidation (ST-02 & ST-03)', () => {
    it('manages persistentWineries directly in useWineryStore state', () => {
      const winery = createMockWinery({ id: 'winery-reactivity-1' as any, name: 'Reactivity Winery' });

      expect(useWineryStore.getState().persistentWineries).toBeDefined();

      useWineryStore.getState().upsertWinery(winery);

      const updated = useWineryStore.getState().persistentWineries.find((w: any) => w.id === 'winery-reactivity-1');
      expect(updated).toBeDefined();
      expect(updated?.name).toBe('Reactivity Winery');
    });

    it('strips duplicate visits array from winery cache (ST-03 single source of truth in visitStore)', () => {
      const mockVisit = createMockVisit({ id: 101 as any, winery_id: 50 as WineryDbId });
      const wineryWithDuplicateVisits = createMockWinery({
        id: 'winery-with-visits' as any,
        name: 'Winery With Embedded Visits',
        visits: [mockVisit],
        userVisited: true,
      });

      useWineryStore.getState().upsertWinery(wineryWithDuplicateVisits);

      const stored = useWineryStore.getState().persistentWineries.find((w: any) => w.id === 'winery-with-visits');
      expect(stored).toBeDefined();
      expect(stored?.visits).toEqual([]);
      expect(stored?.userVisited).toBe(true);
    });

    it('supports direct bulkUpsertWineries and getWinery on useWineryStore', () => {
      const w1 = createMockWinery({ id: 'bulk-1' as any, dbId: 101 as any, name: 'Bulk 1' });
      const w2 = createMockWinery({ id: 'bulk-2' as any, dbId: 102 as any, name: 'Bulk 2' });

      useWineryStore.getState().bulkUpsertWineries([w1, w2]);

      expect(useWineryStore.getState().getWinery('bulk-1')).toBeDefined();
      expect(useWineryStore.getState().getWinery('bulk-2')?.name).toBe('Bulk 2');
    });
  });
});