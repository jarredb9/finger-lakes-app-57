import { set, get, del } from 'idb-keyval';
import { Winery } from '@/lib/types';

export interface OfflineVisit {
  id: string; // Temporary ID (e.g., 'temp-123')
  winery: Winery;
  visitData: {
    visit_date: string;
    user_review: string;
    rating: number;
    photos: Blob[]; // Store as Blobs in IndexedDB
  };
  timestamp: number;
}

const OFFLINE_VISITS_KEY = 'offline-visits';

export async function addOfflineVisit(visit: OfflineVisit): Promise<void> {
  // Use the visit ID as the key to avoid array serialization issues with Blobs if possible,
  // but a simple list is easier to manage.
  // Actually, idb-keyval `set` handles simple values. Storing an array of objects with Blobs is supported by IDB.
  const current = (await get<OfflineVisit[]>(OFFLINE_VISITS_KEY)) || [];
  await set(OFFLINE_VISITS_KEY, [...current, visit]);
}

export async function getOfflineVisits(): Promise<OfflineVisit[]> {
  return (await get<OfflineVisit[]>(OFFLINE_VISITS_KEY)) || [];
}

export async function removeOfflineVisit(tempId: string): Promise<void> {
  const current = (await get<OfflineVisit[]>(OFFLINE_VISITS_KEY)) || [];
  const updated = current.filter(v => v.id !== tempId);
  await set(OFFLINE_VISITS_KEY, updated);
}

export async function clearOfflineQueue(): Promise<void> {
  await del(OFFLINE_VISITS_KEY);
}
