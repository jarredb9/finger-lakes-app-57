import { set, get, del } from 'idb-keyval';
import { Winery, Visit } from '@/lib/types';

export type OfflineMutation = 
  | { type: 'create'; id: string; winery: Winery; visitData: { visit_date: string; user_review: string; rating: number; photos: Blob[] }; timestamp: number }
  | { type: 'update'; id: string; visitId: string; visitData: Partial<Visit>; newPhotos: Blob[]; photosToDelete: string[]; timestamp: number }
  | { type: 'delete'; id: string; visitId: string; timestamp: number };

// Legacy type for migration support if needed, though we'll just clear or ignore old ones if schema breaks
// Using a generic key
const OFFLINE_QUEUE_KEY = 'offline-mutation-queue';

export async function addOfflineMutation(mutation: OfflineMutation): Promise<void> {
  const current = (await get<OfflineMutation[]>(OFFLINE_QUEUE_KEY)) || [];
  await set(OFFLINE_QUEUE_KEY, [...current, mutation]);
}

export async function getOfflineMutations(): Promise<OfflineMutation[]> {
  return (await get<OfflineMutation[]>(OFFLINE_QUEUE_KEY)) || [];
}

export async function removeOfflineMutation(mutationId: string): Promise<void> {
  const current = (await get<OfflineMutation[]>(OFFLINE_QUEUE_KEY)) || [];
  const updated = current.filter(m => m.id !== mutationId);
  await set(OFFLINE_QUEUE_KEY, updated);
}

export async function clearOfflineQueue(): Promise<void> {
  await del(OFFLINE_QUEUE_KEY);
}

// Re-export for backward compatibility during refactor if needed, mapped to new type
export type OfflineVisit = OfflineMutation & { type: 'create' };
export const addOfflineVisit = (visit: any) => addOfflineMutation({ ...visit, type: 'create' });
export const getOfflineVisits = async () => (await getOfflineMutations()).filter(m => m.type === 'create');
export const removeOfflineVisit = removeOfflineMutation;