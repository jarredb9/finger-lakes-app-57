import { createWithEqualityFn } from 'zustand/traditional';
import { Winery, Visit, GooglePlaceId, WineryDbId, DbWinery, MapMarkerRpc, WineryDetailsRpc, DbWineryWithUserData } from '@/lib/types'; // Import new types
import { createClient } from '@/utils/supabase/client';
import { standardizeWineryData, GoogleWinery } from '@/lib/utils/winery'; // Import GoogleWinery

interface WineryDataState {
  persistentWineries: Winery[]; // The Master Cache
  isLoading: boolean;
  error: string | null;
  _backup: Winery[] | null; // For rollback

  // Actions
  hydrateWineries: (userId: string) => Promise<void>;
  upsertWinery: (data: DbWinery | GoogleWinery | MapMarkerRpc | WineryDetailsRpc | DbWineryWithUserData) => Winery | null; // Typed 'data'
  getWinery: (id: GooglePlaceId) => Winery | undefined; // Typed 'id'
  
  // Data Mutations
  addVisit: (wineryId: GooglePlaceId, visit: Visit) => void;
  updateVisit: (visitId: string, updates: Partial<Visit>) => void;
  removeVisit: (visitId: string) => void;
  
  // User Actions
  toggleFavorite: (wineryId: GooglePlaceId) => Promise<void>;
  toggleWishlist: (wineryId: GooglePlaceId) => Promise<void>;
  
  // Sync
  ensureInDb: (wineryId: GooglePlaceId) => Promise<WineryDbId | null>;
  reset: () => void;
}

export const useWineryDataStore = createWithEqualityFn<WineryDataState>((set, get) => ({
  persistentWineries: [],
  isLoading: false,
  error: null,
  _backup: null,

  getWinery: (id) => get().persistentWineries.find(w => w.id === id),

  hydrateWineries: async (userId: string) => {
    set({ isLoading: true, error: null });
    const supabase = createClient();
    try {
      // Use the lightweight RPC 
      const { data: markers, error: markersError } = await supabase.rpc('get_map_markers', { user_id_param: userId }); 
      if (markersError) throw markersError;

      const processedWineries = (markers as MapMarkerRpc[] || []).map((m) => { // Cast here
         return standardizeWineryData(m); // Pass m directly
      }).filter(Boolean) as Winery[];

      set({ persistentWineries: processedWineries, isLoading: false });
    } catch (err) {
      console.error("Hydration failed:", err);
      set({ error: "Failed to load data", isLoading: false });
    }
  },

  upsertWinery: (data) => {
      const existing = get().persistentWineries.find(w => w.id === (data.google_place_id || (data as any).id));
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

  addVisit: (wineryId: GooglePlaceId, visit: Visit) => {
      set(state => ({
          persistentWineries: state.persistentWineries.map(w => 
              w.id === wineryId ? { ...w, userVisited: true, visits: [visit, ...(w.visits || [])] } : w
          )
      }));
  },

  updateVisit: (visitId: string, updates: Partial<Visit>) => {
      set(state => {
          // Backup for rollback if needed (implied context)
          return {
              persistentWineries: state.persistentWineries.map(w => {
                  if (!w.visits?.some(v => String(v.id) === String(visitId))) return w;
                  return {
                      ...w,
                      visits: w.visits.map(v => String(v.id) === String(visitId) ? { ...v, ...updates } : v)
                  };
              })
          };
      });
  },

  removeVisit: (visitId: string) => {
      set(state => ({
          persistentWineries: state.persistentWineries.map(w => {
               if (!w.visits?.some(v => String(v.id) === String(visitId))) return w;
               const newVisits = w.visits.filter(v => String(v.id) !== String(visitId));
               return { ...w, visits: newVisits, userVisited: newVisits.length > 0 };
          })
      }));
  },

  toggleFavorite: async (wineryId: GooglePlaceId) => {
      const original = get().persistentWineries;
      const winery = original.find(w => w.id === wineryId);
      if (!winery) return;

      // Optimistic
      set({
          persistentWineries: original.map(w => w.id === wineryId ? { ...w, isFavorite: !w.isFavorite } : w)
      });

      const supabase = createClient();
      try {
          const rpcWineryData = {
              id: winery.id,
              name: winery.name,
              address: winery.address,
              lat: winery.lat,
              lng: winery.lng,
              phone: winery.phone || null,
              website: winery.website || null,
              rating: winery.rating || null,
          };
          
          const { error } = await supabase.rpc('toggle_favorite', { p_winery_data: rpcWineryData });
          
          if (error) throw error;
      } catch (err) {
          console.error("Fav toggle failed:", err);
          set({ persistentWineries: original }); // Revert
      }
  },
  
  toggleWishlist: async (wineryId: GooglePlaceId) => {
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
        const rpcWineryData = {
            id: winery.id,
            name: winery.name,
            address: winery.address,
            lat: winery.lat,
            lng: winery.lng,
            phone: winery.phone || null,
            website: winery.website || null,
            rating: winery.rating || null,
        };
        
        const { error } = await supabase.rpc('toggle_wishlist', { p_winery_data: rpcWineryData });
        
        if (error) throw error;
    } catch (err) {
        console.error("Wishlist toggle failed:", err);
        set({ persistentWineries: original }); // Revert
    }
  },

  ensureInDb: async (wineryId: GooglePlaceId) => {
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
          persistentWineries: state.persistentWineries.map(w => w.id === wineryId ? { ...w, dbId: dbId as WineryDbId } : w)
      }));
      
      return dbId as WineryDbId;
  },

  reset: () => set({
    persistentWineries: [],
    isLoading: false,
    error: null,
    _backup: null,
  }),
}));

// Expose store for E2E testing
if (typeof window !== 'undefined') {
  (window as any).useWineryDataStore = useWineryDataStore;
}