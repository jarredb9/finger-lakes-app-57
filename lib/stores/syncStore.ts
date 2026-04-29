import { create } from 'zustand';
import { SyncItem, SyncStatus } from '@/lib/types';
import { encrypt, decrypt } from '@/lib/utils/crypto';
import { get as idbGet, set as idbSet } from 'idb-keyval';

const IDB_KEY = 'encrypted-offline-queue';

interface SyncState {
  queue: SyncItem[];
  isInitialized: boolean;

  // Actions
  initialize: () => Promise<void>;
  addMutation: (params: { type: SyncItem['type']; payload: unknown; userId: string }) => Promise<void>;
  updateMutationStatus: (id: string, status: SyncStatus) => Promise<void>;
  removeMutation: (id: string) => Promise<void>;
  getDecryptedPayload: <T = unknown>(item: SyncItem, userId: string) => Promise<T>;
  reset: () => Promise<void>;
}

let initPromise: Promise<void> | null = null;
let idbPromise = Promise.resolve();

const persistToIdb = async (queue: SyncItem[]) => {
  const length = queue.length;
  console.log(`[SyncStore] Persisting queue of length ${length} to IDB...`);
  idbPromise = idbPromise.then(async () => {
    try {
      await idbSet(IDB_KEY, queue);
      console.log(`[SyncStore] Successfully wrote queue of length ${length} to IDB.`);
    } catch (err) {
      console.error(`[SyncStore] Failed to write queue of length ${length} to IDB:`, err);
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
        console.log('[SyncStore] Initializing from IDB...');
        
        let persistedQueue: any;
        for (let i = 0; i < 3; i++) {
          persistedQueue = await idbGet(IDB_KEY);
          if (Array.isArray(persistedQueue)) break;
          console.log(`[SyncStore] IDB attempt ${i + 1} got ${typeof persistedQueue}. Retrying in 500ms...`);
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        if (Array.isArray(persistedQueue)) {
          console.log(`[SyncStore] Hydrated queue with ${persistedQueue.length} items from IDB.`);
          set({ queue: persistedQueue, isInitialized: true });
        } else {
          console.log(`[SyncStore] No persisted queue found in IDB (got: ${typeof persistedQueue}).`);
          set({ isInitialized: true });
        }
      } catch (err) {
        console.error('[SyncStore] Initialization failed:', err);
        set({ isInitialized: true });
      } finally {
        initPromise = null;
      }
    })();

    return initPromise;
  },

  addMutation: async ({ type, payload, userId }) => {
    console.log(`[SyncStore] addMutation: type=${type}, userId=${userId}`);
    await get().initialize();

    // 1. Encrypt payload
    const encryptedPayload = await encrypt(payload, userId);

    // 2. Create sync item
    const newItem: SyncItem = {
      id: `sync-${crypto.randomUUID()}`,
      type,
      encryptedPayload,
      createdAt: new Date().toISOString(),
      userId,
      status: 'pending',
    };

    // 3. Update state and persist
    set((state) => {
      const newQueue = [...state.queue, newItem];
      console.log(`[SyncStore] Setting new queue length ${newQueue.length}. New item: ${newItem.id}`);
      return { queue: newQueue };
    });

    await persistToIdb(get().queue);
    console.log('[SyncStore] Persisted new queue to IDB.');
  },

  updateMutationStatus: async (id: string, status: SyncStatus) => {
    console.log(`[SyncStore] updateMutationStatus: id=${id}, status=${status}`);
    await get().initialize();

    set((state) => {
      const newQueue = state.queue.map((item) => 
        item.id === id ? { ...item, status } : item
      );
      console.log(`[SyncStore] Setting updated queue length ${newQueue.length} for ${id}`);
      return { queue: newQueue };
    });
    
    await persistToIdb(get().queue);
    console.log('[SyncStore] Persisted updated queue to IDB.');
  },

  removeMutation: async (id: string) => {
    console.log(`[SyncStore] removeMutation: id=${id}`);
    await get().initialize();

    set((state) => {
      const newQueue = state.queue.filter((item) => item.id !== id);
      console.log(`[SyncStore] Setting new queue length ${newQueue.length} (after removal of ${id})`);
      return { queue: newQueue };
    });

    await persistToIdb(get().queue);
    console.log('[SyncStore] Persisted filtered queue to IDB.');
  },

  getDecryptedPayload: async <T = unknown>(item: SyncItem, userId: string): Promise<T> => {
    return await decrypt(item.encryptedPayload, userId) as T;
  },

  reset: async () => {
    console.log('[SyncStore] reset: Clearing queue and IDB');
    set({ queue: [] });
    await idbSet(IDB_KEY, []);
  },
}));

// Initialize store on load if in browser
if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'test') {
  useSyncStore.getState().initialize();
  (window as any).useSyncStore = useSyncStore;
}
