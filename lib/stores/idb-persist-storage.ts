import { StateStorage } from 'zustand/middleware';
import { get, set, del } from 'idb-keyval';

/**
 * Custom storage for Zustand persist middleware using IndexedDB (via idb-keyval).
 * This allows storing larger data arrays (like the first page of visits/trips)
 * without the 5MB limit and performance impact of localStorage.
 */
export const idbStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    const value = await get(name);
    return value || null;
  },
  setItem: async (name: string, value: string): Promise<void> => {
    await set(name, value);
  },
  removeItem: async (name: string): Promise<void> => {
    await del(name);
  },
};
