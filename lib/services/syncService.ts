import { createClient } from '@/utils/supabase/client';
import { useSyncStore } from '@/lib/stores/syncStore';
import { WineryService } from './wineryService';
import { base64ToFile, isBase64Photo, Base64Photo } from '@/lib/utils/sync-helpers';
import { useVisitStore } from '@/lib/stores/visitStore';
import { useTripStore } from '@/lib/stores/tripStore';
import { useFriendStore } from '@/lib/stores/friendStore';
import { isNetworkError } from '../stores/sync-utils';
import { getE2EHeaders } from '@/lib/stores/e2e-utils';

interface LogVisitPayload {
  wineryId: string;
  wineryDbId: number;
  wineryName: string;
  wineryAddress: string;
  latitude: number;
  longitude: number;
  visit_date: string;
  user_review: string;
  rating: number;
  photos: (string | Base64Photo)[];
  is_private?: boolean;
}

interface UpdateVisitPayload {
  visitId: string;
  newPhotos: (string | Base64Photo)[];
  photosToDelete: string[];
  visitData: Record<string, unknown>;
}

export const SyncService = {
  isSyncing: false,

  async waitForAuth(supabase: any) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) return user;

    const isDiagnostic = process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_IS_E2E === 'true';
    if (isDiagnostic) console.log('[SyncService] User not found, waiting for auth hydration...');

    return new Promise<any>((resolve) => {
      const timeout = setTimeout(() => {
        if (isDiagnostic) console.log('[SyncService] Auth hydration timed out.');
        subscription.unsubscribe();
        resolve(null);
      }, 3000);

      const { data: { subscription } } = supabase.auth.onAuthStateChange((event: string, session: any) => {
        if (isDiagnostic) console.log(`[SyncService] Auth state changed: ${event}`);
        if (session?.user) {
          clearTimeout(timeout);
          subscription.unsubscribe();
          resolve(session.user);
        } else if (event === 'SIGNED_OUT') {
          clearTimeout(timeout);
          subscription.unsubscribe();
          resolve(null);
        }
      });
    });
  },

  async sync() {
    if (typeof window !== 'undefined' && !navigator.onLine) {
      return;
    }

    if (this.isSyncing) {
      return;
    }

    this.isSyncing = true;
    const isDiagnostic = process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_IS_E2E === 'true';

    try {
      // 1. Wait for store initialization
      const syncStore = useSyncStore.getState();
      if (!syncStore.isInitialized) {
          if (isDiagnostic) console.log('[SyncService] Waiting for SyncStore initialization...');
          await syncStore.initialize();
      }

      const { queue, removeMutation, updateMutationStatus, getDecryptedPayload } = useSyncStore.getState();
      if (queue.length === 0) {
          if (isDiagnostic) console.log('[SyncService] Queue is empty, nothing to sync.');
          return;
      }

      if (isDiagnostic) console.log(`[SyncService] Starting sync for ${queue.length} items.`);

      const supabase = createClient();
      const processedTypes = new Set<string>();

      if (isDiagnostic) console.log('[SyncService] Fetching user...');
      const user = await this.waitForAuth(supabase);

      if (!user) {
        if (isDiagnostic) console.warn('[SyncService] User not authenticated, cannot sync.');
        return;
      }
      if (isDiagnostic) console.log(`[SyncService] Authenticated as ${user.id}. Processing queue...`);

      for (const queueItem of queue) {
        // Re-read item from store state to get current status
        const item = useSyncStore.getState().queue.find(i => i.id === queueItem.id);
        if (!item) {
          if (isDiagnostic) console.log(`[SyncService] Skipping item ${queueItem.id} (no longer in queue).`);
          continue;
        }

        // Skip items that previously failed with permanent errors to avoid blocking new items
        if (item.status === 'error') {
          if (isDiagnostic) console.log(`[SyncService] Skipping item ${item.id} because it previously failed.`);
          continue;
        }

        if (isDiagnostic) console.log(`[SyncService] Processing item ${item.id} (type: ${item.type}, status: ${item.status || 'pending'})`);

        processedTypes.add(item.type);
        try {
          if (isDiagnostic) console.log(`[SyncService] Decrypting payload for ${item.id}...`);
          const payload = await getDecryptedPayload<any>(item, user.id);
          let error = null;

          if (isDiagnostic) console.log(`[SyncService] Executing RPC for ${item.type}...`);
          switch (item.type) {
            case 'log_visit': {
              const p = payload as LogVisitPayload;
              let uploadedPaths: string[] = [];
              const photos = p.photos || [];
              
              if (photos.length > 0) {
                const folderUuid = crypto.randomUUID();
                const uploadPromises = photos.map(async (photo) => {
                  let file: File;
                  if (isBase64Photo(photo)) {
                    file = base64ToFile(photo.base64, photo.type, photo.name);
                  } else {
                    return photo; // Already a path
                  }
                  
                  const fileName = `${Date.now()}-${file.name}`;
                  const filePath = `${user.id}/${folderUuid}/${fileName}`;
                  const { error: uploadError } = await supabase.storage.from('visit-photos').upload(filePath, file, { headers: getE2EHeaders() });
                  if (uploadError) throw uploadError;
                  return filePath;
                });
                uploadedPaths = await Promise.all(uploadPromises);
              }

              const { error: visitError } = await supabase.rpc('log_visit', {
                p_winery_data: WineryService.getRpcData({
                  id: p.wineryId as any,
                  dbId: p.wineryDbId as any,
                  name: p.wineryName,
                  address: p.wineryAddress,
                  latitude: p.latitude,
                  longitude: p.longitude,
                }),
                p_visit_data: {
                  visit_date: p.visit_date,
                  user_review: p.user_review,
                  rating: p.rating,
                  photos: uploadedPaths,
                  is_private: p.is_private || false,
                },
              }, { headers: getE2EHeaders() } as any);
              error = visitError;
              break;
            }

            case 'update_visit': {
              const p = payload as UpdateVisitPayload;
              let newPhotoPaths: string[] = [];
              const newPhotos = p.newPhotos || [];
              
              if (newPhotos.length > 0) {
                const uploadPromises = newPhotos.map(async (photo) => {
                   if (isBase64Photo(photo)) {
                     const file = base64ToFile(photo.base64, photo.type, photo.name);
                     const fileName = `${Date.now()}-${file.name}`;
                     const filePath = `${user.id}/${p.visitId}/${fileName}`;
                     const { error: uploadError } = await supabase.storage.from('visit-photos').upload(filePath, file);
                     if (uploadError) throw uploadError;
                     return filePath;
                   }
                   return photo as string;
                });
                newPhotoPaths = await Promise.all(uploadPromises);
              }

              const { data: currentVisit } = await supabase
                .from('visits')
                .select('photos')
                .eq('id', p.visitId)
                .single();

              const existingServerPhotos = (currentVisit?.photos as string[]) || [];
              const photosToDelete = p.photosToDelete || [];
              const preservedPhotos = existingServerPhotos.filter(photo => !photosToDelete.includes(photo));
              const finalPhotoPaths = [...preservedPhotos, ...newPhotoPaths];

              const { error: updateError } = await supabase.rpc('update_visit', {
                p_visit_id: parseInt(p.visitId),
                p_visit_data: { ...p.visitData, photos: finalPhotoPaths }
              });
              
              if (!updateError && photosToDelete.length > 0) {
                await supabase.storage.from('visit-photos').remove(photosToDelete);
              }
              
              error = updateError;
              break;
            }

            case 'delete_visit':
              const { error: deleteError } = await supabase.rpc('delete_visit', {
                p_visit_id: parseInt(payload.visitId)
              });
              error = deleteError;
              break;

            case 'create_trip':
              if (payload.wineries && payload.wineries.length > 0) {
                  const { error: tripError } = await supabase.rpc('create_trip_with_winery', {
                    p_trip_name: payload.name,
                    p_trip_date: payload.trip_date,
                    p_winery_data: WineryService.getRpcData(payload.wineries[0]),
                    p_notes: payload.notes || null,
                    p_members: []
                  });
                  error = tripError;
              } else {
                  const { error: tripError } = await supabase.rpc('create_trip', {
                    p_name: payload.name,
                    p_trip_date: payload.trip_date
                  });
                  error = tripError;
              }
              break;

            case 'update_trip':
              const { tripId: uTripId, updates: uUpdates } = payload;
              if (uUpdates.wineryOrder) {
                const { error: reorderError } = await supabase.rpc('reorder_trip_wineries', {
                  p_trip_id: parseInt(uTripId),
                  p_winery_ids: uUpdates.wineryOrder
                });
                error = reorderError;
              } else if (uUpdates.removeWineryId) {
                const { error: removeWineryError } = await supabase
                  .from('trip_wineries')
                  .delete()
                  .eq('trip_id', uTripId)
                  .eq('winery_id', uUpdates.removeWineryId);
                error = removeWineryError;
              } else if (uUpdates.updateNote) {
                const { wineryId: nWineryId, notes: nNotes } = uUpdates.updateNote;
                if (typeof nNotes === 'string') {
                    const { error: noteError } = await supabase.rpc('update_trip_winery_notes', {
                      p_trip_id: parseInt(uTripId),
                      p_winery_id: nWineryId,
                      p_notes: nNotes
                    });
                    error = noteError;
                } else if (typeof nNotes === 'object') {
                    const promises = Object.entries(nNotes).map(([wId, text]) => 
                        supabase.rpc('update_trip_winery_notes', {
                            p_trip_id: parseInt(uTripId),
                            p_winery_id: parseInt(wId),
                            p_notes: text as string
                        })
                    );
                    const results = await Promise.all(promises);
                    const firstErrorResult = results.find(r => !!r.error);
                    error = firstErrorResult ? firstErrorResult.error : null;
                }
              } else if (uUpdates.addWinery) {
                  const { winery, notes: aNotes } = uUpdates.addWinery;
                  const { error: addError } = await supabase.rpc('add_winery_to_trip', {
                      p_trip_id: parseInt(uTripId),
                      p_winery_data: WineryService.getRpcData(winery),
                      p_notes: aNotes
                  });
                  error = addError;
              } else {
                const { error: updateTripError } = await supabase
                  .from('trips')
                  .update(uUpdates)
                  .eq('id', uTripId);
                error = updateTripError;
              }
              break;

            case 'delete_trip':
              const { error: dTripError } = await supabase.rpc('delete_trip', {
                p_trip_id: parseInt(payload.tripId)
              });
              error = dTripError;
              break;

            case 'update_profile':
              if (payload.type === 'privacy') {
                const { error: pError } = await supabase.rpc('update_profile_privacy', {
                  p_privacy_level: payload.level
                });
                error = pError;
              }
              break;

            case 'social_action':
              if (payload.action === 'send_request') {
                const { error: sError } = await supabase.rpc('send_friend_request', {
                  target_email: payload.email
                });
                error = sError;
              } else if (payload.action === 'respond') {
                const { error: rError } = await supabase.rpc('respond_to_friend_request', {
                  requester_id: payload.requesterId,
                  accept: payload.accept
                });
                error = rError;
              } else if (payload.action === 'remove') {
                const { error: remError } = await supabase.rpc('remove_friend', {
                  target_friend_id: payload.friendId
                });
                error = remError;
              }
              break;

            case 'winery_action':
              if (payload.action === 'toggle_favorite') {
                const pW = payload as { wineryId: string; wineryDbId: number; wineryName: string; wineryAddress: string; latitude: number; longitude: number };
                const { error: fError } = await supabase.rpc('toggle_favorite', {
                  p_winery_data: WineryService.getRpcData({
                    id: pW.wineryId as any,
                    dbId: pW.wineryDbId as any,
                    name: pW.wineryName,
                    address: pW.wineryAddress,
                    latitude: pW.latitude,
                    longitude: pW.longitude,
                  })
                });
                error = fError;
              } else if (payload.action === 'toggle_wishlist') {
                const pW = payload as { wineryId: string; wineryDbId: number; wineryName: string; wineryAddress: string; latitude: number; longitude: number };
                const { error: wError } = await supabase.rpc('toggle_wishlist', {
                  p_winery_data: WineryService.getRpcData({
                    id: pW.wineryId as any,
                    dbId: pW.wineryDbId as any,
                    name: pW.wineryName,
                    address: pW.wineryAddress,
                    latitude: pW.latitude,
                    longitude: pW.longitude,
                  })
                });
                error = wError;
              } else if (payload.action === 'toggle_favorite_privacy') {
                const { error: fpError } = await supabase.rpc('toggle_favorite_privacy', {
                  p_winery_id: payload.wineryDbId
                });
                error = fpError;
              } else if (payload.action === 'toggle_wishlist_privacy') {
                const { error: wpError } = await supabase.rpc('toggle_wishlist_privacy', {
                  p_winery_id: payload.wineryDbId
                });
                error = wpError;
              }
              break;

            default:
              console.warn(`[SyncService] Unsupported mutation type: ${item.type}`);
              await removeMutation(item.id);
              continue;
          }

          if (error) {
            if (isDiagnostic) console.warn(`[SyncService] Failed to sync item ${item.id} (${item.type}):`, error);
            
            if (isNetworkError(error)) {
              if (isDiagnostic) console.log(`[SyncService] Network error detected for ${item.id}. Keeping it pending for retry.`);
            } else {
              if (isDiagnostic) console.log(`[SyncService] Permanent error detected for ${item.id}. Marking as error.`);
              await updateMutationStatus(item.id, 'error');
            }
            continue; 
          }

          if (isDiagnostic) console.log(`[SyncService] synced successfully`);
          await removeMutation(item.id);
          if (isDiagnostic) console.log(`[SyncService] Removed item ${item.id} from queue.`);

        } catch (itemError) {
          if (isDiagnostic) console.warn(`[SyncService] Unexpected error syncing item ${item.id}:`, itemError);
          
          if (isNetworkError(itemError)) {
            if (isDiagnostic) console.log(`[SyncService] Network error (caught) for ${item.id}. Keeping it pending.`);
          } else {
            if (isDiagnostic) console.log(`[SyncService] Marking item ${item.id} as error (caught).`);
            await updateMutationStatus(item.id, 'error');
          }
          continue;
        }
      }

      // Refresh stores if anything was processed
      if (processedTypes.size > 0) {
        if (isDiagnostic) console.log(`[SyncService] Refreshing stores for processed types: ${Array.from(processedTypes).join(', ')}`);
        
        if (processedTypes.has('log_visit') || processedTypes.has('update_visit') || processedTypes.has('delete_visit')) {
          useVisitStore.getState().fetchVisits(1, true);
        }
        
        if (processedTypes.has('create_trip') || processedTypes.has('update_trip') || processedTypes.has('delete_trip')) {
          useTripStore.getState().fetchTrips(1, 'upcoming', true);
          useTripStore.getState().fetchUpcomingTrips();
        }
        
        if (processedTypes.has('social_action')) {
          useFriendStore.getState().fetchFriends();
          useFriendStore.getState().fetchRequests();
          useFriendStore.getState().fetchFriendActivityFeed();
        }
      }
    } finally {
      this.isSyncing = false;
      if (isDiagnostic) console.log('[SyncService] Sync process finished.');
    }
  }
};

if (typeof window !== 'undefined') {
  (window as any).SyncService = SyncService;

  // Global listener for online event to trigger sync automatically
  window.addEventListener('online', () => {
    const isDiagnostic = process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_IS_E2E === 'true';
    if (isDiagnostic) console.log('[SyncService] Network back online, triggering sync...');
    SyncService.sync();
  });
}
