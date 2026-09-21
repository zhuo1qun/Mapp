import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Note, Tag } from '../types';
import { THEME_COLOR } from '../constants';
import { generateId, parseNoteContent } from '../utils';
import { buildEditorModel, fromEditorModel } from '../utils/note/editorModel';
import { isNoteContentEmpty, submitNoteDraft, type NoteDraftOutcome } from '../utils/note/draftLifecycle';
import { DrawingCanvas } from './DrawingCanvas';
import { CameraCaptureDialog } from './map/overlays/CameraCaptureDialog';
import { useTiptapEditor } from './hooks/useTiptapEditor';
import { useNoteState } from './hooks/useNoteState';
import { useMediaHandler } from './hooks/useMediaHandler';
import { NoteHeader } from './note-editor/NoteHeader';
import { MediaDetailWindow } from './note-editor/MediaDetailWindow';
import { ContentSection } from './note-editor/ContentSection';
import { PropertySection } from './note-editor/PropertySection';
import { MediaSection } from './note-editor/MediaSection';
import { MetadataSection } from './note-editor/MetadataSection';
import { Camera, Image as ImageIcon, PenTool, Minus, Smile } from 'lucide-react';
import { blobToDataUrl } from '../utils/persistence/imageAssetStore';
import { EmojiPicker } from './note-editor/EmojiPicker';
import {
  NOTE_EDITOR_ADD_PILL_ACTIVE,
  NOTE_EDITOR_ADD_PILL_CLASS,
  NOTE_EDITOR_ADD_PILL_IDLE,
  NoteEditorAddPillLabel
} from './note-editor/addPillStyles';
import { DeleteConfirmDialog } from './ui/DeleteConfirmDialog';
import {
  DEFAULT_MAP_UI_CHROME_BLUR_PX,
  DEFAULT_MAP_UI_CHROME_OPACITY,
  mapChromeContentStyle,
  type MapChromeAppearance
} from '../utils/map/mapChromeStyle';
import {
  hasNavigableGpsCoords
} from '../utils/map/openExternalNavigation';
import { ExternalNavigationSheet } from './map/overlays/ExternalNavigationSheet';
import { ChromePresence } from './ui/ChromeSheetPresence';
import { CHROME_DIALOG_SURFACE_SHELL_CLASS } from './ui/ChromeDialogSurface';
import { useChromeAppearance } from './ui/chromeAppearanceContext';
import { fitBoardMediaDimensions } from '../utils/board/boardPlacement';

interface NoteEditorProps {
  initialNote?: Partial<Note>;
  isOpen: boolean;
  onClose: () => void;
  /** 保存成功后的关闭路径；可与取消草稿的关闭过渡不同。 */
  onSaveClose?: () => void;
  /** 供记录切换等场景先提交当前草稿、但不关闭编辑器。 */
  saveDraftRef?: React.MutableRefObject<(() => Promise<NoteDraftOutcome>) | null>;
  onSave: (note: Partial<Note>) => void | Promise<void>;
  /** 调用方尚未把这条便签写入项目数据。 */
  isNewNote?: boolean;
  onDelete?: (noteId: string) => void | Promise<void>;
  onSwitchToMapView?: (coords?: { lat: number; lng: number }) => void;
  onSwitchToBoardView?: (coords?: { x: number; y: number }, mapInstance?: any) => void;
  /** Graph 项目：关闭编辑器并在图谱中聚焦该便签 */
  onSwitchToGraphView?: (noteId: string) => void;
  themeColor?: string;
  /** 编辑器自行使用这组全局「界面外观」参数生成表面，不依赖调用方传入样式对象。 */
  mapUiChromeOpacity?: number;
  mapUiChromeBlurPx?: number;
  /** 深色玻璃面板；不传则跟随主题设置的暗色模式（卫星底图在 Mapping 页强制暗色）。 */
  chromeAppearance?: MapChromeAppearance;
  /** 视口坐标中的点位锚点；存在时编辑器像从该点位展开、收回。 */
  animationAnchor?: { x: number; y: number };
  /** 宽屏 Table 可把编辑器作为画布节点并列摆放，而不是覆盖整个工作区。 */
  presentation?: 'modal' | 'canvas-window';
  /** 宽屏 Table 用它同步媒体详情窗口与横向导航的位置。 */
  onCanvasMediaDetailOpenChange?: (open: boolean) => void;
  /** 为 false 时只渲染内容，由地图便签槽提供 ChromeWindow。 */
  shell?: boolean;
  /**
   * 打开编辑器时自动进入拍照取景（对标涂鸦 overlay）。
   * 用于「拍照新建点位」：先落临时图钉再开编辑器拍照挂媒体。
   */
  autoOpenCamera?: boolean;
}

export const NoteEditor: React.FC<NoteEditorProps> = ({
  initialNote,
  isOpen,
  onClose,
  onSaveClose,
  saveDraftRef,
  onSave,
  isNewNote = false,
  onDelete,
  onSwitchToMapView,
  onSwitchToBoardView,
  onSwitchToGraphView,
  themeColor = THEME_COLOR,
  mapUiChromeOpacity = DEFAULT_MAP_UI_CHROME_OPACITY,
  mapUiChromeBlurPx = DEFAULT_MAP_UI_CHROME_BLUR_PX,
  chromeAppearance: chromeAppearanceProp,
  animationAnchor,
  presentation = 'modal',
  onCanvasMediaDetailOpenChange,
  shell = true,
  autoOpenCamera = false
}) => {
  const chromeAppearance = useChromeAppearance(chromeAppearanceProp);
  const isCanvasWindow = presentation === 'canvas-window';
  // 关闭时父级可能已清掉选中便签，须保留打开瞬间的锚点以完成回收动画。
  const [activeAnimationAnchor, setActiveAnimationAnchor] = useState<{ x: number; y: number } | null>(null);
  // 打开首帧直接取调用方的锚点，避免先播放一帧通用对话框渐显动画。
  const motionAnchor = animationAnchor ?? activeAnimationAnchor;
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  // 编辑器是材质的唯一所有者：窗口及其内部的二级浮层均由相同参数生成。
  // 不再依赖各视图拼出 panelChromeStyle，避免其中一个入口漏传后退回默认白底。
  const editorChromeStyle = useMemo(
    () =>
      mapChromeContentStyle(
        mapUiChromeOpacity,
        mapUiChromeBlurPx,
        chromeAppearance
      ),
    [chromeAppearance, mapUiChromeBlurPx, mapUiChromeOpacity]
  );
  useEffect(() => {
    if (isOpen && animationAnchor) setActiveAnimationAnchor(animationAnchor);
  }, [animationAnchor?.x, animationAnchor?.y, isOpen]);
  const [deleteConfirming, setDeleteConfirming] = useState(false);
  const [navSheetOpen, setNavSheetOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const richPasteHandlerRef = useRef<(event: ClipboardEvent) => void>(() => {});

  const [startYear, setStartYear] = useState<number | undefined>(initialNote?.startYear);
  const [endYear, setEndYear] = useState<number | undefined>(initialNote?.endYear);
  const dismissTimeRangePanelRef = useRef<() => void>(() => {});

  const {
    isCompactMode,
    noteState,
    setEmoji,
    setText,
    setIsFavorite,
    setTags,
    setIsAddingTag,
    setEditingTagId,
    setNewTagLabel,
    setNewTagColor
  } = useNoteState({ initialNote, isOpen });

  const {
    emoji,
    text,
    isFavorite,
    tags,
    isPreviewMode,
    isAddingTag,
    editingTagId,
    newTagLabel,
    newTagColor
  } = noteState;

  useEffect(() => {
    if (!isOpen) return;
    setStartYear(initialNote?.startYear);
    setEndYear(initialNote?.endYear);
  }, [initialNote?.id, isOpen]);

  const { editor } = useTiptapEditor({
    noteId: initialNote?.id,
    content: text,
    onMarkdownChange: setText,
    onImagePaste: (event) => richPasteHandlerRef.current(event)
  });

  const insertTextAtEditorSelection = useCallback(
    (value: string) => {
      if (!value || !editor) return;
      const { from, to } = editor.state.selection;
      editor.view.dispatch(editor.state.tr.insertText(value, from, to).scrollIntoView());
      editor.commands.focus();
    },
    [editor]
  );

  const color = '#FFFFFF';

  const {
    mediaItems,
    displaySrcs,
    reorderMedia,
    removeMediaAt,
    images,
    setImages,
    imageRefs,
    sketch,
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
    setLassoStickerEnabled,
    loadOriginalImageSrc,
    persistMediaForSave,
    isCropActiveAt,
    previewImage,
    setPreviewImage,
    previewImageIndex,
    setPreviewImageIndex
  } = useMediaHandler({
    initialNote,
    isOpen,
    text,
    setText,
    textareaRef,
    insertTextAtSelection: insertTextAtEditorSelection
  });
  richPasteHandlerRef.current = handlePaste;

  const [isSketching, setIsSketching] = useState(false);
  const [isCapturingPhoto, setIsCapturingPhoto] = useState(false);
  const mediaOverlayActive = isSketching || isCapturingPhoto;
  const autoCameraConsumedRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      setIsSketching(false);
      setIsCapturingPhoto(false);
      autoCameraConsumedRef.current = false;
      return;
    }
    // 拍照新建：编辑器打开后只自动进入一次取景，关掉后不反复弹出
    if (autoOpenCamera && !autoCameraConsumedRef.current) {
      autoCameraConsumedRef.current = true;
      setIsSketching(false);
      setIsCapturingPhoto(true);
    }
  }, [isOpen, autoOpenCamera]);

  const [lassoIndex, setLassoIndex] = useState<number | null>(null);
  const [lassoSourceSrc, setLassoSourceSrc] = useState<string | null>(null);
  const [cropBusy, setCropBusy] = useState(false);
  const [stickerSize, setStickerSize] = useState<{ width: number; height: number } | null>(null);
  const mediaDetailOpen =
    isOpen &&
    ((!!previewImage && displaySrcs.length > 0) || (lassoIndex != null && !!lassoSourceSrc));
  const canvasMediaDetailOpen = isCanvasWindow && mediaDetailOpen;

  useEffect(() => {
    onCanvasMediaDetailOpenChange?.(canvasMediaDetailOpen);
  }, [canvasMediaDetailOpen, onCanvasMediaDetailOpenChange]);

  useEffect(
    () => () => onCanvasMediaDetailOpenChange?.(false),
    [onCanvasMediaDetailOpenChange]
  );

  const updateCursorPosition = useCallback(() => {
    if (!textareaRef.current) return;
  }, []);

  const emojiAnchorRef = useRef<HTMLButtonElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const dismissOverlays = useCallback(() => {
    setShowEmojiPicker(false);
    dismissTimeRangePanelRef.current();
  }, []);

  const dismissOverlaysExceptTime = useCallback(() => {
    setShowEmojiPicker(false);
    setIsAddingTag(false);
    setEditingTagId(null);
    setNewTagLabel('');
  }, [setIsAddingTag, setEditingTagId, setNewTagLabel]);

  const registerTimeRangeDismiss = useCallback((fn: () => void) => {
    dismissTimeRangePanelRef.current = fn;
  }, []);

  const openEmojiPicker = useCallback(() => {
    setIsAddingTag(false);
    setEditingTagId(null);
    setNewTagLabel('');
    dismissTimeRangePanelRef.current();
    setShowEmojiPicker((open) => !open);
  }, [setIsAddingTag, setEditingTagId, setNewTagLabel]);

  const handleSaveTag = () => {
    if (newTagLabel.trim()) {
      if (editingTagId) {
        setTags(tags.map((t) => (t.id === editingTagId ? { ...t, label: newTagLabel.trim(), color: newTagColor } : t)));
        setEditingTagId(null);
      } else {
        const newTag: Tag = {
          id: generateId(),
          label: newTagLabel.trim(),
          color: newTagColor
        };
        setTags([...tags, newTag]);
      }
      setNewTagLabel('');
      setIsAddingTag(false);
    } else {
      setNewTagLabel('');
      setIsAddingTag(false);
      setEditingTagId(null);
    }
  };

  const handleEditTag = (tag: Tag) => {
    setEditingTagId(tag.id);
    setNewTagLabel(tag.label);
    setNewTagColor(tag.color);
    setIsAddingTag(false);
  };

  const handleCancelTagEdit = () => {
    setNewTagLabel('');
    setIsAddingTag(false);
    setEditingTagId(null);
  };

  const removeTag = (id: string) => {
    setTags(tags.filter((t) => t.id !== id));
  };

  const displayTitle = useMemo(() => parseNoteContent(text || '').title || undefined, [text]);

  const getCurrentNoteData = (persisted?: {
    media: import('../types').NoteMediaItem[];
    images: string[];
    imageRefs: import('../types').NoteImageRef[] | undefined;
    sketch?: string;
  }): Partial<Note> => {
    const media = persisted?.media;
    const persistImages =
      persisted?.images ||
      (imageRefs.length > 0 && imageRefs.every((r) => r.assetId && r.assetId.startsWith('img-'))
        ? imageRefs.map((r) => r.assetId)
        : images || []);
    const persistRefs =
      persisted?.imageRefs || imageRefs.filter((r) => r.assetId && r.assetId.startsWith('img-'));
    const persistSketch =
      persisted?.sketch !== undefined
        ? persisted.sketch
        : sketch && sketch.startsWith('img-')
          ? sketch
          : sketch === ''
            ? undefined
            : sketch;

    const model = buildEditorModel({
      text,
      emoji: isCompactMode ? '' : emoji,
      tags: isCompactMode ? [] : tags,
      startYear,
      endYear,
      images: persistImages,
      imageRefs: persistRefs,
      sketch: persistSketch,
      id: initialNote?.id,
      createdAt: initialNote?.createdAt
    });

    const first = media?.[0];
    const firstCrop =
      first?.variantId && first.variantEnabled !== false
        ? true
        : imageRefs[0]?.variantId && imageRefs[0].variantEnabled !== false;

    // 首项裁剪只影响 Board 贴纸呈现；variant 保持 standard，以保留 mapping 点位
    return fromEditorModel(model, {
      coords: initialNote?.coords,
      boardX: initialNote?.boardX,
      boardY: initialNote?.boardY,
      groupId: initialNote?.groupId,
      groupName: initialNote?.groupName,
      groupIds: initialNote?.groupIds,
      groupNames: initialNote?.groupNames,
      variant: firstCrop ? 'standard' : initialNote?.variant || 'standard',
      imageWidth: stickerSize?.width ?? initialNote?.imageWidth,
      imageHeight: stickerSize?.height ?? initialNote?.imageHeight,
      noteGroupId: initialNote?.noteGroupId,
      isFavorite,
      imageRefs: persistRefs,
      sketch: persistSketch,
      media,
      fontSize: 3,
      isBold: false,
      color: '#FFFFFF'
    });
  };

  const isDiscardableDraft = isNoteContentEmpty({
    text,
    emoji,
    tags,
    startYear,
    endYear,
    images,
    imageRefs,
    sketch,
    media: mediaItems,
  }, isCompactMode);

  const handleSave = async (closeAfterSave = true): Promise<NoteDraftOutcome> => {
    const persisted = await persistMediaForSave();
    const noteData = getCurrentNoteData(persisted);

    if (!noteData.images) {
      noteData.images = persisted.images || images || [];
    }
    if (!noteData.media) noteData.media = persisted.media;

    const outcome = await submitNoteDraft(noteData, { isNewNote, onSave, onDelete });

    if (closeAfterSave) {
      if (outcome === 'discarded') onClose();
      else setTimeout(() => { (onSaveClose ?? onClose)(); }, 0);
    }
    return outcome;
  };

  if (saveDraftRef) saveDraftRef.current = () => handleSave(false);

  useEffect(
    () => () => {
      if (saveDraftRef) saveDraftRef.current = null;
    },
    [saveDraftRef]
  );

  const deleteTitleHint = useMemo(
    () => parseNoteContent(initialNote?.text || '').title || '无标题',
    [initialNote?.id, initialNote?.text]
  );

  const openDeleteConfirm = () => {
    dismissOverlays();
    setDeleteConfirmOpen(true);
  };

  const executeDeleteNote = async () => {
    if (!initialNote?.id || !onDelete) return;
    setDeleteConfirming(true);
    try {
      await Promise.resolve(onDelete(initialNote.id));
      setDeleteConfirmOpen(false);
      onClose();
    } finally {
      setDeleteConfirming(false);
    }
  };

  useEffect(() => {
    if (!isOpen) {
      setDeleteConfirmOpen(false);
      setDeleteConfirming(false);
      setLassoIndex(null);
      setLassoSourceSrc(null);
      setCropBusy(false);
      setStickerSize(null);
    }
  }, [isOpen]);

  const startLassoForIndex = useCallback(
    async (index: number) => {
      setCropBusy(true);
      try {
        const src = await loadOriginalImageSrc(index);
        if (!src) return;
        setLassoSourceSrc(src);
        setLassoIndex(index);
      } finally {
        setCropBusy(false);
      }
    },
    [loadOriginalImageSrc]
  );

  const handleCropEnabledChange = useCallback(
    async (enabled: boolean) => {
      const index = previewImageIndex;
      const item = mediaItems[index];
      const hasCropData = !!item?.variantId;

      if (enabled) {
        if (hasCropData) {
          setCropBusy(true);
          try {
            await setLassoStickerEnabled(index, true);
          } finally {
            setCropBusy(false);
          }
          return;
        }
        await startLassoForIndex(index);
        return;
      }

      setCropBusy(true);
      try {
        await setLassoStickerEnabled(index, false);
        setStickerSize(null);
      } finally {
        setCropBusy(false);
      }
    },
    [previewImageIndex, mediaItems, startLassoForIndex, setLassoStickerEnabled]
  );

  const emojiTrailingSlot = !isCompactMode ? (
    <div className="relative group">
      <button
        ref={emojiAnchorRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          openEmojiPicker();
        }}
        className={`${NOTE_EDITOR_ADD_PILL_CLASS} ${
          showEmojiPicker || emoji ? NOTE_EDITOR_ADD_PILL_ACTIVE : NOTE_EDITOR_ADD_PILL_IDLE
        }`}
        title={emoji ? '更换表情' : '添加表情'}
        aria-expanded={showEmojiPicker}
      >
        {emoji ? (
          <span className="text-[1.05rem] leading-none select-none" role="img" aria-label="当前表情">
            {emoji}
          </span>
        ) : (
          <>
            <NoteEditorAddPillLabel expanded={showEmojiPicker}>+ Emoji</NoteEditorAddPillLabel>
            <Smile size={14} strokeWidth={2} className="shrink-0" aria-hidden />
          </>
        )}
      </button>
      {emoji ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setEmoji('');
            setShowEmojiPicker(false);
          }}
          className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10 border-0 cursor-pointer shadow-sm hover:bg-red-600"
          title="清除表情"
        >
          <Minus size={11} strokeWidth={2.5} />
        </button>
      ) : null}
      <EmojiPicker
        isOpen={showEmojiPicker}
        anchorRef={emojiAnchorRef}
        onClose={() => setShowEmojiPicker(false)}
        onSelectEmoji={(e) => setEmoji(e)}
        panelChromeStyle={editorChromeStyle}
        chromeAppearance={chromeAppearance}
      />
    </div>
  ) : null;

  const mediaActionsSlot = !isCompactMode ? (
    <div className="flex items-center gap-1 shrink-0">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.heic,.heif"
        multiple
        className="hidden"
        onChange={(e) => {
          dismissOverlays();
          handleImageUpload(e);
          e.target.value = '';
        }}
      />
      <button
        type="button"
        onClick={() => {
          dismissOverlays();
          fileInputRef.current?.click();
        }}
        className={`${NOTE_EDITOR_ADD_PILL_CLASS} ${NOTE_EDITOR_ADD_PILL_IDLE}`}
        title="添加图片"
      >
        <NoteEditorAddPillLabel>+ 图片</NoteEditorAddPillLabel>
        <ImageIcon size={14} strokeWidth={2} className="shrink-0" aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => {
          dismissOverlays();
          setIsSketching(false);
          setIsCapturingPhoto(true);
        }}
        className={`${NOTE_EDITOR_ADD_PILL_CLASS} ${isCapturingPhoto ? NOTE_EDITOR_ADD_PILL_ACTIVE : NOTE_EDITOR_ADD_PILL_IDLE}`}
        title="拍照"
      >
        <NoteEditorAddPillLabel>+ 拍照</NoteEditorAddPillLabel>
        <Camera size={14} strokeWidth={2} className="shrink-0" aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => {
          dismissOverlays();
          setIsCapturingPhoto(false);
          setIsSketching(true);
        }}
        className={`${NOTE_EDITOR_ADD_PILL_CLASS} ${isSketching ? NOTE_EDITOR_ADD_PILL_ACTIVE : NOTE_EDITOR_ADD_PILL_IDLE}`}
        title="添加涂鸦"
      >
        <NoteEditorAddPillLabel>+ 涂鸦</NoteEditorAddPillLabel>
        <PenTool size={14} strokeWidth={2} className="shrink-0" aria-hidden />
      </button>
    </div>
  ) : null;

  const propertySection = !isCompactMode ? (
    <PropertySection
      standalone={isCanvasWindow}
      startYear={startYear}
      endYear={endYear}
      onTimeChange={(next) => {
        setStartYear(next.startYear);
        setEndYear(next.endYear);
      }}
      themeColor={themeColor}
      panelChromeStyle={editorChromeStyle}
      chromeAppearance={chromeAppearance}
      active={isOpen}
      onProvideTimeDismiss={registerTimeRangeDismiss}
      tags={tags}
      editingTagId={editingTagId}
      isAddingTag={isAddingTag}
      newTagLabel={newTagLabel}
      newTagColor={newTagColor}
      setNewTagLabel={setNewTagLabel}
      setNewTagColor={setNewTagColor}
      onEditTag={handleEditTag}
      onRemoveTag={removeTag}
      onReorderTags={setTags}
      onSaveTag={handleSaveTag}
      onCancelTagEdit={handleCancelTagEdit}
      onStartAddTag={() => setIsAddingTag(true)}
      onDismissOverlays={dismissOverlays}
      onBeforeOpenTime={dismissOverlaysExceptTime}
      trailingSlot={emojiTrailingSlot}
    />
  ) : null;

  const mediaSection = !isCompactMode ? (
    <MediaSection
      standalone={isCanvasWindow}
      mediaItems={mediaItems}
      displaySrcs={displaySrcs}
      mediaLoading={isResolvingMedia}
      onReorder={reorderMedia}
      onPreview={(index) => {
        dismissOverlays();
        setPreviewImageIndex(index);
        setPreviewImage(displaySrcs[index] || null);
      }}
      onRemove={(index) => {
        dismissOverlays();
        removeMediaAt(index);
      }}
      onDismissOverlays={dismissOverlays}
      moreActionsSlot={mediaActionsSlot}
    />
  ) : null;

  const editorMain = (
    <>
      {isSketching ? (
        <div className="absolute inset-0 z-50" onPointerDown={(e) => e.stopPropagation()}>
          <DrawingCanvas
            backgroundColor={color}
            themeColor={themeColor}
            chromeAppearance={chromeAppearance}
            chromeSurfaceStyle={editorChromeStyle}
            onSave={(data) => {
              if (data && data !== '') appendSketch(data);
              setIsSketching(false);
            }}
            onCancel={() => setIsSketching(false)}
          />
        </div>
      ) : null}

      {isCapturingPhoto ? (
        <CameraCaptureDialog
          open
          variant="overlay"
          themeColor={themeColor}
          chromeAppearance={chromeAppearance}
          chromeSurfaceStyle={editorChromeStyle}
          onClose={() => setIsCapturingPhoto(false)}
          onCapture={async (blob) => {
            const dataUrl = await blobToDataUrl(blob);
            appendDisplayImages([dataUrl]);
            setIsCapturingPhoto(false);
          }}
        />
      ) : null}

      <div
        className={`flex flex-col flex-1 h-full min-h-0 ${mediaOverlayActive ? 'invisible' : ''}`}
        style={{ zIndex: 10 }}
      >
        <NoteHeader
          themeColor={themeColor}
          title={displayTitle}
          isFavorite={isFavorite}
          onToggleFavorite={() => {
            dismissOverlays();
            setIsFavorite(!isFavorite);
          }}
          showUpgrade={false}
          onUpgrade={() => {}}
          showLocateBoard={
            !!(
              initialNote?.boardX !== undefined &&
              initialNote?.boardY !== undefined &&
              onSwitchToBoardView
            )
          }
          onLocateBoard={() => {
            dismissOverlays();
            const noteWidth = initialNote!.variant === 'image' ? initialNote!.imageWidth || 256 : 256;
            const noteHeight = initialNote!.variant === 'image' ? initialNote!.imageHeight || 256 : 256;
            const centerX = initialNote!.boardX! + noteWidth / 2;
            const centerY = initialNote!.boardY! + noteHeight / 2;
            onSwitchToBoardView?.({ x: centerX, y: centerY });
          }}
          showLocateMap={
            !!(initialNote?.coords && initialNote.coords.lat !== 0 && initialNote.coords.lng !== 0 && onSwitchToMapView)
          }
          onLocateMap={() => {
            dismissOverlays();
            onSwitchToMapView?.(initialNote!.coords);
          }}
          showNavigateGo={hasNavigableGpsCoords(initialNote?.coords)}
          onNavigateGo={() => {
            if (!hasNavigableGpsCoords(initialNote?.coords)) return;
            setNavSheetOpen(true);
          }}
          showLocateGraph={!!(initialNote?.id && onSwitchToGraphView)}
          onLocateGraph={() => {
            if (!initialNote?.id) return;
            dismissOverlays();
            onSwitchToGraphView(initialNote.id);
          }}
          onSave={() => {
            dismissOverlays();
            void handleSave();
          }}
          discardDraft={isDiscardableDraft}
          onDiscardDraft={() => {
            dismissOverlays();
            void handleSave();
          }}
        />

        {isProcessingImages && (
          <div className="px-4 py-2 text-sm text-blue-700 bg-blue-50/90 border border-blue-200/80 rounded-xl flex items-center gap-2 mx-4">
            <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin shrink-0" />
            正在处理图片…
          </div>
        )}

        <ContentSection
          isPreviewMode={isPreviewMode}
          text={text}
          onTextChange={setText}
          onPaste={handlePaste}
          onDropImages={handleDropImages}
          isProcessingImages={isProcessingImages}
          textareaRef={textareaRef}
          updateCursorPosition={updateCursorPosition}
          editor={editor}
          themeColor={themeColor}
        />

        {!isCanvasWindow ? propertySection : null}

        {!isCanvasWindow ? mediaSection : null}

        <MetadataSection
          id={initialNote?.id}
          createdAt={initialNote?.createdAt}
          coords={initialNote?.coords}
          mediaCount={mediaItems.length}
          showDelete={!!(initialNote?.id && onDelete)}
          onDeleteNote={
            initialNote?.id && onDelete
              ? () => {
                  dismissOverlays();
                  openDeleteConfirm();
                }
              : undefined
          }
          onDismissOverlays={dismissOverlays}
        />
      </div>
    </>
  );

  const editorOverlays = (
    <>
      <MediaDetailWindow
        images={displaySrcs}
        previewIndex={previewImageIndex}
        open={mediaDetailOpen}
        onClose={() => {
          setPreviewImage(null);
          setLassoIndex(null);
          setLassoSourceSrc(null);
        }}
        onChangeIndex={(idx) => {
          setPreviewImageIndex(idx);
          setPreviewImage(displaySrcs[idx] || null);
        }}
        themeColor={themeColor}
        cropEnabled={isCropActiveAt(previewImageIndex)}
        onCropEnabledChange={(enabled) => {
          void handleCropEnabledChange(enabled);
        }}
        onStartLasso={() => {
          void startLassoForIndex(previewImageIndex);
        }}
        cropBusy={cropBusy}
        lassoImageSrc={lassoIndex != null ? lassoSourceSrc : null}
        onBackFromLasso={() => {
          setLassoIndex(null);
          setLassoSourceSrc(null);
        }}
        onConfirmLasso={async (points) => {
          if (lassoIndex == null) return;
          const dims = await applyLassoSticker(lassoIndex, points);
          if (dims) {
            setStickerSize(fitBoardMediaDimensions(dims.width, dims.height));
          }
          setLassoIndex(null);
          setLassoSourceSrc(null);
        }}
        presentation={isCanvasWindow ? 'canvas-window' : 'modal'}
        panelChromeStyle={editorChromeStyle}
        chromeAppearance={chromeAppearance}
      />

      <DeleteConfirmDialog
        open={deleteConfirmOpen}
        variant="note"
        titleHint={deleteTitleHint}
        confirming={deleteConfirming}
        onCancel={() => !deleteConfirming && setDeleteConfirmOpen(false)}
        onConfirm={executeDeleteNote}
        themeColor={themeColor}
        panelChromeStyle={editorChromeStyle}
      />
      {hasNavigableGpsCoords(initialNote?.coords) && initialNote?.coords ? (
        <ExternalNavigationSheet
          open={navSheetOpen}
          lat={initialNote.coords.lat}
          lng={initialNote.coords.lng}
          label={parseNoteContent(initialNote?.text || '').title || undefined}
          onClose={() => setNavSheetOpen(false)}
          themeColor={themeColor}
          panelChromeStyle={editorChromeStyle}
          chromeAppearance={chromeAppearance}
        />
      ) : null}
    </>
  );

  if (!shell) {
    return (
      <>
        <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col">{editorMain}</div>
        {editorOverlays}
      </>
    );
  }

  return (
    <ChromePresence open={isOpen} kind="dialog" exitDurationMs={280}>
      {(phase) => (
    <div
      data-workspace-modal
      className={isCanvasWindow
        ? `note-editor-canvas-window relative z-10 flex w-max shrink-0 items-start gap-3 touch-none cursor-auto ${phase === 'exiting' ? 'pointer-events-none' : ''}`
        : `note-editor-overlay fixed top-0 ui-workspace-overlay h-[100dvh] max-h-dvh z-[1000] flex items-center justify-center p-4 touch-none cursor-auto ${phase === 'exiting' ? 'pointer-events-none' : ''}`}
      // Table 宽屏将这里当作一组并列画布窗口：只有实际面板拦截拖拽，
      // 列间和面板外的留白应继续落到画布，不能形成不可拖动的死区。
      onPointerDown={(e) => {
        if (!isCanvasWindow) e.stopPropagation();
      }}
      onPointerMove={(e) => {
        if (!isCanvasWindow) e.stopPropagation();
      }}
      onPointerUp={(e) => {
        if (!isCanvasWindow) e.stopPropagation();
      }}
      onWheel={(e) => e.stopPropagation()}
      onDragOver={(e) => e.stopPropagation()}
      onDragEnter={(e) => e.stopPropagation()}
      onDragLeave={(e) => e.stopPropagation()}
      onDrop={(e) => e.stopPropagation()}
    >
      {!isCanvasWindow ? (
        <div className="absolute inset-0" onClick={() => void handleSave()} style={{ zIndex: 1 }} />
      ) : null}

      <div className={`note-editor-shell note-editor-canvas-main relative z-10 flex flex-col items-end ${isCanvasWindow ? 'w-[min(38rem,calc(100vw-2rem))] shrink-0' : ''}`}>
        <div
          data-table-canvas-window={isCanvasWindow ? 'editor' : undefined}
          data-workspace-link-target={isCanvasWindow ? 'note-editor' : undefined}
          className={`note-editor-panel chrome-dialog-${phase} ${
            motionAnchor ? `note-editor-panel--anchored note-editor-panel--anchored-${phase}` : ''
          } map-chrome-content-${chromeAppearance} ${CHROME_DIALOG_SURFACE_SHELL_CLASS} ${
            isCanvasWindow
              ? 'w-full max-w-full max-h-[calc(100dvh-8rem)]'
              : 'w-[500px] max-w-[min(95%,calc(100%-2rem))] max-h-[90vh] max-h-[90dvh]'
          } flex flex-col relative transition-colors duration-300 min-h-[300px] ${mediaOverlayActive ? 'min-h-[500px]' : ''}`}
          style={{
            ...editorChromeStyle,
            overflow: 'hidden',
            ...(motionAnchor
              ? ({
                  '--note-editor-anchor-x': `${motionAnchor.x}px`,
                  '--note-editor-anchor-y': `${motionAnchor.y}px`
                } as React.CSSProperties)
              : {})
          }}
          onDragOver={(e) => e.stopPropagation()}
          onDragEnter={(e) => e.stopPropagation()}
          onDragLeave={(e) => e.stopPropagation()}
          onDrop={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {editorMain}
        </div>
      </div>

      {isCanvasWindow && !isCompactMode ? (
        <div className="note-editor-canvas-side flex w-80 shrink-0 flex-col gap-3">
          <div
            data-table-canvas-window="editor-properties"
            data-workspace-link-target="editor-properties"
            className={`note-editor-aux-panel chrome-dialog-${phase} map-chrome-content-${chromeAppearance} ${CHROME_DIALOG_SURFACE_SHELL_CLASS} overflow-hidden`}
            style={editorChromeStyle}
          >
            {propertySection}
          </div>
          <div
            data-table-canvas-window="editor-media"
            data-workspace-link-target="editor-media"
            className={`note-editor-aux-panel chrome-dialog-${phase} map-chrome-content-${chromeAppearance} ${CHROME_DIALOG_SURFACE_SHELL_CLASS} overflow-hidden`}
            style={editorChromeStyle}
          >
            {mediaSection}
          </div>
        </div>
      ) : null}

      {editorOverlays}
    </div>
      )}
    </ChromePresence>
  );
};
