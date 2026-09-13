import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, GeoJSON, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { set } from 'idb-keyval';

import { Note, Coordinates, Project, Frame, Connection, type GraphLayerState } from '../types';
import { mergeGraphLayerState, type GraphLayerGroupStandard } from '../utils/graph/graphRuntimeCore';
import {
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
import { useCameraImport } from '@/components/hooks/useCameraImport';
import { useBorderSearch } from '@/components/hooks/useBorderSearch';
import { useMapClustering } from '@/components/hooks/useMapClustering';
import { useMapInitialization } from '@/components/hooks/useMapInitialization';
import { useNotePositioning } from '@/components/hooks/useNotePositioning';
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
import { MapControls } from './map/MapControls';
import {
  PENDING_MAP_LOCATE_EVENT,
  applyReadyMapLocate,
  beginPendingMapLocate,
  cancelPendingMapLocate,
  completePendingMapLocate,
  getPendingMapLocate,
  peekReadyMapLocate
} from '../utils/map/pendingMapLocate';
import { MapSearchPanel } from './map/controls/MapSearchPanel';
import { MapLayerControl } from './map/controls/MapLayerControl';
import { NotePreviewCard } from './map/overlays/NotePreviewCard';
import { MapLocationErrorBanner } from './map/overlays/MapLocationErrorBanner';
import { MapImportMenuModal } from './map/overlays/MapImportMenuModal';
import { MapTopRightEditToggle } from './map/overlays/MapTopRightEditToggle';
import { MapPreviewTopRightToolbar } from './map/overlays/MapPreviewTopRightToolbar';
import { type EditInspectorPanelProps, type InspectorGroupContext } from './map/overlays/MapEditInspectorPanel';
import { useRegisterEditInspector } from './editInspector/EditInspectorProvider';
import { GraphConnectionPanel } from './graph/GraphConnectionPanel';
import { useSimpleConnectionPanel } from './hooks/useSimpleConnectionPanel';
import { ClusterMarkerLayer } from './map/layers/ClusterMarkerLayer';
import { NoteMarker } from './map/markers/NoteMarker';
import { MapClickHandler } from './map/MapClickHandler';
import { MapShiftBoxSelect } from './map/MapShiftBoxSelect';
import { MapConnectionLinesOverlay } from './map/MapConnectionLinesOverlay';
import { SettingsPanel } from './SettingsPanel';
import { ChromeIconButton } from './ui/ChromeIconButton';
import { parseNoteContent } from '../utils';
import exifr from 'exifr';
import { NoteEditor } from './NoteEditor';
import { generateId } from '../utils';
import { hexToRgb, isPhotoTakenRecently } from '../utils/map/mapUtils';
import { calculateImageFingerprint, calculateFingerprintFromBase64 } from '../utils/media/imageProcessing';
import { loadImage, getViewPositionCache, setViewPositionCache } from '../utils/persistence/storage';
import { useNotesWithResolvedMedia } from '../utils/persistence/useNotesWithResolvedMedia';
import { ImportPreviewDialog } from './ImportPreviewDialog';
import { buildMapTabExportPayload } from '../utils/map/mapTabExportPayload';
import { buildStandaloneMapTabHtml } from '../utils/map/mapTabExportHtml';
import { downloadTextFile } from '../utils/graph/graphExportHtml';
import {
  mapChromeSurfaceStyle,
  mapChromeControlStyle,
  mapChromeControlHoverBackground,
  mapChromeContentStyle,
  mapChromeAppearance,
  DEFAULT_MAP_UI_CHROME_OPACITY,
  DEFAULT_MAP_UI_CHROME_BLUR_PX
} from '../utils/map/mapChromeStyle';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

/** Keep required basemap credits while removing Leaflet's non-essential UI prefix. */
const MapAttributionPrefix: React.FC = () => {
  const map = useMap();

  useEffect(() => {
    map.attributionControl?.setPrefix(false);
  }, [map]);

  return null;
};

/**
 * A permanent, two-levels-lower tile layer beneath the real basemap.
 *
 * Leaflet already keeps tiles from the previous viewport during a zoom. This
 * layer covers the complementary case: when zooming out reveals land that was
 * never in the old viewport. It needs roughly one quarter as many requests as
 * the target zoom, so it arrives quickly as a pixelated but complete backdrop.
 */
const MapTileZoomFallback: React.FC<{
  url: string;
  maxZoom: number;
  maxNativeZoom?: number;
}> = ({ url, maxZoom, maxNativeZoom }) => {
  const map = useMap();
  const activeLayerRef = useRef<L.TileLayer | null>(null);
  const pendingLayerRef = useRef<L.TileLayer | null>(null);

  useEffect(() => {
    const sourceMaxZoom = maxNativeZoom ?? maxZoom;
    const fallbackZoomForCurrentView = () =>
      Math.min(
        sourceMaxZoom,
        Math.max(Math.ceil(map.getMinZoom()), Math.floor(map.getZoom()) - 2)
      );
    const createFallbackLayer = (fallbackZoom: number) =>
      L.tileLayer(url, {
        attribution: '',
        // The normal TileLayer renders at z-index 1; this one is intentionally
        // below it and remains visible only where high-detail tiles are absent.
        zIndex: 0,
        maxZoom,
        minNativeZoom: fallbackZoom,
        maxNativeZoom: fallbackZoom,
        updateWhenZooming: false,
        updateWhenIdle: true,
        keepBuffer: 2
      });

    const initialLayer = createFallbackLayer(fallbackZoomForCurrentView());
    activeLayerRef.current = initialLayer;
    initialLayer.addTo(map);

    const rebaseFallbackLayer = () => {
      const activeLayer = activeLayerRef.current;
      if (!activeLayer) return;
      const fallbackZoom = fallbackZoomForCurrentView();
      const activeZoom = activeLayer.options.maxNativeZoom;
      if (activeZoom === fallbackZoom || Math.abs((activeZoom ?? fallbackZoom) - fallbackZoom) < 2) return;

      const pendingLayer = pendingLayerRef.current;
      if (pendingLayer?.options.maxNativeZoom === fallbackZoom) return;
      pendingLayer?.remove();

      // 绝不对现有层 redraw：它会先清空已显示瓦片。新层叠在旧层之上，
      // 只有自身完整可用后才接管，再移除旧层，避免闪出纯底色。
      const nextLayer = createFallbackLayer(fallbackZoom);
      pendingLayerRef.current = nextLayer;
      nextLayer.once('load', () => {
        if (pendingLayerRef.current !== nextLayer) return;
        pendingLayerRef.current = null;
        const previousLayer = activeLayerRef.current;
        activeLayerRef.current = nextLayer;
        previousLayer?.remove();
      });
      nextLayer.addTo(map);
    };

    // Keep the parent grid stable throughout a gesture. Replacing it at every
    // integer zoom would briefly clear precisely the fallback we need. Once
    // the gesture has settled, rebase it in the background for the next move.
    let rebaseTimer: ReturnType<typeof setTimeout> | null = null;
    const cancelRebase = () => {
      if (!rebaseTimer) return;
      clearTimeout(rebaseTimer);
      rebaseTimer = null;
    };
    const scheduleRebase = () => {
      cancelRebase();
      rebaseTimer = setTimeout(() => {
        rebaseTimer = null;
        if (map._mappSmoothZooming) {
          scheduleRebase();
          return;
        }
        rebaseFallbackLayer();
        // 高精度层会在 zoomend 立刻请求；稍作让位后便补齐低清底图，
        // 避免此前 900ms 的人为等待让缩小后的新区域长时间没有可用画面。
      }, 180);
    };
    map.on('zoomstart', cancelRebase);
    map.on('zoomend', scheduleRebase);

    return () => {
      cancelRebase();
      map.off('zoomstart', cancelRebase);
      map.off('zoomend', scheduleRebase);
      activeLayerRef.current?.remove();
      pendingLayerRef.current?.remove();
      activeLayerRef.current = null;
      pendingLayerRef.current = null;
    };
  }, [map, url, maxNativeZoom, maxZoom]);

  return null;
};

/**
 * 一次平移结束后，低优先级预取移动方向前方的一列低清瓦片。
 * 不在拖动中发请求，且在省流量或低速网络时自动关闭，避免影响当前视口。
 */
const MapTileDirectionalPrefetch: React.FC<{
  url: string;
  maxZoom: number;
  maxNativeZoom?: number;
}> = ({ url, maxZoom, maxNativeZoom }) => {
  const map = useMap();
  const previousCenterRef = useRef<L.LatLng | null>(null);
  const prefetchedAtRef = useRef(new Map<string, number>());
  const pendingImagesRef = useRef(new Map<string, HTMLImageElement>());

  useEffect(() => {
    const connection = (navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }).connection;
    if (connection?.saveData || connection?.effectiveType === 'slow-2g' || connection?.effectiveType === '2g') {
      return;
    }

    const tileUrlFor = (x: number, y: number, z: number) => {
      const subdomains = 'abc';
      const s = subdomains[Math.abs((x + y) % subdomains.length)];
      return L.Util.template(url, { x, y, z, s, r: '' });
    };
    const prunePrefetches = (now: number) => {
      for (const [tileUrl, startedAt] of prefetchedAtRef.current) {
        if (now - startedAt > 10 * 60 * 1000) prefetchedAtRef.current.delete(tileUrl);
      }
    };

    let prefetchTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleDirectionalPrefetch = () => {
      if (prefetchTimer) clearTimeout(prefetchTimer);
      prefetchTimer = setTimeout(() => {
        prefetchTimer = null;
        const center = map.getCenter();
        const previousCenter = previousCenterRef.current;
        previousCenterRef.current = center;
        if (!previousCenter) return;

        const targetZoom = Math.max(
          map.getMinZoom(),
          Math.min(maxNativeZoom ?? maxZoom, Math.floor(map.getZoom()) - 2)
        );
        const current = map.project(center, targetZoom);
        const previous = map.project(previousCenter, targetZoom);
        const dx = current.x - previous.x;
        const dy = current.y - previous.y;
        // 缩放但没有明显平移时，交给低清回退层处理，避免无方向预取。
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 32) return;

        const bounds = map.getBounds();
        const northWest = map.project(bounds.getNorthWest(), targetZoom).divideBy(256).floor();
        const southEast = map.project(bounds.getSouthEast(), targetZoom).divideBy(256).floor();
        const xDirection = Math.abs(dx) >= Math.abs(dy) ? Math.sign(dx) : 0;
        const yDirection = Math.abs(dy) > Math.abs(dx) ? Math.sign(dy) : 0;
        const candidates: Array<[number, number]> = [];

        if (xDirection !== 0) {
          const x = xDirection > 0 ? southEast.x + 1 : northWest.x - 1;
          for (let y = northWest.y; y <= southEast.y; y += 1) candidates.push([x, y]);
        } else if (yDirection !== 0) {
          const y = yDirection > 0 ? southEast.y + 1 : northWest.y - 1;
          for (let x = northWest.x; x <= southEast.x; x += 1) candidates.push([x, y]);
        }

        const worldTiles = 2 ** targetZoom;
        const now = Date.now();
        prunePrefetches(now);
        // 低清层的一列通常只需 2–4 张；超宽屏也保持这个上限。
        candidates.slice(0, 4).forEach(([rawX, y]) => {
          if (y < 0 || y >= worldTiles) return;
          const x = ((rawX % worldTiles) + worldTiles) % worldTiles;
          const tileUrl = tileUrlFor(x, y, targetZoom);
          if (prefetchedAtRef.current.has(tileUrl) || pendingImagesRef.current.has(tileUrl)) return;

          const image = new Image();
          image.decoding = 'async';
          image.fetchPriority = 'low';
          const complete = () => pendingImagesRef.current.delete(tileUrl);
          image.onload = complete;
          image.onerror = complete;
          pendingImagesRef.current.set(tileUrl, image);
          prefetchedAtRef.current.set(tileUrl, now);
          image.src = tileUrl;
        });
      }, 500);
    };

    previousCenterRef.current = map.getCenter();
    map.on('moveend', scheduleDirectionalPrefetch);
    return () => {
      if (prefetchTimer) clearTimeout(prefetchTimer);
      map.off('moveend', scheduleDirectionalPrefetch);
      pendingImagesRef.current.forEach((image) => {
        image.onload = null;
        image.onerror = null;
        image.src = '';
      });
      pendingImagesRef.current.clear();
    };
  }, [map, maxNativeZoom, maxZoom, url]);

  return null;
};

/** 空项目自动定位按项目只发起一次，切视图卸载 MapView 后不重跑。 */
const emptyProjectLocateStarted = new Set<string>();
const MAP_NOTE_INTRO_MS = 560;
const MAP_NOTE_INTRO_DISMISS_DELAY_MS = 560;
const MAP_NOTE_EXIT_MS = 220;

interface MapViewProps {
  project: Project;
  onAddNote: (note: Note) => void;
  onUpdateNote: (note: Note) => void;
  onDeleteNote?: (noteId: string) => void;
  onToggleEditor: (isOpen: boolean) => void;
  onImportDialogChange?: (isOpen: boolean) => void;
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
  mapUiChromeOpacity?: number;
  mapUiChromeBlurPx?: number;
  onMapUiChromeOpacityChange?: (opacity: number) => void;
  onMapUiChromeBlurPxChange?: (blurPx: number) => void;
  isRouteMode?: boolean;
  setIsRouteMode?: (v: boolean) => void;
  waypoints?: Note[];
  setWaypoints?: (w: Note[]) => void;
  /** 与 App 中「界面外观」一致的面板玻璃样式（设置、编辑器等） */
  panelChromeStyle?: React.CSSProperties;
  /** 编辑地图关联边（大屏属性面板） */
  onUpdateConnections?: (connections: Connection[]) => void | Promise<void>;
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
  onImportDialogChange,
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
  mapUiChromeOpacity = DEFAULT_MAP_UI_CHROME_OPACITY,
  mapUiChromeBlurPx = DEFAULT_MAP_UI_CHROME_BLUR_PX,
  onMapUiChromeOpacityChange,
  onMapUiChromeBlurPxChange,
  isRouteMode: _isRouteMode,
  setIsRouteMode: _setIsRouteMode,
  waypoints: _waypoints,
  setWaypoints: _setWaypoints,
  panelChromeStyle: panelChromeStyleProp
}) => {
  // 触摸设备在拖动时只在停下后补瓦片，避免请求队列反过来拖慢手势；
  // 鼠标设备则沿用 Leaflet 的实时补图路径，横向平移不会等到松手才开始加载。
  const [isTouchFirstInput] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
  );
  if (!project) return null;
  const notes = project.notes;
  const connections = project.connections || [];
  const mapChromeSurface =
    panelChromeStyleProp ?? mapChromeSurfaceStyle(mapUiChromeOpacity, mapUiChromeBlurPx);
  // 图标控件可随深/浅底图切换前景；文字密集的面板仍复用 mapChromeSurface。
  const mapChromeControlSurface = mapChromeControlStyle(
    mapUiChromeOpacity,
    mapUiChromeBlurPx,
    mapStyleId
  );
  const mapChromeContentSurface = mapChromeContentStyle(
    mapUiChromeOpacity,
    mapUiChromeBlurPx,
    mapStyleId
  );
  const mapChromeTone = mapChromeAppearance(mapStyleId);
  const mapChromeHoverBg = mapChromeControlHoverBackground(mapUiChromeOpacity, mapStyleId);
  const [editingNote, setEditingNote] = useState<Partial<Note> | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [introNote, setIntroNote] = useState<Partial<Note> | null>(null);
  const [introNoteMotion, setIntroNoteMotion] = useState<'enter' | 'exit'>('enter');
  const [deletingNoteIds, setDeletingNoteIds] = useState<Set<string>>(() => new Set());
  const introTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const introDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const introExitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const introStartedAtRef = useRef(0);
  const longPressPreviewNoteRef = useRef<Partial<Note> | null>(null);
  const deletingNoteIdsRef = useRef(new Set<string>());
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(() => new Set());
  const [preSelectedNotes, setPreSelectedNotes] = useState<Note[] | null>(null);
  const [currentPreviewImageIndex, setCurrentPreviewImageIndex] = useState(0);
  const selectionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [connectionHighlightNoteIds, setConnectionHighlightNoteIds] = useState<string[] | null>(null);
  const [hoveredNoteId, setHoveredNoteId] = useState<string | null>(null);
  // 拖拽时的乐观坐标覆盖：避免聚类重算延迟导致 marker 被 React 用旧 position 回弹
  const [noteCoordOverrides, setNoteCoordOverrides] = useState<Record<string, Coordinates>>({});
  const isMarkerDraggingRef = useRef(false);
  const ignoreNextMarkerClickRef = useRef(false);
  const ignoreNextMapClickRef = useRef(false);

  useEffect(
    () => () => {
      if (introTimerRef.current) clearTimeout(introTimerRef.current);
      if (introDismissTimerRef.current) clearTimeout(introDismissTimerRef.current);
      if (introExitTimerRef.current) clearTimeout(introExitTimerRef.current);
      longPressPreviewNoteRef.current = null;
    },
    []
  );

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

  const inspectorGroupContext = useMemo((): InspectorGroupContext | null => {
    if (preSelectedNotes && preSelectedNotes.length > 0) {
      const members = preSelectedNotes;
      const geo = members.filter((n) => noteHasRenderableMapPosition(n));
      let lat = 0;
      let lng = 0;
      geo.forEach((n) => {
        lat += n.coords.lat;
        lng += n.coords.lng;
      });
      const centroidMap =
        geo.length > 0 ? { lat: lat / geo.length, lng: lng / geo.length } : undefined;
      return {
        kind: 'cluster',
        title: `簇 · ${members.length} 点`,
        members,
        centroidMap
      };
    }
    if (selectedNoteIds.size > 1) {
      const members = notes.filter((n) => selectedNoteIds.has(n.id));
      const firstG = members[0]?.noteGroupId;
      const isObjectGroup =
        !!firstG && members.length > 0 && members.every((m) => m.noteGroupId === firstG);
      const geo = members.filter((n) => noteHasRenderableMapPosition(n));
      let lat = 0;
      let lng = 0;
      geo.forEach((n) => {
        lat += n.coords.lat;
        lng += n.coords.lng;
      });
      const centroidMap =
        geo.length > 0 ? { lat: lat / geo.length, lng: lng / geo.length } : undefined;
      return {
        kind: 'multi',
        title: isObjectGroup ? `对象组 · ${members.length} 个` : `多选 · ${members.length} 个`,
        members,
        centroidMap
      };
    }
    return null;
  }, [preSelectedNotes, selectedNoteIds, notes]);

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
  }, [selectedNoteIds, selectedNoteId, connections]);

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
  const navigateToCoordsRef = useRef(navigateToCoords);
  navigateToCoordsRef.current = navigateToCoords;
  const mapViewMountedRef = useRef(true);
  const mapShellRef = useRef<HTMLDivElement | null>(null);

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
  // Label size control (independent)
  const [labelSize, setLabelSize] = useState(1.0);

  // Cluster threshold control
  const [clusterThreshold, setClusterThreshold] = useState(40); // Distance threshold for clustering

  // Settings panel
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const [showLocateMenu, setShowLocateMenu] = useState(false);
  const [showCreateMenu, setShowCreateMenu] = useState(false);

  // Location error retry tracking
  const [hasRetriedLocation, setHasRetriedLocation] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [locateEpoch, setLocateEpoch] = useState(0);
  const [isCreatingAtLocation, setIsCreatingAtLocation] = useState(false);
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
    locationError,
    setLocationError,
    requestLocation,
    getCurrentBrowserLocation,
    checkLocationPermission
  } = useGeolocation(true);

  const { handleImportFromCamera, isCameraAvailable } = useCameraImport({
    getCurrentBrowserLocation,
    mapInstance,
    onAddNote
  });

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
    if (locationError) {
      const timer = setTimeout(() => {
        // We can't directly set locationError to null since it's managed by the hook
        // Instead, we'll trigger a new location request to clear the error state
        setHasRetriedLocation(false);
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [locationError]);

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
      if (mapViewMountedRef.current) {
        setIsLocating(true);
        setHasRetriedLocation(false);
        setLocationError(null);
      }

      let loc = await requestLocation({ requestOrientation: true });
      if (!loc && mapViewMountedRef.current && !hasRetriedLocation) {
        setHasRetriedLocation(true);
        await new Promise((r) => setTimeout(r, 1000));
        loc = await requestLocation({ requestOrientation: true });
      }

      if (!loc) {
        cancelPendingMapLocate(projectId, gen);
        return;
      }

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
  }, [currentLocation, requestLocation, hasRetriedLocation, setLocationError, project.id]);

  // Map position management hook
  const { initialMapPosition, handleMapPositionChange } = useMapPosition({
    isMapMode: true,
    projectId: project.id,
    navigateToCoords,
    mapNotes: mapGeoNotes,
    currentLocation,
    defaultCenter
  });

  // Empty project (no pins / no cache / no nav): prefer current location, then keep fallback
  useEffect(() => {
    setLateAutoCenter(null);
  }, [project.id]);

  useEffect(() => {
    if (navigateToCoords) return;
    if (mapGeoNotes.length > 0) return;
    const cached = getViewPositionCache(project.id, 'map');
    if (cached?.center && cached.zoom) return;
    if (peekReadyMapLocate(project.id) || getPendingMapLocate(project.id)) return;
    if (emptyProjectLocateStarted.has(project.id)) return;

    emptyProjectLocateStarted.add(project.id);
    const gen = beginPendingMapLocate(project.id);
    (async () => {
      const loc = await requestLocation({ requestOrientation: false });
      if (!loc) {
        cancelPendingMapLocate(project.id, gen);
        emptyProjectLocateStarted.delete(project.id);
        return;
      }
      if (!completePendingMapLocate(project.id, gen, loc.lat, loc.lng, 16)) return;
      setViewPositionCache(project.id, 'map', { center: [loc.lat, loc.lng], zoom: 16 });
    })();
  }, [navigateToCoords, mapGeoNotes.length, project.id, requestLocation]);

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
    importPreview,
    showImportDialog,
    fileInputRef,
    dataImportInputRef,
    handleImageImport,
    handleConfirmImport,
    handleCancelImport
  } = useImageImport({
    project,
    notes,
    onAddNote,
    onUpdateProject,
    onImportDialogChange,
    mapInstance
  });

  const { handleDataImport } = useDataImport({ project, onUpdateProject });
  const { handleCsvImport } = useCsvImport({ project, onUpdateProject });
  const { computeBoardPosition } = useNotePositioning(notes);
  const { isDragging, rootProps, dismissDropZone } = useFileDrop({
    isEditorOpen,
    themeColor,
    handleImageImport,
    handleDataImport,
    handleCsvImport
  });

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

  const handleToggleSettings = useCallback(() => {
    closeMapChromeExcept('settings');
    setShowSettingsPanel((v) => !v);
  }, [closeMapChromeExcept]);

  const handleToggleLayerPanel = useCallback(() => {
    closeMapChromeExcept('layer');
    setShowFrameLayerPanel((v) => !v);
  }, [closeMapChromeExcept, setShowFrameLayerPanel]);

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

  /** 打开详情预览时收起其它地图浮层，保证单一工作焦点。 */
  const closePanelsForPreview = useCallback(() => {
    closeMapChromeExcept();
    setShowImportMenu?.(false);
    setShowMapConnectionPanel(false);
    setMapConnPickTarget(null);
  }, [closeMapChromeExcept, setShowImportMenu, setShowMapConnectionPanel, setMapConnPickTarget]);

  const graphLayerStandard = (project.graphLayerStandard ?? 'tag') as GraphLayerGroupStandard;
  const mergedTagMapLayers = useMemo(
    () => mergeGraphLayerState(notes, project.graphLayers ?? null, 'tag'),
    [notes, project.graphLayers]
  );
  const mergedFrameMapLayers = useMemo(
    () => mergeGraphLayerState(notes, project.graphFrameLayers ?? null, 'frame'),
    [notes, project.graphFrameLayers]
  );
  const mergedMapProjectLayers =
    graphLayerStandard === 'frame' ? mergedFrameMapLayers : mergedTagMapLayers;

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

  /** 详情卡优先用已解析像素的 note，避免再次卡在「加载中」 */
  const selectedNote = useMemo(() => {
    if (!selectedNoteId) return null;
    return (
      mapRenderedNotes.find((n) => n.id === selectedNoteId) ??
      selectedNoteRaw ??
      null
    );
  }, [selectedNoteId, mapRenderedNotes, selectedNoteRaw]);

  const hoveredNote = useMemo(() => {
    if (!hoveredNoteId) return null;
    return (
      mapRenderedNotes.find((n) => n.id === hoveredNoteId) ??
      hoveredNoteRaw ??
      null
    );
  }, [hoveredNoteId, mapRenderedNotes, hoveredNoteRaw]);

  const mapNoteStackRank = useMemo(() => {
    const sorted = sortNotesByLayerStack(mapRenderedNotes);
    const m = new Map<string, number>();
    sorted.forEach((n, i) => m.set(n.id, i));
    return m;
  }, [mapRenderedNotes]);

  const handleMapGraphLayersChange = useCallback(
    (next: GraphLayerState) => {
      if (!onUpdateProject) return;
      if (graphLayerStandard === 'frame') {
        void onUpdateProject({ ...project, graphFrameLayers: next });
      } else {
        void onUpdateProject({ ...project, graphLayers: next });
      }
    },
    [onUpdateProject, project, graphLayerStandard]
  );

  const handleMapLayerStandardChange = useCallback(
    (standard: GraphLayerGroupStandard) => {
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
    getFilteredNotes: () => mapRenderedNotes,
    clusterThreshold,
    forceSingleNoteIds
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

  const beginNewNoteIntro = useCallback((note: Partial<Note>) => {
      if (introTimerRef.current) clearTimeout(introTimerRef.current);
      if (introDismissTimerRef.current) clearTimeout(introDismissTimerRef.current);
      if (introExitTimerRef.current) clearTimeout(introExitTimerRef.current);
      setEditingNote(note);
      setIntroNote(note);
      setIntroNoteMotion('enter');
      introStartedAtRef.current = Date.now();
    }, []);

  const openNewNoteEditorAfterIntro = useCallback(
    (note: Partial<Note>, elapsedMs = 0) => {
      const remainingIntroMs = Math.max(140, MAP_NOTE_INTRO_MS - elapsedMs);
      if (introTimerRef.current) clearTimeout(introTimerRef.current);
      introTimerRef.current = setTimeout(() => {
        introTimerRef.current = null;
        setIsEditorOpen(true);
        onToggleEditor(true);
      }, remainingIntroMs);
    },
    [onToggleEditor]
  );

  const createNewMapNote = useCallback(
    (coords: Coordinates): Partial<Note> => {
      const { boardX, boardY } = computeBoardPosition();
      return {
        id: generateId(),
        createdAt: Date.now(),
        coords,
        fontSize: 3,
        emoji: '',
        text: '',
        images: [],
        tags: [],
        variant: 'standard',
        isFavorite: false,
        color: '#FFFFFF',
        boardX,
        boardY
      };
    },
    [computeBoardPosition]
  );

  const handleLongPress = useCallback(
    (coords: Coordinates) => {
      const newNote = createNewMapNote(coords);
      longPressPreviewNoteRef.current = newNote;
      beginNewNoteIntro(newNote);
    },
    [beginNewNoteIntro, createNewMapNote]
  );

  const handleLongPressRelease = useCallback(() => {
    const note = longPressPreviewNoteRef.current;
    if (!note) return;
    longPressPreviewNoteRef.current = null;
    openNewNoteEditorAfterIntro(note, Date.now() - introStartedAtRef.current);
  }, [openNewNoteEditorAfterIntro]);

  const handleLongPressCancel = useCallback(() => {
    longPressPreviewNoteRef.current = null;
    if (introTimerRef.current) clearTimeout(introTimerRef.current);
    introTimerRef.current = null;
    setIntroNote(null);
    setEditingNote(null);
  }, []);

  const handleCreateAtCurrentLocation = useCallback(async () => {
    try {
      setIsCreatingAtLocation(true);
      setLocationError(null);
      const loc = await requestLocation({ requestOrientation: false });
      if (!loc) return;
      const map = mapInstanceRef.current;
      if (map) {
        map.flyTo([loc.lat, loc.lng], 16, { duration: 1.5 });
      }
      const newNote = createNewMapNote({ lat: loc.lat, lng: loc.lng });
      beginNewNoteIntro(newNote);
      openNewNoteEditorAfterIntro(newNote);
    } catch (error) {
      console.error('Create at current location failed:', error);
    } finally {
      setIsCreatingAtLocation(false);
    }
  }, [requestLocation, setLocationError, beginNewNoteIntro, createNewMapNote, openNewNoteEditorAfterIntro]);

  const handleImportFromPhotos = useCallback(() => {
    fileInputRef.current?.click();
  }, [fileInputRef]);

  const handleMarkerClick = (note: Note, e?: L.LeafletMouseEvent) => {
    if (ignoreNextMarkerClickRef.current || isMarkerDraggingRef.current) {
      return;
    }
    // Prevent event propagation to avoid conflicts with map events
    if (e) {
      e.originalEvent?.stopPropagation();
      e.originalEvent?.stopImmediatePropagation();
    }

    // 预览模式下的特殊交互处理
    if (!isUIVisible) {
      if (selectionTimerRef.current) {
        clearTimeout(selectionTimerRef.current);
        selectionTimerRef.current = null;
      }
      
      setPreSelectedNotes(null);
      // 预览模式下：点击点位时，只显示该点及其连线相邻点的 label
      if (selectedNoteId === note.id) {
        setSelectedNoteId(null);
        setConnectionHighlightNoteIds(null);
      } else {
        closePanelsForPreview();
        setSelectedNoteId(null);
        // 计算与当前点通过连线相连的所有点（包括自身）
        const relatedIds = new Set<string>();
        relatedIds.add(note.id);
        connections.forEach(conn => {
          if (conn.fromNoteId === note.id || conn.toNoteId === note.id) {
            relatedIds.add(conn.fromNoteId);
            relatedIds.add(conn.toNoteId);
          }
        });
        const idsArray = Array.from(relatedIds);
        // label 显示模式下不收缩为仅连线相关 label，保持全部显示
        setConnectionHighlightNoteIds(showTextLabels ? null : idsArray);

        // 延迟设置新选中点，确保“先恢复”的视觉效果或逻辑
        selectionTimerRef.current = setTimeout(() => {
          setSelectedNoteId(note.id);
          selectionTimerRef.current = null;
        }, 50);
      }
      return;
    }

    // 普通地图模式：单选会打开详情卡，故收起其它浮层；Shift 多选不打断当前工作流。
    if (!e?.originalEvent?.shiftKey) closePanelsForPreview();
    setPreSelectedNotes(null);
    const additive = !!(e?.originalEvent?.shiftKey);
    let nextSet: Set<string>;
    if (additive) {
      nextSet = new Set(selectedNoteIds);
      if (nextSet.has(note.id)) nextSet.delete(note.id);
      else nextSet.add(note.id);
    } else {
      nextSet = new Set([note.id]);
    }
    setSelectedNoteIds(nextSet);
    const primary =
      nextSet.size === 0
        ? null
        : nextSet.has(note.id)
          ? note.id
          : Array.from(nextSet)[0];
    setSelectedNoteId(primary);

    const relatedIds = new Set<string>();
    nextSet.forEach((id) => {
      relatedIds.add(id);
      connections.forEach((conn) => {
        if (conn.fromNoteId === id || conn.toNoteId === id) {
          relatedIds.add(conn.fromNoteId);
          relatedIds.add(conn.toNoteId);
        }
      });
    });
    setConnectionHighlightNoteIds(showTextLabels ? null : Array.from(relatedIds));
  };

  // Handle cluster marker click - set up cluster navigation
  const handleClusterClick = (clusterNotes: Note[], e?: L.LeafletMouseEvent) => {
    // Prevent event propagation to avoid conflicts with map events
    if (e) {
      e.originalEvent?.stopPropagation();
      e.originalEvent?.stopImmediatePropagation();
    }
    
    // Sort notes: from south to north, from west to east
    const sortedClusterNotes = sortNotes(clusterNotes);

    if (!isUIVisible) {
      // 预览模式：点击集合点时，仅在地图上展开该簇的标签
      if (selectionTimerRef.current) {
        clearTimeout(selectionTimerRef.current);
        selectionTimerRef.current = null;
      }
      setSelectedNoteId(null);
      setSelectedNoteIds(new Set());
      setPreSelectedNotes(sortedClusterNotes);
      return;
    }

    // 正常地图模式：点击集合点时，仅展开该簇内的 labels，由 TextLabelsLayer 处理二次点击
    setSelectedNoteId(null);
    setSelectedNoteIds(new Set());
    setPreSelectedNotes(sortedClusterNotes);
  };

  const handleMarkerDrag = useCallback((note: Note, e: any) => {
    const marker = e?.target as L.Marker | undefined;
    const latLng = marker?.getLatLng?.();
    if (!latLng) return;

    isMarkerDraggingRef.current = true;

    setNoteCoordOverrides((prev) => ({
      ...prev,
      [note.id]: {
        lat: latLng.lat,
        lng: latLng.lng
      }
    }));
  }, []);

  const handleMarkerDragEnd = useCallback((note: Note, e: L.DragEndEvent) => {
    const marker = e.target as L.Marker;
    const latLng = marker.getLatLng();
    if (!latLng) return;

    // 乐观更新：先把坐标写到本地覆盖表，保证 marker 位置不会在聚类重算前回弹
    setNoteCoordOverrides((prev) => ({
      ...prev,
      [note.id]: {
        lat: latLng.lat,
        lng: latLng.lng
      }
    }));

    isMarkerDraggingRef.current = false;
    ignoreNextMarkerClickRef.current = true;
    // 允许 dragend 触发的 click 不再影响本次交互
    setTimeout(() => {
      ignoreNextMarkerClickRef.current = false;
    }, 0);

    onUpdateNote({
      ...note,
      coords: {
        lat: latLng.lat,
        lng: latLng.lng
      }
    });
  }, [onUpdateNote]);

  
  const handleSaveNote = (noteData: Partial<Note>) => {
    if (noteData.id && notes.some(n => n.id === noteData.id)) {
      // 确保保留原始note的variant
      const existingNote = notes.find(n => n.id === noteData.id);
      const fullNote: Note = {
        ...existingNote!,
        ...noteData,
        variant: noteData.variant || existingNote!.variant,
        isFavorite: noteData.isFavorite ?? existingNote?.isFavorite ?? false
      } as Note;
      onUpdateNote(fullNote);
      // Update editingNote to reflect the saved changes
      setEditingNote(fullNote);
    } else {
      // 新Note必须指定variant
      const fullNote: Note = {
        ...noteData,
        variant: noteData.variant || 'standard',
        isFavorite: noteData.isFavorite ?? false
      } as Note;
      onAddNote(fullNote);
      // For new notes, update editingNote as well
      setEditingNote(fullNote);
    }
  };

  const closeEditor = useCallback(() => {
    setIsEditorOpen(false);
    onToggleEditor(false);
    if (!introNote) return;

    if (introDismissTimerRef.current) clearTimeout(introDismissTimerRef.current);
    if (introExitTimerRef.current) clearTimeout(introExitTimerRef.current);
    const introNoteId = introNote.id;
    introDismissTimerRef.current = setTimeout(() => {
      introDismissTimerRef.current = null;
      setIntroNoteMotion('exit');
      introExitTimerRef.current = setTimeout(() => {
        introExitTimerRef.current = null;
        setIntroNote((current) => (current?.id === introNoteId ? null : current));
      }, MAP_NOTE_EXIT_MS);
    }, MAP_NOTE_INTRO_DISMISS_DELAY_MS);
  }, [introNote, onToggleEditor]);

  const handleDeleteNoteWithExit = useCallback(
    async (noteId: string) => {
      if (!onDeleteNote || deletingNoteIdsRef.current.has(noteId)) return;
      deletingNoteIdsRef.current.add(noteId);
      setDeletingNoteIds(new Set(deletingNoteIdsRef.current));
      setSelectedNoteId(null);
      setSelectedNoteIds((current) => {
        const next = new Set(current);
        next.delete(noteId);
        return next;
      });
      setHoveredNoteId((current) => (current === noteId ? null : current));
      setPreSelectedNotes(null);
      setConnectionHighlightNoteIds(null);
      setEditingNote(null);
      closeEditor();

      try {
        await new Promise<void>((resolve) => window.setTimeout(resolve, MAP_NOTE_EXIT_MS));
        await Promise.resolve(onDeleteNote(noteId));
      } finally {
        deletingNoteIdsRef.current.delete(noteId);
        setDeletingNoteIds(new Set(deletingNoteIdsRef.current));
      }
    },
    [closeEditor, onDeleteNote]
  );

  // 侧栏「编辑」按钮或地图 label 双击：打开完整便签编辑器
  const handleEditNoteFromLabel = useCallback((noteId: string) => {
    if (!isUIVisible) return;
    const note = notes.find(n => n.id === noteId);
    if (!note) return;

    setPreSelectedNotes(null);
    setSelectedNoteIds(new Set([noteId]));
    setSelectedNoteId(noteId);
    setEditingNote(note);
    setIsEditorOpen(true);
    onToggleEditor(true);
  }, [isUIVisible, notes, onToggleEditor]);

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

  const clearInspectorCoordOverride = useCallback((noteId: string) => {
    setNoteCoordOverrides((prev) => {
      const next = { ...prev };
      delete next[noteId];
      return next;
    });
  }, []);

  const mapEditInspectorPanelProps = useMemo(
    (): EditInspectorPanelProps => ({
      note: inspectorNote,
      groupContext: inspectorNote ? null : inspectorGroupContext,
      coordMode: 'map',
      themeColor,
      panelChromeStyle: mapChromeSurface,
      frames: project.frames ?? [],
      connections,
      notes,
      hasConnectionWrite: !!onUpdateConnections,
      onUpdateNote,
      onEditConnection: handleEditMapConnection,
      onNewConnection: handleNewConnectionFromInspector,
      mapInstance,
      noteCoordOverrides,
      onClearCoordOverride: clearInspectorCoordOverride,
      onOpenFullNoteEditor: handleEditNoteFromLabel,
      onFocusPeerOnMap: (noteId: string) => {
        const n = notes.find((x) => x.id === noteId);
        if (!n?.coords || !mapInstance) return;
        mapInstance.flyTo([n.coords.lat, n.coords.lng], Math.max(mapInstance.getZoom(), 15), { duration: 0.75 });
      }
    }),
    [
      inspectorNote,
      inspectorGroupContext,
      themeColor,
      mapChromeSurface,
      project.frames,
      connections,
      notes,
      onUpdateConnections,
      onUpdateNote,
      handleEditMapConnection,
      handleNewConnectionFromInspector,
      handleEditNoteFromLabel,
      mapInstance,
      noteCoordOverrides,
      clearInspectorCoordOverride
    ]
  );

  useRegisterEditInspector(isUIVisible && isMapToolbarEditMode, mapEditInspectorPanelProps);

  const exportStandaloneMapTab = useCallback(async () => {
    if (!mapInstance || isUIVisible) return;
    try {
      const payload = await buildMapTabExportPayload(project, themeColor, mapStyleId, mapInstance, {
        pinSize,
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
    isUIVisible,
    project,
    themeColor,
    mapStyleId,
    pinSize,
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
      onDrop={rootProps.onDrop}
      onDragEnd={rootProps.onDragEnd}
    >
      {isDragging && (
        <div 
          className="absolute inset-0 z-[4000] flex items-center justify-center pointer-events-auto"
          style={{ backgroundColor: isEditorOpen ? '#3B82F633' : `${themeColor}33` }}
          onClick={dismissDropZone}
        >
          <div className="bg-white rounded-2xl shadow-2xl p-8 border-4 pointer-events-none" style={{ borderColor: themeColor }}>
            <div className="text-center">
              <div className="mb-4 flex justify-center">
                {isEditorOpen ? (
                  <svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-blue-600">
                    <path d="M14 2H6C4.89543 2 4 2.89543 4 4V20C4 21.1046 4.89543 22 6 22H18C19.1046 22 20 21.1046 20 20V8L14 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <polyline points="14,2 14,8 20,8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M16 13H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M16 17H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M10 9H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ) : (
                <svg width="64" height="64" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-gray-700">
                  <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                  <path d="M8 11V5M5 8l3-3 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                )}
              </div>
              <div className="text-xl font-bold text-gray-800">
                {isEditorOpen
                  ? "Drag images to the note editor to add them"
                  : "Drop images, JSON or CSV files here to import"
                }
              </div>
            </div>
          </div>
        </div>
      )}
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
          // When using blank map style, show a clean white background.
          backgroundColor: effectiveMapStyle === 'blank' ? '#ffffff' : undefined
        }}
        zoomControl={false}
        ref={mapRefCallback}
        doubleClickZoom={false}
        boxZoom={false}
      >
        <MapAttributionPrefix />
        <MapSmoothZoom
          sensitivity={1.5}
          trackpadPinchSensitivity={3.25}
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
        {isUIVisible && (
          <MapShiftBoxSelect
            enabled={isUIVisible}
            notes={mapRenderedNotes}
            noteCoordOverrides={noteCoordOverrides}
            onBoxCommit={handleMapBoxSelectCommit}
            onInteractionClaimed={handleMapShiftBoxSelectClaimed}
            themeColor={themeColor}
          />
        )}
        {effectiveMapStyle !== 'blank' && (
          <MapTileZoomFallback
            url={tileLayerConfig.url}
            maxZoom={tileLayerConfig.maxZoom}
            maxNativeZoom={tileLayerConfig.maxNativeZoom}
          />
        )}
        {effectiveMapStyle !== 'blank' && (
          <MapTileDirectionalPrefetch
            url={tileLayerConfig.url}
            maxZoom={tileLayerConfig.maxZoom}
            maxNativeZoom={tileLayerConfig.maxNativeZoom}
          />
        )}
        <TileLayer 
          key={effectiveMapStyle}
          {...tileLayerConfig}
          // 回退层显式为 0；主图层也必须显式抬高，不能依赖 DOM 挂载顺序。
          // 否则回退层中心的大瓦片会偶尔盖在已到达的高精瓦片上，出现
          // “中间低清、周围高清”的反直觉画面。
          zIndex={1}
          tileSize={256}
          zoomOffset={0}
          // 原生双指缩放在跨越整数层级时开始补图；自定义桌面平滑缩放会拦截
          // 中间层级更新，因此不会产生错误坐标的瓦片请求。
          updateWhenZooming
          // Leaflet 对移动端的推荐策略是等拖动停下再补图；桌面端则实时补图，
          // 让长距离平移无需等到松手才出现新区域。
          updateWhenIdle={isTouchFirstInput}
          keepBuffer={6}
        />
        
        <MapLongPressHandler
          onLongPress={handleLongPress}
          onLongPressRelease={handleLongPressRelease}
          onLongPressCancel={handleLongPressCancel}
          isPreviewMode={!isUIVisible}
        />

        {introNote?.coords ? (
          <NoteMarker
            note={introNote as Note}
            position={[introNote.coords.lat, introNote.coords.lng]}
            pinSize={pinSize}
            themeColor={themeColor}
            zIndexOffset={10000}
            motion={introNoteMotion}
            interactive={false}
            onClick={() => {}}
          />
        ) : null}

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
              fillColor: themeColor,
              fillOpacity: 0.1,
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
          notes={mapRenderedNotes}
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
          onLabelDoubleClickEdit={
            isUIVisible && isMapToolbarEditMode ? handleEditNoteFromLabel : undefined
          }
          onSelectNote={(noteId) => {
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

        <MapLocationErrorBanner
          locationError={locationError}
          isLocating={locatingActive}
          onRetry={handleLocateCurrentPosition}
          onClose={() => {
            setLocationError(null);
            setHasRetriedLocation(false);
            setIsLocating(false);
          }}
        />
        
        <ClusterMarkerLayer
          clusteredMarkers={clusteredMarkers}
          fallbackNotes={mapRenderedNotes}
          noteStackRank={mapNoteStackRank}
          showTextLabels={showTextLabels}
          pinSize={pinSize}
          themeColor={themeColor}
          mapInstance={mapInstance}
          onMarkerClick={handleMarkerClick}
          onClusterClick={handleClusterClick}
          onMarkerHover={(note) => setHoveredNoteId(note?.id ?? null)}
          noteCoordOverrides={noteCoordOverrides}
          selectedNoteId={selectedNoteId}
          selectedNoteIds={selectedNoteIds}
          isPreviewMode={!isUIVisible}
          onMarkerDragEnd={handleMarkerDragEnd}
          onMarkerDrag={handleMarkerDrag}
          deletingNoteIds={deletingNoteIds}
        />

        {/* Import preview markers */}
        {showImportDialog && importPreview.filter(p => !p.error && p.lat !== null && p.lng !== null).map((preview, index) => (
          <Marker
            key={`preview-${index}`}
            position={[preview.lat, preview.lng]}
            icon={L.divIcon({
              className: 'custom-icon preview-marker',
              html: `<div style="
                position: relative;
                background-color: ${themeColor}; 
                width: 40px; 
                height: 40px; 
                border-radius: 50% 50% 50% 0; 
                transform: rotate(-45deg);
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2);
                border: 3px solid ${themeColor};
                overflow: hidden;
                opacity: 0.7;
              ">
                <div style="
                  position: absolute;
                  inset: 0;
                  border-radius: 50% 50% 50% 0;
                  overflow: hidden;
                  transform: rotate(45deg);
                ">
                  <img src="${preview.imageUrl}" style="
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                    transform: scale(1.2);
                    transform-origin: center;
                  " />
                </div>
              </div>`,
              iconSize: [40, 40],
              iconAnchor: [20, 40]
            })}
          />
        ))}

        {isUIVisible && (
          <div
            data-allow-context-menu
            className={`fixed top-2 sm:top-4 ui-workspace-left z-[var(--z-map-toolbar)] flex flex-col items-start gap-2 sm:gap-3 pointer-events-none ${
              showLocateMenu || showCreateMenu ? 'map-toolbar--sheet-open' : ''
            } ${
              isMapToolbarEditMode
                ? 'right-2 sm:right-4 lg:right-[calc(20rem+0.75rem)]'
                : 'right-2 sm:right-4'
            }`}
          >
              <div className="flex justify-between items-center w-full pointer-events-none gap-2">
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
                    isCreatingAtLocation={isCreatingAtLocation}
                    showLocateMenu={showLocateMenu}
                    showCreateMenu={showCreateMenu}
                    onToggleLocateMenu={handleToggleLocateMenu}
                    onToggleCreateMenu={handleToggleCreateMenu}
                    onCloseMenus={handleCloseLocateAndCreateMenus}
                  />
                  <MapLayerControl
                    showPanel={showFrameLayerPanel}
                    onTogglePanel={handleToggleLayerPanel}
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
                    dropdownAlign="start"
                    unifiedNotesLayerSlot={
                      onUpdateProject ? (
                        <ProjectNotesLayerPanel
                          themeColor={themeColor}
                          panelChromeStyle={mapChromeContentSurface}
                          chromeAppearance={mapChromeTone}
                          variant="dock"
                          flow
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
                            mapInstance.flyTo([note.coords.lat, note.coords.lng], Math.max(mapInstance.getZoom(), 15), {
                              duration: 0.85
                            });
                          }}
                        />
                      ) : null
                    }
                  />
                </div>
                <div
                  className="flex h-10 sm:h-12 gap-1.5 sm:gap-2 pointer-events-auto items-center shrink-0"
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
                  />
                  <MapTopRightEditToggle
                    isEditMode={isMapToolbarEditMode}
                    themeColor={themeColor}
                    chromeSurfaceStyle={mapChromeControlSurface}
                    chromeHoverBackground={mapChromeHoverBg}
                    onEnterEdit={() => onWorkspaceEditModeChange(true)}
                    onExitEdit={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      onWorkspaceEditModeChange(false);
                    }}
                  />
                </div>
              </div>

              {/* 与按钮行共用定位容器：按钮在窄屏重排或高度变化时，详情卡自然跟随其下。 */}
              {!isMapToolbarEditMode && !isEditorOpen && selectedNote ? (
                <NotePreviewCard
                  embedded
                  note={selectedNote}
                  currentImageIndex={currentPreviewImageIndex}
                  onImageIndexChange={setCurrentPreviewImageIndex}
                  chromeSurfaceStyle={mapChromeContentSurface}
                  chromeAppearance={mapChromeTone}
                  themeColor={themeColor}
                  onOpenEditor={handleEditNoteFromLabel}
                />
              ) : null}
            </div>
        )}

        <div className="absolute top-24 left-0 right-0 z-[400] pointer-events-none flex justify-center">
          <div className="relative">
            <div
              className={`px-4 py-2 rounded-full shadow-lg text-sm animate-bounce whitespace-nowrap border border-gray-100/80 map-chrome-content-${mapChromeTone}`}
              style={mapChromeControlSurface}
            >
              Long press anywhere to pin
            </div>
          </div>
        </div>

      </MapContainer>

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
      
      {isEditorOpen && (
        <NoteEditor 
          isOpen={isEditorOpen}
          onClose={closeEditor}
          onSave={handleSaveNote}
          onDelete={handleDeleteNoteWithExit}
          initialNote={editingNote || {}}
          isNewNote={!!editingNote?.id && !notes.some((note) => note.id === editingNote.id)}
          onSwitchToBoardView={(coords) => onSwitchToBoardView(coords, mapInstance)}
          themeColor={themeColor}
          panelChromeStyle={mapChromeContentSurface}
          chromeAppearance={mapChromeTone}
        />
      )}

      {/* Tab 预览没有左上按钮组，继续使用独立 fixed 详情卡。 */}
      {!isUIVisible && (hoveredNote ?? selectedNote) && (
        <NotePreviewCard
          note={(hoveredNote ?? selectedNote)!}
          currentImageIndex={currentPreviewImageIndex}
          onImageIndexChange={setCurrentPreviewImageIndex}
          chromeSurfaceStyle={mapChromeContentSurface}
          chromeAppearance={mapChromeTone}
          themeColor={themeColor}
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

      <ImportPreviewDialog
        isOpen={showImportDialog}
        importPreview={importPreview}
        themeColor={themeColor}
        panelChromeStyle={mapChromeSurface}
        onConfirm={handleConfirmImport}
        onCancel={handleCancelImport}
        showCoordinates={true}
      />

      {/* Settings Panel */}
      <SettingsPanel
        isOpen={showSettingsPanel}
        onClose={() => setShowSettingsPanel(false)}
        anchorRef={settingsButtonRef}
        settingsContextView="map"
        themeColor={themeColor}
        onThemeColorChange={(color) => {
          onThemeColorChange?.(color);
        }}
        mapUiChromeOpacity={mapUiChromeOpacity}
        onMapUiChromeOpacityChange={onMapUiChromeOpacityChange ?? (() => {})}
        mapUiChromeBlurPx={mapUiChromeBlurPx}
        onMapUiChromeBlurPxChange={onMapUiChromeBlurPxChange ?? (() => {})}
        currentMapStyle={mapStyleId || 'carto-light-nolabels'}
        onMapStyleChange={handleMapStyleChange}
        pinSize={pinSize}
        onPinSizeChange={setPinSize}
        clusterThreshold={clusterThreshold}
        onClusterThresholdChange={setClusterThreshold}
        labelSize={labelSize}
        onLabelSizeChange={setLabelSize}
        showTextLabels={showTextLabels}
        onShowTextLabelsChange={setShowTextLabels}
        graphProject={project}
        onGraphProjectPatch={
          onUpdateProject ? (patch) => void onUpdateProject({ ...project, ...patch }) : undefined
        }
      />

      <MapImportMenuModal
        open={!!showImportMenu}
        chromeSurfaceStyle={mapChromeContentSurface}
        chromeAppearance={mapChromeTone}
        chromeHoverBackground={mapChromeHoverBg}
        onClose={() => setShowImportMenu?.(false)}
        onImportPhotos={() => fileInputRef.current?.click()}
        onImportData={() => dataImportInputRef.current?.click()}
        onImportCamera={handleImportFromCamera}
        cameraAvailable={isCameraAvailable()}
      />
    </div>
  );
};
