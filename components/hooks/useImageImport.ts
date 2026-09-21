import { useState, useRef, useCallback, useEffect } from 'react';
import type { Note, Project } from '../../types';
import { saveImage } from '../../utils/persistence/storage';
import { blobToDataUrl } from '../../utils/persistence/imageAssetStore';
import { convertHeicImageIfNeeded, readImageGpsMetadata } from '../../utils/media/imageFileProcessing';
import { fingerprintImageBlob, fingerprintStoredImage } from '../../utils/media/imageImportContent';
import {
  createGridAllocator, PLACEMENT_PADDING, PLACEMENT_GAP, PLACEMENT_GRID_CELL
} from '../../utils/board/boardPlacement';

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
  imageFingerprint?: string;
}

interface UseImageImportProps {
  project: Project;
  notes: Note[];
  onUpdateProject: (project: Project) => void | Promise<void>;
  onNotesCreated?: (notes: Note[]) => void;
  onImportDialogChange?: (isOpen: boolean) => void;
  mapInstance: any;
}

const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);
const canImport = (preview: ImportPreview) => !preview.error && !preview.isDuplicate &&
  preview.lat !== null && preview.lng !== null;
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
    latest.current.onImportDialogChange?.(false);
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

  const handleImageImport = useCallback(async (files: FileList | File[] | null) => {
    if (!files?.length || confirming.current) return;
    // Snapshot before resetting the input, so selecting the same file triggers change again.
    const imageFiles = Array.from(files).filter((file) =>
      file.type.startsWith('image/') || /\.(heic|heif|jpe?g|png|webp|gif|avif|tiff?)$/i.test(file.name)
    );
    if (fileInputRef.current) fileInputRef.current.value = '';
    const run = ++generation.current;
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
    setIsPreparingImport(true);
    setShowImportDialog(true);
    latest.current.onImportDialogChange?.(true);

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
          originalFile, file: originalFile, imageUrl: '', lat: null, lng: null
        };
        try {
          const { lat, lng } = await readImageGpsMetadata(originalFile);
          preview.lat = lat;
          preview.lng = lng;
          if (lat === null || lng === null) {
            preview.errorKind = 'gps-missing';
            preview.error = '照片文件中没有有效 GPS 坐标；这不是设备定位权限问题。';
          }
        } catch (error) {
          preview.errorKind = 'gps-read';
          preview.error = `读取照片 GPS 失败，可重试：${errorMessage(error)}`;
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
      }
    }
  }, [releaseUrls]);

  const handleConfirmImport = useCallback(async () => {
    if (confirming.current || preparing.current) return;
    const previews = previewsRef.current;
    const valid = previews.filter(canImport);
    if (!valid.length) return;
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
          coords: { lat: preview.lat!, lng: preview.lng! },
          text: '', emoji: '📍', fontSize: 3,
          images: [assetId], imageRefs: [{ assetId }],
          media: [{ id: `mid-${assetId}`, kind: 'image', assetId }],
          tags: [], variant: 'image', createdAt: Date.now(),
          boardX: 0, boardY: 0, isInitialPosition: true
        });
      }
      processing = null;
      if (!isCurrent()) return;
      // Use the current project after IO, not the stale snapshot captured before reading files.
      const currentProject = latest.current.project;
      const existingIds = new Set(currentProject.notes.map((note) => note.id));
      const allocator = createGridAllocator({
        existingNotes: currentProject.notes, padding: PLACEMENT_PADDING,
        gap: PLACEMENT_GAP, cellSize: PLACEMENT_GRID_CELL
      });
      const newNotes = valid.map((preview) => stagedNotes.current.get(preview)!)
        .filter((note) => !existingIds.has(note.id))
        .map((note) => {
          const { x, y } = allocator.findAndOccupy(256, 256, PLACEMENT_PADDING, PLACEMENT_PADDING);
          return { ...note, boardX: x, boardY: y };
        });
      await latest.current.onUpdateProject({ ...currentProject, notes: [...currentProject.notes, ...newNotes] });
      if (!isCurrent()) return;
      // Invalid photos stay visible; successful photos cannot be submitted a second time.
      const remaining = previews.filter((preview) => !!preview.error);
      previews.filter((preview) => !preview.error).forEach((preview) => {
        URL.revokeObjectURL(preview.imageUrl);
        urls.current.delete(preview.imageUrl);
        stagedNotes.current.delete(preview);
      });
      previewsRef.current = remaining;
      setImportPreview(remaining);
      if (newNotes[0]) {
        try {
          const { lat, lng } = newNotes[0].coords;
          latest.current.mapInstance?.flyTo([lat, lng], 16, { duration: 1.5 });
        } catch (error) {
          // Map movement cannot turn a successful project write into a failed import.
          console.warn('Unable to focus imported point:', error);
        }
      }
      if (remaining.length) {
        setImportMessage(`已导入 ${newNotes.length} 张照片；${remaining.length} 张仍未导入，请查看原因。`);
      } else {
        closeImport();
        // Only open an editor after the preview has closed and the project write succeeded.
        latest.current.onNotesCreated?.(newNotes);
      }
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

  const handleCancelImport = useCallback(() => {
    if (!confirming.current) closeImport();
  }, [closeImport]);

  const handleRetryPreparation = useCallback(() => {
    if (preparing.current || confirming.current) return;
    return handleImageImport(previewsRef.current.map((preview) => preview.originalFile ?? preview.file));
  }, [handleImageImport]);

  return {
    importPreview, showImportDialog, isPreparingImport, isConfirmingImport,
    importProgress, importMessage, hasImportError, fileInputRef, dataImportInputRef,
    handleImageImport, handleConfirmImport, handleCancelImport, handleRetryPreparation
  };
};
