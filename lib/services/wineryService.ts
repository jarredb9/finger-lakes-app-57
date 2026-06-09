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
    if (typeof currentDbId === 'number' && !isNaN(currentDbId) && currentDbId > 0) {
        return currentDbId;
    }

    // Atomic State Injection / Mocking for E2E
    const isE2E = typeof window !== 'undefined' && process.env.NEXT_PUBLIC_IS_E2E === 'true';
    if (isE2E && shouldSkipRealSync()) {
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
   * Internally ensures the winery exists in the DB first.
   */
  toggleFavorite: async (winery: Winery): Promise<{ isFavorite: boolean; dbId: WineryDbId | null }> => {
    const supabase = createClient();
    
    const rpcWineryData = WineryService.getRpcData(winery);

    const { data: isFavorite, error } = await supabase.rpc('toggle_favorite', { 
        p_winery_data: rpcWineryData 
    });

    if (error) throw error;

    // After a successful toggle, we MUST get the dbId to keep the store in sync
    const dbId = await WineryService.ensureInDb(winery);
    
    return { isFavorite: !!isFavorite, dbId };
  },

  /**
   * Toggles the wishlist status of a winery.
   * Internally ensures the winery exists in the DB first.
   */
  toggleWishlist: async (winery: Winery): Promise<{ onWishlist: boolean; dbId: WineryDbId | null }> => {
    const supabase = createClient();
    
    const rpcWineryData = WineryService.getRpcData(winery);

    const { data: onWishlist, error } = await supabase.rpc('toggle_wishlist', { 
        p_winery_data: rpcWineryData 
    });

    if (error) throw error;

    const dbId = await WineryService.ensureInDb(winery);
    
    return { onWishlist: !!onWishlist, dbId };
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
        isPrivate: data.is_private 
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
        isPrivate: data.is_private 
    };
  },
  /**
   * Saves or updates a fully enriched winery in the database.
   */
  upsertEnrichedWinery: async (winery: Winery): Promise<WineryDbId | null> => {
    const isE2E = typeof window !== 'undefined' && process.env.NEXT_PUBLIC_IS_E2E === 'true';
    if (isE2E && shouldSkipRealSync()) {
        const mockId = 999000 + Math.floor(Math.random() * 1000);
        return mockId as WineryDbId;
    }

    const supabase = createClient();
    
    // Prepare DB JSON (snake_case)
    const dbData = {
      google_place_id: winery.id,
      name: winery.name,
      address: winery.address,
      latitude: winery.latitude,
      longitude: winery.longitude,
      website: winery.website || null,
      google_rating: winery.rating || null,
      user_rating_count: winery.userRatingCount || null,
      enrichment_tier: winery.enrichment_tier || 'enriched',
      last_enriched_at: winery.last_enriched_at || new Date().toISOString(),
      generative_summary: winery.generative_summary ? { overview: { text: winery.generative_summary } } : null,
      neighborhood_summary: winery.neighborhood_summary ? { overview: { text: winery.neighborhood_summary } } : null,
      allows_dogs: winery.allows_dogs ?? null,
      has_ev_charging: winery.has_ev_charging ?? null,
      serves_wine: winery.serves_wine ?? null,
      good_for_children: winery.good_for_children ?? null,
      outdoor_seating: winery.outdoor_seating ?? null,
    };

    try {
      const { error } = await supabase.rpc('bulk_upsert_wineries', {
        p_wineries_data: [dbData]
      });

      if (error) {
        console.error("[WineryService] bulk_upsert_wineries failed:", error);
        return null;
      }

      // Now query the DB to get the integer ID that was assigned
      const { data, error: selectError } = await supabase
        .from('wineries')
        .select('id')
        .eq('google_place_id', winery.id)
        .single();

      if (selectError || !data) {
        console.error("[WineryService] Failed to retrieve dbId after upsert:", selectError);
        return null;
      }

      return Number(data.id) as WineryDbId;
    } catch (err) {
      console.error("[WineryService] upsertEnrichedWinery Exception:", err);
      return null;
    }
  }
};

