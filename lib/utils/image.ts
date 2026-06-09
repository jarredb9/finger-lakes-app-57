/**
 * Image compression and resizing utility.
 * Compresses and resizes photos to a maximum dimension on the long edge
 * client-side using browser Canvas APIs.
 */

export async function compressImage(
  file: File | Blob,
  maxDimension = 2048,
  quality = 0.8
): Promise<Blob | File> {
  // If not in browser, return original
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return file;
  }

  if (!file.type.startsWith('image/')) {
    return file;
  }

  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      let { width, height } = img;

      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(file);
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            if (file instanceof File) {
              resolve(
                new File([blob], file.name, {
                  type: 'image/jpeg',
                  lastModified: file.lastModified,
                })
              );
            } else {
              resolve(blob);
            }
          } else {
            resolve(file);
          }
        },
        'image/jpeg',
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };

    img.src = objectUrl;
  });
}
