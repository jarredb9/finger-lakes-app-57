import { act } from 'react';
import { useWineryStore } from '../wineryStore';
import { Winery } from '@/lib/types';

// Mock the global fetch function
global.fetch = jest.fn();

// Mock server actions to avoid "cookies() called outside request scope" error
jest.mock('@/app/actions', () => ({
  toggleFavorite: jest.fn(),
  getFavorites: jest.fn().mockResolvedValue({ success: true, data: [] }),
}));

jest.mock('@/utils/supabase/client', () => ({
  createClient: jest.fn(),
}));

import { toggleFavorite } from '@/app/actions';
import { createClient } from '@/utils/supabase/client';

const resetStore = () => {
  useWineryStore.setState({
    wineries: [],
    visitedWineries: [],
    wishlistWineries: [],
    favoriteWineries: [],
    persistentWineries: [],
    isLoading: false,
    isTogglingWishlist: false,
    isTogglingFavorite: false,
    error: null,
    _wineriesBackup: null,
  });
};

describe('wineryStore', () => {
  beforeEach(() => {
    resetStore();
    jest.clearAllMocks();
    
    const mockRpc = jest.fn().mockImplementation((rpcName) => {
        if (rpcName === 'get_map_markers') {
            return Promise.resolve({ data: [], error: null });
        }
        if (rpcName === 'get_all_user_visits_list') {
            return Promise.resolve({ data: [], error: null });
        }
        if (rpcName === 'get_winery_details_by_id') {
            return Promise.resolve({ data: [], error: null });
        }
        if (rpcName === 'ensure_winery') {
            // Mock to return a dummy dbId for ensure_winery RPC
            return Promise.resolve({ data: 999, error: null }); 
        }
        return Promise.resolve({ data: null, error: { message: "Unknown Mock RPC" } });
    });

    (createClient as jest.Mock).mockReturnValue({
      rpc: mockRpc,
    });
  });

  describe('fetchWineryData', () => {
      it('should fetch and merge markers and visits correctly', async () => {
          const mockMarkers = [
              { id: 100, google_place_id: 'place_A', name: 'Winery A', lat: 10, lng: 10, is_favorite: true, user_visited: true }
          ];
          const mockVisits = [
              { id: 1, winery_id: 100, visit_date: '2025-01-01', rating: 5, user_review: 'Great!' }
          ];

          const mockRpc = jest.fn().mockImplementation((rpcName) => {
            if (rpcName === 'get_map_markers') return Promise.resolve({ data: mockMarkers, error: null });
            if (rpcName === 'get_all_user_visits_list') return Promise.resolve({ data: mockVisits, error: null });
            return Promise.resolve({ data: null, error: null });
          });
          (createClient as jest.Mock).mockReturnValue({ rpc: mockRpc });

          await act(async () => {
              await useWineryStore.getState().fetchWineryData();
          });

          const state = useWineryStore.getState();
          expect(state.persistentWineries).toHaveLength(1);
          expect(state.persistentWineries[0].name).toBe('Winery A');
          expect(state.persistentWineries[0].visits).toHaveLength(1);
          expect(state.persistentWineries[0].visits![0].user_review).toBe('Great!');
          expect(state.visitedWineries).toHaveLength(1);
          expect(state.favoriteWineries).toHaveLength(1);
      });
  });

  describe('toggleFavorite', () => {
    it('should optimistically add to favorites', async () => {
      const mockWinery: Winery = { 
        id: 'place1', 
        name: 'Winery 1', 
        address: '123 Main St', 
        lat: 0, 
        lng: 0, 
        isFavorite: false 
      };
      useWineryStore.setState({ persistentWineries: [mockWinery] });

      // Mock RPC to return the winery as favorited when fetchWineryData is called
      const mockRpc = jest.fn().mockImplementation((rpcName) => {
        if (rpcName === 'get_map_markers') {
             return Promise.resolve({ 
                 data: [{ 
                     id: 1, google_place_id: 'place1', name: 'Winery 1', 
                     lat: 0, lng: 0, address: '123 Main St', 
                     is_favorite: true, on_wishlist: false, user_visited: false 
                 }], 
                 error: null 
             });
        }
        if (rpcName === 'get_all_user_visits_list') return Promise.resolve({ data: [], error: null });
        return Promise.resolve({ data: null, error: null });
      });
      (createClient as jest.Mock).mockReturnValue({ rpc: mockRpc });

      // Mock the server action success
      (toggleFavorite as jest.Mock).mockResolvedValue({ success: true });
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true }); 

      await act(async () => {
        await useWineryStore.getState().toggleFavorite(mockWinery, false);
      });

      const state = useWineryStore.getState();
      const updatedWinery = state.persistentWineries.find(w => w.id === 'place1');
      
      expect(updatedWinery?.isFavorite).toBe(true);
      expect(state.favoriteWineries).toHaveLength(1);
      expect(state.favoriteWineries[0].id).toBe('place1');
    });

    it('should revert favorite update on error', async () => {
      const mockWinery: Winery = { 
        id: 'place1', 
        name: 'Winery 1', 
        address: '123 Main St', 
        lat: 0, 
        lng: 0, 
        isFavorite: false 
      };
      useWineryStore.setState({ persistentWineries: [mockWinery] });

      // Mock RPC to return ORIGINAL state (not favorited) in case fetchWineryData is called (though it shouldn't be on error ideally, or if it is, it reverts)
      // But logic says: revert on error. So we check the revert state.
      
      // Mock the server action failure
      (toggleFavorite as jest.Mock).mockResolvedValue({ success: false, error: "Failed" });

      await expect(
        useWineryStore.getState().toggleFavorite(mockWinery, false)
      ).rejects.toThrow();

      const state = useWineryStore.getState();
      const updatedWinery = state.persistentWineries.find(w => w.id === 'place1');
      
      expect(updatedWinery?.isFavorite).toBe(false);
      expect(state.favoriteWineries).toHaveLength(0);
    });
  });

  describe('toggleWishlist', () => {
    it('should optimistically add to wishlist', async () => {
      const mockWinery: Winery = { 
        id: 'place2', 
        name: 'Winery 2', 
        address: '456 Vine St', 
        lat: 0, 
        lng: 0, 
        onWishlist: false 
      };
      useWineryStore.setState({ persistentWineries: [mockWinery] });
      
      // Mock RPC to return the winery as wishlisted
      const mockRpc = jest.fn().mockImplementation((rpcName) => {
        if (rpcName === 'get_map_markers') {
             return Promise.resolve({ 
                 data: [{ 
                     id: 2, google_place_id: 'place2', name: 'Winery 2', 
                     lat: 0, lng: 0, address: '456 Vine St', 
                     is_favorite: false, on_wishlist: true, user_visited: false 
                 }], 
                 error: null 
             });
        }
        if (rpcName === 'get_all_user_visits_list') return Promise.resolve({ data: [], error: null });
         // Mock ensureWineryDetails calls if any
        if (rpcName === 'get_winery_details_by_id') return Promise.resolve({ data: [], error: null });

        return Promise.resolve({ data: null, error: null });
      });
      (createClient as jest.Mock).mockReturnValue({ rpc: mockRpc });

      (global.fetch as jest.Mock).mockResolvedValue({ ok: true });

      await act(async () => {
        await useWineryStore.getState().toggleWishlist(mockWinery, false);
      });

      const state = useWineryStore.getState();
      const updatedWinery = state.persistentWineries.find(w => w.id === 'place2');
      
      expect(updatedWinery?.onWishlist).toBe(true);
      expect(state.wishlistWineries).toHaveLength(1);
    });
  });

  describe('ensureWineryInDb', () => {
    it('should verify winery in DB and update local state with dbId', async () => {
      const mockWinery: Winery = { 
        id: 'place3', 
        name: 'Winery 3', 
        address: '789 Grape Ln', 
        lat: 0, 
        lng: 0 
      };
      // Initially, no dbId
      useWineryStore.setState({ persistentWineries: [mockWinery] });

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ dbId: 999 }),
      });

      await act(async () => {
        await useWineryStore.getState().ensureWineryInDb(mockWinery);
      });

      const state = useWineryStore.getState();
      const updatedWinery = state.persistentWineries.find(w => w.id === 'place3');
      
      expect(updatedWinery?.dbId).toBe(999);
    });
  });
});
