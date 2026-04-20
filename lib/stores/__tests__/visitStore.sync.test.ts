import { act } from '@testing-library/react';
import { createMockVisit, createMockWinery } from '@/lib/test-utils/fixtures';

describe('visitStore sync locking', () => {
  let useVisitStore: any;

  beforeEach(() => {
    jest.resetModules();

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
          getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null }),
        },
        rpc: jest.fn().mockResolvedValue({ data: { visit_id: 'v1', winery_id: 1 }, error: null }),
        storage: {
          from: jest.fn(() => ({
            upload: jest.fn().mockResolvedValue({ data: {}, error: null }),
            remove: jest.fn().mockResolvedValue({ data: {}, error: null }),
          })),
        },
      })),
    }));

    // Mock navigator.onLine
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: true,
      writable: true,
    });

    useVisitStore = require('../visitStore').useVisitStore;
    useVisitStore.getState().reset();
    
    jest.spyOn(Date, 'now').mockReturnValue(1000);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should update lastActionTimestamp when saveVisit is called', async () => {
    const winery = createMockWinery();
    const visitData = {
      visit_date: '2023-01-01',
      user_review: 'Test',
      rating: 5,
      photos: [],
    };

    await act(async () => {
      await useVisitStore.getState().saveVisit(winery, visitData);
    });

    // We expect lastActionTimestamp to be set to 1000
    // Currently it might be lastMutation, but we will unify it to lastActionTimestamp
    expect(useVisitStore.getState().lastActionTimestamp).toBe(1000);
  });

  it('should update lastActionTimestamp when updateVisit is called', async () => {
    const visitId = 'v1';
    const visitData = { rating: 4 };
    
    // Setup state so updateVisit finds the visit
    const mockWinery = createMockWinery({ visits: [createMockVisit({ id: visitId } as any)] });
    const { useWineryStore } = require('@/lib/stores/wineryStore');
    useWineryStore.getState.mockReturnValue({
        ...useWineryStore.getState(),
        getWineries: () => [mockWinery]
    });

    await act(async () => {
      await useVisitStore.getState().updateVisit(visitId, visitData, [], []);
    });

    expect(useVisitStore.getState().lastActionTimestamp).toBe(1000);
  });

  it('should update lastActionTimestamp when deleteVisit is called', async () => {
    const visitId = 'v1';

    await act(async () => {
      await useVisitStore.getState().deleteVisit(visitId);
    });

    expect(useVisitStore.getState().lastActionTimestamp).toBe(1000);
  });

  it('should ignore stale subscription updates', async () => {
    const { useVisitStore: store } = require('../visitStore');
    
    // Set lastActionTimestamp to 2000
    act(() => {
      store.setState({ lastActionTimestamp: 2000 });
    });

    const mockFetchVisits = jest.fn();
    act(() => {
      store.setState({ fetchVisits: mockFetchVisits });
    });

    // Mock supabase channel
    const mockChannel = {
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn().mockImplementation(function(this: any) {
        // Trigger the callback with a stale updatedAt
        const callback = this.on.mock.calls.find((call: any) => call[0] === 'postgres_changes')[2];
        callback({
          new: { updated_at: new Date(500).toISOString() },
          old: {}
        });
        return this;
      }),
    };

    const { createClient } = require('@/utils/supabase/client');
    createClient.mockReturnValue({
      channel: () => mockChannel
    });

    await act(async () => {
      store.getState().subscribeToVisitUpdates();
    });

    // fetchVisits should NOT have been called because payload time (500) < lastActionTimestamp (2000) - 1000
    expect(mockFetchVisits).not.toHaveBeenCalled();
  });
});
