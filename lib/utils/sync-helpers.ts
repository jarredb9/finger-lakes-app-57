import { blobToBase64Raw as blobToBase64, base64ToFile as base64ToFileRaw } from './binary';

/**
 * Utility functions for handling sync payloads, especially binary data (photos).
 */

export interface Base64Photo {
  __isBase64: true;
  base64: string;
  name: string;
  type: string;
}

export { blobToBase64 };

export const base64ToFile = (base64: string, type: string, name: string): File => {
  return base64ToFileRaw(base64, name, type);
};

/**
 * Checks if a payload property is a base64-encoded photo object.
 */
export const isBase64Photo = (obj: unknown): obj is Base64Photo => {
  return (
    !!obj &&
    typeof obj === 'object' &&
    (obj as Record<string, unknown>).__isBase64 === true
  );
};

/**
 * Prepares photos in a mutation payload for IndexedDB storage by converting Blobs to Base64.
 */
export const stabilizePhotos = async (photos: (File | Blob | Base64Photo | string)[]): Promise<(Base64Photo | string)[]> => {
  return await Promise.all(photos.map(async (p) => {
    if (p instanceof Blob) {
      const base64 = await blobToBase64(p);
      return {
        __isBase64: true,
        name: (p as File).name || 'photo.jpg',
        type: p.type,
        base64
      } as Base64Photo;
    }
    return p as Base64Photo | string;
  }));
};
