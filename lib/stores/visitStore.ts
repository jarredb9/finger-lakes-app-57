import { createWithEqualityFn } from 'zustand/traditional';
import { shallow } from 'zustand/shallow';
import { Winery, Visit, VisitWithWinery, GooglePlaceId, WineryDbId } from '@/lib/types';
import { createClient } from '@/utils/supabase/client';
import { useWineryStore } from './wineryStore';

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
  reset: () => void;
}

const VISITS_PER_PAGE = 10;

export const useVisitStore = createWithEqualityFn<VisitState>((set, get) => ({
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

    // Create temporary ID and Visit object
    const tempId = `temp-${Date.now()}`;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("User not authenticated.");

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

    try {
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
        rating: visitData.rating,
        photos: [],
      };

      const { data: rpcResult, error: rpcError } = await supabase.rpc('log_visit', {
        p_winery_data: rpcWineryData,
        p_visit_data: rpcVisitData,
      });

      if (rpcError) throw rpcError;
      
      const visitId = rpcResult.visit_id;
      let finalVisit: VisitWithWinery = { 
          ...tempVisit, 
          id: visitId, 
          photos: [] 
      };

      if (visitData.photos.length > 0) {
        const uploadPromises = visitData.photos.map(async (photoFile) => {
          const fileName = `${Date.now()}-${photoFile.name}`;
          const filePath = `${user.id}/${visitId}/${fileName}`;
          const { error: uploadError } = await supabase.storage.from('visit-photos').upload(filePath, photoFile);
          return uploadError ? null : filePath;
        });

        const photoPathsForDb = (await Promise.all(uploadPromises)).filter((path): path is string => path !== null);

        if (photoPathsForDb.length > 0) {
          const { data: updatedVisitWithPhotos, error: updateError } = await supabase
            .from('visits')
            .update({ photos: photoPathsForDb })
            .eq('id', visitId)
            .select('*, wineries(*)')
            .single();

          if (!updateError) {
              finalVisit = {
                  ...finalVisit,
                  ...updatedVisitWithPhotos,
                  wineryName: winery.name,
                  wineryId: winery.id
              };
          }
        }
      }
      
      // 2. Replace temp visit in both stores
      replaceVisit(winery.id, tempId, finalVisit);
      set(state => ({
          visits: state.visits.map(v => String(v.id) === tempId ? finalVisit : v),
          lastMutation: Date.now()
      }));

    } catch (error) {
      console.error("Failed to save visit, removing optimistic update:", error);
      optimisticallyDeleteVisit(tempId);
      set(state => ({ visits: state.visits.filter(v => String(v.id) !== tempId) }));
      confirmOptimisticUpdate();
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
}), shallow);
