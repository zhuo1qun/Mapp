/**
 * Note.media[] ↔ images / imageRefs / sketch 双向同步（读旧写新）。
 * media[] 为权威顺序；可含多个 sketch。legacy.sketch 仅保留 media 中第一个 sketch 以兼容旧路径。
 */
import type { Note, NoteImageRef, NoteMediaItem } from '../../types';
import { extractMediaId, isMediaRefId, syncNoteImageRefs } from './imageAssetStore';
import { noteHasActiveFirstMediaCrop } from './mediaDisplay';

export function generateNoteMediaItemId(): string {
  return `mid-${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function sketchAssetId(sketch: string | undefined): string | null {
  if (!sketch) return null;
  if (isMediaRefId(sketch)) return sketch;
  return extractMediaId(sketch);
}

/** 无 media 时由 legacy 字段生成；已有 media 则保留（含多个 sketch），并补齐 legacy 中缺失项 */
export function syncNoteMediaFromLegacy(note: Note): Note {
  const synced = syncNoteImageRefs({ ...note });
  const prevMedia = note.media || [];

  const refs: NoteImageRef[] =
    synced.imageRefs && synced.imageRefs.length > 0
      ? synced.imageRefs
      : (synced.images || []).filter(isMediaRefId).map((assetId) => ({ assetId }));

  if (prevMedia.length > 0) {
    const refByAsset = new Map(refs.map((r) => [r.assetId, r]));
    const usedImage = new Set(
      prevMedia.filter((m) => m.kind === 'image' && isMediaRefId(m.assetId)).map((m) => m.assetId)
    );
    const usedSketch = new Set(
      prevMedia.filter((m) => m.kind === 'sketch' && isMediaRefId(m.assetId)).map((m) => m.assetId)
    );

    const media: NoteMediaItem[] = prevMedia.map((m) => {
      if (m.kind === 'image' && isMediaRefId(m.assetId) && refByAsset.has(m.assetId)) {
        const r = refByAsset.get(m.assetId)!;
        return {
          ...m,
          variantId: r.variantId ?? m.variantId,
          variantEnabled: r.variantEnabled ?? m.variantEnabled
        };
      }
      return m;
    });

    for (const ref of refs) {
      if (!isMediaRefId(ref.assetId) || usedImage.has(ref.assetId)) continue;
      media.push({
        id: generateNoteMediaItemId(),
        kind: 'image',
        assetId: ref.assetId,
        variantId: ref.variantId,
        variantEnabled: ref.variantEnabled
      });
      usedImage.add(ref.assetId);
    }

    const skId = sketchAssetId(synced.sketch);
    if (skId && !usedSketch.has(skId)) {
      media.push({
        id: generateNoteMediaItemId(),
        kind: 'sketch',
        assetId: skId
      });
    }

    return { ...synced, media };
  }

  const next: NoteMediaItem[] = [];
  const usedIds = new Set<string>();

  for (const ref of refs) {
    if (!isMediaRefId(ref.assetId)) continue;
    const id = generateNoteMediaItemId();
    usedIds.add(id);
    next.push({
      id,
      kind: 'image',
      assetId: ref.assetId,
      variantId: ref.variantId,
      variantEnabled: ref.variantEnabled
    });
  }

  const skId = sketchAssetId(synced.sketch);
  if (skId) {
    next.push({
      id: generateNoteMediaItemId(),
      kind: 'sketch',
      assetId: skId
    });
  }

  return { ...synced, media: next };
}

/** 由 media 写回 images / imageRefs / sketch（sketch = 列表中第一个涂鸦资产） */
export function syncNoteLegacyFromMedia(note: Note): Note {
  const media = note.media || [];
  const images: string[] = [];
  const imageRefs: NoteImageRef[] = [];
  let sketch: string | undefined;

  for (const m of media) {
    if (!isMediaRefId(m.assetId)) continue;
    if (m.kind === 'sketch') {
      if (!sketch) sketch = m.assetId;
      continue;
    }
    images.push(m.assetId);
    imageRefs.push({
      assetId: m.assetId,
      variantId: m.variantId,
      variantEnabled: m.variantEnabled
    });
  }

  return {
    ...note,
    images,
    imageRefs,
    sketch,
    media
  };
}

/** 确保 media 存在并与 legacy 双向一致（保存/加载入口） */
export function ensureNoteMediaSynced(note: Note): Note {
  // `saveProject` normalizes a project before it migrates inline image data to
  // IndexedDB. At that point a camera/photo import legitimately still carries
  // `data:image/...` values. Converting it through media[] first would retain
  // only asset ids and silently erase those pixels before migration can save
  // them. Keep the inline payload intact until `migrateNoteImages` replaces it
  // with an asset id.
  if ((note.images || []).some((image) => typeof image === 'string' && image.startsWith('data:image/'))) {
    return { ...note };
  }
  const withMedia = syncNoteMediaFromLegacy(note);
  const synced = syncNoteLegacyFromMedia(withMedia);
  // 首项裁剪贴纸误标为 image 时恢复 standard，保留 mapping 点位
  if (synced.variant === 'image' && noteHasActiveFirstMediaCrop(synced)) {
    return { ...synced, variant: 'standard' };
  }
  return synced;
}
