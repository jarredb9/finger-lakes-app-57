import { useSyncStore } from './syncStore';
import { SyncItem } from '@/lib/types';

export const isNetworkError = (error: unknown) => {
  const err = error as { message?: string; status?: number };
  return (
    err?.message?.includes("Failed to fetch") ||
    err?.message?.includes("Network request failed") ||
    err?.message?.includes("timeout") ||
    err?.status === 503 ||
    err?.status === 504
  );
};

/**
 * Helper to check if we should enqueue a mutation instead of executing it.
 * Returns true if the mutation was enqueued.
 */
export async function enqueueIfOffline(
    type: SyncItem['type'], 
    userId: string | undefined, 
    payload: unknown
): Promise<boolean> {
    if (!userId) return false;

    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
    
    if (isOffline) {
        await useSyncStore.getState().addMutation({
            type,
            userId,
            payload
        });
        return true;
    }
    
    return false;
}

/**
 * Helper to handle errors by enqueuing if it's a network error.
 * Returns true if the error was handled by enqueuing.
 */
export async function handleSyncError(
    error: unknown,
    type: SyncItem['type'],
    userId: string | undefined,
    payload: unknown
): Promise<boolean> {
    if (isNetworkError(error) && userId) {
        await useSyncStore.getState().addMutation({
            type,
            userId,
            payload
        });
        return true;
    }
    return false;
}
