import React, { useState, useMemo, useCallback, useRef, useEffect, useLayoutEffect } from 'react';
import { Note, Project, Frame, Connection, type GraphLayerState } from '../types';
import { Trash2 } from 'lucide-react';
import {
  clampConnectionWeight,
  connectionToGraphDirection,
  DEFAULT_CONNECTION_WEIGHT
} from '../utils/graph/graphData';
import { generateId, parseNoteContent } from '../utils';
import { mergeGraphLayerState, type GraphLayerGroupStandard } from '../utils/graph/graphRuntimeCore';
import { emojiLayerStateFromLegacyTagState, groupDisplayLabel, noteBelongsToLayerGroupKey } from '../utils/layer/unifiedNoteLayer';
import { NoteEditor } from './NoteEditor';
import { ProjectNotesLayerPanel } from './layer/ProjectNotesLayerPanel';
import { DeleteConfirmDialog } from './ui/DeleteConfirmDialog';
import { SettingsPanel } from './SettingsPanel';
import { useChromeAppearance } from './ui/chromeAppearanceContext';
import { TableTopLeftSettingsButton } from './table/TableTopLeftSettingsButton';
import { TableTopRightDownloadButton } from './table/TableTopRightDownloadButton';
import { TableBottomSubViewBar } from './table/TableBottomSubViewBar';
import { TableWindowNavigator, type TableWindowTarget } from './table/TableWindowNavigator';
import { GraphTopCenterConnectionButton } from './graph/GraphTopCenterConnectionButton';
import { GraphConnectionPanel, connectionToPanelDraft, type ConnectionDraft } from './graph/GraphConnectionPanel';
import { resolveProjectKind } from '../utils/projectKind';

interface TableViewProps {
  project: Project;
  /** 写入 Graph Style 等到项目 */
  projectId?: string;
  onUpdateProject?: (projectOrId: Project | string, updates?: Partial<Project>) => void | Promise<void>;
  onUpdateNote: (note: Note) => void;
  onDeleteNote?: (noteId: string) => void | Promise<void>;
  onUpdateFrames?: (frames: Frame[]) => void;
  onUpdateConnections?: (connections: Connection[]) => void | Promise<void>;
  onSwitchToBoardView?: (coords?: { x: number; y: number }) => void;
  onSwitchToMapView?: (coords?: { lat: number; lng: number; zoom?: number }) => void;
  onSwitchToGraphView?: (noteId: string) => void;
  onToggleEditor?: (isOpen: boolean) => void;
  themeColor: string;
  panelChromeStyle?: React.CSSProperties;
  isUIVisible?: boolean;
  chromeHoverBackground?: string;
  onThemeColorChange?: (color: string) => void;
  uiDarkMode?: boolean;
  onUiDarkModeChange?: (dark: boolean) => void;
  mapUiChromeOpacity?: number;
  onMapUiChromeOpacityChange?: (opacity: number) => void;
  mapUiChromeBlurPx?: number;
  onMapUiChromeBlurPxChange?: (blurPx: number) => void;
  mapStyleId?: string;
  onMapStyleChange?: (styleId: string) => void;
}

type PendingTableDelete =
  | { kind: 'note'; noteId: string; titleHint: string }
  | { kind: 'connection'; connectionId: string };

type TableSubView = 'points' | 'edges';

/** 与 NoteEditor 的 @media (max-width: 639px) 恰好共用同一条边界。 */
const TABLE_CANVAS_MEDIA_QUERY = '(min-width: 640px)';
const TABLE_CANVAS_WINDOW_GAP = 24;
const TABLE_EDITOR_MAIN_WIDTH = 608;
const TABLE_EDITOR_SIDE_GAP = 12;
const TABLE_EDITOR_SIDE_WIDTH = 320;
const TABLE_EDITOR_DETAIL_GAP = 12;
const TABLE_EDITOR_DETAIL_WIDTH = 576;

function noteRowTitle(note: Note | undefined): string {
  if (!note) return '（便签已删除）';
  return parseNoteContent(note.text || '').title || '无标题';
}

function edgeDirectionHint(c: Connection): string {
  const d = connectionToGraphDirection(c);
  if (d === 'forward') return '→';
  if (d === 'backward') return '←';
  if (d === 'both') return '↔';
  return '—';
}

function sanitizeFilenamePart(s: string): string {
  const t = s.trim().replace(/[/\\?%*:|"<>]/g, '_');
  return t.slice(0, 80) || 'table';
}

function csvEscapeCell(v: string | number | undefined | null): string {
  const s = v === undefined || v === null ? '' : String(v);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildCsv(rows: (string | number | undefined | null)[][]): string {
  const lines = rows.map((row) => row.map(csvEscapeCell).join(','));
  return `\uFEFF${lines.join('\r\n')}`;
}

function triggerDownloadCsv(filename: string, csvBody: string) {
  const blob = new Blob([csvBody], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function formatNoteYearRange(note: Note): string {
  const { startYear, endYear } = note;
  if (startYear != null && endYear != null) return `${startYear}-${endYear}`;
  if (startYear != null) return String(startYear);
  if (endYear != null) return String(endYear);
  return '';
}

export const TableView: React.FC<TableViewProps> = ({
  project,
  projectId = '',
  onUpdateProject,
  onUpdateNote,
  onDeleteNote,
  onUpdateFrames: _onUpdateFrames,
  onUpdateConnections,
  onSwitchToBoardView,
  onSwitchToMapView,
  onSwitchToGraphView,
  onToggleEditor,
  themeColor,
  panelChromeStyle,
  isUIVisible = true,
  chromeHoverBackground,
  onThemeColorChange,
  uiDarkMode,
  onUiDarkModeChange,
  mapUiChromeOpacity = 0.9,
  onMapUiChromeOpacityChange,
  mapUiChromeBlurPx = 8,
  onMapUiChromeBlurPxChange,
  mapStyleId = 'carto-light-nolabels',
  onMapStyleChange,
}) => {
  const chromeAppearance = useChromeAppearance();
  const ch = panelChromeStyle;
  const chHover = chromeHoverBackground;
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const [subView, setSubView] = useState<TableSubView>('points');
  const [pendingDelete, setPendingDelete] = useState<PendingTableDelete | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [editorNoteId, setEditorNoteId] = useState<string | null>(null);
  const editorSaveDraftRef = useRef<(() => Promise<void>) | null>(null);
  const canvasViewportRef = useRef<HTMLDivElement>(null);
  const listWindowRef = useRef<HTMLDivElement>(null);
  const canvasDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    panX: number;
    panY: number;
  } | null>(null);
  const editorWasOpenRef = useRef(false);
  const mediaDetailWasOpenRef = useRef(false);
  const canvasAutoPanFrameRef = useRef<number | null>(null);
  const canvasAutoPanTimerRef = useRef<number | null>(null);
  const [isWideTableCanvas, setIsWideTableCanvas] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(TABLE_CANVAS_MEDIA_QUERY).matches
  );
  const [isCanvasDragging, setIsCanvasDragging] = useState(false);
  const [isCanvasAutoPanning, setIsCanvasAutoPanning] = useState(false);
  const [canvasPan, setCanvasPan] = useState({ x: 0, y: 0 });
  const [listWindowWidth, setListWindowWidth] = useState(576);
  const [isCanvasMediaDetailOpen, setIsCanvasMediaDetailOpen] = useState(false);
  const [showConnectionPanel, setShowConnectionPanel] = useState(false);
  const [panelEditingKey, setPanelEditingKey] = useState<string | 'new'>('new');
  const [connectionDraft, setConnectionDraft] = useState<ConnectionDraft>({
    fromNoteId: '',
    toNoteId: '',
    label: '',
    fromArrow: 'none',
    toArrow: 'arrow',
    weight: DEFAULT_CONNECTION_WEIGHT
  });
  const [pickTarget, setPickTarget] = useState<'from' | 'to' | null>(null);

  /** Mapping 项目表视图仅节点表；关联表仅 Graph 项目 */
  const edgesTableEnabled = resolveProjectKind(project) === 'graph';
  const activeSubView: TableSubView = edgesTableEnabled ? subView : 'points';

  useEffect(() => {
    if (!edgesTableEnabled && subView !== 'points') setSubView('points');
    if (!edgesTableEnabled) {
      setShowConnectionPanel(false);
      setPickTarget(null);
    }
  }, [edgesTableEnabled, subView]);

  useEffect(() => {
    const query = window.matchMedia(TABLE_CANVAS_MEDIA_QUERY);
    const updateMode = () => setIsWideTableCanvas(query.matches);
    updateMode();
    query.addEventListener('change', updateMode);
    return () => query.removeEventListener('change', updateMode);
  }, []);

  useLayoutEffect(() => {
    const listWindow = listWindowRef.current;
    if (!listWindow) return;
    const updateWidth = () => setListWindowWidth(listWindow.getBoundingClientRect().width);
    updateWidth();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(updateWidth);
    observer.observe(listWindow);
    return () => observer.disconnect();
  }, [isWideTableCanvas, activeSubView]);

  useEffect(() => {
    setCanvasPan({ x: 0, y: 0 });
  }, [project.id, activeSubView]);

  useEffect(() => {
    if (activeSubView !== 'points') setEditorNoteId(null);
  }, [activeSubView]);

  useEffect(() => {
    // 宽屏 Table 的编辑器是可平移画布上的并列窗口，而非覆盖工作区的 modal。
    // 因此不占用 App 的全局 editor 状态，侧栏入口与视图栏仍应可用。
    onToggleEditor?.(!!editorNoteId && !isWideTableCanvas);
  }, [editorNoteId, isWideTableCanvas, onToggleEditor]);

  useEffect(
    () => () => onToggleEditor?.(false),
    [onToggleEditor]
  );

  useEffect(() => {
    const editorIsOpen = !!editorNoteId;
    const editorWasOpen = editorWasOpenRef.current;
    editorWasOpenRef.current = editorIsOpen;
    if (editorIsOpen === editorWasOpen) return;

    if (editorIsOpen) {
      setShowSettingsPanel(false);
      setShowConnectionPanel(false);
      setPickTarget(null);
    }

    if (canvasAutoPanFrameRef.current != null) cancelAnimationFrame(canvasAutoPanFrameRef.current);
    if (canvasAutoPanTimerRef.current != null) window.clearTimeout(canvasAutoPanTimerRef.current);

    if (!isWideTableCanvas) {
      setIsCanvasAutoPanning(false);
      if (!editorIsOpen) setCanvasPan({ x: 0, y: 0 });
      return;
    }

    const alignCanvas = (attempt = 0) => {
      const viewport = canvasViewportRef.current;
      const listWindow = listWindowRef.current;
      if (!viewport || !listWindow) return;
      const viewportRect = viewport.getBoundingClientRect();

      if (editorIsOpen) {
        const editorWindow = viewport.querySelector<HTMLElement>('.note-editor-canvas-window');
        // ChromePresence 会在打开后的下一次提交才真正挂载窗口；等节点出现再测量，
        // 否则首次打开会漏掉自动定位。
        if (!editorWindow) {
          if (attempt < 5) {
            canvasAutoPanFrameRef.current = requestAnimationFrame(() => alignCanvas(attempt + 1));
          }
          return;
        }
        const editorMainWindow = editorWindow.querySelector<HTMLElement>('.note-editor-canvas-main') ?? editorWindow;
        const listRect = listWindow.getBoundingClientRect();
        const editorRect = editorWindow.getBoundingClientRect();
        const editorMainRect = editorMainWindow.getBoundingClientRect();
        const sidePadding = 24;
        const bothWindowsFit =
          listRect.left >= viewportRect.left + sidePadding &&
          editorRect.right <= viewportRect.right - sidePadding;
        if (bothWindowsFit) return;

        const deltaX =
          viewportRect.left + viewportRect.width / 2 -
          (editorMainRect.left + editorMainRect.width / 2);
        setIsCanvasAutoPanning(true);
        setCanvasPan((current) => ({ x: current.x + deltaX, y: 0 }));
        canvasAutoPanTimerRef.current = window.setTimeout(() => {
          setIsCanvasAutoPanning(false);
        }, 400);
        return;
      }

      const listRect = listWindow.getBoundingClientRect();
      const deltaX = viewportRect.left + viewportRect.width / 2 - (listRect.left + listRect.width / 2);
      setIsCanvasAutoPanning(true);
      setCanvasPan((current) => ({ x: current.x + deltaX, y: 0 }));
      // 与 NoteEditor 的退出挂载时间同步；编辑器移除后画布归零，图层窗口位置不会跳变。
      canvasAutoPanTimerRef.current = window.setTimeout(() => {
        setIsCanvasAutoPanning(false);
        setCanvasPan({ x: 0, y: 0 });
      }, 400);
    };
    canvasAutoPanFrameRef.current = requestAnimationFrame(() => alignCanvas());
  }, [editorNoteId, isWideTableCanvas]);

  useEffect(() => () => {
    if (canvasAutoPanFrameRef.current != null) cancelAnimationFrame(canvasAutoPanFrameRef.current);
    if (canvasAutoPanTimerRef.current != null) window.clearTimeout(canvasAutoPanTimerRef.current);
  }, []);

  const handleCanvasPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!isWideTableCanvas || event.button !== 0) return;
    const target = event.target as Element;
    if (target.closest('[data-table-canvas-window]')) return;
    canvasDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      panX: canvasPan.x,
      panY: canvasPan.y
    };
    if (canvasAutoPanTimerRef.current != null) window.clearTimeout(canvasAutoPanTimerRef.current);
    setIsCanvasAutoPanning(false);
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsCanvasDragging(true);
  }, [canvasPan.x, canvasPan.y, isWideTableCanvas]);

  const handleCanvasPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = canvasDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    setCanvasPan({
      x: drag.panX + event.clientX - drag.startX,
      y: drag.panY + event.clientY - drag.startY
    });
  }, []);

  const finishCanvasDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = canvasDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    canvasDragRef.current = null;
    setIsCanvasDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const editorCanvasSnapX = -(
    listWindowWidth / 2 + TABLE_CANVAS_WINDOW_GAP + TABLE_EDITOR_MAIN_WIDTH / 2
  );
  const moreCanvasSnapX = -(
    listWindowWidth / 2 +
    TABLE_CANVAS_WINDOW_GAP +
    TABLE_EDITOR_MAIN_WIDTH +
    TABLE_EDITOR_SIDE_GAP +
    TABLE_EDITOR_SIDE_WIDTH / 2
  );
  const detailCanvasSnapX = -(
    listWindowWidth / 2 +
    TABLE_CANVAS_WINDOW_GAP +
    TABLE_EDITOR_MAIN_WIDTH +
    TABLE_EDITOR_SIDE_GAP +
    TABLE_EDITOR_SIDE_WIDTH +
    TABLE_EDITOR_DETAIL_GAP +
    TABLE_EDITOR_DETAIL_WIDTH / 2
  );
  const navigatorSnapXs = isCanvasMediaDetailOpen
    ? [0, editorCanvasSnapX, moreCanvasSnapX, detailCanvasSnapX]
    : [0, editorCanvasSnapX, moreCanvasSnapX];
  const navigatorMaxPosition = navigatorSnapXs.length - 1;
  let rawWindowNavigatorPosition = navigatorMaxPosition;
  for (let index = 0; index < navigatorMaxPosition; index += 1) {
    const fromX = navigatorSnapXs[index];
    const toX = navigatorSnapXs[index + 1];
    if (canvasPan.x >= toX) {
      rawWindowNavigatorPosition = index + (canvasPan.x - fromX) / (toX - fromX);
      break;
    }
  }
  const windowNavigatorPosition = Math.max(
    0,
    Math.min(navigatorMaxPosition, rawWindowNavigatorPosition)
  );

  const previewWindowNavigator = useCallback((position: number) => {
    if (canvasAutoPanTimerRef.current != null) window.clearTimeout(canvasAutoPanTimerRef.current);
    setIsCanvasAutoPanning(false);
    const snapXs = isCanvasMediaDetailOpen
      ? [0, editorCanvasSnapX, moreCanvasSnapX, detailCanvasSnapX]
      : [0, editorCanvasSnapX, moreCanvasSnapX];
    const safePosition = Math.max(0, Math.min(snapXs.length - 1, position));
    const lowerIndex = Math.floor(safePosition);
    const upperIndex = Math.min(snapXs.length - 1, Math.ceil(safePosition));
    const progress = safePosition - lowerIndex;
    const nextX = snapXs[lowerIndex] + (snapXs[upperIndex] - snapXs[lowerIndex]) * progress;
    setCanvasPan((current) => ({ ...current, x: nextX }));
  }, [detailCanvasSnapX, editorCanvasSnapX, isCanvasMediaDetailOpen, moreCanvasSnapX]);

  const commitWindowNavigator = useCallback((target: TableWindowTarget) => {
    if (canvasAutoPanTimerRef.current != null) window.clearTimeout(canvasAutoPanTimerRef.current);
    setIsCanvasAutoPanning(true);
    setCanvasPan((current) => ({
      ...current,
      x:
        target === 'editor'
          ? editorCanvasSnapX
          : target === 'more'
            ? moreCanvasSnapX
            : target === 'detail' && isCanvasMediaDetailOpen
              ? detailCanvasSnapX
              : 0
    }));
    canvasAutoPanTimerRef.current = window.setTimeout(() => {
      setIsCanvasAutoPanning(false);
    }, 400);
  }, [detailCanvasSnapX, editorCanvasSnapX, isCanvasMediaDetailOpen, moreCanvasSnapX]);

  const handleCanvasMediaDetailOpenChange = useCallback((open: boolean) => {
    setIsCanvasMediaDetailOpen(open);
  }, []);

  useEffect(() => {
    const wasOpen = mediaDetailWasOpenRef.current;
    mediaDetailWasOpenRef.current = isCanvasMediaDetailOpen;
    if (!isWideTableCanvas || !editorNoteId || wasOpen === isCanvasMediaDetailOpen) return;
    commitWindowNavigator(isCanvasMediaDetailOpen ? 'detail' : 'more');
  }, [commitWindowNavigator, editorNoteId, isCanvasMediaDetailOpen, isWideTableCanvas]);

  const textNotes = useMemo(
    () => project.notes.filter(note => note.variant !== 'image'),
    [project.notes]
  );

  const connections = project.connections ?? [];
  const noteById = useMemo(() => {
    const m = new Map<string, Note>();
    project.notes.forEach((n) => m.set(n.id, n));
    return m;
  }, [project.notes]);

  const tableGraphLayerStandard = (project.graphLayerStandard ?? 'tag') as GraphLayerGroupStandard;
  const mergedTagTableLayers = useMemo(
    () => mergeGraphLayerState(textNotes, project.graphLayers ?? null, 'tag'),
    [textNotes, project.graphLayers]
  );
  const mergedFrameTableLayers = useMemo(
    () => mergeGraphLayerState(textNotes, project.graphFrameLayers ?? null, 'frame'),
    [textNotes, project.graphFrameLayers]
  );
  const mergedEmojiTableLayers = useMemo(
    () => mergeGraphLayerState(textNotes, project.graphEmojiLayers ?? emojiLayerStateFromLegacyTagState(project.graphLayers), 'emoji'),
    [textNotes, project.graphEmojiLayers, project.graphLayers]
  );
  const mergedTableLayers =
    tableGraphLayerStandard === 'frame'
      ? mergedFrameTableLayers
      : tableGraphLayerStandard === 'emoji'
        ? mergedEmojiTableLayers
        : mergedTagTableLayers;

  const handleTableGraphLayersChange = useCallback(
    (next: GraphLayerState) => {
      if (!onUpdateProject) return;
      if (tableGraphLayerStandard === 'frame') {
        void onUpdateProject(project, { graphFrameLayers: next });
      } else if (tableGraphLayerStandard === 'emoji') {
        void onUpdateProject(project, { graphEmojiLayers: next });
      } else {
        void onUpdateProject(project, { graphLayers: next });
      }
    },
    [onUpdateProject, project, tableGraphLayerStandard]
  );

  const handleTableLayerStandardChange = useCallback(
    (standard: GraphLayerGroupStandard) => {
      if (!onUpdateProject) return;
      void onUpdateProject(project, { graphLayerStandard: standard });
    },
    [onUpdateProject, project]
  );

  const handleTableBatchNotes = useCallback(
    async (nextSubset: Note[]) => {
      if (!onUpdateProject) return;
      const map = new Map(nextSubset.map((n) => [n.id, n]));
      const mergedAll = project.notes.map((n) => map.get(n.id) ?? n);
      await onUpdateProject(project, { notes: mergedAll });
    },
    [onUpdateProject, project]
  );

  const handleUpdateFrameTitle = useCallback(
    async (frameId: string, nextTitle: string) => {
      if (!onUpdateProject) return;
      const nextFrames = (project.frames ?? []).map((f) => (f.id === frameId ? { ...f, title: nextTitle } : f));
      await onUpdateProject(project, { frames: nextFrames });
    },
    [onUpdateProject, project]
  );

  const confirmPendingDelete = async () => {
    if (!pendingDelete || deleteSubmitting) return;
    setDeleteSubmitting(true);
    try {
      if (pendingDelete.kind === 'note' && onDeleteNote) {
        await onDeleteNote(pendingDelete.noteId);
      } else if (pendingDelete.kind === 'connection' && onUpdateConnections) {
        await onUpdateConnections(connections.filter((c) => c.id !== pendingDelete.connectionId));
      }
      setPendingDelete(null);
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const downloadCurrentTable = useCallback(() => {
    const base = sanitizeFilenamePart(project.name);
    const ts = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '').replace('T', '_');
    if (activeSubView === 'points') {
      const header = ['分组', '节点ID', '标题', '正文', '时间段', '标签'];
      const rows: (string | number | undefined | null)[][] = [header];
      const std = (project.graphLayerStandard ?? 'tag') as GraphLayerGroupStandard;
      const merged =
        std === 'frame'
          ? mergeGraphLayerState(textNotes, project.graphFrameLayers ?? null, 'frame')
          : std === 'emoji'
            ? mergeGraphLayerState(textNotes, project.graphEmojiLayers ?? emojiLayerStateFromLegacyTagState(project.graphLayers), 'emoji')
            : mergeGraphLayerState(textNotes, project.graphLayers ?? null, 'tag');
      const fm = new Map((project.frames ?? []).map((f) => [String(f.id).trim(), f]));
      for (const key of merged.order) {
        const gl = groupDisplayLabel(String(key).trim(), std, fm);
        const inGroup = textNotes.filter((n) => noteBelongsToLayerGroupKey(n, String(key).trim(), std));
        for (const note of inGroup) {
          rows.push([
            gl,
            note.id,
            noteRowTitle(note),
            note.text || '',
            formatNoteYearRange(note),
            note.tags.map((t) => t.label).join('; '),
          ]);
        }
      }
      triggerDownloadCsv(`${base}_节点表_${ts}.csv`, buildCsv(rows));
      return;
    }
    const header = ['起点ID', '起点标题', '方向', '终点ID', '终点标题', '关系说明', '连接ID'];
    const rows: (string | number | undefined | null)[][] = [header];
    for (const c of connections) {
      const fromNote = noteById.get(c.fromNoteId);
      const toNote = noteById.get(c.toNoteId);
      rows.push([
        c.fromNoteId,
        noteRowTitle(fromNote),
        edgeDirectionHint(c),
        c.toNoteId,
        noteRowTitle(toNote),
        c.label || '',
        c.id,
      ]);
    }
    triggerDownloadCsv(`${base}_关联表_${ts}.csv`, buildCsv(rows));
  }, [activeSubView, textNotes, connections, noteById, project.name, project.graphLayerStandard, project.graphLayers, project.graphEmojiLayers, project.graphFrameLayers, project.frames]);

  const rowTrashBtn =
    'opacity-0 pointer-events-none transition-all group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50';

  const toggleConnectionPanel = useCallback(() => {
    setShowSettingsPanel(false);
    setShowConnectionPanel((open) => !open);
  }, []);

  const handleNewConnection = useCallback(() => {
    setPanelEditingKey('new');
    setConnectionDraft({
      fromNoteId: '',
      toNoteId: '',
      label: '',
      fromArrow: 'none',
      toArrow: 'arrow',
      weight: DEFAULT_CONNECTION_WEIGHT
    });
    setPickTarget(null);
  }, []);

  const openConnectionEditor = useCallback((connection: Connection) => {
    setPanelEditingKey(connection.id);
    setConnectionDraft(connectionToPanelDraft(connection));
    setPickTarget(null);
    setShowConnectionPanel(true);
  }, []);

  const commitConnectionDraft = useCallback(() => {
    if (!onUpdateConnections) return;
    const { fromNoteId, toNoteId, label, fromArrow, toArrow, weight } = connectionDraft;
    if (!fromNoteId || !toNoteId) {
      window.alert('请选择起点和终点后再保存。');
      return;
    }
    if (fromNoteId === toNoteId) {
      window.alert('起点与终点不能是同一便签。');
      return;
    }
    const trimmedLabel = label.trim();
    const connWeight = clampConnectionWeight(weight);
    const arrow: Connection['arrow'] =
      toArrow === 'arrow' && fromArrow === 'none'
        ? 'forward'
        : fromArrow === 'arrow' && toArrow === 'none'
          ? 'reverse'
          : 'none';
    if (panelEditingKey === 'new') {
      const newConn: Connection = {
        id: generateId(),
        fromNoteId,
        toNoteId,
        fromSide: 'bottom',
        toSide: 'top',
        label: trimmedLabel || undefined,
        fromArrow,
        toArrow,
        arrow,
        weight: connWeight
      };
      void onUpdateConnections([...connections, newConn]);
    } else {
      const existing = connections.find((c) => c.id === panelEditingKey);
      if (!existing) {
        window.alert('当前编辑的连线已不存在，请关闭面板后重试。');
        return;
      }
      void onUpdateConnections(
        connections.map((c) =>
          c.id === panelEditingKey
            ? {
                ...c,
                fromNoteId,
                toNoteId,
                label: trimmedLabel || undefined,
                fromArrow,
                toArrow,
                arrow,
                weight: connWeight
              }
            : c
        )
      );
    }
    setShowConnectionPanel(false);
    setPickTarget(null);
  }, [connectionDraft, connections, onUpdateConnections, panelEditingKey]);

  const handleDeleteConnectionByPanel = useCallback(() => {
    if (!onUpdateConnections || panelEditingKey === 'new') return;
    void onUpdateConnections(connections.filter((c) => c.id !== panelEditingKey));
    setShowConnectionPanel(false);
    setPickTarget(null);
    setPanelEditingKey('new');
  }, [connections, onUpdateConnections, panelEditingKey]);

  /** 与 GraphView 关联面板一致：行末减号需可清草稿并退出点选（无画布时仅改 state） */
  const clearTableConnectionPanelGraphAndDraft = useCallback(() => {
    setPickTarget(null);
    if (panelEditingKey === 'new') {
      setConnectionDraft((d) => ({ ...d, fromNoteId: '', toNoteId: '' }));
    } else {
      setPanelEditingKey('new');
      setConnectionDraft({
        fromNoteId: '',
        toNoteId: '',
        label: '',
        fromArrow: 'none',
        toArrow: 'arrow',
        weight: DEFAULT_CONNECTION_WEIGHT
      });
    }
  }, [panelEditingKey]);

  const clearTableConnectionFromOnly = useCallback(() => {
    setPickTarget(null);
    setPanelEditingKey('new');
    setConnectionDraft((d) => ({ ...d, fromNoteId: '' }));
  }, []);

  const clearTableConnectionToOnly = useCallback(() => {
    setPickTarget(null);
    setPanelEditingKey('new');
    setConnectionDraft((d) => ({ ...d, toNoteId: '' }));
  }, []);

  /** 与左上角设置、系统状态栏错开，避免分组标题紧贴视口顶 */
  const tableScrollTopPad =
    'max(5.5rem, calc(env(safe-area-inset-top, 0px) + 3.25rem))';

  const activateTableNote = useCallback(
    async (note: Note) => {
      if (note.id === editorNoteId) return;
      await editorSaveDraftRef.current?.();
      setEditorNoteId(note.id);
    },
    [editorNoteId]
  );

  return (
    <div className={`workspace-canvas relative h-full flex flex-col min-h-0 ${
      chromeAppearance === 'dark' ? 'workspace-canvas--dark' : ''
    }`}>
      <TableTopLeftSettingsButton
        isUIVisible={isUIVisible}
        themeColor={themeColor}
        chromeSurfaceStyle={ch}
        chromeHoverBackground={chHover}
        settingsOpen={showSettingsPanel}
        settingsButtonRef={settingsButtonRef}
        onOpenSettings={() => {
          setShowConnectionPanel(false);
          setPickTarget(null);
          setShowSettingsPanel((v) => !v);
        }}
      />
      <TableTopRightDownloadButton
        isUIVisible={isUIVisible}
        chromeSurfaceStyle={ch}
        chromeHoverBackground={chHover}
        onDownload={downloadCurrentTable}
        subView={activeSubView}
      />
      <TableWindowNavigator
        visible={isUIVisible && isWideTableCanvas && activeSubView === 'points' && !!editorNoteId}
        detailVisible={isCanvasMediaDetailOpen}
        position={windowNavigatorPosition}
        themeColor={themeColor}
        panelChromeStyle={panelChromeStyle}
        onPreview={previewWindowNavigator}
        onCommit={commitWindowNavigator}
      />
      {edgesTableEnabled ? (
        <GraphTopCenterConnectionButton
          visible={isUIVisible && activeSubView === 'edges' && !!onUpdateConnections}
          chromeSurfaceStyle={ch}
          chromeHoverBackground={chHover}
          showConnectionPanel={showConnectionPanel}
          onToggleConnectionPanel={toggleConnectionPanel}
        />
      ) : null}
      <div
        ref={canvasViewportRef}
        className={isWideTableCanvas
          ? `table-node-canvas relative flex-1 min-h-0 overflow-hidden box-border ${
              chromeAppearance === 'dark' ? 'workspace-canvas--dark ' : ''
            }${isCanvasDragging ? 'cursor-grabbing' : 'cursor-grab'}`
          : `flex-1 min-h-0 overflow-auto px-4 sm:px-6 box-border ${edgesTableEnabled ? 'pb-28' : 'pb-8'}`}
        style={isWideTableCanvas ? { touchAction: 'none' } : { paddingTop: tableScrollTopPad }}
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handleCanvasPointerMove}
        onPointerUp={finishCanvasDrag}
        onPointerCancel={finishCanvasDrag}
        onDoubleClick={(event) => {
          if (!isWideTableCanvas) return;
          const target = event.target as Element;
          if (!target.closest('[data-table-canvas-window]')) setCanvasPan({ x: 0, y: 0 });
        }}
      >
        <div
          className={isWideTableCanvas
            ? 'table-node-canvas-stage absolute flex w-max items-start gap-6 pb-24'
            : undefined}
          style={isWideTableCanvas
            ? {
                top: tableScrollTopPad,
                left: `calc(50% + ${canvasPan.x - listWindowWidth / 2}px)`,
                marginTop: canvasPan.y,
                transition: isCanvasAutoPanning && !isCanvasDragging
                  ? 'left 380ms cubic-bezier(0.22, 1, 0.36, 1), margin-top 380ms cubic-bezier(0.22, 1, 0.36, 1)'
                  : undefined,
                willChange: isCanvasDragging ? 'left, margin-top' : undefined
              }
            : undefined}
        >
        <div
          ref={listWindowRef}
          data-table-canvas-window={isWideTableCanvas ? 'list' : undefined}
          className={isWideTableCanvas
            ? activeSubView === 'points'
              ? `${editorNoteId ? 'w-[28rem]' : 'w-[36rem]'} max-w-[calc(100vw-6rem)] shrink-0 cursor-auto`
              : 'w-[min(60rem,calc(100vw-6rem))] shrink-0 cursor-auto'
            : undefined}
        >
        {activeSubView === 'points' ? (
          <>
            {onUpdateProject ? (
              <div className="relative mb-6 w-full max-w-xl mx-auto">
                <ProjectNotesLayerPanel
                  embed
                  themeColor={themeColor}
                  panelChromeStyle={panelChromeStyle}
                  variant="dock"
                  dockAlign="start"
                  projectId={projectId || project.id}
                  merged={mergedTableLayers}
                  layerGroupStandard={tableGraphLayerStandard}
                  onLayerGroupStandardChange={handleTableLayerStandardChange}
                  onStateChange={handleTableGraphLayersChange}
                  notes={textNotes}
                  onUpdateNote={onUpdateNote}
                  onBatchUpdateNotes={handleTableBatchNotes}
                  frames={project.frames ?? []}
                  onActivateNote={(n) => void activateTableNote(n)}
                  tableMode
                  onUpdateFrameTitle={handleUpdateFrameTitle}
                />
              </div>
            ) : (
              <p className="mb-4 text-sm text-gray-500">只读模式：筛选面板需要项目写入权限。</p>
            )}
            {textNotes.length === 0 ? (
              <div className="py-12 text-center italic text-gray-400">暂无便签数据</div>
            ) : null}
          </>
        ) : (
          <div className="mb-8">
            <h3 className="text-base font-bold text-gray-700 mb-3">关联表</h3>
            <div className="bg-white rounded-2xl shadow-sm w-full overflow-hidden">
              <div className="overflow-x-auto">
                <div className="min-w-[36rem]">
                  <div className="flex gap-2 px-3 sm:px-4 py-2 bg-gray-100 font-bold text-sm text-gray-600 border-b border-gray-200">
                    <div className="flex-1 min-w-[7rem]">起点（节点）</div>
                    <div className="w-8 flex-shrink-0 text-center text-gray-400" title="方向">
                      向
                    </div>
                    <div className="flex-1 min-w-[7rem]">终点（节点）</div>
                    <div className="w-[min(12rem,30%)] flex-shrink-0">标签</div>
                    <div className="w-10 flex-shrink-0 text-right"> </div>
                  </div>
                  {connections.map((c) => {
                    const fromNote = noteById.get(c.fromNoteId);
                    const toNote = noteById.get(c.toNoteId);
                    return (
                      <div
                        key={c.id}
                        className="group flex gap-2 items-center px-3 sm:px-4 py-2.5 border-b border-gray-100 text-sm cursor-pointer hover:bg-gray-50"
                        onClick={() => openConnectionEditor(c)}
                      >
                        <div className="flex-1 min-w-[7rem] text-gray-800 whitespace-nowrap overflow-hidden text-ellipsis" title={noteRowTitle(fromNote)}>
                          {noteRowTitle(fromNote)}
                        </div>
                        <div className="w-8 flex-shrink-0 text-center text-gray-500 font-mono" title="与关系图一致的箭头方向">
                          {edgeDirectionHint(c)}
                        </div>
                        <div className="flex-1 min-w-[7rem] text-gray-800 whitespace-nowrap overflow-hidden text-ellipsis" title={noteRowTitle(toNote)}>
                          {noteRowTitle(toNote)}
                        </div>
                        <div className="w-[min(12rem,30%)] flex-shrink-0">
                          {onUpdateConnections ? (
                            <input
                              key={`${c.id}-${c.label ?? ''}`}
                              defaultValue={c.label || ''}
                              onBlur={(e) => {
                                const v = e.target.value;
                                if (v === (c.label || '')) return;
                                onUpdateConnections(
                                  connections.map((x) => (x.id === c.id ? { ...x, label: v } : x))
                                );
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="w-full px-2 py-1.5 rounded-lg border border-gray-200/80 bg-white text-xs outline-none focus:ring-2 focus:ring-offset-0"
                              style={{ ['--tw-ring-color' as string]: themeColor }}
                            />
                          ) : (
                            <span className="text-gray-600 text-xs">{c.label || '—'}</span>
                          )}
                        </div>
                        <div className="w-10 flex-shrink-0 flex justify-end">
                          {onUpdateConnections ? (
                            <button
                              type="button"
                              title="删除关联"
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                setPendingDelete({ kind: 'connection', connectionId: c.id });
                              }}
                              className={rowTrashBtn}
                            >
                              <Trash2 size={16} />
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                  {connections.length === 0 && (
                    <div className="p-8 text-center text-gray-400 italic">暂无关联，可在看板连接便签后在此查看</div>
                  )}
                </div>
              </div>
            </div>
            {!onUpdateConnections && connections.length > 0 ? (
              <p className="mt-2 text-xs text-gray-500">当前为只读列表；完整编辑请在看板或图谱中操作。</p>
            ) : null}
          </div>
        )}

        </div>

        <NoteEditor
          initialNote={project.notes.find(n => n.id === editorNoteId)}
          isOpen={!!editorNoteId}
          onClose={() => setEditorNoteId(null)}
          saveDraftRef={editorSaveDraftRef}
          onSave={(updatedNote) => {
            if (editorNoteId) {
              const existingNote = project.notes.find(n => n.id === editorNoteId);
              if (existingNote) {
                onUpdateNote({ ...existingNote, ...updatedNote });
              }
            }
          }}
          onSwitchToBoardView={onSwitchToBoardView}
          onSwitchToMapView={onSwitchToMapView}
          onSwitchToGraphView={onSwitchToGraphView}
          themeColor={themeColor}
          mapUiChromeOpacity={mapUiChromeOpacity}
          mapUiChromeBlurPx={mapUiChromeBlurPx}
          presentation={isWideTableCanvas ? 'canvas-window' : 'modal'}
          onCanvasMediaDetailOpenChange={handleCanvasMediaDetailOpenChange}
        />
        </div>

      {edgesTableEnabled && showConnectionPanel && onUpdateConnections && isUIVisible && (
        <GraphConnectionPanel
          isOpen
          themeColor={themeColor}
          panelChromeStyle={panelChromeStyle}
          notes={project.notes}
          draft={connectionDraft}
          onDraftChange={(patch) => setConnectionDraft((d) => ({ ...d, ...patch }))}
          panelEditingKey={panelEditingKey}
          pickTarget={pickTarget}
          onPickTargetChange={setPickTarget}
          onCommit={commitConnectionDraft}
          onDelete={handleDeleteConnectionByPanel}
          onNewConnection={handleNewConnection}
          onBeginEndpointEdit={handleNewConnection}
          disableGraphPick
          graphPickDisabledHint="请到 GraphView 选点"
          onClearGraphAndDraftSelection={clearTableConnectionPanelGraphAndDraft}
          onClearFromSelection={clearTableConnectionFromOnly}
          onClearToSelection={clearTableConnectionToOnly}
          showClearSelection={
            !!pickTarget || !!connectionDraft.fromNoteId || !!connectionDraft.toNoteId
          }
          onClose={() => {
            setShowConnectionPanel(false);
            setPickTarget(null);
          }}
        />
      )}

      </div>

      {edgesTableEnabled && (isWideTableCanvas || !editorNoteId) ? (
        <TableBottomSubViewBar
          panelChromeStyle={panelChromeStyle}
          themeColor={themeColor}
          subView={subView}
          onChangeSubView={setSubView}
        />
      ) : null}

      <SettingsPanel
        isOpen={showSettingsPanel}
        onClose={() => setShowSettingsPanel(false)}
        anchorRef={settingsButtonRef}
        settingsContextView="table"
        themeColor={themeColor}
        onThemeColorChange={onThemeColorChange ?? (() => {})}
        uiDarkMode={uiDarkMode}
        onUiDarkModeChange={onUiDarkModeChange}
        mapUiChromeOpacity={mapUiChromeOpacity}
        onMapUiChromeOpacityChange={onMapUiChromeOpacityChange ?? (() => {})}
        mapUiChromeBlurPx={mapUiChromeBlurPx}
        onMapUiChromeBlurPxChange={onMapUiChromeBlurPxChange ?? (() => {})}
        currentMapStyle={mapStyleId}
        onMapStyleChange={onMapStyleChange ?? (() => {})}
        graphProject={project}
        onGraphProjectPatch={
          onUpdateProject && projectId
            ? (patch) => void onUpdateProject(projectId, patch)
            : undefined
        }
      />

      <DeleteConfirmDialog
        open={!!pendingDelete}
        variant={pendingDelete?.kind === 'connection' ? 'connection' : 'note'}
        titleHint={pendingDelete?.kind === 'note' ? pendingDelete.titleHint : undefined}
        confirming={deleteSubmitting}
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmPendingDelete}
        themeColor={themeColor}
        panelChromeStyle={panelChromeStyle}
      />
    </div>
  );
};
