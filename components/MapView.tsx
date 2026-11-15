import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { MapContainer, Marker, GeoJSON } from 'react-leaflet';
import L from 'leaflet';
import { set } from 'idb-keyval';

import { Note, Coordinates, Project, Frame, Connection, type GraphLayerState } from '../types';
import { mergeNoteLayerState, type NoteLayerGroupStandard } from '../utils/layer/noteLayerState';
import {
  emojiLayerStateFromLegacyTagState,
  isNoteVisibleInUnifiedLayer,
  noteHasRenderableMapPosition,
  sortNotesByLayerStack
} from '../utils/layer/unifiedNoteLayer';
import { ProjectNotesLayerPanel } from './layer/ProjectNotesLayerPanel';
import { MAP_TILE_URL, MAP_TILE_URL_FALLBACK, MAP_SATELLITE_URL, MAP_ATTRIBUTION, MAP_MAX_ZOOM, THEME_COLOR, THEME_COLOR_DARK, MAP_STYLE_OPTIONS, PROJECT_OPEN_SLIDE_DURATION_S } from '../constants';
import { useMapPosition } from '@/components/hooks/useMapPosition';
import { useGeolocation } from '@/components/hooks/useGeolocation';
import { useImageImport } from '@/components/hooks/useImageImport';
import { useMapLayers } from '@/components/hooks/useMapLayers';
import { useMapStyling } from '@/components/hooks/useMapStyling';
import { useBorderSearch } from '@/components/hooks/useBorderSearch';
import { useMapClustering } from '@/components/hooks/useMapClustering';
import { useMapInitialization } from '@/components/hooks/useMapInitialization';
import { useMapNoteIntro } from '@/components/hooks/useMapNoteIntro';
import { useMapMarkerDrag } from '@/components/hooks/useMapMarkerDrag';
import { useMapMarkerSelection } from '@/components/hooks/useMapMarkerSelection';
import { useDataImport } from '@/components/hooks/useDataImport';
import { useFileDrop } from '@/components/hooks/useFileDrop';
import { useCsvImport } from '@/components/hooks/useCsvImport';
import { MapWorldMinZoom } from './map/MapWorldMinZoom';
import { MapSmoothZoom } from './map/MapSmoothZoom';
import { MapLongPressHandler } from './map/MapLongPressHandler';
import { MapNavigationHandler } from './map/MapNavigationHandler';
import { TextLabelsLayer } from './map/TextLabelsLayer';
import { MapPositionTracker } from './map/MapPositionTracker';
import { MapCenterHandler } from './map/MapCenterHandler';
import {
  MapAttributionPrefix,
  MapCanvasBackground,
  MapCrossfadeTileLayer,
  MapTileDirectionalPrefetch,
  getAdaptiveMapTileKeepBuffer
} from './map/MapTileInfrastructure';
import { MapControls, MapLocateCreateMenu } from './map/MapControls';
import {
  PENDING_MAP_LOCATE_EVENT,
  applyReadyMapLocate,
  beginPendingMapLocate,
  cancelPendingMapLocate,
  completePendingMapLocate,
  getPendingMapLocate,
  peekReadyMapLocate
} from '../utils/map/pendingMapLocate';
import { MapSearchPanel, MapSearchPanelBody } from './map/controls/MapSearchPanel';
import { MapLayerControl } from './map/controls/MapLayerControl';
import { NotePreviewCard } from './map/overlays/NotePreviewCard';
import { MapLocationErrorBanner } from './map/overlays/MapLocationErrorBanner';
import { MapLocationEnableBanner } from './map/overlays/MapLocationEnableBanner';
import { MapImportMenuModal } from './map/overlays/MapImportMenuModal';
import { MapTopRightEditToggle } from './map/overlays/MapTopRightEditToggle';
import { MapPreviewTopRightToolbar } from './map/overlays/MapPreviewTopRightToolbar';
import { GraphConnectionPanel } from './graph/GraphConnectionPanel';
import { useSimpleConnectionPanel } from './hooks/useSimpleConnectionPanel';
import { ClusterMarkerLayer } from './map/layers/ClusterMarkerLayer';
import { MapClickHandler } from './map/MapClickHandler';
import { MapShiftBoxSelect } from './map/MapShiftBoxSelect';
import { MapConnectionLinesOverlay } from './map/MapConnectionLinesOverlay';
import { MapUnplacedNoteDropHandler } from './map/MapUnplacedNoteDropHandler';
import { UnplacedNotesSidebar } from './map/overlays/MapUnplacedNotesPanel';
import { transferNotesSpatially } from '../utils/note/spatialTransfer';
import { moveNoteToMapUnplaced, placeNoteOnMap } from '../utils/note/notePlacement';
import { SettingsPanel } from './SettingsPanel';
import { ChromeToolbarSlot, CHROME_TOOLBAR_WINDOW_CLASS } from './ui/ChromeToolbarSlot';
import { ChromeIconButton } from './ui/ChromeIconButton';
import { parseNoteContent } from '../utils';
import type { NoteDraftOutcome } from '../utils/note/draftLifecycle';
import { hexToRgb, isPhotoTakenRecently } from '../utils/map/mapUtils';
import { calculateImageFingerprint, calculateFingerprintFromBase64 } from '../utils/media/imageProcessing';
import { loadImage, getViewPositionCache, setViewPositionCache } from '../utils/persistence/storage';
import { useNotesWithResolvedMedia } from '../utils/persistence/useNotesWithResolvedMedia';
import { buildMapTabExportPayload } from '../utils/map/mapTabExportPayload';
import { buildStandaloneMapTabHtml } from '../utils/map/mapTabExportHtml';
import { downloadTextFile } from '../utils/builtinExamples/projectFromExport';
import { WORKSPACE_TRANSIENT_DISMISS_EVENT } from '../utils/ui/workspaceTransientDismiss';

const UNPLACED_DROP_EDGE_TOLERANCE_PX = 20;
import { useChromeMenuTop } from '../utils/ui/chromeMenuPosition';
import { useCompactViewport } from '../utils/ui/useCompactViewport';
import { useStickyValue } from '../utils/ui/useStickyValue';
import {
  mapChromeSurfaceStyle,
  mapChromeControlStyle,
  mapChromeControlHoverBackground,
  mapChromeContentStyle,
  DEFAULT_MAP_UI_CHROME_OPACITY,
  DEFAULT_MAP_UI_CHROME_OPACITY_BOTTOM,
  DEFAULT_MAP_UI_CHROME_BLUR_PX,
  type MapChromeAppearance
} from '../utils/map/mapChromeStyle';
import { useChromeAppearance } from './ui/chromeAppearanceContext';
import { MapNoteSlot } from './map/overlays/MapNoteSlot';
import { DeleteConfirmDialog } from './ui/DeleteConfirmDialog';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

/** 空项目自动定位按项目只发起一次，切视图卸载 MapView 后不重跑。 */
const MAP_NOTE_EXIT_MS = 220;

interface MapViewProps {
  project: Project;
  onAddNote: (note: Note) => void | Promise<void>;
  onUpdateNote: (note: Note) => void;
  onDeleteNote?: (noteId: string) => void;
  onToggleEditor: (isOpen: boolean) => void;
  onUpdateProject?: (project: Project) => void;
  navigateToCoords?: { lat: number; lng: number; zoom?: number } | null;
  projectId?: string;
  onNavigateComplete?: () => void;
  onSwitchToBoardView?: (coords?: { x: number; y: number }, mapInstance?: L.Map) => void;
  themeColor?: string;
  mapStyleId?: string;
  onMapStyleChange?: (styleId: string) => void;
  showImportMenu?: boolean;
  setShowImportMenu?: (show: boolean) => void;
  showBorderPanel?: boolean;
  setShowBorderPanel?: (show: boolean) => void;
  borderGeoJSON?: any | null;
  setBorderGeoJSON?: (data: any | null) => void;
  onMapClick?: () => void;
  isUIVisible?: boolean;
  /** 与 Board / Graph 共用的视图编辑模式（由 App 持有，切换视图时保持） */
  workspaceEditMode: boolean;
  onWorkspaceEditModeChange: (edit: boolean) => void;
  fileInputRef?: React.RefObject<HTMLInputElement | null>;
  onThemeColorChange?: (color: string) => void;
  uiDarkMode?: boolean;
  onUiDarkModeChange?: (dark: boolean) => void;
  mapUiChromeOpacity?: number;
  mapUiChromeOpacityBottom?: number;
  mapUiChromeBlurPx?: number;
  onMapUiChromeOpacityChange?: (opacity: number) => void;
  onMapUiChromeOpacityBottomChange?: (opacity: number) => void;
  onMapUiChromeBlurPxChange?: (blurPx: number) => void;
  isRouteMode?: boolean;
  setIsRouteMode?: (v: boolean) => void;
  waypoints?: Note[];
  setWaypoints?: (w: Note[]) => void;
  /** 与 App 中「界面外观」一致的面板玻璃样式（设置、编辑器等） */
  panelChromeStyle?: React.CSSProperties;
  chromeAppearance?: MapChromeAppearance;
  /** 编辑地图关联边（大屏属性面板） */
  onUpdateConnections?: (connections: Connection[]) => void | Promise<void>;
  /** Playground 复用 Mapping 地图时关闭项目专属的筛选入口。 */
  showLayerControl?: boolean;
  /** 单条记录的服务端所有权；未传入时保持普通项目的全量可编辑行为。 */
  canEditNote?: (note: Note) => boolean;
  /** 无权编辑时给宿主展示说明；真正的写入仍由宿主服务端二次校验。 */
  onEditDenied?: (note: Note) => void;
  /** Playground 不提供“待定位箱”，新记录按当前地图坐标直接发布。 */
  directMapPlacement?: boolean;
  /** 是否允许将本地照片批量导入当前数据源。 */
  allowPhotoImport?: boolean;
}

type MapChromeId = 'settings' | 'layer' | 'search' | 'locate' | 'create';

export const MapView: React.FC<MapViewProps> = ({
  project,
  workspaceEditMode,
  onWorkspaceEditModeChange,
  onAddNote,
  onUpdateNote,
  onDeleteNote,
  onToggleEditor,
  onUpdateProject,
  onUpdateConnections,
  fileInputRef: externalFileInputRef,
  navigateToCoords,
  projectId,
  onNavigateComplete,
  onSwitchToBoardView,
  themeColor = THEME_COLOR,
  mapStyleId = 'carto-light-nolabels',
  onMapStyleChange,
  showImportMenu,
  setShowImportMenu,
  showBorderPanel,
  setShowBorderPanel,
  borderGeoJSON,
  setBorderGeoJSON,
  onMapClick,
  isUIVisible = true,
  onThemeColorChange,
  uiDarkMode,
  onUiDarkModeChange,
  mapUiChromeOpacity = DEFAULT_MAP_UI_CHROME_OPACITY,
  mapUiChromeOpacityBottom = DEFAULT_MAP_UI_CHROME_OPACITY_BOTTOM,
  mapUiChromeBlurPx = DEFAULT_MAP_UI_CHROME_BLUR_PX,
  onMapUiChromeOpacityChange,
  onMapUiChromeOpacityBottomChange,
  onMapUiChromeBlurPxChange,
  isRouteMode: _isRouteMode,
  setIsRouteMode: _setIsRouteMode,
  waypoints: _waypoints,
  setWaypoints: _setWaypoints,
  panelChromeStyle: panelChromeStyleProp,
  chromeAppearance: chromeAppearanceProp,
  showLayerControl = true,
  canEditNote,
  onEditDenied,
  directMapPlacement = false,
  allowPhotoImport = true
}) => {
  // 触摸设备在拖动时只在停下后补瓦片，避免请求队列反过来拖慢手势；
  // 鼠标设备则沿用 Leaflet 的实时补图路径，横向平移不会等到松手才开始加载。
  const [isTouchFirstInput] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
  );
  const mapChromeTone = useChromeAppearance(chromeAppearanceProp);
  if (!project) return null;
  const notes = project.notes;
  const canModifyNote = useCallback(
    (note: Note) => canEditNote?.(note) ?? true,
    [canEditNote]
  );
  const denyEdit = useCallback(
    (note: Note) => onEditDenied?.(note),
    [onEditDenied]
  );
  const connections = project.connections || [];
  const unplacedMapNotes = useMemo(
    () => notes.filter((note) => !noteHasRenderableMapPosition(note)),
    [notes]
  );
  const unplacedMapNotesWithMedia = useNotesWithResolvedMedia(unplacedMapNotes);
  const mapChromeSurface =
    panelChromeStyleProp ??
    mapChromeSurfaceStyle(mapUiChromeOpacity, mapUiChromeBlurPx, mapChromeTone);
  const mapChromeControlSurface = mapChromeControlStyle(
    mapUiChromeOpacity,
    mapUiChromeBlurPx,
    mapChromeTone
  );
  const mapChromeContentSurface = mapChromeContentStyle(
    mapUiChromeOpacity,
    mapUiChromeBlurPx,
    mapChromeTone
  );
  const mapChromeHoverBg = mapChromeControlHoverBackground(mapUiChromeOpacity, mapChromeTone);
  const [pendingPersistedEditorNoteId, setPendingPersistedEditorNoteId] = useState<string | null>(null);
  const mapNoteSaveRef = useRef<(() => Promise<NoteDraftOutcome>) | null>(null);
  const compactViewport = useCompactViewport();
  // 所有退出路径（取消草稿、删除已有点）共用这一份状态，避免重复播放离场动画。
  const [deletingNoteIds, setDeletingNoteIds] = useState<Set<string>>(() => new Set());
  const deletingNoteIdsRef = useRef(new Set<string>());
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(() => new Set());
  const [pendingKeyboardDeleteIds, setPendingKeyboardDeleteIds] = useState<string[] | null>(null);
  const [preSelectedNotes, setPreSelectedNotes] = useState<Note[] | null>(null);
  const [currentPreviewImageIndex, setCurrentPreviewImageIndex] = useState(0);
  const selectionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [connectionHighlightNoteIds, setConnectionHighlightNoteIds] = useState<string[] | null>(null);
  const [hoveredNoteId, setHoveredNoteId] = useState<string | null>(null);
  // 拖拽时的乐观坐标覆盖：避免聚类重算延迟导致 marker 被 React 用旧 position 回弹
  const [noteCoordOverrides, setNoteCoordOverrides] = useState<Record<string, Coordinates>>({});
  const isMarkerDraggingRef = useRef(false);
  const ignoreNextMarkerClickRef = useRef(false);
  const {
    editingNote,
    setEditingNote,
    isEditorOpen,
    setIsEditorOpen,
    editorAutoOpenCamera,
    setEditorAutoOpenCamera,
    introNote,
    setIntroNote,
    noteMotionById,
    stageNewMapNote,
    openNewNoteEditorAfterIntro,
    stageLongPressNote,
    finishLongPressNote,
    cancelLongPressNote
  } = useMapNoteIntro({
    onToggleEditor,
    onStageNote: (noteId) => {
      setPreSelectedNotes(null);
      setSelectedNoteIds(new Set([noteId]));
      setSelectedNoteId(noteId);
    }
  });

  /**
   * 相册导入的点位先完成项目写入，再用实际已存在的 Note 打开编辑器。
   * 这样用户一落地就能补标题和正文，也不会因异步写入让编辑器误判成草稿。
   */
  const queuePersistedNoteEditor = useCallback((note: Note) => {
    setPendingPersistedEditorNoteId(note.id);
  }, []);

  useEffect(() => {
    if (!pendingPersistedEditorNoteId) return;
    const note = notes.find((item) => item.id === pendingPersistedEditorNoteId);
    if (!note) return;

    setPreSelectedNotes(null);
    setSelectedNoteIds(new Set([note.id]));
    setSelectedNoteId(note.id);
    setEditingNote(note);
    setIsEditorOpen(true);
    onToggleEditor(true);
    setPendingPersistedEditorNoteId(null);
  }, [notes, onToggleEditor, pendingPersistedEditorNoteId]);
  const ignoreNextMapClickRef = useRef(false);

  const selectedNoteRaw = useMemo(
    () => (selectedNoteId ? notes.find((n) => n.id === selectedNoteId) : null),
    [selectedNoteId, notes]
  );
  const inspectorNoteId = useMemo(() => {
    if (selectedNoteIds.size > 1) return null;
    if (selectedNoteId) return selectedNoteId;
    if (selectedNoteIds.size === 1) return Array.from(selectedNoteIds)[0];
    return null;
  }, [selectedNoteId, selectedNoteIds]);

  const inspectorNote = useMemo(
    () => (inspectorNoteId ? notes.find((n) => n.id === inspectorNoteId) ?? null : null),
    [inspectorNoteId, notes]
  );

  const {
    showConnectionPanel: showMapConnectionPanel,
    setShowConnectionPanel: setShowMapConnectionPanel,
    panelEditingKey: mapConnPanelEditingKey,
    connectionDraft: mapConnectionDraft,
    setConnectionDraft: setMapConnectionDraft,
    pickTarget: mapConnPickTarget,
    setPickTarget: setMapConnPickTarget,
    commitConnectionDraft: commitMapConnectionDraft,
    deleteConnectionByPanel: handleDeleteMapConnectionByPanel,
    resetNewConnectionDraft: handleNewMapConnectionEmpty,
    openNewFromInspectorAnchor: handleNewConnectionFromInspector,
    openEditConnection: handleEditMapConnection,
    clearPanelDraft: clearMapConnectionPanelDraft,
    clearFromOnly: clearMapConnectionFromOnly,
    clearToOnly: clearMapConnectionToOnly
  } = useSimpleConnectionPanel({
    connections,
    onUpdateConnections,
    projectDefaults: project,
    anchorNoteIdForNew: inspectorNoteId
  });

  const hoveredNoteRaw = useMemo(
    () => (hoveredNoteId ? notes.find((n) => n.id === hoveredNoteId) ?? null : null),
    [hoveredNoteId, notes]
  );

  // Reset preview image index when selected or hovered note changes
  useEffect(() => {
    setCurrentPreviewImageIndex(0);
  }, [selectedNoteId, hoveredNoteId]);

  // 当前选中点及其所有通过 connections 直接相连的端点，强制在聚类中拆分为单独 pin
  const forceSingleNoteIds = useMemo(() => {
    const seeds = new Set<string>(selectedNoteIds);
    if (selectedNoteId) seeds.add(selectedNoteId);
    // 临时点在确认前始终保持为单个图钉，不能被周围点合并成簇后“消失”。
    if (introNote?.id) seeds.add(introNote.id);
    if (seeds.size === 0) return [] as string[];
    const ids = new Set<string>(seeds);
    seeds.forEach((id) => {
      connections.forEach((conn) => {
        if (conn.fromNoteId === id || conn.toNoteId === id) {
          ids.add(conn.fromNoteId);
          ids.add(conn.toNoteId);
        }
      });
    });
    return Array.from(ids);
  }, [selectedNoteIds, selectedNoteId, introNote?.id, connections]);

  // Clear selection and hover when exiting preview mode
  useEffect(() => {
    if (isUIVisible) {
      setSelectedNoteId(null);
      setSelectedNoteIds(new Set());
      setPreSelectedNotes(null);
      setCurrentPreviewImageIndex(0);
      setConnectionHighlightNoteIds(null);
      setHoveredNoteId(null);
    }
  }, [isUIVisible]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (selectionTimerRef.current) {
        clearTimeout(selectionTimerRef.current);
      }
    };
  }, []);

  const { mapInstance, mapRefCallback } = useMapInitialization();
  const mapInstanceRef = useRef(mapInstance);
  mapInstanceRef.current = mapInstance;
  /** 预览卡的 document-capture 外点监听需放行图钉；实际选中/关闭由地图事件统一决定。 */
  const mapMarkerPaneDismissIgnoreRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    mapMarkerPaneDismissIgnoreRef.current = mapInstance?.getPanes().markerPane ?? null;
    return () => {
      mapMarkerPaneDismissIgnoreRef.current = null;
    };
  }, [mapInstance]);
  const noteEditorAnimationAnchor = useMemo(() => {
    const coords = editingNote?.coords ?? selectedNoteRaw?.coords;
    if (!coords || !mapInstance) return null;
    const mapRect = mapInstance.getContainer().getBoundingClientRect();
    const point = mapInstance.latLngToContainerPoint([coords.lat, coords.lng]);
    return { x: mapRect.left + point.x, y: mapRect.top + point.y };
  }, [editingNote?.coords?.lat, editingNote?.coords?.lng, selectedNoteRaw?.coords?.lat, selectedNoteRaw?.coords?.lng, mapInstance]);
  const navigateToCoordsRef = useRef(navigateToCoords);
  navigateToCoordsRef.current = navigateToCoords;
  const mapViewMountedRef = useRef(true);
  const mapShellRef = useRef<HTMLDivElement | null>(null);
  const unplacedSidebarRef = useRef<HTMLElement | null>(null);
  const lastMarkerDragPointerRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const [isUnplacedSidebarDropTarget, setIsUnplacedSidebarDropTarget] = useState(false);
  const [unplacedSidebarDropCount, setUnplacedSidebarDropCount] = useState(0);

  const isOverUnplacedSidebar = useCallback((event?: { clientX?: number; clientY?: number }) => {
    const x = event?.clientX;
    const y = event?.clientY;
    const rect = unplacedSidebarRef.current?.getBoundingClientRect();
    return (
      typeof x === 'number' &&
      typeof y === 'number' &&
      !!rect &&
      x >= rect.left - UNPLACED_DROP_EDGE_TOLERANCE_PX &&
      x <= rect.right + UNPLACED_DROP_EDGE_TOLERANCE_PX &&
      y >= rect.top - UNPLACED_DROP_EDGE_TOLERANCE_PX &&
      y <= rect.bottom + UNPLACED_DROP_EDGE_TOLERANCE_PX
    );
  }, []);

  const draggedNoteIdsFor = useCallback(
    (note: Note) => (selectedNoteIds.has(note.id) ? [...selectedNoteIds] : [note.id]),
    [selectedNoteIds]
  );

  const updateUnplacedSidebarDropTarget = useCallback(
    (note: Note, pointer?: { clientX?: number; clientY?: number }) => {
      const isTarget = isOverUnplacedSidebar(pointer);
      setIsUnplacedSidebarDropTarget(isTarget);
      setUnplacedSidebarDropCount(isTarget ? draggedNoteIdsFor(note).length : 0);
      return isTarget;
    },
    [draggedNoteIdsFor, isOverUnplacedSidebar]
  );

  useEffect(() => {
    mapViewMountedRef.current = true;
    return () => {
      mapViewMountedRef.current = false;
    };
  }, []);

  /** 侧栏宽度动画 / 容器尺寸变化后 Leaflet 需 invalidateSize，否则会偏左、与侧栏相对关系错位 */
  useEffect(() => {
    if (!mapInstance) return;
    const map = mapInstance;
    const shell = mapShellRef.current;
    const inv = () => {
      try {
        map.invalidateSize({ animate: false });
      } catch {
        /* noop */
      }
    };
    inv();
    const tShort = window.setTimeout(inv, 60);
    const tSidebarDone = window.setTimeout(
      inv,
      Math.round(PROJECT_OPEN_SLIDE_DURATION_S * 1000) + 80
    );
    const tLate = window.setTimeout(inv, 450);
    let ro: ResizeObserver | undefined;
    if (shell && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => inv());
      ro.observe(shell);
    }
    return () => {
      window.clearTimeout(tShort);
      window.clearTimeout(tSidebarDone);
      window.clearTimeout(tLate);
      ro?.disconnect();
    };
  }, [mapInstance, project.id]);

  // Marker clustering related state (reserved for future use)
  
  // 读取已有图片（可能是存储的图片 ID），用于指纹对比
  const getImageDataForFingerprint = async (imageRef: string): Promise<string | null> => {
    if (!imageRef) return null;
    // 如果是存储的图片 ID，先从 IndexedDB 取出 Base64
    if (imageRef.startsWith('img-')) {
      try {
        const loaded = await loadImage(imageRef);
        if (loaded) return loaded;
      } catch (err) {
        console.warn('Failed to load stored image for fingerprint:', err);
        return null;
      }
    }
    // 已经是 Base64 数据
    return imageRef;
  };
  
  // Text labels display mode
  const [showTextLabels, setShowTextLabels] = useState(false);
  /** 仅用于检测全局 label 是否从「开」变为「关」，避免选中态变化时误清簇展开列表 */
  const prevShowTextLabelsRef = useRef(showTextLabels);

  /** 地图顶栏「编辑」与 Board/Graph 共用 App 级状态 */
  const isMapToolbarEditMode = workspaceEditMode;

  useEffect(() => {
    if (!isUIVisible) onWorkspaceEditModeChange(false);
  }, [isUIVisible, onWorkspaceEditModeChange]);

  // Shortcut key T to toggle text labels
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't toggle if user is typing in an input or textarea
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement).isContentEditable
      ) {
        return;
      }

      if (e.key.toLowerCase() === 't' && !isEditorOpen) {
        setShowTextLabels(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEditorOpen]);

  // 当关闭全局 label 开关时：
  // - 仍保留当前选中态（便于非 label 模式下继续显示连接相关 label）
  // - 只收起“簇展开列表”
  // - 根据 selectedNoteId 重新计算 connectionHighlightNoteIds，让非 label 模式下也能显示连接端点 label
  useEffect(() => {
    if (!isUIVisible) return;

    // 清理可能正在等待的选中延迟（避免在 label 切换瞬间出现竞态）
    if (selectionTimerRef.current) {
      clearTimeout(selectionTimerRef.current);
      selectionTimerRef.current = null;
    }

    if (!showTextLabels) {
      // 仅当用户关闭全局 label 开关时收起簇展开；不要在 selectedNoteId/Ids 变化时清空，
      // 否则点击簇会先 setPreSelectedNotes 再被本 effect 立即清掉，表现为 label 组一闪即逝。
      if (prevShowTextLabelsRef.current) {
        setPreSelectedNotes(null);
      }
      prevShowTextLabelsRef.current = showTextLabels;
      setHoveredNoteId(null);

      const seeds = new Set<string>(selectedNoteIds);
      if (selectedNoteId) seeds.add(selectedNoteId);
      if (seeds.size > 0) {
        const ids = new Set<string>(seeds);
        seeds.forEach((id) => {
          connections.forEach((conn) => {
            if (conn.fromNoteId === id || conn.toNoteId === id) {
              ids.add(conn.fromNoteId);
              ids.add(conn.toNoteId);
            }
          });
        });
        setConnectionHighlightNoteIds(Array.from(ids));
      } else {
        setConnectionHighlightNoteIds(null);
      }
    } else {
      prevShowTextLabelsRef.current = showTextLabels;
      // 打开 label 模式时，不需要额外的 connectionHighlightNoteIds 收缩逻辑
      setConnectionHighlightNoteIds(null);
    }
  }, [showTextLabels, isUIVisible, selectedNoteId, selectedNoteIds, connections]);

  // Pin size control
  const [pinSize, setPinSize] = useState(1.0); // Scale factor for pin size
  // 媒体型点位独立于普通泪滴图钉，默认以更易辨识的 96px 缩略图呈现。
  const [imageSize, setImageSize] = useState(1.0);
  // Label size control (independent)
  const [labelSize, setLabelSize] = useState(1.0);

  // Cluster threshold control
  const [clusterThreshold, setClusterThreshold] = useState(40); // Distance threshold for clustering

  // Settings panel
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const mapToolbarRef = useRef<HTMLDivElement>(null);
  const [showLocateMenu, setShowLocateMenu] = useState(false);
  const [showCreateMenu, setShowCreateMenu] = useState(false);

  // Location request UI
  const [isLocating, setIsLocating] = useState(false);
  const [locateEpoch, setLocateEpoch] = useState(0);
  const [isCreatingAtLocation, setIsCreatingAtLocation] = useState(false);
  const [photoImportNotice, setPhotoImportNotice] = useState<string | null>(null);
  const photoImportNoticeTimerRef = useRef<number | null>(null);
  /** Empty-project geolocation arrived after fallback center — one-shot late recenter */
  const [lateAutoCenter, setLateAutoCenter] = useState<[number, number] | null>(null);

  // Current marker index being viewed

  const locatingActive = useMemo(
    () => isLocating || getPendingMapLocate(project.id)?.phase === 'requesting',
    [isLocating, project.id, locateEpoch]
  );
  const defaultCenter: [number, number] = [28.1847, 112.9467];
  /** 有有效地理坐标的便签（不含 0,0 占位），用于地图定位与空状态 */
  const mapGeoNotes = useMemo(() => notes.filter((n) => noteHasRenderableMapPosition(n)), [notes]);

  // Geolocation management hook
  const {
    currentLocation,
    deviceHeading,
    hasLocationPermission,
    permissionStatus,
    isRequestingLocation,
    isSecureContext,
    locationError,
    setLocationError,
    requestLocation
  } = useGeolocation(true);

  const [locationEnableDismissed, setLocationEnableDismissed] = useState(false);

  useEffect(() => {
    setLocationEnableDismissed(false);
  }, [project.id]);

  const borderSearchState = useBorderSearch({
    mapInstance,
    notes,
    onAddNote,
    setBorderGeoJSON,
    setShowBorderPanel
  });
  const { pendingPlaceNote, setPendingPlaceNote, handleConvertPendingToNote } = borderSearchState;

  // Auto-hide location error after 2 seconds
  useEffect(() => {
    if (!locationError) return;
    const timer = setTimeout(() => {
      setLocationError(null);
    }, 2000);
    return () => clearTimeout(timer);
  }, [locationError, setLocationError]);

  // Enhanced location request with auto-retry and navigation
  const handleLocateCurrentPosition = useCallback(async () => {
    const projectId = project.id;

    // 已有实时定位时先立即飞入；watchPosition 会持续更新它，避免重复点击仍等待一轮 GPS 请求。
    const liveMap = mapInstanceRef.current;
    if (currentLocation && liveMap?.getContainer().isConnected) {
      // 取消仍在跑的自动/旧请求，避免其延迟结果随后覆盖这次即时定位。
      cancelPendingMapLocate(projectId);
      setViewPositionCache(projectId, 'map', { center: [currentLocation.lat, currentLocation.lng], zoom: 16 });
      liveMap.flyTo([currentLocation.lat, currentLocation.lng], 16, { duration: 0.9 });
      return;
    }

    const gen = beginPendingMapLocate(projectId);
    try {
      // 必须在 click 栈里同步发起 getCurrentPosition（启用权限 / 冷启动定位）。
      const locPromise = requestLocation({ requestOrientation: true });
      if (mapViewMountedRef.current) {
        setIsLocating(true);
        setLocationError(null);
      }

      const loc = await locPromise;

      if (!loc) {
        cancelPendingMapLocate(projectId, gen);
        return;
      }

      setLocationEnableDismissed(false);

      // 当前地图仍在场时直接飞入，避免再经由全局事件转发一轮；切出视图后才保留 intent 给下次挂载。
      const map = mapInstanceRef.current;
      if (map?.getContainer().isConnected) {
        cancelPendingMapLocate(projectId, gen);
        setViewPositionCache(projectId, 'map', { center: [loc.lat, loc.lng], zoom: 16 });
        map.flyTo([loc.lat, loc.lng], 16, { duration: 0.9 });
        return;
      }

      if (!completePendingMapLocate(projectId, gen, loc.lat, loc.lng, 16)) return;
      setViewPositionCache(projectId, 'map', { center: [loc.lat, loc.lng], zoom: 16 });
    } catch (error) {
      console.error('Location request failed:', error);
      cancelPendingMapLocate(projectId, gen);
    } finally {
      if (mapViewMountedRef.current) setIsLocating(false);
    }
  }, [currentLocation, requestLocation, setLocationError, project.id]);

  /** 冷启动门闸：click 第一行就发起 getCurrentPosition，专用于唤起系统权限。 */
  const handleEnableLocation = useCallback(() => {
    const locPromise = requestLocation({ requestOrientation: true });
    if (mapViewMountedRef.current) {
      setIsLocating(true);
      setLocationError(null);
    }
    void locPromise
      .then((loc) => {
        if (!loc || !mapViewMountedRef.current) return;
        setLocationEnableDismissed(false);
        const map = mapInstanceRef.current;
        if (map?.getContainer().isConnected) {
          setViewPositionCache(project.id, 'map', {
            center: [loc.lat, loc.lng],
            zoom: 16
          });
          map.flyTo([loc.lat, loc.lng], 16, { duration: 0.9 });
        }
      })
      .finally(() => {
        if (mapViewMountedRef.current) setIsLocating(false);
      });
  }, [requestLocation, setLocationError, project.id]);

  // Map position management hook
  const { initialMapPosition, handleMapPositionChange } = useMapPosition({
    isMapMode: true,
    projectId: project.id,
    navigateToCoords,
    mapNotes: mapGeoNotes,
    currentLocation,
    defaultCenter
  });

  // 空项目不自动申请定位：权限只在用户点击「定位 / 当前位置新建 / 拍照新建」时申请。
  useEffect(() => {
    setLateAutoCenter(null);
  }, [project.id]);

  useEffect(() => {
    const onPending = () => {
      setLocateEpoch((n) => n + 1);
      if (navigateToCoordsRef.current) return;
      const map = mapInstanceRef.current;
      if (map) applyReadyMapLocate(map, project.id, true);
    };
    window.addEventListener(PENDING_MAP_LOCATE_EVENT, onPending);
    return () => window.removeEventListener(PENDING_MAP_LOCATE_EVENT, onPending);
  }, [project.id]);

  useEffect(() => {
    if (!mapInstance || navigateToCoords) return;
    applyReadyMapLocate(mapInstance, project.id, true);
  }, [mapInstance, project.id, navigateToCoords]);

  // Image import management hook
  const {
    fileInputRef,
    dataImportInputRef,
    handleImageImport,
  } = useImageImport({
    project,
    notes,
    onUpdateProject,
    onNotesCreated: (newNotes, target, { duplicateCount, unplacedCount }) => {
      // 无 EXIF 坐标的照片需要立即有可见的归宿和下一步操作；切入编辑态后待定位箱会展开，
      // 也会启用「从待定位箱拖到地图」的专用落点。
      if (unplacedCount > 0) {
        onWorkspaceEditModeChange(true);
      }
      if (newNotes.length === 1 && unplacedCount === 0 && duplicateCount === 0) {
        queuePersistedNoteEditor(newNotes[0]);
        return;
      }
      if (newNotes.length > 0 || duplicateCount > 0) {
        if (photoImportNoticeTimerRef.current != null) {
          window.clearTimeout(photoImportNoticeTimerRef.current);
        }
        const positionedCount = newNotes.length - unplacedCount;
        const importNotice =
          newNotes.length === 0
            ? '已有重复图片，未重复导入。'
            : unplacedCount === newNotes.length
              ? `已放入待定位箱 ${unplacedCount} 项，可在地图编辑模式中定位。`
              : unplacedCount > 0
                ? `已创建 ${positionedCount} 个照片点位；${unplacedCount} 项已放入待定位箱。`
                : `已创建 ${newNotes.length} 个照片点位，可点击地图上的点位补充文字。`;
        setPhotoImportNotice(
          duplicateCount > 0 && newNotes.length > 0
            ? `${importNotice} 另有 ${duplicateCount} 项已有重复图片。`
            : importNotice
        );
        photoImportNoticeTimerRef.current = window.setTimeout(() => {
          setPhotoImportNotice(null);
          photoImportNoticeTimerRef.current = null;
        }, 4200);
      }
    },
    mapInstance
  });

  useEffect(() => () => {
    if (photoImportNoticeTimerRef.current != null) {
      window.clearTimeout(photoImportNoticeTimerRef.current);
    }
  }, []);

  const { handleDataImport } = useDataImport({ project, onUpdateProject });
  const { handleCsvImport } = useCsvImport({ project, onUpdateProject });
  const { isDragging, dismissDrag, rootProps } = useFileDrop({
    isEditorOpen,
    handleImageImport,
    handleDataImport,
    handleCsvImport
  });

  /** 外部图片投到地图时使用照片自身 GPS；没有 GPS 的图片自动进入待定位箱。 */
  const handleMapShellDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!allowPhotoImport) {
        event.preventDefault();
        return;
      }
      const files = event.dataTransfer.files;
      const hasImage = Array.from(files).some(
        (file) =>
          file.type.startsWith('image/') || /\.(heic|heif|jpe?g|png|webp|gif|avif|tiff?)$/i.test(file.name)
      );
      const map = mapInstanceRef.current;
      if (!isEditorOpen && hasImage && map) {
        event.preventDefault();
        event.stopPropagation();
        dismissDrag();
        handleImageImport(files, { target: { kind: 'map-exif' } });
        return;
      }
      rootProps.onDrop(event);
    },
    [allowPhotoImport, dismissDrag, handleImageImport, isEditorOpen, rootProps]
  );

  // Map layers management hook
  const {
    frameLayerVisibility,
    setFrameLayerVisibility,
    showAllFrames,
    setShowAllFrames,
    showFrameLayerPanel,
    setShowFrameLayerPanel,
    frameLayerRef,
    getFilteredNotes
  } = useMapLayers({
    notes,
    projectFrames: project.frames
  });

  const closeMapChromeExcept = useCallback((keep?: MapChromeId) => {
    if (keep !== 'settings') setShowSettingsPanel(false);
    if (keep !== 'layer') setShowFrameLayerPanel(false);
    if (keep !== 'search') setShowBorderPanel?.(false);
    if (keep !== 'locate') setShowLocateMenu(false);
    if (keep !== 'create') setShowCreateMenu(false);
  }, [setShowBorderPanel, setShowFrameLayerPanel]);

  useEffect(() => {
    const dismiss = () => {
      closeMapChromeExcept();
      setShowImportMenu?.(false);
      setShowMapConnectionPanel(false);
      setMapConnPickTarget(null);
    };
    window.addEventListener(WORKSPACE_TRANSIENT_DISMISS_EVENT, dismiss);
    return () => window.removeEventListener(WORKSPACE_TRANSIENT_DISMISS_EVENT, dismiss);
  }, [closeMapChromeExcept, setMapConnPickTarget, setShowImportMenu, setShowMapConnectionPanel]);

  const handleToggleSettings = useCallback(() => {
    closeMapChromeExcept('settings');
    setShowSettingsPanel((v) => !v);
  }, [closeMapChromeExcept]);

  const handleToggleLayerPanel = useCallback(() => {
    closeMapChromeExcept('layer');
    setShowFrameLayerPanel((v) => !v);
  }, [closeMapChromeExcept, setShowFrameLayerPanel]);

  const handleCloseLayerPanel = useCallback(() => {
    setShowFrameLayerPanel(false);
  }, [setShowFrameLayerPanel]);

  const handleToggleBorderPanel = useCallback(() => {
    closeMapChromeExcept('search');
    setShowBorderPanel?.(!showBorderPanel);
  }, [closeMapChromeExcept, setShowBorderPanel, showBorderPanel]);

  const handleToggleLocateMenu = useCallback(() => {
    closeMapChromeExcept('locate');
    setShowLocateMenu((v) => !v);
  }, [closeMapChromeExcept]);

  const handleToggleCreateMenu = useCallback(() => {
    closeMapChromeExcept('create');
    setShowCreateMenu((v) => !v);
  }, [closeMapChromeExcept]);

  const handleCloseLocateAndCreateMenus = useCallback(() => {
    setShowLocateMenu(false);
    setShowCreateMenu(false);
  }, []);

  const mapToolbarKind: MapChromeId | null = showSettingsPanel
    ? 'settings'
    : showFrameLayerPanel
      ? 'layer'
      : showBorderPanel
        ? 'search'
        : showLocateMenu
          ? 'locate'
          : showCreateMenu
            ? 'create'
            : null;
  // 窄屏的新建节点已由 MapControls 的扇形菜单承载，不应再同步打开底部 sheet。
  const toolbarSlotKind = compactViewport && mapToolbarKind === 'create' ? null : mapToolbarKind;
  const mapNoteKind: 'preview' | 'editor' | null = isEditorOpen
    ? 'editor'
    : isUIVisible && selectedNoteId
      ? 'preview'
      : null;
  const mapToolbarMenuTop = useChromeMenuTop(
    mapToolbarKind != null || mapNoteKind != null,
    mapToolbarRef,
    8
  );

  /** 打开详情预览时收起其它地图浮层，保证单一工作焦点。 */
  const closePanelsForPreview = useCallback(() => {
    closeMapChromeExcept();
    setShowImportMenu?.(false);
    setShowMapConnectionPanel(false);
    setMapConnPickTarget(null);
  }, [closeMapChromeExcept, setShowImportMenu, setShowMapConnectionPanel, setMapConnPickTarget]);

  const graphLayerStandard = (project.graphLayerStandard ?? 'tag') as NoteLayerGroupStandard;
  const mergedTagMapLayers = useMemo(
    () => mergeNoteLayerState(notes, project.graphLayers ?? null, 'tag'),
    [notes, project.graphLayers]
  );
  const mergedFrameMapLayers = useMemo(
    () => mergeNoteLayerState(notes, project.graphFrameLayers ?? null, 'frame'),
    [notes, project.graphFrameLayers]
  );
  const mergedEmojiMapLayers = useMemo(
    () => mergeNoteLayerState(notes, project.graphEmojiLayers ?? emojiLayerStateFromLegacyTagState(project.graphLayers), 'emoji'),
    [notes, project.graphEmojiLayers, project.graphLayers]
  );
  const mergedMapProjectLayers =
    graphLayerStandard === 'frame'
      ? mergedFrameMapLayers
      : graphLayerStandard === 'emoji'
        ? mergedEmojiMapLayers
        : mergedTagMapLayers;

  const mapCanvasNotes = useMemo(
    () =>
      getFilteredNotes.filter((n) =>
        isNoteVisibleInUnifiedLayer(n, mergedMapProjectLayers, graphLayerStandard)
      ),
    [getFilteredNotes, mergedMapProjectLayers, graphLayerStandard]
  );

  /** 图层过滤后仍仅渲染有坐标的点 */
  const mapRenderedNotesRaw = useMemo(
    () => mapCanvasNotes.filter((n) => noteHasRenderableMapPosition(n)),
    [mapCanvasNotes]
  );
  const mapRenderedNotes = useNotesWithResolvedMedia(mapRenderedNotesRaw);

  /**
   * 临时点与保存后的正式点都交给同一个 marker 图层，以稳定的 note id 交接。
   * 未保存时只是局部状态；保存后真实 note 替换同 id 的临时数据，不会卸载图钉。
   */
  const mapMarkerNotes = useMemo(() => {
    if (!introNote?.id || !introNote.coords) return mapRenderedNotes;
    if (mapRenderedNotes.some((note) => note.id === introNote.id)) return mapRenderedNotes;
    return [...mapRenderedNotes, introNote as Note];
  }, [introNote, mapRenderedNotes]);

  const placeUnlocatedNotes = useCallback(
    (noteIds: string[], coords: Coordinates) => {
      const ids = new Set(noteIds);
      const targetNotes = notes.filter((note) => ids.has(note.id));
      if (targetNotes.length === 0) {
        return;
      }
      const nextNotes = transferNotesSpatially(notes, ids, { kind: 'map', coords });
      if (onUpdateProject) {
        void onUpdateProject({ ...project, notes: nextNotes });
      } else {
        targetNotes.forEach((note) => onUpdateNote(placeNoteOnMap(note, coords)));
      }
      setSelectedNoteId(targetNotes[0].id);
      setSelectedNoteIds(new Set(targetNotes.map((note) => note.id)));
      setPreSelectedNotes(null);
    },
    [notes, onUpdateNote, onUpdateProject, project]
  );

  /** 图钉移入待定位箱即清除地图位置；多选后拖动其中任意一个会一起转移。 */
  const moveMapNotesToUnplaced = useCallback(
    (noteIds: string[]) => {
      const ids = new Set(noteIds);
      const targetNotes = notes.filter((note) => ids.has(note.id));
      if (targetNotes.length === 0) return;

      const transferOrder = Date.now();
      const nextNotes = transferNotesSpatially(notes, ids, { kind: 'unplaced' }).map((note) =>
        ids.has(note.id) ? { ...note, unplacedOrder: transferOrder } : note
      );
      if (onUpdateProject) {
        void onUpdateProject({ ...project, notes: nextNotes });
      } else {
        targetNotes.forEach((note) => onUpdateNote(moveNoteToMapUnplaced(note, transferOrder)));
      }
      setNoteCoordOverrides((current) => {
        const next = { ...current };
        targetNotes.forEach((note) => delete next[note.id]);
        return next;
      });
      setSelectedNoteId(null);
      setSelectedNoteIds(new Set());
      setPreSelectedNotes(null);
    },
    [notes, onUpdateNote, onUpdateProject, project]
  );

  const deleteUnplacedMapNotes = useCallback(
    (noteIds: string[]) => {
      const ids = new Set(noteIds);
      const targets = notes.filter((note) => ids.has(note.id));
      if (!targets.length) return;
      const wording = targets.length === 1 ? '永久删除这个待定位记录吗？' : `永久删除这 ${targets.length} 个待定位记录吗？`;
      if (!window.confirm(wording)) return;
      if (onUpdateProject) {
        void onUpdateProject({ ...project, notes: notes.filter((note) => !ids.has(note.id)) });
      } else {
        targets.forEach((note) => onDeleteNote?.(note.id));
      }
    },
    [notes, onDeleteNote, onUpdateProject, project]
  );

  /** 详情卡优先用已解析像素的 note，避免再次卡在「加载中」 */
  const selectedNote = useMemo(() => {
    if (!selectedNoteId) return null;
    return (
      mapRenderedNotes.find((n) => n.id === selectedNoteId) ??
      selectedNoteRaw ??
      null
    );
  }, [selectedNoteId, mapRenderedNotes, selectedNoteRaw]);
  const stickySelectedNote = useStickyValue(selectedNote);

  const hoveredNote = useMemo(() => {
    if (!hoveredNoteId) return null;
    return (
      mapRenderedNotes.find((n) => n.id === hoveredNoteId) ??
      hoveredNoteRaw ??
      null
    );
  }, [hoveredNoteId, mapRenderedNotes, hoveredNoteRaw]);

  const mapNoteStackRank = useMemo(() => {
    const sorted = sortNotesByLayerStack(mapMarkerNotes);
    const m = new Map<string, number>();
    sorted.forEach((n, i) => m.set(n.id, i));
    return m;
  }, [mapMarkerNotes]);

  const handleMapGraphLayersChange = useCallback(
    (next: GraphLayerState) => {
      if (!onUpdateProject) return;
      if (graphLayerStandard === 'frame') {
        void onUpdateProject({ ...project, graphFrameLayers: next });
      } else if (graphLayerStandard === 'emoji') {
        void onUpdateProject({ ...project, graphEmojiLayers: next });
      } else {
        void onUpdateProject({ ...project, graphLayers: next });
      }
    },
    [onUpdateProject, project, graphLayerStandard]
  );

  const handleMapLayerStandardChange = useCallback(
    (standard: NoteLayerGroupStandard) => {
      if (!onUpdateProject) return;
      void onUpdateProject({ ...project, graphLayerStandard: standard });
    },
    [onUpdateProject, project]
  );

  const handleMapBatchNotes = useCallback(
    async (nextNotes: Note[]) => {
      if (!onUpdateProject) return;
      await onUpdateProject({ ...project, notes: nextNotes });
    },
    [onUpdateProject, project]
  );

  const handleMapUpdateFrame = useCallback(
    (frame: Frame) => {
      if (!onUpdateProject) return;
      void onUpdateProject({
        ...project,
        frames: (project.frames ?? []).map((f) => (f.id === frame.id ? frame : f))
      });
    },
    [onUpdateProject, project]
  );

  const { clusteredMarkers, sortNotes } = useMapClustering({
    mapInstance,
    getFilteredNotes: () => mapMarkerNotes,
    clusterThreshold,
    forceSingleNoteIds
  });
  const { handleMarkerClick, handleClusterClick } = useMapMarkerSelection({
    isUIVisible,
    showTextLabels,
    connections,
    selectedNoteId,
    selectedNoteIds,
    preSelectedNotes,
    ignoreNextMarkerClickRef,
    isMarkerDraggingRef,
    selectionTimerRef,
    closePanelsForPreview,
    sortNotes,
    setSelectedNoteId,
    setSelectedNoteIds,
    setPreSelectedNotes,
    setConnectionHighlightNoteIds
  });
  const {
    handleMarkerDrag,
    handleMarkerDragEnd,
    handleMarkerLongPressDragStart,
    handleMarkerLongPressDrag,
    handleMarkerLongPressDragEnd
  } = useMapMarkerDrag({
    canModifyNote,
    denyEdit,
    onUpdateNote,
    moveMapNotesToUnplaced,
    draggedNoteIdsFor,
    updateUnplacedSidebarDropTarget,
    closeMapChromeExcept,
    onWorkspaceEditModeChange,
    isMarkerDraggingRef,
    ignoreNextMarkerClickRef,
    lastMarkerDragPointerRef,
    setNoteCoordOverrides,
    setIsUnplacedSidebarDropTarget,
    setUnplacedSidebarDropCount,
    setPreSelectedNotes,
    setSelectedNoteIds,
    setSelectedNoteId
  });

  // Map styling management hook
  const {
    mapStyle,
    effectiveMapStyle,
    localMapStyle,
    setLocalMapStyle,
    handleLocalMapStyleChange,
    handleMapStyleChange,
    tileLayerConfig
  } = useMapStyling({
    mapStyleId,
    onMapStyleChange
  });

  const mapTileKeepBuffer = useMemo(() => getAdaptiveMapTileKeepBuffer(), []);

  /**
   * 地图点位唯一的离场路径：先让图钉完成一次 exit，再移除临时点或提交持久化删除。
   * `deletingNoteIdsRef` 同时充当去重锁，避免取消、关闭面板、删除按钮重复启动动画。
   */
  const exitMapNote = useCallback(
    async (noteId: string, persistDelete: boolean) => {
      if (!noteId || deletingNoteIdsRef.current.has(noteId)) return;
      deletingNoteIdsRef.current.add(noteId);
      setDeletingNoteIds(new Set(deletingNoteIdsRef.current));
      setSelectedNoteId((current) => (current === noteId ? null : current));
      setSelectedNoteIds((current) => {
        if (!current.has(noteId)) return current;
        const next = new Set(current);
        next.delete(noteId);
        return next;
      });
      setHoveredNoteId((current) => (current === noteId ? null : current));
      setPreSelectedNotes(null);
      setConnectionHighlightNoteIds(null);

      try {
        await new Promise<void>((resolve) => window.setTimeout(resolve, MAP_NOTE_EXIT_MS));
        setIntroNote((current) => (current?.id === noteId ? null : current));
        if (persistDelete) await Promise.resolve(onDeleteNote?.(noteId));
      } finally {
        deletingNoteIdsRef.current.delete(noteId);
        setDeletingNoteIds(new Set(deletingNoteIdsRef.current));
      }
    },
    [onDeleteNote]
  );

  /**
   * 地图新建统一入口：有实时定位则直接用（与长按同路径）；否则再在手势内请求 GPS。
   * 拍照仅多一步 autoOpenCamera。
   */
  const createNoteAtCurrentLocation = useCallback(
    async (opts?: { autoOpenCamera?: boolean }) => {
      try {
        // 已有 watch / 定位结果时直接建点，避免再冷启动 getCurrentPosition
        //（Safari 上常在「定位成功」后仍报 POSITION_UNAVAILABLE）。
        const locPromise = currentLocation
          ? Promise.resolve(currentLocation)
          : requestLocation({ requestOrientation: false });
        setIsCreatingAtLocation(true);
        setLocationError(null);
        const loc = await locPromise;
        if (!loc) return;
        const map = mapInstanceRef.current;
        if (map) {
          map.flyTo([loc.lat, loc.lng], 16, { duration: 1.5 });
        }
        const newNote = stageNewMapNote({ lat: loc.lat, lng: loc.lng });
        setEditorAutoOpenCamera(!!opts?.autoOpenCamera);
        openNewNoteEditorAfterIntro(newNote);
      } catch (error) {
        console.error('Create note at current location failed:', error);
        setEditorAutoOpenCamera(false);
      } finally {
        setIsCreatingAtLocation(false);
      }
    },
    [
      currentLocation,
      requestLocation,
      setLocationError,
      stageNewMapNote,
      openNewNoteEditorAfterIntro
    ]
  );

  const handleCreateAtCurrentLocation = useCallback(() => {
    void createNoteAtCurrentLocation();
  }, [createNoteAtCurrentLocation]);

  /** 与当前位置新建同一套流程，编辑器内自动打开 +拍照 overlay */
  const handleImportFromCamera = useCallback(() => {
    void createNoteAtCurrentLocation({ autoOpenCamera: true });
  }, [createNoteAtCurrentLocation]);

  const handleLongPress = stageLongPressNote;
  const handleLongPressRelease = finishLongPressNote;

  const handleLongPressCancel = useCallback(() => {
    const cancelledNoteId = cancelLongPressNote();
    if (cancelledNoteId) {
      void exitMapNote(cancelledNoteId, false);
    }
  }, [cancelLongPressNote, exitMapNote]);

  const handleImportFromPhotos = useCallback(() => {
    fileInputRef.current?.click();
  }, [fileInputRef]);

  const handleSaveNote = async (noteData: Partial<Note>) => {
    if (noteData.id && notes.some(n => n.id === noteData.id)) {
      // 确保保留原始note的variant
      const existingNote = notes.find(n => n.id === noteData.id);
      const fullNote: Note = {
        ...existingNote!,
        ...noteData,
        variant: noteData.variant || existingNote!.variant,
        isFavorite: noteData.isFavorite ?? existingNote?.isFavorite ?? false
      } as Note;
      if (!canModifyNote(fullNote)) {
        denyEdit(fullNote);
        return;
      }
      await onUpdateNote(fullNote);
      setIntroNote((current) => (current?.id === fullNote.id ? fullNote : current));
    } else {
      // Mapping 新建记录永远先进入 Board 待定箱。NoteEditor 会重新组装保存值，
      // 因此在最终落库边界再次固定这个跨视图状态，避免草稿字段被遗漏。
      const fullNote: Note = {
        ...noteData,
        variant: noteData.variant || 'standard',
        isFavorite: noteData.isFavorite ?? false,
        boardX: 0,
        boardY: 0,
        isInitialPosition: directMapPlacement ? false : true
      } as Note;
      await onAddNote(fullNote);
      // For new notes, update editingNote as well
      setEditingNote(fullNote);
      setIntroNote((current) => (current?.id === fullNote.id ? fullNote : current));
    }
  };

  const closeEditor = useCallback((reason: 'saved' | 'discarded' | 'deleted' = 'discarded') => {
    setIsEditorOpen(false);
    onToggleEditor(false);
    if (!introNote) return;

    if (reason === 'saved') {
      // 保留 intro 占位针，等 notes 写入同 id 后再无缝交接（见下方 effect）。
      // 若此处立刻 setIntroNote(null)，会在异步 onAddNote 落地前出现空窗闪烁。
      return;
    }
    if (reason === 'discarded') void exitMapNote(introNote.id, false);
  }, [exitMapNote, introNote, onToggleEditor]);

  /** 编辑器关闭是一个终态，不回退成仍被选中的预览卡。 */
  const closeEditorAndDismissNoteSlot = useCallback(
    (reason: 'saved' | 'discarded' | 'deleted' = 'discarded') => {
      closeEditor(reason);
      setSelectedNoteId(null);
      setSelectedNoteIds(new Set());
      setPreSelectedNotes(null);
      setConnectionHighlightNoteIds(null);
      setHoveredNoteId(null);
    },
    [closeEditor]
  );

  /** 保存关闭后：正式图钉已进项目时卸下 intro，完成无缝交接 */
  useEffect(() => {
    if (!introNote?.id || isEditorOpen) return;
    if (!notes.some((n) => n.id === introNote.id)) return;
    setIntroNote(null);
  }, [notes, introNote?.id, isEditorOpen]);

  const closeMapNoteSlot = useCallback(() => {
    if (isEditorOpen) {
      const save = mapNoteSaveRef.current;
      if (save) {
        void save().then((outcome) => closeEditorAndDismissNoteSlot(outcome));
        return;
      }
      closeEditorAndDismissNoteSlot('discarded');
      return;
    }
    setSelectedNoteId(null);
    setSelectedNoteIds(new Set());
    setPreSelectedNotes(null);
  }, [closeEditorAndDismissNoteSlot, isEditorOpen]);

  const handleDeleteNoteWithExit = useCallback(
    async (noteId: string) => {
      if (!onDeleteNote || deletingNoteIdsRef.current.has(noteId)) return;
      const note = notes.find((item) => item.id === noteId);
      if (note && !canModifyNote(note)) {
        denyEdit(note);
        return;
      }
      setEditingNote(null);
      setIsEditorOpen(false);
      onToggleEditor(false);
      await exitMapNote(noteId, true);
    },
    [canModifyNote, denyEdit, exitMapNote, notes, onDeleteNote, onToggleEditor]
  );

  useEffect(() => {
    const handleSelectedNoteDeleteKey = (event: KeyboardEvent) => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      if (!isUIVisible || isEditorOpen || pendingKeyboardDeleteIds?.length) return;
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && (target.isContentEditable || !!target.closest('[role="dialog"]')))
      ) return;

      const ids = [...selectedNoteIds].filter((id) => {
        const note = notes.find((item) => item.id === id);
        return !!note && canModifyNote(note);
      });
      if (!ids.length && selectedNoteId) {
        const note = notes.find((item) => item.id === selectedNoteId);
        if (note && canModifyNote(note)) ids.push(note.id);
      }
      if (!ids.length) return;
      event.preventDefault();
      event.stopPropagation();
      setPendingKeyboardDeleteIds(ids);
    };
    window.addEventListener('keydown', handleSelectedNoteDeleteKey);
    return () => window.removeEventListener('keydown', handleSelectedNoteDeleteKey);
  }, [canModifyNote, isEditorOpen, isUIVisible, notes, pendingKeyboardDeleteIds, selectedNoteId, selectedNoteIds]);

  // 侧栏「编辑」按钮或地图 label 双击：打开完整便签编辑器
  const handleEditNoteFromLabel = useCallback((noteId: string) => {
    if (!isUIVisible) return;
    const note = notes.find(n => n.id === noteId);
    if (!note) return;
    if (!canModifyNote(note)) {
      denyEdit(note);
      return;
    }

    setPreSelectedNotes(null);
    setSelectedNoteIds(new Set([noteId]));
    setSelectedNoteId(noteId);
    setEditingNote(note);
    setIsEditorOpen(true);
    onToggleEditor(true);
    closeMapChromeExcept();
  }, [canModifyNote, closeMapChromeExcept, denyEdit, isUIVisible, notes, onToggleEditor]);

  const handleMapMarkerClick = useCallback(
    (note: Note, event?: L.LeafletMouseEvent) => {
      const repeatedSingleSelection =
        !event?.originalEvent?.shiftKey &&
        !isMapToolbarEditMode &&
        isUIVisible &&
        selectedNoteId === note.id &&
        selectedNoteIds.size === 1 &&
        selectedNoteIds.has(note.id) &&
        preSelectedNotes == null;

      if (repeatedSingleSelection) {
        event?.originalEvent?.stopPropagation();
        event?.originalEvent?.stopImmediatePropagation();
        handleEditNoteFromLabel(note.id);
        return;
      }
      handleMarkerClick(note, event);
    },
    [
      handleEditNoteFromLabel,
      handleMarkerClick,
      isMapToolbarEditMode,
      isUIVisible,
      preSelectedNotes,
      selectedNoteId,
      selectedNoteIds
    ]
  );

  const handleMapShiftBoxSelectClaimed = useCallback(() => {
    ignoreNextMapClickRef.current = true;
  }, []);

  const handleMapBoxSelectCommit = useCallback(
    ({ ids, additive }: { ids: string[]; additive: boolean }) => {
      const next = additive
        ? (() => {
            const n = new Set(selectedNoteIds);
            ids.forEach((id) => n.add(id));
            return n;
          })()
        : new Set(ids);

      const primary =
        next.size === 0 ? null : ids.length > 0 ? ids[ids.length - 1] : Array.from(next)[0];

      const rel = new Set<string>(next);
      next.forEach((id) => {
        connections.forEach((conn) => {
          if (conn.fromNoteId === id || conn.toNoteId === id) {
            rel.add(conn.fromNoteId);
            rel.add(conn.toNoteId);
          }
        });
      });

      setSelectedNoteIds(next);
      setSelectedNoteId(primary);
      setConnectionHighlightNoteIds(showTextLabels ? null : next.size === 0 ? null : Array.from(rel));
    },
    [selectedNoteIds, connections, showTextLabels]
  );

  const handleMapClickInternal = useCallback((e: L.LeafletMouseEvent) => {
    // 若点击的是展开的 label（或 label 组），不要清空选择，让 TextLabelsLayer 的 onSelectNote 处理
    const target = e.originalEvent?.target as HTMLElement;
    if (
      // 详情卡现在与地图按钮共用 MapContainer 内的布局壳；卡片及其按钮点击不是地图空白点击。
      target?.closest?.('.mapping-preview-selectable') ||
      target?.closest?.('.pre-selected-labels-container') ||
      target?.closest?.('.pre-selected-label-item') ||
      // Clicking a pin should not clear selection (otherwise label may show but edit button won't).
      target?.closest?.('.custom-icon') ||
      (target?.closest?.('.leaflet-marker-icon') && !target?.closest?.('.user-location-marker')) ||
      target?.closest?.('.custom-pending-marker')
    ) {
      return;
    }
    if (ignoreNextMapClickRef.current) {
      ignoreNextMapClickRef.current = false;
      return;
    }
    // 与 Board 一致：按住 Shift 点空白地图不取消多选（仍处理 pending / onMapClick）
    if (isUIVisible && e.originalEvent?.shiftKey) {
      if (pendingPlaceNote) {
        setPendingPlaceNote(null);
      }
      if (onMapClick) {
        onMapClick();
      }
      return;
    }
    if (!isUIVisible) {
      if (selectionTimerRef.current) {
        clearTimeout(selectionTimerRef.current);
        selectionTimerRef.current = null;
      }
      setSelectedNoteId(null);
      setSelectedNoteIds(new Set());
      setPreSelectedNotes(null);
      setConnectionHighlightNoteIds(null);
      setHoveredNoteId(null);
    } else {
      setPreSelectedNotes(null);
      setSelectedNoteId(null);
      setSelectedNoteIds(new Set());
      setConnectionHighlightNoteIds(null);
      setHoveredNoteId(null);
    }
    if (pendingPlaceNote) {
      setPendingPlaceNote(null);
    }
    if (onMapClick) {
      onMapClick();
    }
  }, [pendingPlaceNote, onMapClick, isUIVisible]);

  const exportStandaloneMapTab = useCallback(async () => {
    if (!mapInstance) return;
    try {
      const payload = await buildMapTabExportPayload(project, themeColor, mapStyleId, mapInstance, {
        pinSize,
        imageSize,
        labelSize,
        clusterThreshold,
        showTextLabels,
        borderGeoJSON: borderGeoJSON ?? null
      });
      const html = buildStandaloneMapTabHtml(payload);
      const safe = (project.name || 'map').replace(/[/\\?%*:|"<>]/g, '_');
      downloadTextFile(`${safe}-map-tab-demo.html`, html, 'text/html;charset=utf-8');
    } catch (e) {
      console.error(e);
      window.alert('导出失败，请稍后再试');
    }
  }, [
    mapInstance,
    project,
    themeColor,
    mapStyleId,
    pinSize,
    imageSize,
    labelSize,
    clusterThreshold,
    showTextLabels,
    borderGeoJSON
  ]);

  return (
    <div
      id="map-view-container"
      ref={mapShellRef}
      className={`relative w-full h-full z-0 bg-gray-100 ${rootProps.className}`}
      style={rootProps.style}
      onDragEnter={rootProps.onDragEnter}
      onDragOver={rootProps.onDragOver}
      onDragLeave={rootProps.onDragLeave}
      onDrop={handleMapShellDrop}
      onDragEnd={rootProps.onDragEnd}
    >
      <MapContainer 
        key={project.id}
        center={initialMapPosition?.center || defaultCenter}
        zoom={initialMapPosition?.zoom ?? 16}
        maxZoom={MAP_MAX_ZOOM}
        zoomSnap={0}
        zoomDelta={0.5}
        // Keep the previous zoom level visible as a deliberately low-detail fallback.
        // Leaflet retains its parent/child tiles during this fade, then replaces them
        // one-by-one as the target zoom arrives — the same progressive pattern used by
        // mature map apps to avoid an empty canvas while zooming out.
        fadeAnimation
        scrollWheelZoom={false}
        touchZoom={false}
        crs={L.CRS.EPSG3857}
        style={{
          height: '100%',
          width: '100%',
          backgroundColor: effectiveMapStyle === 'blank' ? '#ffffff' : '#dddddd'
        }}
        zoomControl={false}
        ref={mapRefCallback}
        doubleClickZoom={false}
        boxZoom={false}
      >
        <MapAttributionPrefix />
        <MapCanvasBackground color={effectiveMapStyle === 'blank' ? '#ffffff' : '#dddddd'} />
        <MapSmoothZoom
          sensitivity={1.5}
          trackpadPinchSensitivity={0.004}
          // Touch-first devices use Leaflet's native pinch handler; wheel zoom
          // keeps its existing quicker, inertial desktop behaviour.
          touchSensitivity={1}
          inertia
          touchInertia={false}
        />
        <MapWorldMinZoom />
        <MapNavigationHandler coords={navigateToCoords} onComplete={onNavigateComplete} />
        <MapPositionTracker onPositionChange={handleMapPositionChange} />
        <MapClickHandler onClick={handleMapClickInternal} />
        <MapUnplacedNoteDropHandler
          enabled={isUIVisible && isMapToolbarEditMode && unplacedMapNotes.length > 0}
          onDropNotes={placeUnlocatedNotes}
        />
        {isUIVisible && (
          <MapShiftBoxSelect
            enabled={isUIVisible}
            notes={mapMarkerNotes}
            noteCoordOverrides={noteCoordOverrides}
            onBoxCommit={handleMapBoxSelectCommit}
            onInteractionClaimed={handleMapShiftBoxSelectClaimed}
            themeColor={themeColor}
          />
        )}
        {effectiveMapStyle !== 'blank' && (
          <MapTileDirectionalPrefetch
            url={tileLayerConfig.url}
            maxZoom={tileLayerConfig.maxZoom}
            maxNativeZoom={tileLayerConfig.maxNativeZoom}
          />
        )}
        {effectiveMapStyle !== 'blank' ? (
          <MapCrossfadeTileLayer
            styleId={effectiveMapStyle}
            {...tileLayerConfig}
            updateWhenIdle={isTouchFirstInput}
            keepBuffer={mapTileKeepBuffer}
          />
        ) : null}
        
        <MapLongPressHandler
          onLongPress={handleLongPress}
          onLongPressRelease={handleLongPressRelease}
          onLongPressCancel={handleLongPressCancel}
          isPreviewMode={!isUIVisible}
        />

        {pendingPlaceNote && (
          <Marker
            position={[pendingPlaceNote.lat, pendingPlaceNote.lng]}
            icon={L.divIcon({
              className: 'custom-pending-marker',
              html: `
                <div class="flex flex-col items-center">
                  <div style="
                    background-color: white;
                    padding: 6px 12px;
                    border-radius: 12px;
                    box-shadow: 0 4px 15px rgba(0,0,0,0.15);
                    border: 2px solid ${themeColor};
                    white-space: nowrap;
                    font-size: 14px;
                    font-weight: 600;
                    color: #1f2937;
                    cursor: pointer;
                    animation: bounce-in 0.3s ease-out;
                  ">
                    ${pendingPlaceNote.name}
                  </div>
                  <div style="
                    width: 0;
                    height: 0;
                    border-left: 6px solid transparent;
                    border-right: 6px solid transparent;
                    border-top: 6px solid ${themeColor};
                  "></div>
                </div>
                <style>
                  @keyframes bounce-in {
                    0% { transform: scale(0.3); opacity: 0; }
                    70% { transform: scale(1.05); opacity: 1; }
                    100% { transform: scale(1); }
                  }
                </style>
              `,
              iconSize: [120, 40],
              iconAnchor: [60, 40]
            })}
            eventHandlers={{
              click: (e) => {
                L.DomEvent.stopPropagation(e);
                handleConvertPendingToNote();
              }
            }}
          />
        )}

        {borderGeoJSON && (
          <GeoJSON 
            data={borderGeoJSON} 
            style={{ 
              color: themeColor, 
              weight: 3, 
              opacity: 0.8,
              fill: false,
              fillOpacity: 0,
              dashArray: '5, 10'
            }} 
          />
        )}
        
        <MapCenterHandler 
          center={initialMapPosition?.center || defaultCenter}
          zoom={initialMapPosition?.zoom ?? 16}
          allowLateCenterUpdate={lateAutoCenter != null}
          lateCenter={lateAutoCenter}
          lateZoom={16}
        />
        
        <TextLabelsLayer
          notes={mapMarkerNotes}
          showTextLabels={showTextLabels}
          pinSize={pinSize}
          labelSize={labelSize}
          themeColor={themeColor}
          clusteredMarkers={clusteredMarkers}
          selectedNoteId={selectedNoteId}
          selectedNoteIds={selectedNoteIds}
          preSelectedNotes={preSelectedNotes}
          isPreviewMode={!isUIVisible}
          connectionHighlightNoteIds={connectionHighlightNoteIds}
          hoveredNoteId={hoveredNoteId}
          noteCoordOverrides={noteCoordOverrides}
          mapUiChromeOpacity={mapUiChromeOpacity}
          mapUiChromeBlurPx={mapUiChromeBlurPx}
          chromeAppearance={mapChromeTone}
          onLabelDoubleClickEdit={
            isUIVisible && isMapToolbarEditMode ? handleEditNoteFromLabel : undefined
          }
          onSelectedLabelClick={
            isUIVisible && !isMapToolbarEditMode ? handleEditNoteFromLabel : undefined
          }
          onSelectNote={(noteId) => {
            if (
              !isMapToolbarEditMode &&
              selectedNoteId === noteId &&
              selectedNoteIds.size === 1 &&
              selectedNoteIds.has(noteId) &&
              preSelectedNotes == null
            ) {
              handleEditNoteFromLabel(noteId);
              return;
            }
            closePanelsForPreview();
            setSelectedNoteIds(new Set([noteId]));
            setSelectedNoteId(noteId);
          }}
          onClearSelection={() => {
            setPreSelectedNotes(null);
            setSelectedNoteId(null);
            setSelectedNoteIds(new Set());
            setConnectionHighlightNoteIds(null);
          }}
        />

        {/* 选中点连线：Leaflet 图层（与 pin 同 zoomanim），pane 低于节点 label */}
        <MapConnectionLinesOverlay
          selectedNoteId={selectedNoteId}
          selectedNoteIds={selectedNoteIds}
          connections={connections}
          notes={notes}
          themeColor={themeColor}
          noteCoordOverrides={noteCoordOverrides}
          pinSize={pinSize}
          labelSize={labelSize}
        />

        {/* User Location Indicator - visual only; must not block long-press / map gestures */}
        {hasLocationPermission && currentLocation && mapInstance && (
          <Marker
            position={[currentLocation.lat, currentLocation.lng]}
            interactive={false}
            keyboard={false}
            icon={L.divIcon({
              className: 'user-location-marker',
              html: `<div style="
                position: relative;
                width: 48px;
                height: 48px;
              ">
                <!-- Semi-transparent direction sector (48px radius, 60 degrees) -->
                <div style="
                  position: absolute;
                  top: 0;
                  left: 0;
                  width: 48px;
                  height: 48px;
                  border-radius: 50%;
                  background: conic-gradient(
                    from -30deg,
                    transparent 0deg,
                    rgba(${hexToRgb(themeColor)}, 0.3) 0deg,
                    rgba(${hexToRgb(themeColor)}, 0.3) 60deg,
                    transparent 60deg
                  );
                  transform: rotate(${deviceHeading || 0}deg);
                  transition: transform 0.15s ease-out;
                "></div>

                <!-- Center dot (12px radius) -->
                <div style="
                  position: absolute;
                  top: 18px;
                  left: 18px;
                  width: 12px;
                  height: 12px;
                  background-color: ${themeColor};
                  border: 2px solid white;
                  border-radius: 50%;
                  box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                "></div>
              </div>`,
              iconSize: [48, 48],
              iconAnchor: [24, 24]
            })}
            zIndexOffset={1000}
          />
        )}

        <MapLocationEnableBanner
          // `unknown` / `prompt` 时不抢在浏览器原生权限框前弹应用内窗口；
          // 用户点定位、新建或拍照时会直接触发浏览器授权。仅明确拒绝或不安全环境才提示原因。
          visible={(permissionStatus === 'denied' || !isSecureContext) && !locationEnableDismissed && !locationError}
          isRequesting={isRequestingLocation || locatingActive}
          insecureContext={!isSecureContext}
          themeColor={themeColor}
          chromeSurfaceStyle={mapChromeContentSurface}
          chromeAppearance={mapChromeTone}
          onEnable={handleEnableLocation}
          onDismiss={() => setLocationEnableDismissed(true)}
        />

        <MapLocationErrorBanner
          locationError={locationError}
          isLocating={locatingActive || isRequestingLocation}
          themeColor={themeColor}
          chromeSurfaceStyle={mapChromeContentSurface}
          chromeAppearance={mapChromeTone}
          onRetry={handleEnableLocation}
          onClose={() => {
            setLocationError(null);
            setIsLocating(false);
          }}
        />
        
        <ClusterMarkerLayer
          clusteredMarkers={clusteredMarkers}
          fallbackNotes={mapMarkerNotes}
          noteStackRank={mapNoteStackRank}
          showTextLabels={showTextLabels}
          pinSize={pinSize}
          imageSize={imageSize}
          themeColor={themeColor}
          mapInstance={mapInstance}
          onMarkerClick={handleMapMarkerClick}
          onClusterClick={handleClusterClick}
          onMarkerHover={(note) => setHoveredNoteId(note?.id ?? null)}
          noteCoordOverrides={noteCoordOverrides}
          selectedNoteId={selectedNoteId}
          selectedNoteIds={selectedNoteIds}
          isPreviewMode={!isUIVisible}
          isEditMode={isMapToolbarEditMode}
          canEditNote={canEditNote}
          onMarkerDragEnd={handleMarkerDragEnd}
          onMarkerDrag={handleMarkerDrag}
          onMarkerLongPressDragStart={handleMarkerLongPressDragStart}
          onMarkerLongPressDrag={handleMarkerLongPressDrag}
          onMarkerLongPressDragEnd={handleMarkerLongPressDragEnd}
          deletingNoteIds={deletingNoteIds}
          noteMotionById={noteMotionById}
        />

        {isUIVisible && (
          <div
            data-allow-context-menu
            data-mapp-chrome-ui=""
            className={`fixed top-2 z-[var(--z-map-toolbar)] flex flex-col items-start gap-2 pointer-events-none sm:top-4 sm:gap-3 ui-workspace-left ${
              toolbarSlotKind ? 'map-toolbar--sheet-open' : ''
            }`}
          >
              <div
                  ref={mapToolbarRef}
                  className="flex justify-between items-center w-full pointer-events-none gap-2"
              >
                <div
                  className="flex flex-row flex-nowrap gap-1.5 sm:gap-2 pointer-events-auto items-center min-h-10 sm:min-h-12"
                  onPointerDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                >
                  <MapControls
                    onLocateCurrentPosition={handleLocateCurrentPosition}
                    isLocating={locatingActive}
                    mapNotes={mapRenderedNotes}
                    themeColor={themeColor}
                    chromeSurfaceStyle={mapChromeControlSurface}
                    menuChromeSurfaceStyle={mapChromeContentSurface}
                    menuChromeAppearance={mapChromeTone}
                    chromeHoverBackground={mapChromeHoverBg}
                    settingsOpen={showSettingsPanel}
                    settingsButtonRef={settingsButtonRef}
                    onOpenSettings={handleToggleSettings}
                    onCreateAtCurrentLocation={handleCreateAtCurrentLocation}
                    onImportFromPhotos={handleImportFromPhotos}
                    onImportFromCamera={handleImportFromCamera}
                    isCreatingAtLocation={isCreatingAtLocation}
                    showLocateMenu={showLocateMenu}
                    showCreateMenu={showCreateMenu}
                    onToggleLocateMenu={handleToggleLocateMenu}
                    onToggleCreateMenu={handleToggleCreateMenu}
                    onCloseMenus={handleCloseLocateAndCreateMenus}
                    hostedWindow
                    compactViewport={compactViewport}
                    compactUnplacedTrayOpen={isMapToolbarEditMode || isDragging}
                    hideCompactCreate={isMapToolbarEditMode}
                    allowPhotoImport={allowPhotoImport}
                  />
                  {showLayerControl ? <MapLayerControl
                    showPanel={showFrameLayerPanel}
                    onTogglePanel={handleToggleLayerPanel}
                    onClosePanel={handleCloseLayerPanel}
                    themeColor={themeColor}
                    chromeSurfaceStyle={mapChromeControlSurface}
                    menuChromeSurfaceStyle={mapChromeContentSurface}
                    menuChromeAppearance={mapChromeTone}
                    chromeHoverBackground={mapChromeHoverBg}
                    frames={project.frames}
                    frameLayerVisibility={frameLayerVisibility}
                    setFrameLayerVisibility={setFrameLayerVisibility}
                    showAllFrames={showAllFrames}
                    setShowAllFrames={setShowAllFrames}
                    frameLayerRef={frameLayerRef}
                    layerGroupStandard={graphLayerStandard}
                    hostedWindow
                    unifiedNotesLayerSlot={null}
                  /> : null}
                </div>
                <div
                  className="fixed right-2 top-2 z-[var(--z-map-toolbar)] flex h-10 shrink-0 items-center gap-1.5 pointer-events-auto sm:right-4 sm:top-4 sm:h-12 sm:gap-2"
                  onPointerDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                >
                  <MapSearchPanel
                    isOpen={!!showBorderPanel}
                    onToggle={handleToggleBorderPanel}
                    themeColor={themeColor}
                    chromeSurfaceStyle={mapChromeControlSurface}
                    menuChromeSurfaceStyle={mapChromeContentSurface}
                    menuChromeAppearance={mapChromeTone}
                    chromeHoverBackground={mapChromeHoverBg}
                    borderSearch={borderSearchState}
                    borderGeoJSON={borderGeoJSON}
                    onClearBorder={() => setBorderGeoJSON?.(null)}
                    onClose={() => setShowBorderPanel?.(false)}
                    hostedWindow
                  />
                  <MapTopRightEditToggle
                    isEditMode={isMapToolbarEditMode}
                    themeColor={themeColor}
                    chromeSurfaceStyle={mapChromeControlSurface}
                    chromeHoverBackground={mapChromeHoverBg}
                    onEnterEdit={() => onWorkspaceEditModeChange(true)}
                    onExitEdit={() => {
                      onWorkspaceEditModeChange(false);
                    }}
                  />
                </div>
              </div>

              <ChromeToolbarSlot
                kind={toolbarSlotKind}
                onClose={() => closeMapChromeExcept()}
                appearance={mapChromeTone}
                top={mapToolbarMenuTop}
                dismissIgnoreRefs={[mapToolbarRef]}
                resolve={(kind) => {
                  const menuStyle = mapChromeContentSurface;
                  if (kind === 'settings') {
                    return {
                      align: 'start' as const,
                      surface: 'window' as const,
                      backdropLabel: '关闭设置',
                      className: CHROME_TOOLBAR_WINDOW_CLASS,
                      style: menuStyle,
                      role: 'dialog',
                      'aria-label': '设置',
                      children: (
                        <SettingsPanel
                          shell={false}
                          isOpen={showSettingsPanel}
                          onClose={() => setShowSettingsPanel(false)}
                          anchorRef={settingsButtonRef}
                          settingsContextView="map"
                          themeColor={themeColor}
                          onThemeColorChange={(color) => {
                            onThemeColorChange?.(color);
                          }}
                          uiDarkMode={uiDarkMode}
                          onUiDarkModeChange={onUiDarkModeChange}
                          mapUiChromeOpacity={mapUiChromeOpacity}
                          onMapUiChromeOpacityChange={onMapUiChromeOpacityChange ?? (() => {})}
                          mapUiChromeOpacityBottom={mapUiChromeOpacityBottom}
                          onMapUiChromeOpacityBottomChange={onMapUiChromeOpacityBottomChange ?? (() => {})}
                          mapUiChromeBlurPx={mapUiChromeBlurPx}
                          onMapUiChromeBlurPxChange={onMapUiChromeBlurPxChange ?? (() => {})}
                          currentMapStyle={mapStyleId || 'carto-light-nolabels'}
                          onMapStyleChange={handleMapStyleChange}
                          pinSize={pinSize}
                          onPinSizeChange={setPinSize}
                          imageSize={imageSize}
                          onImageSizeChange={setImageSize}
                          clusterThreshold={clusterThreshold}
                          onClusterThresholdChange={setClusterThreshold}
                          labelSize={labelSize}
                          onLabelSizeChange={setLabelSize}
                          showTextLabels={showTextLabels}
                          onShowTextLabelsChange={setShowTextLabels}
                          onExportHtml={() => void exportStandaloneMapTab()}
                        />
                      )
                    };
                  }
                  if (kind === 'layer') {
                    return {
                      align: 'start' as const,
                      surface: 'window' as const,
                      backdropLabel: '关闭筛选',
                      className: CHROME_TOOLBAR_WINDOW_CLASS,
                      style: menuStyle,
                      role: 'dialog',
                      'aria-label': '筛选',
                      children: onUpdateProject ? (
                        <ProjectNotesLayerPanel
                          themeColor={themeColor}
                          panelChromeStyle={mapChromeContentSurface}
                          chromeAppearance={mapChromeTone}
                          variant="dock"
                          flow
                          hosted
                          dockAlign="start"
                          projectId={project.id}
                          merged={mergedMapProjectLayers}
                          layerGroupStandard={graphLayerStandard}
                          onLayerGroupStandardChange={handleMapLayerStandardChange}
                          onStateChange={handleMapGraphLayersChange}
                          notes={notes}
                          onUpdateNote={onUpdateNote}
                          onBatchUpdateNotes={handleMapBatchNotes}
                          frames={project.frames ?? []}
                          onUpdateFrame={onUpdateProject ? handleMapUpdateFrame : undefined}
                          onActivateNote={(note) => {
                            if (!mapInstance || !noteHasRenderableMapPosition(note)) return;
                            mapInstance.flyTo(
                              [note.coords.lat, note.coords.lng],
                              Math.max(mapInstance.getZoom(), 15),
                              { duration: 0.85 }
                            );
                          }}
                        />
                      ) : null
                    };
                  }
                  if (kind === 'search') {
                    return {
                      align: 'end' as const,
                      surface: 'window' as const,
                      backdropLabel: '关闭检索',
                      className: `${CHROME_TOOLBAR_WINDOW_CLASS} overflow-y-auto p-3`,
                      style: menuStyle,
                      role: 'dialog',
                      'aria-label': '检索',
                      children: (
                        <MapSearchPanelBody
                          themeColor={themeColor}
                          borderSearch={borderSearchState}
                          borderGeoJSON={borderGeoJSON}
                          onClearBorder={() => setBorderGeoJSON?.(null)}
                        />
                      )
                    };
                  }
                  return {
                    align: 'start' as const,
                    surface: 'menu' as const,
                    backdropLabel: '关闭操作菜单',
                    className: `w-52 ${menuStyle ? '' : 'bg-white'}`,
                    style: menuStyle,
                    children: (
                      <MapLocateCreateMenu
                        kind={kind === 'create' ? 'create' : 'locate'}
                        isLocating={locatingActive}
                        isCreatingAtLocation={isCreatingAtLocation}
                        chromeHoverBackground={mapChromeHoverBg}
                        onLocateCurrentPosition={handleLocateCurrentPosition}
                        onCreateAtCurrentLocation={handleCreateAtCurrentLocation}
                        onImportFromPhotos={handleImportFromPhotos}
                        onCloseMenus={handleCloseLocateAndCreateMenus}
                        mapNotes={mapRenderedNotes}
                      />
                    )
                  };
                }}
              />

              {/* 预览卡已迁入 ChromeNoteSlot */}
            </div>
        )}

        <div
          className="pointer-events-none absolute left-0 right-0 top-24 z-[400] flex justify-center"
          data-mapp-export-ui=""
        >
          <div className="relative">
            <div
              className={`animate-bounce whitespace-nowrap rounded-full border border-gray-100/80 px-4 py-2 text-sm shadow-lg map-chrome-content-${mapChromeTone}`}
              style={mapChromeControlSurface}
            >
              Long press anywhere to pin
            </div>
          </div>
        </div>

      </MapContainer>

      {!directMapPlacement ? <UnplacedNotesSidebar
        open={
          isUIVisible &&
          (isMapToolbarEditMode || isDragging)
        }
        notes={unplacedMapNotesWithMedia}
        themeColor={themeColor}
        chromeSurfaceStyle={mapChromeContentSurface}
        panelRef={unplacedSidebarRef}
        isDropTarget={isUnplacedSidebarDropTarget}
        dropCount={unplacedSidebarDropCount}
        isDark={mapChromeTone === 'dark'}
        placementDragMime="application/x-mapp-unplaced-note"
        onDeleteSelected={deleteUnplacedMapNotes}
        onDropFiles={(files) => {
          dismissDrag();
          const items = Array.from(files);
          const imageFiles = items.filter((file) =>
            file.type.startsWith('image/') || /\.(heic|heif|jpe?g|png|webp|gif|avif|tiff?)$/i.test(file.name)
          );
          if (imageFiles.length) {
            handleImageImport(imageFiles, { target: { kind: 'unplaced' } });
            return;
          }
          const dataFile = items.find((file) => file.type === 'application/json' || file.name.endsWith('.json'));
          const csvFile = items.find((file) => file.type === 'text/csv' || file.name.toLowerCase().endsWith('.csv'));
          if (dataFile) handleDataImport(dataFile);
          else if (csvFile) handleCsvImport(csvFile);
        }}
      /> : null}

      {showMapConnectionPanel && onUpdateConnections && isUIVisible && (
        <GraphConnectionPanel
          isOpen
          themeColor={themeColor}
          panelChromeStyle={mapChromeSurface}
          notes={notes}
          draft={mapConnectionDraft}
          onDraftChange={(patch) => setMapConnectionDraft((d) => ({ ...d, ...patch }))}
          panelEditingKey={mapConnPanelEditingKey}
          pickTarget={mapConnPickTarget}
          onPickTargetChange={setMapConnPickTarget}
          onCommit={commitMapConnectionDraft}
          onDelete={handleDeleteMapConnectionByPanel}
          onNewConnection={handleNewMapConnectionEmpty}
          onBeginEndpointEdit={handleNewMapConnectionEmpty}
          disableGraphPick
          graphPickDisabledHint="请用检索或列表选择起终点便签"
          onClearGraphAndDraftSelection={clearMapConnectionPanelDraft}
          onClearFromSelection={clearMapConnectionFromOnly}
          onClearToSelection={clearMapConnectionToOnly}
          showClearSelection={
            !!mapConnPickTarget || !!mapConnectionDraft.fromNoteId || !!mapConnectionDraft.toNoteId
          }
          onClose={() => {
            setShowMapConnectionPanel(false);
            setMapConnPickTarget(null);
          }}
        />
      )}

      {/* 预览模式：顶栏仅保留搜索、图层与导出（与正常模式顶栏分离） */}
      {!isUIVisible && (
        <MapPreviewTopRightToolbar
          showBorderPanel={!!showBorderPanel}
          onToggleBorderPanel={handleToggleBorderPanel}
          themeColor={themeColor}
          chromeSurfaceStyle={mapChromeControlSurface}
          menuChromeSurfaceStyle={mapChromeContentSurface}
          menuChromeAppearance={mapChromeTone}
          chromeHoverBackground={mapChromeHoverBg}
          borderSearch={borderSearchState}
          borderGeoJSON={borderGeoJSON}
          onClearBorder={() => setBorderGeoJSON?.(null)}
          onCloseBorderPanel={() => setShowBorderPanel?.(false)}
          onExportStandaloneTab={() => void exportStandaloneMapTab()}
        />
      )}
      
      {isUIVisible ? (
        <MapNoteSlot
          kind={mapNoteKind}
          onClose={closeMapNoteSlot}
          appearance={mapChromeTone}
          motionAnchor={noteEditorAnimationAnchor}
          toolbarRef={mapToolbarRef}
          markerPaneRef={mapMarkerPaneDismissIgnoreRef}
          compactViewport={compactViewport}
          contentSurfaceStyle={mapChromeContentSurface}
          menuTop={mapToolbarMenuTop}
          saveDraftRef={mapNoteSaveRef}
          onDiscard={() => closeEditorAndDismissNoteSlot('discarded')}
          onSaveClose={() => closeEditorAndDismissNoteSlot('saved')}
          onSave={handleSaveNote}
          onDelete={handleDeleteNoteWithExit}
          editingNote={editingNote}
          notes={notes}
          autoOpenCamera={editorAutoOpenCamera}
          onSwitchToBoardView={onSwitchToBoardView}
          mapInstance={mapInstance}
          themeColor={themeColor}
          mapUiChromeOpacity={mapUiChromeOpacity}
          mapUiChromeBlurPx={mapUiChromeBlurPx}
          selectedNote={stickySelectedNote}
          currentImageIndex={currentPreviewImageIndex}
          onImageIndexChange={setCurrentPreviewImageIndex}
          canModifyNote={canModifyNote}
          onOpenSelectedNote={handleEditNoteFromLabel}
          isEditMode={isMapToolbarEditMode}
        />
      ) : null}

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
        panelChromeStyle={mapChromeContentSurface}
        onCancel={() => setPendingKeyboardDeleteIds(null)}
        onConfirm={() => {
          const ids = pendingKeyboardDeleteIds ?? [];
          setPendingKeyboardDeleteIds(null);
          void Promise.all(ids.map((id) => handleDeleteNoteWithExit(id)));
        }}
      />

      {/* Tab 预览没有左上按钮组，继续使用独立 fixed 详情卡。 */}
      {!isUIVisible && (hoveredNote ?? selectedNote) && (
        <NotePreviewCard
          note={(hoveredNote ?? selectedNote)!}
          currentImageIndex={currentPreviewImageIndex}
          onImageIndexChange={setCurrentPreviewImageIndex}
          chromeSurfaceStyle={mapChromeContentSurface}
          chromeAppearance={mapChromeTone}
        />
      )}

      {/* 隐藏的文件输入 */}
      <input
        ref={(el) => {
          (fileInputRef as React.MutableRefObject<HTMLInputElement | null>).current = el;
          if (externalFileInputRef) (externalFileInputRef as React.MutableRefObject<HTMLInputElement | null>).current = el;
        }}
        type="file"
        accept="image/*,.heic,.heif"
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
          if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const isCsv =
              file.type === 'text/csv' ||
              file.name.toLowerCase().endsWith('.csv');
            if (isCsv) {
              handleCsvImport(file);
            } else {
              handleDataImport(file);
            }
            e.target.value = '';
          }
        }}
      />

      {photoImportNotice ? (
        <div
          role="status"
          className="fixed bottom-20 left-1/2 z-[2500] w-[min(calc(100vw-2rem),25rem)] -translate-x-1/2 rounded-xl border border-white/60 px-4 py-3 text-center text-sm font-medium text-gray-800 shadow-lg"
          style={mapChromeContentSurface}
        >
          {photoImportNotice}
        </div>
      ) : null}

      {/* Settings hosted by ChromeToolbarSlot */}

      <MapImportMenuModal
        open={!!showImportMenu}
        chromeSurfaceStyle={mapChromeContentSurface}
        chromeAppearance={mapChromeTone}
        chromeHoverBackground={mapChromeHoverBg}
        onClose={() => setShowImportMenu?.(false)}
        onImportPhotos={() => fileInputRef.current?.click()}
        onImportData={() => dataImportInputRef.current?.click()}
        onImportCamera={handleImportFromCamera}
      />
    </div>
  );
};
