
import { createWithEqualityFn } from 'zustand/traditional';
import { shallow } from 'zustand/shallow';
import { Winery, Visit } from '@/lib/types';
import { createClient } from '@/utils/supabase/client';
import { useWineryStore } from './wineryStore';

interface VisitState {
  isSavingVisit: boolean;
  saveVisit: (winery: Winery, visitData: { visit_date: string; user_review: string; rating: number; photos: File[] }) => Promise<void>;
  updateVisit: (visitId: string, visitData: { visit_date: string; user_review: string; rating: number; }) => Promise<void>;
  deleteVisit: (visitId: string) => Promise<void>;
}

export const useVisitStore = createWithEqualityFn<VisitState>((set) => ({
  isSavingVisit: false,

  saveVisit: async (winery, visitData) => {
    set({ isSavingVisit: true });
    const supabase = createClient();
    const { ensureWineryInDb, addVisitToWinery } = useWineryStore.getState();

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated.");

      const dbId = await ensureWineryInDb(winery);
      if (!dbId) throw new Error("Could not ensure winery exists in database.");

      const visitPayload = {
        winery_id: dbId,
        user_id: user.id,
        visit_date: visitData.visit_date,
        user_review: visitData.user_review,
        rating: visitData.rating
      };
      const { data: visit, error: visitError } = await supabase
        .from('visits')
        .insert(visitPayload)
        .select()
        .single();

      if (visitError) throw visitError;

      let photoUrlsForState: string[] = [];

      if (visitData.photos.length > 0) {
        const uploadPromises = visitData.photos.map(async (photoFile) => {
          const fileName = `${Date.now()}-${photoFile.name}`;
          const filePath = `${user.id}/${visit.id}/${fileName}`;

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
        console.log('[visitStore] Uploaded photo paths:', photoPathsForDb);

        if (photoPathsForDb.length > 0) {
          const { error: updateError } = await supabase
            .from('visits')
            .update({ photos: photoPathsForDb })
            .eq('id', visit.id);

          if (updateError) console.error('Error updating visit with photo paths:', updateError);
        }

        const signedUrlPromises = photoPathsForDb.map(path =>
            supabase.storage.from('visit-photos').createSignedUrl(path, 300)
        );
        const signedUrlResults = await Promise.all(signedUrlPromises);
        console.log('[visitStore] Signed URL results:', signedUrlResults);

        photoUrlsForState = signedUrlResults
            .map(result => result.data?.signedUrl)
            .filter((url): url is string => !!url);
        
        console.log('[visitStore] Final photo URLs for state:', photoUrlsForState);
      }

      const newVisit: Visit = { ...visit, photos: photoUrlsForState };
      addVisitToWinery(winery.id, newVisit);

    } catch (error) {
      console.error("Failed to save visit:", error);
      throw error;
    } finally {
      set({ isSavingVisit: false });
    }
  },

  updateVisit: async (visitId, visitData, photos) => {
    set({ isSavingVisit: true });
    const supabase = createClient();
    const { optimisticallyUpdateVisit, revertOptimisticUpdate, confirmOptimisticUpdate } = useWineryStore.getState();

    // Optimistically update text fields
    optimisticallyUpdateVisit(visitId, visitData);

    try {
      // Update text fields in Supabase
      const { data: updatedVisit, error: updateError } = await supabase
        .from('visits')
        .update({
          visit_date: visitData.visit_date,
          user_review: visitData.user_review,
          rating: visitData.rating,
        })
        .eq('id', visitId)
        .select()
        .single();

      if (updateError) throw updateError;

      let finalVisit = updatedVisit;
      let photoUrlsForState: string[] = [];

      // Handle photo uploads if they exist
      if (photos.length > 0) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("User not authenticated for photo upload.");

        const existingPhotos = updatedVisit.photos || [];

        const uploadPromises = photos.map(async (photoFile) => {
          const fileName = `${Date.now()}-${photoFile.name}`;
          const filePath = `${user.id}/${visitId}/${fileName}`;
          const { error: uploadError } = await supabase.storage.from('visit-photos').upload(filePath, photoFile);
          if (uploadError) {
            console.error('Error uploading photo during update:', uploadError);
            return null;
          }
          return filePath;
        });

        const newPhotoPaths = (await Promise.all(uploadPromises)).filter((p): p is string => p !== null);

        if (newPhotoPaths.length > 0) {
          const allPhotoPaths = [...existingPhotos, ...newPhotoPaths];
          const { data: visitWithPhotos, error: photoUpdateError } = await supabase
            .from('visits')
            .update({ photos: allPhotoPaths })
            .eq('id', visitId)
            .select()
            .single();
          
          if (photoUpdateError) throw photoUpdateError;
          finalVisit = visitWithPhotos;
        }
      }

      // Create signed URLs for ALL photos for UI update
      if (finalVisit.photos && finalVisit.photos.length > 0) {
        const signedUrlPromises = finalVisit.photos.map(path =>
          supabase.storage.from('visit-photos').createSignedUrl(path, 300)
        );
        const signedUrlResults = await Promise.all(signedUrlPromises);
        photoUrlsForState = signedUrlResults.map(res => res.data?.signedUrl).filter((url): url is string => !!url);
      }

      // Confirm the optimistic update with the final state from server
      confirmOptimisticUpdate({ ...finalVisit, photos: photoUrlsForState });

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
