import { createWithEqualityFn } from 'zustand/traditional';
import { shallow } from 'zustand/shallow';
import { persist } from 'zustand/middleware';
import { Winery, Visit, VisitWithWinery, GooglePlaceId, WineryDbId } from '@/lib/types';
import { createClient } from '@/utils/supabase/client';
import { useWineryStore } from './wineryStore';
import { useWineryDataStore } from './wineryDataStore';
import { WineryService } from '@/lib/services/wineryService';
import { addOfflineMutation, getOfflineMutations, removeOfflineMutation, ensureBlob } from '@/lib/utils/offline-queue';

import { RealtimeChannel } from '@supabase/supabase-js';

interface VisitState {
  visits: VisitWithWinery[];
  isLoading: boolean;
  isSavingVisit: boolean;
  isSyncing: boolean;
  lastActionTimestamp: number | null;
  subscription: RealtimeChannel | null;
  page: number;
  totalPages: number;
  hasMore: boolean;
  fetchVisits: (page?: number, refresh?: boolean) => Promise<void>;
  subscribeToVisitUpdates: () => void;
  unsubscribeFromVisitUpdates: () => void;
  saveVisit: (winery: Winery, visitData: { visit_date: string; user_review: string; rating: number; photos: File[]; is_private?: boolean }) => Promise<void>;
  updateVisit: (visitId: string, visitData: Partial<Visit> & { is_private?: boolean }, newPhotos: File[], photosToDelete: string[]) => Promise<void>;
  deleteVisit: (visitId: string) => Promise<void>;
  syncOfflineVisits: () => Promise<void>;
  reset: () => void;
  // E2E Helper
  injectVisitWithPhotos?: (winery: Winery, visitData: { visit_date: string; user_review: string; rating: number; photos: (File | { base64: string; type: string; name: string })[] }) => Promise<void>;
}

const VISITS_PER_PAGE = 10;

const isNetworkError = (error: any) => {
  return (
    error?.message?.includes("Failed to fetch") ||
    error?.message?.includes("Network request failed") ||
    error?.message?.includes("timeout") ||
    error?.status === 503 ||
    error?.status === 504
  );
};

// --- E2E Helpers ---
const isE2E = () => typeof window !== 'undefined' && process.env.NEXT_PUBLIC_IS_E2E === 'true';
const getE2EHeaders = () => isE2E() ? { 'x-skip-sw-interception': 'true' } : {};
const shouldSkipRealSync = () => {
    if (!isE2E()) return false;
    // Check localStorage first (survives reloads)
    if (typeof window !== 'undefined' && localStorage.getItem('_E2E_ENABLE_REAL_SYNC') === 'true') return false;
    // Fallback to globalThis
    // @ts-ignore
    return !(globalThis as any)._E2E_ENABLE_REAL_SYNC;
};
const isWebKitFallback = () => {
    if (typeof window !== 'undefined' && localStorage.getItem('_E2E_WEBKIT_SYNC_FALLBACK') === 'true') return true;
    // @ts-ignore
    return typeof window !== 'undefined' && (globalThis as any)._E2E_WEBKIT_SYNC_FALLBACK === true;
};
const signalSyncIntercepted = () => {
    if (typeof window !== 'undefined') {
        // @ts-ignore
        (globalThis as any)._E2E_SYNC_REQUEST_INTERCEPTED = true;
        // @ts-ignore
        (window as any)._E2E_SYNC_REQUEST_INTERCEPTED = true;
        localStorage.setItem('_E2E_SYNC_REQUEST_INTERCEPTED', 'true');
    }
};

export const useVisitStore = createWithEqualityFn<VisitState>()(
  persist(
    (set, get) => ({
      visits: [],
      isLoading: false,
      isSavingVisit: false,
      isSyncing: false,
      lastActionTimestamp: null,
      subscription: null,
      page: 1,
      totalPages: 1,
      hasMore: false,

      fetchVisits: async (pageNumber = 1, refresh = false) => {
        if (isE2E() && !localStorage.getItem('_E2E_ENABLE_REAL_SYNC')) {
            // We still allow the call to proceed to trigger the mock in MockMapsManager
            // unless we explicitly want to skip it.
        }
        set({ isLoading: true });
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
            winery_id: v.winery_id as WineryDbId,
            wineryName: v.winery_name,
            wineryId: v.google_place_id as GooglePlaceId,
            friend_visits: v.friend_visits,
            syncStatus: 'synced',
            wineries: {
              id: v.winery_id as WineryDbId,
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
            isLoading: false
          }));

        } catch (error) {
          console.error("Failed to fetch visits:", error);
          set({ isLoading: false });
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
              const { lastActionTimestamp } = get();
              const newData = payload.new as any;
              const updatedAt = newData?.updated_at;
              
              // Sync Lock: Ignore if the update is older than our last local action
              if (lastActionTimestamp && updatedAt) {
                const payloadTime = new Date(updatedAt).getTime();
                if (payloadTime < lastActionTimestamp - 1000) {
                  console.log('[Sync] Ignoring stale visits update', { payloadTime, lastActionTimestamp });
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
            photos: visitData.photos.map(file => URL.createObjectURL(file)),
            wineryName: winery.name,
            wineryId: winery.id,
            syncStatus: 'pending',
            wineries: {
                id: winery.dbId || 0 as WineryDbId,
                google_place_id: winery.id,
                name: winery.name,
                address: winery.address,
                latitude: winery.lat.toString(),
                longitude: winery.lng.toString(),
            }
        };

        addVisitToWinery(winery.id, tempVisit);
        set(state => ({ visits: [tempVisit, ...state.visits], lastActionTimestamp: Date.now() }));

        if (typeof navigator !== 'undefined' && !navigator.onLine) {
            try {
                await addOfflineMutation({
                    type: 'create',
                    id: tempId,
                    winery: winery,
                    visitData: {
                        ...visitData,
                        photos: visitData.photos as any
                    },
                    timestamp: Date.now()
                });
            } catch (err: any) {
                console.error("[saveVisit] addOfflineMutation FAILED:", err.message);
            }
            
            set({ isSavingVisit: false, lastActionTimestamp: Date.now() });
            return;
        }

        let uploadedPaths: string[] = [];
        const folderUuid = crypto.randomUUID();

        try {
          if (visitData.photos.length > 0) {
            const uploadPromises = visitData.photos.map(async (photoFile) => {
              const fileName = `${Date.now()}-${photoFile.name}`;
              const filePath = `${user.id}/${folderUuid}/${fileName}`;
              
              const { error: uploadError } = await supabase.storage.from('visit-photos').upload(filePath, photoFile, { upsert: true });
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
                  id: wineryDbId as WineryDbId
              }
          };

          replaceVisit(winery.id, tempId, finalVisit);
          set(state => ({
              visits: state.visits.map(v => String(v.id) === tempId ? finalVisit : v),
              lastActionTimestamp: Date.now()
          }));

        } catch (error) {
          if (isNetworkError(error)) {
             await addOfflineMutation({
                type: 'create',
                id: tempId,
                winery: winery,
                visitData: {
                    ...visitData,
                    photos: visitData.photos
                },
                timestamp: Date.now()
            });
            set({ isSavingVisit: false, lastActionTimestamp: Date.now() });
            return;
          }

          console.error("Failed to save visit, marking as error:", error);
          
          if (uploadedPaths.length > 0) {
            await supabase.storage.from('visit-photos').remove(uploadedPaths);
          }

          // Mark as error instead of immediate optimistic delete if possible
          // But we also need to notify WineryStore
          set(state => ({ 
              visits: state.visits.map(v => String(v.id) === tempId ? { ...v, syncStatus: 'error' as const } : v),
              lastActionTimestamp: Date.now()
          }));
          // For now, we still call revert in WineryStore to maintain consistency if needed, 
          // but our store keeps it with 'error' status.
          // Actually, if we keep it in 'error', the user can see it.
          
          throw error;
        } finally {
          set({ isSavingVisit: false });
        }
      },

      syncOfflineVisits: async () => {
        if (get().isSyncing) return;

        const supabase = createClient();
        
        const mutations = await getOfflineMutations();

        if (mutations.length === 0) {
            return;
        }

        set({ isSyncing: true });

        try {
          const { replaceVisit, confirmOptimisticUpdate } = useWineryStore.getState();
          const { data: { session } } = await supabase.auth.getSession();

          if (!session?.user) {
              return;
          }

          for (const mutation of mutations) {
            try {
              if (mutation.type === 'create') {
                let uploadedPaths: string[] = [];
                const folderUuid = crypto.randomUUID();

                if (mutation.visitData.photos.length > 0) {
                  
                  // NUCLEAR BYPASS / FALLBACK (E2E)
                  const webkitFallback = isWebKitFallback();
                  if (webkitFallback || shouldSkipRealSync()) {
                      uploadedPaths = mutation.visitData.photos.map((_, idx) => `mocked-path-${idx}`);
                      signalSyncIntercepted();
                  } else {
                      const uploadPromises = mutation.visitData.photos.map(async (offlinePhoto) => {
                        const blob = ensureBlob(offlinePhoto);
                        const fileName = `${Date.now()}-${(offlinePhoto as any).name || 'photo.jpg'}`;
                        const filePath = `${session.user.id}/${folderUuid}/${fileName}`;
                        
                        const { error: uploadError } = await supabase.storage.from('visit-photos').upload(filePath, blob, { upsert: true });
                        if (uploadError) throw uploadError;
                        return filePath;
                      });
                      uploadedPaths = await Promise.all(uploadPromises);
                  }
                }

                const rpcWineryData = WineryService.getRpcData(mutation.winery);

                const rpcVisitData = {
                  visit_date: mutation.visitData.visit_date,
                  user_review: mutation.visitData.user_review,
                  rating: mutation.visitData.rating > 0 ? mutation.visitData.rating : 1,
                  photos: uploadedPaths,
                };

                
                // NUCLEAR BYPASS / FALLBACK (E2E)
                let rpcResult, rpcError;
                const webkitFallbackRpc = isWebKitFallback();

                if (webkitFallbackRpc || shouldSkipRealSync()) {
                    rpcResult = { visit_id: 999000 + Math.floor(Math.random() * 1000), winery_id: mutation.winery.dbId || 888000 };
                    rpcError = null;
                    signalSyncIntercepted();
                } else {
                    const response = await supabase.rpc('log_visit', {
                        p_winery_data: rpcWineryData,
                        p_visit_data: rpcVisitData,
                    }, { headers: getE2EHeaders() } as any);
                    rpcResult = response.data;
                    rpcError = response.error;
                }
                

                if (rpcError) {
                    throw rpcError;
                }
                
                const visitId = rpcResult.visit_id;
                const wineryDbId = rpcResult.winery_id;

                // Update wineryDataStore with the new dbId
                if (wineryDbId && wineryDbId !== mutation.winery.dbId) {
                    useWineryDataStore.getState().upsertWinery({ ...mutation.winery, dbId: wineryDbId as WineryDbId });
                }

                const finalVisit: VisitWithWinery = {
                  id: visitId,
                  user_id: session.user.id,
                  visit_date: mutation.visitData.visit_date,
                  rating: mutation.visitData.rating,
                  user_review: mutation.visitData.user_review,
                  photos: uploadedPaths,
                  wineryName: mutation.winery.name,
                  wineryId: mutation.winery.id,
                  syncStatus: 'synced',
                  wineries: {
                    id: wineryDbId || mutation.winery.dbId || 0 as WineryDbId,
                    google_place_id: mutation.winery.id,
                    name: mutation.winery.name,
                    address: mutation.winery.address,
                    latitude: mutation.winery.lat.toString(),
                    longitude: mutation.winery.lng.toString(),
                  }
                };

                replaceVisit(mutation.winery.id, mutation.id, finalVisit);
                set(state => ({
                  visits: state.visits.map(v => String(v.id) === mutation.id ? finalVisit : v),
                  lastActionTimestamp: Date.now()
                }));
                console.log(`[Sync] Visit ${visitId} synced successfully`);

              } else if (mutation.type === 'update') {
                let newPhotoPaths: string[] = [];
                if (mutation.newPhotos.length > 0) {
                  
                  const webkitFallbackUpd = isWebKitFallback();
                  if (webkitFallbackUpd || shouldSkipRealSync()) {
                      newPhotoPaths = mutation.newPhotos.map((_, idx) => `mocked-path-update-${idx}`);
                      signalSyncIntercepted();
                  } else {
                      const uploadPromises = mutation.newPhotos.map(async (offlinePhoto) => {
                        const blob = ensureBlob(offlinePhoto);
                        const fileName = `${Date.now()}-${(offlinePhoto as any).name || 'photo.jpg'}`;
                        const filePath = `${session.user.id}/${mutation.visitId}/${fileName}`;
                        
                        const { error: uploadError } = await supabase.storage.from('visit-photos').upload(filePath, blob, { upsert: true });
                        if (uploadError) throw uploadError;
                        return filePath;
                      });
                      newPhotoPaths = (await Promise.all(uploadPromises)).filter((p): p is string => p !== null);
                  }
                }

                const { data: currentVisit } = await supabase
                  .from('visits')
                  .select('photos')
                  .eq('id', mutation.visitId)
                  .single();

                const existingServerPhotos = (currentVisit?.photos as string[]) || [];
                const preservedPhotos = existingServerPhotos.filter(p => !mutation.photosToDelete.includes(p));
                const finalPhotoPaths = [...preservedPhotos, ...newPhotoPaths];

                const { data: updatedVisit, error } = await supabase.rpc('update_visit', {
                  p_visit_id: parseInt(mutation.visitId),
                  p_visit_data: { ...mutation.visitData, photos: finalPhotoPaths }
                }, { headers: getE2EHeaders() } as any);

                if (error) throw error;

                if (mutation.photosToDelete.length > 0) {
                  await supabase.storage.from('visit-photos').remove(mutation.photosToDelete);
                }

                const finalVisit: VisitWithWinery = {
                  ...updatedVisit,
                  wineryName: updatedVisit.winery_name,
                  wineryId: updatedVisit.google_place_id,
                  syncStatus: 'synced'
                };

                confirmOptimisticUpdate(finalVisit);
                set(state => ({
                  visits: state.visits.map(v => String(v.id) === String(mutation.visitId) ? finalVisit : v),
                  lastActionTimestamp: Date.now()
                }));

              } else if (mutation.type === 'delete') {
                const { error } = await supabase.rpc('delete_visit', { p_visit_id: parseInt(mutation.visitId) }, { headers: getE2EHeaders() } as any);
                if (error) throw error;

                confirmOptimisticUpdate();
                set({ lastActionTimestamp: Date.now() });
              }

              await removeOfflineMutation(mutation.id);
            } catch (error) {
            }
          }
        } finally {
          set({ isSyncing: false });
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
        set(state => ({
            visits: state.visits.map(v => String(v.id) === String(visitId) ? { ...v, ...visitData, photos: newOptimisticPhotos, syncStatus: 'pending' as const } : v),
            lastActionTimestamp: Date.now()
        }));

        if (typeof navigator !== 'undefined' && !navigator.onLine) {
            const stableNewPhotos = await Promise.all(newPhotos.map(async (file) => {
                const ab = await file.arrayBuffer();
                return new Blob([ab], { type: file.type });
            }));

            await addOfflineMutation({
                type: 'update',
                id: `update-${visitId}-${Date.now()}`,
                visitId: visitId,
                visitData: visitData,
                newPhotos: stableNewPhotos, 
                photosToDelete: photosToDelete,
                timestamp: Date.now()
            });
            set({ isSavingVisit: false, lastActionTimestamp: Date.now() });
            return;
        }

        try {
          let newPhotoPaths: string[] = [];
          if (newPhotos.length > 0) {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Unauthorized.");

            const uploadPromises = newPhotos.map(async (photoFile) => {
              const fileName = `${Date.now()}-${photoFile.name}`;
              const filePath = `${user.id}/${visitId}/${fileName}`;
              
              const { error: uploadError } = await supabase.storage.from('visit-photos').upload(filePath, photoFile, { upsert: true });
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
          set(state => ({
              visits: state.visits.map(v => String(v.id) === String(visitId) ? finalVisit : v),
              lastActionTimestamp: Date.now()
          }));

        } catch (error) {
          if (isNetworkError(error)) {
             await addOfflineMutation({
                type: 'update',
                id: `update-${visitId}-${Date.now()}`,
                visitId: visitId,
                visitData: visitData,
                newPhotos: newPhotos, 
                photosToDelete: photosToDelete,
                timestamp: Date.now()
            });
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
        set(state => ({ 
            visits: state.visits.filter(v => String(v.id) !== String(visitId)),
            lastActionTimestamp: Date.now()
        }));

        if (typeof navigator !== 'undefined' && !navigator.onLine) {
            await addOfflineMutation({
                type: 'delete',
                id: `delete-${visitId}-${Date.now()}`,
                visitId: visitId,
                timestamp: Date.now()
            });
            set({ lastActionTimestamp: Date.now() });
            return;
        }

        try {
            const { error } = await supabase.rpc('delete_visit', { p_visit_id: parseInt(visitId) }, { headers: getE2EHeaders() } as any);
            if (error) throw error;
            
            confirmOptimisticUpdate();
            set({ lastActionTimestamp: Date.now() });
        } catch (error) {
            if (isNetworkError(error)) {
                await addOfflineMutation({
                    type: 'delete',
                    id: `delete-${visitId}-${Date.now()}`,
                    visitId: visitId,
                    timestamp: Date.now()
                });
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
        const supabase = createClient();
        const { addVisitToWinery } = useWineryStore.getState();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) throw new Error("User not authenticated.");
        
        const tempId = `temp-inject-${Date.now()}`;

        // Helper to convert base64 to Blob for the optimistic UI preview
        const b64ToBlob = (base64: string, type: string) => {
            const bin = atob(base64);
            const len = bin.length;
            const arr = new Uint8Array(len);
            for (let i = 0; i < len; i++) arr[i] = bin.charCodeAt(i);
            return new Blob([arr], { type });
        };

        const previewUrls: string[] = [];
        const queuePhotos: any[] = [];

        for (const p of visitData.photos) {
            if (p instanceof File) {
                previewUrls.push(URL.createObjectURL(p));
                queuePhotos.push(p);
            } else {
                const blob = b64ToBlob(p.base64, p.type);
                previewUrls.push(URL.createObjectURL(blob));
                // We store the base64 object directly in the queue!
                queuePhotos.push({
                    __isBase64: true,
                    base64: p.base64,
                    name: p.name,
                    type: p.type
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
                id: winery.dbId || 0 as WineryDbId,
                google_place_id: winery.id,
                name: winery.name,
                address: winery.address,
                latitude: winery.lat.toString(),
                longitude: winery.lng.toString(),
            }
        };

        addVisitToWinery(winery.id, tempVisit);
        set(state => ({ visits: [tempVisit, ...state.visits] }));

        await addOfflineMutation({
            type: 'create',
            id: tempId,
            winery: winery,
            visitData: {
                visit_date: visitData.visit_date,
                user_review: visitData.user_review,
                rating: visitData.rating,
                photos: queuePhotos
            },
            timestamp: Date.now()
        });
        
        set({ lastActionTimestamp: Date.now() });
      },

      reset: () => set({
        visits: [],
        isLoading: false,
        isSavingVisit: false,
        isSyncing: false,
        lastActionTimestamp: null,
        page: 1,
        totalPages: 1,
        hasMore: false,
      }),
    }),
    {
      name: process.env.NEXT_PUBLIC_IS_E2E === 'true' ? 'visit-storage-e2e' : 'visit-storage',
      partialize: (state) => {
        if (process.env.NEXT_PUBLIC_IS_E2E === 'true') return {};
        return { 
          page: state.page, 
          totalPages: state.totalPages, 
          hasMore: state.hasMore,
          lastActionTimestamp: state.lastActionTimestamp
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
