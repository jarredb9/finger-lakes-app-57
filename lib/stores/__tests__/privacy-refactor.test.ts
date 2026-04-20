import { act } from 'react-dom/test-utils';
import { createMockWinery } from '@/lib/test-utils/fixtures';

describe('Privacy Refactor Store Logic', () => {
  let useWineryDataStore: any;
  let useVisitStore: any;
  let mockRpc: jest.Mock;
  let mockFrom: jest.Mock;

  beforeEach(() => {
    jest.resetModules();

    mockRpc = jest.fn((name) => {
      if (name === 'ensure_winery') {
        return Promise.resolve({ data: 101, error: null });
      }
      if (name === 'log_visit') {
        return Promise.resolve({ data: { visit_id: 123 }, error: null });
      }
      if (name === 'toggle_favorite_privacy' || name === 'toggle_wishlist_privacy') {
        return Promise.resolve({ data: { success: true, is_private: true }, error: null });
      }
      return Promise.resolve({ data: { success: true }, error: null });
    });

    mockFrom = jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn(() => Promise.resolve({ data: { photos: [] }, error: null }))
        }))
      }))
    }));

    jest.doMock('@/utils/supabase/client', () => ({
      createClient: () => ({
        rpc: mockRpc,
        from: mockFrom,
        auth: {
          getSession: jest.fn(() => Promise.resolve({ data: { session: { user: { id: 'test-user' } } }, error: null })),
          getUser: jest.fn(() => Promise.resolve({ data: { user: { id: 'test-user' } }, error: null }))
        },
        storage: {
          from: jest.fn(() => ({
            upload: jest.fn(() => Promise.resolve({ data: { path: 'test-path' }, error: null })),
            remove: jest.fn(() => Promise.resolve({ data: {}, error: null }))
          }))
        }
      })
    }));

    // Require stores after mocks
    useWineryDataStore = require('../wineryDataStore').useWineryDataStore;
    useVisitStore = require('../visitStore').useVisitStore;

    useWineryDataStore.getState().reset();
    useVisitStore.getState().reset();
  });

  describe('WineryDataStore Privacy', () => {
    it('should toggle favorite privacy via RPC', async () => {
      const winery = createMockWinery({ dbId: 101 as any, isFavorite: true, favoriteIsPrivate: false });
      
      act(() => {
        useWineryDataStore.getState().upsertWinery(winery);
      });

      await act(async () => {
        await useWineryDataStore.getState().toggleFavoritePrivacy(winery.id);
      });

      const updated = useWineryDataStore.getState().getWinery(winery.id);
      expect(updated!.favoriteIsPrivate).toBe(true);
      expect(mockRpc).toHaveBeenCalledWith('toggle_favorite_privacy', { p_winery_id: 101 }, expect.any(Object));
    });

    it('should toggle wishlist privacy via RPC', async () => {
      const winery = createMockWinery({ dbId: 101 as any, onWishlist: true, wishlistIsPrivate: false });
      
      act(() => {
        useWineryDataStore.getState().upsertWinery(winery);
      });

      await act(async () => {
        await useWineryDataStore.getState().toggleWishlistPrivacy(winery.id);
      });

      const updated = useWineryDataStore.getState().getWinery(winery.id);
      expect(updated!.wishlistIsPrivate).toBe(true);
      expect(mockRpc).toHaveBeenCalledWith('toggle_wishlist_privacy', { p_winery_id: 101 }, expect.any(Object));
    });
  });

  describe('VisitStore Privacy', () => {
    it('should save a visit with is_private flag', async () => {
      const winery = createMockWinery();
      const visitData = {
        visit_date: '2026-03-02',
        user_review: 'Private test',
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
  });
});
