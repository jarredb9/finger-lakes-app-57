import { create } from 'zustand';
import { SyncItem } from '@/lib/types';
import { encrypt, decrypt } from '@/lib/utils/crypto';
import { get as idbGet, set as idbSet } from 'idb-keyval';

const IDB_KEY = 'offline-mutation-queue';

interface SyncState {
  queue: SyncItem[];
  isInitialized: boolean;

  // Actions
  initialize: () => Promise<void>;
  addMutation: (params: { type: SyncItem['type']; payload: any; userId: string }) => Promise<void>;
  removeMutation: (id: string) => Promise<void>;
  getDecryptedPayload: (item: SyncItem, userId: string) => Promise<any>;
  reset: () => Promise<void>;
}

export const useSyncStore = create<SyncState>((set, get) => ({
  queue: [],
  isInitialized: false,

  initialize: async () => {
    if (get().isInitialized) return;
    
    try {
      const persistedQueue = await idbGet(IDB_KEY);
      if (persistedQueue && Array.isArray(persistedQueue)) {
        set({ queue: persistedQueue, isInitialized: true });
      } else {
        set({ isInitialized: true });
      }
    } catch (err) {
      console.error('[SyncStore] Initialization failed:', err);
      set({ isInitialized: true }); // Still mark as initialized to avoid loops
    }
  },

  addMutation: async ({ type, payload, userId }) => {
    // 1. Encrypt payload
    const encryptedPayload = await encrypt(payload, userId);

    // 2. Create sync item
    const newItem: SyncItem = {
      id: `sync-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      encryptedPayload,
      createdAt: new Date().toISOString(),
      userId,
    };

    // 3. Update state and persist
    const newQueue = [...get().queue, newItem];
    set({ queue: newQueue });
    await idbSet(IDB_KEY, newQueue);
  },

  removeMutation: async (id: string) => {
    const newQueue = get().queue.filter((item) => item.id !== id);
    set({ queue: newQueue });
    await idbSet(IDB_KEY, newQueue);
  },

  getDecryptedPayload: async (item: SyncItem, userId: string) => {
    return await decrypt(item.encryptedPayload, userId);
  },

  reset: async () => {
    set({ queue: [] });
    await idbSet(IDB_KEY, []);
  },
}));

// Initialize store on load if in browser
if (typeof window !== 'undefined') {
  useSyncStore.getState().initialize();
  (window as any).useSyncStore = useSyncStore;
}
