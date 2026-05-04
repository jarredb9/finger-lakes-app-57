import { createWithEqualityFn } from 'zustand/traditional';
import { shallow } from 'zustand/shallow';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Winery, Visit, VisitWithWinery, GooglePlaceId, WineryDbId } from '@/lib/types';
import { createClient } from '@/utils/supabase/client';
import { useWineryStore } from './wineryStore';
import { useWineryDataStore } from './wineryDataStore';
import { WineryService } from '@/lib/services/wineryService';
import { useSyncStore } from './syncStore';
import { stabilizePhotos, Base64Photo, isBase64Photo, base64ToFile } from '@/lib/utils/sync-helpers';
import { fileToBase64 } from '@/lib/utils/binary';
import { enqueueIfOffline, handleSyncError } from './sync-utils';
import { getE2EHeaders } from './e2e-utils';
import { idbStorage } from './idb-persist-storage';

import { RealtimeChannel } from '@supabase/supabase-js';

interface VisitState {
  visits: VisitWithWinery[];
  isLoading: boolean;
  error: string | null;
  isSavingVisit: boolean;
  isSyncing: boolean;
  lastActionTimestamp: number | null;
  lastActionTimestamps: Record<string, number>;
  subscription: RealtimeChannel | null;
  page: number;
  totalPages: number;
  hasMore: boolean;
  fetchVisits: (page?: number, refresh?: boolean) => Promise<void>;
  subscribeToVisitUpdates: () => void;
  unsubscribeFromVisitUpdates: () => void;
  saveVisit: (winery: Winery, visitData: { visit_date: string; user_review: string; rating: number; photos: (File | Base64Photo)[]; is_private?: boolean }) => Promise<void>;
  updateVisit: (visitId: string, visitData: Partial<Visit> & { is_private?: boolean }, newPhotos: (File | Base64Photo)[], photosToDelete: string[]) => Promise<void>;
  deleteVisit: (visitId: string) => Promise<void>;
  reset: () => void;
  setLastActionTimestamp: (visitId: string, timestamp: number | null) => void;
  initialize: () => Promise<void>;
  // E2E Helper
  injectVisitWithPhotos?: (winery: Winery, visitData: { visit_date: string; user_review: string; rating: number; photos: (File | Base64Photo)[] }) => Promise<void>;
}

const VISITS_PER_PAGE = 10;

// --- Store Implementation ---

export const useVisitStore = createWithEqualityFn<VisitState>()(
  persist(
    (set, get) => ({
      visits: [],
      isLoading: false,
      error: null,
      isSavingVisit: false,
      isSyncing: false,
      lastActionTimestamp: null,
      lastActionTimestamps: {},
      subscription: null,
      page: 1,
      totalPages: 1,
      hasMore: false,

      fetchVisits: async (pageNumber = 1, refresh = false) => {
        set({ isLoading: true, error: null });
        const supabase = createClient();
        try {
          const { data, error, count } = await supabase.rpc('get_paginated_visits_with_winery_and_friends', {
            page_number: pageNumber,
            page_size: VISITS_PER_PAGE
          });

          if (error) throw error;

          const fetchedVisits: VisitWithWinery[] = (data || []).map((v: any) => ({
            id: v.visit_id,
            user_id: v.user_id,
            visit_date: v.visit_date,
            user_review: v.user_review,
            rating: v.rating,
            photos: v.photos,
            winery_id: Number(v.winery_id) as WineryDbId,
            wineryName: v.winery_name,
            wineryId: v.google_place_id as GooglePlaceId,
            friend_visits: v.friend_visits,
            syncStatus: 'synced',
            wineries: {
              id: Number(v.winery_id) as WineryDbId,
              google_place_id: v.google_place_id as GooglePlaceId,
              name: v.winery_name,
              address: v.winery_address,
              latitude: '0',
              longitude: '0',
            }
          }));

          set(state => ({
            visits: refresh || pageNumber === 1 ? fetchedVisits : [...state.visits, ...fetchedVisits],
            page: pageNumber,
            totalPages: Math.ceil((count || 0) / VISITS_PER_PAGE),
            hasMore: fetchedVisits.length === VISITS_PER_PAGE,
            isLoading: false,
            error: null
          }));

        } catch (error: any) {
          console.error("Failed to fetch visits:", error);
          set({ isLoading: false, error: error.message || "Failed to fetch visits" });
        }
      },

      subscribeToVisitUpdates: () => {
        const { subscription: existingSub } = get();
        if (existingSub) return;

        const supabase = createClient();
        const subscription = supabase
          .channel('visit-updates')
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'visits' },
            async (payload) => {
              const { lastActionTimestamp, lastActionTimestamps } = get();
              const newData = payload.new as any;
              const visitId = (newData?.id || (payload.old as any)?.id)?.toString();
              const updatedAt = newData?.updated_at;
              
              // Sync Lock: Ignore if the update is older than our last local action for THIS visit
              if (visitId && lastActionTimestamps[visitId] && updatedAt) {
                const payloadTime = new Date(updatedAt).getTime();
                if (payloadTime < lastActionTimestamps[visitId] - 1000) {
                  console.log(`[Sync] Ignoring stale update for visit ${visitId}`, { payloadTime, lastActionTimestamp: lastActionTimestamps[visitId] });
                  return;
                }
              }

              // Fallback to global lock if no visitId is available (rare for postgres_changes)
              if (lastActionTimestamp && updatedAt && !visitId) {
                const payloadTime = new Date(updatedAt).getTime();
                if (payloadTime < lastActionTimestamp - 1000) {
                  console.log('[Sync] Ignoring stale visits update (global)', { payloadTime, lastActionTimestamp });
                  return;
                }
              }

              // Refresh visits list
              await get().fetchVisits(get().page, true);
            }
          )
          .subscribe();

        set({ subscription });
      },

      unsubscribeFromVisitUpdates: () => {
        const { subscription } = get();
        if (subscription) {
          subscription.unsubscribe();
          set({ subscription: null });
        }
      },

      saveVisit: async (winery, visitData) => {
        set({ isSavingVisit: true });
        const supabase = createClient();
        const { addVisitToWinery, replaceVisit } = useWineryStore.getState();

        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) throw new Error("User not authenticated.");
        const user = session.user;

        const tempId = `temp-${Date.now()}`;
        const tempVisit: VisitWithWinery = {
            id: tempId,
            user_id: user.id,
            visit_date: visitData.visit_date,
            rating: visitData.rating,
            user_review: visitData.user_review,
            is_private: visitData.is_private || false,
            photos: visitData.photos.map(p => isBase64Photo(p) ? `data:${p.type};base64,${p.base64}` : URL.createObjectURL(p as File)),
            wineryName: winery.name,
            wineryId: winery.id,
            syncStatus: 'pending',
            wineries: {
                id: Number(winery.dbId || 0) as WineryDbId,
                google_place_id: winery.id,
                name: winery.name,
                address: winery.address,
                latitude: winery.lat.toString(),
                longitude: winery.lng.toString(),
            }
        };

        addVisitToWinery(winery.id, tempVisit);
        const now = Date.now();
        set(state => ({ visits: [tempVisit, ...state.visits], lastActionTimestamp: now }));
        get().setLastActionTimestamp(tempId, now);

        const syncPayload = {
            wineryId: winery.id,
            wineryDbId: winery.dbId,
            wineryName: winery.name,
            wineryAddress: winery.address,
            lat: winery.lat,
            lng: winery.lng,
            visit_date: visitData.visit_date,
            user_review: visitData.user_review,
            rating: visitData.rating,
            photos: await stabilizePhotos(visitData.photos),
            is_private: visitData.is_private,
            tempId
        };

        if (await enqueueIfOffline('log_visit', user.id, syncPayload)) {
            set({ isSavingVisit: false, lastActionTimestamp: Date.now() });
            return;
        }

        let uploadedPaths: string[] = [];
        const folderUuid = crypto.randomUUID();

        try {
          if (visitData.photos.length > 0) {
            const uploadPromises = visitData.photos.map(async (photo) => {
              const file = isBase64Photo(photo) ? base64ToFile(photo.base64, photo.type, photo.name) : (photo as File);
              const fileName = `${Date.now()}-${file.name}`;
              const filePath = `${user.id}/${folderUuid}/${fileName}`;
              
              const { error: uploadError } = await supabase.storage.from('visit-photos').upload(filePath, file, { upsert: true });
              if (uploadError) throw uploadError;
              return filePath;
            });

            uploadedPaths = await Promise.all(uploadPromises);
          }


          const rpcWineryData = WineryService.getRpcData(winery);

          const rpcVisitData = {
            visit_date: visitData.visit_date,
            user_review: visitData.user_review,
            rating: visitData.rating > 0 ? visitData.rating : 1,
            photos: uploadedPaths,
            is_private: visitData.is_private || false,
          };

          const { data: rpcResult, error: rpcError } = await supabase.rpc('log_visit', {
            p_winery_data: rpcWineryData,
            p_visit_data: rpcVisitData,
          }, { headers: getE2EHeaders() } as any);

          if (rpcError) {
              console.error('Failed to save visit:', rpcError);
              throw rpcError;
          }
          
          const visitId = rpcResult.visit_id;
          const wineryDbId = rpcResult.winery_id;
          const finishedNow = Date.now();
          get().setLastActionTimestamp(String(visitId), finishedNow);
          
          // Update wineryDataStore with the new dbId if we didn't have it
          if (wineryDbId && wineryDbId !== winery.dbId) {
              useWineryDataStore.getState().upsertWinery({ ...winery, dbId: wineryDbId as WineryDbId });
          }

          const finalVisit: VisitWithWinery = { 
              ...tempVisit, 
              id: visitId, 
              photos: uploadedPaths,
              syncStatus: 'synced',
              wineries: {
                  ...tempVisit.wineries,
                  id: Number(wineryDbId) as WineryDbId
              }
          };

          replaceVisit(winery.id, tempId, finalVisit);
          set(state => ({
              visits: state.visits.map(v => String(v.id) === tempId ? finalVisit : v),
              lastActionTimestamp: finishedNow
          }));

        } catch (error) {
          if (await handleSyncError(error, 'log_visit', user.id, syncPayload)) {
            set({ isSavingVisit: false, lastActionTimestamp: Date.now() });
            return;
          }

          console.error("Failed to save visit, marking as error:", error);
          
          if (uploadedPaths.length > 0) {
            await supabase.storage.from('visit-photos').remove(uploadedPaths);
          }

          set(state => ({ 
              visits: state.visits.map(v => String(v.id) === tempId ? { ...v, syncStatus: 'error' as const } : v),
              lastActionTimestamp: Date.now()
          }));
          
          throw error;
        } finally {
          set({ isSavingVisit: false });
        }
      },

      updateVisit: async (visitId, visitData, newPhotos = [], photosToDelete = []) => {
        set({ isSavingVisit: true });
        const supabase = createClient();
        const { optimisticallyUpdateVisit, revertOptimisticUpdate, confirmOptimisticUpdate } = useWineryStore.getState();

        const winery = useWineryStore.getState().getWineries().find(w => w.visits?.some(v => String(v.id) === String(visitId)));
        const originalVisit = winery?.visits?.find(v => String(v.id) === String(visitId));
        if (!originalVisit) throw new Error("Original visit not found.");

        const existingPhotos = originalVisit.photos || [];
        const newOptimisticPhotos = existingPhotos.filter(p => !photosToDelete.includes(p));
        
        optimisticallyUpdateVisit(visitId, { ...visitData, photos: newOptimisticPhotos });
        const now = Date.now();
        set(state => ({
            visits: state.visits.map(v => String(v.id) === String(visitId) ? { ...v, ...visitData, photos: newOptimisticPhotos, syncStatus: 'pending' as const } : v),
            lastActionTimestamp: now
        }));
        get().setLastActionTimestamp(String(visitId), now);

        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) throw new Error("User not authenticated.");
        const user = session.user;

        const syncPayload = {
            visitId,
            visitData,
            newPhotos: await stabilizePhotos(newPhotos),
            photosToDelete
        };

        if (await enqueueIfOffline('update_visit', user.id, syncPayload)) {
            set({ isSavingVisit: false, lastActionTimestamp: Date.now() });
            return;
        }

        try {
          let newPhotoPaths: string[] = [];
          if (newPhotos.length > 0) {
            const uploadPromises = newPhotos.map(async (photo) => {
              const file = isBase64Photo(photo) ? base64ToFile(photo.base64, photo.type, photo.name) : (photo as File);
              const fileName = `${Date.now()}-${file.name}`;
              const filePath = `${user.id}/${visitId}/${fileName}`;
              
              const { error: uploadError } = await supabase.storage.from('visit-photos').upload(filePath, file, { upsert: true });
              if (uploadError) throw uploadError;
              return filePath;
            });
            newPhotoPaths = (await Promise.all(uploadPromises)).filter((p): p is string => p !== null);
          }

          const finalPhotoPaths = [...newOptimisticPhotos, ...newPhotoPaths];
          const { data: updatedVisit, error } = await supabase.rpc('update_visit', {
              p_visit_id: parseInt(visitId),
              p_visit_data: { 
                ...visitData, 
                rating: (visitData.rating && visitData.rating > 0) ? visitData.rating : (originalVisit.rating || 5),
                photos: finalPhotoPaths, 
                is_private: visitData.is_private 
              }
          }, { headers: getE2EHeaders() } as any);

          if (error) {
              console.error('Failed to update visit:', error);
              throw error;
          }

          if (photosToDelete.length > 0) {
            const { error: removeError } = await supabase.storage.from('visit-photos').remove(photosToDelete);
            if (removeError) {
                console.warn('Failed to remove deleted photos from storage:', removeError);
            }
          }

          const finalVisit: VisitWithWinery = {
              ...updatedVisit,
              wineryName: updatedVisit.winery_name,
              wineryId: updatedVisit.google_place_id,
              syncStatus: 'synced'
          };

          confirmOptimisticUpdate(finalVisit);
          const finishedNow = Date.now();
          set(state => ({
              visits: state.visits.map(v => String(v.id) === String(visitId) ? finalVisit : v),
              lastActionTimestamp: finishedNow
          }));
          get().setLastActionTimestamp(String(visitId), finishedNow);

        } catch (error) {
          if (await handleSyncError(error, 'update_visit', user.id, syncPayload)) {
            set({ isSavingVisit: false, lastActionTimestamp: Date.now() });
            return;
          }
          console.error("Failed to update visit, marking as error:", error);
          revertOptimisticUpdate();
          set(state => ({
            visits: state.visits.map(v => String(v.id) === String(visitId) ? { ...v, syncStatus: 'error' as const } : v),
            lastActionTimestamp: Date.now()
          }));
          get().fetchVisits(get().page, true);
          throw error;
        } finally {
          set({ isSavingVisit: false });
        }
      },

      deleteVisit: async (visitId) => {
        const { optimisticallyDeleteVisit, revertOptimisticUpdate, confirmOptimisticUpdate } = useWineryStore.getState();
        const supabase = createClient();
        
        optimisticallyDeleteVisit(visitId);
        const originalVisits = get().visits;
        const now = Date.now();
        set(state => ({
            visits: state.visits.filter(v => String(v.id) !== String(visitId)),
            lastActionTimestamp: now
        }));
        get().setLastActionTimestamp(String(visitId), now);

        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;

        const syncPayload = { visitId };

        if (await enqueueIfOffline('delete_visit', user?.id, syncPayload)) {
            set({ lastActionTimestamp: Date.now() });
            return;
        }

        try {
            const { error } = await supabase.rpc('delete_visit', { p_visit_id: parseInt(visitId) }, { headers: getE2EHeaders() } as any);
            if (error) throw error;
            
            confirmOptimisticUpdate();
            set({ lastActionTimestamp: Date.now() });
        } catch (error) {
            if (await handleSyncError(error, 'delete_visit', user?.id, syncPayload)) {
                set({ lastActionTimestamp: Date.now() });
                return;
            }

            console.error("Failed to delete visit, marking as error:", error);
            revertOptimisticUpdate();
            // Set error status on the original visits that were reverted
            const revertedVisits = originalVisits.map(v => 
                String(v.id) === String(visitId) ? { ...v, syncStatus: 'error' as const } : v
            );
            set({ visits: revertedVisits, lastActionTimestamp: Date.now() });
            throw error;
        }
      },

      // E2E Helper: Directly injects a visit into the offline queue with stable photos
      injectVisitWithPhotos: async (winery, visitData) => {
        const { addVisitToWinery } = useWineryStore.getState();
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) throw new Error("User not authenticated.");
        
        const tempId = `temp-inject-${Date.now()}`;

        const previewUrls: string[] = [];
        const queuePhotos: Base64Photo[] = [];

        for (const p of visitData.photos) {
            if (isBase64Photo(p)) {
                previewUrls.push(`data:${p.type};base64,${p.base64}`);
                queuePhotos.push(p);
            } else {
                const file = p as File;
                previewUrls.push(URL.createObjectURL(file));
                const base64DataUrl = await fileToBase64(file);
                queuePhotos.push({
                    __isBase64: true,
                    base64: base64DataUrl.split(',')[1],
                    name: file.name,
                    type: file.type
                });
            }
        }

        const tempVisit: VisitWithWinery = {
            id: tempId,
            user_id: session.user.id,
            visit_date: visitData.visit_date,
            rating: visitData.rating,
            user_review: visitData.user_review,
            photos: previewUrls,
            wineryName: winery.name,
            wineryId: winery.id,
            wineries: {
                id: Number(winery.dbId || 0) as WineryDbId,
                google_place_id: winery.id,
                name: winery.name,
                address: winery.address,
                latitude: winery.lat.toString(),
                longitude: winery.lng.toString(),
            }
        };

        addVisitToWinery(winery.id, tempVisit);
        set(state => ({ visits: [tempVisit, ...state.visits] }));

        await useSyncStore.getState().addMutation({
            type: 'log_visit',
            userId: session.user.id,
            payload: {
                wineryId: winery.id,
                wineryDbId: winery.dbId,
                wineryName: winery.name,
                wineryAddress: winery.address,
                lat: winery.lat,
                lng: winery.lng,
                visit_date: visitData.visit_date,
                user_review: visitData.user_review,
                rating: visitData.rating,
                photos: queuePhotos,
                tempId
            }
        });
        
        set({ lastActionTimestamp: Date.now() });
      },

      reset: () => set({
        visits: [],
        isLoading: false,
        error: null,
        isSavingVisit: false,
        isSyncing: false,
        lastActionTimestamp: null,
        lastActionTimestamps: {},
        page: 1,
        totalPages: 1,
        hasMore: false,
      }),

      setLastActionTimestamp: (visitId: string, timestamp: number | null) => set(state => {
        const next = { ...state.lastActionTimestamps };
        if (timestamp === null) {
          delete next[visitId];
        } else {
          next[visitId] = timestamp;
          // Cleanup: Keep the record size manageable
          const keys = Object.keys(next);
          if (keys.length > 50) {
            const oldestKey = keys.reduce((a, b) => next[a] < next[b] ? a : b);
            delete next[oldestKey];
          }
        }
        return { lastActionTimestamps: next };
      }),

      initialize: async () => {
        // Wait for SyncStore to initialize from IDB
        const syncStore = useSyncStore.getState();
        if (!syncStore.isInitialized) {
            await syncStore.initialize();
        }

        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const queue = useSyncStore.getState().queue;
        const pendingVisits: VisitWithWinery[] = [];

        for (const item of queue) {
            if (item.type === 'log_visit') {
                try {
                    const payload = await syncStore.getDecryptedPayload<any>(item, user.id);
                    pendingVisits.push({
                        id: payload.tempId || item.id,
                        user_id: user.id,
                        visit_date: payload.visit_date,
                        rating: payload.rating,
                        user_review: payload.user_review,
                        is_private: payload.is_private || false,
                        photos: (payload.photos || []).map((p: any) => isBase64Photo(p) ? `data:${p.type};base64,${p.base64}` : p),
                        wineryName: payload.wineryName,
                        wineryId: payload.wineryId,
                        syncStatus: 'pending',
                        wineries: {
                            id: Number(payload.wineryDbId || 0) as WineryDbId,
                            google_place_id: payload.wineryId,
                            name: payload.wineryName,
                            address: payload.wineryAddress,
                            latitude: payload.lat?.toString() || '0',
                            longitude: payload.lng?.toString() || '0',
                        }
                    });
                } catch (e) {
                    console.error('[VisitStore] Failed to decrypt pending visit:', e);
                }
            }
        }

        if (pendingVisits.length > 0) {
            set(state => {
                // Filter out any that might already be in state (though unlikely)
                const newVisits = [...state.visits];
                for (const pv of pendingVisits) {
                    if (!newVisits.find(v => v.id === pv.id)) {
                        newVisits.unshift(pv);
                    }
                }
                return { visits: newVisits };
            });
        }
      },
    }),
    {
      name: process.env.NEXT_PUBLIC_IS_E2E === 'true' ? 'visit-storage-e2e' : 'visit-storage',
      storage: createJSONStorage(() => idbStorage),
      partialize: (state): Partial<VisitState> => {
        if (process.env.NEXT_PUBLIC_IS_E2E === 'true') return {};
        return { 
          visits: state.visits.slice(0, 20),
          page: state.page, 
          totalPages: state.totalPages, 
          hasMore: state.hasMore,
          lastActionTimestamp: state.lastActionTimestamp,
          lastActionTimestamps: state.lastActionTimestamps
        };
      },
    }
  ),
  shallow
);

// Expose store for E2E testing
if (typeof window !== 'undefined') {
  (window as any).useVisitStore = useVisitStore;
}
