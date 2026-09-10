import { createClient } from '@/utils/supabase/client';
import { WineryDbId, Winery } from '@/lib/types';

// --- E2E Helpers ---
const shouldSkipRealSync = () => {
    const isE2E = typeof window !== 'undefined' && process.env.NEXT_PUBLIC_IS_E2E === 'true';
    if (!isE2E) return false;
    // @ts-ignore
    const globalVal = !!(globalThis as any)._E2E_ENABLE_REAL_SYNC;
    const localVal = typeof window !== 'undefined' && localStorage.getItem('_E2E_ENABLE_REAL_SYNC') === 'true';
    return !(globalVal || localVal);
};

export const WineryService = {
  /**
   * Standardizes winery data for Supabase RPCs.
   */
  getRpcData: (winery: Partial<Winery>) => ({
      id: winery.id,
      name: winery.name || '',
      address: winery.address || '',
      latitude: winery.latitude || 0,
      longitude: winery.longitude || 0,
      phone: winery.phone || null,
      website: winery.website || null,
      rating: winery.rating || null,
      user_rating_count: winery.userRatingCount || null,
  }),

  /**
   * Ensures a winery exists in the database by its Google Place ID.
   * If it doesn't exist, it upserts the winery record using the provided data.
   * Returns the database ID (integer).
   */
  ensureInDb: async (winery: Winery): Promise<WineryDbId | null> => {
    // Check if we already have a valid database ID in the store state
    const currentDbId = winery.dbId;
    const isE2E = typeof window !== 'undefined' && process.env.NEXT_PUBLIC_IS_E2E === 'true';
    const skipRealSync = shouldSkipRealSync();

    if (typeof currentDbId === 'number' && !isNaN(currentDbId) && currentDbId > 0) {
        // In E2E with real sync, mock markers might have pre-assigned mock IDs like 1, 2, 3.
        // We must not trust these mock IDs and instead query the database to get the real ID.
        if (!isE2E || skipRealSync) {
            return currentDbId;
        }
    }

    // Atomic State Injection / Mocking for E2E
    if (isE2E && skipRealSync) {
        const mockId = 999000 + Math.floor(Math.random() * 1000);
        return mockId as WineryDbId;
    }

    const supabase = createClient();
    
    // Prepare standardized RPC data
    const rpcData = WineryService.getRpcData(winery);
    
    try {
        // The 'ensure_winery' RPC handles the UPSERT and returns the integer ID
        const { data: dbId, error } = await supabase.rpc('ensure_winery', { 
            p_winery_data: rpcData 
        });

        if (error || !dbId) {
            console.error("[WineryService] ensure_winery failed:", error);
            return null;
        }

        return Number(dbId) as WineryDbId;
    } catch (err) {
        console.error("[WineryService] ensureInDb Exception:", err);
        return null;
    }
  },

  /**
   * Toggles the favorite status of a winery.
   * Consumes composite RPC response in a single network roundtrip (BE-10).
   */
  toggleFavorite: async (winery: Winery): Promise<{ isFavorite: boolean; dbId: WineryDbId | null }> => {
    const supabase = createClient();
    
    const rpcWineryData = WineryService.getRpcData(winery);

    const { data, error } = await supabase.rpc('toggle_favorite', { 
        p_winery_data: rpcWineryData 
    });

    if (error) throw error;

    const payload = data as { is_favorite?: boolean; winery_id?: number } | boolean | null;
    const isFavorite = typeof payload === 'object' && payload !== null && 'is_favorite' in payload
      ? !!payload.is_favorite
      : !!payload;
    const dbId = typeof payload === 'object' && payload !== null && 'winery_id' in payload && payload.winery_id
      ? (Number(payload.winery_id) as WineryDbId)
      : null;

    return { isFavorite, dbId };
  },

  /**
   * Toggles the wishlist status of a winery.
   * Consumes composite RPC response in a single network roundtrip (BE-10).
   */
  toggleWishlist: async (winery: Winery): Promise<{ onWishlist: boolean; dbId: WineryDbId | null }> => {
    const supabase = createClient();
    
    const rpcWineryData = WineryService.getRpcData(winery);

    const { data, error } = await supabase.rpc('toggle_wishlist', { 
        p_winery_data: rpcWineryData 
    });

    if (error) throw error;

    const payload = data as { on_wishlist?: boolean; winery_id?: number } | boolean | null;
    const onWishlist = typeof payload === 'object' && payload !== null && 'on_wishlist' in payload
      ? !!payload.on_wishlist
      : !!payload;
    const dbId = typeof payload === 'object' && payload !== null && 'winery_id' in payload && payload.winery_id
      ? (Number(payload.winery_id) as WineryDbId)
      : null;

    return { onWishlist, dbId };
  },

  /**
   * Toggles favorite privacy for a winery. Requires a DB ID.
   */
  toggleFavoritePrivacy: async (winery: Winery) => {
    const dbId = await WineryService.ensureInDb(winery);
    if (!dbId) throw new Error("No DB ID available for winery " + winery.id);

    const supabase = createClient();
    const { data, error } = await supabase.rpc('toggle_favorite_privacy', {
        p_winery_id: dbId
    });

    if (error) {
        throw error;
    }

    return { 
        success: data.success, 
        isPrivate: data.is_private,
        dbId
    };
  },
  /**
   * Toggles wishlist privacy for a winery. Requires a DB ID.
   */
  toggleWishlistPrivacy: async (winery: Winery) => {
    const dbId = await WineryService.ensureInDb(winery);
    if (!dbId) throw new Error("No DB ID available for winery " + winery.id);

    const supabase = createClient();
    const { data, error } = await supabase.rpc('toggle_wishlist_privacy', { 
        p_winery_id: dbId 
    });

    if (error) throw error;

    return { 
        success: data.success, 
        isPrivate: data.is_private,
        dbId
    };
  },
  /**
   * Saves or updates a winery in the database.
   * Full enrichment persistence is delegated to the get-winery-details Edge Function.
   */
  upsertEnrichedWinery: async (winery: Winery): Promise<WineryDbId | null> => {
    return WineryService.ensureInDb(winery);
  }
};

