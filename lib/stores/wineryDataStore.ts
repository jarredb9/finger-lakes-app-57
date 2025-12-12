import { createWithEqualityFn } from 'zustand/traditional';
import { Winery, Visit } from '@/lib/types';
import { createClient } from '@/utils/supabase/client';
import { standardizeWineryData } from '@/lib/utils/winery';
import { toggleFavorite } from '@/app/actions';

interface WineryDataState {
  persistentWineries: Winery[]; // The Master Cache
  isLoading: boolean;
  error: string | null;
  _backup: Winery[] | null; // For rollback

  // Actions
  hydrateWineries: () => Promise<void>;
  upsertWinery: (data: any) => Winery | null;
  getWinery: (id: string) => Winery | undefined;
  
  // Data Mutations
  addVisit: (wineryId: string, visit: Visit) => void;
  updateVisit: (visitId: string, updates: Partial<Visit>) => void;
  removeVisit: (visitId: string) => void;
  
  // User Actions
  toggleFavorite: (wineryId: string) => Promise<void>;
  toggleWishlist: (wineryId: string) => Promise<void>;
  
  // Sync
  ensureInDb: (wineryId: string) => Promise<number | null>;
}

export const useWineryDataStore = createWithEqualityFn<WineryDataState>((set, get) => ({
  persistentWineries: [],
  isLoading: false,
  error: null,
  _backup: null,

  getWinery: (id) => get().persistentWineries.find(w => w.id === id),

  hydrateWineries: async () => {
    set({ isLoading: true, error: null });
    const supabase = createClient();
    try {
      const [markersResult, visitsResult] = await Promise.all([
        supabase.rpc('get_map_markers'),
        supabase.rpc('get_all_user_visits_list')
      ]);

      if (markersResult.error) throw markersResult.error;
      const markers = markersResult.data || [];
      const visits = visitsResult.data || [];

      // Create a map of visits for O(1) lookup
      const visitsMap = new Map<number, Visit[]>();
      visits.forEach((v: any) => {
          if (!visitsMap.has(v.winery_id)) visitsMap.set(v.winery_id, []);
          visitsMap.get(v.winery_id)!.push({
              id: v.id,
              visit_date: v.visit_date,
              rating: v.rating,
              user_review: v.user_review,
              photos: v.photos
          });
      });

      const processedWineries = markers.map((m: any) => {
         const dbId = m.id;
         return standardizeWineryData({
             ...m,
             visits: visitsMap.get(dbId) || []
         });
      }).filter(Boolean) as Winery[];

      set({ persistentWineries: processedWineries, isLoading: false });
    } catch (err) {
      console.error("Hydration failed:", err);
      set({ error: "Failed to load data", isLoading: false });
    }
  },

  upsertWinery: (data) => {
      const existing = get().persistentWineries.find(w => w.id === (data.google_place_id || data.id));
      const standardized = standardizeWineryData(data, existing);
      
      if (standardized) {
          set(state => ({
              persistentWineries: existing 
                ? state.persistentWineries.map(w => w.id === standardized.id ? standardized : w)
                : [...state.persistentWineries, standardized]
          }));
      }
      return standardized;
  },

  addVisit: (wineryId, visit) => {
      set(state => ({
          persistentWineries: state.persistentWineries.map(w => 
              w.id === wineryId ? { ...w, userVisited: true, visits: [visit, ...(w.visits || [])] } : w
          )
      }));
  },

  updateVisit: (visitId, updates) => {
      set(state => {
          // Backup for rollback if needed (implied context)
          return {
              persistentWineries: state.persistentWineries.map(w => {
                  if (!w.visits?.some(v => v.id === visitId)) return w;
                  return {
                      ...w,
                      visits: w.visits.map(v => v.id === visitId ? { ...v, ...updates } : v)
                  };
              })
          };
      });
  },

  removeVisit: (visitId) => {
      set(state => ({
          persistentWineries: state.persistentWineries.map(w => {
               if (!w.visits?.some(v => v.id === visitId)) return w;
               const newVisits = w.visits.filter(v => v.id !== visitId);
               return { ...w, visits: newVisits, userVisited: newVisits.length > 0 };
          })
      }));
  },

  toggleFavorite: async (wineryId) => {
      const original = get().persistentWineries;
      const winery = original.find(w => w.id === wineryId);
      if (!winery) return;

      // Optimistic
      set({
          persistentWineries: original.map(w => w.id === wineryId ? { ...w, isFavorite: !w.isFavorite } : w)
      });

      try {
          const result = await toggleFavorite(winery);
          if (!result.success) throw new Error(result.error);
      } catch (err) {
          console.error("Fav toggle failed:", err);
          set({ persistentWineries: original }); // Revert
      }
  },
  
  toggleWishlist: async (wineryId) => {
    const original = get().persistentWineries;
    const winery = original.find(w => w.id === wineryId);
    if (!winery) return;
    
    const isOnWishlist = !!winery.onWishlist;

    // Optimistic
    set({
        persistentWineries: original.map(w => w.id === wineryId ? { ...w, onWishlist: !isOnWishlist } : w)
    });

    const supabase = createClient();
    try {
        if (isOnWishlist) {
            // Remove
            const dbId = winery.dbId;
            if (!dbId) throw new Error("Missing DB ID for removal");
             await fetch('/api/wishlist', { 
                method: 'DELETE', 
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify({ dbId }) 
            });
        } else {
            // Add (RPC)
            const rpcData = {
                id: winery.id,
                name: winery.name,
                address: winery.address,
                lat: winery.lat,
                lng: winery.lng,
                phone: winery.phone || null,
                website: winery.website || null,
                rating: winery.rating || null,
            };
            const { error } = await supabase.rpc('add_to_wishlist', { p_winery_data: rpcData });
            if (error) throw error;
        }
    } catch (err) {
        console.error("Wishlist toggle failed:", err);
        set({ persistentWineries: original }); // Revert
    }
  },

  ensureInDb: async (wineryId) => {
      const winery = get().persistentWineries.find(w => w.id === wineryId);
      if (!winery) return null;
      if (winery.dbId) return winery.dbId;

      const supabase = createClient();
      const rpcData = {
          id: winery.id,
          name: winery.name,
          address: winery.address,
          lat: winery.lat,
          lng: winery.lng,
          phone: winery.phone || null,
          website: winery.website || null,
          rating: winery.rating || null,
      };
      
      const { data: dbId, error } = await supabase.rpc('ensure_winery', { p_winery_data: rpcData });
      if (error || !dbId) return null;

      // Update store with new DB ID
      set(state => ({
          persistentWineries: state.persistentWineries.map(w => w.id === wineryId ? { ...w, dbId } : w)
      }));
      
      return dbId;
  }
}));
