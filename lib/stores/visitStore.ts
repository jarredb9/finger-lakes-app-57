import { createWithEqualityFn } from 'zustand/traditional';
import { shallow } from 'zustand/shallow';
import { Winery, Visit } from '@/lib/types';
import { createClient } from '@/utils/supabase/client';
import { useWineryStore } from './wineryStore';

interface VisitState {
  isSavingVisit: boolean;
  saveVisit: (winery: Winery, visitData: { visit_date: string; user_review: string; rating: number; photos: File[] }) => Promise<void>;
  updateVisit: (visitId: string, visitData: Partial<Visit>, newPhotos: File[], photosToDelete: string[]) => Promise<void>;
  deleteVisit: (visitId: string) => Promise<void>;
}

export const useVisitStore = createWithEqualityFn<VisitState>((set) => ({
  isSavingVisit: false,

  saveVisit: async (winery, visitData) => {
    set({ isSavingVisit: true });
    const supabase = createClient();
    const { addVisitToWinery, replaceVisit, optimisticallyDeleteVisit, confirmOptimisticUpdate } = useWineryStore.getState();

    // Create temporary ID and Visit object
    const tempId = `temp-${Date.now()}`;
    // Assuming user is available for the optimistic object (will be validated later)
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("User not authenticated.");

    const tempVisit: Visit = {
        id: tempId,
        user_id: user.id,
        visit_date: visitData.visit_date,
        rating: visitData.rating,
        user_review: visitData.user_review,
        photos: visitData.photos.map(file => URL.createObjectURL(file)), // Use object URLs for preview
    };

    // 1. Optimistic Add
    addVisitToWinery(winery.id, tempVisit);

    try {
      // Prepare winery data for RPC
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

      // Prepare visit data for RPC
      const rpcVisitData = {
        visit_date: visitData.visit_date,
        user_review: visitData.user_review,
        rating: visitData.rating,
        photos: [], // Photos are handled after RPC for ID
      };

      // Call the RPC to log the visit and ensure the winery exists
      const { data: rpcResult, error: rpcError } = await supabase.rpc('log_visit', {
        p_winery_data: rpcWineryData,
        p_visit_data: rpcVisitData,
      });

      if (rpcError) throw rpcError;
      if (!rpcResult || !rpcResult.visit_id) throw new Error("RPC did not return visit ID.");

      const visitId = rpcResult.visit_id;
      let finalVisit = { ...rpcVisitData, id: visitId, user_id: user.id, photos: [] as string[] };

      if (visitData.photos.length > 0) {
        const uploadPromises = visitData.photos.map(async (photoFile) => {
          const fileName = `${Date.now()}-${photoFile.name}`;
          const filePath = `${user.id}/${visitId}/${fileName}`;

          const { error: uploadError } = await supabase.storage
            .from('visit-photos')
            .upload(filePath, photoFile);

          if (uploadError) {
            console.error('Error uploading photo:', uploadError);
            return null;
          }
          return filePath;
        });

        const photoPathsForDb = (await Promise.all(uploadPromises)).filter((path): path is string => path !== null);

        if (photoPathsForDb.length > 0) {
          const { data: updatedVisitWithPhotos, error: updateError } = await supabase
            .from('visits')
            .update({ photos: photoPathsForDb })
            .eq('id', visitId)
            .select()
            .single();

          if (updateError) {
            console.error('Error updating visit with photo paths:', updateError);
            finalVisit.photos = photoPathsForDb; // Best effort to show paths locally
          } else {
            finalVisit = updatedVisitWithPhotos;
          }
        }
      }
      
      // 2. Replace temp visit with final real visit
      replaceVisit(winery.id, tempId, finalVisit);

    } catch (error) {
      console.error("Failed to save visit, removing optimistic update:", error);
      // 3. Rollback: Remove temp visit
      optimisticallyDeleteVisit(tempId);
      confirmOptimisticUpdate(); // Commit deletion immediately
      throw error;
    } finally {
      set({ isSavingVisit: false });
    }
  },

  updateVisit: async (visitId, visitData, newPhotos = [], photosToDelete = []) => {
    set({ isSavingVisit: true });
    const supabase = createClient();
    const { optimisticallyUpdateVisit, revertOptimisticUpdate, confirmOptimisticUpdate } = useWineryStore.getState();

    // Find the original visit to get the existing photos
    const winery = useWineryStore.getState().persistentWineries.find(w => w.visits?.some(v => v.id === visitId));
    const originalVisit = winery?.visits?.find(v => v.id === visitId);
    if (!originalVisit) {
      throw new Error("Original visit not found for update.");
    }

    const existingPhotos = originalVisit.photos || [];

    // 1. Optimistic update for the UI
    const newOptimisticPhotos = existingPhotos.filter(p => !photosToDelete.includes(p));
    optimisticallyUpdateVisit(visitId, { ...visitData, photos: newOptimisticPhotos });

    try {
      // 2. Upload new photos
      let newPhotoPaths: string[] = [];
      if (newPhotos.length > 0) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("User not authenticated for photo upload.");

        const uploadPromises = newPhotos.map(async (photoFile) => {
          const fileName = `${Date.now()}-${photoFile.name}`;
          const filePath = `${user.id}/${visitId}/${fileName}`;
          const { error: uploadError } = await supabase.storage.from('visit-photos').upload(filePath, photoFile);
          if (uploadError) {
            console.error('Error uploading photo during update:', uploadError);
            return null;
          }
          return filePath;
        });
        newPhotoPaths = (await Promise.all(uploadPromises)).filter((p): p is string => p !== null);
      }

      // 3. Combine photo arrays for the final database update
      const finalPhotoPaths = [...newOptimisticPhotos, ...newPhotoPaths];

      // 4. Update the visit in the database
      const { data: updatedVisit, error: updateError } = await supabase
        .from('visits')
        .update({ ...visitData, photos: finalPhotoPaths })
        .eq('id', visitId)
        .select()
        .single();

      if (updateError) throw updateError;

      // 5. Delete photos from storage if there are any to delete
      if (photosToDelete.length > 0) {
        const { error: storageError } = await supabase.storage.from('visit-photos').remove(photosToDelete);
        if (storageError) {
          // Log the error but don't throw, as the main visit update succeeded
          console.error("Error deleting photos from storage:", storageError);
        }
      }

      // 6. Confirm the final state in the store
      confirmOptimisticUpdate(updatedVisit);

    } catch (error) {
      console.error("Failed to update visit, reverting:", error);
      revertOptimisticUpdate();
      throw error;
    } finally {
      set({ isSavingVisit: false });
    }
  },

  deleteVisit: async (visitId) => {
    const { optimisticallyDeleteVisit, revertOptimisticUpdate, confirmOptimisticUpdate } = useWineryStore.getState();
    
    optimisticallyDeleteVisit(visitId);

    try {
        const response = await fetch(`/api/visits/${visitId}`, { method: 'DELETE' });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || "Failed to delete visit.");
        }
        confirmOptimisticUpdate();
    } catch (error) {
        console.error("Failed to delete visit, reverting:", error);
        revertOptimisticUpdate();
        throw error;
    }
  },
}), shallow);
