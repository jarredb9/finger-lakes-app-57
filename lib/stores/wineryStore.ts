import { createWithEqualityFn } from 'zustand/traditional';
import { Winery, Visit, GooglePlaceId, WineryDbId } from '@/lib/types';
import { useWineryDataStore } from './wineryDataStore';
import { createClient } from '@/utils/supabase/client';

/**
 * WineryUIStore
 * 
 * Responsibilities:
 * 1. Filtering and Derived Views (Favorites, Wishlist, Visited)
 * 2. UI Loading States (Specific ID loading)
 * 3. Fetching heavy details (lazy loading) and pushing them to DataStore
 */

interface WineryUIState {
  // Derived State (Getters)
  getWineries: () => Winery[];
  getVisited: () => Winery[];
  getWishlist: () => Winery[];
  getFavorites: () => Winery[];
  error: string | null;
  
  // UI State
  loadingWineryId: string | null;
  
  // Actions
  fetchWineryData: (userId: string) => Promise<void>; // Proxies to DataStore
  ensureWineryDetails: (placeId: GooglePlaceId) => Promise<Winery | null>;
  
  // Proxy Actions (For convenience/compatibility)
  toggleWishlist: (winery: Winery, isOn: boolean) => Promise<void>;
  toggleFavorite: (winery: Winery, isFav: boolean) => Promise<void>;
  addVisitToWinery: (wineryId: GooglePlaceId, visit: Visit) => void;
  optimisticallyUpdateVisit: (visitId: string, visitData: Partial<Visit>) => void;
  optimisticallyDeleteVisit: (visitId: string) => void;
  replaceVisit: (wineryId: GooglePlaceId, tempId: string, finalVisit: Visit) => void;
  confirmOptimisticUpdate: (updatedVisit?: Visit) => void;
  revertOptimisticUpdate: () => void;
  updateWinery: (id: GooglePlaceId, updates: Partial<Winery>) => void;
  reset: () => void;
}

export const useWineryStore = createWithEqualityFn<WineryUIState>((set) => ({
  loadingWineryId: null,

  getWineries: () => useWineryDataStore.getState().persistentWineries,
  getVisited: () => useWineryDataStore.getState().persistentWineries.filter(w => w.userVisited),
  getWishlist: () => useWineryDataStore.getState().persistentWineries.filter(w => w.onWishlist),
  getFavorites: () => useWineryDataStore.getState().persistentWineries.filter(w => w.isFavorite),
  
  // Proxy error correctly (Note: state.error might not be reactive if not used in a hook)
  get error() { return useWineryDataStore.getState().error; },

  fetchWineryData: async (userId: string) => {
      await useWineryDataStore.getState().hydrateWineries(userId);
  },

  ensureWineryDetails: async (placeId: GooglePlaceId) => {
    const dataStore = useWineryDataStore.getState();
    const existing = dataStore.getWinery(placeId);

    if (existing && existing.openingHours !== undefined) {
        return existing;
    }

    set({ loadingWineryId: placeId });

    try {
        const supabase = createClient();
        let dbData = null;

        // 1. Try DB details
        if (existing?.dbId) {
            const { data } = await supabase.rpc('get_winery_details_by_id', { winery_id_param: existing.dbId });
            if (data && data.length > 0) dbData = data[0];
        }

        // 2. If valid DB data found, upsert to DataStore
        if (dbData && dbData.opening_hours) {
            const updated = dataStore.upsertWinery({ ...dbData, id: dbData.google_place_id || dbData.id as number }); // id from Db is number
            set({ loadingWineryId: null });
            return updated;
        }

        // 3. Fallback to Google API (if alphanumeric place ID)
        if (!/^\d+$/.test(placeId)) {
            const { data: googleData, error } = await supabase.functions.invoke('get-winery-details', {
                body: { placeId }
            });

            if (!error && googleData) {
                const updated = dataStore.upsertWinery(googleData);
                set({ loadingWineryId: null });
                return updated;
            } else if (error) {
                console.error("Edge Function failed:", error);
            }
        }
    } catch (error) {
        console.error("Details fetch failed:", error);
    }

    set({ loadingWineryId: null });
    return existing || null;
  },

  // Proxies to DataStore actions
  toggleWishlist: async (winery, _isOn) => {
      await useWineryDataStore.getState().toggleWishlist(winery.id);
  },
  
  toggleFavorite: async (winery, _isFav) => {
      await useWineryDataStore.getState().toggleFavorite(winery.id);
  },
  
  addVisitToWinery: (id, visit) => useWineryDataStore.getState().addVisit(id, visit),
  
  optimisticallyUpdateVisit: (id, data) => useWineryDataStore.getState().updateVisit(id, data),
  
  optimisticallyDeleteVisit: (id) => useWineryDataStore.getState().removeVisit(id),
  
  replaceVisit: (wineryId, tempId, final) => {
      useWineryDataStore.getState().removeVisit(tempId);
      useWineryDataStore.getState().addVisit(wineryId, final);
  },
  
  // These are now handled implicitly by DataStore atomic updates, 
  // but kept for interface compatibility if complex rollback needed
  confirmOptimisticUpdate: () => {}, 
  revertOptimisticUpdate: () => {},

  updateWinery: (id: GooglePlaceId, updates) => {
      const existing = useWineryDataStore.getState().getWinery(id);
      if (existing) {
          useWineryDataStore.getState().upsertWinery({ ...existing, ...updates });
      }
  },

  reset: () => set({
    loadingWineryId: null,
  }),
}));

// Backward compatibility helper
export const findWineryByDbId = (dbId: number) => {
    return useWineryDataStore.getState().persistentWineries.find(w => w.dbId === (dbId as WineryDbId));
};
