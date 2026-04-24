import { createClient } from '@/utils/supabase/client';
import { useSyncStore } from '@/lib/stores/syncStore';
import { WineryService } from './wineryService';

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
            case 'log_visit':
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
                  photos: payload.photos || [],
                  is_private: payload.is_private || false,
                },
              });
              error = visitError;
              break;

            case 'update_visit':
                const { error: updateError } = await supabase.rpc('update_visit', {
                    p_visit_id: parseInt(payload.visitId),
                    p_visit_data: payload.visitData
                });
                error = updateError;
                break;

            case 'delete_visit':
                const { error: deleteError } = await supabase.rpc('delete_visit', { 
                    p_visit_id: parseInt(payload.visitId) 
                });
                error = deleteError;
                break;

            case 'create_trip':
                const { error: tripError } = await supabase.rpc('create_trip', {
                    p_name: payload.name,
                    p_trip_date: payload.trip_date
                });
                error = tripError;
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
                        .from("trip_wineries")
                        .delete()
                        .eq("trip_id", uTripId)
                        .eq("winery_id", uUpdates.removeWineryId);
                    error = removeWineryError;
                } else if (uUpdates.updateNote) {
                    const { wineryId: nWineryId, notes: nNotes } = uUpdates.updateNote;
                    const { error: noteError } = await supabase.rpc('update_trip_winery_notes', {
                        p_trip_id: parseInt(uTripId),
                        p_winery_id: nWineryId,
                        p_notes: nNotes
                    });
                    error = noteError;
                } else {
                    const { error: updateTripError } = await supabase
                        .from("trips")
                        .update(uUpdates)
                        .eq("id", uTripId);
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

            // Add other types as needed based on SyncItem['type']
            default:
              console.warn(`[SyncService] Unsupported mutation type: ${item.type}`);
              // We might want to remove unsupported items to prevent stuck queue
              await removeMutation(item.id);
              continue;
          }

          if (error) {
            console.error(`[SyncService] Failed to sync item ${item.id}:`, error);
            // Stop processing the queue on first error to maintain order
            break;
          }

          // Successfully synced, remove from queue
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

// Auto-trigger sync on network change if in browser
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.log('[SyncService] Network online, triggering sync.');
    SyncService.sync();
  });
}
