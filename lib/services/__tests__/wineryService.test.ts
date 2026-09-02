import { WineryService } from '../wineryService';
import { createClient } from '@/utils/supabase/client';
import { createMockWinery } from '@/lib/test-utils/fixtures';

jest.mock('@/utils/supabase/client');

describe('WineryService - Single Roundtrip RPC Hardening (BE-10)', () => {
  const mockRpc = jest.fn();
  const mockSupabase = {
    rpc: mockRpc,
    from: jest.fn(),
  };

  const mockWinery = createMockWinery({
    id: 'place_12345' as any,
    name: 'Seneca Shore Wine Cellars',
    address: '9292 State Route 14, Penn Yan, NY',
    latitude: 42.6189,
    longitude: -76.9213,
    rating: 4.5,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (createClient as jest.Mock).mockReturnValue(mockSupabase);
  });

  describe('toggleFavorite', () => {
    it('executes a single toggle_favorite RPC call and avoids secondary ensure_winery roundtrip', async () => {
      mockRpc.mockResolvedValueOnce({
        data: { is_favorite: true, winery_id: 101 },
        error: null,
      });

      const result = await WineryService.toggleFavorite(mockWinery);

      expect(mockRpc).toHaveBeenCalledTimes(1);
      expect(mockRpc).toHaveBeenCalledWith('toggle_favorite', {
        p_winery_data: expect.objectContaining({
          id: 'place_12345',
          name: 'Seneca Shore Wine Cellars',
        }),
      });
      // Crucial: ensure_winery must NOT be called as a secondary roundtrip
      expect(mockRpc).not.toHaveBeenCalledWith('ensure_winery', expect.anything());

      expect(result).toEqual({
        isFavorite: true,
        dbId: 101,
      });
    });

    it('throws error when toggle_favorite RPC fails', async () => {
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: new Error('RPC failure'),
      });

      await expect(WineryService.toggleFavorite(mockWinery)).rejects.toThrow('RPC failure');
      expect(mockRpc).toHaveBeenCalledTimes(1);
    });
  });

  describe('toggleWishlist', () => {
    it('executes a single toggle_wishlist RPC call and avoids secondary ensure_winery roundtrip', async () => {
      mockRpc.mockResolvedValueOnce({
        data: { on_wishlist: true, winery_id: 101 },
        error: null,
      });

      const result = await WineryService.toggleWishlist(mockWinery);

      expect(mockRpc).toHaveBeenCalledTimes(1);
      expect(mockRpc).toHaveBeenCalledWith('toggle_wishlist', {
        p_winery_data: expect.objectContaining({
          id: 'place_12345',
          name: 'Seneca Shore Wine Cellars',
        }),
      });
      // Crucial: ensure_winery must NOT be called as a secondary roundtrip
      expect(mockRpc).not.toHaveBeenCalledWith('ensure_winery', expect.anything());

      expect(result).toEqual({
        onWishlist: true,
        dbId: 101,
      });
    });
  });
});
