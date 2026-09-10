import { Winery, Visit, VisitWithWinery, WineryDbId } from '@/lib/types';
import { createClient } from '@/utils/supabase/client';
import { useWineryStore } from '../wineryStore';
import { WineryService } from '@/lib/services/wineryService';
import { stabilizePhotos, Base64Photo, isBase64Photo, base64ToFile } from '@/lib/utils/sync-helpers';
import { enqueueIfOffline, handleSyncError } from '../sync-utils';
import type { StoreApi } from 'zustand';
import type { VisitState } from '../visitStore';

type GetVisitState = StoreApi<VisitState>['getState'];
type SetVisitState = StoreApi<VisitState>['setState'];

export async function saveVisitHelper(
  get: GetVisitState,
  set: SetVisitState,
  winery: Winery,
  visitData: { visit_date: string; user_review: string; rating: number; photos: (File | Base64Photo)[]; is_private?: boolean }
): Promise<void> {
  const idempotencyKey = crypto.randomUUID();
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
      latitude: winery.latitude,
      longitude: winery.longitude,
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
    latitude: winery.latitude,
    longitude: winery.longitude,
    visit_date: visitData.visit_date,
    user_review: visitData.user_review,
    rating: visitData.rating,
    photos: await stabilizePhotos(visitData.photos),
    is_private: visitData.is_private,
    tempId
  };

  if (await enqueueIfOffline('log_visit', user.id, syncPayload, idempotencyKey)) {
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
      p_idempotency_key: idempotencyKey,
    });

    if (rpcError) {
      console.error('Failed to save visit:', rpcError);
      throw rpcError;
    }
    
    const visitId = rpcResult.visit_id;
    const wineryDbId = rpcResult.winery_id;
    const finishedNow = Date.now();
    get().setLastActionTimestamp(String(visitId), finishedNow);
    
    if (wineryDbId && wineryDbId !== winery.dbId) {
      useWineryStore.getState().upsertWinery({ ...winery, dbId: wineryDbId as WineryDbId });
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
    if (await handleSyncError(error, 'log_visit', user.id, syncPayload, idempotencyKey)) {
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
}

export async function updateVisitHelper(
  get: GetVisitState,
  set: SetVisitState,
  visitId: string,
  visitData: Partial<Visit> & { is_private?: boolean },
  newPhotos: (File | Base64Photo)[] = [],
  photosToDelete: string[] = []
): Promise<void> {
  const idempotencyKey = crypto.randomUUID();
  set({ isSavingVisit: true });
  const supabase = createClient();
  const { optimisticallyUpdateVisit, revertOptimisticUpdate, confirmOptimisticUpdate } = useWineryStore.getState();

  const originalVisit = get().visits.find(v => String(v.id) === String(visitId));
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

  if (await enqueueIfOffline('update_visit', user.id, syncPayload, idempotencyKey)) {
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
      },
      p_idempotency_key: idempotencyKey
    });

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
      ...originalVisit,
      ...updatedVisit,
      id: !isNaN(Number(updatedVisit.id ?? updatedVisit.visit_id ?? visitId))
        ? Number(updatedVisit.id ?? updatedVisit.visit_id ?? visitId)
        : (updatedVisit.id ?? updatedVisit.visit_id ?? visitId),
      wineryName: updatedVisit.winery_name || originalVisit.wineryName,
      wineryId: updatedVisit.google_place_id || originalVisit.wineryId,
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
    if (await handleSyncError(error, 'update_visit', user.id, syncPayload, idempotencyKey)) {
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
}
