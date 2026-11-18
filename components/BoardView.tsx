import React, { useRef, useState, useEffect, useLayoutEffect, useMemo, useCallback } from 'react';
import { Note, Frame, Connection, type GraphLayerState, type Project } from '../types';
import { mergeNoteLayerState, type NoteLayerGroupStandard } from '../utils/layer/noteLayerState';
import {
  emojiLayerStateFromLegacyTagState,
  isNoteVisibleInUnifiedLayer
} from '../utils/layer/unifiedNoteLayer';
import { ProjectNotesLayerPanel } from './layer/ProjectNotesLayerPanel';
import { DeferredNoteEditor } from './note-editor/DeferredNoteEditor';
import { Check, Minus, Settings } from 'lucide-react';
import { generateId, parseNoteContent } from '../utils';
import { DEFAULT_THEME_COLOR, TAG_COLORS } from '../constants';
import { mapChromeContentStyle, mapChromeSurfaceStyle } from '../utils/map/mapChromeStyle';
import { useChromeAppearance } from './ui/chromeAppearanceContext';
import { ChromeNoteSlot, chromeNoteEditorSlotLayout } from './ui/ChromeNoteSlot';
import { DeleteConfirmDialog } from './ui/DeleteConfirmDialog';
import { SaveBeforeCloseDialog } from './ui/SaveBeforeCloseDialog';
import type { NoteDraftOutcome } from '../utils/note/draftLifecycle';
import { WorkspaceWindowLinkOverlay } from './ui/WorkspaceWindowLinkOverlay';
import { useCompactViewport } from '../utils/ui/useCompactViewport';
import { parseHexToRgb } from '../utils/theme/themeChrome';
import { getViewPositionCache } from '../utils/persistence/storage';
import { useNotesWithResolvedMedia } from '../utils/persistence/useNotesWithResolvedMedia';
import { noteRendersAsBoardSticker } from '../utils/persistence/mediaDisplay';
import { useBoardNoteDrag } from './hooks/useBoardNoteDrag';
import { useBoardNoteInteraction } from './hooks/useBoardNoteInteraction';
import { useBoardInteractionMachine } from './hooks/useBoardInteractionMachine';
import { useBoardPointerCapture } from './hooks/useBoardPointerCapture';
import {
  boardNoteDimensions,
} from '../utils/board/boardPlacement';
import { fitBoardNotesToViewport } from '../utils/board/boardViewport';
import { fitBoardNotesForEditMode } from '../utils/board/boardEditModeFit';
import { reorderBoardNoteLayers, type BoardLayerOrderCommand } from '../utils/board/boardLayerOrder';
import { TagAddPanel } from './ui/TagAddPanel';
import { SettingsPanel } from './SettingsPanel';
import { useCsvImport } from '@/components/hooks/useCsvImport';
import { BoardImageLightbox } from './board/BoardImageLightbox';
import { BoardCanvasFeedback } from './board/BoardCanvasFeedback';
import { BoardCanvasShell } from './board/BoardCanvasShell';
import { BoardNoteLayer } from './board/BoardNoteLayer';
import { BoardScene } from './board/BoardScene';
import { BoardTopChrome } from './board/BoardTopChrome';
import { BoardFrameBodies } from './board/BoardFrameBodies';
import { BoardSelectionOverlay } from './board/BoardSelectionOverlay';
import { useBoardNoteMotion } from './board/useBoardNoteMotion';
import { useBoardImportController } from './board/useBoardImportController';
import { useBoardUnplacedNotes } from './board/useBoardUnplacedNotes';
import { UnplacedNotesSidebar } from './map/overlays/MapUnplacedNotesPanel';
import { BoardBrowseTagFilterPanel } from './board/BoardBrowseTagFilterPanel';
import { BoardBrowseTimeFilterPanel } from './board/BoardBrowseTimeFilterPanel';
import { BoardBatchTimePanel } from './board/BoardBatchTimePanel';
import { BoardMultiSelectToolbar } from './board/BoardMultiSelectToolbar';
import { BoardTopRightEditToggle } from './board/BoardTopRightEditToggle';
import { GraphConnectionPanel } from './graph/GraphConnectionPanel';
import { useSimpleConnectionPanel } from './hooks/useSimpleConnectionPanel';
import { BoardTopCenterEditToolbar } from './board/BoardTopCenterEditToolbar';
import type { BoardFrameResizeCorner } from './board/BoardFrameControls';
import {
  computeSelectionContentBounds,
  scaledSelectionPositions,
  selectionFixedPoint,
  selectionMovingCorner,
  snapshotSelectionPoses,
  type SelectionScaleCorner
} from '../utils/board/boardSelectionScale';
import { resolveBoardSelectionBounds } from '../utils/board/boardSelectionBounds';
import { syncNotesToContainingFrames } from '../utils/frame/boardFrameMembership';
import { useBoardBatchActions } from './board/useBoardBatchActions';
import { useBoardFrameGroupShortcut } from './board/useBoardFrameGroupShortcut';
import { useBoardSelectionToolbarActions } from './board/useBoardSelectionToolbarActions';
import { useBoardCanvasNavigation } from './board/useBoardCanvasNavigation';
import { createBoardPointerDownHandler } from './board/createBoardPointerDownHandler';
import { createBoardPointerMoveHandler } from './board/createBoardPointerMoveHandler';
import { createBoardPointerUpHandler } from './board/createBoardPointerUpHandler';
import { resolveBoardFrameLayout } from '../utils/board/boardFrameLayout';
import { resolveBoardFrameTitleTint } from '../utils/board/boardFrameTitleStyle';
import { ChromeIconButton } from './ui/ChromeIconButton';
import { LayerToolbarIcon } from './ui/LayerToolbarIcon';
import { WORKSPACE_TRANSIENT_DISMISS_EVENT } from '../utils/ui/workspaceTransientDismiss';
import { ChromeToolbarSlot, CHROME_TOOLBAR_WINDOW_CLASS } from './ui/ChromeToolbarSlot';
import { useChromeMenuTop } from '../utils/ui/chromeMenuPosition';
import { VIBRATION_MEDIUM } from './board-constants';
import {
  clientPoint,
  clientToBoardPoint,
  distanceBetween
} from '../utils/board/boardCoordinates';
import {
  isNoteBoardPlaced,
} from '../utils/note/notePlacement';
import {
  collectSortedUniqueTagLabelsFromSelection,
  computeTimeRangeFromAllNotes,
  computeTimeRangeFromSelection,
  noteMatchesBoardTagFilter,
  noteTimeRangeFullyContainedInFilter,
  selectionHasTimedNotesInSelection,
  selectionHasUntaggedNotes
} from '../utils/board/boardSelectionFilters';

/** Frame 叠在玻璃底上的主题色/分组色（hex → rgba） */
function frameTintFromHex(hex: string, alpha: number): string {
  const rgb = parseHexToRgb(hex);
  if (rgb) return `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;
  return `rgba(156, 163, 175, ${alpha})`;
}

interface BoardViewProps {
  notes: Note[];
  onUpdateNote: (note: Note) => void;
  onToggleEditor: (isOpen: boolean) => void;
  onAddNote?: (note: Note) => void; 
  onDeleteNote?: (noteId: string) => void;
  onDeleteNotesBatch?: (noteIds: string[]) => void;
  workspaceEditMode: boolean;
  onWorkspaceEditModeChange: (isEdit: boolean) => void;
  connections?: Connection[];
  onUpdateConnections?: (connections: Connection[]) => void;
  frames?: Frame[];
  onUpdateFrames?: (frames: Frame[]) => void;
  project?: Project;
  onUpdateProject?: (
    projectOrId: Project | string,
    updates?: Partial<Project>
  ) => void | Promise<void>;
  onSwitchToMapView?: (coords?: { lat: number; lng: number }) => void;
  navigateToCoords?: { x: number; y: number } | null;
  projectId?: string;
  onNavigateComplete?: () => void;
  onTransformChange?: (x: number, y: number, scale: number) => void;
  themeColor?: string;
  panelChromeStyle?: React.CSSProperties;
  /** 与 MapView 浮层按钮悬停一致，由 `mapChromeHoverBackground(opacity)` 传入 */
  chromeHoverBackground?: string;
  isUIVisible?: boolean;
  /** 与 MapView 相同的设置面板（界面外观、地图样式等） */
  onThemeColorChange?: (color: string) => void;
  uiDarkMode?: boolean;
  onUiDarkModeChange?: (dark: boolean) => void;
  mapUiChromeOpacity?: number;
  onMapUiChromeOpacityChange?: (opacity: number) => void;
  mapUiChromeOpacityBottom?: number;
  onMapUiChromeOpacityBottomChange?: (opacity: number) => void;
  mapUiChromeBlurPx?: number;
  onMapUiChromeBlurPxChange?: (blurPx: number) => void;
  mapStyleId?: string;
  onMapStyleChange?: (styleId: string) => void;
}

const BoardViewComponent: React.FC<BoardViewProps> = ({
  notes,
  onUpdateNote,
  onToggleEditor,
  onAddNote,
  onDeleteNote,
  onDeleteNotesBatch,
  workspaceEditMode,
  onWorkspaceEditModeChange,
  connections = [],
  onUpdateConnections,
  frames = [],
  onUpdateFrames,
  project,
  onUpdateProject,
  onSwitchToMapView,
  navigateToCoords,
  projectId,
  onNavigateComplete,
  onTransformChange,
  themeColor = DEFAULT_THEME_COLOR,
  panelChromeStyle,
  chromeHoverBackground,
  isUIVisible = true,
  onThemeColorChange,
  uiDarkMode,
  onUiDarkModeChange,
  mapUiChromeOpacity = 0.6,
  onMapUiChromeOpacityChange,
  mapUiChromeOpacityBottom = 0.4,
  onMapUiChromeOpacityBottomChange,
  mapUiChromeBlurPx = 4,
  onMapUiChromeBlurPxChange,
  mapStyleId = 'carto-light-nolabels',
  onMapStyleChange,
}) => {
  /** 渲染用：资产 ID → data URL；写回仍用 props.notes */
  const displayNotes = useNotesWithResolvedMedia(notes);
  const ch = panelChromeStyle;
  const chHover = chromeHoverBackground;
  const chromeAppearance = useChromeAppearance();
  const compactViewport = useCompactViewport();
  const boardNoteEditorSurface = useMemo(
    () => mapChromeContentStyle(mapUiChromeOpacity, mapUiChromeBlurPx, chromeAppearance),
    [chromeAppearance, mapUiChromeBlurPx, mapUiChromeOpacity]
  );
  const frameChromeStyle = useMemo(
    () => ch ?? mapChromeSurfaceStyle(mapUiChromeOpacity, mapUiChromeBlurPx, chromeAppearance),
    [ch, chromeAppearance, mapUiChromeOpacity, mapUiChromeBlurPx]
  );
  const { handleCsvImport: handleCsvDataImport } = useCsvImport({
    project: project ?? ({} as Project),
    onUpdateProject: onUpdateProject
      ? async (p) => {
          await onUpdateProject(p);
        }
      : undefined
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const {
    interactionRef,
    interactionState,
    interactionKind,
    beginPanning,
    beginBoxSelecting,
    beginDrawingFrame,
    beginDraggingFrame,
    beginResizingFrame,
    beginResizingImage,
    beginScalingSelection,
    updatePanning,
    movementFromOrigin,
    resetInteraction
  } = useBoardInteractionMachine();
  const { capturePointer, releasePointer, releaseAllPointers } = useBoardPointerCapture(containerRef);
  const isPanning = interactionKind === 'panning';
  // b: this exists only from the matching pointerdown until pointerup/cancel.
  const isBoxSelectGestureActive = interactionKind === 'box-selecting';
  const draggingFrameId =
    interactionState.kind === 'dragging-frame' ? interactionState.id : null;
  const draggingFrameOffset =
    interactionState.kind === 'dragging-frame' ? interactionState.offset : null;
  const resizingFrame =
    interactionState.kind === 'resizing-frame' ? interactionState : null;
  const resizingImage =
    interactionState.kind === 'resizing-image' ? interactionState : null;
  const boardLongPressPreviewNoteRef = useRef<Note | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set());
  const [pendingKeyboardDeleteIds, setPendingKeyboardDeleteIds] = useState<string[] | null>(null);
  const boardNoteSaveRef = useRef<(() => Promise<NoteDraftOutcome>) | null>(null);
  const [confirmOutsideClose, setConfirmOutsideClose] = useState(false);
  const [savingOutsideClose, setSavingOutsideClose] = useState(false);
  const {
    editingNote,
    setEditingNote,
    introNote,
    setIntroNote,
    isIntroPending,
    setIsIntroPending,
    introNoteMotion,
    enteringNoteIds,
    markBoardNotesEntering,
    deletingNoteIds,
    boardDisplayNotes,
    addBoardNoteWithEnter,
    beginNewBoardNoteIntro,
    openNewBoardNoteEditorAfterIntro,
    openBoardNoteEditor,
    closeEditor,
    cancelPendingNoteIntro,
    deleteBoardNotesWithExit
  } = useBoardNoteMotion({
    notes,
    displayNotes,
    onAddNote,
    onDeleteNote,
    onDeleteNotesBatch,
    onToggleEditor,
    setSelectedNoteId,
    setSelectedNoteIds,
    onBeforeEditorOpen: () => {
      setMultiBatchPanel('none');
      setBrowseTagFilterPanelOpen(false);
      setBrowseTimeFilterPanelOpen(false);
    }
  });
  const [inlineTitleEdit, setInlineTitleEdit] = useState<{ noteId: string; value: string } | null>(null);
  const inlineTitleEditRef = useRef<{ noteId: string; value: string } | null>(null);
  const committedInlineIntroIdRef = useRef<string | null>(null);

  const updateInlineTitle = useCallback((value: string) => {
    const current = inlineTitleEditRef.current;
    if (!current) return;
    const next = { ...current, value };
    inlineTitleEditRef.current = next;
    setInlineTitleEdit(next);
  }, []);

  const cancelInlineTitle = useCallback(() => {
    if (!inlineTitleEditRef.current) return;
    inlineTitleEditRef.current = null;
    setInlineTitleEdit(null);
    cancelPendingNoteIntro();
  }, [cancelPendingNoteIntro]);

  const commitInlineTitle = useCallback(() => {
    const current = inlineTitleEditRef.current;
    if (!current) return;
    inlineTitleEditRef.current = null;
    setInlineTitleEdit(null);
    const title = current.value.trim();
    if (!title || !introNote || introNote.id !== current.noteId) {
      cancelPendingNoteIntro();
      return;
    }
    const committed = { ...introNote, text: title };
    committedInlineIntroIdRef.current = committed.id;
    setIntroNote(committed);
    setIsIntroPending(false);
    setEditingNote(null);
    onToggleEditor(false);
    onAddNote?.(committed);
  }, [cancelPendingNoteIntro, introNote, onAddNote, onToggleEditor, setEditingNote, setIntroNote, setIsIntroPending]);

  useEffect(() => {
    const committedId = committedInlineIntroIdRef.current;
    if (!committedId || !notes.some((note) => note.id === committedId)) return;
    committedInlineIntroIdRef.current = null;
    setIntroNote((current) => (current?.id === committedId ? null : current));
  }, [notes, setIntroNote]);
  
  // Calculate initial transform: cache -> fit all objects -> default
  const calculateInitialTransform = useCallback(() => {
    if (!containerRef.current) return { x: 0, y: 0, scale: 1 };
    
    // 1. Check cache first
    if (projectId) {
      const cached = getViewPositionCache(projectId, 'board');
      if (cached?.x !== undefined && cached?.y !== undefined && cached?.scale !== undefined) {
        return { x: cached.x, y: cached.y, scale: cached.scale };
      }
    }
    
    // 2. Calculate to fit all objects. The geometry is pure and covered independently.
    const { width, height } = containerRef.current.getBoundingClientRect();
    return fitBoardNotesToViewport(notes, { width, height });
  }, [notes, projectId]);
  
  // 返回 Board 时直接使用当前项目的缓存视图，避免先绘制一帧 (0, 0, 1)。
  // 首次进入且没有缓存时，再由下方 layout effect 在首帧绘制前完成自动适配。
  const [transform, setTransform] = useState(() => {
    if (projectId) {
      const cached = getViewPositionCache(projectId, 'board');
      if (cached?.x !== undefined && cached?.y !== undefined && cached?.scale !== undefined) {
        return { x: cached.x, y: cached.y, scale: cached.scale };
      }
    }
    return { x: 0, y: 0, scale: 1 };
  });
  const transformRef = useRef(transform);
  transformRef.current = transform;

  const noteEditorAnimationAnchor = useMemo(() => {
    if (!editingNote || editingNote.boardX == null || editingNote.boardY == null || !containerRef.current) return undefined;
    const rect = containerRef.current.getBoundingClientRect();
    const { width, height } = boardNoteDimensions(editingNote);
    return {
      x: rect.left + transform.x + (editingNote.boardX + width / 2) * transform.scale,
      y: rect.top + transform.y + (editingNote.boardY + height / 2) * transform.scale,
    };
  }, [editingNote?.id, editingNote?.boardX, editingNote?.boardY, transform.x, transform.y, transform.scale]);
  // Note position selection state
  const [isSelectingNotePosition, setIsSelectingNotePosition] = useState(false);
  const [notePositionPreview, setNotePositionPreview] = useState<{ x: number; y: number } | null>(null);
  const boardLongPressTimerRef = useRef<number | null>(null);
  const boardLongPressStartRef = useRef<{
    clientX: number;
    clientY: number;
    boardX: number;
    boardY: number;
  } | null>(null);
  const boardLongPressTriggeredRef = useRef(false);
  
  // 当编辑模式切换时，清除过滤状态和绘制状态
  useEffect(() => {
    if (workspaceEditMode) {
      setFilterFrameIds(new Set());
    } else {
      // 退出编辑模式时，也退出位置选择模式和绘制模式
      setIsSelectingNotePosition(false);
      setNotePositionPreview(null);
      setIsDrawingFrame(false);
      setDrawingFrameStart(null);
      setDrawingFrameEnd(null);
    }
  }, [workspaceEditMode]);
  
  // 当退出位置选择模式时，清除预览
  useEffect(() => {
    if (!isSelectingNotePosition) {
      setNotePositionPreview(null);
    }
  }, [isSelectingNotePosition]);
  
  // Layer Visibility State
  const [layerVisibility, setLayerVisibility] = useState({
    frame: true,
    primary: true,
    image: true,
  });
  const [showLayerPanel, setShowLayerPanel] = useState(false);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const boardLayerBtnRef = useRef<HTMLDivElement>(null);
  const boardToolbarRef = useRef<HTMLDivElement>(null);
  const boardToolbarKind = showSettingsPanel ? 'settings' : showLayerPanel ? 'layer' : null;
  const boardLayerMenuTop = useChromeMenuTop(boardToolbarKind != null, boardToolbarRef, 8);

  /** 设置窗与编辑器叠在一起会挡操作；筛选窗保留，以便记录行连到右侧编辑器。 */
  useEffect(() => {
    if (!editingNote || isIntroPending) return;
    setShowSettingsPanel(false);
  }, [editingNote, isIntroPending]);

  const projectFull = project as Project | undefined;
  const effectiveConnections = useMemo(
    () => projectFull?.connections ?? connections,
    [projectFull?.connections, connections]
  );
  const graphLayerGroupStandard = useMemo(
    () => (projectFull?.graphLayerStandard ?? 'tag') as NoteLayerGroupStandard,
    [projectFull?.graphLayerStandard]
  );
  const mergedTagBoardLayers = useMemo(
    () => mergeNoteLayerState(notes, projectFull?.graphLayers ?? null, 'tag'),
    [notes, projectFull?.graphLayers]
  );
  const mergedFrameBoardLayers = useMemo(
    () => mergeNoteLayerState(notes, projectFull?.graphFrameLayers ?? null, 'frame'),
    [notes, projectFull?.graphFrameLayers]
  );
  const mergedEmojiBoardLayers = useMemo(
    () => mergeNoteLayerState(notes, projectFull?.graphEmojiLayers ?? emojiLayerStateFromLegacyTagState(projectFull?.graphLayers), 'emoji'),
    [notes, projectFull?.graphEmojiLayers, projectFull?.graphLayers]
  );
  const mergedProjectBoardLayers =
    graphLayerGroupStandard === 'frame'
      ? mergedFrameBoardLayers
      : graphLayerGroupStandard === 'emoji'
        ? mergedEmojiBoardLayers
        : mergedTagBoardLayers;

  const handleBoardGraphLayersChange = useCallback(
    (next: GraphLayerState) => {
      if (!onUpdateProject || !projectFull) return;
      if (graphLayerGroupStandard === 'frame') {
        onUpdateProject({ ...projectFull, graphFrameLayers: next });
      } else if (graphLayerGroupStandard === 'emoji') {
        onUpdateProject({ ...projectFull, graphEmojiLayers: next });
      } else {
        onUpdateProject({ ...projectFull, graphLayers: next });
      }
    },
    [onUpdateProject, projectFull, graphLayerGroupStandard]
  );

  const handleBoardLayerStandardChange = useCallback(
    (standard: NoteLayerGroupStandard) => {
      if (!onUpdateProject || !projectFull) return;
      onUpdateProject({ ...projectFull, graphLayerStandard: standard });
    },
    [onUpdateProject, projectFull]
  );

  const handleBoardBatchNotes = useCallback(
      async (nextNotes: Note[]) => {
      if (!onUpdateProject || !projectFull) return;
      await onUpdateProject({ ...projectFull, notes: nextNotes });
    },
    [onUpdateProject, projectFull]
  );

  const handleBoardUpdateFrame = useCallback(
    (frame: Frame) => {
      if (onUpdateFrames) {
        onUpdateFrames((frames ?? []).map((f) => (f.id === frame.id ? frame : f)));
        return;
      }
      if (!onUpdateProject || !projectFull) return;
      onUpdateProject({
        ...projectFull,
        frames: (projectFull.frames ?? []).map((f) => (f.id === frame.id ? frame : f))
      });
    },
    [frames, onUpdateFrames, onUpdateProject, projectFull]
  );

  const panBoardToNoteCenter = useCallback(
    (note: Note) => {
      const { width, height } = boardNoteDimensions(note);
      const cx = note.boardX + width / 2;
      const cy = note.boardY + height / 2;
      const el = containerRef.current;
      if (!el) return;
      const { width: vw, height: vh } = el.getBoundingClientRect();
      setTransform((prev) => ({
        ...prev,
        x: vw / 2 - cx * prev.scale,
        y: vh / 2 - cy * prev.scale
      }));
    },
    [setTransform]
  );
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  
  // Layout state: global standard size scale is stored in project.standardSizeScale
  
  const isZoomingRef = useRef(false);
  const [isZooming, setIsZooming] = useState(false);
  isZoomingRef.current = isZooming;
  const dragRectRef = useRef<DOMRect | null>(null);
  
  const animationFrameRef = useRef<number | null>(null);
  // 触屏长按卡片进入编辑时保留当前视图，不触发“进入编辑自动适配”。
  const skipNextEditModeZoomRef = useRef(false);

  // 停止所有正在运行的画布动画
  const stopAnimations = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);
  
  // Connection state
  const [selectionOverlayElement, setSelectionOverlayElement] = useState<HTMLDivElement | null>(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [multiBatchPanel, setMultiBatchPanel] = useState<'none' | 'tag' | 'time'>('none');

  const {
    panelRef: unplacedBoardSidebarRef,
    isDropTarget: isUnplacedBoardSidebarDropTarget,
    leavingNoteIds: leavingBoardNoteIds,
    unplacedNotes: unplacedBoardNotes,
    deleteUnplacedNotes: deleteUnplacedBoardNotes,
    onDragPointerMove: handleBoardNoteDragPointerMove,
    onDropToPanel: handleBoardNoteDropToSidebar
  } = useBoardUnplacedNotes({
    notes,
    displayNotes,
    project,
    onUpdateProject,
    onUpdateNote,
    containerRef,
    transform,
    enabled: isUIVisible && workspaceEditMode,
    selectedNoteIds,
    setSelectedNoteId,
    setSelectedNoteIds,
    setMultiBatchPanel,
    deleteNotesWithExit: deleteBoardNotesWithExit,
    markBoardNotesEntering
  });
  // Multi-select state
  const [isShiftPressed, setIsShiftPressed] = useState(false);
  
  // Box selection state
  const [isBoxSelecting, setIsBoxSelecting] = useState(false);
  // a: the persistent toolbar mode. Keeping a synchronous ref prevents a
  // quick tool-click then canvas-press from reading a stale render value.
  const boxSelectToolActiveRef = useRef(false);
  const setBoxSelectToolActive = useCallback((active: boolean) => {
    boxSelectToolActiveRef.current = active;
    setIsBoxSelecting(active);
  }, []);
  const [boxSelectStart, setBoxSelectStart] = useState<{ x: number; y: number } | null>(null);
  const [boxSelectEnd, setBoxSelectEnd] = useState<{ x: number; y: number } | null>(null);

  /** 多选批量工具栏：标签 / 时间子面板 */
  const [batchTagLabel, setBatchTagLabel] = useState('');
  const [batchTagColorIndex, setBatchTagColorIndex] = useState(0);
  const [batchTimeStartStr, setBatchTimeStartStr] = useState('');
  const [batchTimeEndStr, setBatchTimeEndStr] = useState('');
  const {
    canGroup,
    canUngroup,
    applyBatchTags,
    dismissBatchTagPanel,
    applyBatchTime,
    runGroupSelected,
    runUngroupSelected
  } = useBoardBatchActions({
    notes,
    project,
    onUpdateNote,
    onUpdateProject,
    workspaceEditMode,
    selectedNoteIds,
    batchTagLabel,
    setBatchTagLabel,
    batchTagColorIndex,
    batchTimeStartStr,
    batchTimeEndStr,
    setMultiBatchPanel
  });
  const selectedBoardNotes = useMemo(
    () => notes.filter((note) => selectedNoteIds.has(note.id) && isNoteBoardPlaced(note)),
    [notes, selectedNoteIds]
  );
  const selectedTextBoardNotes = useMemo(
    () => selectedBoardNotes.filter((note) => !noteRendersAsBoardSticker(note)),
    [selectedBoardNotes]
  );
  const selectedTextNotesExpanded =
    selectedTextBoardNotes.length > 0 && selectedTextBoardNotes.every((note) => note.boardSize === 'expanded');
  const toggleSelectedNoteSize = useCallback(() => {
    if (!selectedTextBoardNotes.length) return;
    const selectedIds = new Set(selectedTextBoardNotes.map((note) => note.id));
    const boardSize: Note['boardSize'] = selectedTextNotesExpanded ? 'standard' : 'expanded';
    const nextNotes = notes.map((note) => {
      if (!selectedIds.has(note.id)) return note;
      const before = boardNoteDimensions(note);
      const resized = { ...note, boardSize };
      const after = boardNoteDimensions(resized);
      return {
        ...resized,
        boardX: note.boardX + (before.width - after.width) / 2,
        boardY: note.boardY + (before.height - after.height) / 2
      };
    });
    if (onUpdateProject && project) {
      void onUpdateProject({ ...project, notes: nextNotes });
    } else {
      nextNotes.filter((note) => selectedIds.has(note.id)).forEach(onUpdateNote);
    }
  }, [notes, onUpdateNote, onUpdateProject, project, selectedTextBoardNotes, selectedTextNotesExpanded]);
  const applyBoardLayerOrder = useCallback((command: BoardLayerOrderCommand) => {
    if (!selectedNoteIds.size) return;
    const nextNotes = reorderBoardNoteLayers(notes, selectedNoteIds, command);
    if (onUpdateProject && project) {
      void onUpdateProject({ ...project, notes: nextNotes });
    } else {
      nextNotes.forEach(onUpdateNote);
    }
  }, [notes, onUpdateNote, onUpdateProject, project, selectedNoteIds]);

  useEffect(() => {
    const handleLayerShortcut = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || !selectedNoteIds.size || editingNote) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('input, textarea, select, [contenteditable="true"], .ProseMirror')) return;
      const left = event.code === 'BracketLeft' || event.key === '[';
      const right = event.code === 'BracketRight' || event.key === ']';
      if (!left && !right) return;
      event.preventDefault();
      applyBoardLayerOrder(
        event.shiftKey
          ? (left ? 'back' : 'front')
          : (left ? 'backward' : 'forward')
      );
    };
    window.addEventListener('keydown', handleLayerShortcut);
    return () => window.removeEventListener('keydown', handleLayerShortcut);
  }, [applyBoardLayerOrder, editingNote, selectedNoteIds.size]);

  useEffect(() => {
    const handleDeleteShortcut = (event: KeyboardEvent) => {
      if (
        (event.key !== 'Delete' && event.key !== 'Backspace') ||
        !selectedNoteIds.size ||
        editingNote ||
        inlineTitleEditRef.current
      ) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('input, textarea, select, [contenteditable="true"], .ProseMirror, [data-chrome-window-nested]')) return;
      event.preventDefault();
      event.stopPropagation();
      setPendingKeyboardDeleteIds(Array.from(selectedNoteIds));
    };
    window.addEventListener('keydown', handleDeleteShortcut);
    return () => window.removeEventListener('keydown', handleDeleteShortcut);
  }, [editingNote, selectedNoteIds]);

  useEffect(() => {
    if (selectedNoteIds.size <= 1) {
      setMultiBatchPanel('none');
      setBatchTagLabel('');
      setBatchTimeStartStr('');
      setBatchTimeEndStr('');
      setBrowseTagFilterPanelOpen(false);
      setBrowseTimeFilterPanelOpen(false);
    }
  }, [selectedNoteIds.size]);

  const boardInspectorNoteId = useMemo(() => {
    if (selectedNoteIds.size > 1) return null;
    if (selectedNoteId) return selectedNoteId;
    if (selectedNoteIds.size === 1) return Array.from(selectedNoteIds)[0];
    return null;
  }, [selectedNoteId, selectedNoteIds]);
  const {
    showConnectionPanel: showBoardInsConnPanel,
    setShowConnectionPanel: setShowBoardInsConnPanel,
    panelEditingKey: boardInsConnEditingKey,
    connectionDraft: boardInsConnDraft,
    setConnectionDraft: setBoardInsConnDraft,
    pickTarget: boardInsConnPick,
    setPickTarget: setBoardInsConnPick,
    commitConnectionDraft: commitBoardInsConnDraft,
    deleteConnectionByPanel: handleDeleteBoardInsConn,
    resetNewConnectionDraft: handleBoardInsNewEmpty,
    openNewFromInspectorAnchor: handleNewConnectionFromBoardInspector,
    openEditConnection: handleEditBoardInsConn,
    clearPanelDraft: clearBoardInsConnDraft,
    clearFromOnly: clearBoardInsFromOnly,
    clearToOnly: clearBoardInsToOnly
  } = useSimpleConnectionPanel({
    connections: effectiveConnections,
    onUpdateConnections,
    projectDefaults: projectFull,
    anchorNoteIdForNew: boardInspectorNoteId
  });

  // Frame state
  const [isDrawingFrame, setIsDrawingFrame] = useState(false);
  const [drawingFrameStart, setDrawingFrameStart] = useState<{ x: number; y: number } | null>(null);
  const [drawingFrameEnd, setDrawingFrameEnd] = useState<{ x: number; y: number } | null>(null);
  const [selectedFrameId, setSelectedFrameId] = useState<string | null>(null);

  // 在非编辑模式下选中的frames用于过滤显示（支持多frame）
  const [filterFrameIds, setFilterFrameIds] = useState<Set<string>>(new Set());
  /** 非编辑模式：画板级按标签筛选（与多选面板预览无关） */
  const [boardFilterTagLabels, setBoardFilterTagLabels] = useState<Set<string>>(new Set());
  /** 与 boardFilterTagLabels 并集：无标签便签是否通过画板级标签筛选 */
  const [boardFilterIncludeUntagged, setBoardFilterIncludeUntagged] = useState(false);
  /** 浏览多选：标签筛选面板 */
  const [browseTagFilterPanelOpen, setBrowseTagFilterPanelOpen] = useState(false);
  /** 为 true：预览/确定均不按标签收窄（与「无标签」选项分离） */
  const [browseTagFilterPendingDefault, setBrowseTagFilterPendingDefault] = useState(true);
  const [browseTagFilterPendingLabels, setBrowseTagFilterPendingLabels] = useState<Set<string>>(
    () => new Set()
  );
  const [browseTagFilterPendingUntagged, setBrowseTagFilterPendingUntagged] = useState(false);
  const boardBrowseTagFilterButtonRef = useRef<HTMLButtonElement>(null);
  /** 浏览多选：按时间筛选面板（portal，与画板级时间筛选分离） */
  const [browseTimeFilterPanelOpen, setBrowseTimeFilterPanelOpen] = useState(false);
  const [browseTimeFilterPendingMin, setBrowseTimeFilterPendingMin] = useState(1900);
  const [browseTimeFilterPendingMax, setBrowseTimeFilterPendingMax] = useState(2100);
  const [browseTimeFilterSliderMinBound, setBrowseTimeFilterSliderMinBound] = useState(1900);
  const [browseTimeFilterSliderMaxBound, setBrowseTimeFilterSliderMaxBound] = useState(2100);
  const boardBrowseTimeFilterButtonRef = useRef<HTMLButtonElement>(null);
  /** 非编辑模式：按起止年区间筛选（与便签时间段有交集） */
  const [boardFilterTimeRange, setBoardFilterTimeRange] = useState<{ min: number; max: number } | null>(
    null
  );
  const { runBatchDelete, exitMultiSelectToolbar, onLocateOnMap } =
    useBoardSelectionToolbarActions({
      selectedNoteIds,
      selectedNotes: selectedBoardNotes,
      deleteBoardNotesWithExit,
      setSelectedNoteId,
      setSelectedNoteIds,
      setMultiBatchPanel,
      setBatchTagLabel,
      setBatchTimeStartStr,
      setBatchTimeEndStr,
      setBrowseTagFilterPanelOpen,
      setBrowseTimeFilterPanelOpen,
      onSwitchToMapView
    });
  const [editingFrameId, setEditingFrameId] = useState<string | null>(null);
  const [editingFrameTitle, setEditingFrameTitle] = useState('');
  const frameTitleInputRef = useRef<HTMLInputElement | null>(null);
  const frameTitleSaveButtonRef = useRef<HTMLButtonElement | null>(null);
  const [localDraggingFramePos, setLocalDraggingFramePos] = useState<{ x: number; y: number } | null>(null);
  const [localResizingFrameSize, setLocalResizingFrameSize] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const isWaitingForSyncRef = useRef(false);

  // 当外部frames更新时，如果正在等待同步，则清除本地预览状态
  useEffect(() => {
    if (isWaitingForSyncRef.current) {
      setLocalResizingFrameSize(null);
      setLocalDraggingFramePos(null);
      isWaitingForSyncRef.current = false;
    }
  }, [frames]);
  const [localResizingImageSize, setLocalResizingImageSize] = useState<{ id: string; x: number; y: number; width: number; height: number } | null>(null);
  const imageResizeSettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!localResizingImageSize || interactionKind === 'resizing-image') return;
    const note = notes.find((n) => n.id === localResizingImageSize.id);
    if (
      note &&
      note.boardX === localResizingImageSize.x &&
      note.boardY === localResizingImageSize.y &&
      (note.imageWidth || 256) === localResizingImageSize.width &&
      (note.imageHeight || 256) === localResizingImageSize.height
    ) {
      if (imageResizeSettleTimerRef.current) {
        clearTimeout(imageResizeSettleTimerRef.current);
        imageResizeSettleTimerRef.current = null;
      }
      setLocalResizingImageSize(null);
    }
  }, [interactionKind, localResizingImageSize, notes]);

  useEffect(() => {
    return () => {
      if (imageResizeSettleTimerRef.current) {
        clearTimeout(imageResizeSettleTimerRef.current);
      }
    };
  }, []);
  /** 多选包围盒缩放预览：id → 新 board 坐标（松手后保留至 notes 对齐） */
  const [selectionScalePreview, setSelectionScalePreview] = useState<Map<
    string,
    { boardX: number; boardY: number }
  > | null>(null);
  const selectionScaleStartPosesRef = useRef<ReturnType<typeof snapshotSelectionPoses> | null>(
    null
  );
  const selectionScaleSettleExpectedRef = useRef<Map<string, { boardX: number; boardY: number }> | null>(
    null
  );
  const selectionScaleSettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSelectionScalePreview = useCallback(() => {
    if (selectionScaleSettleTimerRef.current) {
      clearTimeout(selectionScaleSettleTimerRef.current);
      selectionScaleSettleTimerRef.current = null;
    }
    selectionScaleStartPosesRef.current = null;
    selectionScaleSettleExpectedRef.current = null;
    setSelectionScalePreview(null);
  }, []);

  useEffect(() => {
    const expected = selectionScaleSettleExpectedRef.current;
    if (!expected || !selectionScalePreview) return;
    for (const [id, pos] of expected) {
      const n = notes.find((x) => x.id === id);
      if (!n || n.boardX !== pos.boardX || n.boardY !== pos.boardY) return;
    }
    clearSelectionScalePreview();
  }, [notes, selectionScalePreview, clearSelectionScalePreview]);

  useEffect(() => {
    if (selectedNoteIds.size <= 1 && selectionScalePreview) {
      clearSelectionScalePreview();
    }
  }, [selectedNoteIds.size, selectionScalePreview, clearSelectionScalePreview]);

  useEffect(() => () => {
    if (selectionScaleSettleTimerRef.current) {
      clearTimeout(selectionScaleSettleTimerRef.current);
    }
  }, []);
  
  const dataImportInputRef = useRef<HTMLInputElement>(null);
  const boardImport = useBoardImportController({
    notes,
    transform,
    containerRef,
    editingNote,
    setEditingNote,
    onUpdateNote,
    onAddNote: addBoardNoteWithEnter,
    onCsvImport: handleCsvDataImport
  });

  useEffect(() => {
    const dismiss = () => {
      setShowLayerPanel(false);
      setShowSettingsPanel(false);
      setBrowseTagFilterPanelOpen(false);
      setBrowseTimeFilterPanelOpen(false);
      setShowBoardInsConnPanel(false);
      setBoardInsConnPick(null);
    };
    window.addEventListener(WORKSPACE_TRANSIENT_DISMISS_EVENT, dismiss);
    return () => window.removeEventListener(WORKSPACE_TRANSIENT_DISMISS_EVENT, dismiss);
  }, [setShowBoardInsConnPanel, setBoardInsConnPick]);
  
  const commitProjectNotes = useCallback(
    (nextNotes: Note[]) => {
      if (!project || !onUpdateProject) return;
      void onUpdateProject({ ...project, notes: nextNotes });
    },
    [project, onUpdateProject]
  );

  const cacheDragRect = useCallback(() => {
    dragRectRef.current = containerRef.current?.getBoundingClientRect() || null;
  }, []);

  const enterEditFromTouchLongPress = useCallback(
    (note: Note) => {
      skipNextEditModeZoomRef.current = true;
      setSelectedNoteId(note.id);
      setSelectedNoteIds(new Set([note.id]));
      setSelectedConnectionId(null);
      setSelectedFrameId(null);
      onWorkspaceEditModeChange(true);
    },
    [onWorkspaceEditModeChange]
  );

  const {
    draggingNoteId,
    dragOffset,
    isMultiSelectDragging,
    multiSelectDragOffset,
    handleNotePointerDown,
    handleNotePointerMove,
    handleNotePointerUp,
    handleNotePointerCancel,
    cancelBrowseLongPress,
    consumeSuppressedNoteClick,
    clearNotePressTracking
  } = useBoardNoteDrag({
    workspaceEditMode,
    isZoomingRef,
    transformScale: transform.scale,
    notes,
    frames,
    selectedNoteIds,
    isSelectingNotePosition,
    isShiftPressed,
    setIsSelectingNotePosition,
    onUpdateNote,
    commitProjectNotes,
    stopAnimations,
    cacheDragRect,
    onBrowseOpenEditor: openBoardNoteEditor,
    onBrowseLongPressStartEdit: enterEditFromTouchLongPress,
    onBeginSingleNoteDrag: (noteId) => {
      setSelectedNoteId(noteId);
      setSelectedNoteIds(new Set([noteId]));
      setSelectedConnectionId(null);
      setSelectedFrameId(null);
    },
    onNoteDragPointerMove: handleBoardNoteDragPointerMove,
    onDropNoteToExternalTarget: handleBoardNoteDropToSidebar
  });

  const { handleNoteClick, handleNoteDoubleClick, clearDeferredClick } = useBoardNoteInteraction({
    workspaceEditMode,
    isZoomingRef,
    isShiftPressed,
    notes,
    setSelectedNoteId,
    setSelectedNoteIds,
    setSelectedConnectionId,
    setSelectedFrameId,
    onOpenNoteEditor: openBoardNoteEditor
  });

  const browseTagLabelsInSelection = useMemo(
    () => collectSortedUniqueTagLabelsFromSelection(selectedNoteIds, notes),
    [selectedNoteIds, notes]
  );
  const browseSelectionHasUntagged = useMemo(
    () => selectionHasUntaggedNotes(selectedNoteIds, notes),
    [selectedNoteIds, notes]
  );
  const browseTimeSelectionHasTimedNotes = useMemo(
    () => selectionHasTimedNotesInSelection(selectedNoteIds, notes),
    [selectedNoteIds, notes]
  );
  const browseTagFilterCanApply = useMemo(
    () =>
      browseTagFilterPendingDefault ||
      browseTagFilterPendingUntagged ||
      browseTagFilterPendingLabels.size > 0,
    [
      browseTagFilterPendingDefault,
      browseTagFilterPendingUntagged,
      browseTagFilterPendingLabels,
    ]
  );

  const applyBrowseTagFilterFromPanel = () => {
    if (!browseTagFilterCanApply) return;
    let nextIds: Set<string>;
    if (browseTagFilterPendingDefault) {
      nextIds = new Set(selectedNoteIds);
    } else {
      const labelSet = new Set(browseTagFilterPendingLabels);
      const incU = browseTagFilterPendingUntagged;
      nextIds = new Set<string>();
      notes.forEach((n) => {
        if (!selectedNoteIds.has(n.id)) return;
        if (noteMatchesBoardTagFilter(n, labelSet, incU)) nextIds.add(n.id);
      });
    }
    setBoardFilterTagLabels(new Set());
    setBoardFilterIncludeUntagged(false);
    setSelectedNoteIds(nextIds);
    setSelectedNoteId(nextIds.size === 0 ? null : Array.from(nextIds)[0]);
    setBrowseTagFilterPanelOpen(false);
  };

  const applyBrowseTimeFilterFromPanel = () => {
    setBoardFilterTimeRange(null);
    if (!browseTimeSelectionHasTimedNotes) {
      setBrowseTimeFilterPanelOpen(false);
      return;
    }
    const range = {
      min: browseTimeFilterPendingMin,
      max: browseTimeFilterPendingMax,
    };
    const nextIds = new Set<string>();
    notes.forEach((n) => {
      if (!selectedNoteIds.has(n.id)) return;
      if (noteTimeRangeFullyContainedInFilter(n, range)) nextIds.add(n.id);
    });
    setSelectedNoteIds(nextIds);
    setSelectedNoteId(nextIds.size === 0 ? null : Array.from(nextIds)[0]);
    setBrowseTimeFilterPanelOpen(false);
  };

  const browseFilterLayoutRevision = useMemo(
    () =>
      JSON.stringify({
        edit: workspaceEditMode,
        ids: [...selectedNoteIds].sort(),
        tx: transform.x,
        ty: transform.y,
        ts: transform.scale,
        mdrag: isMultiSelectDragging,
        mdx: multiSelectDragOffset.x,
        mdy: multiSelectDragOffset.y
      }),
    [
      workspaceEditMode,
      selectedNoteIds,
      transform.x,
      transform.y,
      transform.scale,
      isMultiSelectDragging,
      multiSelectDragOffset.x,
      multiSelectDragOffset.y
    ]
  );

  const notePassesBoardVisibilityFilters = useCallback(
    (note: Note) => {
      if (filterFrameIds.size > 0) {
        const groupIds = note.groupIds || (note.groupId ? [note.groupId] : []);
        if (!groupIds.some((id) => filterFrameIds.has(id))) return false;
      }
      const tagFilterActive =
        boardFilterTagLabels.size > 0 || boardFilterIncludeUntagged;
      if (tagFilterActive) {
        if (
          !noteMatchesBoardTagFilter(
            note,
            boardFilterTagLabels,
            boardFilterIncludeUntagged
          )
        ) {
          return false;
        }
      }
      if (
        browseTagFilterPanelOpen &&
        !browseTagFilterPendingDefault
      ) {
        if (!selectedNoteIds.has(note.id)) return false;
        if (
          !noteMatchesBoardTagFilter(
            note,
            browseTagFilterPendingLabels,
            browseTagFilterPendingUntagged
          )
        ) {
          return false;
        }
      }
      if (
        browseTimeFilterPanelOpen &&
        browseTimeSelectionHasTimedNotes
      ) {
        if (!selectedNoteIds.has(note.id)) return false;
        if (
          !noteTimeRangeFullyContainedInFilter(note, {
            min: browseTimeFilterPendingMin,
            max: browseTimeFilterPendingMax,
          })
        ) {
          return false;
        }
      }
      if (boardFilterTimeRange != null) {
        if (!noteTimeRangeFullyContainedInFilter(note, boardFilterTimeRange))
          return false;
      }
      return true;
    },
    [
      filterFrameIds,
      boardFilterTagLabels,
      boardFilterIncludeUntagged,
      boardFilterTimeRange,
      browseTagFilterPanelOpen,
      browseTagFilterPendingDefault,
      browseTagFilterPendingLabels,
      browseTagFilterPendingUntagged,
      browseTimeFilterPanelOpen,
      browseTimeSelectionHasTimedNotes,
      browseTimeFilterPendingMin,
      browseTimeFilterPendingMax,
      selectedNoteIds,
    ]
  );

  // Keyboard shift key support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        setIsShiftPressed(true);
      }
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        setIsShiftPressed(false);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  useBoardFrameGroupShortcut({
    notes,
    project,
    onUpdateProject,
    selectedNoteIds,
    setSelectedNoteIds
  });

  useEffect(() => {
    // 退出编辑模式时清除选中和长按状态
    if (!workspaceEditMode) {
      setSelectedConnectionId(null);
      setSelectedFrameId(null); // 清除frame选中状态
      setSelectedNoteIds(new Set()); // Clear multi-select
      setIsShiftPressed(false);
      cancelBrowseLongPress();
      clearNotePressTracking();
      clearDeferredClick();
    }
  }, [workspaceEditMode, cancelBrowseLongPress, clearNotePressTracking, clearDeferredClick]);

  // 更新所有 Note 的分组信息（一便签只属于一个 frame：重叠时取第一个）
  const updateNoteGroups = () => {
    const { notes: updatedNotes, changed } = syncNotesToContainingFrames(notes, frames);
    if (changed && project) {
      console.log('Batch updating note groups');
      onUpdateProject({
        ...project,
        notes: updatedNotes
      });
    }
  };

  // 当Frame变化时更新分组
  useEffect(() => {
    // 只有在非拖拽/调整大小时才自动更新分组，避免冲突
    if (!draggingFrameId && !resizingFrame && !draggingNoteId && !isMultiSelectDragging) {
      updateNoteGroups();
    }
  }, [frames, draggingFrameId, resizingFrame, draggingNoteId, isMultiSelectDragging]);

  // Apply initial transform when project changes or container is ready
  const lastProjectIdRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!containerRef.current || !projectId) return;
    
    // Only auto-initialize if the project has changed or it's the first time
    if (lastProjectIdRef.current !== projectId || (transform.x === 0 && transform.y === 0 && transform.scale === 1)) {
      lastProjectIdRef.current = projectId;
      const initial = calculateInitialTransform();
      
      // Only set if different enough to avoid unnecessary updates
      setTransform(prev => {
        if (Math.abs(prev.x - initial.x) > 0.1 ||
            Math.abs(prev.y - initial.y) > 0.1 ||
            Math.abs(prev.scale - initial.scale) > 0.01) {
          return initial;
        }
        return prev;
      });
    }
  }, [projectId, calculateInitialTransform]); // 首帧绘制前恢复，避免默认缩放闪现


  // Zoom to Fit on Enter Edit Mode with animation
  useEffect(() => {
    const placedNotes = notes.filter(isNoteBoardPlaced);
    if (workspaceEditMode && placedNotes.length > 0 && containerRef.current) {
        if (skipNextEditModeZoomRef.current) {
            skipNextEditModeZoomRef.current = false;
            return;
        }
        // Wait for DOM to render and measure text notes
        const calculateBounds = () => {
            const { width: cW, height: cH } = containerRef.current.getBoundingClientRect();
            const endTransform = fitBoardNotesForEditMode(notes, { width: cW, height: cH });
            if (!endTransform) return;

            // 使用动画过渡
            const startTransform = { ...transform };
            const duration = 400; // 400ms 动画
            const startTime = Date.now();
            
            const animate = () => {
              const elapsed = Date.now() - startTime;
              const progress = Math.min(elapsed / duration, 1);
              // 使用 easeOutCubic 缓动函数
              const eased = 1 - Math.pow(1 - progress, 3);
              
              setTransform({
                x: startTransform.x + (endTransform.x - startTransform.x) * eased,
                y: startTransform.y + (endTransform.y - startTransform.y) * eased,
                scale: startTransform.scale + (endTransform.scale - startTransform.scale) * eased
              });
              
              if (progress < 1) {
                animationFrameRef.current = requestAnimationFrame(animate);
              } else {
                animationFrameRef.current = null;
              }
            };
            
            animationFrameRef.current = requestAnimationFrame(animate);
        };

        // Wait a frame for DOM to render text notes
        requestAnimationFrame(() => {
            // Give text notes time to measure
            setTimeout(calculateBounds, 50);
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceEditMode]);

  // Navigate to specific coordinates when navigateToCoords is set, or restore saved transform
  useEffect(() => {
    if (!containerRef.current || !projectId) return;
    
    if (navigateToCoords) {
      // ... same logic ...
    } else {
      // Only restore if transform is still at default (0,0,1) - meaning it's never been set by user
      if (transform.x === 0 && transform.y === 0 && transform.scale === 1) {
        const initial = calculateInitialTransform();
        if (Math.abs(initial.x - transform.x) > 0.1 ||
            Math.abs(initial.y - transform.y) > 0.1 ||
            Math.abs(initial.scale - transform.scale) > 0.01) {
          setTransform(initial);
          onNavigateComplete?.();
        }
      }
    }
  }, [navigateToCoords, projectId]); // Significant reduction in dependencies

  // 在指定位置创建便签（board 坐标；光标为中心，与预览框一致，不做网格吸附）
  const createNoteAtPosition = (
    boardX: number,
    boardY: number,
    waitForLongPressRelease = false
  ) => {
    const noteWidth = 256;
    const noteHeight = 256;
    const placeX = boardX - noteWidth / 2;
    const placeY = boardY - noteHeight / 2;

    const newNote: Note = {
      id: generateId(),
      createdAt: Date.now(),
      coords: { lat: 0, lng: 0 },
      emoji: '',
      text: '',
      fontSize: 3,
      images: [],
      tags: [],
      boardX: placeX,
      boardY: placeY,
      variant: 'standard',
      color: '#FFFDF5'
    };
    beginNewBoardNoteIntro(newNote);
    if (waitForLongPressRelease) {
      boardLongPressPreviewNoteRef.current = newNote;
    } else {
      openNewBoardNoteEditorAfterIntro();
    }
    setIsSelectingNotePosition(false);
  };

  const clearBoardLongPress = useCallback(() => {
    if (boardLongPressTimerRef.current !== null) {
      window.clearTimeout(boardLongPressTimerRef.current);
      boardLongPressTimerRef.current = null;
    }
    boardLongPressStartRef.current = null;
  }, []);

  useEffect(() => clearBoardLongPress, [clearBoardLongPress]);

  const commitBoardLongPressPreview = useCallback(() => {
    const note = boardLongPressPreviewNoteRef.current;
    if (!note) return;
    boardLongPressPreviewNoteRef.current = null;
    const edit = { noteId: note.id, value: '' };
    inlineTitleEditRef.current = edit;
    setInlineTitleEdit(edit);
    setEditingNote(null);
    setIsIntroPending(false);
    onToggleEditor(false);
  }, [onToggleEditor, setEditingNote, setIsIntroPending]);

  const cancelBoardLongPressPreview = useCallback(() => {
    boardLongPressPreviewNoteRef.current = null;
    cancelPendingNoteIntro();
  }, [cancelPendingNoteIntro]);

  const cancelTransientBoardInteraction = useCallback(
    (pointerId?: number) => {
      const active = interactionRef.current;
      if (
        pointerId != null &&
        active.kind !== 'idle' &&
        active.pointerId !== pointerId
      ) {
        return;
      }
      clearBoardLongPress();
      if (boardLongPressTriggeredRef.current) cancelBoardLongPressPreview();
      boardLongPressTriggeredRef.current = false;
      resetInteraction(pointerId);
      if (pointerId == null) releaseAllPointers();
      else releasePointer(pointerId);
      setBoxSelectStart(null);
      setBoxSelectEnd(null);
      setDrawingFrameStart(null);
      setDrawingFrameEnd(null);
      setLocalDraggingFramePos(null);
      setLocalResizingFrameSize(null);
      if (imageResizeSettleTimerRef.current) {
        clearTimeout(imageResizeSettleTimerRef.current);
        imageResizeSettleTimerRef.current = null;
      }
      setLocalResizingImageSize(null);
      clearSelectionScalePreview();
      dragRectRef.current = null;
    },
    [
      cancelBoardLongPressPreview,
      clearBoardLongPress,
      clearSelectionScalePreview,
      interactionRef,
      releaseAllPointers,
      releasePointer,
      resetInteraction
    ]
  );

  useEffect(() => {
    const handleWindowBlur = () => cancelTransientBoardInteraction();
    window.addEventListener('blur', handleWindowBlur);
    return () => window.removeEventListener('blur', handleWindowBlur);
  }, [cancelTransientBoardInteraction]);

  const boardObjectContainsPosition = useCallback(
    (boardX: number, boardY: number) => {
      const fallsInside = (x: number, y: number, width: number, height: number) =>
        boardX >= x && boardX <= x + width && boardY >= y && boardY <= y + height;

      return (
        notes.some((note) => {
          const { width, height } = boardNoteDimensions(note);
          return fallsInside(note.boardX, note.boardY, width, height);
        }) || frames.some((frame) => fallsInside(frame.x, frame.y, frame.width, frame.height))
      );
    },
    [frames, notes]
  );

  const startBoardLongPress = useCallback(
    (e: React.PointerEvent) => {
      if (
        e.button !== 0 ||
        isSelectingNotePosition ||
        isDrawingFrame ||
        isBoxSelecting ||
        isZooming ||
        resizingFrame ||
        resizingImage ||
        draggingFrameId
      ) {
        return;
      }
      const target = e.target as HTMLElement;
      if (target.closest('[data-is-note], button, input, select, textarea, a')) return;
      if (target !== e.currentTarget && target.closest('.pointer-events-auto')) return;
      const rect = dragRectRef.current || containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const { x: boardX, y: boardY } = clientToBoardPoint(
        clientPoint(e.clientX, e.clientY),
        rect,
        transform
      );
      if (boardObjectContainsPosition(boardX, boardY)) return;

      clearBoardLongPress();
      boardLongPressTriggeredRef.current = false;
      boardLongPressStartRef.current = { clientX: e.clientX, clientY: e.clientY, boardX, boardY };
      boardLongPressTimerRef.current = window.setTimeout(() => {
        boardLongPressTimerRef.current = null;
        const press = boardLongPressStartRef.current;
        if (!press || boardObjectContainsPosition(press.boardX, press.boardY)) return;
        boardLongPressTriggeredRef.current = true;
        resetInteraction();
        if (navigator.vibrate) navigator.vibrate(VIBRATION_MEDIUM);
        createNoteAtPosition(press.boardX, press.boardY, true);
      }, 500);
    },
    [
      boardObjectContainsPosition,
      clearBoardLongPress,
      draggingFrameId,
      isBoxSelecting,
      isDrawingFrame,
      isSelectingNotePosition,
      isZooming,
      resizingFrame,
      resizingImage,
      resetInteraction,
      transform.scale,
      transform.x,
      transform.y
    ]
  );

  useBoardCanvasNavigation({
    containerRef,
    transformRef,
    setTransform,
    isZoomingRef,
    setIsZooming,
    interactionRef,
    resetInteraction,
    releaseAllPointers,
    cancelBrowseLongPress,
    onTransformChange
  });

  const handleBoardPointerMoveController = createBoardPointerMoveHandler({
    containerRef,
    dragRectRef,
    transform,
    transformRef,
    interactionRef,
    longPressStartRef: boardLongPressStartRef,
    clearLongPress: clearBoardLongPress,
    isSelectingNotePosition,
    setNotePositionPreview,
    isShiftPressed,
    notes,
    selectedNoteIds,
    boxSelectStart,
    setBoxSelectEnd,
    setDrawingFrameEnd,
    setSelectedNoteIds,
    setLocalDraggingFramePos,
    setLocalResizingFrameSize,
    setLocalResizingImageSize,
    selectionScaleStartPosesRef,
    setSelectionScalePreview,
    isZoomingRef,
    updatePanning,
    setTransform
  });

  const handleBoardPointerDownController = createBoardPointerDownHandler({
    containerRef,
    dragRectRef,
    transform,
    interactionRef,
    stopAnimations,
    isDrawingFrame,
    workspaceEditMode,
    setIsDrawingFrame,
    beginDrawingFrame,
    setDrawingFrameStart,
    setDrawingFrameEnd,
    startBoardLongPress,
    cancelBrowseLongPress,
    onBlankPointerDown: commitInlineTitle,
    isBoxSelectToolActive: () => boxSelectToolActiveRef.current,
    isShiftPressed,
    draggingNoteId,
    isResizingImage: Boolean(resizingImage),
    beginBoxSelecting,
    setBoxSelectStart,
    setBoxSelectEnd,
    setSelectedNoteIds,
    setSelectedNoteId,
    beginPanning,
    capturePointer
  });

  const handleBoardPointerUpController = createBoardPointerUpHandler({
    containerRef,
    dragRectRef,
    transform,
    transformRef,
    interactionRef,
    boardLongPressTriggeredRef,
    clearBoardLongPress,
    commitBoardLongPressPreview,
    resetInteraction,
    releasePointer,
    selectionScalePreview,
    selectionScaleStartPosesRef,
    selectionScaleSettleExpectedRef,
    selectionScaleSettleTimerRef,
    clearSelectionScalePreview,
    notes,
    frames,
    applyProjectNotes: commitProjectNotes,
    localResizingFrameSize,
    setLocalResizingFrameSize,
    localResizingImageSize,
    setLocalResizingImageSize,
    localDraggingFramePos,
    setLocalDraggingFramePos,
    isWaitingForSyncRef,
    imageResizeSettleTimerRef,
    onUpdateFrames,
    onUpdateNote,
    drawingFrameEnd,
    selectedNoteIds,
    isDrawingFrame,
    setIsDrawingFrame,
    setBoxSelectStart,
    setBoxSelectEnd,
    setDrawingFrameStart,
    setDrawingFrameEnd,
    setSelectedFrameId,
    setEditingFrameId,
    setEditingFrameTitle,
    movementFromOrigin,
    onTransformChange,
    isMultiSelectDragging,
    isZooming,
    isSelectingNotePosition,
    createNoteAtPosition,
    editingFrameId,
    selectedFrameId,
    selectedNoteId,
    selectedConnectionId,
    isShiftPressed,
    setSelectedNoteId,
    setSelectedNoteIds,
    setSelectedConnectionId,
    workspaceEditMode,
    filterFrameIds,
    boardFilterTagLabels,
    boardFilterIncludeUntagged,
    boardFilterTimeRange,
    setFilterFrameIds,
    setBoardFilterTagLabels,
    setBoardFilterIncludeUntagged,
    setBoardFilterTimeRange
  });

  // A note layer may deliberately stop a bubbling pointer-up for its own drag.
  // A marquee's pointer is captured by the canvas, so end its b-state during
  // capture before a child can absorb that release. Other pointer-up flows
  // keep their existing bubbling behaviour.
  const handleBoxSelectPointerUpCapture = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (interactionRef.current.kind !== 'box-selecting') return;
      event.stopPropagation();
      handleBoardPointerUpController(event);
    },
    [handleBoardPointerUpController, interactionRef]
  );

  const handleBoxSelectPointerCancelCapture = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (interactionRef.current.kind !== 'box-selecting') return;
      event.stopPropagation();
      cancelTransientBoardInteraction(event.pointerId);
    },
    [cancelTransientBoardInteraction, interactionRef]
  );

  const handleBoxSelectLostPointerCapture = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (interactionRef.current.kind === 'box-selecting') {
        cancelTransientBoardInteraction(event.pointerId);
      }
    },
    [cancelTransientBoardInteraction, interactionRef]
  );

  const handleBoardDoubleClick = (e: React.MouseEvent) => {
    // 仅空白画布生效：子元素（便签/连线/frame 等）上的双击由各自逻辑处理
    if (e.target !== e.currentTarget) return;
    if (isZooming) return;

    // 双击空白画布：编辑模式下退出编辑；非编辑模式只做一次选中清理（幂等）
    setSelectedFrameId(null);
    setSelectedNoteId(null);
    setSelectedNoteIds(new Set());
    setSelectedConnectionId(null);
    if (workspaceEditMode) {
      onWorkspaceEditModeChange(false);
      setBoxSelectToolActive(false);
      setBoxSelectStart(null);
      setBoxSelectEnd(null);
      setIsDrawingFrame(false);
      setDrawingFrameStart(null);
      setDrawingFrameEnd(null);
      setEditingFrameId(null);
    }
  };

  const handleFrameSelect = useCallback(
    (frameId: string) => {
      if (isZooming || !workspaceEditMode) return;
      setSelectedFrameId(frameId);
      setSelectedNoteId(null);
      setSelectedConnectionId(null);
    },
    [isZooming, workspaceEditMode]
  );

  const handleFrameDragStart = useCallback(
    (event: React.PointerEvent<HTMLDivElement>, frame: Frame) => {
      event.stopPropagation();
      stopAnimations();
      if (!workspaceEditMode || isZooming) return;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      dragRectRef.current = rect;
      const boardPoint = clientToBoardPoint(
        clientPoint(event.clientX, event.clientY),
        rect,
        transform
      );
      beginDraggingFrame(event.pointerId, frame.id, {
        x: boardPoint.x - frame.x,
        y: boardPoint.y - frame.y
      });
      setSelectedFrameId(frame.id);
      setSelectedNoteId(null);
      setSelectedConnectionId(null);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [
      beginDraggingFrame,
      isZooming,
      stopAnimations,
      transform.scale,
      transform.x,
      transform.y,
      workspaceEditMode
    ]
  );

  const handleFrameResizeStart = useCallback(
    (
      event: React.PointerEvent<HTMLDivElement>,
      frame: Frame,
      corner: BoardFrameResizeCorner
    ) => {
      event.stopPropagation();
      stopAnimations();
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      dragRectRef.current = rect;
      const { x: worldX, y: worldY } = clientToBoardPoint(
        clientPoint(event.clientX, event.clientY),
        rect,
        transform
      );
      const fixedX = corner.includes('left') ? frame.x + frame.width : frame.x;
      const fixedY = corner.includes('top') ? frame.y + frame.height : frame.y;
      beginResizingFrame(event.pointerId, frame.id, fixedX, fixedY);
      setLocalResizingFrameSize({
        x: Math.min(fixedX, worldX),
        y: Math.min(fixedY, worldY),
        width: Math.max(100, Math.abs(fixedX - worldX)),
        height: Math.max(100, Math.abs(fixedY - worldY))
      });
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [beginResizingFrame, stopAnimations, transform.scale, transform.x, transform.y]
  );

  const handleSelectionScaleStart = useCallback(
    (event: React.PointerEvent<HTMLDivElement>, corner: SelectionScaleCorner) => {
      event.stopPropagation();
      event.preventDefault();
      if (!workspaceEditMode || selectedNoteIds.size < 2 || isZoomingRef.current) return;
      stopAnimations();
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      dragRectRef.current = rect;

      const selected = notes.filter((n) => selectedNoteIds.has(n.id));
      const bounds = computeSelectionContentBounds(selected);
      if (!bounds) return;

      const fixed = selectionFixedPoint(bounds, corner);
      const moving = selectionMovingCorner(bounds, corner);
      const startPoses = snapshotSelectionPoses(notes, selectedNoteIds);
      if (startPoses.size < 2) return;

      selectionScaleSettleExpectedRef.current = null;
      if (selectionScaleSettleTimerRef.current) {
        clearTimeout(selectionScaleSettleTimerRef.current);
        selectionScaleSettleTimerRef.current = null;
      }
      selectionScaleStartPosesRef.current = startPoses;
      setSelectionScalePreview(scaledSelectionPositions(startPoses, fixed, { scaleX: 1, scaleY: 1 }));
      beginScalingSelection(event.pointerId, {
        corner,
        fixedX: fixed.x,
        fixedY: fixed.y,
        startMovingX: moving.x,
        startMovingY: moving.y
      });
      capturePointer(event.pointerId);
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
    },
    [
      beginScalingSelection,
      capturePointer,
      notes,
      selectedNoteIds,
      stopAnimations,
      workspaceEditMode
    ]
  );

  const handleSelectionChromeHandleStart = useCallback(
    (event: React.PointerEvent<HTMLDivElement>, corner: SelectionScaleCorner) => {
      if (selectedNoteIds.size > 1) {
        handleSelectionScaleStart(event, corner);
        return;
      }
      event.stopPropagation();
      event.preventDefault();
      if (!workspaceEditMode || selectedNoteIds.size !== 1 || isZoomingRef.current) return;
      const note = notes.find((n) => selectedNoteIds.has(n.id));
      if (!note || !noteRendersAsBoardSticker(note)) return;
      stopAnimations();
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      dragRectRef.current = rect;
      const preview = localResizingImageSize?.id === note.id ? localResizingImageSize : null;
      const { width, height } = boardNoteDimensions(note);
      beginResizingImage(event.pointerId, {
        id: note.id,
        corner,
        startWidth: preview?.width ?? width,
        startHeight: preview?.height ?? height,
        startBoardX: preview?.x ?? note.boardX,
        startBoardY: preview?.y ?? note.boardY
      });
      capturePointer(event.pointerId);
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
    },
    [
      beginResizingImage,
      capturePointer,
      handleSelectionScaleStart,
      localResizingImageSize,
      notes,
      selectedNoteIds,
      stopAnimations,
      workspaceEditMode
    ]
  );

  const enterBoardEditMode = useCallback(() => {
    if (isSelectingNotePosition) setIsSelectingNotePosition(false);
    onWorkspaceEditModeChange(true);
  }, [isSelectingNotePosition, onWorkspaceEditModeChange]);

  const exitBoardEditMode = useCallback(() => {
    if (isSelectingNotePosition) setIsSelectingNotePosition(false);
    onWorkspaceEditModeChange(false);
    setBoxSelectToolActive(false);
    setBoxSelectStart(null);
    setBoxSelectEnd(null);
    setIsDrawingFrame(false);
    setDrawingFrameStart(null);
    setDrawingFrameEnd(null);
    setSelectedFrameId(null);
    resetInteraction();
    setLocalDraggingFramePos(null);
    setLocalResizingFrameSize(null);
    setLocalResizingImageSize(null);
    setEditingFrameTitle('');
    setEditingFrameId(null);
  }, [isSelectingNotePosition, onWorkspaceEditModeChange, resetInteraction, setBoxSelectToolActive]);

  return (
    <div
        id="board-view-container"
        className={`w-full h-full relative overflow-hidden`}
        style={{
            boxShadow: workspaceEditMode 
                ? `inset 0 0 0 8px ${themeColor}, inset 0 0 0 12px ${themeColor}4D, inset 0 0 80px ${themeColor}26` 
                : 'none'
        }}
    >
      <BoardCanvasShell
        containerRef={containerRef}
        isDark={chromeAppearance === 'dark'}
        isPanning={isPanning}
        imageFileInputRef={boardImport.imageFileInputRef}
        onImageInputChange={boardImport.handleImageInputChange}
        onPointerDown={handleBoardPointerDownController}
        onPointerMove={handleBoardPointerMoveController}
        onPointerLeave={() => {
          clearBoardLongPress();
          if (isSelectingNotePosition) setNotePositionPreview(null);
        }}
        onDragEnter={boardImport.handleDragEnter}
        onDragOver={boardImport.handleDragOver}
        onDrop={boardImport.handleDrop}
        onPointerUpCapture={handleBoxSelectPointerUpCapture}
        onPointerUp={handleBoardPointerUpController}
        onPointerCancelCapture={handleBoxSelectPointerCancelCapture}
        onPointerCancel={(event) => cancelTransientBoardInteraction(event.pointerId)}
        onLostPointerCapture={handleBoxSelectLostPointerCapture}
        onDoubleClick={handleBoardDoubleClick}
      >
        <BoardScene transform={transform}>
          <BoardCanvasFeedback
            themeColor={themeColor}
            frameChromeStyle={frameChromeStyle}
            isSelectingNotePosition={isSelectingNotePosition}
            notePositionPreview={notePositionPreview}
            isBoxSelectGestureActive={isBoxSelectGestureActive}
            boxSelectStart={boxSelectStart}
            boxSelectEnd={boxSelectEnd}
            isDrawingFrame={isDrawingFrame}
            drawingFrameStart={drawingFrameStart}
            drawingFrameEnd={drawingFrameEnd}
          />
          
          <BoardFrameBodies
            frames={frames}
            visible={layerVisibility.frame}
            filterFrameIds={filterFrameIds}
            selectedFrameId={selectedFrameId}
            draggingFrameId={draggingFrameId}
            draggingPreview={localDraggingFramePos}
            resizingFrameId={resizingFrame?.id}
            resizingPreview={localResizingFrameSize}
            workspaceEditMode={workspaceEditMode}
            canvasScale={transform.scale}
            themeColor={themeColor}
            chromeStyle={frameChromeStyle}
            frameTint={frameTintFromHex}
            onSelect={handleFrameSelect}
            onDragStart={handleFrameDragStart}
            onResizeStart={handleFrameResizeStart}
          />
          
          {/* Frame Titles Layer - Above Notes - 标题始终显示以便多选 */}
          {layerVisibility.frame && frames.map((frame) => {
            const display = resolveBoardFrameLayout(frame, {
              draggingFrameId,
              draggingPreview: localDraggingFramePos,
              resizingFrameId: resizingFrame?.id,
              resizingPreview: localResizingFrameSize
            });

            const frameTitleTint = resolveBoardFrameTitleTint({
              frameId: frame.id,
              filterFrameIds,
              selectedFrameId,
              themeColor,
              frameTint: frameTintFromHex
            });

            return (
            <React.Fragment key={frame.id}>
              <div
                key={`title-${frame.id}`}
                data-board-export-frame=""
                className={`absolute -top-8 left-0 rounded-lg shadow-md flex flex-col pointer-events-auto overflow-hidden border ${
                  ch ? 'border-gray-200/70' : 'border-white/45'
                }`}
                style={{
                  left: `${display.x}px`,
                  top: `${display.y - 32}px`,
                  zIndex: selectedFrameId === frame.id ? 1500 : 201,
                  cursor: draggingFrameId === frame.id ? 'grabbing' : 'grab',
                  transform: `scale(${1 / transform.scale})`,
                  transformOrigin: 'top left',
                  wordBreak: 'keep-all',
                  opacity: filterFrameIds.size > 0 && !filterFrameIds.has(frame.id) ? 0.3 : 1,
                }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                setEditingFrameId(frame.id);
                setEditingFrameTitle(frame.title);
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (isZooming) return;
                if (workspaceEditMode) {
                  setSelectedFrameId(frame.id);
                  setSelectedNoteId(null);
                  setSelectedConnectionId(null);
                } else {
                  // 非编辑模式下，点击frame标题进行过滤（支持shift多选）
                  const newFilterFrameIds = new Set(filterFrameIds);
                  if (isShiftPressed) {
                    // Shift+点击：切换该frame的选中状态
                    if (newFilterFrameIds.has(frame.id)) {
                      newFilterFrameIds.delete(frame.id);
                    } else {
                      newFilterFrameIds.add(frame.id);
                    }
                  } else {
                    // 普通点击：如果已选中则取消，否则只选中这一个
                    if (newFilterFrameIds.has(frame.id)) {
                      // 如果已选中，则取消选中
                      newFilterFrameIds.delete(frame.id);
                    } else {
                      // 如果未选中，则只选中这一个
                      newFilterFrameIds.clear();
                      newFilterFrameIds.add(frame.id);
                    }
                  }
                  setFilterFrameIds(newFilterFrameIds);
                }
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
                stopAnimations();
                if (!workspaceEditMode || editingFrameId === frame.id || isZooming) return;
                const rect = dragRectRef.current || containerRef.current?.getBoundingClientRect();
                if (!rect) return;
                dragRectRef.current = rect;
                const boardPoint = clientToBoardPoint(
                  clientPoint(e.clientX, e.clientY),
                  rect,
                  transform
                );
                beginDraggingFrame(e.pointerId, frame.id, {
                  x: boardPoint.x - frame.x,
                  y: boardPoint.y - frame.y
                });
                setSelectedFrameId(frame.id);
                setSelectedNoteId(null);
                setSelectedConnectionId(null);
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              }}
            >
                <div className="absolute inset-0 pointer-events-none" style={frameChromeStyle} />
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{ backgroundColor: frameTitleTint }}
                />
                <div className="relative z-10 flex items-center gap-2 px-3 py-1 text-theme-chrome-fg text-sm font-bold whitespace-nowrap">
              {editingFrameId === frame.id ? (
                <>
                  <input
                    ref={(input) => {
                      frameTitleInputRef.current = input;
                      // Auto focus when editing starts
                      if (input && editingFrameId === frame.id) {
                        setTimeout(() => input.focus(), 0);
                      }
                    }}
                    value={editingFrameTitle}
                    onChange={(e) => setEditingFrameTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        // Save title
                        const saveTitle = () => {
                          onUpdateFrames?.(frames.map(f => 
                            f.id === frame.id ? { ...f, title: editingFrameTitle || 'Frame' } : f
                          ));
                          setEditingFrameId(null);
                        };
                        saveTitle();
                      } else if (e.key === 'Escape') {
                        // Cancel editing, restore original title
                        setEditingFrameTitle(frame.title);
                        setEditingFrameId(null);
                      }
                    }}
                    onBlur={(e) => {
                      // Save title when clicking outside, but not when clicking the save button
                      const relatedTarget = e.relatedTarget as HTMLElement;
                      if (!relatedTarget || !frameTitleSaveButtonRef.current?.contains(relatedTarget)) {
                        // Use setTimeout to allow button click to process first
                        setTimeout(() => {
                          if (editingFrameId === frame.id) {
                            onUpdateFrames?.(frames.map(f => 
                              f.id === frame.id ? { ...f, title: editingFrameTitle || 'Frame' } : f
                            ));
                            setEditingFrameId(null);
                          }
                        }, 200);
                      }
                    }}
                    className="bg-transparent text-theme-chrome-fg px-2 py-0.5 rounded outline-none text-sm"
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                  />
                  <button
                    ref={(button) => {
                      frameTitleSaveButtonRef.current = button;
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    onMouseDown={(e) => {
                      e.preventDefault(); // Prevent input blur
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      // Save title
                      onUpdateFrames?.(frames.map(f => 
                        f.id === frame.id ? { ...f, title: editingFrameTitle || 'Frame' } : f
                      ));
                      setEditingFrameId(null);
                    }}
                    className="hover:bg-green-600 rounded p-0.5 transition-colors"
                  >
                    <Check size={14} />
                  </button>
                </>
              ) : (
                <span className="whitespace-nowrap" style={{ wordBreak: 'keep-all' }}>{frame.title}</span>
              )}
              {workspaceEditMode && selectedFrameId === frame.id && editingFrameId !== frame.id && (
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onPointerUp={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    if (isZooming) return;
                    console.log('Deleting frame:', frame.id);
                    const newFrames = frames.filter(f => f.id !== frame.id);
                    onUpdateFrames?.(newFrames);
                    setSelectedFrameId(null);
                  }}
                  className="hover:bg-red-600 rounded p-0.5 transition-colors"
                >
                  <Minus size={14} />
                </button>
              )}
                </div>
            </div>
            </React.Fragment>
          )          })}

          <BoardNoteLayer
            notes={boardDisplayNotes}
            frames={frames}
            leavingNoteIds={leavingBoardNoteIds}
            isNoteVisible={(note) =>
              notePassesBoardVisibilityFilters(note) &&
              isNoteVisibleInUnifiedLayer(note, mergedProjectBoardLayers, graphLayerGroupStandard)
            }
            showImages={layerVisibility.image}
            showNotes={layerVisibility.primary}
            workspaceEditMode={workspaceEditMode}
            standardSizeScale={project?.standardSizeScale || 1}
            selectedNoteId={selectedNoteId}
            selectedNoteIds={selectedNoteIds}
            draggingNoteId={draggingNoteId}
            dragOffset={dragOffset}
            isMultiSelectDragging={isMultiSelectDragging}
            multiSelectDragOffset={multiSelectDragOffset}
            imageResizePreview={localResizingImageSize}
            selectionScalePreview={selectionScalePreview}
            introNoteId={introNote?.id ?? null}
            introNoteMotion={introNoteMotion}
            enteringNoteIds={enteringNoteIds}
            deletingNoteIds={deletingNoteIds}
            inlineEditingNoteId={inlineTitleEdit?.noteId}
            inlineTitleDraft={inlineTitleEdit?.value}
            onInlineTitleChange={updateInlineTitle}
            onInlineTitleCommit={commitInlineTitle}
            onInlineTitleCancel={cancelInlineTitle}
            onPointerDown={handleNotePointerDown}
            onPointerMove={handleNotePointerMove}
            onPointerUp={handleNotePointerUp}
            onPointerCancel={handleNotePointerCancel}
            consumeSuppressedClick={consumeSuppressedNoteClick}
            onClick={handleNoteClick}
            onDoubleClick={handleNoteDoubleClick}
          />
          {/* 选中包围盒：单选与多选同一套虚线描边 + 工具栏（编辑 / 浏览 Shift 共用） */}
          {selectedNoteIds.size >= 1 && (() => {
            // 被移进待定箱的记录即使父级项目更新尚未回写，也不能继续留在 Board 的选中框里。
            const selectedNotes = selectedBoardNotes;
            if (selectedNotes.length === 0) return null;
            
            const padding = 10;
            const selectionBounds = resolveBoardSelectionBounds(selectedNotes, {
              padding,
              imageResizePreview: localResizingImageSize,
              selectionScalePreview,
              draggingNoteId,
              dragOffset,
              isMultiSelectDragging,
              multiSelectDragOffset
            });
            if (!selectionBounds) return null;

            const stopToolbarEvent = (e: React.SyntheticEvent) => {
              e.stopPropagation();
              e.preventDefault();
            };

            return (
              <BoardSelectionOverlay
                bounds={selectionBounds}
                themeColor={themeColor}
                canvasScale={transform.scale}
                showBoundary={workspaceEditMode && selectedNoteIds.size > 1}
                showScaleHandles={
                  workspaceEditMode &&
                  (selectedNoteIds.size > 1 ||
                    (selectedNotes.length === 1 && noteRendersAsBoardSticker(selectedNotes[0])))
                }
                scaleHandleTitle={
                  selectedNoteIds.size > 1
                    ? '拖动以聚散选中卡片'
                    : '拖动缩放，按住 Shift 可自由变形'
                }
                onScaleStart={handleSelectionChromeHandleStart}
                onElementChange={setSelectionOverlayElement}
              >
                <BoardMultiSelectToolbar
                  themeColor={themeColor}
                  panelChromeStyle={panelChromeStyle}
                  isDark={chromeAppearance === 'dark'}
                  inverseCanvasScale={1}
                  isEditMode={workspaceEditMode}
                  placeBelow={selectionBounds.y < 80 / Math.max(0.05, transform.scale)}
                  portal
                  portalAnchorElement={selectionOverlayElement}
                  portalScope="board-selection"
                  portalZIndex={9000}
                  multiBatchPanel={multiBatchPanel}
                  onExitMultiSelectToolbar={exitMultiSelectToolbar}
                  onToggleBatchTagPanel={() =>
                    setMultiBatchPanel((p) => (p === 'tag' ? 'none' : 'tag'))
                  }
                  onToggleBatchTimePanel={() =>
                    setMultiBatchPanel((p) => (p === 'time' ? 'none' : 'time'))
                  }
                  onRunBatchDelete={runBatchDelete}
                  selectionCount={selectedNoteIds.size}
                  onLocateOnMap={onLocateOnMap}
                  canToggleNoteSize={selectedTextBoardNotes.length > 0}
                  noteSizeExpanded={selectedTextNotesExpanded}
                  onToggleNoteSize={toggleSelectedNoteSize}
                  onBringToFront={() => applyBoardLayerOrder('front')}
                  onSendToBack={() => applyBoardLayerOrder('back')}
                  canGroup={canGroup}
                  canUngroup={canUngroup}
                  onRunGroup={runGroupSelected}
                  onRunUngroup={runUngroupSelected}
                  browseTagFilterPanelOpen={browseTagFilterPanelOpen}
                  browseTimeFilterPanelOpen={browseTimeFilterPanelOpen}
                  boardBrowseTagFilterButtonRef={boardBrowseTagFilterButtonRef}
                  boardBrowseTimeFilterButtonRef={boardBrowseTimeFilterButtonRef}
                  onEnterEditModeFromBrowse={() => {
                    setBrowseTagFilterPanelOpen(false);
                    setBrowseTimeFilterPanelOpen(false);
                    onWorkspaceEditModeChange(true);
                  }}
                  onOpenBrowseTagFilterPanel={() => {
                    setBrowseTagFilterPanelOpen((open) => {
                      if (open) return false;
                      setBrowseTimeFilterPanelOpen(false);
                      setBrowseTagFilterPendingDefault(true);
                      setBrowseTagFilterPendingLabels(new Set());
                      setBrowseTagFilterPendingUntagged(false);
                      return true;
                    });
                  }}
                  onOpenBrowseTimeFilterPanel={() => {
                    setBrowseTagFilterPanelOpen(false);
                    setBrowseTimeFilterPanelOpen((open) => {
                      if (open) return false;
                      const sel = computeTimeRangeFromSelection(selectedNoteIds, notes);
                      const globalSpan = computeTimeRangeFromAllNotes(notes);
                      const fallback = { min: 1900, max: 2100 };
                      if (sel) {
                        let lo = sel.min;
                        let hi = sel.max;
                        if (lo === hi) {
                          lo -= 1;
                          hi += 1;
                        }
                        setBrowseTimeFilterSliderMinBound(lo);
                        setBrowseTimeFilterSliderMaxBound(hi);
                        setBrowseTimeFilterPendingMin(sel.min);
                        setBrowseTimeFilterPendingMax(sel.max);
                      } else {
                        const g = globalSpan ?? fallback;
                        const pad = 2;
                        const lo = g.min - pad;
                        const hi = g.max + pad;
                        setBrowseTimeFilterSliderMinBound(lo);
                        setBrowseTimeFilterSliderMaxBound(hi);
                        setBrowseTimeFilterPendingMin(lo);
                        setBrowseTimeFilterPendingMax(hi);
                      }
                      return true;
                    });
                  }}
                  onStopToolbarEvent={stopToolbarEvent}
                  editPanelNode={
                    <>
                      {workspaceEditMode && multiBatchPanel === 'tag' && (
                        <TagAddPanel
                          themeColor={themeColor}
                          panelChromeStyle={panelChromeStyle}
                          title={
                            selectedNoteIds.size === 1
                              ? '为便签添加标签'
                              : `为 ${selectedNoteIds.size} 个便签添加标签`
                          }
                          label={batchTagLabel}
                          onLabelChange={setBatchTagLabel}
                          selectedColor={TAG_COLORS[batchTagColorIndex % TAG_COLORS.length]}
                          onColorChange={(c) => {
                            const i = TAG_COLORS.indexOf(c);
                            if (i >= 0) setBatchTagColorIndex(i);
                          }}
                          onApply={applyBatchTags}
                          onDismissOutside={dismissBatchTagPanel}
                          dismissIgnoreClosestSelector="[data-board-batch-toolbar-root]"
                        />
                      )}

                      {workspaceEditMode && multiBatchPanel === 'time' && (
                        <BoardBatchTimePanel
                          themeColor={themeColor}
                          panelChromeStyle={panelChromeStyle}
                          selectedCount={selectedNoteIds.size}
                          batchTimeStartStr={batchTimeStartStr}
                          onBatchTimeStartStrChange={setBatchTimeStartStr}
                          batchTimeEndStr={batchTimeEndStr}
                          onBatchTimeEndStrChange={setBatchTimeEndStr}
                          onApply={applyBatchTime}
                        />
                      )}
                    </>
                  }
                />
              </BoardSelectionOverlay>
            );
          })()}
        </BoardScene>

        <BoardTopChrome
          visible={isUIVisible}
          leftToolbarRef={boardToolbarRef}
          onLeftPointerDown={(event) => event.stopPropagation()}
          left={
            <>
                <ChromeIconButton
                  ref={settingsButtonRef}
                  themeColor={themeColor}
                  chromeSurfaceStyle={ch}
                  chromeHoverBackground={chHover}
                  nonChromeIdleHover="imperative-gray100"
                  active={showSettingsPanel}
                  pressThemeFlash
                  onClick={() => {
                    setShowSettingsPanel((v) => !v);
                    setShowLayerPanel(false);
                  }}
                  tooltip="设置"
                >
                  <Settings size={18} className="sm:w-5 sm:h-5" />
                </ChromeIconButton>
                {!workspaceEditMode && (
                <div className="relative" ref={boardLayerBtnRef}>
                    <ChromeIconButton
                        themeColor={themeColor}
                        chromeSurfaceStyle={ch}
                        chromeHoverBackground={chHover}
                        active={showLayerPanel}
                        pressThemeFlash
                        nonChromeIdleHover="imperative-gray100"
                        onClick={() => {
                            setShowLayerPanel(!showLayerPanel);
                            setShowSettingsPanel(false);
                        }}
                        tooltip="筛选"
                    >
                        <LayerToolbarIcon layerGroupStandard={graphLayerGroupStandard} />
                    </ChromeIconButton>
                </div>
                )}
                <ChromeToolbarSlot
                  kind={boardToolbarKind}
                  appearance={chromeAppearance}
                  onClose={() => {
                    setShowLayerPanel(false);
                    setShowSettingsPanel(false);
                  }}
                  top={boardLayerMenuTop}
                  dismissIgnoreRefs={[boardToolbarRef]}
                  resolve={(kind) => {
                    if (kind === 'settings') {
                      return {
                        align: 'start' as const,
                        surface: 'window' as const,
                        backdropLabel: '关闭设置',
                        className: CHROME_TOOLBAR_WINDOW_CLASS,
                        style: panelChromeStyle,
                        role: 'dialog',
                        'aria-label': '设置',
                        children: (
                          <SettingsPanel
                            shell={false}
                            isOpen={showSettingsPanel}
                            onClose={() => setShowSettingsPanel(false)}
                            anchorRef={settingsButtonRef}
                            settingsContextView="board"
                            themeColor={themeColor}
                            onThemeColorChange={onThemeColorChange ?? (() => {})}
                            uiDarkMode={uiDarkMode}
                            onUiDarkModeChange={onUiDarkModeChange}
                            mapUiChromeOpacity={mapUiChromeOpacity}
                            onMapUiChromeOpacityChange={onMapUiChromeOpacityChange ?? (() => {})}
                            mapUiChromeOpacityBottom={mapUiChromeOpacityBottom}
                            onMapUiChromeOpacityBottomChange={onMapUiChromeOpacityBottomChange ?? (() => {})}
                            mapUiChromeBlurPx={mapUiChromeBlurPx}
                            onMapUiChromeBlurPxChange={onMapUiChromeBlurPxChange ?? (() => {})}
                            currentMapStyle={mapStyleId}
                            onMapStyleChange={onMapStyleChange ?? (() => {})}
                            boardVariantToggles={{
                              primary: layerVisibility.primary,
                              image: layerVisibility.image,
                              onChange: (next) =>
                                setLayerVisibility((prev) => ({ ...prev, ...next }))
                            }}
                          />
                        )
                      };
                    }
                    return {
                      align: 'start' as const,
                      surface: 'window' as const,
                      backdropLabel: '关闭筛选',
                      className: CHROME_TOOLBAR_WINDOW_CLASS,
                      style: panelChromeStyle,
                      role: 'dialog',
                      'aria-label': '筛选',
                      children: projectFull ? (
                        <div className="pointer-events-auto flex min-h-0 min-w-0 flex-1 flex-col">
                          <ProjectNotesLayerPanel
                            themeColor={themeColor ?? DEFAULT_THEME_COLOR}
                            variant="dock"
                            flow
                            hosted
                            dockAlign="start"
                            projectId={projectId ?? ''}
                            merged={mergedProjectBoardLayers}
                            layerGroupStandard={graphLayerGroupStandard}
                            onLayerGroupStandardChange={handleBoardLayerStandardChange}
                            onStateChange={handleBoardGraphLayersChange}
                            notes={notes}
                            onUpdateNote={onUpdateNote}
                            onBatchUpdateNotes={handleBoardBatchNotes}
                            frames={frames ?? []}
                            onUpdateFrame={
                              onUpdateFrames || onUpdateProject
                                ? handleBoardUpdateFrame
                                : undefined
                            }
                            onActivateNote={(n) => {
                              panBoardToNoteCenter(n);
                              openBoardNoteEditor(n);
                            }}
                            linkedNoteId={editingNote && !isIntroPending ? editingNote.id : null}
                          />
                        </div>
                      ) : null
                    };
                  }}
                />
            </>
          }
          right={
            <BoardTopRightEditToggle
            isUIVisible={isUIVisible}
            isEditMode={workspaceEditMode}
            themeColor={themeColor}
            chromeSurfaceStyle={panelChromeStyle}
            chromeHoverBackground={chHover}
            onEnterEditMode={enterBoardEditMode}
            onExitEditMode={exitBoardEditMode}
            />
          }
          center={
            <BoardTopCenterEditToolbar
            isEditMode={workspaceEditMode}
            isSelectingNotePosition={isSelectingNotePosition}
            isDrawingFrame={isDrawingFrame}
            isBoxSelecting={isBoxSelecting}
            themeColor={themeColor}
            chromeSurfaceStyle={panelChromeStyle}
            chromeHoverBackground={chHover}
            onEnterEditMode={enterBoardEditMode}
            onExitEditMode={exitBoardEditMode}
            onClearSelectingNotePosition={() => setIsSelectingNotePosition(false)}
            onToggleSelectNotePosition={() => {
              if (isSelectingNotePosition) {
                setIsSelectingNotePosition(false);
              } else {
                setBoxSelectToolActive(false);
                setBoxSelectStart(null);
                setBoxSelectEnd(null);
                setIsDrawingFrame(false);
                setDrawingFrameStart(null);
                setDrawingFrameEnd(null);
                setIsSelectingNotePosition(true);
              }
            }}
            onAddImage={() => {
              if (isSelectingNotePosition) setIsSelectingNotePosition(false);
              boardImport.handleAddImageClick();
            }}
            onEnableDrawFrame={() => {
              if (isSelectingNotePosition) setIsSelectingNotePosition(false);
              setIsDrawingFrame(true);
              setBoxSelectToolActive(false);
              setBoxSelectStart(null);
              setBoxSelectEnd(null);
              setSelectedFrameId(null);
            }}
            onToggleBoxSelect={() => {
              const nextToolActive = !boxSelectToolActiveRef.current;
              setBoxSelectToolActive(nextToolActive);
              // Tool state (a) and gesture state (b) are never reused: a
              // toggle always ends the current gesture without creating one.
              resetInteraction();
              setBoxSelectStart(null);
              setBoxSelectEnd(null);
              if (nextToolActive) {
                setSelectedNoteIds(new Set());
                setSelectedNoteId(null);
                setIsDrawingFrame(false);
                setDrawingFrameStart(null);
                setDrawingFrameEnd(null);
                setIsSelectingNotePosition(false);
              }
            }}
            />
          }
        />

        
        {/* Hidden file inputs */}
        <input
            ref={dataImportInputRef}
            type="file"
            accept=".json,application/json,.csv,text/csv"
            style={{ display: 'none' }}
            onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const name = f.name.toLowerCase();
                if (name.endsWith('.csv') || f.type === 'text/csv') {
                  void handleCsvDataImport(f);
                } else {
                  void boardImport.handleDataImport(f);
                }
            }}
        />

        <WorkspaceWindowLinkOverlay
          sourceNoteId={
            showLayerPanel && editingNote && !isIntroPending ? editingNote.id : null
          }
          portal
          className="fixed inset-0 z-[var(--z-workspace-window-link)]"
        />

        <ChromeNoteSlot
          kind={editingNote && !isIntroPending ? 'editor' : null}
          onClose={() => setConfirmOutsideClose(true)}
          appearance={chromeAppearance}
          motionAnchor={noteEditorAnimationAnchor}
          dismissIgnoreRefs={[boardToolbarRef]}
          resolve={() => {
            const editorSlot = chromeNoteEditorSlotLayout(compactViewport, boardNoteEditorSurface);
            return {
              backdropLabel: '关闭编辑器',
              'aria-label': '便签编辑器',
              ...editorSlot,
              children: (
          <DeferredNoteEditor
              shell={false}
              isOpen={!!editingNote && !isIntroPending}
              saveDraftRef={boardNoteSaveRef}
              onClose={closeEditor}
              onSaveClose={() => closeEditor('saved')}
              animationAnchor={noteEditorAnimationAnchor}
              initialNote={(() => {
                if (!editingNote) return {};
                const fromProject = notes.find((n) => n.id === editingNote.id);
                if (!fromProject) return editingNote;
                // editingNote 可能已 hydrate 出展示 URL；项目态仍是 img-*，合并以免编辑器重解析失败/卡加载
                const preferResolvedImages =
                  (editingNote.images || []).some((img) => typeof img === 'string' && img.startsWith('data:image/'));
                return {
                  ...fromProject,
                  ...editingNote,
                  images: preferResolvedImages ? editingNote.images : fromProject.images,
                  imageRefs: editingNote.imageRefs ?? fromProject.imageRefs,
                  sketch:
                    editingNote.sketch && String(editingNote.sketch).startsWith('data:image/')
                      ? editingNote.sketch
                      : fromProject.sketch
                };
              })()}
              isNewNote={!!editingNote?.id && !notes.some((note) => note.id === editingNote.id)}
              onDelete={(noteId) => deleteBoardNotesWithExit([noteId])}
              onSwitchToMapView={onSwitchToMapView}
              mapStyleId={mapStyleId}
              themeColor={themeColor}
              mapUiChromeOpacity={mapUiChromeOpacity}
              mapUiChromeBlurPx={mapUiChromeBlurPx}
              chromeAppearance={chromeAppearance}
              onSave={(updated) => {
                  if (updated.id && notes.some(n => n.id === updated.id)) {
                      // 确保保留原始note的variant
                      const existingNote = notes.find(n => n.id === updated.id);
                      const fullNote: Note = {
                          ...existingNote!,
                          ...updated,
                          variant: updated.variant || existingNote!.variant,
                          // Always use updated.images if it exists (even if empty array)
                          // This ensures new uploads are saved, not reverted to old images
                          images: updated.images !== undefined ? updated.images : (existingNote!.images || []),
                          imageRefs:
                            updated.imageRefs !== undefined
                              ? updated.imageRefs
                              : existingNote!.imageRefs,
                          // Always use updated.sketch if it exists (even if undefined to clear)
                          // This ensures new sketches are saved, not reverted to old sketch
                          sketch: 'sketch' in updated ? updated.sketch : existingNote!.sketch
                      };
                      // 先让项目态接收保存结果。编辑器随后会立即关闭，不能再把同一条
                      // 记录写回 editingNote，否则已保存便签会和关闭动作竞争、重新占住槽位。
                      return onUpdateNote(fullNote);
                  } else if (onAddNote && updated.id) {
                      // 新便签：必须先以 editingNote 为底（保留 boardX/boardY/coords 等位置字段），
                      // 再覆盖编辑器返回的内容字段。
                      const base = editingNote ?? {};
                      const fullNote: Note = {
                          ...base,
                          ...updated,
                          variant: updated.variant || (base as Note).variant || 'standard',
                          images: updated.images !== undefined ? updated.images : ((base as Note).images || []),
                          sketch: 'sketch' in updated ? updated.sketch : (base as Note).sketch
                      } as Note;
                      // 这张卡片已作为临时便签完成过一次入场；保存后只接管内容，
                      // 不再重复播放第二次出现动画。
                      onAddNote(fullNote);
                      setEditingNote(null);
                  }
              }}
          />
              )
            };
          }}
        />

        <BoardImageLightbox src={previewImage} onClose={() => setPreviewImage(null)} />
      </BoardCanvasShell>

      <SaveBeforeCloseDialog
        open={confirmOutsideClose && !!editingNote && !isIntroPending}
        saving={savingOutsideClose}
        themeColor={themeColor}
        panelChromeStyle={panelChromeStyle}
        onCancel={() => setConfirmOutsideClose(false)}
        onDiscard={() => {
          setConfirmOutsideClose(false);
          closeEditor('discarded');
        }}
        onSave={async () => {
          const save = boardNoteSaveRef.current;
          if (!save) return;
          setSavingOutsideClose(true);
          try {
            const outcome = await save();
            setConfirmOutsideClose(false);
            closeEditor(outcome);
          } finally {
            setSavingOutsideClose(false);
          }
        }}
      />

      {/* 必须位于画布容器之外：Board 的原生双指/滚轮监听只属于画布，不能截获待定箱滚动。 */}
      <UnplacedNotesSidebar
        open={isUIVisible && workspaceEditMode}
        notes={unplacedBoardNotes}
        themeColor={themeColor}
        chromeSurfaceStyle={frameChromeStyle}
        isDark={chromeAppearance === 'dark'}
        panelRef={unplacedBoardSidebarRef}
        isDropTarget={isUnplacedBoardSidebarDropTarget}
        placementDragMime="application/x-mapp-unplaced-board-note"
        boardDragPreviewScale={transform.scale * (project?.standardSizeScale || 1)}
        onDeleteSelected={deleteUnplacedBoardNotes}
        onDropFiles={boardImport.handleUnplacedBoardFiles}
      />

      <BoardBrowseTagFilterPanel
        open={browseTagFilterPanelOpen}
        isEditMode={workspaceEditMode}
        selectedCount={selectedNoteIds.size}
        anchorRef={boardBrowseTagFilterButtonRef}
        layoutRevision={`${browseFilterLayoutRevision}:tag:${browseTagFilterPanelOpen}`}
        themeColor={themeColor}
        panelChromeStyle={panelChromeStyle}
        labelsInSelection={browseTagLabelsInSelection}
        selectionHasUntagged={browseSelectionHasUntagged}
        pendingDefault={browseTagFilterPendingDefault}
        onPendingDefaultChange={setBrowseTagFilterPendingDefault}
        pendingUntagged={browseTagFilterPendingUntagged}
        onPendingUntaggedChange={setBrowseTagFilterPendingUntagged}
        pendingLabels={browseTagFilterPendingLabels}
        onPendingLabelsChange={setBrowseTagFilterPendingLabels}
        canApply={browseTagFilterCanApply}
        onCancel={() => setBrowseTagFilterPanelOpen(false)}
        onApply={applyBrowseTagFilterFromPanel}
      />

      <BoardBrowseTimeFilterPanel
        open={browseTimeFilterPanelOpen}
        isEditMode={workspaceEditMode}
        selectedCount={selectedNoteIds.size}
        anchorRef={boardBrowseTimeFilterButtonRef}
        layoutRevision={`${browseFilterLayoutRevision}:time:${browseTimeFilterPanelOpen}`}
        themeColor={themeColor}
        panelChromeStyle={panelChromeStyle}
        hasTimedNotesInSelection={browseTimeSelectionHasTimedNotes}
        sliderMinBound={browseTimeFilterSliderMinBound}
        sliderMaxBound={browseTimeFilterSliderMaxBound}
        pendingMin={browseTimeFilterPendingMin}
        pendingMax={browseTimeFilterPendingMax}
        onPendingMinChange={setBrowseTimeFilterPendingMin}
        onPendingMaxChange={setBrowseTimeFilterPendingMax}
        onCancel={() => setBrowseTimeFilterPanelOpen(false)}
        onApply={applyBrowseTimeFilterFromPanel}
      />

      {showBoardInsConnPanel && onUpdateConnections && isUIVisible && (
        <GraphConnectionPanel
          isOpen
          themeColor={themeColor}
          panelChromeStyle={panelChromeStyle}
          notes={notes}
          draft={boardInsConnDraft}
          onDraftChange={(patch) => setBoardInsConnDraft((d) => ({ ...d, ...patch }))}
          panelEditingKey={boardInsConnEditingKey}
          pickTarget={boardInsConnPick}
          onPickTargetChange={setBoardInsConnPick}
          onCommit={commitBoardInsConnDraft}
          onDelete={handleDeleteBoardInsConn}
          onNewConnection={handleBoardInsNewEmpty}
          onBeginEndpointEdit={handleBoardInsNewEmpty}
          disableGraphPick
          graphPickDisabledHint="请用检索或列表选择起终点便签"
          onClearGraphAndDraftSelection={clearBoardInsConnDraft}
          onClearFromSelection={clearBoardInsFromOnly}
          onClearToSelection={clearBoardInsToOnly}
          showClearSelection={
            !!boardInsConnPick || !!boardInsConnDraft.fromNoteId || !!boardInsConnDraft.toNoteId
          }
          onClose={() => {
            setShowBoardInsConnPanel(false);
            setBoardInsConnPick(null);
          }}
        />
      )}

      <DeleteConfirmDialog
        open={!!pendingKeyboardDeleteIds?.length}
        variant={(pendingKeyboardDeleteIds?.length ?? 0) > 1 ? 'notes-batch' : 'note'}
        titleHint={
          pendingKeyboardDeleteIds?.length === 1
            ? parseNoteContent(notes.find((note) => note.id === pendingKeyboardDeleteIds[0])?.text || '').title || '无标题'
            : undefined
        }
        batchCount={pendingKeyboardDeleteIds?.length}
        themeColor={themeColor}
        panelChromeStyle={panelChromeStyle}
        onCancel={() => setPendingKeyboardDeleteIds(null)}
        onConfirm={() => {
          const ids = pendingKeyboardDeleteIds ?? [];
          setPendingKeyboardDeleteIds(null);
          if (ids.length) deleteBoardNotesWithExit(ids);
        }}
      />

      {/* Settings hosted by ChromeToolbarSlot */}
    </div>
  );
};

export const BoardView = BoardViewComponent;
