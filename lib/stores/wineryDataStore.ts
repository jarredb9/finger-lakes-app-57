import { createWithEqualityFn } from 'zustand/traditional';
import { persist } from 'zustand/middleware';
import { Winery, Visit, WineryDbId } from '@/lib/types';
import { createClient } from '@/utils/supabase/client';
import { standardizeWineryData, GoogleWinery } from '@/lib/utils/winery';
import { WineryService } from '@/lib/services/wineryService';
import { enqueueIfOffline, handleSyncError } from './sync-utils';

interface WineryDataState {
  persistentWineries: Winery[]; // The Master Cache
  isLoading: boolean;
  error: string | null;
  getWinery: (id: string) => Winery | undefined;
  upsertWinery: (winery: Winery) => void;
  bulkUpsertWineries: (wineries: Winery[]) => void;
  ensureInDb: (wineryId: string) => Promise<WineryDbId | null>;
  hydrateWineries: (markers: GoogleWinery[]) => void;
  toggleFavorite: (wineryId: string) => Promise<void>;
  toggleWishlist: (wineryId: string) => Promise<void>;
  toggleFavoritePrivacy: (wineryId: string) => Promise<void>;
  toggleWishlistPrivacy: (wineryId: string) => Promise<void>;
  addVisit: (wineryId: string, visit: Visit) => void;
  updateVisit: (visitId: string, data: Partial<Visit>) => void;
  removeVisit: (visitId: string) => void;
  reset: () => void;
}

export const useWineryDataStore = createWithEqualityFn<WineryDataState>()(
  persist(
    (set, get) => ({
      persistentWineries: [],
      isLoading: false,
      error: null,

      getWinery: (id) => get().persistentWineries.find(w => w.id === id),

      upsertWinery: (winery) => {
        set(state => {
          const exists = state.persistentWineries.find(w => w.id === winery.id);
          if (exists) {
            return {
              persistentWineries: state.persistentWineries.map(w =>
                w.id === winery.id ? { ...w, ...winery } : w
              )
            };
          }
          return { persistentWineries: [...state.persistentWineries, winery] };
        });
      },

      bulkUpsertWineries: (wineries) => {
        set(state => {
          const current = [...state.persistentWineries];
          wineries.forEach(w => {
            const idx = current.findIndex(existing => existing.id === w.id);
            if (idx !== -1) {
              current[idx] = { ...current[idx], ...w };
            } else {
              current.push(w);
            }
          });
          return { persistentWineries: current };
        });
      },

      ensureInDb: async (wineryId) => {
          const winery = get().persistentWineries.find(w => w.id === wineryId);
          if (!winery) return null;

          const dbId = await WineryService.ensureInDb(winery);
          if (dbId && dbId !== winery.dbId) {
              get().upsertWinery({ ...winery, dbId });
          }
          return dbId;
      },

      hydrateWineries: (markers) => {
          set(state => {
              const currentWineries = state.persistentWineries;
              const hydrated = markers.map(m => {
                  const existing = currentWineries.find(w => w.id === m.id);
                  return standardizeWineryData(m, existing);
              }).filter((w): w is Winery => w !== null);

              // Also keep any wineries that were in our cache but NOT in the new markers
              const markerIds = new Set(markers.map(m => m.id));
              const extras = currentWineries.filter(w => !markerIds.has(w.id));

              return { persistentWineries: [...hydrated, ...extras] };
          });
      },

      toggleFavorite: async (wineryId) => {
          const original = get().persistentWineries;
          const winery = original.find(w => w.id === wineryId);
          if (!winery) return;

          const nextState = !winery.isFavorite;

          // Optimistic Update
          set({
              persistentWineries: original.map(w => w.id === wineryId ? { ...w, isFavorite: nextState } : w)
          });

          const supabase = createClient();
          const { data: { session } } = await supabase.auth.getSession();
          const user = session?.user;
          const syncPayload = {
              action: 'toggle_favorite',
              wineryId: winery.id,
              wineryDbId: winery.dbId,
              wineryName: winery.name,
              wineryAddress: winery.address,
              lat: winery.lat,
              lng: winery.lng
          };

          if (await enqueueIfOffline('winery_action', user?.id, syncPayload)) {
              return;
          }

          try {
              const result = await WineryService.toggleFavorite(winery);
              
              if (result.dbId) {
                  set(state => ({
                      persistentWineries: state.persistentWineries.map(w => 
                          w.id === wineryId ? { ...w, dbId: result.dbId as WineryDbId } : w
                      )
                  }));
              }
          } catch (err: any) {
              if (await handleSyncError(err, 'winery_action', user?.id, syncPayload)) {
                  return;
              }
              console.error("[wineryDataStore] Fav toggle failed:", err);
              set({ persistentWineries: original, error: err.message });
          }
      },

      toggleWishlist: async (wineryId) => {
        const original = get().persistentWineries;
        const winery = original.find(w => w.id === wineryId);
        if (!winery) return;

        const nextState = !winery.onWishlist;

        set({
            persistentWineries: original.map(w => w.id === wineryId ? { ...w, onWishlist: nextState } : w)
        });

        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        const syncPayload = {
            action: 'toggle_wishlist',
            wineryId: winery.id,
            wineryDbId: winery.dbId,
            wineryName: winery.name,
            wineryAddress: winery.address,
            lat: winery.lat,
            lng: winery.lng
        };

        if (await enqueueIfOffline('winery_action', user?.id, syncPayload)) {
            return;
        }

        try {
            const result = await WineryService.toggleWishlist(winery);
            
            if (result.dbId) {
                set(state => ({
                    persistentWineries: state.persistentWineries.map(w => 
                        w.id === wineryId ? { ...w, dbId: result.dbId as WineryDbId } : w
                    )
                }));
            }
        } catch (err: any) {
            if (await handleSyncError(err, 'winery_action', user?.id, syncPayload)) {
                return;
            }
            console.error("[wineryDataStore] Wishlist toggle failed:", err);
            set({ persistentWineries: original, error: err.message });
        }
      },

      toggleFavoritePrivacy: async (wineryId) => {
          const original = get().persistentWineries;
          const winery = original.find(w => w.id === wineryId);
          if (!winery) return;

          set({
              persistentWineries: original.map(w => w.id === wineryId ? { ...w, favoriteIsPrivate: !w.favoriteIsPrivate } : w)
          });

          const supabase = createClient();
          const { data: { session } } = await supabase.auth.getSession();
          const user = session?.user;
          const syncPayload = {
              action: 'toggle_favorite_privacy',
              wineryDbId: winery.dbId
          };

          if (await enqueueIfOffline('winery_action', user?.id, syncPayload)) {
              return;
          }

          try {
              const result = await WineryService.toggleFavoritePrivacy(winery);
              
              set(state => ({
                  persistentWineries: state.persistentWineries.map(w => 
                      w.id === wineryId ? { ...w, favoriteIsPrivate: result.isPrivate } : w
                  )
              }));
          } catch (err: any) {
              if (await handleSyncError(err, 'winery_action', user?.id, syncPayload)) {
                  return;
              }
              set({ persistentWineries: original, error: err.message });
              throw err;
          }
      },

      toggleWishlistPrivacy: async (wineryId) => {
          const original = get().persistentWineries;
          const winery = original.find(w => w.id === wineryId);
          if (!winery) return;

          set({
              persistentWineries: original.map(w => w.id === wineryId ? { ...w, wishlistIsPrivate: !w.wishlistIsPrivate } : w)
          });

          const supabase = createClient();
          const { data: { session } } = await supabase.auth.getSession();
          const user = session?.user;
          const syncPayload = {
              action: 'toggle_wishlist_privacy',
              wineryDbId: winery.dbId
          };

          if (await enqueueIfOffline('winery_action', user?.id, syncPayload)) {
              return;
          }

          try {
              const result = await WineryService.toggleWishlistPrivacy(winery);
              
              set(state => ({
                  persistentWineries: state.persistentWineries.map(w => 
                      w.id === wineryId ? { ...w, wishlistIsPrivate: result.isPrivate } : w
                  )
              }));
          } catch (err: any) {
              if (await handleSyncError(err, 'winery_action', user?.id, syncPayload)) {
                  return;
              }
              console.error("[wineryDataStore] Wishlist privacy toggle failed:", err);
              set({ persistentWineries: original, error: err.message });
              throw err;
          }
      },

      addVisit: (wineryId, visit) => {
        set(state => ({
          persistentWineries: state.persistentWineries.map(w =>
            w.id === wineryId ? { ...w, visits: [visit, ...(w.visits || [])], userVisited: true } : w
          )
        }));
      },

      updateVisit: (visitId, data) => {
        set(state => ({
          persistentWineries: state.persistentWineries.map(w => ({
            ...w,
            visits: w.visits?.map(v => String(v.id) === String(visitId) ? { ...v, ...data } : v)
          }))
        }));
      },

      removeVisit: (visitId) => {
        set(state => ({
          persistentWineries: state.persistentWineries.map(w => {
            const nextVisits = w.visits?.filter(v => String(v.id) !== String(visitId)) || [];
            return {
              ...w,
              visits: nextVisits,
              userVisited: nextVisits.length > 0
            };
          })
        }));
      },

      reset: () => set({ persistentWineries: [], isLoading: false, error: null }),
    }),
    {
      name: process.env.NEXT_PUBLIC_IS_E2E === 'true' ? 'winery-data-storage-e2e' : 'winery-data-storage',
      partialize: (_state) => {
          if (process.env.NEXT_PUBLIC_IS_E2E === 'true') return {};
          return { 
              // We don't persist persistentWineries anymore to avoid hydration lag
          };
      },
    }
  )
);

// Expose store for E2E testing
if (typeof window !== 'undefined') {
  (window as any).useWineryDataStore = useWineryDataStore;
}
