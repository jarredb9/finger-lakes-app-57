import { createMockWinery, createMockVisit } from '@/lib/test-utils/fixtures';
import { Winery, WineryDbId } from '@/lib/types';

describe('WineryUIStore: ensureWineryDetails', () => {
  let useWineryStore: any;
  let useWineryDataStore: any;
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

    // Re-import stores to pick up the new mock
    useWineryStore = require('../wineryStore').useWineryStore;
    useWineryDataStore = require('../wineryDataStore').useWineryDataStore;
    
    useWineryStore.getState().reset();
    useWineryDataStore.getState().reset();
  });

  it('returns cached details if they exist and data is consistent', async () => {
    const winery: Winery = {
      ...createMockWinery(),
      openingHours: { weekday_text: ['Mon: Open'] },
      userVisited: true,
      visits: [createMockVisit()],
      enrichment_tier: 'enriched',
      reviews: [{ author_name: 'Tester', rating: 5, text: 'Great!', time: 12345, relative_time_description: 'today' }],
      userRatingCount: 10
    };
    
    useWineryDataStore.setState({ persistentWineries: [winery] });

    const result = await useWineryStore.getState().ensureWineryDetails(winery.id);

    expect(result).toEqual(winery);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('FORCES fetch if userVisited is true but visits are missing (Ghost State)', async () => {
    const ghostWinery: Winery = {
      ...createMockWinery(),
      dbId: 123 as WineryDbId,
      openingHours: { weekday_text: ['Mon: Open'] }, 
      userVisited: true, 
      visits: [] 
    };
    
    useWineryDataStore.setState({ persistentWineries: [ghostWinery] });

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
    
    useWineryDataStore.setState({ persistentWineries: [ghostWinery] });

    await useWineryStore.getState().ensureWineryDetails(ghostWinery.id);

    expect(mockRpc).toHaveBeenCalledWith('get_winery_details_by_id', { p_winery_id: 123 });
  });
});

describe('WineryUIStore: fetchWineryData', () => {
  let useWineryStore: any;
  let useWineryDataStore: any;
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
    useWineryDataStore = require('../wineryDataStore').useWineryDataStore;
    
    useWineryStore.getState().reset();
    useWineryDataStore.getState().reset();
  });

  it('fetches map markers and hydrates them into useWineryDataStore', async () => {
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
    
    const persistentWineries = useWineryDataStore.getState().persistentWineries;
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
});