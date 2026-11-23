import { useState, useRef, useCallback, useEffect } from 'react';
import type { Coordinates, Note, Project } from '../../types';
import { saveImage } from '../../utils/persistence/storage';
import { blobToDataUrl } from '../../utils/persistence/imageAssetStore';
import { convertHeicImageIfNeeded, readImageGpsMetadata } from '../../utils/media/imageFileProcessing';
import { fingerprintImageBlob, fingerprintStoredImage } from '../../utils/media/imageImportContent';
import { isNoteMapPlaced, unplacedMapCoordinates } from '../../utils/note/notePlacement';

export interface ImportPreview {
  file: File;
  originalFile?: File;
  imageUrl: string;
  lat: number | null;
  lng: number | null;
  error?: string;
  errorKind?: 'gps-missing' | 'gps-read' | 'image';
  saveError?: string;
  isDuplicate?: boolean;
  /** 用户主动不导入此照片；仍留在预览中方便重新加入。 */
  excluded?: boolean;
  imageFingerprint?: string;
  /** 投放目标决定建点时是否写入照片 EXIF 坐标。 */
  target?: ImageImportTargetKind;
  targetCoords?: Coordinates;
}

export type ImageImportTargetKind = 'map-exif' | 'map-drop' | 'unplaced';
export type ImageImportTarget =
  | { kind: 'map-exif' }
  | { kind: 'map-drop'; coords: Coordinates }
  | { kind: 'unplaced' };

export interface ImageImportResult {
  duplicateCount: number;
  unplacedCount: number;
}

interface UseImageImportProps {
  project: Project;
  notes: Note[];
  onUpdateProject: (project: Project) => void | Promise<void>;
  onNotesCreated?: (notes: Note[], target: ImageImportTargetKind, result: ImageImportResult) => void;
  mapInstance: any;
}

const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);
const canImport = (preview: ImportPreview) =>
  !preview.error &&
  !preview.isDuplicate &&
  !preview.excluded &&
  (preview.target === 'unplaced' || (preview.lat !== null && preview.lng !== null));
const imageMimeByExtension: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  gif: 'image/gif', avif: 'image/avif', tif: 'image/tiff', tiff: 'image/tiff'
};

export const useImageImport = (props: UseImageImportProps) => {
  const { project } = props;
  const latest = useRef(props);
  latest.current = props;
  const [importPreview, setImportPreview] = useState<ImportPreview[]>([]);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [isPreparingImport, setIsPreparingImport] = useState(false);
  const [isConfirmingImport, setIsConfirmingImport] = useState(false);
  const [importProgress, setImportProgress] = useState({ completed: 0, total: 0 });
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [hasImportError, setHasImportError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dataImportInputRef = useRef<HTMLInputElement>(null);
  const previewsRef = useRef<ImportPreview[]>([]);
  const generation = useRef(0);
  const preparing = useRef(false);
  const confirming = useRef(false);
  /** 外部/文件选择照片都不再停在预览窗口，准备完成后直接写入。 */
  const shouldAutoCommitRef = useRef(false);
  const commitImportRef = useRef<(() => Promise<void>) | null>(null);
  const urls = useRef(new Set<string>());
  // Retain only hashes, not decoded images / full data URLs. Assets are immutable.
  const storedHashes = useRef(new Map<string, string>());
  // Stable ids and asset refs survive a failed project write; retry never resaves a photo.
  const stagedNotes = useRef(new Map<ImportPreview, Note>());

  const releaseUrls = useCallback(() => {
    urls.current.forEach((url) => URL.revokeObjectURL(url));
    urls.current.clear();
  }, []);

  const closeImport = useCallback(() => {
    generation.current++;
    preparing.current = false;
    confirming.current = false;
    shouldAutoCommitRef.current = false;
    releaseUrls();
    stagedNotes.current.clear();
    previewsRef.current = [];
    setImportPreview([]);
    setIsPreparingImport(false);
    setIsConfirmingImport(false);
    setShowImportDialog(false);
    setImportMessage(null);
    setHasImportError(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [releaseUrls]);

  useEffect(() => {
    closeImport();
    storedHashes.current.clear();
    return () => {
      generation.current++;
      releaseUrls();
      stagedNotes.current.clear();
    };
  }, [project.id, closeImport, releaseUrls]);

  const handleImageImport = useCallback(async (
    files: FileList | File[] | null,
    options?: { target?: ImageImportTarget }
  ) => {
    if (!files?.length || confirming.current) return;
    // Snapshot before resetting the input, so selecting the same file triggers change again.
    const imageFiles = Array.from(files).filter((file) =>
      file.type.startsWith('image/') || /\.(heic|heif|jpe?g|png|webp|gif|avif|tiff?)$/i.test(file.name)
    );
    if (fileInputRef.current) fileInputRef.current.value = '';
    const run = ++generation.current;
    const target = options?.target ?? { kind: 'map-exif' as const };
    const projectId = latest.current.project.id;
    const isCurrent = () => generation.current === run && latest.current.project.id === projectId;
    releaseUrls();
    stagedNotes.current.clear();
    previewsRef.current = [];
    setImportPreview([]);
    setImportMessage(imageFiles.length ? null : '没有可导入的图片文件。');
    setHasImportError(false);
    setImportProgress({ completed: 0, total: imageFiles.length });
    preparing.current = true;
    shouldAutoCommitRef.current = true;
    setIsPreparingImport(true);

    try {
      const knownHashes = new Set<string>();
      const imageIds = new Set(latest.current.notes.flatMap((note) => [
        ...(note.images || []), ...(note.imageRefs || []).map((ref) => ref.assetId),
        ...(note.media || []).filter((item) => item.kind === 'image').map((item) => item.assetId)
      ]));
      let duplicateCheckIncomplete = !globalThis.crypto?.subtle;
      // Index existing assets once, rather than decoding every asset for every input photo.
      for (const id of imageIds) {
        if (!isCurrent()) return;
        try {
          const hash = storedHashes.current.get(id) ?? await fingerprintStoredImage(id);
          if (!isCurrent()) return;
          if (hash) {
            storedHashes.current.set(id, hash);
            knownHashes.add(hash);
          } else duplicateCheckIncomplete = true;
        } catch {
          duplicateCheckIncomplete = true;
        }
      }
      const previews: ImportPreview[] = [];
      for (const originalFile of imageFiles) {
        if (!isCurrent()) return;
        const preview: ImportPreview = {
          originalFile,
          file: originalFile,
          imageUrl: '',
          lat: target.kind === 'map-drop' ? target.coords.lat : null,
          lng: target.kind === 'map-drop' ? target.coords.lng : null,
          target: target.kind,
          targetCoords: target.kind === 'map-drop' ? target.coords : undefined
        };
        if (target.kind === 'map-exif') {
          try {
            const { lat, lng } = await readImageGpsMetadata(originalFile);
            preview.lat = lat;
            preview.lng = lng;
            if (lat === null || lng === null) {
              // 从地图拖入时，GPS 缺失不再是导入失败：直接进入待定位箱。
              preview.target = 'unplaced';
            }
          } catch (error) {
            // 没有 GPS 的有效图片由上面的 null 分支进入待定位箱；读取失败通常意味着
            // 文件本身损坏或格式不受支持，不能把一个无法展示的资源悄悄存入项目。
            preview.errorKind = 'gps-read';
            preview.error = `读取照片信息失败，未导入：${errorMessage(error)}`;
          }
        }
        if (!isCurrent()) return;
        try {
          // Read GPS first: conversion can strip the original EXIF metadata.
          preview.file = await convertHeicImageIfNeeded(originalFile);
          if (!preview.file.type.startsWith('image/')) {
            const mime = imageMimeByExtension[preview.file.name.split('.').pop()?.toLowerCase() ?? ''];
            if (mime) preview.file = new File([preview.file], preview.file.name, {
              type: mime, lastModified: preview.file.lastModified
            });
          }
          if (!isCurrent()) return;
          try {
            preview.imageFingerprint = await fingerprintImageBlob(preview.file) ?? undefined;
            if (!preview.imageFingerprint) duplicateCheckIncomplete = true;
          } catch {
            duplicateCheckIncomplete = true;
          }
          if (!isCurrent()) return;
          if (preview.imageFingerprint && !preview.error) {
            preview.isDuplicate = knownHashes.has(preview.imageFingerprint);
            knownHashes.add(preview.imageFingerprint);
          }
        } catch (error) {
          preview.errorKind = 'image';
          preview.error = `照片转换失败：${errorMessage(error)}`;
        }
        if (!isCurrent()) return;
        preview.imageUrl = URL.createObjectURL(preview.file);
        urls.current.add(preview.imageUrl);
        previews.push(preview);
        previewsRef.current = [...previews];
        setImportPreview([...previews]);
        setImportProgress({ completed: previews.length, total: imageFiles.length });
      }
      if (duplicateCheckIncomplete && isCurrent()) {
        setImportMessage('部分照片未完成重复检查，不会因此阻止导入。');
      }
    } catch (error) {
      if (isCurrent()) setImportMessage(`准备导入失败，请重新选择照片：${errorMessage(error)}`);
    } finally {
      if (isCurrent()) {
        preparing.current = false;
        setIsPreparingImport(false);
        if (shouldAutoCommitRef.current) {
          shouldAutoCommitRef.current = false;
          await commitImportRef.current?.();
        }
      }
    }
  }, [releaseUrls]);

  const handleConfirmImport = useCallback(async () => {
    if (confirming.current || preparing.current) return;
    const previews = previewsRef.current;
    const valid = previews.filter(canImport);
    const duplicateCount = previews.filter((preview) => preview.isDuplicate).length;
    if (!valid.length) {
      closeImport();
      if (duplicateCount) {
        latest.current.onNotesCreated?.([], previews[0]?.target ?? 'map-exif', {
          duplicateCount,
          unplacedCount: 0
        });
      }
      return;
    }
    const importTarget = valid[0].target ?? 'map-exif';
    confirming.current = true;
    setIsConfirmingImport(true);
    setImportMessage(null);
    setHasImportError(false);
    previews.forEach((preview) => { delete preview.saveError; });
    const run = generation.current;
    const projectId = latest.current.project.id;
    const isCurrent = () => generation.current === run && latest.current.project.id === projectId;
    let processing: ImportPreview | null = null;
    try {
      // Sequential asset writes keep only one full-size data URL alive at a time.
      for (const preview of valid) {
        if (!isCurrent()) return;
        processing = preview;
        if (stagedNotes.current.has(preview)) continue;
        const dataUrl = await blobToDataUrl(preview.file);
        if (!isCurrent()) return;
        const assetId = await saveImage(dataUrl);
        if (!isCurrent()) return;
        if (preview.imageFingerprint) storedHashes.current.set(assetId, preview.imageFingerprint);
        stagedNotes.current.set(preview, {
          id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
          coords: preview.target === 'unplaced'
            ? unplacedMapCoordinates()
            : { lat: preview.lat!, lng: preview.lng! },
          text: '', emoji: '📍', fontSize: 3,
          images: [assetId], imageRefs: [{ assetId }],
          media: [{ id: `mid-${assetId}`, kind: 'image', assetId }],
          tags: [], variant: 'image', createdAt: Date.now(),
          // 图片导入与是否带 EXIF 坐标无关：地图可直接定位，但 Board 一律先进入
          // 待定位箱，避免落在 Board 原点；unplacedOrder 决定叠放时的最新项。
          boardX: 0, boardY: 0, isInitialPosition: true,
          unplacedOrder: Date.now()
        });
      }
      processing = null;
      if (!isCurrent()) return;
      // Use the current project after IO, not the stale snapshot captured before reading files.
      const currentProject = latest.current.project;
      const existingIds = new Set(currentProject.notes.map((note) => note.id));
      const newNotes = valid.map((preview) => stagedNotes.current.get(preview)!)
        .filter((note) => !existingIds.has(note.id));
      await latest.current.onUpdateProject({ ...currentProject, notes: [...currentProject.notes, ...newNotes] });
      if (!isCurrent()) return;
      previews.filter((preview) => !preview.error).forEach((preview) => {
        URL.revokeObjectURL(preview.imageUrl);
        urls.current.delete(preview.imageUrl);
        stagedNotes.current.delete(preview);
      });
      if (newNotes[0] && isNoteMapPlaced(newNotes[0])) {
        try {
          const { lat, lng } = newNotes[0].coords;
          latest.current.mapInstance?.flyTo([lat, lng], 16, { duration: 1.5 });
        } catch (error) {
          // Map movement cannot turn a successful project write into a failed import.
          console.warn('Unable to focus imported point:', error);
        }
      }
      closeImport();
      // 单张照片仍可进入对应编辑器；批量导入只保留轻提示。
      const unplacedCount = newNotes.filter((note) => !isNoteMapPlaced(note)).length;
      const completedTarget = unplacedCount === newNotes.length
        ? 'unplaced'
        : importTarget;
      latest.current.onNotesCreated?.(newNotes, completedTarget, { duplicateCount, unplacedCount });
    } catch (error) {
      if (!isCurrent()) return;
      if (processing) processing.saveError = `保存失败，可重试：${errorMessage(error)}`;
      setImportPreview([...previewsRef.current]);
      setHasImportError(true);
      setImportMessage(`导入未完成，照片已保留，请重试。${errorMessage(error)}`);
    } finally {
      if (isCurrent()) {
        confirming.current = false;
        setIsConfirmingImport(false);
      }
    }
  }, [closeImport]);
  commitImportRef.current = handleConfirmImport;

  const handleCancelImport = useCallback(() => {
    if (!confirming.current) closeImport();
  }, [closeImport]);

  const handleRetryPreparation = useCallback(() => {
    if (preparing.current || confirming.current) return;
    return handleImageImport(
      previewsRef.current.map((preview) => preview.originalFile ?? preview.file),
      {
        target:
          previewsRef.current[0]?.target === 'map-drop' && previewsRef.current[0]?.targetCoords
            ? { kind: 'map-drop', coords: previewsRef.current[0].targetCoords }
            : previewsRef.current[0]?.target === 'unplaced'
              ? { kind: 'unplaced' }
              : { kind: 'map-exif' }
      }
    );
  }, [handleImageImport]);

  const updatePreview = useCallback((index: number, patch: Partial<ImportPreview>) => {
    const current = previewsRef.current[index];
    if (!current || preparing.current || confirming.current) return;
    const next = previewsRef.current.map((preview, previewIndex) =>
      previewIndex === index ? { ...preview, ...patch } : preview
    );
    previewsRef.current = next;
    setImportPreview(next);
  }, []);

  const handleTogglePreviewExcluded = useCallback((index: number) => {
    const preview = previewsRef.current[index];
    if (!preview || preview.error || preview.isDuplicate) return;
    updatePreview(index, { excluded: !preview.excluded });
  }, [updatePreview]);

  /**
   * 导入旧照片不需要浏览器定位权限。没有 EXIF 时，用户可先移动地图，
   * 再把照片明确放到当前地图中心。
   */
  const handlePlacePreviewAtMapCenter = useCallback((index: number) => {
    const preview = previewsRef.current[index];
    const center = latest.current.mapInstance?.getCenter?.();
    if (!preview || preview.errorKind !== 'gps-missing' || !center) return;
    const lat = Number(center.lat);
    const lng = Number(center.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    updatePreview(index, {
      lat,
      lng,
      error: undefined,
      errorKind: undefined,
      excluded: false
    });
  }, [updatePreview]);

  return {
    importPreview, showImportDialog, isPreparingImport, isConfirmingImport,
    importProgress, importMessage, hasImportError, fileInputRef, dataImportInputRef,
    handleImageImport, handleConfirmImport, handleCancelImport, handleRetryPreparation,
    handleTogglePreviewExcluded, handlePlacePreviewAtMapCenter
  };
};
