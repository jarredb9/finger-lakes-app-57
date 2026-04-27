import { act } from '@testing-library/react';
import { createMockWinery } from '@/lib/test-utils/fixtures';
import { GooglePlaceId, WineryDbId } from '@/lib/types';

describe('visitStore SyncStore integration', () => {
  let useVisitStore: any;
  let useSyncStore: any;

  beforeEach(() => {
    jest.resetModules();

    // Mock SyncStore
    const mockAddMutation = jest.fn().mockResolvedValue(undefined);
    jest.doMock('@/lib/stores/syncStore', () => ({
      useSyncStore: {
        getState: jest.fn(() => ({
          addMutation: mockAddMutation,
          queue: [],
          initialize: jest.fn(),
        })),
      },
    }));

    jest.doMock('@/lib/stores/wineryStore', () => ({
      useWineryStore: {
        getState: jest.fn(() => ({
          addVisitToWinery: jest.fn(),
          replaceVisit: jest.fn(),
          optimisticallyDeleteVisit: jest.fn(),
          confirmOptimisticUpdate: jest.fn(),
          optimisticallyUpdateVisit: jest.fn(),
          revertOptimisticUpdate: jest.fn(),
          getWineries: jest.fn(() => []),
        })),
      },
    }));

    jest.doMock('@/lib/stores/wineryDataStore', () => ({
      useWineryDataStore: {
        getState: jest.fn(() => ({
          upsertWinery: jest.fn(),
        })),
      },
    }));

    jest.doMock('@/utils/supabase/client', () => ({
      createClient: jest.fn(() => ({
        auth: {
          getSession: jest.fn().mockResolvedValue({ data: { session: { user: { id: 'user-123' } } }, error: null }),
        },
      })),
    }));

    // Mock navigator.onLine to false
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: false,
      writable: true,
    });

    useVisitStore = require('../visitStore').useVisitStore;
    useSyncStore = require('@/lib/stores/syncStore').useSyncStore;
    
    useVisitStore.getState().reset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should enqueue log_visit mutation in SyncStore when offline', async () => {
    const winery = createMockWinery({ id: 'w1' as GooglePlaceId, dbId: 101 as WineryDbId, name: 'Test Winery' });
    const visitData = {
      visit_date: '2023-01-01',
      user_review: 'Great visit!',
      rating: 5,
      photos: [],
    };

    await act(async () => {
      await useVisitStore.getState().saveVisit(winery, visitData);
    });

    const addMutation = useSyncStore.getState().addMutation;
    expect(addMutation).toHaveBeenCalledWith(expect.objectContaining({
      type: 'log_visit',
      userId: 'user-123',
      payload: expect.objectContaining({
        wineryId: 'w1',
        wineryDbId: 101,
        visit_date: '2023-01-01',
      })
    }));
  });

  it('should enqueue update_visit mutation in SyncStore when offline', async () => {
    const visitId = 'v123';
    const visitData = { user_review: 'Updated review' };
    
    // Mock wineryStore to return a winery with this visit
    const { useWineryStore } = require('@/lib/stores/wineryStore');
    useWineryStore.getState.mockReturnValue({
        ...useWineryStore.getState(),
        getWineries: () => [createMockWinery({ visits: [{ id: visitId, wineryId: 'w1' } as any] })]
    });

    await act(async () => {
      await useVisitStore.getState().updateVisit(visitId, visitData, [], []);
    });

    const addMutation = useSyncStore.getState().addMutation;
    expect(addMutation).toHaveBeenCalledWith(expect.objectContaining({
      type: 'update_visit',
      userId: 'user-123',
      payload: expect.objectContaining({
        visitId: 'v123',
        visitData: expect.objectContaining({ user_review: 'Updated review' })
      })
    }));
  });

  it('should enqueue delete_visit mutation in SyncStore when offline', async () => {
    const visitId = 'v123';

    await act(async () => {
      await useVisitStore.getState().deleteVisit(visitId);
    });

    const addMutation = useSyncStore.getState().addMutation;
    expect(addMutation).toHaveBeenCalledWith(expect.objectContaining({
      type: 'delete_visit',
      userId: 'user-123',
      payload: expect.objectContaining({
        visitId: 'v123'
      })
    }));
  });
});
