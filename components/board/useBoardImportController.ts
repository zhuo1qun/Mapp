import { useCallback, useEffect, useRef, type ChangeEvent, type Dispatch, type DragEvent, type RefObject, type SetStateAction } from 'react';
import type { Note } from '../../types';
import { fileToBase64, generateId } from '../../utils';
import { saveImage, saveSketch, loadImage } from '../../utils/persistence/storage';
import { compressImageToBase64 } from '../../utils/board/board-utils';
import {
  PLACEMENT_GAP,
  PLACEMENT_GRID_CELL,
  PLACEMENT_PADDING,
  boardNoteDimensions,
  computeBoardBounds,
  createGridAllocator,
  fitBoardMediaDimensions
} from '../../utils/board/boardPlacement';
import { buildNewNotesFromProjectJsonRaws, parseProjectJsonNotesPayloadResult } from '../../utils/import/projectDataImport';
import { formatImportErrorMessage, formatUnexpectedImportError } from '../../utils/import/importErrorFormat';
import { clientPoint, clientToBoardPoint } from '../../utils/board/boardCoordinates';
import { isNoteBoardPlaced } from '../../utils/note/notePlacement';
import { enrichLinkPreview, fallbackLinkPreview, isEditablePasteTarget, parseClipboardData } from '../../utils/clipboard/parseClipboard';
import { generateNoteMediaItemId } from '../../utils/persistence/noteMediaSync';
import { extractDroppedImageFiles } from '../../utils/media/dataTransferImages';
import { isFileDragTypes } from '../../utils/ui/fileDrag';

type BoardTransform = { x: number; y: number; scale: number };

interface UseBoardImportControllerProps {
  notes: Note[];
  transform: BoardTransform;
  containerRef: RefObject<HTMLDivElement>;
  editingNote: Note | null;
  setEditingNote: Dispatch<SetStateAction<Note | null>>;
  onUpdateNote: (note: Note) => void;
  onAddNote: (note: Note) => void;
  onCsvImport: (file: File) => void | Promise<void>;
}

function imageRefLooksLikeImageId(imageRef: string): boolean {
  return imageRef.startsWith('img-');
}

function loadImageElementDimensions(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth || image.width, height: image.naturalHeight || image.height });
    image.onerror = (event) => reject(event);
    image.src = src;
  });
}

async function detectImageDimensionsFromRefs(imageRefs: string[]): Promise<{ width: number; height: number } | null> {
  for (const imageRef of imageRefs) {
    if (!imageRef) continue;
    let src = imageRef;
    if (imageRefLooksLikeImageId(imageRef)) {
      try {
        src = await loadImage(imageRef);
      } catch (error) {
        console.warn('Failed to load imported image for dimensions:', error);
        continue;
      }
    }
    try {
      const dimensions = await loadImageElementDimensions(src);
      if (dimensions.width > 0 && dimensions.height > 0) return dimensions;
    } catch (error) {
      console.warn('Failed to detect imported image dimensions:', error);
    }
  }
  return null;
}

const isImageFile = (file: File) =>
  file.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp|tiff?|heic|heif)$/i.test(file.name);

/** All Board-specific file ingress paths: picker, external drop and pending tray. */
export function useBoardImportController({
  notes,
  transform,
  containerRef,
  editingNote,
  setEditingNote,
  onUpdateNote,
  onAddNote,
  onCsvImport
}: UseBoardImportControllerProps) {
  const imageFileInputRef = useRef<HTMLInputElement | null>(null);
  const lastPointerClientRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const rememberPointer = (event: PointerEvent) => {
      lastPointerClientRef.current = { x: event.clientX, y: event.clientY };
    };
    root.addEventListener('pointermove', rememberPointer, { passive: true });
    return () => root.removeEventListener('pointermove', rememberPointer);
  }, [containerRef]);

  const clipboardAnchor = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const client = lastPointerClientRef.current ?? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    return clientToBoardPoint(clientPoint(client.x, client.y), rect, transform);
  }, [containerRef, transform]);

  const createImageNote = useCallback((
    base64: string,
    imageWidth: number,
    imageHeight: number,
    position?: { x: number; y: number },
    target: 'board' | 'unplaced' = 'board'
  ) => {
    if (!containerRef.current && target === 'board') return;
    const { width = 0, height = 0 } = containerRef.current?.getBoundingClientRect() ?? {};
    const centerX = position ? position.x : (width / 2 - transform.x) / transform.scale;
    const centerY = position ? position.y : (height / 2 - transform.y) / transform.scale;
    const dimensions = fitBoardMediaDimensions(imageWidth, imageHeight);
    const note: Note = {
      id: generateId(),
      createdAt: Date.now(),
      coords: { lat: 0, lng: 0 },
      emoji: '',
      text: '',
      fontSize: 3,
      images: [base64],
      tags: [],
      boardX: target === 'unplaced' ? 0 : centerX - dimensions.width / 2,
      boardY: target === 'unplaced' ? 0 : centerY - dimensions.height / 2,
      isInitialPosition: target === 'unplaced',
      ...(target === 'unplaced' ? { unplacedOrder: Date.now() } : null),
      variant: 'image',
      color: 'transparent',
      imageWidth: dimensions.width,
      imageHeight: dimensions.height
    };
    onAddNote(note);
  }, [containerRef, onAddNote, transform]);

  const createRemoteImageNote = useCallback(async (url: string, position: { x: number; y: number }) => {
    let raw = { width: 320, height: 240 };
    try { raw = await loadImageElementDimensions(url); } catch { /* remote host may refuse hotlinking */ }
    const dimensions = fitBoardMediaDimensions(raw.width, raw.height);
    const source = { kind: 'remote' as const, url, cacheStatus: 'none' as const, thumbnailUrl: url };
    onAddNote({
      id: generateId(), createdAt: Date.now(), coords: { lat: 0, lng: 0 }, emoji: '', text: '', fontSize: 3,
      images: [url], imageRefs: [{ assetId: url, source }],
      media: [{ id: generateNoteMediaItemId(), kind: 'image', assetId: url, source }], tags: [],
      boardX: position.x - dimensions.width / 2, boardY: position.y - dimensions.height / 2,
      variant: 'image', color: 'transparent', imageWidth: dimensions.width, imageHeight: dimensions.height
    });
  }, [onAddNote]);

  const createTextNote = useCallback((text: string, position: { x: number; y: number }, link?: { url: string; label?: string }) => {
    const note: Note = {
      id: generateId(), createdAt: Date.now(), coords: { lat: 0, lng: 0 }, emoji: link ? '🔗' : '',
      text: link ? `${link.label ? `${link.label}\n` : ''}${link.url}` : text,
      linkPreview: link ? fallbackLinkPreview(link.url, link.label) : undefined,
      fontSize: 3, images: [], tags: [], boardX: position.x - 128, boardY: position.y - 128,
      variant: 'standard', color: '#FFFDF5'
    };
    onAddNote(note);
    if (link) {
      void enrichLinkPreview(link.url, link.label).then((linkPreview) => {
        onUpdateNote({ ...note, linkPreview });
      });
    }
  }, [onAddNote, onUpdateNote]);

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      if (!event.clipboardData || isEditablePasteTarget(event.target) || editingNote) return;
      const parsed = parseClipboardData(event.clipboardData);
      if (!parsed) return;
      event.preventDefault();
      const anchor = clipboardAnchor();
      if (parsed.kind === 'text') return void createTextNote(parsed.text, anchor);
      if (parsed.kind === 'link') return void createTextNote(parsed.url, anchor, parsed);
      if (parsed.kind === 'remote-images') {
        parsed.urls.forEach((url, index) => void createRemoteImageNote(url, { x: anchor.x + index * 28, y: anchor.y + index * 28 }));
        return;
      }
      void (async () => {
        try {
          for (const [index, file] of parsed.files.entries()) {
            const image = await compressImageToBase64(file, 512);
            createImageNote(image.base64, image.width, image.height, { x: anchor.x + index * 28, y: anchor.y + index * 28 });
          }
        } catch (error) { console.error('Failed to paste images onto board', error); }
      })();
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [clipboardAnchor, createImageNote, createRemoteImageNote, createTextNote, editingNote]);

  const handleDataImport = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const parsed = parseProjectJsonNotesPayloadResult(text);
      if (parsed.ok === false) {
        alert(formatImportErrorMessage(parsed.error, file.name));
        return;
      }
      const importedNotes = buildNewNotesFromProjectJsonRaws(parsed.rawNotes, notes);
      if (importedNotes.length === 0) {
        alert(formatImportErrorMessage({ title: '没有可导入的新便签', location: 'project.notes', detail: '可能全部重复或文件为空' }, file.name));
        return;
      }
      const placedNotes = notes.filter(isNoteBoardPlaced);
      const bounds = computeBoardBounds(placedNotes);
      const allocator = createGridAllocator({
        existingNotes: placedNotes,
        padding: PLACEMENT_PADDING,
        gap: PLACEMENT_GAP,
        cellSize: PLACEMENT_GRID_CELL
      });
      const anchorX = bounds ? bounds.maxX + PLACEMENT_GAP : PLACEMENT_PADDING;
      const anchorY = bounds ? bounds.minY : PLACEMENT_PADDING;
      const importBatchGroupId = importedNotes.length > 1 ? generateId() : undefined;
      const newNotes = await Promise.all(importedNotes.map(async (note) => {
        const processed: Note = { ...note };
        if (note.images?.length) {
          processed.images = await Promise.all(note.images.map(async (imageData) => {
            if (imageData.startsWith('img-')) return imageData;
            try { return await saveImage(imageData); }
            catch (error) { console.error('Failed to save imported image:', error); return imageData; }
          }));
        }
        if (note.sketch && !note.sketch.startsWith('img-')) {
          try { processed.sketch = await saveSketch(note.sketch); }
          catch (error) { console.error('Failed to save imported sketch:', error); }
        }
        if (processed.images?.length || processed.variant === 'image') {
          processed.variant = 'image';
          const hasDimensions = Number.isFinite(processed.imageWidth) && (processed.imageWidth ?? 0) > 0 &&
            Number.isFinite(processed.imageHeight) && (processed.imageHeight ?? 0) > 0;
          if (!hasDimensions) {
            const detected = await detectImageDimensionsFromRefs(processed.images ?? []);
            const dimensions = fitBoardMediaDimensions(detected?.width ?? 256, detected?.height ?? 256);
            processed.imageWidth = dimensions.width;
            processed.imageHeight = dimensions.height;
          }
          processed.color = 'transparent';
        }
        const dimensions = boardNoteDimensions(processed);
        const placement = allocator.findAndOccupy(dimensions.width, dimensions.height, anchorX, anchorY);
        processed.boardX = placement.x;
        processed.boardY = placement.y;
        if (importBatchGroupId) processed.noteGroupId = importBatchGroupId;
        return processed;
      }));
      newNotes.forEach(onAddNote);
      const duplicateCount = parsed.rawNotes.length - importedNotes.length;
      alert(duplicateCount > 0
        ? `已导入 ${importedNotes.length} 条便签，跳过 ${duplicateCount} 条（重复等）。`
        : `已成功导入 ${importedNotes.length} 条便签。`);
    } catch (error) {
      console.error('Failed to import data:', error);
      alert(formatUnexpectedImportError(error, file.name));
    }
  }, [notes, onAddNote]);

  const appendImagesToEditingNote = useCallback(async (files: File[]) => {
    if (!editingNote || editingNote.variant === 'image') return;
    try {
      const images = await Promise.all(files.map((file) => fileToBase64(file)));
      const updated = { ...editingNote, images: [...(editingNote.images ?? []), ...images] };
      onUpdateNote(updated);
      setEditingNote(updated);
    } catch (error) {
      console.error('Failed to add images to note:', error);
    }
  }, [editingNote, onUpdateNote, setEditingNote]);

  const handleDrop = useCallback(async (event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const files = Array.from(event.dataTransfer.files ?? []);
    const imageFiles = await extractDroppedImageFiles(event.dataTransfer);
    if (!files.length && !imageFiles.length) return;
    const dataFile = files.find((file) => file.type === 'application/json' || file.name.toLowerCase().endsWith('.json'));
    const csvFile = files.find((file) => file.type === 'text/csv' || file.name.toLowerCase().endsWith('.csv'));
    if (imageFiles.length && !editingNote) {
      try {
        const rect = containerRef.current?.getBoundingClientRect();
        const point = rect ? clientToBoardPoint(clientPoint(event.clientX, event.clientY), rect, transform) : undefined;
        for (const [index, file] of imageFiles.entries()) {
          const image = await compressImageToBase64(file, 512);
          const offset = index * 28;
          createImageNote(image.base64, image.width, image.height, point && { x: point.x + offset, y: point.y + offset });
        }
      } catch (error) { console.error('Failed to add image note:', error); }
      return;
    }
    if (imageFiles.length) return void appendImagesToEditingNote(imageFiles);
    if (dataFile) return void handleDataImport(dataFile);
    if (csvFile) void onCsvImport(csvFile);
  }, [appendImagesToEditingNote, containerRef, createImageNote, editingNote, handleDataImport, onCsvImport, transform]);

  const handleUnplacedBoardFiles = useCallback(async (files: FileList | File[]) => {
    const items = Array.from(files);
    const imageFiles = items.filter(isImageFile);
    if (imageFiles.length) {
      try {
        for (const file of imageFiles) {
          const image = await compressImageToBase64(file, 512);
          createImageNote(image.base64, image.width, image.height, undefined, 'unplaced');
        }
      } catch (error) { console.error('Failed to add image note to unplaced tray:', error); }
      return;
    }
    const dataFile = items.find((file) => file.type === 'application/json' || file.name.toLowerCase().endsWith('.json'));
    const csvFile = items.find((file) => file.type === 'text/csv' || file.name.toLowerCase().endsWith('.csv'));
    if (dataFile) void handleDataImport(dataFile);
    else if (csvFile) void onCsvImport(csvFile);
  }, [createImageNote, handleDataImport, onCsvImport]);

  const handleImageInputChange = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const image = await compressImageToBase64(file, 512);
      createImageNote(image.base64, image.width, image.height);
    } catch (error) { console.error('Failed to add image note:', error); }
    finally { event.target.value = ''; }
  }, [createImageNote]);

  const handleDragEnter = useCallback((event: DragEvent) => {
    if (!isFileDragTypes(event.dataTransfer.types)) return;
    event.preventDefault();
    event.stopPropagation();
  }, []);
  const handleDragOver = useCallback((event: DragEvent) => {
    if (!isFileDragTypes(event.dataTransfer.types)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
  }, []);

  return {
    imageFileInputRef,
    handleDataImport,
    handleDragEnter,
    handleDragOver,
    handleDrop,
    handleUnplacedBoardFiles,
    handleImageInputChange,
    handleAddImageClick: () => imageFileInputRef.current?.click()
  };
}
