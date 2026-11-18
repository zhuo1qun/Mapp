import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Note, NoteMediaItem, NormPoint } from '../../types';
import { fileToBase64 } from '../../utils';
import { loadImage, loadSketch, saveImage, saveSketch } from '../../utils/persistence/storage';
import { blobToDataUrl, isMediaRefId } from '../../utils/persistence/imageAssetStore';
import { isDisplayableImageSrc, isMediaItemCropActive, noteNeedsMediaResolve } from '../../utils/persistence/mediaDisplay';
import {
  ensureNoteMediaSynced,
  generateNoteMediaItemId,
  syncNoteLegacyFromMedia
} from '../../utils/persistence/noteMediaSync';
import { createLassoSticker } from '../../utils/media/createLassoSticker';
import { createAutoBackgroundRemovalSticker, type AutoMaskProgress } from '../../utils/media/autoBackgroundRemoval';
import { extractDroppedImageFiles } from '../../utils/media/dataTransferImages';
import { resolveVariantDisplayUrl } from '../../utils/media/imageMaskRender';

interface UseMediaHandlerArgs {
  initialNote?: Partial<Note>;
  isOpen: boolean;
  text: string;
  setText: (text: string) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  /** 富文本编辑器中，图文混合粘贴时将文字写回当前选区。 */
  insertTextAtSelection?: (text: string) => void;
}

async function ensureAssetIdForKind(
  displaySrc: string,
  kind: 'image' | 'sketch',
  existingAssetId?: string
): Promise<string> {
  if (existingAssetId && isMediaRefId(existingAssetId)) return existingAssetId;
  if (isMediaRefId(displaySrc)) return displaySrc;
  if (displaySrc.startsWith('data:image/')) {
    return kind === 'sketch' ? saveSketch(displaySrc) : saveImage(displaySrc);
  }
  throw new Error('Cannot resolve asset id');
}

async function loadAssetOriginal(assetId: string, kind: 'image' | 'sketch'): Promise<string | null> {
  if (kind === 'sketch') {
    return (await loadSketch(assetId)) || (await loadImage(assetId));
  }
  return (await loadImage(assetId)) || (await loadSketch(assetId));
}

function buildInitialMedia(note?: Partial<Note>): NoteMediaItem[] {
  if (!note) return [];
  return ensureNoteMediaSynced(note as Note).media || [];
}

export function useMediaHandler({
  initialNote,
  isOpen,
  text,
  setText,
  textareaRef,
  insertTextAtSelection
}: UseMediaHandlerArgs) {
  const [mediaItems, setMediaItems] = useState<NoteMediaItem[]>(() => buildInitialMedia(initialNote));
  const [displaySrcs, setDisplaySrcs] = useState<string[]>(() =>
    buildInitialMedia(initialNote).map((item) => item.source?.kind === 'remote' ? item.source.url : '')
  );
  const [isProcessingImages, setIsProcessingImages] = useState(false);
  const [isResolvingMedia, setIsResolvingMedia] = useState(false);

  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [previewImageIndex, setPreviewImageIndex] = useState(0);

  const prevIsOpenRef = useRef(false);
  const prevNoteIdRef = useRef<string | undefined>(undefined);
  const prevChecksumRef = useRef('');
  const noteId = initialNote?.id;
  const loadGenRef = useRef(0);

  const noteMediaChecksum = useMemo(() => {
    const media = initialNote?.media;
    if (media?.length) {
      return media
        .map(
          (m) =>
            `${m.id}:${m.kind}:${m.assetId}>${m.variantId || ''}>${m.variantEnabled === false ? '0' : '1'}`
        )
        .join(';');
    }
    return [
      (initialNote?.images || []).join(','),
      (initialNote?.imageRefs || [])
        .map((r) => `${r.assetId}>${r.variantId || ''}>${r.variantEnabled === false ? '0' : '1'}`)
        .join(';'),
      initialNote?.sketch || ''
    ].join('|');
  }, [initialNote?.media, initialNote?.images, initialNote?.imageRefs, initialNote?.sketch]);

  /** 兼容旧调用：仅 image 项的展示 URL */
  const images = useMemo(
    () =>
      mediaItems
        .map((m, i) => (m.kind === 'image' ? displaySrcs[i] || '' : null))
        .filter((x): x is string => x != null),
    [mediaItems, displaySrcs]
  );

  const imageRefs = useMemo(
    () =>
      mediaItems
        .filter((m) => m.kind === 'image')
        .map((m) => ({
          assetId: m.assetId,
          source: m.source,
          variantId: m.variantId,
          variantEnabled: m.variantEnabled
        })),
    [mediaItems]
  );

  const sketch = useMemo(() => {
    const idx = mediaItems.findIndex((m) => m.kind === 'sketch');
    if (idx < 0) return undefined;
    return displaySrcs[idx] || undefined;
  }, [mediaItems, displaySrcs]);

  const appendDisplayImages = useCallback((base64Images: string[]) => {
    if (base64Images.length === 0) return;
    setMediaItems((prev) => [
      ...prev,
      ...base64Images.map(() => ({
        id: generateNoteMediaItemId(),
        kind: 'image' as const,
        assetId: ''
      }))
    ]);
    setDisplaySrcs((prev) => [...prev, ...base64Images]);
  }, []);

  const setImages = useCallback(
    (updater: string[] | ((prev: string[]) => string[])) => {
      setMediaItems((prevMedia) => {
        const imageIndices = prevMedia
          .map((m, i) => (m.kind === 'image' ? i : -1))
          .filter((i) => i >= 0);
        setDisplaySrcs((prevDisplay) => {
          const prevImageSrcs = imageIndices.map((i) => prevDisplay[i] || '');
          const nextImageSrcs = typeof updater === 'function' ? updater(prevImageSrcs) : updater;
          if (nextImageSrcs.length > prevImageSrcs.length) {
            const added = nextImageSrcs.slice(prevImageSrcs.length);
            // append handled outside via appendDisplayImages preferred
            queueMicrotask(() => appendDisplayImages(added));
            return prevDisplay;
          }
          const next = prevDisplay.slice();
          imageIndices.forEach((mi, j) => {
            if (j < nextImageSrcs.length) next[mi] = nextImageSrcs[j] || '';
          });
          return next;
        });
        return prevMedia;
      });
    },
    [appendDisplayImages]
  );

  const appendSketch = useCallback((dataUrl: string) => {
    if (!dataUrl) return;
    setMediaItems((prev) => [
      ...prev,
      {
        id: generateNoteMediaItemId(),
        kind: 'sketch' as const,
        assetId: isMediaRefId(dataUrl) ? dataUrl : ''
      }
    ]);
    setDisplaySrcs((prev) => [...prev, dataUrl]);
  }, []);

  const setSketch = useCallback((next: string | undefined) => {
    // 兼容旧调用：空则删首个涂鸦；非空则追加（不再覆盖已有涂鸦）
    if (!next || next === '') {
      setMediaItems((prev) => {
        const idx = prev.findIndex((m) => m.kind === 'sketch');
        if (idx < 0) return prev;
        setDisplaySrcs((d) => d.filter((_, i) => i !== idx));
        return prev.filter((_, i) => i !== idx);
      });
      return;
    }
    appendSketch(next);
  }, [appendSketch]);

  const setImageRefs = useCallback((_refs: Note['imageRefs']) => {
    // legacy no-op：权威在 mediaItems
  }, []);

  useEffect(() => {
    if (!isOpen) {
      prevIsOpenRef.current = false;
      setIsResolvingMedia(false);
      return;
    }

    const openedNow = !prevIsOpenRef.current;
    const noteChanged = noteId !== prevNoteIdRef.current;
    const mediaChanged = noteMediaChecksum !== prevChecksumRef.current;
    prevIsOpenRef.current = true;
    prevNoteIdRef.current = noteId;
    prevChecksumRef.current = noteMediaChecksum;

    if (!(openedNow || noteChanged || mediaChanged)) return;

    if (openedNow || noteChanged) {
      setPreviewImage(null);
      setPreviewImageIndex(0);
    }

    const probe = ensureNoteMediaSynced({
      ...(initialNote as Note),
      images: initialNote?.images || [],
      imageRefs: initialNote?.imageRefs,
      sketch: initialNote?.sketch,
      media: initialNote?.media
    });
    const items = probe.media || [];
    setMediaItems(items);

    if (!noteNeedsMediaResolve(probe) && items.every((_, i) => false)) {
      // fall through to resolve when assets are ids
    }

    const needsResolve = noteNeedsMediaResolve(probe) || items.some((m) => isMediaRefId(m.assetId));
    setDisplaySrcs(items.map((m) => m.source?.kind === 'remote' ? m.source.url : ''));
    if (!needsResolve) {
      setIsResolvingMedia(false);
      return;
    }

    setIsResolvingMedia(true);
    const gen = ++loadGenRef.current;
    void (async () => {
      try {
        const { resolveNoteImageRefUrl } = await import('../../utils/media/imageMaskRender');
        if (loadGenRef.current !== gen) return;
        const srcs = await Promise.all(
          items.map(async (m) => {
            if (m.source?.kind === 'remote') return m.source.url;
            if (!isMediaRefId(m.assetId)) return '';
            try {
              const url = await resolveNoteImageRefUrl({
                assetId: m.assetId,
                variantId: m.variantId,
                variantEnabled: m.variantEnabled
              });
              if (url && isDisplayableImageSrc(url)) return url;
              if (m.kind === 'sketch') {
                const sk = await loadSketch(m.assetId);
                return sk && isDisplayableImageSrc(sk) ? sk : '';
              }
              const img = await loadImage(m.assetId);
              return img && isDisplayableImageSrc(img) ? img : '';
            } catch {
              return '';
            }
          })
        );
        if (loadGenRef.current !== gen) return;
        setMediaItems(items);
        setDisplaySrcs(srcs);
      } catch (err) {
        console.error('Failed to resolve note media for editor', err);
        if (loadGenRef.current !== gen) return;
        setDisplaySrcs(items.map(() => ''));
      } finally {
        if (loadGenRef.current === gen) setIsResolvingMedia(false);
      }
    })();
  }, [noteId, isOpen, noteMediaChecksum, initialNote]);

  const reorderMedia = useCallback((nextItems: NoteMediaItem[]) => {
    setMediaItems((prev) => {
      const byId = new Map(prev.map((m, i) => [m.id, { m, i }] as const));
      setDisplaySrcs((prevSrcs) =>
        nextItems.map((item) => {
          const hit = byId.get(item.id);
          return hit ? prevSrcs[hit.i] || '' : '';
        })
      );
      return nextItems;
    });
  }, []);

  const replaceMediaWithLocalBlob = useCallback(async (index: number, blob: Blob) => {
    if (!blob.type.startsWith('image/')) throw new Error('所选内容不是图片');
    const dataUrl = await blobToDataUrl(blob);
    const assetId = await saveImage(dataUrl);
    setMediaItems((prev) => prev.map((entry, i) => i === index ? {
      ...entry,
      assetId,
      source: { kind: 'local' as const },
      variantId: undefined,
      variantEnabled: undefined
    } : entry));
    setDisplaySrcs((prev) => prev.map((src, i) => i === index ? dataUrl : src));
    if (previewImageIndex === index) setPreviewImage(dataUrl);
    return { assetId, dataUrl };
  }, [previewImageIndex]);

  /** 将远程图片自动保存为本地资产；跨域禁止读取像素时返回 null。 */
  const materializeRemoteAt = useCallback(async (index: number) => {
    const item = mediaItems[index];
    const remoteUrl = item?.source?.kind === 'remote' ? item.source.url : null;
    if (!remoteUrl) return null;
    setIsProcessingImages(true);
    try {
      const response = await fetch(remoteUrl, { mode: 'cors', credentials: 'omit' });
      if (!response.ok) throw new Error(`Image download failed: ${response.status}`);
      const blob = await response.blob();
      if (!blob.type.startsWith('image/')) throw new Error('Remote resource is not an image');
      return await replaceMediaWithLocalBlob(index, blob);
    } catch (error) {
      console.warn('Failed to save remote image locally', error);
      setMediaItems((prev) => prev.map((entry, i) => i === index && entry.source?.kind === 'remote' ? {
        ...entry,
        source: { ...entry.source, cacheStatus: 'failed' as const }
      } : entry));
      return null;
    } finally {
      setIsProcessingImages(false);
    }
  }, [mediaItems, replaceMediaWithLocalBlob]);

  const removeMediaAt = useCallback((index: number) => {
    setMediaItems((prev) => prev.filter((_, i) => i !== index));
    setDisplaySrcs((prev) => {
      const next = prev.filter((_, i) => i !== index);
      setPreviewImageIndex((pidx) => {
        if (pidx === index) {
          if (next.length === 0) {
            setPreviewImage(null);
            return 0;
          }
          const newIndex = Math.min(index, next.length - 1);
          setPreviewImage(next[newIndex] || null);
          return newIndex;
        }
        if (pidx > index) return pidx - 1;
        return pidx;
      });
      return next;
    });
  }, []);

  const removeImage = useCallback(
    (index?: number) => {
      if (index === undefined) {
        setMediaItems((prev) => {
          const next = prev.filter((m) => m.kind !== 'image');
          setDisplaySrcs((d) => {
            const kept: string[] = [];
            prev.forEach((m, i) => {
              if (m.kind !== 'image') kept.push(d[i] || '');
            });
            return kept;
          });
          return next;
        });
        setPreviewImage(null);
        setPreviewImageIndex(0);
        return;
      }
      // index 是 images 数组下标 → 映射到 media 下标
      let imageOrdinal = -1;
      const mediaIndex = mediaItems.findIndex((m) => {
        if (m.kind !== 'image') return false;
        imageOrdinal += 1;
        return imageOrdinal === index;
      });
      if (mediaIndex >= 0) removeMediaAt(mediaIndex);
    },
    [mediaItems, removeMediaAt]
  );

  const removeSketch = useCallback(() => {
    const idx = mediaItems.findIndex((m) => m.kind === 'sketch');
    if (idx >= 0) removeMediaAt(idx);
  }, [mediaItems, removeMediaAt]);

  const applyLassoSticker = useCallback(
    async (index: number, rawPoints: NormPoint[]): Promise<{ width: number; height: number } | null> => {
      const item = mediaItems[index];
      if (!item) throw new Error('Media missing');
      const displaySrc = displaySrcs[index] || '';
      const assetId = await ensureAssetIdForKind(displaySrc, item.kind, item.assetId);
      const { ref, variant } = await createLassoSticker({
        assetId,
        rawPoints,
        outlineWidth: 0
      });
      const displayUrl =
        (await resolveVariantDisplayUrl(variant.id, { rasterizeIfMissing: true, forceRerender: true })) ||
        displaySrc;

      setMediaItems((prev) =>
        prev.map((m, i) =>
          i === index
            ? {
                ...m,
                assetId,
                variantId: ref.variantId,
                variantEnabled: true
              }
            : m
        )
      );
      if (displayUrl) {
        setDisplaySrcs((prev) => prev.map((s, i) => (i === index ? displayUrl : s)));
        setPreviewImageIndex(index);
        setPreviewImage(displayUrl);
      }

      if (displayUrl) {
        const dims = await new Promise<{ width: number; height: number }>((resolve) => {
          const img = new Image();
          img.onload = () =>
            resolve({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height });
          img.onerror = () => resolve({ width: 0, height: 0 });
          img.src = displayUrl;
        });
        if (dims.width > 0 && dims.height > 0) return dims;
      }
      return null;
    },
    [mediaItems, displaySrcs]
  );

  const applyAutoBackgroundRemoval = useCallback(
    async (
      index: number,
      onProgress?: (progress: AutoMaskProgress) => void,
      localInput?: { assetId: string; imageSrc: string }
    ): Promise<{ width: number; height: number } | null> => {
      const item = mediaItems[index];
      if (!item || item.kind !== 'image') throw new Error('Media missing');
      let displaySrc = localInput?.imageSrc || displaySrcs[index] || '';
      let assetId = localInput?.assetId || item.assetId;

      if (localInput) {
        // 剪贴板或文件恢复已经产生本地资产，可直接继续原请求。
      } else if (item.source?.kind === 'remote') {
        const local = await materializeRemoteAt(index);
        if (!local) throw new Error('REMOTE_IMAGE_ACCESS_BLOCKED');
        assetId = local.assetId;
        displaySrc = local.dataUrl;
      } else if (isMediaRefId(assetId)) {
        // 重制蒙版始终以原始资产为输入，不能把已经抠过的显示结果再次送入模型。
        displaySrc = (await loadAssetOriginal(assetId, item.kind)) || displaySrc;
      } else {
        if (/^https?:\/\//i.test(displaySrc)) {
          const response = await fetch(displaySrc, { mode: 'cors', credentials: 'omit' });
          if (!response.ok) throw new Error(`图片下载失败（${response.status}）`);
          const blob = await response.blob();
          if (!blob.type.startsWith('image/')) throw new Error('远程资源不是图片');
          displaySrc = await blobToDataUrl(blob);
        }
        assetId = await ensureAssetIdForKind(displaySrc, item.kind, assetId);
      }

      const { ref, variant } = await createAutoBackgroundRemovalSticker({
        assetId,
        imageSrc: displaySrc,
        onProgress
      });
      const displayUrl =
        (await resolveVariantDisplayUrl(variant.id, { rasterizeIfMissing: true })) || displaySrc;

      setMediaItems((prev) => prev.map((entry, i) => i === index ? {
        ...entry,
        assetId,
        source: { kind: 'local' as const },
        variantId: ref.variantId,
        variantEnabled: true
      } : entry));
      setDisplaySrcs((prev) => prev.map((src, i) => i === index ? displayUrl : src));
      setPreviewImageIndex(index);
      setPreviewImage(displayUrl);

      return new Promise((resolve) => {
        const image = new Image();
        image.onload = () => resolve({
          width: image.naturalWidth || image.width,
          height: image.naturalHeight || image.height
        });
        image.onerror = () => resolve(null);
        image.src = displayUrl;
      });
    },
    [mediaItems, displaySrcs, materializeRemoteAt]
  );

  const setImageVariantEnabled = useCallback(
    async (index: number, enabled: boolean) => {
      const item = mediaItems[index];
      if (!item || !isMediaRefId(item.assetId)) return;

      if (!enabled) {
        const original = await loadAssetOriginal(item.assetId, item.kind);
        setMediaItems((prev) =>
          prev.map((m, i) => (i === index ? { ...m, variantEnabled: false } : m))
        );
        if (original) {
          setDisplaySrcs((prev) => prev.map((s, i) => (i === index ? original : s)));
          if (previewImageIndex === index) setPreviewImage(original);
        }
        return;
      }

      setMediaItems((prev) =>
        prev.map((m, i) => (i === index ? { ...m, variantEnabled: true } : m))
      );
      if (!item.variantId) return;
      const url = await resolveVariantDisplayUrl(item.variantId, { rasterizeIfMissing: true });
      if (url) {
        setDisplaySrcs((prev) => prev.map((s, i) => (i === index ? url : s)));
        if (previewImageIndex === index) setPreviewImage(url);
      }
    },
    [mediaItems, previewImageIndex]
  );

  const loadOriginalImageSrc = useCallback(
    async (index: number): Promise<string | null> => {
      const item = mediaItems[index];
      if (!item) return null;
      if (isMediaRefId(item.assetId)) {
        const url = await loadAssetOriginal(item.assetId, item.kind);
        if (url) return url;
      }
      const fallback = displaySrcs[index];
      return isDisplayableImageSrc(fallback) ? fallback : null;
    },
    [mediaItems, displaySrcs]
  );

  /** 保存前：把未落盘的 data URL 写成资产，并同步 legacy */
  const persistMediaForSave = useCallback(async (): Promise<{
    media: NoteMediaItem[];
    images: string[];
    imageRefs: Note['imageRefs'];
    sketch?: string;
  }> => {
    const nextItems: NoteMediaItem[] = [];
    for (let i = 0; i < mediaItems.length; i++) {
      const m = mediaItems[i];
      const src = displaySrcs[i] || '';
      let assetId = m.assetId;
      if (m.source?.kind === 'remote') {
        nextItems.push(m);
        continue;
      }
      if (!isMediaRefId(assetId) && isDisplayableImageSrc(src)) {
        assetId = await ensureAssetIdForKind(src, m.kind, m.assetId);
      }
      if (!isMediaRefId(assetId)) continue;
      nextItems.push({ ...m, assetId });
    }
    const note = syncNoteLegacyFromMedia({
      ...(initialNote as Note),
      media: nextItems
    });
    return {
      media: nextItems,
      images: note.images,
      imageRefs: note.imageRefs,
      sketch: note.sketch
    };
  }, [mediaItems, displaySrcs, initialNote]);

  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    try {
      const files = Array.from(e.target.files) as File[];
      setIsProcessingImages(true);
      const base64Images = await Promise.all(files.map((file: File) => fileToBase64(file)));
      appendDisplayImages(base64Images);
      e.target.value = '';
    } catch (err) {
      console.error('Failed to convert image', err);
    } finally {
      setIsProcessingImages(false);
    }
  }, [appendDisplayImages]);

  const handlePaste = useCallback(
    async (e: { clipboardData: DataTransfer | null; preventDefault: () => void }) => {
      if (!e.clipboardData) return;
      const items = Array.from(e.clipboardData.items) as DataTransferItem[];
      const imageItems = items.filter((item) => item.type.startsWith('image/'));
      const textData = e.clipboardData.getData('text/plain');

      if (imageItems.length > 0) {
        e.preventDefault();
        setIsProcessingImages(true);
        try {
          if (textData && insertTextAtSelection) {
            insertTextAtSelection(textData);
          } else if (textData && textareaRef.current) {
            const start = textareaRef.current.selectionStart;
            const end = textareaRef.current.selectionEnd;
            const newText = text.substring(0, start) + textData + text.substring(end);
            setText(newText);
            setTimeout(() => {
              if (textareaRef.current) {
                textareaRef.current.selectionStart = textareaRef.current.selectionEnd =
                  start + textData.length;
              }
            }, 0);
          }
          const imageFiles = imageItems
            .map((item) => item.getAsFile())
            .filter((file) => file !== null) as File[];
          const base64Images = await Promise.all(imageFiles.map((file) => fileToBase64(file)));
          if (base64Images.length > 0) appendDisplayImages(base64Images);
        } catch (err) {
          console.error('Failed to process pasted content', err);
        } finally {
          setIsProcessingImages(false);
        }
      }
    },
    [setText, text, textareaRef, insertTextAtSelection, appendDisplayImages]
  );

  const handleDropImages = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      // Apple 的“长按主体抠图”常以 promised file / image item 传递，files 可能为空。
      const imageFiles = await extractDroppedImageFiles(e.dataTransfer);
      if (imageFiles.length === 0 || isProcessingImages) return;
      setIsProcessingImages(true);
      try {
        const base64Images = await Promise.all(imageFiles.map((file) => fileToBase64(file)));
        appendDisplayImages(base64Images);
      } catch (err) {
        console.error('Failed to convert dragged image', err);
      } finally {
        setIsProcessingImages(false);
      }
    },
    [isProcessingImages, appendDisplayImages]
  );

  return {
    mediaItems,
    displaySrcs,
    reorderMedia,
    removeMediaAt,
    images,
    setImages,
    imageRefs,
    setImageRefs,
    sketch,
    setSketch,
    appendSketch,
    appendDisplayImages,
    isProcessingImages,
    isResolvingMedia,
    handleImageUpload,
    handlePaste,
    handleDropImages,
    removeImage,
    removeSketch,
    applyLassoSticker,
    applyAutoBackgroundRemoval,
    setImageVariantEnabled,
    loadOriginalImageSrc,
    persistMediaForSave,
    materializeRemoteAt,
    replaceMediaWithLocalBlob,
    isVariantAppliedAt: (index: number) => isMediaItemCropActive(mediaItems[index]),
    previewImage,
    setPreviewImage,
    previewImageIndex,
    setPreviewImageIndex
  };
}
