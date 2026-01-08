import { act } from '@testing-library/react';
import { createMockWinery } from '@/lib/test-utils/fixtures';

describe('VisitStore Offline Logic', () => {
  const originalOnLine = navigator.onLine;
  let useVisitStore: any;
  let offlineQueueMock: any;

  beforeEach(() => {
    jest.resetModules();
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true });

    // Mock idb-keyval to prevent global scope errors
    jest.doMock('idb-keyval', () => ({
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    }));

    // Mock Offline Queue
    offlineQueueMock = {
      addOfflineMutation: jest.fn(),
      getOfflineMutations: jest.fn(),
      removeOfflineMutation: jest.fn(),
    };
    jest.doMock('@/lib/utils/offline-queue', () => offlineQueueMock);

    // Mock Supabase
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
        rpc: jest.fn().mockResolvedValue({ data: { visit_id: 999 }, error: null }),
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
        }),
      },
    }));

    // Re-require store after mocks
    useVisitStore = require('../visitStore').useVisitStore;
    // Reset store state if needed, though resetModules should handle it
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

    expect(offlineQueueMock.addOfflineMutation).toHaveBeenCalledWith(expect.objectContaining({
      type: 'create',
      winery: expect.objectContaining({ id: winery.id }),
      visitData: expect.objectContaining({ user_review: 'Offline review' })
    }));

    const visits = useVisitStore.getState().visits;
    expect(visits).toHaveLength(1);
    expect(visits[0].user_review).toBe('Offline review');
    expect(String(visits[0].id)).toContain('temp-');
  });

  it('should sync offline visits when online', async () => {
    const mockOfflineMutation = {
      id: 'temp-123',
      type: 'create' as const,
      timestamp: 123456789,
      winery: createMockWinery(),
      visitData: {
        visit_date: '2023-01-01',
        user_review: 'Synced review',
        rating: 5,
        photos: []
      }
    };

    offlineQueueMock.getOfflineMutations.mockResolvedValue([mockOfflineMutation]);

    await act(async () => {
      await useVisitStore.getState().syncOfflineVisits();
    });

    expect(offlineQueueMock.removeOfflineMutation).toHaveBeenCalledWith('temp-123');
  });
});
