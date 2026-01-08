import { createWithEqualityFn } from 'zustand/traditional';
import { shallow } from 'zustand/shallow';
import { persist } from 'zustand/middleware';
import { Winery, Visit, VisitWithWinery, GooglePlaceId, WineryDbId } from '@/lib/types';
import { createClient } from '@/utils/supabase/client';
import { useWineryStore } from './wineryStore';
import { addOfflineVisit, getOfflineVisits, removeOfflineVisit, OfflineVisit } from '@/lib/utils/offline-queue';

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
            console.log("Offline detected. Queuing visit for sync.");
            const offlineVisit: OfflineVisit = {
                id: tempId,
                winery: winery,
                visitData: {
                    ...visitData,
                    photos: visitData.photos // Store Blobs/Files directly in IDB
                },
                timestamp: Date.now()
            };
            
            await addOfflineVisit(offlineVisit);
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
        const offlineVisits = await getOfflineVisits();
        if (offlineVisits.length === 0) return;

        console.log(`Syncing ${offlineVisits.length} offline visits...`);
        const supabase = createClient();
        const { replaceVisit } = useWineryStore.getState();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return; // Can't sync if not logged in

        for (const visit of offlineVisits) {
            try {
                // Reuse logic similar to saveVisit but for specific IDB items
                let uploadedPaths: string[] = [];
                const folderUuid = crypto.randomUUID(); // New folder for each visit
                
                // 1. Upload Photos
                if (visit.visitData.photos.length > 0) {
                    const uploadPromises = visit.visitData.photos.map(async (blob) => {
                        // Cast blob to File if needed or just upload blob with metadata
                        const file = blob as File; // IDB stores Files as is
                        const fileName = `${Date.now()}-${file.name || 'photo.jpg'}`;
                        const filePath = `${session.user.id}/${folderUuid}/${fileName}`;
                        const { error: uploadError } = await supabase.storage.from('visit-photos').upload(filePath, file);
                        if (uploadError) throw uploadError;
                        return filePath;
                    });
                    uploadedPaths = await Promise.all(uploadPromises);
                }

                // 2. Prepare RPC Data
                const rpcWineryData = {
                    id: visit.winery.id,
                    name: visit.winery.name,
                    address: visit.winery.address,
                    lat: visit.winery.lat,
                    lng: visit.winery.lng,
                    phone: visit.winery.phone || null,
                    website: visit.winery.website || null,
                    rating: visit.winery.rating || null,
                };

                const rpcVisitData = {
                    visit_date: visit.visitData.visit_date,
                    user_review: visit.visitData.user_review,
                    rating: visit.visitData.rating > 0 ? visit.visitData.rating : 1,
                    photos: uploadedPaths,
                };

                // 3. Call RPC
                const { data: rpcResult, error: rpcError } = await supabase.rpc('log_visit', {
                    p_winery_data: rpcWineryData,
                    p_visit_data: rpcVisitData,
                });

                if (rpcError) throw rpcError;

                // 4. Success: Update Store & Clean IDB
                const finalVisit: VisitWithWinery = {
                    id: rpcResult.visit_id,
                    user_id: session.user.id,
                    visit_date: visit.visitData.visit_date,
                    rating: visit.visitData.rating,
                    user_review: visit.visitData.user_review,
                    photos: uploadedPaths,
                    wineryName: visit.winery.name,
                    wineryId: visit.winery.id,
                    wineries: {
                        id: visit.winery.dbId || 0 as WineryDbId,
                        google_place_id: visit.winery.id,
                        name: visit.winery.name,
                        address: visit.winery.address,
                        latitude: visit.winery.lat.toString(),
                        longitude: visit.winery.lng.toString(),
                    }
                };

                replaceVisit(visit.winery.id, visit.id, finalVisit);
                set(state => ({
                    visits: state.visits.map(v => String(v.id) === visit.id ? finalVisit : v),
                    lastMutation: Date.now()
                }));

                await removeOfflineVisit(visit.id);
                console.log(`Synced visit ${visit.id}`);

            } catch (error) {
                console.error(`Failed to sync visit ${visit.id}:`, error);
                // On permanent failure, we might want to notify the user or keep retrying.
                // For now, we leave it in the queue.
                // Optionally remove the optimistic visit if it's a fatal 400 error to avoid stale UI?
                // Keeping it is safer for user data retention.
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
        
        // Optimistic update in both stores
        optimisticallyUpdateVisit(visitId, { ...visitData, photos: newOptimisticPhotos });
        set(state => ({
            visits: state.visits.map(v => String(v.id) === String(visitId) ? { ...v, ...visitData, photos: newOptimisticPhotos } : v)
        }));

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

        try {
            const { error } = await supabase.rpc('delete_visit', { p_visit_id: parseInt(visitId) });
            if (error) throw error;
            
            confirmOptimisticUpdate();
            set({ lastMutation: Date.now() });
        } catch (error) {
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
