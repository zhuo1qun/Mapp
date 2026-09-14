import type { Note, NoteImageRef, NoteMediaItem } from '../../types';
import { isMediaRefId } from './imageAssetStore';

/** 可直接作为 <img src> 的地址（排除资产 id） */
export function isDisplayableImageSrc(src: string | null | undefined): boolean {
  if (!src) return false;
  if (isMediaRefId(src)) return false;
  return (
    src.startsWith('data:image/') ||
    src.startsWith('blob:') ||
    src.startsWith('http://') ||
    src.startsWith('https://')
  );
}

/** 媒体引用是否正在使用裁剪/贴纸 Variant 展示 */
export function isImageRefCropActive(
  ref: Pick<NoteImageRef, 'variantId' | 'variantEnabled'> | null | undefined
): boolean {
  return !!ref?.variantId && ref.variantEnabled !== false;
}

export function isMediaItemCropActive(item: NoteMediaItem | null | undefined): boolean {
  return isImageRefCropActive(item);
}

/** 媒体栏第一项是否为有效套索裁剪贴纸（优先 media[0]） */
export function noteHasActiveFirstMediaCrop(
  note: Pick<Note, 'media' | 'imageRefs'>
): boolean {
  if (note.media && note.media.length > 0) {
    return isMediaItemCropActive(note.media[0]);
  }
  return isImageRefCropActive(note.imageRefs?.[0]);
}

/** 标题、正文任一有实际内容时，Board 保持便签卡呈现。 */
export function noteHasBoardTextContent(note: Pick<Note, 'text'>): boolean {
  const text = note.text || '';
  const firstNewline = text.indexOf('\n');
  const rawTitle = firstNewline === -1 ? text : text.slice(0, firstNewline);
  const detail = firstNewline === -1 ? '' : text.slice(firstNewline + 1);
  const title = rawTitle.replace(/^#+\s+/, '').trim();
  return title.length > 0 || detail.trim().length > 0;
}

/** 是否具备可在 Board 上单独呈现的媒体。 */
export function noteHasBoardMedia(
  note: Pick<Note, 'images' | 'imageRefs' | 'media' | 'sketch'>
): boolean {
  return Boolean(
    note.media?.length || note.imageRefs?.length || note.images?.length || note.sketch
  );
}

/**
 * Board 上是否应按媒体贴纸呈现（非文本卡片）。
 * 媒体贴纸由内容决定：只有标题和正文都为空、且存在媒体时才呈现为媒体。
 * 套索裁剪仅决定媒体的像素来源，不改变此判断。
 */
export function noteRendersAsBoardSticker(
  note: Pick<Note, 'text' | 'images' | 'imageRefs' | 'media' | 'sketch'>
): boolean {
  return !noteHasBoardTextContent(note) && noteHasBoardMedia(note);
}

/**
 * 是否仍需从 IndexedDB / Variant 解析展示像素。
 */
export function noteNeedsMediaResolve(note: Note): boolean {
  if (note.media && note.media.length > 0) {
    if (note.media.some((m) => isMediaRefId(m.assetId))) return true;
    return false;
  }
  if ((note.images || []).some(isMediaRefId)) return true;
  if (note.sketch && isMediaRefId(note.sketch)) return true;

  const refs = note.imageRefs || [];
  if (refs.length === 0) return false;

  const images = note.images || [];
  if (images.length < refs.length) return true;
  if (images.some((img) => !isDisplayableImageSrc(img))) return true;
  return false;
}
