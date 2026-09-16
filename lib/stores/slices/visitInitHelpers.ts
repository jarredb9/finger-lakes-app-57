import { Winery, VisitWithWinery, WineryDbId } from '@/lib/types';
import { createClient } from '@/utils/supabase/client';
import { useWineryStore } from '../wineryStore';
import { useSyncStore } from '../syncStore';
import { Base64Photo, isBase64Photo } from '@/lib/utils/sync-helpers';
import { fileToBase64 } from '@/lib/utils/binary';
import { enqueueIfOffline, handleSyncError } from '../sync-utils';
import type { StoreApi } from 'zustand';
import type { VisitState } from '../visitStore';

type GetVisitState = StoreApi<VisitState>['getState'];
type SetVisitState = StoreApi<VisitState>['setState'];

let visitInitPromise: Promise<void> | null = null;
let isVisitStoreInitialized = false;

export function resetVisitInitState(): void {
  visitInitPromise = null;
  isVisitStoreInitialized = false;
}

export async function deleteVisitHelper(
  get: GetVisitState,
  set: SetVisitState,
  visitId: string
): Promise<void> {
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
    const numericId = parseInt(visitId, 10);
    if (!isNaN(numericId) && numericId > 0) {
      const { error } = await supabase.rpc('delete_visit', { p_visit_id: numericId });
      if (error) throw error;
    }
    
    confirmOptimisticUpdate();
    set({ lastActionTimestamp: Date.now() });
  } catch (error) {
    if (await handleSyncError(error, 'delete_visit', user?.id, syncPayload)) {
      set({ lastActionTimestamp: Date.now() });
      return;
    }

    console.error("Failed to delete visit, marking as error:", error);
    revertOptimisticUpdate();
    const revertedVisits = originalVisits.map(v => 
      String(v.id) === String(visitId) ? { ...v, syncStatus: 'error' as const } : v
    );
    set({ visits: revertedVisits, lastActionTimestamp: Date.now() });
    throw error;
  }
}

export async function injectVisitWithPhotosHelper(
  set: SetVisitState,
  winery: Winery,
  visitData: { visit_date: string; user_review: string; rating: number; photos: (File | Base64Photo)[]; is_private?: boolean }
): Promise<void> {
  const { addVisitToWinery } = useWineryStore.getState();
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error("User not authenticated.");
  
  const tempId = `temp-inject-${Date.now()}`;
  const previewUrls: string[] = [];
  const queuePhotos: Base64Photo[] = [];

  for (const p of visitData.photos) {
    if (isBase64Photo(p)) {
      previewUrls.push(`data:${p.type || 'image/jpeg'};base64,${p.base64}`);
      queuePhotos.push(p);
    } else if (typeof p === 'string') {
      previewUrls.push(p);
    } else {
      const file = p as File;
      previewUrls.push(URL.createObjectURL(file));
      const base64DataUrl = await fileToBase64(file);
      queuePhotos.push({
        __isBase64: true,
        base64: base64DataUrl.split(',')[1] || '',
        name: file.name || 'photo.jpg',
        type: file.type || 'image/jpeg'
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
    is_private: visitData.is_private || false,
    syncStatus: 'pending',
    wineryName: winery.name,
    wineryId: winery.id,
    winery_id: winery.dbId !== undefined ? (Number(winery.dbId) as WineryDbId) : undefined,
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
  set(state => ({ visits: [tempVisit, ...state.visits] }));

  await useSyncStore.getState().addMutation({
    type: 'log_visit',
    userId: session.user.id,
    payload: {
      wineryId: winery.id,
      wineryDbId: winery.dbId !== undefined ? Number(winery.dbId) : undefined,
      wineryName: winery.name,
      wineryAddress: winery.address,
      latitude: winery.latitude,
      longitude: winery.longitude,
      visit_date: visitData.visit_date,
      user_review: visitData.user_review,
      rating: visitData.rating,
      photos: queuePhotos,
      is_private: visitData.is_private || false,
      tempId
    }
  });
  
  set({ lastActionTimestamp: Date.now() });
}

export async function initializeVisitStoreHelper(
  _get: GetVisitState,
  set: SetVisitState
): Promise<void> {
  if (isVisitStoreInitialized) return;
  if (visitInitPromise) return visitInitPromise;

  visitInitPromise = (async () => {
    try {
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
            if (!payload) continue;
            pendingVisits.push({
              id: payload.tempId || item.id,
              user_id: user.id,
              visit_date: payload.visit_date,
              rating: payload.rating,
              user_review: payload.user_review,
              is_private: payload.is_private || false,
              photos: (payload.photos || []).map((p: any) => isBase64Photo(p) ? `data:${p.type || 'image/jpeg'};base64,${p.base64}` : p),
              wineryName: payload.wineryName,
              wineryId: payload.wineryId,
              winery_id: payload.wineryDbId !== undefined ? (Number(payload.wineryDbId) as WineryDbId) : undefined,
              syncStatus: 'pending',
              wineries: {
                id: Number(payload.wineryDbId || 0) as WineryDbId,
                google_place_id: payload.wineryId,
                name: payload.wineryName,
                address: payload.wineryAddress,
                latitude: payload.latitude || 0,
                longitude: payload.longitude || 0,
              }
            });
          } catch (e) {
            console.error('[VisitStore] Failed to decrypt pending visit:', e);
          }
        }
      }

      if (pendingVisits.length > 0) {
        set(state => {
          const newVisits = [...state.visits];
          for (const pv of pendingVisits) {
            if (!newVisits.find(v => String(v.id) === String(pv.id))) {
              newVisits.unshift(pv);
            }
          }
          return { visits: newVisits };
        });
      }
      isVisitStoreInitialized = true;
    } finally {
      if (!isVisitStoreInitialized) {
        visitInitPromise = null;
      }
    }
  })();

  return visitInitPromise;
}
