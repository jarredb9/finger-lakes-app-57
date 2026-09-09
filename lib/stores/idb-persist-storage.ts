import { StateStorage } from 'zustand/middleware';
import { get, set, del, setMany } from 'idb-keyval';
import { checkAndCleanupQuota, isQuotaError } from '@/lib/utils/quota';

export interface AtomicStateStorage extends StateStorage {
  setMany: (entries: [string, string][]) => Promise<void>;
}

/**
 * Custom storage for Zustand persist middleware using IndexedDB (via idb-keyval).
 * This allows storing larger data arrays (like the first page of visits/trips)
 * without the 5MB limit and performance impact of localStorage.
 */
export const idbStorage: AtomicStateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    const value = await get(name);
    return value || null;
  },
  setItem: async (name: string, value: string): Promise<void> => {
    try {
      await set(name, value);
    } catch (err: any) {
      if (isQuotaError(err)) {
        console.warn(`[Quota] setItem failed for ${name} due to quota. Attempting cleanup...`);
        await checkAndCleanupQuota(0.8);
        try {
          await set(name, value);
          return;
        } catch (retryErr) {
          console.error(`[Quota] Retry setItem failed for ${name} after cleanup:`, retryErr);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('quota-exceeded-warning'));
          }
          throw retryErr;
        }
      }
      throw err;
    }
  },
  setMany: async (entries: [string, string][]): Promise<void> => {
    try {
      await setMany(entries);
    } catch (err: any) {
      if (isQuotaError(err)) {
        console.warn(`[Quota] setMany failed due to quota. Attempting cleanup...`);
        await checkAndCleanupQuota(0.8);
        try {
          await setMany(entries);
          return;
        } catch (retryErr) {
          console.error(`[Quota] Retry setMany failed after cleanup:`, retryErr);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('quota-exceeded-warning'));
          }
          throw retryErr;
        }
      }
      throw err;
    }
  },
  removeItem: async (name: string): Promise<void> => {
    await del(name);
  },
};

