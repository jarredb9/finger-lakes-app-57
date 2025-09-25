
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
        rating: visitData.rating,
        photos: [], // Start with empty photos array
      };
      const { data: visit, error: visitError } = await supabase
        .from('visits')
        .insert(visitPayload)
        .select()
        .single();

      if (visitError) throw visitError;

      let photoPathsForDb: string[] = [];

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

        photoPathsForDb = (await Promise.all(uploadPromises)).filter((path): path is string => path !== null);

        if (photoPathsForDb.length > 0) {
          const { data: updatedVisitWithPhotos, error: updateError } = await supabase
            .from('visits')
            .update({ photos: photoPathsForDb })
            .eq('id', visit.id)
            .select()
            .single();

          if (updateError) {
            console.error('Error updating visit with photo paths:', updateError);
            // Even if update fails, proceed with the visit object we have
          } else {
             const newVisit: Visit = { ...updatedVisitWithPhotos };
             addVisitToWinery(winery.id, newVisit);
             return;
          }
        }
      }
      
      // If no photos or if photo update failed, add the initial visit
      const newVisit: Visit = { ...visit };
      addVisitToWinery(winery.id, newVisit);

    } catch (error) {
      console.error("Failed to save visit:", error);
      throw error;
    } finally {
      set({ isSavingVisit: false });
    }
  },

  updateVisit: async (visitId, visitData, photos = []) => {
    set({ isSavingVisit: true });
    const supabase = createClient();
    const { optimisticallyUpdateVisit, revertOptimisticUpdate, confirmOptimisticUpdate } = useWineryStore.getState();

    optimisticallyUpdateVisit(visitId, visitData);

    try {
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

      confirmOptimisticUpdate(finalVisit);

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

  deletePhoto: async (visitId, photoPath) => {
    const supabase = createClient();
    const { optimisticallyUpdateVisit, revertOptimisticUpdate, confirmOptimisticUpdate } = useWineryStore.getState();

    // Find the current visit to get the current photos array
    const { wineries } = useWineryStore.getState().persistentWineries;
    const visit = wineries.flatMap(w => w.visits || []).find(v => v.id === visitId);
    if (!visit) {
        throw new Error("Visit not found for photo deletion.");
    }

    const oldPhotos = visit.photos || [];
    const newPhotos = oldPhotos.filter(p => p !== photoPath);

    // Optimistically update the UI
    optimisticallyUpdateVisit(visitId, { photos: newPhotos });

    try {
        // 1. Remove from storage
        const { error: storageError } = await supabase.storage.from('visit-photos').remove([photoPath]);
        if (storageError) {
            console.error("Storage deletion error:", storageError);
            throw new Error("Failed to delete photo from storage.");
        }

        // 2. Update the database
        const { data: updatedVisit, error: dbError } = await supabase
            .from('visits')
            .update({ photos: newPhotos })
            .eq('id', visitId)
            .select()
            .single();

        if (dbError) {
            throw dbError;
        }

        // 3. Confirm the update in the store
        confirmOptimisticUpdate(updatedVisit);

    } catch (error) {
        console.error("Failed to delete photo, reverting:", error);
        // Revert UI to previous state
        revertOptimisticUpdate();
        throw error; // Re-throw to be caught in the component
    }
  },
}), shallow);
