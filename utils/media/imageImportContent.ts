import {
  dataUrlToBlob, IMAGE_PREFIX, isStoredImageRecordV1, readStoredMedia, storedValueToDataUrl
} from '../persistence/imageAssetStore';

/** Compare complete file contents, never coordinates, dimensions or sampled pixels. */
export async function fingerprintImageBlob(blob: Blob): Promise<string | null> {
  // Duplicate detection is optional; its availability must not gate photo import.
  if (!globalThis.crypto?.subtle) return null;
  const hash = await globalThis.crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Read old and current media records without decoding an image or drawing a canvas. */
export async function fingerprintStoredImage(image: string): Promise<string | null> {
  if (image.startsWith('data:image/')) {
    return fingerprintImageBlob(await dataUrlToBlob(image));
  }
  const record = await readStoredMedia(IMAGE_PREFIX, image);
  if (!record) return null;
  if (isStoredImageRecordV1(record)) return fingerprintImageBlob(record.blob);
  const dataUrl = await storedValueToDataUrl(record);
  return dataUrl ? fingerprintImageBlob(await dataUrlToBlob(dataUrl)) : null;
}
