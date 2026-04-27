import { createClient } from '@/utils/supabase/client';
import { useSyncStore } from '@/lib/stores/syncStore';
import { WineryService } from './wineryService';
import { base64ToFile, isBase64Photo } from '@/lib/utils/sync-helpers';

export const SyncService = {
  isSyncing: false,

  async sync() {
    if (this.isSyncing) {
      console.log('[SyncService] Sync already in progress, skipping.');
      return;
    }

    const { queue, removeMutation, getDecryptedPayload } = useSyncStore.getState();
    if (queue.length === 0) return;

    this.isSyncing = true;
    console.log(`[SyncService] Starting sync for ${queue.length} items.`);

    const supabase = createClient();

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.warn('[SyncService] User not authenticated, cannot sync.');
        return;
      }

      for (const item of queue) {
        try {
          const payload = await getDecryptedPayload(item, user.id);
          let error = null;

          switch (item.type) {
            case 'log_visit': {
              let uploadedPaths: string[] = [];
              const photos = payload.photos || [];
              
              if (photos.length > 0) {
                const folderUuid = crypto.randomUUID();
                const uploadPromises = photos.map(async (p: any) => {
                  let file: File;
                  if (isBase64Photo(p)) {
                    file = base64ToFile(p.base64, p.type, p.name);
                  } else {
                    return p; // Already a path?
                  }
                  
                  const fileName = `${Date.now()}-${file.name}`;
                  const filePath = `${user.id}/${folderUuid}/${fileName}`;
                  const { error: uploadError } = await supabase.storage.from('visit-photos').upload(filePath, file);
                  if (uploadError) throw uploadError;
                  return filePath;
                });
                uploadedPaths = await Promise.all(uploadPromises);
              }

              const { error: visitError } = await supabase.rpc('log_visit', {
                p_winery_data: WineryService.getRpcData({
                  id: payload.wineryId,
                  dbId: payload.wineryDbId,
                  name: payload.wineryName,
                  address: payload.wineryAddress,
                  lat: payload.lat,
                  lng: payload.lng,
                } as any),
                p_visit_data: {
                  visit_date: payload.visit_date,
                  user_review: payload.user_review,
                  rating: payload.rating,
                  photos: uploadedPaths,
                  is_private: payload.is_private || false,
                },
              });
              error = visitError;
              break;
            }

            case 'update_visit': {
              let newPhotoPaths: string[] = [];
              const newPhotos = payload.newPhotos || [];
              
              if (newPhotos.length > 0) {
                const uploadPromises = newPhotos.map(async (p: any) => {
                   if (isBase64Photo(p)) {
                     const file = base64ToFile(p.base64, p.type, p.name);
                     const fileName = `${Date.now()}-${file.name}`;
                     const filePath = `${user.id}/${payload.visitId}/${fileName}`;
                     const { error: uploadError } = await supabase.storage.from('visit-photos').upload(filePath, file);
                     if (uploadError) throw uploadError;
                     return filePath;
                   }
                   return p;
                });
                newPhotoPaths = await Promise.all(uploadPromises);
              }

              const { data: currentVisit } = await supabase
                .from('visits')
                .select('photos')
                .eq('id', payload.visitId)
                .single();

              const existingServerPhotos = (currentVisit?.photos as string[]) || [];
              const photosToDelete = payload.photosToDelete || [];
              const preservedPhotos = existingServerPhotos.filter(p => !photosToDelete.includes(p));
              const finalPhotoPaths = [...preservedPhotos, ...newPhotoPaths];

              const { error: updateError } = await supabase.rpc('update_visit', {
                p_visit_id: parseInt(payload.visitId),
                p_visit_data: { ...payload.visitData, photos: finalPhotoPaths }
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
                    error = results.find(r => r.error)?.error;
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
                const { error: fError } = await supabase.rpc('toggle_favorite', {
                  p_winery_data: WineryService.getRpcData({
                    id: payload.wineryId,
                    dbId: payload.wineryDbId,
                    name: payload.wineryName,
                    address: payload.wineryAddress,
                    lat: payload.lat,
                    lng: payload.lng,
                  } as any)
                });
                error = fError;
              } else if (payload.action === 'toggle_wishlist') {
                const { error: wError } = await supabase.rpc('toggle_wishlist', {
                  p_winery_data: WineryService.getRpcData({
                    id: payload.wineryId,
                    dbId: payload.wineryDbId,
                    name: payload.wineryName,
                    address: payload.wineryAddress,
                    lat: payload.lat,
                    lng: payload.lng,
                  } as any)
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
            console.error(`[SyncService] Failed to sync item ${item.id}:`, error);
            break;
          }

          await removeMutation(item.id);
          console.log(`[SyncService] Successfully synced item ${item.id}`);

        } catch (itemError) {
          console.error(`[SyncService] Unexpected error syncing item ${item.id}:`, itemError);
          break;
        }
      }
    } finally {
      this.isSyncing = false;
      console.log('[SyncService] Sync process finished.');
    }
  }
};

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.log('[SyncService] Network online, triggering sync.');
    SyncService.sync();
  });

  if (navigator.onLine) {
    SyncService.sync();
  }
}
