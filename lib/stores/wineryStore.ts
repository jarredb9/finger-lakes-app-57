import { createWithEqualityFn } from 'zustand/traditional';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Winery, Visit, GooglePlaceId, WineryDbId, MapMarkerRpc } from '@/lib/types';
import { createClient } from '@/utils/supabase/client';
import { invokeFunction } from '@/lib/utils';
import { standardizeWineryData, GoogleWinery } from '@/lib/utils/winery';
import { WineryService } from '@/lib/services/wineryService';
import { enqueueIfOffline, handleSyncError } from './sync-utils';
import { idbStorage } from './idb-persist-storage';
import { isE2E, shouldMockWineries } from './e2e-utils';
import { useMapStore } from './mapStore';

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
  hydrateWineries: (markers: (GoogleWinery | MapMarkerRpc)[]) => void;
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
  addVisitToWinery: (wineryId: GooglePlaceId | string, visit?: Visit) => void;
  optimisticallyUpdateVisit: (visitId: string, visitData: Partial<Visit>) => void;
  optimisticallyDeleteVisit: (visitId: string, wineryId?: GooglePlaceId | string) => void;
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
          const standardized = standardizeWineryData(winery, exists, { preserveUserFlags: true });
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
            const standardized = standardizeWineryData(w, exists, { preserveUserFlags: true });
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
            const placeId = 'place_id' in m ? m.place_id : undefined;
            const mId = m.google_place_id || placeId || (typeof m.id === 'string' ? m.id : undefined);
            const existing = currentWineries.find(w => w.id === mId);
            const standardized = standardizeWineryData(m, existing);
            return standardized ? sanitizeWineryForCache(standardized) : null;
          }).filter((w): w is Winery => w !== null);

          const markerIds = new Set(markers.map(m => {
            const placeId = 'place_id' in m ? m.place_id : undefined;
            return m.google_place_id || placeId || (typeof m.id === 'string' ? m.id : undefined);
          }));
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
          let resolvedPlaceId = targetPlaceId;
          if (/^\d+$/.test(targetPlaceId)) {
            const cached = get().getWinery(targetPlaceId);
            if (cached?.id && !/^\d+$/.test(cached.id)) {
              resolvedPlaceId = cached.id;
            } else {
              return;
            }
          }
          if (resolvedPlaceId.startsWith('test-') || resolvedPlaceId.startsWith('mock-') || inFlightRevalidations.has(resolvedPlaceId)) return;
          // @ts-ignore
          const skipDetailsMock = typeof window !== 'undefined' && window._E2E_SKIP_DETAILS_MOCK;
          if (process.env.NEXT_PUBLIC_IS_E2E === 'true' && shouldMockWineries() && !skipDetailsMock) return;

          inFlightRevalidations.add(resolvedPlaceId);
          invokeFunction('get-winery-details', { body: { placeId: resolvedPlaceId } })
            .then(({ data: googleData, error: functionError }) => {
              if (!functionError && googleData) {
                const currentExisting = get().getWinery(resolvedPlaceId);
                const standardized = standardizeWineryData(googleData, currentExisting || undefined, { preserveUserFlags: true });
                if (standardized) {
                  get().upsertWinery(standardized);
                }
              }
            })
            .catch((err) => console.error('[ensureWineryDetails] Background revalidation failed:', err))
            .finally(() => {
              inFlightRevalidations.delete(resolvedPlaceId);
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

        let standardizedDb: Winery | null = null;

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
              standardizedDb = standardized;
              get().upsertWinery(standardized);

              if (Array.isArray(dbData.visits) && dbData.visits.length > 0) {
                try {
                  const { useVisitStore } = await import('./visitStore');
                  useVisitStore.getState().hydrateVisits?.(dbData.visits, dbData);
                } catch {}
              }

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

          // Determine effective Google Place ID for enrichment
          let effectivePlaceId: GooglePlaceId | null = null;
          if (!/^\d+$/.test(placeId) && !placeId.startsWith('test-') && !placeId.startsWith('mock-')) {
            effectivePlaceId = placeId;
          } else if (dbData?.google_place_id && !/^\d+$/.test(dbData.google_place_id)) {
            effectivePlaceId = dbData.google_place_id;
          } else if (existing?.id && !/^\d+$/.test(existing.id)) {
            effectivePlaceId = existing.id;
          }

          if (effectivePlaceId) {
            // @ts-ignore
            const skipDetailsMock = typeof window !== 'undefined' && window._E2E_SKIP_DETAILS_MOCK;
            if (process.env.NEXT_PUBLIC_IS_E2E === 'true' && shouldMockWineries() && !skipDetailsMock) {
              set({ loadingWineryId: null });
              return standardizedDb || existing || null;
            }

            try {
              const { data: googleData, error: functionError } = await invokeFunction('get-winery-details', {
                body: { placeId: effectivePlaceId },
              });

              if (!functionError && googleData) {
                const currentExisting = get().getWinery(effectivePlaceId) || get().getWinery(placeId);
                const standardized = standardizeWineryData(googleData, currentExisting || existing || standardizedDb || undefined, { preserveUserFlags: true });
                if (standardized) {
                  get().upsertWinery(standardized);
                  set({ loadingWineryId: null });
                  return standardized;
                }
              } else if (functionError) {
                console.error('[ensureWineryDetails] Edge Function failed:', functionError);
              }
            } catch (invokeErr) {
              console.error('[ensureWineryDetails] Edge Function invocation exception:', invokeErr);
            }
          } else if (dbData && !dbData.google_place_id) {
            console.warn(`[ensureWineryDetails] Winery ${placeId} has no google_place_id; skipping Places enrichment`);
          }
        } catch (error) {
          console.error('Details fetch failed:', error);
        }

        set({ loadingWineryId: null });
        return standardizedDb || existing || null;
      },

      toggleFavorite: async (target) => {
        const wineryId = typeof target === 'string' ? target : target.id;
        const original = get().persistentWineries;
        const originalSearchResults = useMapStore.getState().searchResults;
        let winery = original.find(w => w.id === wineryId || (w.dbId && String(w.dbId) === String(wineryId)));
        if (!winery) {
          if (typeof target !== 'string') {
            winery = target;
          } else {
            winery = originalSearchResults.find(w => w.id === wineryId || (w.dbId && String(w.dbId) === String(wineryId)));
          }
        }
        if (!winery) {
          return;
        }

        const nextState = !winery.isFavorite;

        const existsInCache = original.some(w => w.id === wineryId || (winery?.dbId && w.dbId === winery.dbId));
        if (existsInCache) {
          set({
            persistentWineries: original.map(w =>
              w.id === wineryId || (winery?.dbId && w.dbId === winery.dbId)
                ? { ...w, isFavorite: nextState }
                : w
            ),
          });
        } else {
          const standardized = standardizeWineryData(
            { ...winery, isFavorite: nextState },
            undefined,
            { preserveUserFlags: true }
          );
          const sanitized = sanitizeWineryForCache(standardized || { ...winery, isFavorite: nextState });
          set({
            persistentWineries: [...original, sanitized],
          });
        }

        useMapStore.setState(state => ({
          searchResults: state.searchResults.map(w =>
            w.id === wineryId || (winery?.dbId && w.dbId === winery.dbId)
              ? { ...w, isFavorite: nextState }
              : w
          ),
        }));

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
              w.id === wineryId || (winery?.dbId && w.dbId === winery.dbId)
                ? { ...w, isFavorite: result.isFavorite, dbId: (result.dbId || w.dbId) as WineryDbId }
                : w
            ),
          }));
          useMapStore.setState(state => ({
            searchResults: state.searchResults.map(w =>
              w.id === wineryId || (winery?.dbId && w.dbId === winery.dbId)
                ? { ...w, isFavorite: result.isFavorite, dbId: (result.dbId || w.dbId) as WineryDbId }
                : w
            ),
          }));
        } catch (err: any) {
          if (await handleSyncError(err, 'winery_action', user?.id, syncPayload)) {
            return;
          }
          console.error('[wineryStore] Fav toggle failed:', err);
          set({ persistentWineries: original, error: err.message });
          useMapStore.setState({ searchResults: originalSearchResults });
        }
      },

      toggleWishlist: async (target) => {
        const wineryId = typeof target === 'string' ? target : target.id;
        const original = get().persistentWineries;
        const originalSearchResults = useMapStore.getState().searchResults;
        let winery = original.find(w => w.id === wineryId || (w.dbId && String(w.dbId) === String(wineryId)));
        if (!winery) {
          if (typeof target !== 'string') {
            winery = target;
          } else {
            winery = originalSearchResults.find(w => w.id === wineryId || (w.dbId && String(w.dbId) === String(wineryId)));
          }
        }
        if (!winery) {
          return;
        }

        const nextState = !winery.onWishlist;

        const existsInCache = original.some(w => w.id === wineryId || (winery?.dbId && w.dbId === winery.dbId));
        if (existsInCache) {
          set({
            persistentWineries: original.map(w =>
              w.id === wineryId || (winery?.dbId && w.dbId === winery.dbId)
                ? { ...w, onWishlist: nextState }
                : w
            ),
          });
        } else {
          const standardized = standardizeWineryData(
            { ...winery, onWishlist: nextState },
            undefined,
            { preserveUserFlags: true }
          );
          const sanitized = sanitizeWineryForCache(standardized || { ...winery, onWishlist: nextState });
          set({
            persistentWineries: [...original, sanitized],
          });
        }

        useMapStore.setState(state => ({
          searchResults: state.searchResults.map(w =>
            w.id === wineryId || (winery?.dbId && w.dbId === winery.dbId)
              ? { ...w, onWishlist: nextState }
              : w
          ),
        }));

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
              w.id === wineryId || (winery?.dbId && w.dbId === winery.dbId)
                ? { ...w, onWishlist: result.onWishlist, dbId: (result.dbId || w.dbId) as WineryDbId }
                : w
            ),
          }));
          useMapStore.setState(state => ({
            searchResults: state.searchResults.map(w =>
              w.id === wineryId || (winery?.dbId && w.dbId === winery.dbId)
                ? { ...w, onWishlist: result.onWishlist, dbId: (result.dbId || w.dbId) as WineryDbId }
                : w
            ),
          }));
        } catch (err: any) {
          if (await handleSyncError(err, 'winery_action', user?.id, syncPayload)) {
            return;
          }
          console.error('[wineryStore] Wishlist toggle failed:', err);
          set({ persistentWineries: original, error: err.message });
          useMapStore.setState({ searchResults: originalSearchResults });
        }
      },

      toggleFavoritePrivacy: async (wineryId) => {
        const original = get().persistentWineries;
        const originalSearchResults = useMapStore.getState().searchResults;
        const winery = original.find(w => w.id === wineryId || (w.dbId && String(w.dbId) === String(wineryId)));
        if (!winery) {
          return;
        }

        const nextPrivacy = !winery.favoriteIsPrivate;
        set({
          persistentWineries: original.map(w => (w.id === wineryId || (w.dbId && String(w.dbId) === String(wineryId))) ? { ...w, favoriteIsPrivate: nextPrivacy } : w),
        });
        useMapStore.setState(state => ({
          searchResults: state.searchResults.map(w => (w.id === wineryId || (w.dbId && String(w.dbId) === String(wineryId))) ? { ...w, favoriteIsPrivate: nextPrivacy } : w),
        }));

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
              (w.id === wineryId || (w.dbId && String(w.dbId) === String(wineryId))) ? { ...w, favoriteIsPrivate: result.isPrivate, dbId: result.dbId as WineryDbId } : w
            ),
          }));
          useMapStore.setState(state => ({
            searchResults: state.searchResults.map(w =>
              (w.id === wineryId || (w.dbId && String(w.dbId) === String(wineryId))) ? { ...w, favoriteIsPrivate: result.isPrivate, dbId: (result.dbId || w.dbId) as WineryDbId } : w
            ),
          }));
        } catch (err: any) {
          if (await handleSyncError(err, 'winery_action', user?.id, syncPayload)) {
            return;
          }
          set({ persistentWineries: original, error: err.message });
          useMapStore.setState({ searchResults: originalSearchResults });
          throw err;
        }
      },

      toggleWishlistPrivacy: async (wineryId) => {
        const original = get().persistentWineries;
        const originalSearchResults = useMapStore.getState().searchResults;
        const winery = original.find(w => w.id === wineryId || (w.dbId && String(w.dbId) === String(wineryId)));
        if (!winery) {
          return;
        }

        const nextPrivacy = !winery.wishlistIsPrivate;
        set({
          persistentWineries: original.map(w => (w.id === wineryId || (w.dbId && String(w.dbId) === String(wineryId))) ? { ...w, wishlistIsPrivate: nextPrivacy } : w),
        });
        useMapStore.setState(state => ({
          searchResults: state.searchResults.map(w => (w.id === wineryId || (w.dbId && String(w.dbId) === String(wineryId))) ? { ...w, wishlistIsPrivate: nextPrivacy } : w),
        }));

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
              (w.id === wineryId || (w.dbId && String(w.dbId) === String(wineryId))) ? { ...w, wishlistIsPrivate: result.isPrivate, dbId: result.dbId as WineryDbId } : w
            ),
          }));
          useMapStore.setState(state => ({
            searchResults: state.searchResults.map(w =>
              (w.id === wineryId || (w.dbId && String(w.dbId) === String(wineryId))) ? { ...w, wishlistIsPrivate: result.isPrivate, dbId: (result.dbId || w.dbId) as WineryDbId } : w
            ),
          }));
        } catch (err: any) {
          if (await handleSyncError(err, 'winery_action', user?.id, syncPayload)) {
            return;
          }
          console.error('[wineryStore] Wishlist privacy toggle failed:', err);
          set({ persistentWineries: original, error: err.message });
          useMapStore.setState({ searchResults: originalSearchResults });
          throw err;
        }
      },

      updateWinery: (id, updates) => {
        const existing = get().getWinery(id);
        if (existing) {
          get().upsertWinery({ ...existing, ...updates });
        }
        useMapStore.setState(state => ({
          searchResults: state.searchResults.map(w =>
            w.id === id || (w.dbId && existing?.dbId && w.dbId === existing.dbId)
              ? { ...w, ...updates }
              : w
          ),
        }));
      },

      // ST-03: Compatibility stubs for visits (visitStore owns visits directly)
      addVisitToWinery: (wineryId, visit) => {
        set(state => {
          const exists = state.persistentWineries.some(w =>
            w.id === wineryId || (w.dbId && String(w.dbId) === String(wineryId))
          );
          if (exists) {
            return {
              persistentWineries: state.persistentWineries.map(w =>
                w.id === wineryId || (w.dbId && String(w.dbId) === String(wineryId))
                  ? {
                      ...w,
                      userVisited: true,
                      onWishlist: false,
                      wishlistIsPrivate: false,
                    }
                  : w
              ),
            };
          }

          const searchCandidate = useMapStore.getState().searchResults.find(w =>
            w.id === wineryId || (w.dbId && String(w.dbId) === String(wineryId))
          );
          if (searchCandidate) {
            const standardized = standardizeWineryData(
              {
                ...searchCandidate,
                userVisited: true,
                onWishlist: false,
                wishlistIsPrivate: false,
              },
              undefined,
              { preserveUserFlags: true }
            );
            if (standardized) {
              return {
                persistentWineries: [...state.persistentWineries, sanitizeWineryForCache(standardized)],
              };
            }
          }

          if (visit?.wineries) {
            const fallback: Winery = {
              id: (visit.wineries.google_place_id || wineryId) as GooglePlaceId,
              dbId: visit.wineries.id,
              name: visit.wineries.name || '',
              address: visit.wineries.address || '',
              latitude: visit.wineries.latitude,
              longitude: visit.wineries.longitude,
              userVisited: true,
              onWishlist: false,
              wishlistIsPrivate: false,
              isFavorite: false,
              visits: [],
            };
            return {
              persistentWineries: [...state.persistentWineries, fallback],
            };
          }

          return {};
        });

        useMapStore.setState(state => ({
          searchResults: state.searchResults.map(w =>
            w.id === wineryId || (w.dbId && String(w.dbId) === String(wineryId))
              ? {
                  ...w,
                  userVisited: true,
                  onWishlist: false,
                  wishlistIsPrivate: false,
                }
              : w
          ),
        }));
      },
      optimisticallyUpdateVisit: () => {},
      optimisticallyDeleteVisit: (_visitId, wineryId) => {
        if (!wineryId) return;
        set(state => ({
          persistentWineries: state.persistentWineries.map(w =>
            w.id === wineryId || (w.dbId && String(w.dbId) === String(wineryId))
              ? { ...w, userVisited: false }
              : w
          ),
        }));
        useMapStore.setState(state => ({
          searchResults: state.searchResults.map(w =>
            w.id === wineryId || (w.dbId && String(w.dbId) === String(wineryId))
              ? { ...w, userVisited: false }
              : w
          ),
        }));
      },
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
      version: 2,
      storage: createJSONStorage(() => idbStorage),
      migrate: (persistedState: any, version: number) => {
        if (version >= 2) {
          return persistedState;
        }

        const state = persistedState as Partial<WineryState>;
        if (!state || !Array.isArray(state.persistentWineries)) {
          return persistedState;
        }

        const migratedWineries = state.persistentWineries.filter((w: any) => {
          if (!w || typeof w !== 'object') return false;
          if (!w.id || typeof w.id !== 'string' || w.id.trim().length === 0) return false;
          if (typeof w.name !== 'string' || w.name.trim().length === 0) return false;
          if (
            typeof w.latitude !== 'number' ||
            isNaN(w.latitude) ||
            typeof w.longitude !== 'number' ||
            isNaN(w.longitude)
          ) {
            return false;
          }

          // If record claims to be enriched or full, it MUST have valid openingHours
          if (w.enrichment_tier === 'enriched' || w.enrichment_tier === 'full') {
            const hasHours =
              w.openingHours &&
              typeof w.openingHours === 'object' &&
              ((Array.isArray(w.openingHours.weekday_text) && w.openingHours.weekday_text.length > 0) ||
                (Array.isArray(w.openingHours.periods) && w.openingHours.periods.length > 0));
            if (!hasHours) return false;
          }

          return true;
        });

        return {
          ...state,
          persistentWineries: migratedWineries,
        };
      },
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
if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_IS_E2E === 'true') {
  window.useWineryStore = useWineryStore;
  window.useWineryDataStore = useWineryStore;
}

// Backward compatibility helper
export const findWineryByDbId = (dbId: number) => {
  return useWineryStore.getState().persistentWineries.find(w => Number(w.dbId) === Number(dbId));
};
