import { create } from 'zustand';
import { SyncItem, SyncStatus } from '@/lib/types';
import { encrypt, decrypt } from '@/lib/utils/crypto';
import { get as idbGet, set as idbSet } from 'idb-keyval';
import { checkAndCleanupQuota, isQuotaError } from '@/lib/utils/quota';

const IDB_KEY = 'encrypted-offline-queue';
const isDiagnostic = typeof process !== 'undefined' && (process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_IS_E2E === 'true');

interface SyncState {
  queue: SyncItem[];
  isInitialized: boolean;

  // Actions
  initialize: () => Promise<void>;
  addMutation: (params: { type: SyncItem['type']; payload: unknown; userId: string; id?: string }) => Promise<void>;
  updateMutationStatus: (id: string, status: SyncStatus) => Promise<void>;
  removeMutation: (id: string) => Promise<void>;
  getDecryptedPayload: <T = unknown>(item: SyncItem, userId: string) => Promise<T>;
  reset: () => Promise<void>;
}

let initPromise: Promise<void> | null = null;
let idbPromise = Promise.resolve();

const persistToIdb = async (queue: SyncItem[]) => {
  const length = queue.length;
  if (isDiagnostic) console.log(`[SyncStore] Persisting queue of length ${length} to IDB...`);
  idbPromise = idbPromise.then(async () => {
    try {
      await idbSet(IDB_KEY, queue);
      if (isDiagnostic) console.log(`[SyncStore] Successfully wrote queue of length ${length} to IDB.`);
    } catch (err: any) {
      console.error(`[SyncStore] Failed to write queue of length ${length} to IDB:`, err);
      if (isQuotaError(err)) {
        console.warn('[SyncStore] IDB write failed due to quota. Attempting cleanup...');
        await checkAndCleanupQuota(0.8);
        try {
          await idbSet(IDB_KEY, queue);
          if (isDiagnostic) console.log(`[SyncStore] Successfully wrote queue of length ${length} to IDB after cleanup.`);
        } catch (retryErr) {
          console.error('[SyncStore] IDB write failed again after quota cleanup:', retryErr);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('quota-exceeded-warning'));
          }
        }
      }
    }
  }).catch(err => {
    console.error('[SyncStore] Critical error in idbPromise chain:', err);
  });
  return idbPromise;
};

export const useSyncStore = create<SyncState>((set, get) => ({
  queue: [],
  isInitialized: false,

  initialize: async () => {
    if (get().isInitialized) return;
    if (initPromise) return initPromise;

    initPromise = (async () => {
      try {
        if (isDiagnostic) console.log('[SyncStore] Initializing from IDB...');
        
        const persistedQueue = await idbGet(IDB_KEY) as SyncItem[] | undefined;

        if (Array.isArray(persistedQueue)) {
          if (isDiagnostic) console.log(`[SyncStore] Hydrated queue with ${persistedQueue.length} items from IDB.`);
          set({ queue: persistedQueue, isInitialized: true });
        } else {
          if (isDiagnostic) console.log(`[SyncStore] No persisted queue found in IDB (got: ${typeof persistedQueue}).`);
          set({ isInitialized: true });
        }
      } catch (err) {
        console.error('[SyncStore] Initialization failed or timed out:', err);
        set({ isInitialized: true });
      } finally {
        initPromise = null;
      }
    })();

    return initPromise;
  },

  addMutation: async ({ type, payload, userId, id }) => {
    if (isDiagnostic) console.log(`[SyncStore] addMutation: type=${type}, userId=${userId}`);
    await get().initialize();

    // 1. Encrypt payload
    const encryptedPayload = await encrypt(payload, userId);

    // 2. Create sync item
    const newItem: SyncItem = {
      id: id || crypto.randomUUID(),
      type,
      encryptedPayload,
      createdAt: new Date().toISOString(),
      userId,
      status: 'pending',
    };

    // 3. Update state and persist
    set((state) => {
      const newQueue = [...state.queue, newItem];
      if (isDiagnostic) console.log(`[SyncStore] Setting new queue length ${newQueue.length}. New item: ${newItem.id}`);
      return { queue: newQueue };
    });

    await persistToIdb(get().queue);
    if (isDiagnostic) console.log('[SyncStore] Persisted new queue to IDB.');
  },

  updateMutationStatus: async (id: string, status: SyncStatus) => {
    if (isDiagnostic) console.log(`[SyncStore] updateMutationStatus: id=${id}, status=${status}`);
    await get().initialize();

    set((state) => {
      const newQueue = state.queue.map((item) => 
        item.id === id ? { ...item, status } : item
      );
      if (isDiagnostic) console.log(`[SyncStore] Setting updated queue length ${newQueue.length} for ${id}`);
      return { queue: newQueue };
    });
    
    await persistToIdb(get().queue);
    if (isDiagnostic) console.log('[SyncStore] Persisted updated queue to IDB.');
  },

  removeMutation: async (id: string) => {
    if (isDiagnostic) console.log(`[SyncStore] removeMutation: id=${id}`);
    await get().initialize();

    set((state) => {
      const newQueue = state.queue.filter((item) => item.id !== id);
      if (isDiagnostic) console.log(`[SyncStore] Setting new queue length ${newQueue.length} (after removal of ${id})`);
      return { queue: newQueue };
    });

    await persistToIdb(get().queue);
    if (isDiagnostic) console.log('[SyncStore] Persisted filtered queue to IDB.');
  },

  getDecryptedPayload: async <T = unknown>(item: SyncItem, userId: string): Promise<T> => {
    return await decrypt(item.encryptedPayload, userId) as T;
  },

  reset: async () => {
    if (isDiagnostic) console.log('[SyncStore] reset: Clearing queue and IDB');
    set({ queue: [] });
    await idbSet(IDB_KEY, []);
  },
}));

// Expose store for E2E if in browser
if (typeof window !== 'undefined') {
  (window as any).useSyncStore = useSyncStore;
  if (process.env.NEXT_PUBLIC_IS_E2E === 'true' || process.env.NODE_ENV !== 'production') {
    (window as any).idbKeyVal = { get: idbGet, set: idbSet };
  }
}
