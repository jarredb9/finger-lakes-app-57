/**
 * Binary Reconstitution Utilities
 * Implements "The Reconstitution Rule" for WebKit compatibility.
 * Stores photos as Base64 strings to prevent detached Blob handles in IndexedDB.
 */

/**
 * Converts a File or Blob to a Base64 data URL string (includes header).
 */
export async function fileToBase64(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to convert file to base64'));
    reader.readAsDataURL(file);
  });
}

/**
 * Converts a File or Blob to a raw Base64 string (no header).
 */
export async function blobToBase64Raw(blob: Blob): Promise<string> {
  const dataUrl = await fileToBase64(blob);
  return dataUrl.split(',')[1];
}

/**
 * Converts a Base64 string back to a File object.
 * Reconstitutes the binary data. Handles both full data URLs and raw base64 strings.
 */
export function base64ToFile(base64: string, filename: string, type?: string): File {
  let data = base64;
  let mime = type || '';

  if (base64.includes(',')) {
    const [header, body] = base64.split(',');
    data = body;
    if (!mime) {
      const mimeMatch = header.match(/:(.*?);/);
      mime = mimeMatch ? mimeMatch[1] : '';
    }
  }
  
  // Use Buffer if available (Node environment/Tests), otherwise atob
  let binaryString: string;
  if (typeof Buffer !== 'undefined') {
    binaryString = Buffer.from(data, 'base64').toString('binary');
  } else {
    binaryString = atob(data);
  }
  
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  return new File([bytes], filename, { type: mime });
}
