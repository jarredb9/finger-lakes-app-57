import { createWithEqualityFn } from 'zustand/traditional';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Winery, Visit, GooglePlaceId, WineryDbId } from '@/lib/types';
import { createClient } from '@/utils/supabase/client';
import { invokeFunction } from '@/lib/utils';
import { standardizeWineryData, GoogleWinery } from '@/lib/utils/winery';
import { WineryService } from '@/lib/services/wineryService';
import { enqueueIfOffline, handleSyncError } from './sync-utils';
import { idbStorage } from './idb-persist-storage';
import { isE2E, shouldMockWineries } from './e2e-utils';

export interface WineryState {
  // Master Cache
  persistentWineries: Winery[];
  isLoading: boolean;
  error: string | null;

  // UI State
  loadingWineryId: string | null;

  // Cache & Query operations
  getWinery: (id: string) => Winery | undefined;
  upsertWinery: (winery: Winery) => void;
  bulkUpsertWineries: (wineries: Winery[]) => void;
  hydrateWineries: (markers: GoogleWinery[]) => void;
  ensureInDb: (wineryId: string) => Promise<WineryDbId | null>;
  upsertEnrichedWinery: (winery: Winery) => Promise<WineryDbId | null>;

  // Remote Actions
  fetchWineryData: (userId: string) => Promise<void>;
  ensureWineryDetails: (placeId: GooglePlaceId) => Promise<Winery | null>;
  toggleFavorite: (target: string | Winery) => Promise<void>;
  toggleWishlist: (target: string | Winery) => Promise<void>;
  toggleFavoritePrivacy: (wineryId: GooglePlaceId | string) => Promise<void>;
  toggleWishlistPrivacy: (wineryId: GooglePlaceId | string) => Promise<void>;
  updateWinery: (id: GooglePlaceId, updates: Partial<Winery>) => void;

  // Visit Compatibility Operations (ST-03: visits stored in visitStore)
  addVisitToWinery: (wineryId: GooglePlaceId, visit: Visit) => void;
  optimisticallyUpdateVisit: (visitId: string, visitData: Partial<Visit>) => void;
  optimisticallyDeleteVisit: (visitId: string) => void;
  replaceVisit: (wineryId: GooglePlaceId, tempId: string, finalVisit: Visit) => void;
  confirmOptimisticUpdate: (updatedVisit?: Visit) => void;
  revertOptimisticUpdate: () => void;

  // Reactive Selectors / Getters
  getWineries: () => Winery[];
  getVisited: () => Winery[];
  getWishlist: () => Winery[];
  getFavorites: () => Winery[];

  reset: () => void;
}

const inFlightRevalidations = new Set<string>();

const sanitizeWineryForCache = (winery: Winery): Winery => {
  // ST-03: Strip duplicated visit array from winery cache; visitStore is single source of truth
  return {
    ...winery,
    visits: [],
    userVisited: winery.userVisited ?? (Array.isArray(winery.visits) && winery.visits.length > 0),
  };
};

export const useWineryStore = createWithEqualityFn<WineryState>()(
  persist(
    (set, get) => ({
      persistentWineries: [],
      isLoading: false,
      error: null,
      loadingWineryId: null,

      getWinery: (id) => get().persistentWineries.find(w =>
        w.id === id ||
        (w.dbId && String(w.dbId) === String(id)) ||
        (w as any).googleId === id
      ),

      upsertWinery: (winery) => {
        set(state => {
          const rawWinery = winery as any;
          const exists = state.persistentWineries.find(w =>
            w.id === winery.id ||
            (rawWinery.google_place_id && w.id === rawWinery.google_place_id) ||
            (winery.id && w.id === String(winery.id)) ||
            (w.dbId && (w.dbId === winery.dbId || Number(w.dbId) === Number(winery.id)))
          );
          const standardized = standardizeWineryData(winery, exists);
          if (!standardized) return {};
          const sanitized = sanitizeWineryForCache(standardized);
          if (exists) {
            return {
              persistentWineries: state.persistentWineries.map(w =>
                w.id === exists.id ? sanitized : w
              ),
            };
          }
          return { persistentWineries: [...state.persistentWineries, sanitized] };
        });
      },

      bulkUpsertWineries: (wineries) => {
        set(state => {
          const current = [...state.persistentWineries];
          wineries.forEach(w => {
            const rawW = w as any;
            const idx = current.findIndex(existing =>
              existing.id === w.id ||
              (rawW.google_place_id && existing.id === rawW.google_place_id) ||
              (w.id && existing.id === String(w.id)) ||
              (existing.dbId && (existing.dbId === w.dbId || Number(existing.dbId) === Number(w.id)))
            );
            const exists = idx !== -1 ? current[idx] : undefined;
            const standardized = standardizeWineryData(w, exists);
            if (standardized) {
              const sanitized = sanitizeWineryForCache(standardized);
              if (idx !== -1) {
                current[idx] = sanitized;
              } else {
                current.push(sanitized);
              }
            }
          });
          return { persistentWineries: current };
        });
      },

      hydrateWineries: (markers) => {
        set(state => {
          const currentWineries = state.persistentWineries;
          const hydrated = markers.map(m => {
            const mId = m.google_place_id || m.place_id || (typeof m.id === 'string' ? m.id : undefined);
            const existing = currentWineries.find(w => w.id === mId);
            const standardized = standardizeWineryData(m, existing);
            return standardized ? sanitizeWineryForCache(standardized) : null;
          }).filter((w): w is Winery => w !== null);

          const markerIds = new Set(markers.map(m => m.google_place_id || m.place_id || (typeof m.id === 'string' ? m.id : undefined)));
          const extras = currentWineries.filter(w => !markerIds.has(w.id));

          return { persistentWineries: [...hydrated, ...extras] };
        });
      },

      ensureInDb: async (wineryId) => {
        const winery = get().getWinery(wineryId);
        if (!winery) return null;

        const dbId = await WineryService.ensureInDb(winery);
        if (dbId && dbId !== winery.dbId) {
          get().upsertWinery({ ...winery, dbId });
        }
        return dbId;
      },

      upsertEnrichedWinery: async (winery) => {
        get().upsertWinery(winery);
        const dbId = await WineryService.upsertEnrichedWinery(winery);
        if (dbId) {
          get().upsertWinery({ ...winery, dbId });
        }
        return dbId;
      },

      fetchWineryData: async (userId: string) => {
        try {
          const supabase = createClient();
          const { data, error } = await supabase.rpc('get_map_markers', { p_user_id: userId });
          if (error) {
            console.error('Failed to fetch map markers:', error);
            return;
          }
          if (data) {
            get().hydrateWineries(data);
          }
        } catch (err) {
          console.error('Error in fetchWineryData:', err);
        }
      },

      ensureWineryDetails: async (placeId: GooglePlaceId) => {
        const existing = get().getWinery(placeId);

        if (isE2E() && shouldMockWineries()) {
          // @ts-ignore
          const skipDetailsMock = typeof window !== 'undefined' && window._E2E_SKIP_DETAILS_MOCK;
          if (!skipDetailsMock) {
            return existing || null;
          }
        }

        const isStaleRecord = (lastEnrichedAt?: string | null): boolean => {
          if (!lastEnrichedAt) return true;
          const lastDate = new Date(lastEnrichedAt);
          if (isNaN(lastDate.getTime())) return true;
          const diffDays = Math.ceil(Math.abs(Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
          return diffDays > 30;
        };

        const revalidateInBackground = (targetPlaceId: GooglePlaceId) => {
          if (/^\d+$/.test(targetPlaceId) || inFlightRevalidations.has(targetPlaceId)) return;
          // @ts-ignore
          const skipDetailsMock = typeof window !== 'undefined' && window._E2E_SKIP_DETAILS_MOCK;
          if (process.env.NEXT_PUBLIC_IS_E2E === 'true' && shouldMockWineries() && !skipDetailsMock) return;

          inFlightRevalidations.add(targetPlaceId);
          invokeFunction('get-winery-details', { body: { placeId: targetPlaceId } })
            .then(({ data: googleData, error: functionError }) => {
              if (!functionError && googleData) {
                const currentExisting = get().getWinery(targetPlaceId);
                const standardized = standardizeWineryData(googleData, currentExisting || undefined);
                if (standardized) {
                  get().upsertWinery(standardized);
                }
              }
            })
            .catch((err) => console.error('[ensureWineryDetails] Background revalidation failed:', err))
            .finally(() => {
              inFlightRevalidations.delete(targetPlaceId);
            });
        };

        const isEnriched = (existing?.enrichment_tier === 'enriched' || existing?.enrichment_tier === 'full') &&
          (existing?.reviews !== undefined && existing?.reviews !== null && Array.isArray(existing.reviews)) &&
          (existing?.openingHours !== undefined && existing?.openingHours !== null && existing.openingHours.weekday_text && existing.openingHours.weekday_text.length > 0) &&
          (existing?.userRatingCount !== undefined) &&
          (existing?.generative_summary !== undefined && existing?.generative_summary !== null) &&
          (existing?.vibe_tags !== undefined && existing?.vibe_tags !== null && Array.isArray(existing.vibe_tags) && existing.vibe_tags.length > 0);
        const hasZeroRating = existing?.rating === 0;

        if (existing && isEnriched && !hasZeroRating) {
          if (isStaleRecord(existing.last_enriched_at)) {
            revalidateInBackground(placeId);
          }
          return existing;
        }

        set({ loadingWineryId: placeId });

        try {
          const supabase = createClient();
          let dbData = null;

          let targetDbId = existing?.dbId;
          if (!targetDbId && placeId) {
            if (/^\d+$/.test(placeId)) {
              targetDbId = Number(placeId) as WineryDbId;
            } else {
              const { data: idRow } = await supabase
                .from('wineries')
                .select('id')
                .eq('google_place_id', placeId)
                .maybeSingle();
              if (idRow?.id) {
                targetDbId = Number(idRow.id) as WineryDbId;
              }
            }
          }

          if (targetDbId) {
            const { data } = await supabase.rpc('get_winery_details_by_id', { p_winery_id: targetDbId });
            if (data && data.length > 0) dbData = data[0];
          }

          if (dbData) {
            const standardized = standardizeWineryData(dbData, existing || undefined);
            if (standardized) {
              get().upsertWinery(standardized);

              const dbIsEnriched = dbData.enrichment_tier === 'enriched' &&
                dbData.opening_hours &&
                dbData.user_rating_count !== undefined &&
                Array.isArray(dbData.reviews) &&
                dbData.generative_summary &&
                Array.isArray(dbData.vibe_tags) && dbData.vibe_tags.length > 0;
              const dbHasZeroRating = dbData.google_rating === 0;

              if (dbIsEnriched && !dbHasZeroRating) {
                set({ loadingWineryId: null });
                if (isStaleRecord(dbData.last_enriched_at)) {
                  revalidateInBackground(placeId);
                }
                return standardized;
              }
            }
          }

          if (!/^\d+$/.test(placeId)) {
            // @ts-ignore
            const skipDetailsMock = typeof window !== 'undefined' && window._E2E_SKIP_DETAILS_MOCK;
            if (process.env.NEXT_PUBLIC_IS_E2E === 'true' && shouldMockWineries() && !skipDetailsMock) {
              set({ loadingWineryId: null });
              return existing || null;
            }
            const { data: googleData, error: functionError } = await invokeFunction('get-winery-details', {
              body: { placeId },
            });

            if (!functionError && googleData) {
              const currentExisting = get().getWinery(placeId);
              const standardized = standardizeWineryData(googleData, currentExisting || existing || undefined);
              if (standardized) {
                get().upsertWinery(standardized);
                set({ loadingWineryId: null });
                return standardized;
              }
            } else if (functionError) {
              console.error('Edge Function failed:', functionError);
            }
          }
        } catch (error) {
          console.error('Details fetch failed:', error);
        }

        set({ loadingWineryId: null });
        return existing || null;
      },

      toggleFavorite: async (target) => {
        const wineryId = typeof target === 'string' ? target : target.id;
        const original = get().persistentWineries;
        const winery = original.find(w => w.id === wineryId);
        if (!winery) return;

        const nextState = !winery.isFavorite;

        set({
          persistentWineries: original.map(w => w.id === wineryId ? { ...w, isFavorite: nextState } : w),
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
          latitude: winery.latitude,
          longitude: winery.longitude,
        };

        if (await enqueueIfOffline('winery_action', user?.id, syncPayload)) {
          return;
        }

        try {
          const result = await WineryService.toggleFavorite(winery);
          set(state => ({
            persistentWineries: state.persistentWineries.map(w =>
              w.id === wineryId ? { ...w, isFavorite: result.isFavorite, dbId: (result.dbId || w.dbId) as WineryDbId } : w
            ),
          }));
        } catch (err: any) {
          if (await handleSyncError(err, 'winery_action', user?.id, syncPayload)) {
            return;
          }
          console.error('[wineryStore] Fav toggle failed:', err);
          set({ persistentWineries: original, error: err.message });
        }
      },

      toggleWishlist: async (target) => {
        const wineryId = typeof target === 'string' ? target : target.id;
        const original = get().persistentWineries;
        const winery = original.find(w => w.id === wineryId);
        if (!winery) return;

        const nextState = !winery.onWishlist;

        set({
          persistentWineries: original.map(w => w.id === wineryId ? { ...w, onWishlist: nextState } : w),
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
          latitude: winery.latitude,
          longitude: winery.longitude,
        };

        if (await enqueueIfOffline('winery_action', user?.id, syncPayload)) {
          return;
        }

        try {
          const result = await WineryService.toggleWishlist(winery);
          set(state => ({
            persistentWineries: state.persistentWineries.map(w =>
              w.id === wineryId ? { ...w, onWishlist: result.onWishlist, dbId: (result.dbId || w.dbId) as WineryDbId } : w
            ),
          }));
        } catch (err: any) {
          if (await handleSyncError(err, 'winery_action', user?.id, syncPayload)) {
            return;
          }
          console.error('[wineryStore] Wishlist toggle failed:', err);
          set({ persistentWineries: original, error: err.message });
        }
      },

      toggleFavoritePrivacy: async (wineryId) => {
        const original = get().persistentWineries;
        const winery = original.find(w => w.id === wineryId);
        if (!winery) return;

        set({
          persistentWineries: original.map(w => w.id === wineryId ? { ...w, favoriteIsPrivate: !w.favoriteIsPrivate } : w),
        });

        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        const syncPayload = {
          action: 'toggle_favorite_privacy',
          wineryDbId: winery.dbId,
        };

        if (await enqueueIfOffline('winery_action', user?.id, syncPayload)) {
          return;
        }

        try {
          const result = await WineryService.toggleFavoritePrivacy(winery);
          set(state => ({
            persistentWineries: state.persistentWineries.map(w =>
              w.id === wineryId ? { ...w, favoriteIsPrivate: result.isPrivate, dbId: result.dbId as WineryDbId } : w
            ),
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
          persistentWineries: original.map(w => w.id === wineryId ? { ...w, wishlistIsPrivate: !w.wishlistIsPrivate } : w),
        });

        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        const syncPayload = {
          action: 'toggle_wishlist_privacy',
          wineryDbId: winery.dbId,
        };

        if (await enqueueIfOffline('winery_action', user?.id, syncPayload)) {
          return;
        }

        try {
          const result = await WineryService.toggleWishlistPrivacy(winery);
          set(state => ({
            persistentWineries: state.persistentWineries.map(w =>
              w.id === wineryId ? { ...w, wishlistIsPrivate: result.isPrivate, dbId: result.dbId as WineryDbId } : w
            ),
          }));
        } catch (err: any) {
          if (await handleSyncError(err, 'winery_action', user?.id, syncPayload)) {
            return;
          }
          console.error('[wineryStore] Wishlist privacy toggle failed:', err);
          set({ persistentWineries: original, error: err.message });
          throw err;
        }
      },

      updateWinery: (id, updates) => {
        const existing = get().getWinery(id);
        if (existing) {
          get().upsertWinery({ ...existing, ...updates });
        }
      },

      // ST-03: Compatibility stubs for visits (visitStore owns visits directly)
      addVisitToWinery: (wineryId) => {
        set(state => ({
          persistentWineries: state.persistentWineries.map(w =>
            w.id === wineryId ? { ...w, userVisited: true } : w
          ),
        }));
      },
      optimisticallyUpdateVisit: () => {},
      optimisticallyDeleteVisit: () => {},
      replaceVisit: () => {},
      confirmOptimisticUpdate: () => {},
      revertOptimisticUpdate: () => {},

      // Reactive Selectors
      getWineries: () => get().persistentWineries,
      getVisited: () => get().persistentWineries.filter(w => w.userVisited),
      getWishlist: () => get().persistentWineries.filter(w => w.onWishlist),
      getFavorites: () => get().persistentWineries.filter(w => w.isFavorite),

      reset: () => set({
        persistentWineries: [],
        isLoading: false,
        error: null,
        loadingWineryId: null,
      }),
    }),
    {
      name: process.env.NEXT_PUBLIC_IS_E2E === 'true' ? 'winery-data-storage-e2e' : 'winery-data-storage',
      storage: createJSONStorage(() => idbStorage),
      partialize: (state): Partial<WineryState> => {
        if (process.env.NEXT_PUBLIC_IS_E2E === 'true') return {};
        return {
          persistentWineries: state.persistentWineries.slice(0, 50),
        };
      },
    }
  )
);

// Expose stores for E2E testing
if (typeof window !== 'undefined') {
  (window as any).useWineryStore = useWineryStore;
  (window as any).useWineryDataStore = useWineryStore;
}

// Backward compatibility helper
export const findWineryByDbId = (dbId: number) => {
  return useWineryStore.getState().persistentWineries.find(w => Number(w.dbId) === Number(dbId));
};
