
/**
 * Utility functions for handling sync payloads, especially binary data (photos).
 */

export interface Base64Photo {
  __isBase64: true;
  base64: string;
  name: string;
  type: string;
}

export const blobToBase64 = (blob: Blob): Promise<string> => {
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
};

export const base64ToFile = (base64: string, type: string, name: string): File => {
  const bin = atob(base64);
  const len = bin.length;
  const arr = new Uint8Array(len);
  for (let i = 0; i < len; i++) arr[i] = bin.charCodeAt(i);
  
  return new File([arr], name, { type, lastModified: Date.now() });
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
