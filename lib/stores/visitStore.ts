import { createWithEqualityFn } from 'zustand/traditional';
import { shallow } from 'zustand/shallow';
import { persist } from 'zustand/middleware';
import { Winery, Visit, VisitWithWinery, GooglePlaceId, WineryDbId } from '@/lib/types';
import { createClient } from '@/utils/supabase/client';
import { useWineryStore } from './wineryStore';
import { addOfflineMutation, getOfflineMutations, removeOfflineMutation } from '@/lib/utils/offline-queue';

interface VisitState {
  visits: VisitWithWinery[];
  isLoading: boolean;
  isSavingVisit: boolean;
  lastMutation: number;
  page: number;
  totalPages: number;
  hasMore: boolean;
  fetchVisits: (page?: number, refresh?: boolean) => Promise<void>;
  saveVisit: (winery: Winery, visitData: { visit_date: string; user_review: string; rating: number; photos: File[] }) => Promise<void>;
  updateVisit: (visitId: string, visitData: Partial<Visit>, newPhotos: File[], photosToDelete: string[]) => Promise<void>;
  deleteVisit: (visitId: string) => Promise<void>;
  syncOfflineVisits: () => Promise<void>;
  reset: () => void;
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

export const useVisitStore = createWithEqualityFn<VisitState>()(
  persist(
    (set, get) => ({
      visits: [],
      isLoading: false,
      isSavingVisit: false,
      lastMutation: 0,
      page: 1,
      totalPages: 1,
      hasMore: false,

      fetchVisits: async (pageNumber = 1, refresh = false) => {
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

      saveVisit: async (winery, visitData) => {
        set({ isSavingVisit: true });
        const supabase = createClient();
        const { addVisitToWinery, replaceVisit, optimisticallyDeleteVisit, confirmOptimisticUpdate } = useWineryStore.getState();

        // Use getSession for better offline support (getUser requires network often)
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) throw new Error("User not authenticated.");
        const user = session.user;

        // Create temporary ID and Visit object
        const tempId = `temp-${Date.now()}`;
        const tempVisit: VisitWithWinery = {
            id: tempId,
            user_id: user.id,
            visit_date: visitData.visit_date,
            rating: visitData.rating,
            user_review: visitData.user_review,
            photos: visitData.photos.map(file => URL.createObjectURL(file)),
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

        // 1. Optimistic Add to both stores
        addVisitToWinery(winery.id, tempVisit);
        set(state => ({ visits: [tempVisit, ...state.visits] }));

        // 2. Offline Handling
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
            console.log("Offline detected. Queuing create visit for sync.");
            await addOfflineMutation({
                type: 'create',
                id: tempId,
                winery: winery,
                visitData: {
                    ...visitData,
                    photos: visitData.photos // Store Blobs/Files directly in IDB
                },
                timestamp: Date.now()
            });
            
            set({ isSavingVisit: false });
            return; // Stop here, sync will handle the rest later
        }

        let uploadedPaths: string[] = [];
        const folderUuid = crypto.randomUUID();

        try {
          // 3. Parallel Uploads (Pre-RPC)
          if (visitData.photos.length > 0) {
            const uploadPromises = visitData.photos.map(async (photoFile) => {
              const fileName = `${Date.now()}-${photoFile.name}`;
              const filePath = `${user.id}/${folderUuid}/${fileName}`;
              const { error: uploadError } = await supabase.storage.from('visit-photos').upload(filePath, photoFile);
              if (uploadError) throw uploadError;
              return filePath;
            });

            uploadedPaths = await Promise.all(uploadPromises);
          }

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

          const rpcVisitData = {
            visit_date: visitData.visit_date,
            user_review: visitData.user_review,
            rating: visitData.rating > 0 ? visitData.rating : 1, // Ensure rating is always 1-5
            photos: uploadedPaths,
          };

          // 4. Log Visit (Atomic)
          const { data: rpcResult, error: rpcError } = await supabase.rpc('log_visit', {
            p_winery_data: rpcWineryData,
            p_visit_data: rpcVisitData,
          });

          if (rpcError) throw rpcError;
          
          const visitId = rpcResult.visit_id;
          const finalVisit: VisitWithWinery = { 
              ...tempVisit, 
              id: visitId, 
              photos: uploadedPaths // Use the real server paths
          };

          // 5. Replace temp visit in both stores
          replaceVisit(winery.id, tempId, finalVisit);
          set(state => ({
              visits: state.visits.map(v => String(v.id) === tempId ? finalVisit : v),
              lastMutation: Date.now()
          }));

        } catch (error) {
          if (isNetworkError(error)) {
             console.log("Network error during save. Queuing for sync instead of reverting.");
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
            set({ isSavingVisit: false });
            return;
          }

          console.error("Failed to save visit, reverting:", error);
          
          // Cleanup orphaned photos if RPC failed
          if (uploadedPaths.length > 0) {
            await supabase.storage.from('visit-photos').remove(uploadedPaths);
          }

          optimisticallyDeleteVisit(tempId);
          set(state => ({ visits: state.visits.filter(v => String(v.id) !== tempId) }));
          confirmOptimisticUpdate();
          throw error;
        } finally {
          set({ isSavingVisit: false });
        }
      },

      syncOfflineVisits: async () => {
        const mutations = await getOfflineMutations();
        if (mutations.length === 0) return;

        console.log(`Syncing ${mutations.length} offline mutations...`);
        const supabase = createClient();
        const { replaceVisit, confirmOptimisticUpdate } = useWineryStore.getState();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return; // Can't sync if not logged in

        for (const mutation of mutations) {
            try {
                if (mutation.type === 'create') {
                    // --- REPLAY CREATE ---
                    let uploadedPaths: string[] = [];
                    const folderUuid = crypto.randomUUID();
                    
                    if (mutation.visitData.photos.length > 0) {
                        const uploadPromises = mutation.visitData.photos.map(async (blob) => {
                            const file = blob as File;
                            const fileName = `${Date.now()}-${file.name || 'photo.jpg'}`;
                            const filePath = `${session.user.id}/${folderUuid}/${fileName}`;
                            const { error: uploadError } = await supabase.storage.from('visit-photos').upload(filePath, file);
                            if (uploadError) throw uploadError;
                            return filePath;
                        });
                        uploadedPaths = await Promise.all(uploadPromises);
                    }

                    const rpcWineryData = {
                        id: mutation.winery.id,
                        name: mutation.winery.name,
                        address: mutation.winery.address,
                        lat: mutation.winery.lat,
                        lng: mutation.winery.lng,
                        phone: mutation.winery.phone || null,
                        website: mutation.winery.website || null,
                        rating: mutation.winery.rating || null,
                    };

                    const rpcVisitData = {
                        visit_date: mutation.visitData.visit_date,
                        user_review: mutation.visitData.user_review,
                        rating: mutation.visitData.rating > 0 ? mutation.visitData.rating : 1,
                        photos: uploadedPaths,
                    };

                    const { data: rpcResult, error: rpcError } = await supabase.rpc('log_visit', {
                        p_winery_data: rpcWineryData,
                        p_visit_data: rpcVisitData,
                    });

                    if (rpcError) throw rpcError;

                    const finalVisit: VisitWithWinery = {
                        id: rpcResult.visit_id,
                        user_id: session.user.id,
                        visit_date: mutation.visitData.visit_date,
                        rating: mutation.visitData.rating,
                        user_review: mutation.visitData.user_review,
                        photos: uploadedPaths,
                        wineryName: mutation.winery.name,
                        wineryId: mutation.winery.id,
                        wineries: {
                            id: mutation.winery.dbId || 0 as WineryDbId,
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
                        lastMutation: Date.now()
                    }));

                } else if (mutation.type === 'update') {
                    // --- REPLAY UPDATE ---
                    let newPhotoPaths: string[] = [];
                    if (mutation.newPhotos.length > 0) {
                        const uploadPromises = mutation.newPhotos.map(async (blob) => {
                            const file = blob as File;
                            const fileName = `${Date.now()}-${file.name || 'photo.jpg'}`;
                            const filePath = `${session.user.id}/${mutation.visitId}/${fileName}`;
                            const { error } = await supabase.storage.from('visit-photos').upload(filePath, file);
                            return error ? null : filePath;
                        });
                        newPhotoPaths = (await Promise.all(uploadPromises)).filter((p): p is string => p !== null);
                    }

                    // Get current visit state to merge photos if needed, but we rely on what's in the store/RPC
                    // Ideally we fetch the latest, but for sync we just assume we append to what was known or the RPC handles it?
                    // The 'update_visit' RPC replaces the photo array. We need the FINAL array.
                    // The mutation stores `newPhotos` (to be uploaded) and `photosToDelete` (to be removed).
                    // We need the *existing* photos that are NOT deleted.
                    
                    // Problem: We can't easily know the "existing" photos at the time of sync without fetching.
                    // Solution: The offline mutation should probably store the *final* intended state of the photo array?
                    // Or we just fetch the visit first.
                    
                    // Optimization: We can reconstruct the "final" array if we trust the offline logic passed it correctly.
                    // But `updateVisit` in the store takes `newPhotos` and `photosToDelete`.
                    
                    // Let's fetch the current visit from DB to be safe before applying updates?
                    // Or trust the client provided the diff? The RPC takes the *final* array.
                    // The offline queue should have stored the `visitData` which *includes* the preserved photos? 
                    // No, `visitData` in `updateVisit` is `Partial<Visit>`.
                    
                    // Let's look at `updateVisit` implementation below. It calculates `finalPhotoPaths`.
                    // We'll need to replicate that logic.
                    // We need the "preserved" photos.
                    // Let's assume the client state at the time of offline action had the correct "base".
                    
                    // Actually, we can fetch the visit from Supabase to get current photos, 
                    // filter out `photosToDelete`, and add `newPhotoPaths`.
                    // This handles race conditions better.
                    
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
                    });

                    if (error) throw error;

                    if (mutation.photosToDelete.length > 0) {
                        await supabase.storage.from('visit-photos').remove(mutation.photosToDelete);
                    }
                    
                    // Sync success
                    const finalVisit: VisitWithWinery = {
                        ...updatedVisit,
                        wineryName: updatedVisit.winery_name,
                        wineryId: updatedVisit.google_place_id
                    };
                    
                    confirmOptimisticUpdate(finalVisit);
                    set(state => ({
                        visits: state.visits.map(v => String(v.id) === String(mutation.visitId) ? finalVisit : v),
                        lastMutation: Date.now()
                    }));

                } else if (mutation.type === 'delete') {
                    // --- REPLAY DELETE ---
                    const { error } = await supabase.rpc('delete_visit', { p_visit_id: parseInt(mutation.visitId) });
                    if (error) throw error;
                    
                    confirmOptimisticUpdate();
                    set({ lastMutation: Date.now() });
                }

                await removeOfflineMutation(mutation.id);
                console.log(`Synced mutation ${mutation.id} (${mutation.type})`);

            } catch (error) {
                console.error(`Failed to sync mutation ${mutation.id}:`, error);
            }
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
        
        // 1. Optimistic update in both stores
        optimisticallyUpdateVisit(visitId, { ...visitData, photos: newOptimisticPhotos });
        set(state => ({
            visits: state.visits.map(v => String(v.id) === String(visitId) ? { ...v, ...visitData, photos: newOptimisticPhotos } : v)
        }));

        // 2. Offline Handling
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
            console.log("Offline detected. Queuing update visit for sync.");
            await addOfflineMutation({
                type: 'update',
                id: `update-${visitId}-${Date.now()}`,
                visitId: visitId,
                visitData: visitData,
                newPhotos: newPhotos, // Blobs
                photosToDelete: photosToDelete,
                timestamp: Date.now()
            });
            set({ isSavingVisit: false });
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
              const { error } = await supabase.storage.from('visit-photos').upload(filePath, photoFile);
              return error ? null : filePath;
            });
            newPhotoPaths = (await Promise.all(uploadPromises)).filter((p): p is string => p !== null);
          }

          const finalPhotoPaths = [...newOptimisticPhotos, ...newPhotoPaths];
          const { data: updatedVisit, error } = await supabase.rpc('update_visit', {
              p_visit_id: parseInt(visitId),
              p_visit_data: { ...visitData, photos: finalPhotoPaths }
          });

          if (error) throw error;

          if (photosToDelete.length > 0) {
            await supabase.storage.from('visit-photos').remove(photosToDelete);
          }

          const finalVisit: VisitWithWinery = {
              ...updatedVisit,
              wineryName: updatedVisit.winery_name,
              wineryId: updatedVisit.google_place_id
          };

          confirmOptimisticUpdate(finalVisit);
          set(state => ({
              visits: state.visits.map(v => String(v.id) === String(visitId) ? finalVisit : v),
              lastMutation: Date.now()
          }));

        } catch (error) {
          if (isNetworkError(error)) {
             console.log("Network error during update. Queuing for sync.");
             await addOfflineMutation({
                type: 'update',
                id: `update-${visitId}-${Date.now()}`,
                visitId: visitId,
                visitData: visitData,
                newPhotos: newPhotos, 
                photosToDelete: photosToDelete,
                timestamp: Date.now()
            });
            set({ isSavingVisit: false });
            return;
          }

          console.error("Failed to update visit, reverting:", error);
          revertOptimisticUpdate();
          // Re-fetching is the safest way to revert the global list
          get().fetchVisits(get().page, true);
          throw error;
        } finally {
          set({ isSavingVisit: false });
        }
      },

      deleteVisit: async (visitId) => {
        const { optimisticallyDeleteVisit, revertOptimisticUpdate, confirmOptimisticUpdate } = useWineryStore.getState();
        const supabase = createClient();
        
        // 1. Optimistic remove from both stores
        optimisticallyDeleteVisit(visitId);
        const originalVisits = get().visits;
        set(state => ({ visits: state.visits.filter(v => String(v.id) !== String(visitId)) }));

        // 2. Offline Handling
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
            console.log("Offline detected. Queuing delete visit for sync.");
            await addOfflineMutation({
                type: 'delete',
                id: `delete-${visitId}-${Date.now()}`,
                visitId: visitId,
                timestamp: Date.now()
            });
            return;
        }

        try {
            const { error } = await supabase.rpc('delete_visit', { p_visit_id: parseInt(visitId) });
            if (error) throw error;
            
            confirmOptimisticUpdate();
            set({ lastMutation: Date.now() });
        } catch (error) {
            if (isNetworkError(error)) {
                console.log("Network error during delete. Queuing for sync.");
                await addOfflineMutation({
                    type: 'delete',
                    id: `delete-${visitId}-${Date.now()}`,
                    visitId: visitId,
                    timestamp: Date.now()
                });
                return;
            }

            console.error("Failed to delete visit, reverting:", error);
            revertOptimisticUpdate();
            set({ visits: originalVisits });
            throw error;
        }
      },

      reset: () => set({
        visits: [],
        isLoading: false,
        isSavingVisit: false,
        lastMutation: 0,
        page: 1,
        totalPages: 1,
        hasMore: false,
      }),
    }),
    {
      name: 'visit-storage',
      partialize: (state) => ({ 
        visits: state.visits, 
        page: state.page, 
        totalPages: state.totalPages, 
        hasMore: state.hasMore,
        lastMutation: state.lastMutation
      }),
    }
  ),
  shallow
);
