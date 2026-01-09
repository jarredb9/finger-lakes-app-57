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
      visits: [createMockVisit()]
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

    expect(mockRpc).toHaveBeenCalledWith('get_winery_details_by_id', { winery_id_param: 123 });
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

    expect(mockRpc).toHaveBeenCalledWith('get_winery_details_by_id', { winery_id_param: 123 });
  });
});