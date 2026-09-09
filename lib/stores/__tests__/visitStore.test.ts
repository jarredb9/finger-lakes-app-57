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
    }));
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

  describe('Single Source of Truth for Visits (ST-03)', () => {
    it('queries visits by winery google place ID and numeric dbId via getVisitsByWinery sorted by visit_date descending', () => {
      const visit1 = {
        id: 1,
        user_id: 'user-123',
        visit_date: '2026-05-01',
        user_review: 'Spring visit',
        rating: 4,
        photos: [],
        winery_id: 10,
        wineryId: 'place-abc',
        wineries: { id: 10, google_place_id: 'place-abc', name: 'ABC Winery', address: '123 Road', latitude: 42, longitude: -76 }
      };
      const visit2 = {
        id: 2,
        user_id: 'user-123',
        visit_date: '2026-07-01',
        user_review: 'Summer visit',
        rating: 5,
        photos: [],
        winery_id: 10,
        wineryId: 'place-abc',
        wineries: { id: 10, google_place_id: 'place-abc', name: 'ABC Winery', address: '123 Road', latitude: 42, longitude: -76 }
      };
      const visitOther = {
        id: 3,
        user_id: 'user-123',
        visit_date: '2026-06-01',
        user_review: 'Other winery',
        rating: 3,
        photos: [],
        winery_id: 99,
        wineryId: 'place-other',
        wineries: { id: 99, google_place_id: 'place-other', name: 'Other Winery', address: '456 Road', latitude: 42, longitude: -76 }
      };

      useVisitStore.setState({ visits: [visit1, visitOther, visit2] });

      // Query by string place ID
      const byPlaceId = useVisitStore.getState().getVisitsByWinery('place-abc');
      expect(byPlaceId).toHaveLength(2);
      expect(byPlaceId[0].id).toBe(2); // Latest first
      expect(byPlaceId[1].id).toBe(1);

      // Query by numeric dbId
      const byDbId = useVisitStore.getState().getVisitsByWinery(10);
      expect(byDbId).toHaveLength(2);
      expect(byDbId[0].id).toBe(2);
      expect(byDbId[1].id).toBe(1);
    });

    it('updates a visit successfully when wineryStore has zero embedded visits', async () => {
      const originalVisit = {
        id: 42,
        user_id: 'user-123',
        visit_date: '2026-06-01',
        user_review: 'Old review',
        rating: 4,
        photos: ['photo-1.jpg'],
        winery_id: 10,
        wineryId: 'place-abc',
        syncStatus: 'synced',
        wineries: { id: 10, google_place_id: 'place-abc', name: 'ABC Winery', address: '123 Road', latitude: 42, longitude: -76 }
      };

      useVisitStore.setState({ visits: [originalVisit] });

      mockRpc.mockResolvedValueOnce({
        data: {
          visit_id: 42,
          winery_id: 10,
          visit_date: '2026-06-01',
          user_review: 'Updated review',
          rating: 5,
          photos: ['photo-1.jpg'],
          updated_at: '2026-06-01T12:00:00Z',
        },
        error: null,
      });

      await act(async () => {
        await useVisitStore.getState().updateVisit('42', { user_review: 'Updated review', rating: 5 });
      });

      const updated = useVisitStore.getState().visits.find((v: any) => v.id === 42);
      expect(updated).toBeDefined();
      expect(updated.user_review).toBe('Updated review');
      expect(updated.rating).toBe(5);
    });
  });
});

