import { createWithEqualityFn } from 'zustand/traditional';
import { persist } from 'zustand/middleware';
import { Winery, Visit, GooglePlaceId, WineryDbId, MapMarkerRpc } from '@/lib/types'; 
import { createClient } from '@/utils/supabase/client';
import { standardizeWineryData, GoogleWinery } from '@/lib/utils/winery';
import { WineryService } from '@/lib/services/wineryService';

interface WineryDataState {
  persistentWineries: Winery[]; // The Master Cache
  isLoading: boolean;
  error: string | null;
  _backup: Winery[] | null; // For rollback

  // Actions
  hydrateWineries: (userId: string) => Promise<void>;
  upsertWinery: (data: any) => Winery | null;
  getWinery: (id: GooglePlaceId) => Winery | undefined;
  
  // Data Mutations
  addVisit: (wineryId: GooglePlaceId, visit: Visit) => void;
  updateVisit: (visitId: string, updates: Partial<Visit>) => void;
  removeVisit: (visitId: string) => void;
  
  // User Actions
  toggleFavorite: (wineryId: GooglePlaceId, isFavorite: boolean) => Promise<void>;
  toggleWishlist: (wineryId: GooglePlaceId, isOnWishlist: boolean) => Promise<void>;
  toggleFavoritePrivacy: (wineryId: GooglePlaceId) => Promise<void>;
  toggleWishlistPrivacy: (wineryId: GooglePlaceId) => Promise<void>;
  
  // Sync
  ensureInDb: (wineryId: GooglePlaceId) => Promise<WineryDbId | null>;
  bulkUpsertWineries: (wineries: (GoogleWinery | Winery)[]) => Promise<void>;
  reset: () => void;
}

// --- E2E Helpers ---
const isE2E = () => typeof window !== 'undefined' && process.env.NEXT_PUBLIC_IS_E2E === 'true';
const getE2EHeaders = () => isE2E() ? { 'x-skip-sw-interception': 'true' } : {};
const shouldSkipRealSync = () => {
    if (!isE2E()) return false;
    // @ts-ignore
    const globalVal = !!(globalThis as any)._E2E_ENABLE_REAL_SYNC;
    const localVal = typeof window !== 'undefined' && localStorage.getItem('_E2E_ENABLE_REAL_SYNC') === 'true';
    return !(globalVal || localVal);
};

export const useWineryDataStore = createWithEqualityFn<WineryDataState>()(
  persist(
    (set, get) => ({
      persistentWineries: [],
      isLoading: false,
      error: null,
      _backup: null,

      getWinery: (id) => get().persistentWineries.find(w => w.id === id),

      hydrateWineries: async (userId: string) => {
        if (isE2E() && shouldSkipRealSync()) {
          set({ isLoading: false });
          return;
        }
        set({ isLoading: true, error: null });
        const supabase = createClient();
        try {
          const { data: markers, error: markersError } = await supabase.rpc('get_map_markers', { 
              user_id_param: userId 
          }, { headers: getE2EHeaders() } as any); 
          
          if (markersError) throw markersError;

          const currentWineries = get().persistentWineries;
          const existingMap = new Map(currentWineries.map(w => [w.id, w]));

          const processedWineries = (markers as MapMarkerRpc[] || []).map((m) => { 
             const existing = existingMap.get(m.google_place_id);
             return standardizeWineryData(m, existing); 
          }).filter(Boolean) as Winery[];

          const processedIds = new Set(processedWineries.map(w => w.id));
          const mergedWineries = [
              ...processedWineries,
              ...currentWineries.filter(w => !processedIds.has(w.id))
          ];

          set({ persistentWineries: mergedWineries, isLoading: false });
        } catch (err) {
          console.error("Hydration failed:", err);
          if (get().persistentWineries.length > 0) {
            set({ isLoading: false });
          } else {
            set({ error: "Failed to load data", isLoading: false });
          }
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

      toggleFavorite: async (wineryId: GooglePlaceId, isFavorite: boolean) => {
          const original = get().persistentWineries;
          const winery = original.find(w => w.id === wineryId);
          if (!winery) return;

          // Optimistic Update
          set({
              persistentWineries: original.map(w => w.id === wineryId ? { ...w, isFavorite: !isFavorite } : w)
          });

          try {
              const result = await WineryService.toggleFavorite(winery);
              
              // Sync the store with the real DB ID returned by the service
              if (result.dbId) {
                  set(state => ({
                      persistentWineries: state.persistentWineries.map(w => 
                          w.id === wineryId ? { ...w, isFavorite: result.isFavorite, dbId: result.dbId! } : w
                      )
                  }));
              }
          } catch (err) {
              console.error("[wineryDataStore] Fav toggle failed:", err);
              set({ persistentWineries: original });
          }
      },
      
      toggleWishlist: async (wineryId: GooglePlaceId, isOnWishlist: boolean) => {
        const original = get().persistentWineries;
        const winery = original.find(w => w.id === wineryId);
        if (!winery) return;
        
        // Optimistic Update
        set({
            persistentWineries: original.map(w => w.id === wineryId ? { ...w, onWishlist: !isOnWishlist } : w)
        });

        try {
            const result = await WineryService.toggleWishlist(winery);
            
            // Sync the store with the real DB ID returned by the service
            if (result.dbId) {
                set(state => ({
                    persistentWineries: state.persistentWineries.map(w => 
                        w.id === wineryId ? { ...w, onWishlist: result.onWishlist, dbId: result.dbId! } : w
                    )
                }));
            }
        } catch (err) {
            console.error("[wineryDataStore] Wishlist toggle failed:", err);
            set({ persistentWineries: original });
        }
      },

      toggleFavoritePrivacy: async (wineryId: GooglePlaceId) => {
          const original = get().persistentWineries;
          const winery = original.find(w => w.id === wineryId);
          if (!winery) return;

          // Optimistic Update
          set({
              persistentWineries: original.map(w => w.id === wineryId ? { ...w, favoriteIsPrivate: !w.favoriteIsPrivate } : w)
          });

          try {
              await WineryService.toggleFavoritePrivacy(winery);
              // Ensure we have the DB ID in store after the operation
              const dbId = await get().ensureInDb(wineryId);
              if (dbId) {
                  set(state => ({
                      persistentWineries: state.persistentWineries.map(w => w.id === wineryId ? { ...w, dbId } : w)
                  }));
              }
          } catch (err) {
              console.error("[wineryDataStore] Fav privacy toggle failed:", err);
              set({ persistentWineries: original });
              throw err;
          }
      },

      toggleWishlistPrivacy: async (wineryId: GooglePlaceId) => {
          const original = get().persistentWineries;
          const winery = original.find(w => w.id === wineryId);
          if (!winery) return;

          // Optimistic Update
          set({
              persistentWineries: original.map(w => w.id === wineryId ? { ...w, wishlistIsPrivate: !w.wishlistIsPrivate } : w)
          });

          try {
              await WineryService.toggleWishlistPrivacy(winery);
              // Ensure we have the DB ID in store after the operation
              const dbId = await get().ensureInDb(wineryId);
              if (dbId) {
                  set(state => ({
                      persistentWineries: state.persistentWineries.map(w => w.id === wineryId ? { ...w, dbId } : w)
                  }));
              }
          } catch (err) {
              console.error("[wineryDataStore] Wishlist privacy toggle failed:", err);
              set({ persistentWineries: original });
              throw err;
          }
      },

      ensureInDb: async (wineryId: GooglePlaceId) => {
          const winery = get().persistentWineries.find(w => w.id === wineryId);
          if (!winery) return null;
          
          const dbId = await WineryService.ensureInDb(winery);
          
          if (dbId && dbId !== winery.dbId) {
              set(state => ({
                  persistentWineries: state.persistentWineries.map(w => w.id === wineryId ? { ...w, dbId } : w)
              }));
          }
          
          return dbId;
      },

      bulkUpsertWineries: async (wineries) => {
        const standardizedWineries = wineries.map(w => standardizeWineryData(w)).filter(Boolean) as Winery[];
        if (standardizedWineries.length === 0) return;

        set(state => {
          const existingWineries = new Map(state.persistentWineries.map(w => [w.id, w]));
          standardizedWineries.forEach(newWinery => {
            existingWineries.set(newWinery.id, { ...(existingWineries.get(newWinery.id) || {}), ...newWinery });
          });
          return { persistentWineries: Array.from(existingWineries.values()) };
        });

        if (isE2E() && shouldSkipRealSync()) return;

        const rpcData = standardizedWineries.map(w => ({
          google_place_id: w.id,
          name: w.name,
          address: w.address,
          latitude: w.lat,
          longitude: w.lng,
          google_rating: w.rating,
        }));

        const supabase = createClient();
        const { error } = await supabase.rpc('upsert_wineries_from_search', { wineries_data: rpcData }, { headers: getE2EHeaders() } as any);
        if (error) console.error("Failed to bulk upsert wineries:", error);
      },

      reset: () => set({
        persistentWineries: [],
        isLoading: false,
        error: null,
        _backup: null,
      }),
    }),
    {
      name: process.env.NEXT_PUBLIC_IS_E2E === 'true' ? 'winery-data-storage-e2e' : 'winery-data-storage',
      partialize: (_state) => {
        if (process.env.NEXT_PUBLIC_IS_E2E === 'true') return {};
        return { 
          // wineryDataStore can be completely empty if we don't persist persistentWineries
        };
      },
    }
  )
);

if (typeof window !== 'undefined') {
  (window as any).useWineryDataStore = useWineryDataStore;
}

export const findWineryByDbId = (dbId: number) => {
    return useWineryDataStore.getState().persistentWineries.find(w => w.dbId === (dbId as WineryDbId));
};
