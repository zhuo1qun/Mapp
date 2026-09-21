/**
 * 图片资产存储：IndexedDB 中以 Blob + ImageAsset 元数据保存，
 * Note 只持有 assetId / imageRefs，不嵌入像素。
 */
import { get, set, keys } from 'idb-keyval';
import type { ImageAsset, Note, NoteImageRef } from '../../types';

export const IMAGE_PREFIX = 'mapp-image-';
export const SKETCH_PREFIX = 'mapp-sketch-';

/** IndexedDB 记录格式 v1 */
export type StoredImageRecordV1 = {
  v: 1;
  kind: 'image' | 'sketch';
  asset: ImageAsset;
  blob: Blob;
};

export type StoredImageValue = string | { data: string; projects?: string[]; createdAt?: number; size?: number } | StoredImageRecordV1;

export function generateMediaId(): string {
  return `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function isMediaRefId(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith('img-');
}

/** 从 img- id 或整段字符串提取资产 id */
export function extractMediaId(imageData: string): string | null {
  if (isMediaRefId(imageData)) return imageData;
  return null;
}

export function noteImageRefsFromIds(ids: string[]): NoteImageRef[] {
  return ids.filter(isMediaRefId).map((assetId) => ({ assetId }));
}

/** 由 images[] 同步 imageRefs；保留已有 variantId */
export function syncNoteImageRefs(note: Note): Note {
  const existingByAsset = new Map(
    (note.imageRefs || []).filter((r) => isMediaRefId(r.assetId)).map((r) => [r.assetId, r] as const)
  );
  const ids = (note.images || []).filter(isMediaRefId);
  const fromRefs = [...existingByAsset.keys()];
  const merged = ids.length > 0 ? ids : fromRefs;
  const unique = [...new Set(merged)];
  return {
    ...note,
    images: unique,
    imageRefs: unique.map((assetId) => existingByAsset.get(assetId) ?? { assetId })
  };
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('blobToDataUrl failed'));
    reader.readAsDataURL(blob);
  });
}

export async function probeImageSize(blob: Blob): Promise<{ width: number; height: number }> {
  const url = URL.createObjectURL(blob);
  try {
    const dims = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth || 0, height: img.naturalHeight || 0 });
      img.onerror = () => reject(new Error('image probe failed'));
      img.src = url;
    });
    return dims;
  } catch {
    return { width: 0, height: 0 };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function parseDataUrlMime(dataUrl: string): string {
  const m = /^data:([^;,]+)/i.exec(dataUrl);
  return m?.[1] || 'image/png';
}

/** 轻量内容指纹（与旧 storage 采样哈希兼容思路） */
export async function hashMediaPayload(payload: string): Promise<string> {
  let hashInput = payload;
  if (payload.length > 2000) {
    const start = payload.substring(0, 500);
    const middle = payload.substring(
      Math.floor(payload.length / 2) - 250,
      Math.floor(payload.length / 2) + 250
    );
    const end = payload.substring(payload.length - 500);
    hashInput = `${start}${middle}${end}${payload.length}`;
  }
  const encoder = new TextEncoder();
  const data = encoder.encode(hashInput);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function isStoredImageRecordV1(value: unknown): value is StoredImageRecordV1 {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as StoredImageRecordV1).v === 1 &&
    (value as StoredImageRecordV1).blob instanceof Blob &&
    !!(value as StoredImageRecordV1).asset
  );
}

export async function readStoredMedia(
  prefix: typeof IMAGE_PREFIX | typeof SKETCH_PREFIX,
  id: string
): Promise<StoredImageValue | null> {
  const data = await get<StoredImageValue>(`${prefix}${id}`);
  return data ?? null;
}

export async function mediaRecordExists(
  prefix: typeof IMAGE_PREFIX | typeof SKETCH_PREFIX,
  id: string
): Promise<boolean> {
  const data = await get(`${prefix}${id}`);
  return data != null;
}

/** 任意存储形态 → 展示用 data URL */
export async function storedValueToDataUrl(value: StoredImageValue): Promise<string | null> {
  if (typeof value === 'string') {
    if (value.startsWith('data:image/')) return value;
    return null;
  }
  if (isStoredImageRecordV1(value)) {
    return blobToDataUrl(value.blob);
  }
  if (value && typeof value === 'object' && typeof (value as { data?: string }).data === 'string') {
    const d = (value as { data: string }).data;
    return d.startsWith('data:image/') ? d : null;
  }
  return null;
}

/** 读出并可选升级为 v1 Blob 记录 */
export async function loadMediaDataUrl(
  prefix: typeof IMAGE_PREFIX | typeof SKETCH_PREFIX,
  id: string,
  opts?: { upgradeLegacy?: boolean; kind?: 'image' | 'sketch' }
): Promise<string | null> {
  const key = `${prefix}${id}`;
  const raw = await get<StoredImageValue>(key);
  if (raw == null) return null;

  if (isStoredImageRecordV1(raw)) {
    return blobToDataUrl(raw.blob);
  }

  const dataUrl = await storedValueToDataUrl(raw);
  if (!dataUrl) return null;

  if (opts?.upgradeLegacy) {
    try {
      await writeMediaRecordFromDataUrl(prefix, id, dataUrl, {
        kind: opts.kind ?? (prefix === SKETCH_PREFIX ? 'sketch' : 'image'),
        existingId: id
      });
    } catch (err) {
      console.warn(`Failed to upgrade legacy media ${id}:`, err);
    }
  }

  return dataUrl;
}

export async function writeMediaRecordFromDataUrl(
  prefix: typeof IMAGE_PREFIX | typeof SKETCH_PREFIX,
  id: string,
  dataUrl: string,
  opts: { kind: 'image' | 'sketch'; existingId?: string; filename?: string; contentHash?: string }
): Promise<ImageAsset> {
  if (!dataUrl.startsWith('data:image/')) {
    throw new Error('Invalid image data: not a valid data URL');
  }
  const blob = await dataUrlToBlob(dataUrl);
  const mime = blob.type || parseDataUrlMime(dataUrl);
  const { width, height } = await probeImageSize(blob);
  const contentHash = opts.contentHash ?? (await hashMediaPayload(dataUrl));
  const asset: ImageAsset = {
    id,
    mime,
    width,
    height,
    size: blob.size,
    createdAt: Date.now(),
    filename: opts.filename,
    contentHash
  };
  const record: StoredImageRecordV1 = {
    v: 1,
    kind: opts.kind,
    asset,
    blob
  };
  await set(`${prefix}${id}`, record);
  return asset;
}

/** 按 contentHash 查找已有资产（仅扫 v1 记录与可哈希的旧字符串） */
export async function findMediaIdByContentHash(
  prefix: typeof IMAGE_PREFIX | typeof SKETCH_PREFIX,
  contentHash: string,
  expectedDataUrl?: string
): Promise<string | null> {
  const allKeys = await keys();
  const mediaKeys = allKeys.filter(
    (key) => typeof key === 'string' && (key as string).startsWith(prefix)
  ) as string[];

  for (const key of mediaKeys) {
    try {
      const raw = await get<StoredImageValue>(key);
      if (!raw) continue;
      if (isStoredImageRecordV1(raw)) {
        if (raw.asset.contentHash === contentHash &&
            (expectedDataUrl === undefined || await blobToDataUrl(raw.blob) === expectedDataUrl)) {
          return key.slice(prefix.length);
        }
        continue;
      }
      const dataUrl = await storedValueToDataUrl(raw);
      if (!dataUrl) continue;
      const h = await hashMediaPayload(dataUrl);
      if (h === contentHash && (expectedDataUrl === undefined || dataUrl === expectedDataUrl)) {
        return key.slice(prefix.length);
      }
    } catch {
      continue;
    }
  }
  return null;
}

export async function getImageAssetMeta(id: string): Promise<ImageAsset | null> {
  const raw = await readStoredMedia(IMAGE_PREFIX, id);
  if (isStoredImageRecordV1(raw)) return raw.asset;
  return null;
}
