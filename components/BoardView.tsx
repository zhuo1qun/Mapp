import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { Note, Frame, Connection, type GraphLayerState, type Project } from '../types';
import { mergeGraphLayerState, type GraphLayerGroupStandard } from '../utils/graph/graphRuntimeCore';
import {
  isNoteVisibleInUnifiedLayer,
  noteHasRenderableMapPosition,
  noteTagLabels
} from '../utils/layer/unifiedNoteLayer';
import { ProjectNotesLayerPanel } from './layer/ProjectNotesLayerPanel';
import { NoteEditor } from './NoteEditor';
import { Square, X, Check, Minus, Move, Hash, Plus, FileJson, Locate, Settings } from 'lucide-react';
import exifr from 'exifr';
import { generateId, fileToBase64, parseNoteContent } from '../utils';
import { calculateImageFingerprint, calculateFingerprintFromBase64 } from '../utils/media/imageProcessing';
import { DEFAULT_THEME_COLOR, TAG_COLORS } from '../constants';
import { mapChromeSurfaceStyle } from '../utils/map/mapChromeStyle';
import { parseHexToRgb } from '../utils/theme/themeChrome';
import { saveImage, saveSketch, loadImage, loadNoteImages, getViewPositionCache } from '../utils/persistence/storage';
import { useNotesWithResolvedMedia } from '../utils/persistence/useNotesWithResolvedMedia';
import { noteRendersAsBoardSticker } from '../utils/persistence/mediaDisplay';
import { compressImageToBase64 } from '../utils/board/board-utils';
import { useBoardNoteDrag } from './hooks/useBoardNoteDrag';
import { useBoardNoteInteraction } from './hooks/useBoardNoteInteraction';
import {
  PLACEMENT_PADDING,
  PLACEMENT_GAP,
  PLACEMENT_GRID_CELL,
  boardNoteDimensions,
  computeBoardBounds,
  createGridAllocator,
  nextSequentialSlot,
  type BoardBounds,
  type GridAllocator
} from '../utils/board/boardPlacement';
import { TagAddPanel } from './ui/TagAddPanel';
import { SettingsPanel } from './SettingsPanel';
import { BoardImportPreviewDialog } from './board/BoardImportPreviewDialog';
import { useCsvImport } from '@/components/hooks/useCsvImport';
import { buildNewNotesFromProjectJsonRaws, parseProjectJsonNotesPayloadResult } from '../utils/import/projectDataImport';
import {
  formatImportErrorMessage,
  formatUnexpectedImportError
} from '../utils/import/importErrorFormat';
import { BoardImageLightbox } from './board/BoardImageLightbox';
import { BoardBrowseTagFilterPanel } from './board/BoardBrowseTagFilterPanel';
import { BoardBrowseTimeFilterPanel } from './board/BoardBrowseTimeFilterPanel';
import { BoardBatchTimePanel } from './board/BoardBatchTimePanel';
import { BoardMultiSelectToolbar } from './board/BoardMultiSelectToolbar';
import { BoardConnectionQuickEditBar } from './board/BoardConnectionQuickEditBar';
import { BoardTopRightEditToggle } from './board/BoardTopRightEditToggle';
import { type EditInspectorPanelProps, type InspectorGroupContext } from './map/overlays/MapEditInspectorPanel';
import { useRegisterEditInspector } from './editInspector/EditInspectorProvider';
import { GraphConnectionPanel } from './graph/GraphConnectionPanel';
import { useSimpleConnectionPanel } from './hooks/useSimpleConnectionPanel';
import { BoardTopCenterEditToolbar } from './board/BoardTopCenterEditToolbar';
import { ChromeIconButton } from './ui/ChromeIconButton';
import { LayerToolbarIcon } from './ui/LayerToolbarIcon';
import ReactMarkdown from 'react-markdown';
import {
  CONNECTION_OFFSET,
  CONNECTION_POINT_SIZE,
  CONNECTION_POINT_DETECT_RADIUS,
  CONNECTION_LINE_WIDTH,
  CONNECTION_LINE_CLICKABLE_WIDTH,
  CONNECTION_LINE_CORNER_RADIUS,
  SVG_OVERFLOW_PADDING,
  LONG_PRESS_DURATION,
  VIBRATION_SHORT,
  VIBRATION_MEDIUM,
  VIBRATION_LONG
} from './board-constants';

const BOARD_NOTE_INTRO_MS = 280;
const BOARD_NOTE_INTRO_DISMISS_DELAY_MS = 560;
const BOARD_NOTE_EXIT_MS = 220;


function imageRefLooksLikeImageId(imageRef: string): boolean {
  return imageRef.startsWith('img-');
}

function loadImageElementDimensions(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height });
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

async function resolveImageRefToRenderableSrc(imageRef: string): Promise<string | null> {
  if (!imageRef) return null;
  if (imageRefLooksLikeImageId(imageRef)) {
    try {
      return await loadImage(imageRef);
    } catch (error) {
      console.warn('Failed to load image by ID for dimensions:', error);
      return null;
    }
  }
  return imageRef;
}

async function detectImageDimensionsFromRefs(imageRefs: string[]): Promise<{ width: number; height: number } | null> {
  for (const imageRef of imageRefs) {
    const src = await resolveImageRefToRenderableSrc(imageRef);
    if (!src) continue;
    try {
      const dims = await loadImageElementDimensions(src);
      if (dims.width > 0 && dims.height > 0) {
        return dims;
      }
    } catch (error) {
      console.warn('Failed to detect image dimensions:', error);
    }
  }
  return null;
}


/** 便签年份区间（无时间则 null） */
function getNoteYearSpan(note: Note): { min: number; max: number } | null {
  if (note.startYear == null) return null;
  const s = note.startYear;
  const e = note.endYear != null && note.endYear !== s ? note.endYear : s;
  return { min: Math.min(s, e), max: Math.max(s, e) };
}

/** 便签起止年区间完全落在筛选区间内（非交集） */
function noteTimeRangeFullyContainedInFilter(
  note: Note,
  range: { min: number; max: number }
): boolean {
  const span = getNoteYearSpan(note);
  if (!span) return false;
  return span.min >= range.min && span.max <= range.max;
}

function computeTimeRangeFromSelection(
  ids: Set<string>,
  allNotes: Note[]
): { min: number; max: number } | null {
  let min = Infinity;
  let max = -Infinity;
  allNotes.forEach((n) => {
    if (!ids.has(n.id)) return;
    const span = getNoteYearSpan(n);
    if (!span) return;
    min = Math.min(min, span.min);
    max = Math.max(max, span.max);
  });
  if (min === Infinity) return null;
  return { min, max };
}

function computeTimeRangeFromAllNotes(allNotes: Note[]): { min: number; max: number } | null {
  let min = Infinity;
  let max = -Infinity;
  allNotes.forEach((n) => {
    const span = getNoteYearSpan(n);
    if (!span) return;
    min = Math.min(min, span.min);
    max = Math.max(max, span.max);
  });
  if (min === Infinity) return null;
  return { min, max };
}

function selectionHasTimedNotesInSelection(ids: Set<string>, allNotes: Note[]): boolean {
  return allNotes.some((n) => ids.has(n.id) && getNoteYearSpan(n) != null);
}

function collectTagLabelsFromSelection(ids: Set<string>, allNotes: Note[]): Set<string> {
  const labels = new Set<string>();
  allNotes.forEach((n) => {
    if (!ids.has(n.id)) return;
    noteTagLabels(n).forEach((l) => labels.add(l));
  });
  return labels;
}

/** 多选框内出现的标签文案，去重后按文本排序（与颜色无关） */
function collectSortedUniqueTagLabelsFromSelection(
  ids: Set<string>,
  allNotes: Note[]
): string[] {
  const s = collectTagLabelsFromSelection(ids, allNotes);
  return Array.from(s).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
}

function selectionHasUntaggedNotes(ids: Set<string>, allNotes: Note[]): boolean {
  return allNotes.some((n) => ids.has(n.id) && noteTagLabels(n).length === 0);
}

/** 勾选「无标签」或任一 label（并集；含 emoji） */
function noteMatchesBoardTagFilter(
  note: Note,
  labels: Set<string>,
  includeUntagged: boolean
): boolean {
  const noteLabels = noteTagLabels(note);
  const untagged = noteLabels.length === 0;
  if (includeUntagged && untagged) return true;
  if (labels.size > 0 && noteLabels.some((l) => labels.has(l))) return true;
  return false;
}

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
  onSwitchToBoardView?: (coords?: { x: number; y: number }) => void;
  onSwitchToGraphView?: (noteId: string) => void;
  navigateToCoords?: { x: number; y: number } | null;
  projectId?: string;
  onNavigateComplete?: () => void;
  onTransformChange?: (x: number, y: number, scale: number) => void;
  mapViewFileInputRef?: React.RefObject<HTMLInputElement>;
  themeColor?: string;
  panelChromeStyle?: React.CSSProperties;
  /** 与 MapView 浮层按钮悬停一致，由 `mapChromeHoverBackground(opacity)` 传入 */
  chromeHoverBackground?: string;
  isUIVisible?: boolean;
  /** 与 MapView 相同的设置面板（界面外观、地图样式等） */
  onThemeColorChange?: (color: string) => void;
  mapUiChromeOpacity?: number;
  onMapUiChromeOpacityChange?: (opacity: number) => void;
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
  onSwitchToBoardView,
  onSwitchToGraphView,
  navigateToCoords,
  projectId,
  onNavigateComplete,
  onTransformChange,
  mapViewFileInputRef,
  themeColor = DEFAULT_THEME_COLOR,
  panelChromeStyle,
  chromeHoverBackground,
  isUIVisible = true,
  onThemeColorChange,
  mapUiChromeOpacity = 0.9,
  onMapUiChromeOpacityChange,
  mapUiChromeBlurPx = 8,
  onMapUiChromeBlurPxChange,
  mapStyleId = 'carto-light-nolabels',
  onMapStyleChange,
}) => {
  /** 渲染用：资产 ID → data URL；写回仍用 props.notes */
  const displayNotes = useNotesWithResolvedMedia(notes);
  const ch = panelChromeStyle;
  const chHover = chromeHoverBackground;
  const frameChromeStyle = useMemo(
    () => ch ?? mapChromeSurfaceStyle(mapUiChromeOpacity, mapUiChromeBlurPx),
    [ch, mapUiChromeOpacity, mapUiChromeBlurPx]
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
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  // New text notes briefly live here before their editor opens, so their
  // creation has a visible anchor instead of appearing as an abrupt modal.
  const [introNote, setIntroNote] = useState<Note | null>(null);
  const [isIntroPending, setIsIntroPending] = useState(false);
  const [introNoteMotion, setIntroNoteMotion] = useState<'enter' | 'exit'>('enter');
  const [enteringNoteIds, setEnteringNoteIds] = useState<Set<string>>(() => new Set());
  const [deletingNoteIds, setDeletingNoteIds] = useState<Set<string>>(() => new Set());
  const introTimerRef = useRef<number | null>(null);
  const introDismissTimerRef = useRef<number | null>(null);
  const introExitTimerRef = useRef<number | null>(null);
  const introStartedAtRef = useRef(0);
  const boardLongPressPreviewNoteRef = useRef<Note | null>(null);
  const noteMotionTimersRef = useRef<Set<number>>(new Set());
  const deletingNoteIdsRef = useRef<Set<string>>(new Set());

  const boardDisplayNotes = useMemo(() => {
    if (!introNote) return displayNotes;
    // 保存后仍先保留临时卡作为过渡层，待它淡出后再露出正式卡，避免
    // 同一个便签在编辑器收场时突然换成另一张卡片。
    return [...displayNotes.filter((note) => note.id !== introNote.id), introNote];
  }, [displayNotes, introNote]);

  const markBoardNoteEntering = useCallback((noteId: string) => {
    setEnteringNoteIds((current) => new Set(current).add(noteId));
    const timer = window.setTimeout(() => {
      noteMotionTimersRef.current.delete(timer);
      setEnteringNoteIds((current) => {
        if (!current.has(noteId)) return current;
        const next = new Set(current);
        next.delete(noteId);
        return next;
      });
    }, BOARD_NOTE_INTRO_MS);
    noteMotionTimersRef.current.add(timer);
  }, []);

  const addBoardNoteWithEnter = useCallback(
    (note: Note) => {
      markBoardNoteEntering(note.id);
      onAddNote?.(note);
    },
    [markBoardNoteEntering, onAddNote]
  );

  const beginNewBoardNoteIntro = useCallback(
    (note: Note) => {
      if (introTimerRef.current !== null) window.clearTimeout(introTimerRef.current);
      if (introDismissTimerRef.current !== null) window.clearTimeout(introDismissTimerRef.current);
      if (introExitTimerRef.current !== null) window.clearTimeout(introExitTimerRef.current);
      setIntroNote(note);
      setIsIntroPending(true);
      setIntroNoteMotion('enter');
      markBoardNoteEntering(note.id);
      setEditingNote(note);
      introStartedAtRef.current = Date.now();
    },
    [markBoardNoteEntering]
  );

  const openNewBoardNoteEditorAfterIntro = useCallback(
    (note: Note, elapsedMs = 0) => {
      if (introTimerRef.current !== null) window.clearTimeout(introTimerRef.current);
      const remainingIntroMs = Math.max(120, BOARD_NOTE_INTRO_MS - elapsedMs);
      introTimerRef.current = window.setTimeout(() => {
        introTimerRef.current = null;
        setIsIntroPending(false);
        onToggleEditor(true);
      }, remainingIntroMs);
    },
    [onToggleEditor]
  );

  const deleteBoardNotesWithExit = useCallback(
    (noteIds: string[]) => {
      const ids = [...new Set(noteIds)].filter((id) => !deletingNoteIdsRef.current.has(id));
      if (ids.length === 0 || (!onDeleteNote && !onDeleteNotesBatch)) return;

      // 尚未保存的新便签由编辑器关闭后的统一退场流程接手，避免卡片在
      // 编辑器仍在收场时提前消失。
      const idsToDelete = ids.filter(
        (id) => id !== introNote?.id || notes.some((note) => note.id === id)
      );
      if (idsToDelete.length === 0) return;

      idsToDelete.forEach((id) => deletingNoteIdsRef.current.add(id));
      setDeletingNoteIds((current) => {
        const next = new Set(current);
        idsToDelete.forEach((id) => next.add(id));
        return next;
      });
      setSelectedNoteIds((current) => {
        const next = new Set(current);
        idsToDelete.forEach((id) => next.delete(id));
        return next;
      });
      setSelectedNoteId((current) => (current && idsToDelete.includes(current) ? null : current));

      const timer = window.setTimeout(() => {
        noteMotionTimersRef.current.delete(timer);
        const removeExitState = () => {
          idsToDelete.forEach((id) => deletingNoteIdsRef.current.delete(id));
          setDeletingNoteIds((current) => {
            const next = new Set(current);
            idsToDelete.forEach((id) => next.delete(id));
            return next;
          });
          setIntroNote((current) => (current && idsToDelete.includes(current.id) ? null : current));
        };

        if (idsToDelete.length > 1 && onDeleteNotesBatch) {
          Promise.resolve(onDeleteNotesBatch(idsToDelete)).finally(removeExitState);
        } else {
          Promise.all(idsToDelete.map((id) => Promise.resolve(onDeleteNote?.(id)))).finally(removeExitState);
        }
      }, BOARD_NOTE_EXIT_MS);
      noteMotionTimersRef.current.add(timer);
    },
    [introNote?.id, notes, onDeleteNote, onDeleteNotesBatch]
  );

  useEffect(() => () => {
    if (introTimerRef.current !== null) window.clearTimeout(introTimerRef.current);
    if (introDismissTimerRef.current !== null) window.clearTimeout(introDismissTimerRef.current);
    if (introExitTimerRef.current !== null) window.clearTimeout(introExitTimerRef.current);
    noteMotionTimersRef.current.forEach((timer) => window.clearTimeout(timer));
  }, []);
  
  // 标记是否已经执行过重排
  const [hasRearranged, setHasRearranged] = useState(false);

  // 标记是否正在拖拽背景（用于在拖拽结束后保存位置）
  const [isDraggingBackground, setIsDraggingBackground] = useState(false);

  // 缩放保存的防抖定时器
  const zoomSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
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
    
    // 2. Calculate to fit all objects
    if (notes.length > 0) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      notes.forEach(note => {
        minX = Math.min(minX, note.boardX);
        minY = Math.min(minY, note.boardY);
        const { width: w, height: h } = boardNoteDimensions(note);
        maxX = Math.max(maxX, note.boardX + w);
        maxY = Math.max(maxY, note.boardY + h);
      });
      
      const padding = 100;
      minX -= padding;
      minY -= padding;
      maxX += padding;
      maxY += padding;
      const contentWidth = maxX - minX;
      const contentHeight = maxY - minY;
      const { width: cW, height: cH } = containerRef.current.getBoundingClientRect();
      
      const scaleX = cW / contentWidth;
      const scaleY = cH / contentHeight;
      const newScale = Math.min(Math.max(0.2, Math.min(scaleX, scaleY) * 0.9), 4);
      
      const newX = (cW - contentWidth * newScale) / 2 - minX * newScale;
      const newY = (cH - contentHeight * newScale) / 2 - minY * newScale;
      
      return { x: newX, y: newY, scale: newScale };
    }
    
    // 3. Default
    return { x: 0, y: 0, scale: 1 };
  }, [notes, projectId]);
  
  // Canvas Viewport State - initialize with calculated transform
  const [transform, setTransform] = useState(() => {
    // This will be recalculated when container is ready
    return { x: 0, y: 0, scale: 1 };
  });
  const transformRef = useRef(transform);
  transformRef.current = transform;
  const [isPanning, setIsPanning] = useState(false);
  const isPanningRef = useRef(false);
  isPanningRef.current = isPanning;
  
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

  const projectFull = project as Project | undefined;
  const effectiveConnections = useMemo(
    () => projectFull?.connections ?? connections,
    [projectFull?.connections, connections]
  );
  const graphLayerGroupStandard = useMemo(
    () => (projectFull?.graphLayerStandard ?? 'tag') as GraphLayerGroupStandard,
    [projectFull?.graphLayerStandard]
  );
  const mergedTagBoardLayers = useMemo(
    () => mergeGraphLayerState(notes, projectFull?.graphLayers ?? null, 'tag'),
    [notes, projectFull?.graphLayers]
  );
  const mergedFrameBoardLayers = useMemo(
    () => mergeGraphLayerState(notes, projectFull?.graphFrameLayers ?? null, 'frame'),
    [notes, projectFull?.graphFrameLayers]
  );
  const mergedProjectBoardLayers =
    graphLayerGroupStandard === 'frame' ? mergedFrameBoardLayers : mergedTagBoardLayers;

  const handleBoardGraphLayersChange = useCallback(
    (next: GraphLayerState) => {
      if (!onUpdateProject || !projectFull) return;
      if (graphLayerGroupStandard === 'frame') {
        onUpdateProject({ ...projectFull, graphFrameLayers: next });
      } else {
        onUpdateProject({ ...projectFull, graphLayers: next });
      }
    },
    [onUpdateProject, projectFull, graphLayerGroupStandard]
  );

  const handleBoardLayerStandardChange = useCallback(
    (standard: GraphLayerGroupStandard) => {
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
  
  // Dragging / pan pointer（pan 仍用 lastMousePos；便签拖动见 useBoardNoteDrag）
  const lastMousePos = useRef<{ x: number, y: number } | null>(null);
  const panStartPos = useRef<{ x: number, y: number } | null>(null);
  const isZoomingRef = useRef(false);
  const [isZooming, setIsZooming] = useState(false);
  const dragRectRef = useRef<DOMRect | null>(null);
  
  // Blank click count for exit logic
  const blankClickCountRef = useRef<number>(0);
  const blankClickResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set()); // Multi-select state
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [editingConnectionLabel, setEditingConnectionLabel] = useState<string>('');
  const editingConnectionLabelRef = useRef<string>('');
  useEffect(() => {
    editingConnectionLabelRef.current = editingConnectionLabel;
  }, [editingConnectionLabel]);

  // Multi-select state
  const [isShiftPressed, setIsShiftPressed] = useState(false);
  
  // Box selection state
  const [isBoxSelecting, setIsBoxSelecting] = useState(false);
  const [boxSelectStart, setBoxSelectStart] = useState<{ x: number; y: number } | null>(null);
  const [boxSelectEnd, setBoxSelectEnd] = useState<{ x: number; y: number } | null>(null);
  const [connectingFrom, setConnectingFrom] = useState<{ noteId: string; side: 'top' | 'right' | 'bottom' | 'left' } | null>(null);
  const [connectingTo, setConnectingTo] = useState<{ x: number; y: number } | null>(null);
  const [hoveringConnectionPoint, setHoveringConnectionPoint] = useState<{ noteId: string; side: 'top' | 'right' | 'bottom' | 'left' } | null>(null);

  /** 多选批量工具栏：标签 / 时间子面板 */
  const [multiBatchPanel, setMultiBatchPanel] = useState<'none' | 'tag' | 'time'>('none');
  const [batchTagLabel, setBatchTagLabel] = useState('');
  const [batchTagColorIndex, setBatchTagColorIndex] = useState(0);
  const [batchTimeStartStr, setBatchTimeStartStr] = useState('');
  const [batchTimeEndStr, setBatchTimeEndStr] = useState('');

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
  const boardInspectorNote = useMemo(
    () => (boardInspectorNoteId ? notes.find((n) => n.id === boardInspectorNoteId) ?? null : null),
    [boardInspectorNoteId, notes]
  );

  const boardInspectorGroupContext = useMemo((): InspectorGroupContext | null => {
    if (selectedNoteIds.size <= 1) return null;
    const members = notes.filter((n) => selectedNoteIds.has(n.id));
    if (members.length === 0) return null;
    let x = 0;
    let y = 0;
    members.forEach((n) => {
      x += n.boardX ?? 0;
      y += n.boardY ?? 0;
    });
    const centroidBoard = { x: x / members.length, y: y / members.length };
    const firstG = members[0]?.noteGroupId;
    const isObjectGroup =
      !!firstG && members.every((m) => m.noteGroupId === firstG);
    return {
      kind: 'multi',
      title: isObjectGroup ? `对象组 · ${members.length} 个` : `多选 · ${members.length} 个`,
      members,
      centroidBoard
    };
  }, [selectedNoteIds, notes]);

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

  const boardInspectorFrame = useMemo(() => {
    if (boardInspectorNote) return null;
    if (boardInspectorGroupContext) return null;
    if (!selectedFrameId) return null;
    return frames.find((f) => f.id === selectedFrameId) ?? null;
  }, [boardInspectorNote, boardInspectorGroupContext, selectedFrameId, frames]);

  const boardInspectorConnection = useMemo(() => {
    if (boardInspectorNote) return null;
    if (boardInspectorGroupContext) return null;
    if (boardInspectorFrame) return null;
    if (!selectedConnectionId) return null;
    return effectiveConnections.find((c) => c.id === selectedConnectionId) ?? null;
  }, [
    boardInspectorNote,
    boardInspectorGroupContext,
    boardInspectorFrame,
    selectedConnectionId,
    effectiveConnections
  ]);

  const [resizingImage, setResizingImage] = useState<{
    id: string;
    corner: 'tl' | 'tr' | 'bl' | 'br';
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
    startBoardX: number;
    startBoardY: number;
    aspect: number;
  } | null>(null);
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
  const [editingFrameId, setEditingFrameId] = useState<string | null>(null);
  const [editingFrameTitle, setEditingFrameTitle] = useState('');
  const frameTitleInputRef = useRef<HTMLInputElement | null>(null);
  const frameTitleSaveButtonRef = useRef<HTMLButtonElement | null>(null);
  const [resizingFrame, setResizingFrame] = useState<{ id: string; fixedX: number; fixedY: number } | null>(null);
  const resizingFrameRef = useRef<{ id: string; fixedX: number; fixedY: number } | null>(null);
  const [draggingFrameId, setDraggingFrameId] = useState<string | null>(null);
  const draggingFrameRef = useRef<string | null>(null);
  const [draggingFrameOffset, setDraggingFrameOffset] = useState<{ x: number; y: number } | null>(null);
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
  
  // Import state
  const [showImportMenu, setShowImportMenu] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dataImportInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  
  // Image import preview state
  const [importPreview, setImportPreview] = useState<Array<{
    file: File;
    imageUrl: string;
    lat: number;
    lng: number;
    error?: string;
    isDuplicate?: boolean;
    imageFingerprint?: string;
  }>>([]);
  
  const [showImportDialog, setShowImportDialog] = useState(false);
  const imageFileInputRef = useRef<HTMLInputElement | null>(null);
  
  // Text measurement refs removed (text variant removed)

  // 重置空白点击计数
  const resetBlankClickCount = () => {
    blankClickCountRef.current = 0;
    if (blankClickResetTimerRef.current) {
      clearTimeout(blankClickResetTimerRef.current);
      blankClickResetTimerRef.current = null;
    }
  };

  const openBoardNoteEditor = useCallback(
    (note: Note) => {
      void (async () => {
        let loaded = note;
        const hasLoadedImages =
          !!note.images?.length && note.images.some((img) => img.startsWith('data:'));
        if (!hasLoadedImages) {
          try {
            loaded = await loadNoteImages(note);
          } catch (error) {
            console.error('Failed to load note images:', error);
          }
        }
        setEditingNote(loaded);
        onToggleEditor(true);
      })();
    },
    [onToggleEditor]
  );

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
      setConnectingFrom(null);
      setConnectingTo(null);
      setHoveringConnectionPoint(null);
      resetBlankClickCount();
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
    clearNotePressTracking,
    currentNotePressIdRef
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
    onBrowseLongPressStartEdit: enterEditFromTouchLongPress
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
    setConnectingFrom: setConnectingFrom as (v: null) => void,
    setConnectingTo: setConnectingTo as (v: null) => void,
    setHoveringConnectionPoint: setHoveringConnectionPoint as (v: null) => void,
    resetBlankClickCount,
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
    resetBlankClickCount();
  };

  const applyBrowseTimeFilterFromPanel = () => {
    setBoardFilterTimeRange(null);
    if (!browseTimeSelectionHasTimedNotes) {
      setBrowseTimeFilterPanelOpen(false);
      resetBlankClickCount();
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
    resetBlankClickCount();
  };

  const browseTagFilterLayoutRevision = useMemo(
    () =>
      JSON.stringify({
        open: browseTagFilterPanelOpen,
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
      browseTagFilterPanelOpen,
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

  const browseTimeFilterLayoutRevision = useMemo(
    () =>
      JSON.stringify({
        open: browseTimeFilterPanelOpen,
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
      browseTimeFilterPanelOpen,
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
      // Close import dialog on ESC key
      if (e.key === 'Escape' && showImportDialog) {
        handleCancelImport();
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
  }, [workspaceEditMode, showImportDialog]);

  // Keyboard shortcuts for note grouping: Cmd/Ctrl+G (group) and Cmd/Ctrl+Shift+G (ungroup)
  useEffect(() => {
    const handleGroupShortcut = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const isGKey = e.key === 'g' || e.key === 'G';
      if (!isGKey) return;

      if (!e.shiftKey) {
        // Cmd/Ctrl+G：成组
        if (selectedNoteIds.size < 2) return;
        e.preventDefault();
        const newGroupId = generateId();
        const updatedNotes = notes.map(n =>
          selectedNoteIds.has(n.id) ? { ...n, noteGroupId: newGroupId } : n
        );
        onUpdateProject?.({ ...project, notes: updatedNotes });
      } else {
        // Cmd/Ctrl+Shift+G：取消编组（将所有被选中便签所在的组全部解散）
        const groupIdsInSelection = new Set(
          notes
            .filter(n => selectedNoteIds.has(n.id) && n.noteGroupId)
            .map(n => n.noteGroupId!)
        );
        if (groupIdsInSelection.size === 0) return;
        e.preventDefault();
        const updatedNotes = notes.map(n =>
          n.noteGroupId && groupIdsInSelection.has(n.noteGroupId)
            ? { ...n, noteGroupId: undefined }
            : n
        );
        onUpdateProject?.({ ...project, notes: updatedNotes });
        setSelectedNoteIds(new Set());
      }
    };

    window.addEventListener('keydown', handleGroupShortcut);
    return () => window.removeEventListener('keydown', handleGroupShortcut);
  }, [notes, project, selectedNoteIds, onUpdateProject]);

  useEffect(() => {
    // 退出编辑模式时清除所有连接相关状态和长按状态
    if (!workspaceEditMode) {
      setConnectingFrom(null);
      setConnectingTo(null);
      setHoveringConnectionPoint(null);
      setSelectedConnectionId(null);
      setSelectedFrameId(null); // 清除frame选中状态
      setSelectedNoteIds(new Set()); // Clear multi-select
      setIsShiftPressed(false);
      cancelBrowseLongPress();
      clearNotePressTracking();
      clearDeferredClick();
    }
  }, [workspaceEditMode, cancelBrowseLongPress, clearNotePressTracking, clearDeferredClick]);

  // 计算Note的中心点是否在Frame内
  const isNoteInFrame = (note: Note, frame: Frame): boolean => {
    const { width, height } = boardNoteDimensions(note);
    const centerX = note.boardX + width / 2;
    const centerY = note.boardY + height / 2;
    
    return centerX >= frame.x && 
           centerX <= frame.x + frame.width && 
           centerY >= frame.y && 
           centerY <= frame.y + frame.height;
  };

  // 更新所有 Note 的分组信息（一便签只属于一个 frame：重叠时取第一个）
  const updateNoteGroups = () => {
    let changed = false;
    const updatedNotes = notes.map(note => {
      const containingFrames = frames.filter(frame => isNoteInFrame(note, frame));
      const primary = containingFrames[0];
      const newGroupIds = primary ? [primary.id] : undefined;
      const newGroupNames = primary ? [primary.title] : undefined;
      const newGroupId = primary?.id;
      const newGroupName = primary?.title;

      const oldGroupIds = note.groupIds || (note.groupId ? [note.groupId] : []);
      const currentNewGroupIds = newGroupIds || [];
      
      const hasNoteChanges = JSON.stringify(oldGroupIds) !== JSON.stringify(currentNewGroupIds);

      if (hasNoteChanges) {
        changed = true;
        return {
          ...note,
          groupIds: newGroupIds,
          groupNames: newGroupNames,
          groupId: newGroupId,
          groupName: newGroupName
        };
      }
      return note;
    });
    
    if (changed && project) {
      console.log('Batch updating note groups');
      onUpdateProject({
        ...project,
        notes: updatedNotes
      });
    }
  };

  // 确保便签图片数据已加载
  const ensureNoteImagesLoaded = async (note: Note): Promise<Note> => {
    // 检查便签是否已经有加载的图片数据
    const hasImages = note.images && note.images.length > 0;
    const hasLoadedImages = hasImages && note.images!.some(img => img.startsWith('data:'));

    // 如果已经有加载的图片数据，直接返回
    if (hasLoadedImages) {
      return note;
    }

    // 否则从 IndexedDB 加载图片数据
    try {
      const loadedNote = await loadNoteImages(note);
      return loadedNote;
    } catch (error) {
      console.error('Failed to load note images:', error);
      return note; // 返回原始便签，如果加载失败
    }
  };

  // 当Frame变化时更新分组
  useEffect(() => {
    // 只有在非拖拽/调整大小时才自动更新分组，避免冲突
    if (!draggingFrameId && !resizingFrame && !draggingNoteId && !isMultiSelectDragging) {
      updateNoteGroups();
    }
  }, [frames, draggingFrameId, resizingFrame, draggingNoteId, isMultiSelectDragging]);

  // 重排处于初始位置的便签
  const rearrangeInitialNotes = useCallback(() => {
    // 如果已经重排过或者没有初始便签，跳过
    if (hasRearranged) return;

    const initialNotes = notes.filter(note => note.isInitialPosition);
    if (initialNotes.length === 0) return;

    console.log('开始重排初始便签:', initialNotes.length);

    const updatedNotes = notes.map(note => {
      if (!note.isInitialPosition) return note;
      const index = initialNotes.indexOf(note);
      if (index === -1) return note;
      return { ...note, ...nextSequentialSlot(index), isInitialPosition: false };
    });

    // 批量更新便签
    updatedNotes.forEach(note => {
      onUpdateNote(note);
    });

    // 标记已重排
    setHasRearranged(true);
    console.log('重排完成，已更新', initialNotes.length, '个便签');
  }, [notes, onUpdateNote, hasRearranged]);

  // 当进入board视图时重排初始位置的便签
  useEffect(() => {
    // 延迟执行，确保数据完全加载和DOM渲染完成
    const timer = setTimeout(() => {
      rearrangeInitialNotes();
    }, 500); // 增加延迟时间
    return () => clearTimeout(timer);
  }, [notes.length]); // 当notes数量改变时重新执行

  // 获取连接点位置
  const getConnectionPoint = (note: Note, side: 'top' | 'right' | 'bottom' | 'left', isDragging: boolean, dragOffset: { x: number; y: number }) => {
    const x = note.boardX + (isDragging ? dragOffset.x : 0);
    const y = note.boardY + (isDragging ? dragOffset.y : 0);
    const { width, height } = boardNoteDimensions(note);
    
    switch (side) {
      case 'top':
        return { x: x + width / 2, y: y - 8 };
      case 'right':
        return { x: x + width + 8, y: y + height / 2 };
      case 'bottom':
        return { x: x + width / 2, y: y + height + 8 };
      case 'left':
        return { x: x - 8, y: y + height / 2 };
    }
  };

  // 生成带圆角的连接线路径（使用二次贝塞尔曲线）
  const createRoundedPath = (points: {x: number, y: number}[], radius: number): string => {
    if (points.length < 2) return '';
    
    let path = `M ${points[0].x + SVG_OVERFLOW_PADDING} ${points[0].y + SVG_OVERFLOW_PADDING}`;
    
    for (let i = 1; i < points.length - 1; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const next = points[i + 1];
      
      // 计算到当前点的距离
      const distPrev = Math.sqrt(Math.pow(curr.x - prev.x, 2) + Math.pow(curr.y - prev.y, 2));
      const distNext = Math.sqrt(Math.pow(next.x - curr.x, 2) + Math.pow(next.y - curr.y, 2));
      
      // 自适应圆角半径：优先使用指定半径，如果线段太短则降级为6px，再短就直线
      let actualRadius = radius;
      if (distPrev < radius * 2 || distNext < radius * 2) {
        // 线段太短，降级使用6px圆角
        actualRadius = 6;
      }
      
      // 如果连6px圆角都放不下，使用直线连接
      if (distPrev < actualRadius * 2 || distNext < actualRadius * 2) {
        path += ` L ${curr.x + SVG_OVERFLOW_PADDING} ${curr.y + SVG_OVERFLOW_PADDING}`;
        continue;
      }
      
      // 计算圆角前的点
      const ratioP = actualRadius / distPrev;
      const beforeX = curr.x - (curr.x - prev.x) * ratioP;
      const beforeY = curr.y - (curr.y - prev.y) * ratioP;
      
      // 计算圆角后的点
      const ratioN = actualRadius / distNext;
      const afterX = curr.x + (next.x - curr.x) * ratioN;
      const afterY = curr.y + (next.y - curr.y) * ratioN;
      
      // 直线到圆角前
      path += ` L ${beforeX + SVG_OVERFLOW_PADDING} ${beforeY + SVG_OVERFLOW_PADDING}`;
      // 二次贝塞尔曲线形成圆角
      path += ` Q ${curr.x + SVG_OVERFLOW_PADDING} ${curr.y + SVG_OVERFLOW_PADDING}, ${afterX + SVG_OVERFLOW_PADDING} ${afterY + SVG_OVERFLOW_PADDING}`;
    }
    
    // 最后一段直线
    const last = points[points.length - 1];
    path += ` L ${last.x + SVG_OVERFLOW_PADDING} ${last.y + SVG_OVERFLOW_PADDING}`;
    
    return path;
  };

  // 计算连接线路径的辅助函数（参考流程图库的正交路由算法，优化短距离路径）
  const calculateConnectionPath = (
    fromPoint: { x: number; y: number },
    toPoint: { x: number; y: number },
    fromSide: 'top' | 'right' | 'bottom' | 'left',
    toSide: 'top' | 'right' | 'bottom' | 'left'
  ): string => {
    const offset = CONNECTION_OFFSET;
    
    // 计算从起点延伸后的点（向外延伸）
    let fromExtendX = fromPoint.x, fromExtendY = fromPoint.y;
    if (fromSide === 'right') fromExtendX += offset;
    else if (fromSide === 'left') fromExtendX -= offset;
    else if (fromSide === 'bottom') fromExtendY += offset;
    else if (fromSide === 'top') fromExtendY -= offset;
    
    // 计算垂直接入终点前的点（向外延伸）
    let toExtendX = toPoint.x, toExtendY = toPoint.y;
    if (toSide === 'right') toExtendX += offset;
    else if (toSide === 'left') toExtendX -= offset;
    else if (toSide === 'bottom') toExtendY += offset;
    else if (toSide === 'top') toExtendY -= offset;
    
    // 计算曼哈顿距离，用于判断是否使用简化路径
    const manhattanDist = Math.abs(fromPoint.x - toPoint.x) + Math.abs(fromPoint.y - toPoint.y);
    const isShortDistance = manhattanDist < offset * 3; // 短距离阈值
    
    let points: {x: number, y: number}[] = [];
    
    const fromIsHorizontal = fromSide === 'left' || fromSide === 'right';
    const toIsHorizontal = toSide === 'left' || toSide === 'right';
    
    // 情况1: 水平 → 垂直（L形，最优）
    if (fromIsHorizontal && !toIsHorizontal) {
      // 短距离时，直接连接，减少转折
      if (isShortDistance && Math.abs(fromExtendX - toExtendX) < offset * 2) {
        points = [fromPoint, {x: fromExtendX, y: toExtendY}, toPoint];
      } else {
        // 标准L形路径
        points = [
          fromPoint,
          {x: fromExtendX, y: fromPoint.y},
          {x: toExtendX, y: fromPoint.y},
          {x: toExtendX, y: toExtendY},
          toPoint
        ];
      }
    }
    // 情况2: 垂直 → 水平（L形，最优）
    else if (!fromIsHorizontal && toIsHorizontal) {
      // 短距离时，直接连接
      if (isShortDistance && Math.abs(fromExtendY - toExtendY) < offset * 2) {
        points = [fromPoint, {x: toExtendX, y: fromExtendY}, toPoint];
      } else {
        // 标准L形路径
        points = [
          fromPoint,
          {x: fromPoint.x, y: fromExtendY},
          {x: toExtendX, y: fromExtendY},
          {x: toExtendX, y: toPoint.y},
          toPoint
        ];
      }
    }
    // 情况3: 水平 → 水平
    else if (fromIsHorizontal && toIsHorizontal) {
      const sameDirection = (fromSide === 'right' && toSide === 'right') || 
                           (fromSide === 'left' && toSide === 'left');
      
      if (sameDirection) {
        // 同向：直接连接，使用L形路径（2个转折点）
        // 对于"左连左"或"右连右"，路径应该是：向外延伸 -> 水平移动 -> 垂直移动到目标 -> 向内连接
        if (fromSide === 'left') {
          // 左连左：两个点都在左侧，路径应该在左侧外部
          // 使用更左侧的点作为水平移动的X坐标
          const horizontalX = Math.min(fromExtendX, toExtendX);
          points = [
            fromPoint,
            {x: fromExtendX, y: fromPoint.y},
            {x: horizontalX, y: fromPoint.y}, // 水平移动到更左侧
            {x: horizontalX, y: toPoint.y},   // 垂直移动到目标Y
            {x: toExtendX, y: toPoint.y},
            toPoint
          ];
        } else {
          // 右连右：两个点都在右侧，路径应该在右侧外部
          // 使用更右侧的点作为水平移动的X坐标
          const horizontalX = Math.max(fromExtendX, toExtendX);
          points = [
            fromPoint,
            {x: fromExtendX, y: fromPoint.y},
            {x: horizontalX, y: fromPoint.y}, // 水平移动到更右侧
            {x: horizontalX, y: toPoint.y},   // 垂直移动到目标Y
            {x: toExtendX, y: toPoint.y},
            toPoint
          ];
        }
      } else {
        // 反向：Z形路径，短距离时简化
        if (isShortDistance) {
          // 短距离：直接使用中点，减少转折
          const midY = (fromPoint.y + toPoint.y) / 2;
          points = [
            fromPoint,
            {x: fromExtendX, y: fromPoint.y},
            {x: fromExtendX, y: midY},
            {x: toExtendX, y: midY},
            {x: toExtendX, y: toPoint.y},
            toPoint
          ];
        } else {
          // 长距离：标准Z形
          const midY = (fromPoint.y + toPoint.y) / 2;
          const safeMidY = Math.abs(midY - fromPoint.y) < offset ? 
            (fromPoint.y < toPoint.y ? fromPoint.y - offset : fromPoint.y + offset) : midY;
          points = [
            fromPoint,
            {x: fromExtendX, y: fromPoint.y},
            {x: fromExtendX, y: safeMidY},
            {x: toExtendX, y: safeMidY},
            {x: toExtendX, y: toPoint.y},
            toPoint
          ];
        }
      }
    }
    // 情况4: 垂直 → 垂直
    else {
      const sameDirection = (fromSide === 'bottom' && toSide === 'bottom') || 
                           (fromSide === 'top' && toSide === 'top');
      
      if (sameDirection) {
        // 同向：直接连接，使用L形路径（2个转折点）
        // 对于"上连上"或"下连下"，路径应该是：向外延伸 -> 垂直移动 -> 水平移动到目标 -> 向内连接
        if (fromSide === 'top') {
          // 上连上：两个点都在上方，路径应该在上方外部
          // 使用更上方的点作为垂直移动的Y坐标
          const verticalY = Math.min(fromExtendY, toExtendY);
          points = [
            fromPoint,
            {x: fromPoint.x, y: fromExtendY},
            {x: fromPoint.x, y: verticalY},  // 垂直移动到更上方
            {x: toPoint.x, y: verticalY},    // 水平移动到目标X
            {x: toPoint.x, y: toExtendY},
            toPoint
          ];
        } else {
          // 下连下：两个点都在下方，路径应该在下方外部
          // 使用更下方的点作为垂直移动的Y坐标
          const verticalY = Math.max(fromExtendY, toExtendY);
          points = [
            fromPoint,
            {x: fromPoint.x, y: fromExtendY},
            {x: fromPoint.x, y: verticalY},  // 垂直移动到更下方
            {x: toPoint.x, y: verticalY},    // 水平移动到目标X
            {x: toPoint.x, y: toExtendY},
            toPoint
          ];
        }
      } else {
        // 反向：Z形路径，短距离时简化
        if (isShortDistance) {
          // 短距离：直接使用中点
          const midX = (fromPoint.x + toPoint.x) / 2;
          points = [
            fromPoint,
            {x: fromPoint.x, y: fromExtendY},
            {x: midX, y: fromExtendY},
            {x: midX, y: toExtendY},
            {x: toPoint.x, y: toExtendY},
            toPoint
          ];
        } else {
          // 长距离：标准Z形
          const midX = (fromPoint.x + toPoint.x) / 2;
          const safeMidX = Math.abs(midX - fromPoint.x) < offset ? 
            (fromPoint.x < toPoint.x ? fromPoint.x - offset : fromPoint.x + offset) : midX;
          points = [
            fromPoint,
            {x: fromPoint.x, y: fromExtendY},
            {x: safeMidX, y: fromExtendY},
            {x: safeMidX, y: toExtendY},
            {x: toPoint.x, y: toExtendY},
            toPoint
          ];
        }
      }
    }
    
    // 智能路径优化：移除不必要的中间点
    const optimizedPoints: {x: number, y: number}[] = [points[0]];
    
    for (let i = 1; i < points.length - 1; i++) {
      const prev = optimizedPoints[optimizedPoints.length - 1];
      const curr = points[i];
      const next = points[i + 1];
      
      // 计算三个点形成的角度
      const dx1 = curr.x - prev.x;
      const dy1 = curr.y - prev.y;
      const dx2 = next.x - curr.x;
      const dy2 = next.y - curr.y;
      
      // 如果三个点几乎在一条直线上（角度接近180度），跳过中间点
      const dot = dx1 * dx2 + dy1 * dy2;
      const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
      const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
      const cosAngle = dot / (len1 * len2);
      
      // 如果角度接近180度（cos接近-1），说明是直线，可以跳过中间点
      if (cosAngle < -0.99 && len1 > 1 && len2 > 1) {
        // 跳过这个中间点
        continue;
      }
      
      // 检查距离，太近的点合并
      const dist = Math.sqrt(Math.pow(curr.x - prev.x, 2) + Math.pow(curr.y - prev.y, 2));
      if (dist < 2) {
        continue;
      }
      
      optimizedPoints.push(curr);
    }
    
    // 添加终点
    optimizedPoints.push(points[points.length - 1]);
    
    // 最终清理：移除重复的连续点
    const cleanedPoints: {x: number, y: number}[] = [];
    for (let i = 0; i < optimizedPoints.length; i++) {
      const curr = optimizedPoints[i];
      if (cleanedPoints.length === 0) {
        cleanedPoints.push(curr);
        continue;
      }
      
      const prev = cleanedPoints[cleanedPoints.length - 1];
      const dist = Math.sqrt(Math.pow(curr.x - prev.x, 2) + Math.pow(curr.y - prev.y, 2));
      if (dist > 1) {
        cleanedPoints.push(curr);
      }
    }
    
    // 确保至少有两个点
    if (cleanedPoints.length < 2) {
      cleanedPoints.push(toPoint);
    }
    
    return createRoundedPath(cleanedPoints, CONNECTION_LINE_CORNER_RADIUS);
  };

  // Apply initial transform when project changes or container is ready
  const lastProjectIdRef = useRef<string | null>(null);
  useEffect(() => {
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
  }, [projectId, calculateInitialTransform]); // Removed transform from dependencies if possible, or use projectId as trigger


  // Zoom to Fit on Enter Edit Mode with animation
  useEffect(() => {
    if (workspaceEditMode && notes.length > 0 && containerRef.current) {
        if (skipNextEditModeZoomRef.current) {
            skipNextEditModeZoomRef.current = false;
            return;
        }
        // Wait for DOM to render and measure text notes
        const calculateBounds = () => {
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            notes.forEach(note => {
                const { width: w, height: h } = boardNoteDimensions(note);
                minX = Math.min(minX, note.boardX);
                minY = Math.min(minY, note.boardY);
                maxX = Math.max(maxX, note.boardX + w);
                maxY = Math.max(maxY, note.boardY + h);
            });

            const padding = 100;
            minX -= padding; 
            minY -= padding;
            maxX += padding; 
            maxY += padding;
            const contentWidth = maxX - minX;
            const contentHeight = maxY - minY;
            const { width: cW, height: cH } = containerRef.current.getBoundingClientRect();

            const scaleX = cW / contentWidth;
            const scaleY = cH / contentHeight;
            // Remove min/max constraints to fit exactly
            const newScale = Math.min(scaleX, scaleY);

            const newX = (cW - contentWidth * newScale) / 2 - minX * newScale;
            const newY = (cH - contentHeight * newScale) / 2 - minY * newScale;

            // 使用动画过渡
            const startTransform = { ...transform };
            const endTransform = { x: newX, y: newY, scale: newScale };
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

  // Track transform changes for restoration detection only (position saving moved to pointer up)
  const isRestoringRef = useRef(false);

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
          isRestoringRef.current = true;
          setTransform(initial);
          onNavigateComplete?.();
        }
      }
    }
  }, [navigateToCoords, projectId]); // Significant reduction in dependencies

  const closeEditor = () => {
    if (introTimerRef.current !== null) {
      window.clearTimeout(introTimerRef.current);
      introTimerRef.current = null;
    }
    setIsIntroPending(false);
    if (introNote) {
      if (introDismissTimerRef.current !== null) window.clearTimeout(introDismissTimerRef.current);
      if (introExitTimerRef.current !== null) window.clearTimeout(introExitTimerRef.current);
      const introNoteId = introNote.id;
      introDismissTimerRef.current = window.setTimeout(() => {
        introDismissTimerRef.current = null;
        setIntroNoteMotion('exit');
        introExitTimerRef.current = window.setTimeout(() => {
          introExitTimerRef.current = null;
          setIntroNote((current) => (current?.id === introNoteId ? null : current));
        }, BOARD_NOTE_EXIT_MS);
      }, BOARD_NOTE_INTRO_DISMISS_DELAY_MS);
    }
    // Delay clearing editingNote to ensure any pending state updates are processed
    setTimeout(() => {
    setEditingNote(null);
    }, 100);
    onToggleEditor(false);
  };

  // Handle image import (from photos with GPS) - show preview in BoardView
  const handleImageImport = async (files: FileList | null, showLimitMessage = false) => {
    if (!files || files.length === 0) return;
    
    const fileArray = Array.from(files); // No limit on number of images
    
    const previews: Array<{
      file: File;
      imageUrl: string;
      lat: number;
      lng: number;
      error?: string;
      isDuplicate?: boolean;
      imageFingerprint?: string;
    }> = [];
    
    for (const file of fileArray) {
      try {
        // Read EXIF data with comprehensive options for better compatibility
        // Support multiple phone manufacturers (Xiaomi, OPPO, etc.) and online albums
        const output = await exifr.parse(file, {
          tiff: true,
          exif: true,
          gps: true,        // Parse standard GPS
          xmp: true,        // Critical: Support Android devices that store GPS in XMP
          translateValues: true, // Critical: Auto convert DMS arrays and handle N/S/E/W refs
          mergeOutput: true,    // Flatten all results to single object
          reviveValues: true
        });
        
        // Extract GPS coordinates - prioritize library-calculated standard values
        let lat = null;
        let lng = null;
        
        if (output) {
          // Primary: Use library-calculated standard latitude/longitude (most compatible)
          if (typeof output.latitude === 'number' && typeof output.longitude === 'number') {
            lat = output.latitude;
            lng = output.longitude;
          }
          // Fallback: Raw GPS values (rarely needed if translateValues: true works)
          else if (output.GPSLatitude && output.GPSLongitude) {
            // translateValues should have handled the conversion, but defensive check
            if (typeof output.GPSLatitude === 'number' && typeof output.GPSLongitude === 'number') {
              lat = output.GPSLatitude;
              lng = output.GPSLongitude;
            }
          }
        }
        
        // Validate coordinates
        if (lat === null || lng === null || isNaN(lat) || isNaN(lng)) {
          console.warn('Could not extract GPS coordinates from:', file.name);
          console.warn('Available EXIF keys:', output ? Object.keys(output) : 'No EXIF data');
          console.warn('EXIF data sample:', output ? JSON.stringify(output, null, 2).substring(0, 500) : 'No data');
          previews.push({
            file,
            imageUrl: URL.createObjectURL(file),
            lat: 0,
            lng: 0,
            error: 'Missing location data'
          });
          continue;
        }
        
        // Calculate image fingerprint
        const imageUrl = URL.createObjectURL(file);
        const imageFingerprint = await calculateImageFingerprint(file, imageUrl, lat, lng);
        
        // Check if this image has already been imported (lightweight comparison, no filename)
        let isDuplicate = false;
        
        // Compare with existing images
        for (const note of notes) {
          if (!note.images || note.images.length === 0) continue;
          
          for (const existingImage of note.images) {
            try {
              // Calculate fingerprint for existing image (no filename)
              const existingFingerprint = await calculateFingerprintFromBase64(existingImage);
              
              // Debug: log fingerprints for comparison
              console.log('Comparing fingerprints:', {
                new: imageFingerprint,
                existing: existingFingerprint,
                match: imageFingerprint === existingFingerprint
              });
              
              // Compare fingerprints (exact match)
              if (imageFingerprint === existingFingerprint) {
                isDuplicate = true;
                console.log('Duplicate detected: exact fingerprint match');
                break;
              }
              
              // Fallback: compare by width and height only (without pixel)
              const currentParts = imageFingerprint.split('_');
              const existingParts = existingFingerprint.split('_');
              
              // Fingerprint format: width_height_firstPixel
              // So indices are: [0]=width, [1]=height, [2]=firstPixel
              if (currentParts.length >= 2 && existingParts.length >= 2) {
                // Compare width and height (first 2 parts)
                const currentBase = currentParts.slice(0, 2).join('_');
                const existingBase = existingParts.slice(0, 2).join('_');
                
                if (currentBase === existingBase) {
                  isDuplicate = true;
                  console.log('Duplicate detected: width and height match');
                  break;
                }
              }
            } catch (error) {
              console.error('Error comparing fingerprints:', error);
            }
          }
          if (isDuplicate) break;
        }
        
        previews.push({
          file,
          imageUrl: imageUrl,
          lat: lat,
          lng: lng,
          isDuplicate: isDuplicate,
          imageFingerprint: imageFingerprint
        });
      } catch (error) {
        console.error('Error reading EXIF data from:', file.name, error);
        previews.push({
          file,
          imageUrl: URL.createObjectURL(file),
          lat: 0,
          lng: 0,
          error: 'Unable to read image or location data'
        });
      }
    }
    
    setImportPreview(previews);
    setShowImportDialog(true);
  };
  
  // Confirm import
  const handleConfirmImport = async () => {
    // Filter out errors and duplicates
    const validPreviews = importPreview.filter(p => !p.error && !p.isDuplicate);
    const duplicateCount = importPreview.filter(p => !p.error && p.isDuplicate).length;
    
    if (validPreviews.length === 0) {
      if (duplicateCount > 0) {
        alert(`All images have already been imported. ${duplicateCount} duplicate(s) skipped.`);
      } else {
        alert('No valid images to import');
      }
      return;
    }
    
    const boardNotes = notes.filter(n => n.boardX !== undefined && n.boardY !== undefined);
    const boardBounds = computeBoardBounds(boardNotes);
    const allocator = createGridAllocator({
      existingNotes: boardNotes,
      padding: PLACEMENT_PADDING,
      gap: PLACEMENT_GAP,
      cellSize: PLACEMENT_GRID_CELL
    });
    const anchorX = boardBounds ? boardBounds.maxX + PLACEMENT_GAP : PLACEMENT_PADDING;
    const anchorY = boardBounds ? boardBounds.minY : PLACEMENT_PADDING;

    // 多张图片批量导入时自动成组
    const importBatchGroupId = validPreviews.length > 1 ? generateId() : undefined;
    
    // Create notes for each valid preview
    for (let i = 0; i < validPreviews.length; i++) {
      const preview = validPreviews[i];
      const detected = await detectImageDimensionsFromRefs([preview.imageUrl]);
      const imageWidth = detected?.width || 256;
      const imageHeight = detected?.height || 256;
      const placement = allocator.findAndOccupy(imageWidth, imageHeight, anchorX, anchorY);
      const newNote: Note = {
        id: generateId(),
        createdAt: Date.now() + i,
        coords: {
          lat: preview.lat,
          lng: preview.lng
        },
        fontSize: 3,
        emoji: '',
        text: '',
        images: [preview.imageUrl],
        tags: [],
        variant: 'image',
        color: 'transparent',
        imageWidth,
        imageHeight,
        boardX: placement.x,
        boardY: placement.y,
        noteGroupId: importBatchGroupId,
      };
      
      addBoardNoteWithEnter(newNote);
    }
    
    // Show message if there were duplicates
    if (duplicateCount > 0) {
      alert(`Successfully imported ${validPreviews.length} new image(s). ${duplicateCount} duplicate(s) were skipped.`);
    }
    
    // Clean up
    importPreview.forEach(p => URL.revokeObjectURL(p.imageUrl));
    setImportPreview([]);
    setShowImportDialog(false);
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  
  // Cancel import
  const handleCancelImport = (e?: React.MouseEvent | React.KeyboardEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    // Clean up all preview URLs
    importPreview.forEach(p => {
      if (p.imageUrl) {
        URL.revokeObjectURL(p.imageUrl);
      }
    });
    setImportPreview([]);
    setShowImportDialog(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Handle data import (JSON)：与地图/表格等一致，合并全部便签；无坐标用 0,0（地图不绘制）
  const handleDataImport = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = parseProjectJsonNotesPayloadResult(text);
      if (parsed.ok === false) {
        alert(formatImportErrorMessage(parsed.error, file.name));
        return;
      }

      const existingNotes = notes || [];
      const uniqueImportedNotes = buildNewNotesFromProjectJsonRaws(parsed.rawNotes, existingNotes);

      if (uniqueImportedNotes.length === 0) {
        alert(
          formatImportErrorMessage(
            {
              title: '没有可导入的新便签',
              location: 'project.notes',
              detail: '可能全部重复或文件为空'
            },
            file.name
          )
        );
        return;
      }

      const boardNotes = existingNotes.filter((n) => n.boardX !== undefined && n.boardY !== undefined);
      const boardBounds = computeBoardBounds(boardNotes);
      const allocator = createGridAllocator({
        existingNotes: boardNotes,
        padding: PLACEMENT_PADDING,
        gap: PLACEMENT_GAP,
        cellSize: PLACEMENT_GRID_CELL
      });
      const anchorX = boardBounds ? boardBounds.maxX + PLACEMENT_GAP : PLACEMENT_PADDING;
      const anchorY = boardBounds ? boardBounds.minY : PLACEMENT_PADDING;

      const importBatchGroupId = uniqueImportedNotes.length > 1 ? generateId() : undefined;

      const newNotes = await Promise.all(
        uniqueImportedNotes.map(async (note) => {
        const processedNote: Note = { ...note };

        if (note.images && note.images.length > 0) {
          const processedImages: string[] = [];
          for (const imageData of note.images) {
            if (imageData.startsWith('img-')) {
              processedImages.push(imageData);
            } else {
              try {
                const imageId = await saveImage(imageData);
                processedImages.push(imageId);
              } catch (error) {
                console.error('Failed to save imported image:', error);
                processedImages.push(imageData);
              }
            }
          }
          processedNote.images = processedImages;
        }

        if (note.sketch) {
          if (note.sketch.startsWith('img-')) {
            processedNote.sketch = note.sketch;
          } else {
            try {
              const sketchId = await saveSketch(note.sketch);
              processedNote.sketch = sketchId;
            } catch (error) {
              console.error('Failed to save imported sketch:', error);
              processedNote.sketch = note.sketch;
            }
          }
        }

        if ((processedNote.images && processedNote.images.length > 0) || processedNote.variant === 'image') {
          processedNote.variant = 'image';
          const hasValidDims =
            typeof processedNote.imageWidth === 'number' &&
            processedNote.imageWidth > 0 &&
            typeof processedNote.imageHeight === 'number' &&
            processedNote.imageHeight > 0;
          if (!hasValidDims) {
            const detected = await detectImageDimensionsFromRefs(processedNote.images || []);
            processedNote.imageWidth = detected?.width || 256;
            processedNote.imageHeight = detected?.height || 256;
          }
          processedNote.color = 'transparent';
        }

        const { width, height } = boardNoteDimensions(processedNote);
        const placement = allocator.findAndOccupy(width, height, anchorX, anchorY);
        processedNote.boardX = placement.x;
        processedNote.boardY = placement.y;
        if (importBatchGroupId) processedNote.noteGroupId = importBatchGroupId;

        return processedNote;
      })
      );

      newNotes.forEach(addBoardNoteWithEnter);

      const duplicateCount = parsed.rawNotes.length - uniqueImportedNotes.length;
      if (duplicateCount > 0) {
        alert(`已导入 ${uniqueImportedNotes.length} 条便签，跳过 ${duplicateCount} 条（重复等）。`);
      } else {
        alert(`已成功导入 ${uniqueImportedNotes.length} 条便签。`);
      }
    } catch (error) {
      console.error('Failed to import data:', error);
      alert(formatUnexpectedImportError(error, file.name));
    }
  };

  // Close import menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowImportMenu(false);
      }
    };
    if (showImportMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showImportMenu]);

  // Drag and drop handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) {
      e.dataTransfer.dropEffect = 'copy';
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Check if we're actually leaving the container (not just moving to a child element)
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    
    // If the mouse is outside the container bounds, hide the drag overlay
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setIsDragging(false);
    }
  };

  const handleDragEnd = (e: React.DragEvent) => {
    // Always hide drag overlay when drag ends (even if cancelled)
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      // Filter image and JSON files
      const imageFiles: File[] = Array.from(files as FileList).filter((file: File) => {
        if (file.type && file.type.startsWith('image/')) return true;
        const name = file.name.toLowerCase();
        return (
          name.endsWith('.jpg') || name.endsWith('.jpeg') ||
          name.endsWith('.png') || name.endsWith('.webp') ||
          name.endsWith('.gif') || name.endsWith('.bmp') ||
          name.endsWith('.tif') || name.endsWith('.tiff') ||
          name.endsWith('.heic') || name.endsWith('.heif')
        );
      });
      const jsonFiles: File[] = Array.from(files as FileList).filter((file: File) => 
        file.type === 'application/json' || file.name.endsWith('.json')
      );
      const csvFiles: File[] = Array.from(files as FileList).filter(
        (file: File) => file.type === 'text/csv' || file.name.toLowerCase().endsWith('.csv')
      );

      if (imageFiles.length > 0) {
        // 编辑模式下（且未打开便签编辑器）拖入图片：新增图片对象
        if (workspaceEditMode && !editingNote) {
          try {
            for (const file of imageFiles) {
              const { base64, width, height } = await compressImageToBase64(file, 512);
              // 计算投放位置（使用鼠标位置）
              const rect = containerRef.current?.getBoundingClientRect();
              let position;
              if (rect) {
                const worldX = (e.clientX - rect.left - transform.x) / transform.scale;
                const worldY = (e.clientY - rect.top - transform.y) / transform.scale;
                position = { x: worldX, y: worldY };
              }
              createImageNote(base64, width, height, position);
            }
          } catch (error) {
            console.error('Failed to add image note:', error);
          }
        } else if (editingNote && editingNote.variant !== 'image') {
          // 如果正在编辑便签，仍然把图片加到当前便签
          try {
            const newImages: string[] = [];
            for (const file of imageFiles) {
              const base64 = await fileToBase64(file as File);
              newImages.push(base64);
            }
            const updatedNote = {
              ...editingNote,
              images: [...(editingNote.images || []), ...newImages]
            };
            onUpdateNote(updatedNote);
            setEditingNote(updatedNote);
          } catch (error) {
            console.error('Failed to add images to note:', error);
          }
        } else {
          // 非编辑模式保持原有导入逻辑
          const dataTransfer = new DataTransfer();
          imageFiles.forEach((file) => {
            dataTransfer.items.add(file as File);
          });
          handleImageImport(dataTransfer.files, true);
        }
      } else if (jsonFiles.length > 0 && jsonFiles[0]) {
        handleDataImport(jsonFiles[0] as File);
      } else if (csvFiles.length > 0 && csvFiles[0]) {
        void handleCsvDataImport(csvFiles[0] as File);
      }
    }
  };

// compressImageToBase64 function moved to utils/board/board-utils.ts

  const createImageNote = (base64: string, imgWidth: number, imgHeight: number, position?: { x: number; y: number }) => {
    if (!containerRef.current) return;
    const { width, height } = containerRef.current.getBoundingClientRect();
    const centerX = position ? position.x : (width / 2 - transform.x) / transform.scale;
    const centerY = position ? position.y : (height / 2 - transform.y) / transform.scale;

    const boardWidth = imgWidth;
    const boardHeight = imgHeight;
    const spawnX = centerX - boardWidth / 2;
    const spawnY = centerY - boardHeight / 2;

    const newNote: Note = {
      id: generateId(),
      createdAt: Date.now(),
      coords: { lat: 0, lng: 0 },
      emoji: '',
      text: '',
      fontSize: 3,
      images: [base64],
      tags: [],
      boardX: spawnX,
      boardY: spawnY,
      variant: 'image',
      color: 'transparent',
      imageWidth: boardWidth,
      imageHeight: boardHeight,
    };
    addBoardNoteWithEnter(newNote);
  };

  const handleImageInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { base64, width, height } = await compressImageToBase64(file, 512);
      createImageNote(base64, width, height);
    } catch (error) {
      console.error('Failed to add image note:', error);
    } finally {
      e.target.value = '';
    }
  };

  const handleAddImageClick = () => {
    if (imageFileInputRef.current) {
      imageFileInputRef.current.click();
    }
  };

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
      openNewBoardNoteEditorAfterIntro(newNote);
    }
    setIsSelectingNotePosition(false);
  };

const createNoteAtCenter = () => {
     const boardNotes = notes.filter((n) => n.boardX !== undefined && n.boardY !== undefined);
     const { boardX, boardY } = nextSequentialSlot(boardNotes.length);
     const newNote: Note = {
         id: generateId(),
         createdAt: Date.now(),
         coords: { lat: 0, lng: 0 },
         emoji: '',
         text: '',
         fontSize: 3,
         images: [],
         tags: [],
         boardX,
         boardY,
         variant: 'standard',
         color: '#FFFDF5'
     };
     beginNewBoardNoteIntro(newNote);
     openNewBoardNoteEditorAfterIntro(newNote);
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
    openNewBoardNoteEditorAfterIntro(note, Date.now() - introStartedAtRef.current);
  }, [openNewBoardNoteEditorAfterIntro]);

  const cancelBoardLongPressPreview = useCallback(() => {
    boardLongPressPreviewNoteRef.current = null;
    if (introTimerRef.current !== null) window.clearTimeout(introTimerRef.current);
    introTimerRef.current = null;
    setIsIntroPending(false);
    setIntroNote(null);
    setEditingNote(null);
  }, []);

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
      const boardX = (e.clientX - rect.left - transform.x) / transform.scale;
      const boardY = (e.clientY - rect.top - transform.y) / transform.scale;
      if (boardObjectContainsPosition(boardX, boardY)) return;

      clearBoardLongPress();
      boardLongPressTriggeredRef.current = false;
      boardLongPressStartRef.current = { clientX: e.clientX, clientY: e.clientY, boardX, boardY };
      boardLongPressTimerRef.current = window.setTimeout(() => {
        boardLongPressTimerRef.current = null;
        const press = boardLongPressStartRef.current;
        if (!press || boardObjectContainsPosition(press.boardX, press.boardY)) return;
        boardLongPressTriggeredRef.current = true;
        setIsPanning(false);
        setIsDraggingBackground(false);
        lastMousePos.current = null;
        panStartPos.current = null;
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
      transform.scale,
      transform.x,
      transform.y
    ]
  );

  const scheduleZoomTransformPersist = useCallback((x: number, y: number, scale: number) => {
    if (zoomSaveTimeoutRef.current) {
      clearTimeout(zoomSaveTimeoutRef.current);
    }
    zoomSaveTimeoutRef.current = setTimeout(() => {
      if (onTransformChange) {
        onTransformChange(x, y, scale);
      }
    }, 500);
  }, [onTransformChange]);

  // 以指定视图坐标点为中心进行缩放（坐标相对容器左上角，与地图/图视图滚轮缩放一致）
  const zoomAtViewPoint = useCallback(
    (newScale: number, viewX: number, viewY: number) => {
      const clamped = Math.min(Math.max(0.2, newScale), 4);
      let nextX = 0;
      let nextY = 0;
      setTransform((prev) => {
        const worldX = (viewX - prev.x) / prev.scale;
        const worldY = (viewY - prev.y) / prev.scale;
        nextX = viewX - worldX * clamped;
        nextY = viewY - worldY * clamped;
        return { x: nextX, y: nextY, scale: clamped };
      });
      scheduleZoomTransformPersist(nextX, nextY, clamped);
    },
    [scheduleZoomTransformPersist]
  );

  // 以视图中心为中心进行缩放
  const zoomAtViewCenter = useCallback(
    (newScale: number) => {
      if (!containerRef.current) return;
      const { width, height } = containerRef.current.getBoundingClientRect();
      zoomAtViewPoint(newScale, width / 2, height / 2);
    },
    [zoomAtViewPoint]
  );

  // 处理触摸双指缩放
  const touchStartRef = useRef<{
    distance: number;
    scale: number;
    centerX: number;
    centerY: number;
    transformX: number;
    transformY: number;
  } | null>(null);

  isZoomingRef.current = isZooming;

  // Use native event listeners for touch events to allow preventDefault
  // Stable deps: read transform via transformRef so pinch does not rebind every frame.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const cancelSingleFingerPan = () => {
      if (!isPanningRef.current) return;
      isPanningRef.current = false;
      setIsPanning(false);
      setIsDraggingBackground(false);
      lastMousePos.current = null;
      panStartPos.current = null;
      try {
        // Release any active pointer captures on the board container
        const captures = (container as HTMLElement & { hasPointerCapture?: (id: number) => boolean });
        // Best-effort: clear common pointer ids if still captured
        for (let id = 0; id < 8; id++) {
          if (typeof captures.hasPointerCapture === 'function' && captures.hasPointerCapture(id)) {
            captures.releasePointerCapture(id);
          }
        }
      } catch {
        // ignore
      }
    };

    const handleTouchStart = (e: TouchEvent) => {
      // 如果是双指，取消所有长按检测与单指平移
      if (e.touches.length === 2) {
        e.preventDefault(); // 禁用浏览器的双指缩放
        cancelSingleFingerPan();
        isZoomingRef.current = true;
        setIsZooming(true);

        cancelBrowseLongPress();

        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        const distance = Math.sqrt(
          Math.pow(touch2.clientX - touch1.clientX, 2) +
            Math.pow(touch2.clientY - touch1.clientY, 2)
        );
        const centerX = (touch1.clientX + touch2.clientX) / 2;
        const centerY = (touch1.clientY + touch2.clientY) / 2;
        const rect = container.getBoundingClientRect();
        const relativeCenterX = centerX - rect.left;
        const relativeCenterY = centerY - rect.top;
        const t = transformRef.current;

        touchStartRef.current = {
          distance,
          scale: t.scale,
          centerX: relativeCenterX,
          centerY: relativeCenterY,
          transformX: t.x,
          transformY: t.y
        };
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && touchStartRef.current) {
        e.preventDefault();
        cancelBrowseLongPress();

        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        const distance = Math.sqrt(
          Math.pow(touch2.clientX - touch1.clientX, 2) +
            Math.pow(touch2.clientY - touch1.clientY, 2)
        );

        const start = touchStartRef.current;
        const scaleRatio = distance / start.distance;
        const newScale = Math.min(Math.max(0.2, start.scale * scaleRatio), 4);

        // Anchor at current two-finger midpoint (world point under fingers stays put)
        const currentCenterX = (touch1.clientX + touch2.clientX) / 2;
        const currentCenterY = (touch1.clientY + touch2.clientY) / 2;
        const rect = container.getBoundingClientRect();
        const relativeCenterX = currentCenterX - rect.left;
        const relativeCenterY = currentCenterY - rect.top;

        const t = transformRef.current;
        const liveWorldX = (relativeCenterX - t.x) / t.scale;
        const liveWorldY = (relativeCenterY - t.y) / t.scale;
        const newX = relativeCenterX - liveWorldX * newScale;
        const newY = relativeCenterY - liveWorldY * newScale;

        const next = { x: newX, y: newY, scale: newScale };
        transformRef.current = next;
        setTransform(next);
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        if (touchStartRef.current) {
          const t = transformRef.current;
          scheduleZoomTransformPersist(t.x, t.y, t.scale);
        }
        touchStartRef.current = null;
        // 延迟重置缩放状态，防止触发误点击
        setTimeout(() => {
          isZoomingRef.current = false;
          setIsZooming(false);
        }, 100);
      }
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: false });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: false });
    container.addEventListener('touchcancel', handleTouchEnd, { passive: false });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [scheduleZoomTransformPersist, cancelBrowseLongPress]);

  // Add wheel event listener with passive: false to allow preventDefault（与普通滚轮缩放一致，以指针为中心）
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const wheelHandler = (e: WheelEvent) => {
      e.preventDefault();
      const rect = container.getBoundingClientRect();
      const viewX = e.clientX - rect.left;
      const viewY = e.clientY - rect.top;
      const zoomSensitivity = 0.001;
      // Shift+滚轮时系统常把纵向增量映射到 deltaX，仅用 deltaY 会导致无法缩放
      const scrollDelta = e.shiftKey
        ? Math.abs(e.deltaX) > Math.abs(e.deltaY)
          ? e.deltaX
          : e.deltaY
        : e.deltaY;
      const delta = -scrollDelta * zoomSensitivity;
      let nextX = 0;
      let nextY = 0;
      let nextScale = 1;
      setTransform((prev) => {
        nextScale = Math.min(Math.max(0.2, prev.scale + delta), 4);
        const worldX = (viewX - prev.x) / prev.scale;
        const worldY = (viewY - prev.y) / prev.scale;
        nextX = viewX - worldX * nextScale;
        nextY = viewY - worldY * nextScale;
        return { x: nextX, y: nextY, scale: nextScale };
      });
      scheduleZoomTransformPersist(nextX, nextY, nextScale);
    };

    container.addEventListener('wheel', wheelHandler, { passive: false });

    return () => {
      container.removeEventListener('wheel', wheelHandler);
    };
  }, [scheduleZoomTransformPersist]);

  const handleBoardPointerDown = (e: React.PointerEvent) => {
      // 阻止浏览器默认长按菜单
      e.preventDefault();

      // 如果有正在运行的动画，立即停止它，防止位置计算抖动
      stopAnimations();

      // 缓存容器位置，减少抖动并提高性能
      dragRectRef.current = containerRef.current?.getBoundingClientRect() || null;
      
      // 如果在Frame绘制模式 (必须在编辑模式下才有效)
      if (isDrawingFrame && workspaceEditMode) {
          const rect = dragRectRef.current;
          if (!rect) return;
          // 坐标转换：从屏幕坐标转换为世界坐标
          // 使用与拖动frame相同的公式，确保一致性
          const worldX = (e.clientX - rect.left - transform.x) / transform.scale;
          const worldY = (e.clientY - rect.top - transform.y) / transform.scale;
          setDrawingFrameStart({ x: worldX, y: worldY });
          setDrawingFrameEnd({ x: worldX, y: worldY });
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          return;
      } else if (isDrawingFrame && !workspaceEditMode) {
          // 如果不在编辑模式但处于绘制状态，自动退出绘制模式
          setIsDrawingFrame(false);
      }
      
      // 检查事件目标是否是 note 元素
      // 如果目标是 note，不清空长按计时器，让 note 自己处理
      const target = e.target as HTMLElement;
      const isNoteClick = target.closest('[data-is-note]') !== null;

      if (!isNoteClick) startBoardLongPress(e);
      
      // 只有当目标不是 note 时，才取消长按检测和单击检测
      if (!isNoteClick) {
        cancelBrowseLongPress();
        // 注意：不清空 currentNotePressIdRef，因为用户可能在note上按下，然后移动鼠标到背景上
        // currentNotePressIdRef 会在 handleNotePointerUp 中根据移动距离判断是否清空
      }
      
      // 框选：编辑模式下「框选」按钮，或任意模式下按住 Shift
      const shiftOrBoxSelect =
        (workspaceEditMode && isBoxSelecting) || isShiftPressed || e.shiftKey;
      if (
        e.button === 0 &&
        shiftOrBoxSelect &&
        !draggingNoteId &&
        !resizingFrame &&
        !draggingFrameId &&
        !isNoteClick &&
        !resizingImage
      ) {
          const rect = dragRectRef.current;
          if (!rect) return;
          const worldX = (e.clientX - rect.left - transform.x) / transform.scale;
          const worldY = (e.clientY - rect.top - transform.y) / transform.scale;
          setBoxSelectStart({ x: worldX, y: worldY });
          setBoxSelectEnd({ x: worldX, y: worldY });
          // Shift 时保留已有选中；否则替换
          if (!isShiftPressed && !e.shiftKey) {
              setSelectedNoteIds(new Set());
              setSelectedNoteId(null);
          }
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          return;
      }
      
      // Allow panning in both edit and non-edit modes, but not when dragging notes or frames
      if (e.button === 0 && !draggingNoteId && !resizingFrame && !draggingFrameId) { 
          setIsPanning(true);
          setIsDraggingBackground(true); // 标记开始拖拽背景
          const startPos = { x: e.clientX, y: e.clientY };
          panStartPos.current = startPos; // Save the initial pan position
          lastMousePos.current = startPos;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }
  };

  const handleBoardPointerMove = (e: React.PointerEvent) => {
      const longPressStart = boardLongPressStartRef.current;
      if (longPressStart) {
        const dx = e.clientX - longPressStart.clientX;
        const dy = e.clientY - longPressStart.clientY;
        if (Math.hypot(dx, dy) > 10) clearBoardLongPress();
      }
      // 如果处于位置选择模式，更新预览位置
      if (isSelectingNotePosition && (containerRef.current || dragRectRef.current)) {
          const rect = dragRectRef.current || containerRef.current?.getBoundingClientRect();
          if (!rect) return;
          const boardX = (e.clientX - rect.left - transform.x) / transform.scale;
          const boardY = (e.clientY - rect.top - transform.y) / transform.scale;
          setNotePositionPreview({ x: boardX, y: boardY });
      }
      
      // 如果正在拖动Frame
      const activeDraggingFrameId = draggingFrameRef.current || draggingFrameId;
      if (activeDraggingFrameId && draggingFrameOffset) {
          const rect = dragRectRef.current || containerRef.current?.getBoundingClientRect();
          if (!rect) return;
          const worldX = (e.clientX - rect.left - transform.x) / transform.scale;
          const worldY = (e.clientY - rect.top - transform.y) / transform.scale;
          
          setLocalDraggingFramePos({
              x: worldX - draggingFrameOffset.x,
              y: worldY - draggingFrameOffset.y
          });
          return;
      }
      
      // 如果正在调整图片大小（等比例缩放）
      if (resizingImage) {
          const rect = dragRectRef.current || containerRef.current?.getBoundingClientRect();
          if (!rect) return;
          const worldX = (e.clientX - rect.left - transform.x) / transform.scale;
          const worldY = (e.clientY - rect.top - transform.y) / transform.scale;
          
          const dx = worldX - resizingImage.startX;
          const dy = worldY - resizingImage.startY;
          
          // 计算距离中心点的距离变化（用于等比例缩放）
          const centerX = resizingImage.startBoardX + resizingImage.startWidth / 2;
          const centerY = resizingImage.startBoardY + resizingImage.startHeight / 2;
          
          let distanceX = 0, distanceY = 0;
          switch (resizingImage.corner) {
              case 'tl':
                  distanceX = centerX - worldX;
                  distanceY = centerY - worldY;
                  break;
              case 'tr':
                  distanceX = worldX - centerX;
                  distanceY = centerY - worldY;
                  break;
              case 'bl':
                  distanceX = centerX - worldX;
                  distanceY = worldY - centerY;
                  break;
              case 'br':
                  distanceX = worldX - centerX;
                  distanceY = worldY - centerY;
                  break;
          }
          
          // 使用较大的距离变化来保持等比例
          const distance = Math.max(Math.abs(distanceX), Math.abs(distanceY));
          const scale = distance / (Math.min(resizingImage.startWidth, resizingImage.startHeight) / 2);
          
          // 保持宽高比
          const newWidth = Math.max(50, resizingImage.startWidth * scale);
          const newHeight = Math.max(50, resizingImage.startHeight * scale);
          
          // 计算新的位置（保持中心点不变）
          const newBoardX = centerX - newWidth / 2;
          const newBoardY = centerY - newHeight / 2;
          
          const note = notes.find(n => n.id === resizingImage.id);
          if (note) {
              setLocalResizingImageSize({
                  id: resizingImage.id,
                  x: newBoardX,
                  y: newBoardY,
                  width: newWidth,
                  height: newHeight
              });
          }
          return;
      }
      
      // 如果正在调整Frame大小
      const activeResizingFrame = resizingFrameRef.current || resizingFrame;
      if (activeResizingFrame) {
          const rect = dragRectRef.current || containerRef.current?.getBoundingClientRect();
          if (!rect) return;
          const worldX = (e.clientX - rect.left - transform.x) / transform.scale;
          const worldY = (e.clientY - rect.top - transform.y) / transform.scale;
          
          const fixedX = activeResizingFrame.fixedX;
          const fixedY = activeResizingFrame.fixedY;
          
          // 相当于以固定点为起点，当前鼠标位置为对角点重新计算矩形
          const newX = Math.min(fixedX, worldX);
          const newY = Math.min(fixedY, worldY);
          const newWidth = Math.max(100, Math.abs(fixedX - worldX));
          const newHeight = Math.max(100, Math.abs(fixedY - worldY));
          
          setLocalResizingFrameSize({ x: newX, y: newY, width: newWidth, height: newHeight });
          return;
      }
      
      // 如果正在绘制Frame
      if (isDrawingFrame && drawingFrameStart) {
          const rect = dragRectRef.current || containerRef.current?.getBoundingClientRect();
          if (!rect) return;
          // 坐标转换：从屏幕坐标转换为世界坐标
          // 使用与拖动frame相同的公式，确保一致性
          const worldX = (e.clientX - rect.left - transform.x) / transform.scale;
          const worldY = (e.clientY - rect.top - transform.y) / transform.scale;
          setDrawingFrameEnd({ x: worldX, y: worldY });
          return;
      }
      
      // 如果正在框选（含按住 Shift 触发的临时框选）
      if (boxSelectStart) {
          const rect = dragRectRef.current || containerRef.current?.getBoundingClientRect();
          if (!rect) return;
          const worldX = (e.clientX - rect.left - transform.x) / transform.scale;
          const worldY = (e.clientY - rect.top - transform.y) / transform.scale;
          setBoxSelectEnd({ x: worldX, y: worldY });
          
          // 计算框选区域
          const minX = Math.min(boxSelectStart.x, worldX);
          const maxX = Math.max(boxSelectStart.x, worldX);
          const minY = Math.min(boxSelectStart.y, worldY);
          const maxY = Math.max(boxSelectStart.y, worldY);
          
          const additive = isShiftPressed || e.shiftKey;
          // Shift：在原有选中上增减；否则以当前框为准替换
          const selectedIds = new Set<string>(additive ? selectedNoteIds : new Set());
          notes.forEach(note => {
              const { width: noteWidth, height: noteHeight } = boardNoteDimensions(note);
              const noteRight = note.boardX + noteWidth;
              const noteBottom = note.boardY + noteHeight;
              
              if (note.boardX < maxX && noteRight > minX && note.boardY < maxY && noteBottom > minY) {
                  selectedIds.add(note.id);
              } else if (!additive) {
                  selectedIds.delete(note.id);
              }
          });
          setSelectedNoteIds(selectedIds);
          return;
      }
      
      if (!isPanning || !lastMousePos.current) return;
      if (isZoomingRef.current) return;
      e.preventDefault(); // 阻止浏览器默认行为
      const dx = e.clientX - lastMousePos.current.x;
      const dy = e.clientY - lastMousePos.current.y;
      setTransform(prev => {
        const next = { ...prev, x: prev.x + dx, y: prev.y + dy };
        transformRef.current = next;
        return next;
      });
      lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleBoardPointerUp = (e: React.PointerEvent) => {
      // 优先处理需要释放状态的操作，避免提前返回导致状态未释放
      const didCreateFromLongPress = boardLongPressTriggeredRef.current;
      clearBoardLongPress();
      if (didCreateFromLongPress) {
          boardLongPressTriggeredRef.current = false;
          commitBoardLongPressPreview();
          setIsPanning(false);
          setIsDraggingBackground(false);
          lastMousePos.current = null;
          panStartPos.current = null;
          dragRectRef.current = null;
          try {
            (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
          } catch {
            /* pointer capture may already have been released */
          }
          return;
      }

      // 如果正在调整Frame大小，结束调整
      if (resizingFrameRef.current || resizingFrame) {
          const currentResizing = resizingFrameRef.current || resizingFrame;
          if (localResizingFrameSize && currentResizing) {
              isWaitingForSyncRef.current = true;
              // 安全回退：如果 props 没更新，500ms 后强制清除
              setTimeout(() => {
                if (isWaitingForSyncRef.current) {
                  setLocalResizingFrameSize(null);
                  setLocalDraggingFramePos(null);
                  isWaitingForSyncRef.current = false;
                }
              }, 500);
              
              onUpdateFrames?.(frames.map(f => 
                  f.id === currentResizing.id ? { ...f, ...localResizingFrameSize } : f
              ));
          }
          setResizingFrame(null);
          resizingFrameRef.current = null;
          // setLocalResizingFrameSize(null); // 不立即清除，等待 props 更新
          dragRectRef.current = null;
          (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
          return;
      }

      // 如果正在调整图片大小，结束调整
      if (resizingImage) {
          if (localResizingImageSize) {
              const note = notes.find(n => n.id === localResizingImageSize.id);
              if (note) {
                  onUpdateNote({
                      ...note,
                      boardX: localResizingImageSize.x,
                      boardY: localResizingImageSize.y,
                      imageWidth: localResizingImageSize.width,
                      imageHeight: localResizingImageSize.height
                  });
              }
          }
          setResizingImage(null);
          setLocalResizingImageSize(null);
          dragRectRef.current = null;
          (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
          return;
      }

      // 如果正在拖动Frame，结束拖动
      if (draggingFrameId || draggingFrameRef.current) {
          const currentDraggingId = draggingFrameId || draggingFrameRef.current;
          if (localDraggingFramePos && currentDraggingId) {
              isWaitingForSyncRef.current = true;
              // 安全回退：如果 props 没更新，500ms 后强制清除
              setTimeout(() => {
                if (isWaitingForSyncRef.current) {
                  setLocalResizingFrameSize(null);
                  setLocalDraggingFramePos(null);
                  isWaitingForSyncRef.current = false;
                }
              }, 500);

              onUpdateFrames?.(frames.map(f => 
                  f.id === currentDraggingId ? { ...f, x: localDraggingFramePos.x, y: localDraggingFramePos.y } : f
              ));
          }
          setDraggingFrameId(null);
          draggingFrameRef.current = null;
          setDraggingFrameOffset(null);
          // setLocalDraggingFramePos(null); // 不立即清除，等待 props 更新
          dragRectRef.current = null;
          return;
      }
      
      // 结束当前框选拖拽（保持「多选/框选」按钮状态；Shift 临时框选本就不改 isBoxSelecting）
      if (boxSelectStart) {
          setBoxSelectStart(null);
          setBoxSelectEnd(null);
          dragRectRef.current = null;
          (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
          return;
      }
      
      // 检查是否点击了UI元素（按钮、面板等）
      const target = e.target as HTMLElement;
      if (target) {
          // 检查是否是交互元素
          const interactiveTags = ['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'A'];
          if (interactiveTags.includes(target.tagName)) {
              resetBlankClickCount();
              dragRectRef.current = null;
              return;
          }
          
          // 检查是否在UI容器内（通过检查z-index或特定类名）
          let current: HTMLElement | null = target;
          while (current) {
              const zIndex = window.getComputedStyle(current).zIndex;
              if (zIndex && (zIndex === '500' || parseInt(zIndex) >= 500)) {
                  resetBlankClickCount();
                  dragRectRef.current = null;
                  return;
              }
              if (current.classList.contains('pointer-events-auto') && 
                  (current.classList.contains('fixed') || current.classList.contains('absolute'))) {
                  resetBlankClickCount();
                  dragRectRef.current = null;
                  return;
              }
              current = current.parentElement;
          }
      }
      
      // 检查是否有实际移动（点击 vs 拖动）
      // 使用拖动开始时的位置来计算总移动距离
      let hasMoved = false;
      
      if (isPanning && panStartPos.current) {
          const dx = e.clientX - panStartPos.current.x;
          const dy = e.clientY - panStartPos.current.y;
          const totalMoveDistance = Math.sqrt(dx * dx + dy * dy);
          hasMoved = totalMoveDistance > 5; // 如果总移动距离超过5px，认为是拖动
      }
      
      // 结束panning状态
      if (isPanning) {
          setIsPanning(false);
          lastMousePos.current = null;
          panStartPos.current = null; // Clear pan start position
          (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);

          // 如果刚才在拖拽背景，现在保存位置（类似MapPositionTracker的moveend事件）
          if (isDraggingBackground && onTransformChange) {
              onTransformChange(transform.x, transform.y, transform.scale);
          }
          setIsDraggingBackground(false);
      }
      
      // 点击空白处的退出逻辑（只在非拖动/非缩放状态下触发）
      // 如果发生了拖动，不应该触发点击计数
      if (hasMoved) {
          resetBlankClickCount();
          // 多选拖动的结束逻辑会在后面的代码中处理，不要在这里提前返回
          if (!isMultiSelectDragging) {
              dragRectRef.current = null;
              return;
          }
      }
      
      // 如果正在绘制Frame，完成绘制（优先处理，不进行退出编辑模式的计数）
      if (isDrawingFrame && drawingFrameStart && drawingFrameEnd) {
          const minWidth = 100;
          const minHeight = 100;
          const x = Math.min(drawingFrameStart.x, drawingFrameEnd.x);
          const y = Math.min(drawingFrameStart.y, drawingFrameEnd.y);
          const width = Math.max(Math.abs(drawingFrameEnd.x - drawingFrameStart.x), minWidth);
          const height = Math.max(Math.abs(drawingFrameEnd.y - drawingFrameStart.y), minHeight);
          
          const newFrame: Frame = {
              id: generateId(),
              title: 'Frame',
              x,
              y,
              width,
              height,
              color: 'rgba(255, 255, 255, 0.5)'
          };

          onUpdateFrames?.([...frames, newFrame]);

          // 被框选的便签归属到新 frame（单簇）
          if (selectedNoteIds.size > 0) {
            selectedNoteIds.forEach(noteId => {
              const note = notes.find(n => n.id === noteId);
              if (note) {
                const updatedNote = {
                  ...note,
                  groupIds: [newFrame.id],
                  groupNames: [newFrame.title],
                  groupId: newFrame.id,
                  groupName: newFrame.title
                };
                onUpdateNote(updatedNote);
              }
            });
          }

          setIsDrawingFrame(false);
          setDrawingFrameStart(null);
          setDrawingFrameEnd(null);
          setSelectedFrameId(newFrame.id);
          setEditingFrameId(newFrame.id);
          setEditingFrameTitle('Frame');
          dragRectRef.current = null;
          (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
          return;
      }
      
      // 只有在没有拖动（点击）且没有缩放时才执行退出逻辑
      if (!hasMoved && !isZooming) {
          // 0. 如果处于位置选择模式，在点击位置创建便签（最优先处理）
          if (isSelectingNotePosition && (containerRef.current || dragRectRef.current)) {
              const rect = dragRectRef.current || containerRef.current?.getBoundingClientRect();
              if (rect) {
                const boardX = (e.clientX - rect.left - transform.x) / transform.scale;
                const boardY = (e.clientY - rect.top - transform.y) / transform.scale;
                createNoteAtPosition(boardX, boardY);
              }
              dragRectRef.current = null;
              (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
              return;
          }
          
          // 0. 如果处于框选模式或frame创建模式，点击空白处退出这些模式（优先处理）
          if (isBoxSelecting || isDrawingFrame) {
              setIsBoxSelecting(false);
              setIsDrawingFrame(false);
              setBoxSelectStart(null);
              setBoxSelectEnd(null);
              setDrawingFrameStart(null);
              setDrawingFrameEnd(null);
              resetBlankClickCount();
              dragRectRef.current = null;
              return;
          }
          
          // 1. 如果有编辑中的Frame标题，先退出标题编辑
          if (editingFrameId) {
              setEditingFrameId(null);
              resetBlankClickCount();
              dragRectRef.current = null;
              return;
          }
          
          // 2. 单击空白画布：统一只清空选中（编辑/非编辑一致）
          // 为了避免破坏 Shift 多选与拖动手势，这里保留原有条件保护
          if (selectedFrameId || selectedNoteId || selectedConnectionId || (selectedNoteIds.size > 0 && !isShiftPressed && !e.shiftKey && !hasMoved && !isMultiSelectDragging)) {
              setSelectedFrameId(null);
              setSelectedNoteId(null);
              if (!isShiftPressed && !e.shiftKey && !hasMoved && !isMultiSelectDragging) {
                setSelectedNoteIds(new Set());
              }
              setSelectedConnectionId(null);
              resetBlankClickCount();
              dragRectRef.current = null;
              return;
          }
          
          // 3. 非编辑模式下，点击空白处清除过滤（图层 / 标签 / 时间）
          if (
            !workspaceEditMode &&
            (filterFrameIds.size > 0 ||
              boardFilterTagLabels.size > 0 ||
              boardFilterIncludeUntagged ||
              boardFilterTimeRange != null)
          ) {
              setFilterFrameIds(new Set());
              setBoardFilterTagLabels(new Set());
              setBoardFilterIncludeUntagged(false);
              setBoardFilterTimeRange(null);
              dragRectRef.current = null;
              return;
          }
          
          // 4. 编辑模式退出改为“空白画布双击”，不再在单击中做计数退出
      }
      
      // 如果正在绘制Frame但还没有结束点，不处理（已在上面处理完成情况）
      if (isDrawingFrame) {
          dragRectRef.current = null;
          return;
      }
      
      dragRectRef.current = null;
  };

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
      setIsBoxSelecting(false);
      setBoxSelectStart(null);
      setBoxSelectEnd(null);
      setIsDrawingFrame(false);
      setDrawingFrameStart(null);
      setDrawingFrameEnd(null);
      setEditingFrameId(null);
    }
    resetBlankClickCount();
  };

  // 获取连接点的位置
  // 处理连接点点击
  const handleConnectionPointDown = (e: React.PointerEvent, noteId: string, side: 'top' | 'right' | 'bottom' | 'left') => {
    e.stopPropagation();
    e.preventDefault();
    
    // 缩放时不触发连接
    if (isZooming) return;
    
    // 振动反馈
    if (navigator.vibrate) {
      navigator.vibrate(VIBRATION_SHORT);
    }
    
    setSelectedNoteId(noteId);
    setConnectingFrom({ noteId, side });
    resetBlankClickCount();
    
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left - transform.x) / transform.scale;
      const y = (e.clientY - rect.top - transform.y) / transform.scale;
      setConnectingTo({ x, y });
    }
  };
  
  // 处理连接点移动
  const handleConnectionPointMove = (e: React.PointerEvent) => {
    if (!connectingFrom || !containerRef.current) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const rect = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left - transform.x) / transform.scale;
    const y = (e.clientY - rect.top - transform.y) / transform.scale;
    
    setConnectingTo({ x, y });
    
    // 检查是否悬停在连接点附近
    const target = findConnectionPointAt(x, y, connectingFrom.noteId);
    if (target) {
      setHoveringConnectionPoint({ noteId: target.noteId, side: target.side });
    } else {
      setHoveringConnectionPoint(null);
    }
  };
  
  // 处理连接点释放
  const handleConnectionPointUp = (e: React.PointerEvent, targetNoteId?: string, targetSide?: 'top' | 'right' | 'bottom' | 'left') => {
    if (!connectingFrom) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    // 释放指针捕获
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    
    if (targetNoteId && targetSide && targetNoteId !== connectingFrom.noteId) {
      // 创建连接成功，振动反馈
      if (navigator.vibrate) {
        navigator.vibrate(VIBRATION_LONG);
      }
      
      // 创建连接
      const newConnection = {
        id: generateId(),
        fromNoteId: connectingFrom.noteId,
        toNoteId: targetNoteId,
        fromSide: connectingFrom.side,
        toSide: targetSide,
        arrow: 'forward' as const // 默认正向箭头
      };
      
      const updatedConnections = [...effectiveConnections, newConnection];
      onUpdateConnections?.(updatedConnections);
    }
    
    setConnectingFrom(null);
    setConnectingTo(null);
    setHoveringConnectionPoint(null);
  };
  
  // 检查点是否在连接点附近
  const findConnectionPointAt = (x: number, y: number, excludeNoteId?: string) => {
    for (const note of notes) {
      if (note.id === excludeNoteId) continue;
      
      const isDragging = draggingNoteId === note.id;
      for (const side of ['top', 'right', 'bottom', 'left'] as const) {
        const point = getConnectionPoint(note, side, isDragging, dragOffset);
        const dist = Math.sqrt(Math.pow(x - point.x, 2) + Math.pow(y - point.y, 2));
        if (dist < CONNECTION_POINT_DETECT_RADIUS) {
          return { noteId: note.id, side };
        }
      }
    }
    return null;
  };

  const handleDeleteClick = (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      e.preventDefault();
      // Reset blank click count to prevent exiting edit mode
      resetBlankClickCount();
      
      // If multiple notes are selected, delete all selected notes
      if (selectedNoteIds.size > 1 && selectedNoteIds.has(id)) {
        deleteBoardNotesWithExit(Array.from(selectedNoteIds));
      } else {
        // Single note deletion
        deleteBoardNotesWithExit([id]);
      }
  };

  // Visuals
  const gridSize = 40 * transform.scale;
  const dotSize = 3 * transform.scale;

  const openInspectorNoteEditor = useCallback(
    (noteId: string) => {
      const n = notes.find((x) => x.id === noteId);
      if (!n) return;
      void ensureNoteImagesLoaded(n).then((loadedNote) => {
        setEditingNote(loadedNote);
        onToggleEditor(true);
      });
    },
    [notes, onToggleEditor]
  );

  const boardEditInspectorPanelProps = useMemo(
    (): EditInspectorPanelProps => ({
      note: boardInspectorNote,
      groupContext: boardInspectorNote ? null : boardInspectorGroupContext,
      inspectorFrame: boardInspectorFrame,
      onUpdateFrame: onUpdateFrames
        ? (f) => onUpdateFrames(frames.map((x) => (x.id === f.id ? f : x)))
        : undefined,
      inspectorConnection: boardInspectorConnection,
      coordMode: 'board',
      themeColor,
      panelChromeStyle: panelChromeStyle,
      frames: frames ?? [],
      connections: effectiveConnections,
      notes,
      hasConnectionWrite: !!onUpdateConnections,
      onUpdateNote,
      onEditConnection: handleEditBoardInsConn,
      onNewConnection: handleNewConnectionFromBoardInspector,
      onOpenFullNoteEditor: openInspectorNoteEditor,
      onFocusPeerInView: (noteId) => {
        const n = notes.find((x) => x.id === noteId);
        if (n) panBoardToNoteCenter(n);
      }
    }),
    [
      boardInspectorNote,
      boardInspectorGroupContext,
      boardInspectorFrame,
      boardInspectorConnection,
      onUpdateFrames,
      frames,
      themeColor,
      panelChromeStyle,
      effectiveConnections,
      notes,
      onUpdateConnections,
      onUpdateNote,
      handleEditBoardInsConn,
      handleNewConnectionFromBoardInspector,
      openInspectorNoteEditor,
      panBoardToNoteCenter
    ]
  );

  useRegisterEditInspector(isUIVisible && workspaceEditMode, boardEditInspectorPanelProps);

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
      <style>{`
        .markdown-board-preview { line-height: 1.35; }
        .markdown-board-preview p { margin: 0 0 0.45em 0; }
        .markdown-board-preview p:last-child { margin-bottom: 0; }
        .markdown-board-preview h1, 
        .markdown-board-preview h2, 
        .markdown-board-preview h3, 
        .markdown-board-preview h4, 
        .markdown-board-preview h5, 
        .markdown-board-preview h6 { 
          margin: 0; 
          font-size: inherit; 
          font-weight: bold;
        }
        .markdown-board-preview ul, .markdown-board-preview ol { margin: 0; padding-left: 1.2rem; }
        .markdown-board-preview blockquote { border-left: 2px solid #ccc; padding-left: 0.5rem; margin: 0; font-style: italic; }
        .markdown-board-preview code { background: rgba(0,0,0,0.05); padding: 0.1rem 0.2rem; border-radius: 3px; font-size: 0.9em; }
        .markdown-board-preview pre { background: rgba(0,0,0,0.05); padding: 0.5rem; border-radius: 5px; overflow-x: auto; margin: 0.5rem 0; }
        .markdown-board-preview pre code { background: transparent; padding: 0; }
      `}</style>
      <div 
        ref={containerRef}
        className={`w-full h-full overflow-hidden bg-gray-50 relative touch-none select-none ${
          isPanning 
            ? 'cursor-grabbing' 
            : 'cursor-grab'
        }`}
        style={isDragging ? { boxShadow: `0 0 0 4px ${themeColor}` } : undefined}
        onPointerDown={handleBoardPointerDown}
        onPointerMove={handleBoardPointerMove}
        onPointerLeave={(e) => {
            clearBoardLongPress();
            // 当鼠标离开画布时，清除位置预览
            if (isSelectingNotePosition) {
                setNotePositionPreview(null);
            }
        }}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onDragEnd={handleDragEnd}
        onPointerUp={handleBoardPointerUp}
        onPointerCancel={() => {
          clearBoardLongPress();
          if (boardLongPressTriggeredRef.current) cancelBoardLongPressPreview();
          boardLongPressTriggeredRef.current = false;
          setIsPanning(false);
          setIsDraggingBackground(false);
          lastMousePos.current = null;
          panStartPos.current = null;
          dragRectRef.current = null;
        }}
        onDoubleClick={handleBoardDoubleClick}
        onContextMenu={(e) => e.preventDefault()}
      >
        {isDragging && (
          <div 
            className="absolute inset-0 z-[4000] flex items-center justify-center pointer-events-auto"
            style={{ backgroundColor: `${themeColor}33` }}
            onClick={(e) => {
              // 点击外部区域关闭
              if (e.target === e.currentTarget) {
                setIsDragging(false);
              }
            }}
          >
            <div 
              className="bg-white rounded-2xl shadow-2xl p-8 border-4 relative"
              style={{ borderColor: themeColor }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setIsDragging(false)}
                className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors text-gray-500 hover:text-gray-700"
                title="取消"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
              <div className="text-center">
                <div className="mb-4 flex justify-center">
                  <svg width="64" height="64" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-gray-700">
                    <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                    <path d="M8 11V5M5 8l3-3 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <p className="text-2xl font-bold text-gray-800">拖入图片、JSON 或 CSV 以导入</p>
              </div>
            </div>
          </div>
        )}
        <input
          type="file"
          accept="image/*"
          ref={imageFileInputRef}
          className="hidden"
          onChange={handleImageInputChange}
        />
        {/* Background */}
        <div 
          className="absolute inset-0 pointer-events-none z-0"
          style={{
              backgroundImage: `radial-gradient(${themeColor} ${dotSize}px, transparent ${dotSize + 0.5}px)`,
              backgroundPosition: `${transform.x}px ${transform.y}px`,
              backgroundSize: `${gridSize}px ${gridSize}px`,
              opacity: 0.8
          }}
        />

        {/* Canvas Content */}
        <div 
          className="absolute top-0 left-0 w-full h-full origin-top-left pointer-events-none"
          style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})` }}
        >
          {/* Note Position Preview - Theme color box indicator */}
          {isSelectingNotePosition && notePositionPreview && (
            <div
              className="absolute pointer-events-none z-[3000]"
              style={{
                left: `${notePositionPreview.x - 128}px`,
                top: `${notePositionPreview.y - 128}px`,
                width: '256px',
                height: '256px',
                border: `4px solid ${themeColor}`,
                borderRadius: '4px',
                boxShadow: `0 0 0 1px ${themeColor}4D`,
              }}
            />
          )}
          
          {/* Render connections */}
          {/* Frames Layer - Below everything */}
          {/* Box Selection Preview */}
          {boxSelectStart && boxSelectEnd && (
            <div
              className="absolute pointer-events-none z-[3000]"
              style={{
                left: `${Math.min(boxSelectStart.x, boxSelectEnd.x)}px`,
                top: `${Math.min(boxSelectStart.y, boxSelectEnd.y)}px`,
                width: `${Math.abs(boxSelectEnd.x - boxSelectStart.x)}px`,
                height: `${Math.abs(boxSelectEnd.y - boxSelectStart.y)}px`,
                backgroundColor: `${themeColor}20`,
                border: `2px solid ${themeColor}`,
                borderRadius: '4px'
              }}
            />
          )}
          
          {/* Drawing Frame Preview */}
          {isDrawingFrame && drawingFrameStart && drawingFrameEnd && (
            <div
              className="absolute pointer-events-none overflow-hidden"
              style={{
                left: `${Math.min(drawingFrameStart.x, drawingFrameEnd.x)}px`,
                top: `${Math.min(drawingFrameStart.y, drawingFrameEnd.y)}px`,
                width: `${Math.abs(drawingFrameEnd.x - drawingFrameStart.x)}px`,
                height: `${Math.abs(drawingFrameEnd.y - drawingFrameStart.y)}px`,
                borderRadius: '12px',
                zIndex: 10,
                border: '2px dashed rgba(156, 163, 175, 0.8)',
                ...frameChromeStyle,
              }}
            />
          )}
          
          {layerVisibility.frame && frames.map((frame) => {
              // 如果有过滤，只显示选中的frames的框体，但标题始终显示
              const shouldShowFrame = filterFrameIds.size === 0 || filterFrameIds.has(frame.id);
              if (!shouldShowFrame) return null;
              
              // 使用本地拖拽/缩放位置，避免全局状态更新带来的延迟和抖动
              let displayX = frame.x;
              let displayY = frame.y;
              let displayWidth = frame.width;
              let displayHeight = frame.height;
              
              if (draggingFrameId === frame.id && localDraggingFramePos) {
                  displayX = localDraggingFramePos.x;
                  displayY = localDraggingFramePos.y;
              } else if (resizingFrame?.id === frame.id && localResizingFrameSize) {
                  displayX = localResizingFrameSize.x;
                  displayY = localResizingFrameSize.y;
                  displayWidth = localResizingFrameSize.width;
                  displayHeight = localResizingFrameSize.height;
              }
              
              return (
                <div
                  key={frame.id}
                  className="absolute overflow-visible"
                  style={{
                    left: `${displayX}px`,
                    top: `${displayY}px`,
                    width: `${displayWidth}px`,
                    height: `${displayHeight}px`,
                    zIndex: selectedFrameId === frame.id ? 1000 : 10,
                    pointerEvents: 'none',
                  }}
                >
                  {/* 仅玻璃+叠色+内描边做圆角裁剪；外层不 overflow:hidden，避免四角缩放手柄被裁切 */}
                  <div className="absolute inset-0 overflow-hidden rounded-[12px] pointer-events-none">
                    <div className="absolute inset-0" style={frameChromeStyle} />
                    <div
                      className="absolute inset-0"
                      style={{
                        backgroundColor:
                          selectedFrameId === frame.id
                            ? 'rgba(255, 221, 0, 0.22)'
                            : frameTintFromHex(frame.color, 0.22),
                      }}
                    />
                    <div
                      className="absolute inset-0 rounded-[12px]"
                      style={{
                        boxShadow:
                          selectedFrameId === frame.id
                            ? `inset 0 0 0 2px ${themeColor}`
                            : 'inset 0 0 0 2px rgba(156, 163, 175, 0.35)',
                      }}
                    />
                  </div>
              {/* Frame中间区域，也当作空白处 - 让事件冒泡到背景 */}
              <div
                className="absolute pointer-events-auto"
                style={{
                  left: '10px',
                  top: '10px',
                  right: '10px',
                  bottom: '10px',
                  cursor: 'default',
                }}
                onClick={(e) => {
                  // 不阻止事件冒泡，让事件传递到背景，使用背景的计数逻辑
                }}
              />
              {/* 可交互的边框区域 - 使用4个边框div覆盖边框部分 */}
              {/* 上边框 */}
              <div
                className="absolute pointer-events-auto"
                style={{
                  left: '0',
                  top: '0',
                  right: '0',
                  height: '10px',
                  cursor: draggingFrameId === frame.id ? 'grabbing' : 'grab',
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (isZooming || !workspaceEditMode) return;
                  setSelectedFrameId(frame.id);
                  setSelectedNoteId(null);
                  setSelectedConnectionId(null);
                  resetBlankClickCount();
                }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    stopAnimations();
                    if (!workspaceEditMode || isZooming) return;
                    const rect = containerRef.current?.getBoundingClientRect();
                    if (!rect) return;
                    dragRectRef.current = rect;
                    const worldX = (e.clientX - rect.left - transform.x) / transform.scale;
                    const worldY = (e.clientY - rect.top - transform.y) / transform.scale;
                    setDraggingFrameId(frame.id);
                    draggingFrameRef.current = frame.id;
                    setDraggingFrameOffset({ x: worldX - frame.x, y: worldY - frame.y });
                    setSelectedFrameId(frame.id);
                    setSelectedNoteId(null);
                    setSelectedConnectionId(null);
                    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                  }}
                  onPointerUp={(e) => {
                    e.stopPropagation();
                    if (draggingFrameId === frame.id || draggingFrameRef.current === frame.id) {
                      setDraggingFrameId(null);
                      draggingFrameRef.current = null;
                      setDraggingFrameOffset(null);
                      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
                    }
                  }}
              />
              {/* 下边框 */}
              <div
                className="absolute pointer-events-auto"
                style={{
                  left: '0',
                  bottom: '0',
                  right: '0',
                  height: '10px',
                  cursor: draggingFrameId === frame.id ? 'grabbing' : 'grab',
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (isZooming || !workspaceEditMode) return;
                  setSelectedFrameId(frame.id);
                  setSelectedNoteId(null);
                  setSelectedConnectionId(null);
                  resetBlankClickCount();
                }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    stopAnimations();
                    if (!workspaceEditMode || isZooming) return;
                    const rect = containerRef.current?.getBoundingClientRect();
                    if (!rect) return;
                    dragRectRef.current = rect;
                    const worldX = (e.clientX - rect.left - transform.x) / transform.scale;
                    const worldY = (e.clientY - rect.top - transform.y) / transform.scale;
                    setDraggingFrameId(frame.id);
                    draggingFrameRef.current = frame.id;
                    setDraggingFrameOffset({ x: worldX - frame.x, y: worldY - frame.y });
                    setSelectedFrameId(frame.id);
                    setSelectedNoteId(null);
                    setSelectedConnectionId(null);
                    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                  }}
                  onPointerUp={(e) => {
                    e.stopPropagation();
                    if (draggingFrameId === frame.id || draggingFrameRef.current === frame.id) {
                      setDraggingFrameId(null);
                      draggingFrameRef.current = null;
                      setDraggingFrameOffset(null);
                      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
                    }
                  }}
              />
              {/* 左边框 */}
              <div
                className="absolute pointer-events-auto"
                style={{
                  left: '0',
                  top: '10px',
                  bottom: '10px',
                  width: '10px',
                  cursor: draggingFrameId === frame.id ? 'grabbing' : 'grab',
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (isZooming || !workspaceEditMode) return;
                  setSelectedFrameId(frame.id);
                  setSelectedNoteId(null);
                  setSelectedConnectionId(null);
                  resetBlankClickCount();
                }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    stopAnimations();
                    if (!workspaceEditMode || isZooming) return;
                    const rect = containerRef.current?.getBoundingClientRect();
                    if (!rect) return;
                    dragRectRef.current = rect;
                    const worldX = (e.clientX - rect.left - transform.x) / transform.scale;
                    const worldY = (e.clientY - rect.top - transform.y) / transform.scale;
                    setDraggingFrameId(frame.id);
                    draggingFrameRef.current = frame.id;
                    setDraggingFrameOffset({ x: worldX - frame.x, y: worldY - frame.y });
                    setSelectedFrameId(frame.id);
                    setSelectedNoteId(null);
                    setSelectedConnectionId(null);
                    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                  }}
                  onPointerUp={(e) => {
                    e.stopPropagation();
                    if (draggingFrameId === frame.id || draggingFrameRef.current === frame.id) {
                      setDraggingFrameId(null);
                      draggingFrameRef.current = null;
                      setDraggingFrameOffset(null);
                      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
                    }
                  }}
              />
              {/* 右边框 */}
              <div
                className="absolute pointer-events-auto"
                style={{
                  right: '0',
                  top: '10px',
                  bottom: '10px',
                  width: '10px',
                  cursor: draggingFrameId === frame.id ? 'grabbing' : 'grab',
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (isZooming || !workspaceEditMode) return;
                  setSelectedFrameId(frame.id);
                  setSelectedNoteId(null);
                  setSelectedConnectionId(null);
                  resetBlankClickCount();
                }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    stopAnimations();
                    if (!workspaceEditMode || isZooming) return;
                    const rect = containerRef.current?.getBoundingClientRect();
                    if (!rect) return;
                    dragRectRef.current = rect;
                    const worldX = (e.clientX - rect.left - transform.x) / transform.scale;
                    const worldY = (e.clientY - rect.top - transform.y) / transform.scale;
                    setDraggingFrameId(frame.id);
                    draggingFrameRef.current = frame.id;
                    setDraggingFrameOffset({ x: worldX - frame.x, y: worldY - frame.y });
                    setSelectedFrameId(frame.id);
                    setSelectedNoteId(null);
                    setSelectedConnectionId(null);
                    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                  }}
                  onPointerUp={(e) => {
                    e.stopPropagation();
                    if (draggingFrameId === frame.id || draggingFrameRef.current === frame.id) {
                      setDraggingFrameId(null);
                      draggingFrameRef.current = null;
                      setDraggingFrameOffset(null);
                      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
                    }
                  }}
              />
              
              {/* Resize Handles - 只在编辑模式且选中时显示 */}
              {workspaceEditMode && selectedFrameId === frame.id && (
                <>
                  {/* Top Left */}
                  <div
                    className="absolute cursor-nwse-resize pointer-events-auto"
                    style={{
                      left: '-6px',
                      top: '-6px',
                      width: '12px',
                      height: '12px',
                      ...frameChromeStyle,
                      border: `2px solid ${themeColor}`,
                      borderRadius: '2px',
                      transform: `scale(${1 / transform.scale})`,
                      transformOrigin: 'top left',
                      zIndex: 2000, // 确保高于标题层
                    }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      stopAnimations();
                      const rect = containerRef.current?.getBoundingClientRect();
                      if (!rect) return;
                      dragRectRef.current = rect;
                      const worldX = (e.clientX - rect.left - transform.x) / transform.scale;
                      const worldY = (e.clientY - rect.top - transform.y) / transform.scale;
                      
                      const fixedX = frame.x + frame.width;
                      const fixedY = frame.y + frame.height;
                      
                      const resizeInfo = { id: frame.id, fixedX, fixedY };
                      setResizingFrame(resizeInfo);
                      resizingFrameRef.current = resizeInfo;
                      
                      // 立即设置初始位置，避免第一帧跳跃
                      const newX = Math.min(fixedX, worldX);
                      const newY = Math.min(fixedY, worldY);
                      const newWidth = Math.max(100, Math.abs(fixedX - worldX));
                      const newHeight = Math.max(100, Math.abs(fixedY - worldY));
                      setLocalResizingFrameSize({ x: newX, y: newY, width: newWidth, height: newHeight });
                      
                      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                    }}
                  />
                  
                  {/* Top Right */}
                  <div
                    className="absolute cursor-nesw-resize pointer-events-auto"
                    style={{
                      right: '-6px',
                      top: '-6px',
                      width: '12px',
                      height: '12px',
                      ...frameChromeStyle,
                      border: `2px solid ${themeColor}`,
                      borderRadius: '2px',
                      transform: `scale(${1 / transform.scale})`,
                      transformOrigin: 'top right',
                      zIndex: 2000,
                    }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      stopAnimations();
                      const rect = containerRef.current?.getBoundingClientRect();
                      if (!rect) return;
                      dragRectRef.current = rect;
                      const worldX = (e.clientX - rect.left - transform.x) / transform.scale;
                      const worldY = (e.clientY - rect.top - transform.y) / transform.scale;
                      
                      const fixedX = frame.x;
                      const fixedY = frame.y + frame.height;
                      
                      setResizingFrame({ id: frame.id, fixedX, fixedY });
                      
                      // 立即设置初始位置，避免第一帧跳跃
                      const newX = Math.min(fixedX, worldX);
                      const newY = Math.min(fixedY, worldY);
                      const newWidth = Math.max(100, Math.abs(fixedX - worldX));
                      const newHeight = Math.max(100, Math.abs(fixedY - worldY));
                      setLocalResizingFrameSize({ x: newX, y: newY, width: newWidth, height: newHeight });
                      
                      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                    }}
                  />
                  
                  {/* Bottom Left */}
                  <div
                    className="absolute cursor-nesw-resize pointer-events-auto"
                    style={{
                      left: '-6px',
                      bottom: '-6px',
                      width: '12px',
                      height: '12px',
                      ...frameChromeStyle,
                      border: `2px solid ${themeColor}`,
                      borderRadius: '2px',
                      transform: `scale(${1 / transform.scale})`,
                      transformOrigin: 'bottom left',
                      zIndex: 2000,
                    }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      stopAnimations();
                      const rect = containerRef.current?.getBoundingClientRect();
                      if (!rect) return;
                      dragRectRef.current = rect;
                      const worldX = (e.clientX - rect.left - transform.x) / transform.scale;
                      const worldY = (e.clientY - rect.top - transform.y) / transform.scale;
                      
                      const fixedX = frame.x + frame.width;
                      const fixedY = frame.y;
                      
                      setResizingFrame({ id: frame.id, fixedX, fixedY });
                      
                      // 立即设置初始位置，避免第一帧跳跃
                      const newX = Math.min(fixedX, worldX);
                      const newY = Math.min(fixedY, worldY);
                      const newWidth = Math.max(100, Math.abs(fixedX - worldX));
                      const newHeight = Math.max(100, Math.abs(fixedY - worldY));
                      setLocalResizingFrameSize({ x: newX, y: newY, width: newWidth, height: newHeight });
                      
                      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                    }}
                  />
                  
                  {/* Bottom Right */}
                  <div
                    className="absolute cursor-nwse-resize pointer-events-auto"
                    style={{
                      right: '-6px',
                      bottom: '-6px',
                      width: '12px',
                      height: '12px',
                      ...frameChromeStyle,
                      border: `2px solid ${themeColor}`,
                      borderRadius: '2px',
                      transform: `scale(${1 / transform.scale})`,
                      transformOrigin: 'bottom right',
                      zIndex: 2000,
                    }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      stopAnimations();
                      const rect = containerRef.current?.getBoundingClientRect();
                      if (!rect) return;
                      dragRectRef.current = rect;
                      const worldX = (e.clientX - rect.left - transform.x) / transform.scale;
                      const worldY = (e.clientY - rect.top - transform.y) / transform.scale;
                      
                      const fixedX = frame.x;
                      const fixedY = frame.y;
                      
                      setResizingFrame({ id: frame.id, fixedX, fixedY });
                      
                      // 立即设置初始位置，避免第一帧跳跃
                      const newX = Math.min(fixedX, worldX);
                      const newY = Math.min(fixedY, worldY);
                      const newWidth = Math.max(100, Math.abs(fixedX - worldX));
                      const newHeight = Math.max(100, Math.abs(fixedY - worldY));
                      setLocalResizingFrameSize({ x: newX, y: newY, width: newWidth, height: newHeight });
                      
                      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                    }}
                  />
                </>
              )}
            </div>
              );
            })}
          
          {/* Frame Titles Layer - Above Notes - 标题始终显示以便多选 */}
          {layerVisibility.frame && frames.map((frame) => {
            // 使用本地拖拽/缩放位置，避免全局状态更新带来的延迟和抖动
            let displayX = frame.x;
            let displayY = frame.y;
            let displayWidth = frame.width;
            let displayHeight = frame.height;
            
            if (draggingFrameId === frame.id && localDraggingFramePos) {
                displayX = localDraggingFramePos.x;
                displayY = localDraggingFramePos.y;
            } else if (resizingFrame?.id === frame.id && localResizingFrameSize) {
                displayX = localResizingFrameSize.x;
                displayY = localResizingFrameSize.y;
                displayWidth = localResizingFrameSize.width;
                displayHeight = localResizingFrameSize.height;
            }

            const filterActive = filterFrameIds.size > 0;
            const inFilter = filterFrameIds.has(frame.id);
            const frameTitleTint =
              filterActive && !inFilter
                ? 'rgba(107, 114, 128, 0.32)'
                : inFilter
                  ? frameTintFromHex(themeColor, 0.52)
                  : selectedFrameId === frame.id
                    ? frameTintFromHex(themeColor, 0.48)
                    : 'rgba(107, 114, 128, 0.26)';

            return (
            <React.Fragment key={frame.id}>
              <div
                key={`title-${frame.id}`}
                className={`absolute -top-8 left-0 rounded-lg shadow-md flex flex-col pointer-events-auto overflow-hidden border ${
                  ch ? 'border-gray-200/70' : 'border-white/45'
                }`}
                style={{
                  left: `${displayX}px`,
                  top: `${displayY - 32}px`,
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
                  resetBlankClickCount();
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
                const worldX = (e.clientX - rect.left - transform.x) / transform.scale;
                const worldY = (e.clientY - rect.top - transform.y) / transform.scale;
                setDraggingFrameId(frame.id);
                setDraggingFrameOffset({ x: worldX - frame.x, y: worldY - frame.y });
                setSelectedFrameId(frame.id);
                setSelectedNoteId(null);
                setSelectedConnectionId(null);
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              }}
              onPointerUp={(e) => {
                e.stopPropagation(); // 阻止传播到背景
                
                // 处理通过标题拖拽移动 Frame 的最终保存逻辑
                if (draggingFrameId === frame.id && localDraggingFramePos) {
                  onUpdateFrames?.(frames.map(f => 
                    f.id === frame.id ? { ...f, x: localDraggingFramePos.x, y: localDraggingFramePos.y } : f
                  ));
                }

                // 结束拖拽
                if (draggingFrameId === frame.id) {
                  setDraggingFrameId(null);
                  setDraggingFrameOffset(null);
                  (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
                }
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

          {/* Board 视图不渲染连线（连线仅在 Graph 等视图展示） */}

          {boardDisplayNotes
            .filter((note) => notePassesBoardVisibilityFilters(note))
            .filter((note) =>
              isNoteVisibleInUnifiedLayer(note, mergedProjectBoardLayers, graphLayerGroupStandard)
            )
            .sort((a, b) => {
              const oa = a.layerStackOrder ?? a.createdAt;
              const ob = b.layerStackOrder ?? b.createdAt;
              if (oa !== ob) return oa - ob;
              return a.id.localeCompare(b.id);
            })
            .map((note) => {
              // Check layer visibility based on note variant
              const isImage = noteRendersAsBoardSticker(note);
              // 淡黄明确表示“只存在于白板、没有可用地图坐标”。带有效坐标的
              // 普通便签则保留自己的颜色，未设置颜色时回落到中性白。
              const boardCardBackground = noteHasRenderableMapPosition(note)
                ? note.color || '#FFFFFF'
                : '#FFFDF5';
              
              let shouldShow = false;
              if (isImage && layerVisibility.image) shouldShow = true;
              else if (!isImage && layerVisibility.primary) shouldShow = true;
              
              if (!shouldShow) return null;
              
              const isDragging = draggingNoteId === note.id;
              const isInMultiSelect = selectedNoteIds.has(note.id);
              const noteMotionClass = introNote?.id === note.id && introNoteMotion === 'exit'
                ? 'board-note-motion--exit'
                : deletingNoteIds.has(note.id)
                  ? 'board-note-motion--exit'
                  : enteringNoteIds.has(note.id)
                    ? 'board-note-motion--enter'
                    : '';
              const currentX = note.boardX + (isDragging ? dragOffset.x : 0) + (isMultiSelectDragging && isInMultiSelect ? multiSelectDragOffset.x : 0);
              const currentY = note.boardY + (isDragging ? dragOffset.y : 0) + (isMultiSelectDragging && isInMultiSelect ? multiSelectDragOffset.y : 0);
              
              // 检查Note是否在任何Frame内
              const containingFrame = frames.find(frame => isNoteInFrame(note, frame));
              const isInFrame = !!containingFrame;

              const { width: noteWidth, height: noteHeight } = boardNoteDimensions(note);

              let clampClass = '';
              if (!isImage) {
                  if (note.fontSize >= 4) clampClass = 'line-clamp-3';
                  else if (note.fontSize === 3) clampClass = 'line-clamp-4';
                  else if (note.fontSize === 2) clampClass = 'line-clamp-5';
                  else clampClass = 'line-clamp-6';
              }

              // Get global standard size scale, default to 1
              const standardSizeScale = project?.standardSizeScale || 1;

              if (isImage) {
                const standardSizeScale = project?.standardSizeScale || 1;
              return (
                <div
                  key={note.id}
                    data-is-note="true"
                  style={{ 
                      position: 'absolute', 
                      left: currentX, 
                      top: currentY,
                        zIndex: (selectedNoteId === note.id || selectedNoteIds.has(note.id) || isDragging || (isMultiSelectDragging && isInMultiSelect))
                          ? 1000
                          : 55,
                      width: noteWidth,
                      height: noteHeight,
                        transform: `scale(${standardSizeScale})`,
                        transformOrigin: 'center',
                  }}
                  className={`pointer-events-auto group ${noteMotionClass} ${workspaceEditMode ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer hover:scale-105 transition-transform'}`}
                    onPointerDown={(e) => {
                        lastMousePos.current = { x: e.clientX, y: e.clientY };
                        handleNotePointerDown(e, note.id, note);
                    }}
                  onPointerMove={handleNotePointerMove}
                  onPointerUp={(e) => handleNotePointerUp(e, note)}
                  onPointerCancel={handleNotePointerCancel}
                  onClick={(e) => {
                    if (consumeSuppressedNoteClick(note.id)) {
                      e.preventDefault();
                      e.stopPropagation();
                      return;
                    }
                    handleNoteClick(e, note);
                  }}
                  onDoubleClick={(e) => handleNoteDoubleClick(e, note)}
                >
                  {workspaceEditMode && (
                      <>
                      <button 
                        onClick={(e) => handleDeleteClick(e, note.id)}
                        onPointerDown={(e) => e.stopPropagation()}
                        type="button"
                        className="absolute -top-3 -right-3 z-50 bg-red-500 text-white rounded-full p-1.5 shadow-md opacity-0 pointer-events-none transition-opacity transition-transform hover:scale-110 group-hover:opacity-100 group-hover:pointer-events-auto"
                      >
                        <X size={14} />
                      </button>
                        {/* Resize handles for image notes - show when selected */}
                        {((selectedNoteId === note.id || selectedNoteIds.has(note.id)) && !connectingFrom) && (
                          <>
                            {(['tl', 'tr', 'bl', 'br'] as const).map(corner => {
                              const width = noteWidth;
                              const height = noteHeight;
                              
                              let left = 0, top = 0;
                              switch (corner) {
                                case 'tl':
                                  left = 0;
                                  top = 0;
                                  break;
                                case 'tr':
                                  left = width;
                                  top = 0;
                                  break;
                                case 'bl':
                                  left = 0;
                                  top = height;
                                  break;
                                case 'br':
                                  left = width;
                                  top = height;
                                  break;
                              }
                              
                              return (
                                <div
                                  key={corner}
                                  className="absolute z-50 w-4 h-4 -translate-x-1/2 -translate-y-1/2 border-2 border-white rounded-full shadow-lg cursor-nwse-resize transition-transform pointer-events-auto hover:scale-125"
                            style={{ 
                                    backgroundColor: themeColor,
                                    left: `${left}px`, 
                                    top: `${top}px`
                                  }}
                                  onPointerDown={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    const rect = containerRef.current?.getBoundingClientRect();
                                    if (!rect) return;
                                    const worldX = (e.clientX - rect.left - transform.x) / transform.scale;
                                    const worldY = (e.clientY - rect.top - transform.y) / transform.scale;
                                    setResizingImage({
                                      id: note.id,
                                      corner,
                                      startX: worldX,
                                      startY: worldY,
                                      startWidth: noteWidth,
                                      startHeight: noteHeight,
                                      startBoardX: note.boardX,
                                      startBoardY: note.boardY,
                                      aspect: noteWidth / noteHeight
                                    });
                                    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                                  }}
                                />
                              );
                            })}
                          </>
                        )}
                      </>
                    )}
                    <div 
                        className={`w-full h-full flex flex-col overflow-visible group rounded-sm transition-shadow ${isDragging ? 'ring-4' : isInFrame ? 'ring-4 ring-[#EEEEEE]' : ''}`}
                            style={{ 
                            boxShadow: isDragging ? `0 0 0 4px ${themeColor}` : undefined,
                            backgroundColor: 'transparent'
                        }}
                    >
                        <div
                          className="w-full h-full relative flex items-center justify-center bg-transparent"
                        >
                          {(() => {
                            const first = note.media?.[0];
                            const stickerSrc =
                              first?.kind === 'sketch'
                                ? note.sketch
                                : note.images?.[0] || note.sketch;
                            if (!stickerSrc) return null;
                            return (
                            <img
                              src={stickerSrc}
                              className="w-full h-full object-contain pointer-events-none drop-shadow-[0_10px_22px_rgba(15,23,42,0.32)]"
                              alt="board-image"
                            />
                            );
                          })()}
                        </div>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={note.id}
                  data-is-note="true"
                  style={{ 
                      position: 'absolute', 
                      left: currentX, 
                      top: currentY,
                      zIndex: (selectedNoteId === note.id || selectedNoteIds.has(note.id) || isDragging || (isMultiSelectDragging && isInMultiSelect))
                        ? 1000
                        : isImage
                          ? 55
                          : 50,
                      width: noteWidth,
                      height: noteHeight,
                      transform: `scale(${standardSizeScale})`,
                      transformOrigin: 'center',
                  }}
                  className={`pointer-events-auto group ${noteMotionClass} ${workspaceEditMode ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer hover:scale-105 transition-transform'}`}
                  onPointerDown={(e) => {
                      lastMousePos.current = { x: e.clientX, y: e.clientY };
                      handleNotePointerDown(e, note.id, note);
                  }}
                  onPointerMove={handleNotePointerMove}
                  onPointerUp={(e) => handleNotePointerUp(e, note)}
                  onPointerCancel={handleNotePointerCancel}
                  onClick={(e) => {
                    if (consumeSuppressedNoteClick(note.id)) {
                      e.preventDefault();
                      e.stopPropagation();
                      return;
                    }
                    handleNoteClick(e, note);
                  }}
                  onDoubleClick={(e) => handleNoteDoubleClick(e, note)}
                >
                  {workspaceEditMode && (
                      <>
                      <button 
                        onClick={(e) => handleDeleteClick(e, note.id)}
                        onPointerDown={(e) => e.stopPropagation()}
                        type="button"
                        className="absolute -top-3 -right-3 z-50 bg-red-500 text-white rounded-full p-1.5 shadow-md opacity-0 pointer-events-none transition-opacity transition-transform hover:scale-110 group-hover:opacity-100 group-hover:pointer-events-auto"
                      >
                        <X size={14} />
                      </button>
                        
                      </>
                  )}

                  <div 
                          className={`w-full h-full shadow-xl flex flex-col overflow-hidden group rounded-sm transition-shadow ${isDragging ? 'shadow-2xl ring-4' : isInFrame ? 'ring-4 ring-[#EEEEEE]' : ''}`}
                          style={{
                              boxShadow: isDragging ? `0 0 0 4px ${themeColor}` : undefined,
                              transform: `rotate(${(parseInt(note.id.slice(-2), 36) % 6) - 3}deg)`,
                              backgroundColor: boardCardBackground
                          }}
                      >
                          <div className="w-full h-full flex flex-col relative p-6 gap-2">
                              {(note.sketch && note.sketch !== '') && (note.images && note.images.length > 0) && (
                                  <div className="absolute inset-0 opacity-35 pointer-events-none z-0">
                                      <img 
                                          src={note.sketch || note.images[0]} 
                                          className="w-full h-full object-cover grayscale opacity-50" 
                                          alt="bg" 
                                      />
                                  </div>
                              )}
                              {(note.sketch && note.sketch !== '') && (!note.images || note.images.length === 0) && (
                                  <div className="absolute inset-0 opacity-35 pointer-events-none z-0">
                                      <img 
                                          src={note.sketch} 
                                          className="w-full h-full object-cover grayscale opacity-50" 
                                          alt="bg" 
                                      />
                                  </div>
                              )}
                              {!note.sketch && (note.images && note.images.length > 0) && (
                                  <div className="absolute inset-0 opacity-35 pointer-events-none z-0">
                                      <img 
                                          src={note.images[0]} 
                                          className="w-full h-full object-cover grayscale opacity-50" 
                                          alt="bg" 
                                      />
                                  </div>
                              )}
                              <div className="relative z-10 pointer-events-none flex flex-col h-full">
                                  <div className="text-3xl mb-2 drop-shadow-sm">{note.emoji}</div>
                                  <div 
                                    className={`text-gray-800 leading-none flex-1 overflow-hidden break-words whitespace-pre-wrap ${clampClass} ${note.isBold ? 'font-bold' : 'font-medium'}`} 
                                  >
                                      {note.text ? (() => {
                                          const { title, detail } = parseNoteContent(note.text);
                                          
                                          const getBoardFontSize = (size: number) => {
                                              const sizes: Record<number, string> = {
                                                  '-1': '0.8rem',
                                                  '0': '1.0rem',
                                                  '1': '1.2rem',
                                                  '2': '1.6rem',
                                                  '3': '2.2rem',
                                                  '4': '2.4rem',
                                                  '5': '3.0rem'
                                              };
                                              return sizes[size] || sizes[3];
                                          };

                                          return (
                                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                  <span style={{ fontSize: getBoardFontSize(note.fontSize || 3) }}>{title}</span>
                                                  <div className="markdown-board-preview" style={{ fontSize: getBoardFontSize((note.fontSize || 3) - 2), opacity: 0.9 }}>
                                                      <ReactMarkdown>{detail || ' '}</ReactMarkdown>
                                                  </div>
                                              </div>
                                          );
                                      })() : <span className="text-gray-400 italic font-normal text-base">Empty...</span>}
                                  </div>
                                    <div className="mt-auto flex flex-wrap gap-1 items-center justify-between">
                                        <div className="flex flex-wrap gap-1" style={{ position: 'relative', zIndex: 70 }}>
                                        {note.tags.map(t => (
                                                <span key={t.id} className="flex-shrink-0 h-6 px-2.5 rounded-full text-xs font-bold text-white shadow-sm flex items-center gap-1" style={{ backgroundColor: t.color }}>{t.label}</span>
                                        ))}
                                    </div>
                                        {note.coords && note.coords.lat !== 0 && note.coords.lng !== 0 && onSwitchToMapView && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onSwitchToMapView(note.coords);
                                                }}
                                                className="p-1.5 rounded-full bg-white/80 hover:bg-white shadow-sm transition-colors opacity-0 group-hover:opacity-100 pointer-events-auto"
                                                title="定位到地图"
                                            >
                                                <Locate size={14} className="text-gray-700" />
                                            </button>
                                        )}
                                        {onSwitchToGraphView && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onSwitchToGraphView(note.id);
                                                }}
                                                className="p-1.5 rounded-full bg-white/80 hover:bg-white shadow-sm transition-colors opacity-0 group-hover:opacity-100 pointer-events-auto"
                                                title="定位到图谱"
                                            >
                                                <Locate size={14} className="text-gray-700" />
                                            </button>
                                        )}
                                    </div>
                              </div>
                          </div>
                      </div>
                </div>
              );
          })}

          {/* Multi-select bounding box（编辑 / 非编辑 + Shift 多选共用） */}
          {selectedNoteIds.size > 1 && (() => {
            const selectedNotes = notes.filter(n => selectedNoteIds.has(n.id));
            if (selectedNotes.length === 0) return null;
            
            // Calculate bounding box
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            selectedNotes.forEach(note => {
              const { width: noteWidth, height: noteHeight } = boardNoteDimensions(note);
              const noteX = note.boardX + (isMultiSelectDragging ? multiSelectDragOffset.x : 0);
              const noteY = note.boardY + (isMultiSelectDragging ? multiSelectDragOffset.y : 0);
              
              minX = Math.min(minX, noteX);
              minY = Math.min(minY, noteY);
              maxX = Math.max(maxX, noteX + noteWidth);
              maxY = Math.max(maxY, noteY + noteHeight);
            });
            
            const padding = 10;

            const parseBatchTimeRange = (): { startYear?: number; endYear?: number } => {
              const startStr = batchTimeStartStr.trim();
              const endStr = batchTimeEndStr.trim();
              const parsedStart = startStr ? parseInt(startStr, 10) : undefined;
              const parsedEnd = endStr ? parseInt(endStr, 10) : undefined;
              const nextStartYear =
                parsedStart != null && !Number.isNaN(parsedStart) ? parsedStart : undefined;
              const nextEndYear =
                nextStartYear != null &&
                parsedEnd != null &&
                !Number.isNaN(parsedEnd) &&
                parsedEnd !== nextStartYear
                  ? parsedEnd
                  : undefined;
              return { startYear: nextStartYear, endYear: nextEndYear };
            };

            const applyBatchTags = () => {
              const label = batchTagLabel.trim();
              if (!label) return;
              const color = TAG_COLORS[batchTagColorIndex % TAG_COLORS.length];
              const ids = new Set(selectedNoteIds);
              if (onUpdateProject && project) {
                const nextNotes = project.notes.map(n => {
                  if (!ids.has(n.id)) return n;
                  return {
                    ...n,
                    tags: [...(n.tags || []), { id: generateId(), label, color }],
                  };
                });
                onUpdateProject({ ...project, notes: nextNotes });
              } else {
                ids.forEach(id => {
                  const n = notes.find(x => x.id === id);
                  if (!n) return;
                  onUpdateNote({
                    ...n,
                    tags: [...(n.tags || []), { id: generateId(), label, color }],
                  });
                });
              }
              setBatchTagLabel('');
              setMultiBatchPanel('none');
            };

            const dismissBatchTagPanel = () => {
              if (batchTagLabel.trim()) {
                applyBatchTags();
              } else {
                setMultiBatchPanel('none');
                setBatchTagLabel('');
              }
            };

            const applyBatchTime = () => {
              const { startYear, endYear } = parseBatchTimeRange();
              const ids = new Set(selectedNoteIds);
              if (onUpdateProject && project) {
                const nextNotes = project.notes.map(n => {
                  if (!ids.has(n.id)) return n;
                  return { ...n, startYear, endYear };
                });
                onUpdateProject({ ...project, notes: nextNotes });
              } else {
                ids.forEach(id => {
                  const n = notes.find(x => x.id === id);
                  if (!n) return;
                  onUpdateNote({ ...n, startYear, endYear });
                });
              }
              setMultiBatchPanel('none');
            };

            const runBatchDelete = () => {
              const idsToDelete = Array.from(selectedNoteIds);
              if (idsToDelete.length === 0) return;
              if (
                !confirm(
                  `确定删除已选中的 ${idsToDelete.length} 个便签吗？\n此操作无法撤回。`
                )
              ) {
                return;
              }
              deleteBoardNotesWithExit(idsToDelete);
              resetBlankClickCount();
              setMultiBatchPanel('none');
            };

            const canGroup = workspaceEditMode && selectedNoteIds.size >= 2;
            const canUngroup = workspaceEditMode && notes.some(n => selectedNoteIds.has(n.id) && n.noteGroupId);

            const runGroupSelected = () => {
              if (!canGroup || !project) return;
              const newGroupId = generateId();
              const updatedNotes = notes.map(n =>
                selectedNoteIds.has(n.id) ? { ...n, noteGroupId: newGroupId } : n
              );
              onUpdateProject?.({ ...project, notes: updatedNotes });
            };

            const runUngroupSelected = () => {
              if (!project) return;
              const groupIdsInSelection = new Set(
                notes
                  .filter(n => selectedNoteIds.has(n.id) && n.noteGroupId)
                  .map(n => n.noteGroupId!)
              );
              if (groupIdsInSelection.size === 0) return;
              const updatedNotes = notes.map(n =>
                n.noteGroupId && groupIdsInSelection.has(n.noteGroupId)
                  ? { ...n, noteGroupId: undefined }
                  : n
              );
              onUpdateProject?.({ ...project, notes: updatedNotes });
              setSelectedNoteIds(new Set());
            };

            const exitMultiSelectToolbar = () => {
              setSelectedNoteIds(new Set());
              setSelectedNoteId(null);
              setMultiBatchPanel('none');
              setBatchTagLabel('');
              setBatchTimeStartStr('');
              setBatchTimeEndStr('');
              setBrowseTagFilterPanelOpen(false);
              setBrowseTimeFilterPanelOpen(false);
              resetBlankClickCount();
            };

            const stopToolbarEvent = (e: React.SyntheticEvent) => {
              e.stopPropagation();
              e.preventDefault();
            };

            return (
              <div
                className="absolute z-[2100]"
                style={{
                  left: minX - padding,
                  top: minY - padding,
                  width: maxX - minX + padding * 2,
                  height: maxY - minY + padding * 2,
                  border: `6px dashed ${themeColor}`,
                  borderRadius: '8px',
                  pointerEvents: 'none',
                }}
              >
                <BoardMultiSelectToolbar
                  themeColor={themeColor}
                  panelChromeStyle={panelChromeStyle}
                  inverseCanvasScale={1 / transform.scale}
                  isEditMode={workspaceEditMode}
                  multiBatchPanel={multiBatchPanel}
                  onExitMultiSelectToolbar={exitMultiSelectToolbar}
                  onToggleBatchTagPanel={() =>
                    setMultiBatchPanel((p) => (p === 'tag' ? 'none' : 'tag'))
                  }
                  onToggleBatchTimePanel={() =>
                    setMultiBatchPanel((p) => (p === 'time' ? 'none' : 'time'))
                  }
                  onRunBatchDelete={runBatchDelete}
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
                    resetBlankClickCount();
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
                          title={`为 ${selectedNoteIds.size} 个便签添加标签`}
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
              </div>
            );
          })()}
        </div>

        {/* 设置 + 图层：左上角（与 Mapping 一致） */}
        {isUIVisible && (
            <div
                data-allow-context-menu
                className="fixed top-2 sm:top-4 ui-workspace-left z-[500] pointer-events-auto flex h-10 sm:h-12 items-center gap-1.5 sm:gap-2"
                onPointerDown={(e) => e.stopPropagation()}
            >
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
                        tooltip="图层"
                    >
                        <LayerToolbarIcon layerGroupStandard={graphLayerGroupStandard} />
                    </ChromeIconButton>
                    {showLayerPanel && projectFull ? (
                        <ProjectNotesLayerPanel
                            themeColor={themeColor ?? DEFAULT_THEME_COLOR}
                            panelChromeStyle={panelChromeStyle}
                            variant="dock"
                            dockAlign="start"
                            menuAnchorRef={boardLayerBtnRef}
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
                              onUpdateFrames || onUpdateProject ? handleBoardUpdateFrame : undefined
                            }
                            onActivateNote={panBoardToNoteCenter}
                        />
                    ) : null}
                </div>
                )}
            </div>
        )}

        {isUIVisible && (
          <BoardTopRightEditToggle
            isUIVisible={isUIVisible}
            isEditMode={workspaceEditMode}
            themeColor={themeColor}
            chromeSurfaceStyle={panelChromeStyle}
            chromeHoverBackground={chHover}
            reserveRightForInspector={workspaceEditMode}
            onEnterEditMode={() => {
              if (isSelectingNotePosition) setIsSelectingNotePosition(false);
              onWorkspaceEditModeChange(true);
            }}
            onExitEditMode={() => {
              if (isSelectingNotePosition) setIsSelectingNotePosition(false);
              onWorkspaceEditModeChange(false);
              setIsBoxSelecting(false);
              setBoxSelectStart(null);
              setBoxSelectEnd(null);
              setIsDrawingFrame(false);
              setDrawingFrameStart(null);
              setDrawingFrameEnd(null);
              setSelectedFrameId(null);
              setResizingFrame(null);
              resizingFrameRef.current = null;
              setEditingFrameTitle('');
              setEditingFrameId(null);
            }}
          />
        )}

        {/* Edit Toolbar: 编辑模式下居中（L+ / L- / 工具） */}
        {workspaceEditMode && (
          <BoardTopCenterEditToolbar
            isEditMode={workspaceEditMode}
            isSelectingNotePosition={isSelectingNotePosition}
            isDrawingFrame={isDrawingFrame}
            isBoxSelecting={isBoxSelecting}
            themeColor={themeColor}
            chromeSurfaceStyle={panelChromeStyle}
            chromeHoverBackground={chHover}
            onClearSelectingNotePosition={() => setIsSelectingNotePosition(false)}
            onToggleSelectNotePosition={() => {
              if (isSelectingNotePosition) {
                setIsSelectingNotePosition(false);
              } else {
                setIsBoxSelecting(false);
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
              handleAddImageClick();
            }}
            onEnableDrawFrame={() => {
              if (isSelectingNotePosition) setIsSelectingNotePosition(false);
              setIsDrawingFrame(true);
              setIsBoxSelecting(false);
              setBoxSelectStart(null);
              setBoxSelectEnd(null);
              setSelectedFrameId(null);
            }}
            onToggleBoxSelect={() => {
              setIsBoxSelecting(!isBoxSelecting);
              if (!isBoxSelecting) {
                setSelectedNoteIds(new Set());
                setSelectedNoteId(null);
                setIsDrawingFrame(false);
                setDrawingFrameStart(null);
                setDrawingFrameEnd(null);
                setIsSelectingNotePosition(false);
              } else {
                setBoxSelectStart(null);
                setBoxSelectEnd(null);
              }
            }}
          />
        )}

        
        {/* Hidden file inputs */}
        <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => handleImageImport(e.target.files)}
        />
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
                  void handleDataImport(f);
                }
            }}
        />

        {editingNote && !isIntroPending && (
          <NoteEditor 
              isOpen={!!editingNote}
              onClose={closeEditor}
              initialNote={(() => {
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
              onSwitchToGraphView={onSwitchToGraphView}
              themeColor={themeColor}
              panelChromeStyle={panelChromeStyle}
              onSave={(updated) => {
                  // Text variant removed
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
                      onUpdateNote(fullNote);
                      // Update editingNote state to reflect the saved changes
                      // This ensures that if the editor is reopened, it will use the updated data
                      setEditingNote(fullNote);
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
        )}

        <BoardImportPreviewDialog
          open={showImportDialog}
          importPreview={importPreview}
          themeColor={themeColor}
          panelChromeStyle={panelChromeStyle}
          mapUiChromeOpacity={mapUiChromeOpacity}
          mapUiChromeBlurPx={mapUiChromeBlurPx}
          onCancel={handleCancelImport}
          onConfirm={handleConfirmImport}
        />

        <BoardImageLightbox src={previewImage} onClose={() => setPreviewImage(null)} />
      </div>

      <BoardBrowseTagFilterPanel
        open={browseTagFilterPanelOpen}
        isEditMode={workspaceEditMode}
        selectedCount={selectedNoteIds.size}
        anchorRef={boardBrowseTagFilterButtonRef}
        layoutRevision={browseTagFilterLayoutRevision}
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
        layoutRevision={browseTimeFilterLayoutRevision}
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

      <SettingsPanel
        isOpen={showSettingsPanel}
        onClose={() => setShowSettingsPanel(false)}
        anchorRef={settingsButtonRef}
        settingsContextView="board"
        themeColor={themeColor}
        onThemeColorChange={onThemeColorChange ?? (() => {})}
        mapUiChromeOpacity={mapUiChromeOpacity}
        onMapUiChromeOpacityChange={onMapUiChromeOpacityChange ?? (() => {})}
        mapUiChromeBlurPx={mapUiChromeBlurPx}
        onMapUiChromeBlurPxChange={onMapUiChromeBlurPxChange ?? (() => {})}
        currentMapStyle={mapStyleId}
        onMapStyleChange={onMapStyleChange ?? (() => {})}
        boardVariantToggles={{
          primary: layerVisibility.primary,
          image: layerVisibility.image,
          onChange: (next) => setLayerVisibility((prev) => ({ ...prev, ...next }))
        }}
        graphProject={project as Project | undefined}
        onGraphProjectPatch={
          onUpdateProject && project
            ? projectId
              ? (patch) =>
                  void (onUpdateProject as (a: string | Project, b?: Partial<Project>) => void)(
                    projectId,
                    patch
                  )
              : (patch) =>
                  void onUpdateProject({
                    ...project,
                    ...patch
                  } as Project)
            : undefined
        }
      />
    </div>
  );
};

export const BoardView = BoardViewComponent;
