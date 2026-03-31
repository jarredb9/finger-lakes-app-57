import { set, get, del } from 'idb-keyval';
import { Winery, Visit } from '@/lib/types';

// Photos can be Blobs (standard) or Base64 strings (for environment-restricted fallbacks/testing)
export type OfflinePhoto = Blob | { __isBase64: true; base64: string; name: string; type: string };

export type OfflineMutation = 
  | { type: 'create'; id: string; winery: Winery; visitData: { visit_date: string; user_review: string; rating: number; photos: OfflinePhoto[] }; timestamp: number }
  | { type: 'update'; id: string; visitId: string; visitData: Partial<Visit>; newPhotos: OfflinePhoto[]; photosToDelete: string[]; timestamp: number }
  | { type: 'delete'; id: string; visitId: string; timestamp: number };

const OFFLINE_QUEUE_KEY = 'offline-mutation-queue';

/**
 * Robustly get mutations, falling back to LocalStorage if IDB fails (common in WebKit/Containers).
 */
export async function getOfflineMutations(): Promise<OfflineMutation[]> {
  try {
    const mutations = (await get<OfflineMutation[]>(OFFLINE_QUEUE_KEY)) || [];
    return mutations;
  } catch (err) {
    const fallback = localStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!fallback) {
        return [];
    }
    try {
        const mutations = deserializeFromLocalStorage(fallback);
        return mutations;
    } catch (parseErr) {
        console.error('[OfflineQueue] Failed to parse fallback:', parseErr);
        return [];
    }
  }
}

export async function addOfflineMutation(mutation: OfflineMutation): Promise<void> {
  let current: OfflineMutation[] = [];
  try {
    current = await getOfflineMutations();
  } catch (err) {
    console.error('[OfflineQueue] Failed to get current mutations for addition:', err);
  }
  
  // CRITICAL for WebKit: Always stabilize Blobs to Base64 BEFORE storing in the queue.
  // This ensures they remain readable after network state changes (Offline -> Online).
  const stabilizedMutation = await stabilizeMutation(mutation);
  console.log('[OfflineQueue] Adding mutation to queue:', stabilizedMutation.id);
  const updated = [...current, stabilizedMutation];
  
  try {
    await set(OFFLINE_QUEUE_KEY, updated);
  } catch (err: any) {
    console.warn('[OfflineQueue] IndexedDB set failed, falling back to LocalStorage:', err.message);
    try {
        localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(updated));
    } catch (lsErr: any) {
        console.error('[OfflineQueue] LocalStorage fallback failed:', lsErr?.message || lsErr);
    }
  }
}

/**
 * Ensures all Blobs in a mutation are converted to stable Base64 objects.
 */
async function stabilizeMutation(m: OfflineMutation): Promise<OfflineMutation> {
    console.log(`[OfflineQueue] Stabilizing mutation type: ${m.type}`);
    if (m.type === 'create' && m.visitData.photos && m.visitData.photos.length > 0) {
        console.log(`[OfflineQueue] Creating Base64 for ${m.visitData.photos.length} photos`);
        const photos = await Promise.all(m.visitData.photos.map(async (p): Promise<OfflinePhoto | null> => {
            if (p instanceof Blob) {
                try {
                    const base64 = await blobToBase64(p);
                    console.log(`[OfflineQueue] Stabilized photo: ${(p as File).name || 'photo.jpg'} ${(p as File).size} bytes`);
                    return {
                        __isBase64: true,
                        name: (p as File).name || 'photo.jpg',
                        type: p.type,
                        base64
                    };
                } catch (err) {
                    console.error('[OfflineQueue] Failed to stabilize blob:', err);
                    return null;
                }
            }
            return p;
        }));
        const validPhotos = photos.filter((p): p is OfflinePhoto => p !== null);
        return { ...m, visitData: { ...m.visitData, photos: validPhotos } };
    }
    if (m.type === 'update' && m.newPhotos && m.newPhotos.length > 0) {
        const newPhotos = await Promise.all(m.newPhotos.map(async (p): Promise<OfflinePhoto | null> => {
            if (p instanceof Blob) {
                try {
                    const base64 = await blobToBase64(p);
                    console.log(`[OfflineQueue] Stabilized new photo: ${(p as File).name || 'photo.jpg'} ${(p as File).size} bytes`);
                    return {
                        __isBase64: true,
                        name: (p as File).name || 'photo.jpg',
                        type: p.type,
                        base64
                    };
                } catch (err) {
                    console.error('[OfflineQueue] Failed to stabilize new photo blob:', err);
                    return null;
                }
            }
            return p;
        }));
        const validNewPhotos = newPhotos.filter((p): p is OfflinePhoto => p !== null);
        return { ...m, newPhotos: validNewPhotos };
    }
    return m;
}

export async function removeOfflineMutation(mutationId: string): Promise<void> {
  console.log('[OfflineQueue] Removing mutation from queue:', mutationId);
  const current = await getOfflineMutations();
  const updated = current.filter(m => m.id !== mutationId);
  
  try {
    await set(OFFLINE_QUEUE_KEY, updated);
  } catch (err) {
    try {
        const serialized = await serializeForLocalStorage(updated);
        localStorage.setItem(OFFLINE_QUEUE_KEY, serialized);
    } catch (lsErr) {
        console.error('[OfflineQueue] Failed to update LS fallback after removal:', lsErr);
    }
  }
}

export async function clearOfflineQueue(): Promise<void> {
  console.log('[OfflineQueue] Clearing entire queue');
  try {
    await del(OFFLINE_QUEUE_KEY);
  } catch (err) {}
  localStorage.removeItem(OFFLINE_QUEUE_KEY);
}

// --- Serialization Helpers for LocalStorage Fallback ---

function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const result = reader.result as string;
            const base64 = result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = (err) => reject(err);
        reader.readAsDataURL(blob);
    });
}

function base64ToFile(base64: string, type: string, name: string): File {
    const bin = atob(base64);
    const len = bin.length;
    const arr = new Uint8Array(len);
    for (let i = 0; i < len; i++) arr[i] = bin.charCodeAt(i);
    
    // WebKit/Safari FIX: Creating a File instead of a Blob ensures the 
    // network stack can reliably read the data during multipart uploads.
    const file = new File([arr], name, { type, lastModified: Date.now() });
    console.log(`[OfflineQueue] Reconstituted file: ${name} (${file.size} bytes)`);
    return file;
}

/**
 * Serializes mutations for LocalStorage, converting Blobs to Base64.
 */
async function serializeForLocalStorage(mutations: OfflineMutation[]): Promise<string> {
    const serialized = await Promise.all(mutations.map(async (m) => {
        if (m.type === 'create' && m.visitData.photos && m.visitData.photos.length > 0) {
            const photos = await Promise.all(m.visitData.photos.map(async (p) => {
                if (p instanceof Blob) {
                    try {
                        const base64 = await blobToBase64(p);
                        return {
                            __isBase64: true,
                            name: (p as File).name || 'photo.jpg',
                            type: p.type,
                            base64
                        };
                    } catch (err) {
                        console.error('[OfflineQueue] Failed to serialize blob:', err);
                        return null;
                    }
                }
                return p;
            }));
            return { ...m, visitData: { ...m.visitData, photos: photos.filter(p => p !== null) } };
        }
        if (m.type === 'update' && m.newPhotos && m.newPhotos.length > 0) {
            const newPhotos = await Promise.all(m.newPhotos.map(async (p) => {
                if (p instanceof Blob) {
                    try {
                        const base64 = await blobToBase64(p);
                        return {
                            __isBase64: true,
                            name: (p as File).name || 'photo.jpg',
                            type: p.type,
                            base64
                        };
                    } catch (err) {
                        return null;
                    }
                }
                return p;
            }));
            return { ...m, newPhotos: newPhotos.filter(p => p !== null) };
        }
        return m;
    }));
    return JSON.stringify(serialized);
}

/**
 * Deserializes mutations from LocalStorage.
 */
function deserializeFromLocalStorage(json: string): OfflineMutation[] {
    return JSON.parse(json) as OfflineMutation[];
}

/**
 * Utility to ensure a photo is a Blob/File, converting from Base64 if necessary.
 * Used during the final sync/upload step.
 */
export function ensureBlob(photo: OfflinePhoto): Blob {
    if (photo instanceof Blob) return photo;
    if (photo && typeof photo === 'object' && (photo as any).__isBase64) {
        return base64ToFile(
            (photo as any).base64, 
            (photo as any).type || 'image/jpeg', 
            (photo as any).name || 'photo.jpg'
        );
    }
    // Fallback for cases where it might be a raw base64 string or invalid
    return new Blob([], { type: 'image/jpeg' });
}

// Expose to window for E2E testing
if (typeof window !== 'undefined') {
    (window as any).getOfflineMutations = getOfflineMutations;
}
