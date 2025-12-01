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

import { toggleFavorite, getFavorites } from '@/app/actions';

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

      // Mock the server action success
      (toggleFavorite as jest.Mock).mockResolvedValue({ success: true });
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true }); // Keep fetch mock for subsequent fetchWineryData

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
