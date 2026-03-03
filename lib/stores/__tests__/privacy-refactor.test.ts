import { act } from '@testing-library/react';
import { createMockWinery } from '@/lib/test-utils/fixtures';

describe('Privacy Refactor Store Logic', () => {
  let useUserStore: any;
  let useWineryDataStore: any;
  let useVisitStore: any;
  let mockRpc: jest.Mock;

  beforeEach(() => {
    jest.resetModules();
    mockRpc = jest.fn().mockResolvedValue({ data: { success: true }, error: null });

    // Mock Supabase
    jest.doMock('@/utils/supabase/client', () => ({
      createClient: () => ({
        auth: {
          getUser: jest.fn().mockResolvedValue({ 
            data: { user: { id: 'user-123', email: 'test@example.com' } },
            error: null
          }),
          getSession: jest.fn().mockResolvedValue({
            data: { session: { user: { id: 'user-123' } } },
            error: null
          }),
        },
        from: (table: string) => ({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: table === 'profiles' ? { 
              id: 'user-123', 
              name: 'Test User', 
              email: 'test@example.com',
              privacy_level: 'public'
            } : {},
            error: null
          }),
          insert: jest.fn().mockResolvedValue({ data: [], error: null }),
          update: jest.fn().mockResolvedValue({ data: [], error: null }),
        }),
        rpc: mockRpc,
        storage: {
            from: () => ({
                upload: jest.fn().mockResolvedValue({ data: { path: 'path' }, error: null })
            })
        }
      }),
    }));

    // Re-require stores after mocks
    useUserStore = require('../userStore').useUserStore;
    useWineryDataStore = require('../wineryDataStore').useWineryDataStore;
    useVisitStore = require('../visitStore').useVisitStore;

    useUserStore.getState().reset();
    useWineryDataStore.getState().reset();
    useVisitStore.getState().reset();
  });

  describe('UserStore Privacy', () => {
    it('should update profile privacy level via RPC', async () => {
      await act(async () => {
        await useUserStore.getState().fetchUser();
      });

      await act(async () => {
        await useUserStore.getState().updatePrivacyLevel('private');
      });

      expect(useUserStore.getState().user.privacy_level).toBe('private');
      expect(mockRpc).toHaveBeenCalledWith('update_profile_privacy', { p_privacy_level: 'private' });
    });
  });

  describe('WineryDataStore Privacy', () => {
    it('should toggle favorite privacy via RPC', async () => {
      const winery = createMockWinery({ dbId: 1 as any, isFavorite: true, favoriteIsPrivate: false });
      
      act(() => {
        useWineryDataStore.getState().upsertWinery(winery);
      });

      await act(async () => {
        await useWineryDataStore.getState().toggleFavoritePrivacy(winery.id);
      });

      const updated = useWineryDataStore.getState().getWinery(winery.id);
      expect(updated.favoriteIsPrivate).toBe(true);
      expect(mockRpc).toHaveBeenCalledWith('toggle_favorite_privacy', { p_winery_id: 1 });
    });

    it('should toggle wishlist privacy via RPC', async () => {
      const winery = createMockWinery({ dbId: 2 as any, onWishlist: true, wishlistIsPrivate: false });
      
      act(() => {
        useWineryDataStore.getState().upsertWinery(winery);
      });

      await act(async () => {
        await useWineryDataStore.getState().toggleWishlistPrivacy(winery.id);
      });

      const updated = useWineryDataStore.getState().getWinery(winery.id);
      expect(updated.wishlistIsPrivate).toBe(true);
      expect(mockRpc).toHaveBeenCalledWith('toggle_wishlist_privacy', { p_winery_id: 2 });
    });
  });

  describe('VisitStore Privacy', () => {
    it('should save a visit with is_private flag', async () => {
      const winery = createMockWinery({ dbId: 3 as any });
      const visitData = {
        visit_date: '2026-03-02',
        rating: 5,
        user_review: 'Private test',
        photos: [],
        is_private: true
      };

      mockRpc.mockResolvedValue({ data: { visit_id: 100 }, error: null });

      await act(async () => {
        await useVisitStore.getState().saveVisit(winery, visitData);
      });

      expect(mockRpc).toHaveBeenCalledWith('log_visit', expect.objectContaining({
        p_visit_data: expect.objectContaining({
          is_private: true
        })
      }));
    });
  });
});
