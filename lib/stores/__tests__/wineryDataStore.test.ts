import { act } from '@testing-library/react';
import { createMockWinery, createMockVisit, createMockMapMarkerRpc } from '@/lib/test-utils/fixtures';
import { WineryDbId, GooglePlaceId } from '@/lib/types';

describe('WineryDataStore', () => {
  let useWineryDataStore: any;
  let mockRpc: any;

  beforeEach(() => {
    jest.resetModules();
    mockRpc = jest.fn();

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

    mockRpc.mockResolvedValue({ data: [freshMarker], error: null });

    // 3. Trigger Hydration
    await act(async () => {
      await useWineryDataStore.getState().hydrateWineries('user-123');
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
});
