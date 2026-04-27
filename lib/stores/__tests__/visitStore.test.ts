import { act } from '@testing-library/react';
import { createMockWinery } from '@/lib/test-utils/fixtures';

describe('VisitStore Offline Logic', () => {
  const originalOnLine = navigator.onLine;
  let useVisitStore: any;
  let mockRpc: jest.Mock;
  let syncStoreMock: any;

  beforeEach(() => {
    jest.resetModules();
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true });

    // Mock SyncStore
    syncStoreMock = {
      getState: jest.fn().mockReturnValue({
        addMutation: jest.fn().mockResolvedValue(undefined),
        removeMutation: jest.fn().mockResolvedValue(undefined),
        getDecryptedPayload: jest.fn(),
      }),
    };
    jest.doMock('@/lib/stores/syncStore', () => ({
      useSyncStore: syncStoreMock,
    }));

    // Mock Supabase
    mockRpc = jest.fn().mockResolvedValue({ data: { visit_id: 999 }, error: null });
    jest.doMock('@/utils/supabase/client', () => ({
      createClient: () => ({
        auth: {
          getSession: jest.fn().mockResolvedValue({ 
            data: { session: { user: { id: 'user-123' } } } 
          }),
          getUser: jest.fn().mockResolvedValue({ 
            data: { user: { id: 'user-123' } } 
          }),
        },
        rpc: mockRpc,
        storage: {
          from: () => ({
            upload: jest.fn().mockResolvedValue({ error: null }),
            remove: jest.fn().mockResolvedValue({ error: null }),
          }),
        }
      }),
    }));

    // Mock WineryStore
    jest.doMock('../wineryStore', () => ({
      useWineryStore: {
        getState: jest.fn().mockReturnValue({
          addVisitToWinery: jest.fn(),
          replaceVisit: jest.fn(),
          optimisticallyDeleteVisit: jest.fn(),
          optimisticallyUpdateVisit: jest.fn(),
          confirmOptimisticUpdate: jest.fn(),
          revertOptimisticUpdate: jest.fn(),
          getWineries: jest.fn().mockReturnValue([]),
        }),
      },
    }));

    // Re-require store after mocks
    useVisitStore = require('../visitStore').useVisitStore;
    useVisitStore.getState().reset();
  });

  afterAll(() => {
    Object.defineProperty(navigator, 'onLine', { value: originalOnLine, writable: true });
  });

  it('should queue visit creation when offline', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true });

    const winery = createMockWinery();
    const visitData = {
      visit_date: '2023-01-01',
      user_review: 'Offline review',
      rating: 5,
      photos: []
    };

    await act(async () => {
      await useVisitStore.getState().saveVisit(winery, visitData);
    });

    // Check if SyncStore.addMutation was called
    expect(syncStoreMock.getState().addMutation).toHaveBeenCalledWith(expect.objectContaining({
      type: 'log_visit',
      userId: 'user-123',
      payload: expect.objectContaining({
        user_review: 'Offline review',
        wineryId: winery.id
      })
    }));

    const visits = useVisitStore.getState().visits;
    expect(visits).toHaveLength(1);
    expect(visits[0].user_review).toBe('Offline review');
    expect(String(visits[0].id)).toContain('temp-');
  });

  it('should include is_private flag in saveVisit', async () => {
    const winery = createMockWinery();
    const visitData = {
      visit_date: '2023-01-01',
      user_review: 'Private review',
      rating: 5,
      photos: [],
      is_private: true
    };

    await act(async () => {
      await useVisitStore.getState().saveVisit(winery, visitData);
    });

    expect(mockRpc).toHaveBeenCalledWith('log_visit', expect.objectContaining({
      p_visit_data: expect.objectContaining({
        is_private: true
      })
    }), expect.any(Object));
  });

  it('should handle offline errors by enqueuing', async () => {
    // Online but with a network-like error
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true });
    
    mockRpc.mockRejectedValue(new Error('Failed to fetch'));

    const winery = createMockWinery();
    const visitData = {
      visit_date: '2023-01-01',
      user_review: 'Error review',
      rating: 5,
      photos: []
    };

    await act(async () => {
      await useVisitStore.getState().saveVisit(winery, visitData);
    });

    expect(syncStoreMock.getState().addMutation).toHaveBeenCalledWith(expect.objectContaining({
      type: 'log_visit',
      payload: expect.objectContaining({
        user_review: 'Error review'
      })
    }));
  });
});
