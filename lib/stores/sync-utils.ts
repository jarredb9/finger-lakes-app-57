import { useSyncStore } from './syncStore';

export const isNetworkError = (error: any) => {
  return (
    error?.message?.includes("Failed to fetch") ||
    error?.message?.includes("Network request failed") ||
    error?.message?.includes("timeout") ||
    error?.status === 503 ||
    error?.status === 504
  );
};

/**
 * Helper to check if we should enqueue a mutation instead of executing it.
 * Returns true if the mutation was enqueued.
 */
export async function enqueueIfOffline(
    type: string, 
    userId: string | undefined, 
    payload: any
): Promise<boolean> {
    if (!userId) return false;

    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
    
    if (isOffline) {
        await useSyncStore.getState().addMutation({
            type: type as any,
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
    error: any,
    type: string,
    userId: string | undefined,
    payload: any
): Promise<boolean> {
    if (isNetworkError(error) && userId) {
        await useSyncStore.getState().addMutation({
            type: type as any,
            userId,
            payload
        });
        return true;
    }
    return false;
}
