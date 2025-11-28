import { renderHook, waitFor } from '@testing-library/react';
import { useWineryData } from '../use-winery-data';

// Mock the toast hook
jest.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

// Mock the trip store
jest.mock('@/lib/stores/tripStore', () => ({
  useTripStore: () => ({ fetchUpcomingTrips: jest.fn() }),
}));

global.fetch = jest.fn();

describe('useWineryData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch and aggregate winery data correctly', async () => {
    // Mock API responses
    (global.fetch as jest.Mock).mockImplementation((url) => {
      if (url.includes('/api/visits')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ visits: [{ 
            id: 101, 
            wineries: { id: 1, google_place_id: 'place1', name: 'Visited Winery', address: 'A', latitude: '0', longitude: '0' } 
          }] }),
        });
      }
      if (url.includes('/api/favorites')) {
        return Promise.resolve({
          ok: true,
          json: async () => [{ id: 2, google_place_id: 'place2', name: 'Fav Winery', address: 'B', latitude: '0', longitude: '0' }],
        });
      }
      if (url.includes('/api/wishlist')) {
        return Promise.resolve({
          ok: true,
          json: async () => [{ id: 3, google_place_id: 'place3', name: 'Wishlist Winery', address: 'C', latitude: '0', longitude: '0' }],
        });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });

    const { result } = renderHook(() => useWineryData());

    // Wait for the effect to run and data to populate
    await waitFor(() => {
      expect(result.current.allPersistentWineries.length).toBeGreaterThan(0);
    });

    const wineries = result.current.allPersistentWineries;

    // Check Visited Winery
    const visited = wineries.find(w => w.id === 'place1');
    expect(visited).toBeDefined();
    expect(visited?.userVisited).toBe(true);

    // Check Favorite Winery
    const favorite = wineries.find(w => w.id === 'place2');
    expect(favorite).toBeDefined();
    expect(favorite?.isFavorite).toBe(true);

    // Check Wishlist Winery
    const wishlist = wineries.find(w => w.id === 'place3');
    expect(wishlist).toBeDefined();
    expect(wishlist?.onWishlist).toBe(true);
  });
});
