import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type cytoscape from 'cytoscape';
import { Core, EdgeSingular, NodeSingular } from 'cytoscape';
import { NotePreviewCard } from './map/overlays/NotePreviewCard';
import { NoteEditor } from './NoteEditor';
import { SettingsPanel } from './SettingsPanel';
import type { Connection, Frame, GraphLayerState, Note, Project } from '../types';
import { DEFAULT_THEME_COLOR } from '../constants';
import {
  buildGraphElements,
  buildGraphExportPayload,
  clampConnectionWeight,
  DEFAULT_CONNECTION_WEIGHT,
  DEFAULT_GRAPH_COSE_TIME_X_BIAS,
  DEFAULT_GRAPH_EDGE_ELASTICITY,
  DEFAULT_GRAPH_STYLESHEET_SIZING,
  DEFAULT_GRAPH_TIME_AXIS_WEIGHT_BIAS,
  getGraphStylesheet,
  graphNodeStructureKey,
  applyGraphHighlightLabelScreenSize
} from '../utils/graph/graphData';
import { buildStandaloneGraphHtml, downloadTextFile } from '../utils/graph/graphExportHtml';
import { downloadMappVizJson } from '../utils/export/mappVizJson';
import { attachBoardlikeWheelZoom, createAppGraphCy } from '../utils/graph/graphRuntime';
import {
  applyGraphLayout,
  applyGraphLayoutMode,
  applyGraphTimeLayout,
  coerceGraphLayoutMode,
  DEFAULT_GRAPH_LAYOUT_MODE,
  type GraphLayoutMode,
  type GraphTimeLayoutOptions,
  applyGraphHoverHighlight,
  applyGraphNeighborHighlight,
  collectRelatedEdgeLabelEntries,
  flattenRelatedEdgeLabelGroups,
  type RelatedEdgeLabelColumn,
  attachGraphResizeObserver,
  downloadGraphPayloadJson,
  mergeGraphLayerState,
  patchGraphElementsData,
  scheduleGraphResizeAndFit,
  updateGraphStylesheet,
  animateGraphCenterOnNode,
  applyGraphDualLayerNodeVisibility,
  applyGraphNodeStackZIndex,
  setGraphCoseTimeXBias,
  setGraphEdgeElasticity,
  syncGraphEdgeCurveDistances,
  GRAPH_UNTAGGED_TAG_GROUP
} from '../utils/graph/graphRuntimeCore';
import { getGraphLayoutCache, setGraphLayoutCache } from '../utils/persistence/storage';
import {
  GRAPH_CLUSTER_BASIS_FRAME,
  isFrameClusterBasis,
  normalizeGraphClusterBasis,
  buildGraphNodeColorLegendItems,
  type GraphNodeColorLegendItem
} from '../utils/graph/graphClusterBasis';
import {
  applyGraphViewPresetToCy,
  applyGraphViewPresetVisibility,
  captureGraphViewPreset,
  deletePresetInStore,
  loadGraphPresetsStore,
  renamePresetInStore,
  saveGraphPresetsStore,
  upsertPresetInStore,
  type GraphPresetsStore
} from '../utils/graph/graphPresets';
import { tagHierarchyPrefix } from '../utils/layer/tagHierarchy';
import { GraphConnectionPanel, connectionToPanelDraft, type ConnectionDraft } from './graph/GraphConnectionPanel';
import { GraphHighlightChromeLabels } from './graph/GraphHighlightChromeLabels';
import { GraphRelatedHighlightPanel } from './graph/GraphRelatedHighlightPanel';
import { applyWorkspaceRightEdgeForInspector } from '../utils/ui/chromeMenuPosition';
import { AnimatedEditInspectorPanel } from './editInspector/EditInspectorProvider';
import { GraphTopLeftToolbar } from './graph/GraphTopLeftToolbar';
import { GraphTopCenterConnectionButton } from './graph/GraphTopCenterConnectionButton';
import { GraphTopRightToolbar } from './graph/GraphTopRightToolbar';
import { GraphLayoutModeBar } from './graph/GraphLayoutModeBar';
import { generateId } from '../utils';

interface GraphViewProps {
  /** 用于会话内记住图谱二级布局（切换一级视图后再回来仍保留） */
  projectId: string;
  project: Project;
  themeColor?: string;
  /** 完整 UI 时展示 NoteEditor；Tab 预览模式（false）不展示，与导出页一致 */
  isUIVisible?: boolean;
  onUpdateNote: (note: Note) => void;
  onDeleteNote?: (noteId: string) => void;
  onToggleEditor?: (open: boolean) => void;
  onUpdateConnections?: (connections: Connection[]) => void;
  onSwitchToBoardView?: (coords?: { x: number; y: number }) => void;
  onSwitchToMapView?: (coords?: { lat: number; lng: number; zoom?: number }) => void;
  /** Table/其它视图「定位到图谱」：切换进来后聚焦该节点 */
  navigateToGraphNoteId?: string | null;
  onClearGraphNavigation?: () => void;
  panelChromeStyle?: React.CSSProperties;
  chromeHoverBackground?: string;
  onThemeColorChange?: (color: string) => void;
  mapUiChromeOpacity?: number;
  onMapUiChromeOpacityChange?: (opacity: number) => void;
  mapUiChromeBlurPx?: number;
  onMapUiChromeBlurPxChange?: (blurPx: number) => void;
  mapStyleId?: string;
  onMapStyleChange?: (styleId: string) => void;
  onUpdateProject?: (projectOrId: Project | string, updates?: Partial<Project>) => void | Promise<void>;
  /** 与 Map / Board 共用的视图编辑模式（由 App 持有，切换视图时保持） */
  workspaceEditMode: boolean;
  onWorkspaceEditModeChange: (edit: boolean) => void;
}

export const GraphView: React.FC<GraphViewProps> = ({
  projectId,
  project,
  themeColor = DEFAULT_THEME_COLOR,
  isUIVisible = true,
  onUpdateNote,
  onDeleteNote,
  onToggleEditor,
  onUpdateConnections,
  onSwitchToBoardView,
  onSwitchToMapView,
  navigateToGraphNoteId,
  onClearGraphNavigation,
  panelChromeStyle,
  chromeHoverBackground,
  onThemeColorChange,
  mapUiChromeOpacity = 0.9,
  onMapUiChromeOpacityChange,
  mapUiChromeBlurPx = 8,
  onMapUiChromeBlurPxChange,
  mapStyleId = 'carto-light-nolabels',
  onMapStyleChange,
  onUpdateProject,
  workspaceEditMode,
  onWorkspaceEditModeChange
}) => {
  const ch = panelChromeStyle;
  const chHover = chromeHoverBackground;
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const [showTagLayerPanel, setShowTagLayerPanel] = useState(false);
  const [showFrameLayerPanel, setShowFrameLayerPanel] = useState(false);
  /** 临时图谱预设（IndexedDB，不进项目 JSON） */
  const [graphPresetsStore, setGraphPresetsStore] = useState<GraphPresetsStore>({
    presets: [],
    activePresetId: null
  });
  /** 应用预设后覆盖左下角图例顺序；布局/依据变更时清空 */
  const [presetLegendOverride, setPresetLegendOverride] = useState<GraphNodeColorLegendItem[] | null>(
    null
  );
  const isGraphToolbarEditMode = workspaceEditMode;

  useEffect(() => {
    const active = isUIVisible && isGraphToolbarEditMode;
    const apply = () => applyWorkspaceRightEdgeForInspector(active);
    apply();
    window.addEventListener('resize', apply);
    return () => {
      window.removeEventListener('resize', apply);
      applyWorkspaceRightEdgeForInspector(false);
    };
  }, [isUIVisible, isGraphToolbarEditMode]);

  const containerRef = useRef<HTMLDivElement>(null);
  const graphStageRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  /** cy 实例重建后通知 HTML label 层重新绑定事件 */
  const [graphCyEpoch, setGraphCyEpoch] = useState(0);
  const unbindRef = useRef<(() => void) | null>(null);
  const noteByIdRef = useRef<Map<string, Note>>(new Map());
  const connectionsRef = useRef<Connection[]>([]);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  /** Shift 多选集合；普通单击时与 focusedNodeId 同步为单元素 */
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(() => new Set());
  const selectedNodeIdsRef = useRef(selectedNodeIds);
  selectedNodeIdsRef.current = selectedNodeIds;
  /** 框选结束后吞掉紧随其后的背景 tap，避免清空多选 */
  const ignoreNextGraphBgTapRef = useRef(false);
  const [hoveredNote, setHoveredNote] = useState<Note | null>(null);
  const [chainLength, setChainLength] = useState<number>(1);
  const chainLengthRef = useRef<number>(1);
  chainLengthRef.current = chainLength;
  /** 关联高亮：按边标签临时筛选（默认全选） */
  const [relatedHighlightLabelKeys, setRelatedHighlightLabelKeys] = useState<Set<string>>(
    () => new Set()
  );
  const relatedHighlightLabelKeysRef = useRef(relatedHighlightLabelKeys);
  relatedHighlightLabelKeysRef.current = relatedHighlightLabelKeys;
  const prevRelatedLabelAvailRef = useRef<Set<string>>(new Set());
  const relatedFilterFocusRef = useRef<string | null>(null);
  const mapUiChromeRef = useRef({ opacity: mapUiChromeOpacity, blurPx: mapUiChromeBlurPx });
  mapUiChromeRef.current = { opacity: mapUiChromeOpacity, blurPx: mapUiChromeBlurPx };
  const [previewImageIndex, setPreviewImageIndex] = useState(0);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [hoveredConnectionId, setHoveredConnectionId] = useState<string | null>(null);
  const [edgeLabelDraft, setEdgeLabelDraft] = useState('');
  const [showConnectionPanel, setShowConnectionPanel] = useState(false);
  const showConnectionPanelRef = useRef(showConnectionPanel);
  showConnectionPanelRef.current = showConnectionPanel;
  const [panelEditingKey, setPanelEditingKey] = useState<string | 'new'>('new');
  const [connectionDraft, setConnectionDraft] = useState<ConnectionDraft>(() => ({
    fromNoteId: '',
    toNoteId: '',
    label: '',
    fromArrow: 'none',
    toArrow: 'arrow',
    weight: DEFAULT_CONNECTION_WEIGHT
  }));
  const [pickTarget, setPickTarget] = useState<'from' | 'to' | null>(null);
  /** 图中点选节点后递增，驱动面板清空检索并不聚焦输入框 */
  const [graphPickNonce, setGraphPickNonce] = useState(0);
  /** 关联保存成功后递增，驱动面板成功动效（不关面板，随后进入下一条新建） */
  const [connectionSaveSuccessNonce, setConnectionSaveSuccessNonce] = useState(0);
  /** 保存成功动效与草稿重置期间，禁止重复提交 */
  const [connectionPanelSaveResetting, setConnectionPanelSaveResetting] = useState(false);
  const connectionSaveResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectionPanelCommitCooldownRef = useRef(false);
  /** 关联点选 / 单击节点：不打开便签编辑器；双击节点才打开（与 graphNodeTapTimerRef 配合） */
  const [noteEditorSuppressedForGraphConnection, setNoteEditorSuppressedForGraphConnection] =
    useState(false);
  /** 区分节点单击与双击：单击延迟落盘，dbltap 时清除定时器并改为打开编辑器 */
  const graphNodeTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeGraphLayout, setActiveGraphLayout] = useState<GraphLayoutMode>(() => {
    if (projectId) {
      const c = getGraphLayoutCache(projectId);
      if (c) return c;
    }
    return coerceGraphLayoutMode(project.graphDefaultLayoutMode);
  });

  const activeGraphLayoutRef = useRef(activeGraphLayout);
  activeGraphLayoutRef.current = activeGraphLayout;

  /** cytoscape 回调闭包不随 render 更新，用 ref 读连线面板 + 点选模式 */
  const graphUiRef = useRef({
    showConnectionPanel: false,
    pickTarget: null as 'from' | 'to' | null,
    isGraphToolbarEditMode: false
  });
  graphUiRef.current = {
    showConnectionPanel,
    pickTarget,
    isGraphToolbarEditMode: workspaceEditMode
  };

  /** 保存时避免读到过期 connectionDraft / panelEditingKey（批处理或闭包滞后） */
  const connectionDraftRef = useRef(connectionDraft);
  connectionDraftRef.current = connectionDraft;
  const panelEditingKeyRef = useRef(panelEditingKey);
  panelEditingKeyRef.current = panelEditingKey;

  const notes = project.notes || [];
  const connections = project.connections || [];
  connectionsRef.current = connections;

  const graphStylesheetSizing = useMemo(() => {
    const nodeSize = project.graphNodeSize ?? DEFAULT_GRAPH_STYLESHEET_SIZING.nodeSize;
    const labelFontPx = project.graphLabelFontPx ?? DEFAULT_GRAPH_STYLESHEET_SIZING.labelFontPx;
    const edgeWeight = project.graphEdgeWeight ?? DEFAULT_GRAPH_STYLESHEET_SIZING.edgeWeight;
    const edgeLabelFontPx =
      project.graphEdgeLabelFontPx ?? DEFAULT_GRAPH_STYLESHEET_SIZING.edgeLabelFontPx;
    return {
      nodeSize: Math.min(36, Math.max(1, nodeSize)),
      labelFontPx: Math.min(16, Math.max(4, labelFontPx)),
      edgeWeight: Math.min(4, Math.max(0.1, Math.round(edgeWeight * 10) / 10)),
      edgeLabelFontPx: Math.min(16, Math.max(3, Math.round(edgeLabelFontPx)))
    };
  }, [
    project.graphNodeSize,
    project.graphLabelFontPx,
    project.graphEdgeWeight,
    project.graphEdgeLabelFontPx
  ]);
  const graphStylesheetSizingRef = useRef(graphStylesheetSizing);
  graphStylesheetSizingRef.current = graphStylesheetSizing;

  /** 未设置时默认开启 bezier 曲线连线 */
  const graphEdgeCurve = project.graphEdgeCurve !== false;
  const graphEdgeCurveRef = useRef(graphEdgeCurve);
  graphEdgeCurveRef.current = graphEdgeCurve;

  const mergedTagGraphLayers = useMemo(
    () => mergeGraphLayerState(notes, project.graphLayers ?? null, 'tag'),
    [notes, project.graphLayers]
  );

  const mergedFrameGraphLayers = useMemo(
    () => mergeGraphLayerState(notes, project.graphFrameLayers ?? null, 'frame'),
    [notes, project.graphFrameLayers]
  );

  const mergedTagGraphLayersRef = useRef(mergedTagGraphLayers);
  mergedTagGraphLayersRef.current = mergedTagGraphLayers;
  const mergedFrameGraphLayersRef = useRef(mergedFrameGraphLayers);
  mergedFrameGraphLayersRef.current = mergedFrameGraphLayers;

  const syncDualLayerVisibility = useCallback((cy: Core) => {
    const tag = mergedTagGraphLayersRef.current;
    const frame = mergedFrameGraphLayersRef.current;
    applyGraphDualLayerNodeVisibility(
      cy,
      tag.hidden,
      frame.hidden,
      tag.tagVisibilityLogic ?? 'or'
    );
  }, []);

  /** 时间线聚类依据：簇图层或某一级标签前缀 */
  const clusterBasis = useMemo(() => {
    const raw = normalizeGraphClusterBasis(project.graphClusterBasis);
    if (isFrameClusterBasis(raw)) return GRAPH_CLUSTER_BASIS_FRAME;
    const prefixes = new Set(
      (mergedTagGraphLayers.order ?? [])
        .map((k) => tagHierarchyPrefix(String(k).trim()))
        .filter((p) => p && p !== GRAPH_UNTAGGED_TAG_GROUP)
    );
    return prefixes.has(raw) ? raw : GRAPH_CLUSTER_BASIS_FRAME;
  }, [project.graphClusterBasis, mergedTagGraphLayers.order]);

  const timeClusterLayers = isFrameClusterBasis(clusterBasis)
    ? mergedFrameGraphLayers
    : mergedTagGraphLayers;
  /**
   * 普通便签编辑会让 merged layer 对象换引用；布局 effect 必须读 ref，不能把对象身份
   * 当作“布局参数已变”，否则改标题 / Emoji / Weight 也会重跑时间线。
   */
  const timeClusterLayersRef = useRef(timeClusterLayers);
  timeClusterLayersRef.current = timeClusterLayers;

  const timeLayoutOpts = useMemo(
    (): GraphTimeLayoutOptions => ({
      weightBias: project.graphTimeAxisWeightBias ?? DEFAULT_GRAPH_TIME_AXIS_WEIGHT_BIAS,
      clusterBasis
    }),
    [project.graphTimeAxisWeightBias, clusterBasis]
  );

  const coseTimeXBias =
    project.graphCoseTimeXBias ?? DEFAULT_GRAPH_COSE_TIME_X_BIAS;
  const edgeElasticity =
    project.graphEdgeElasticity ?? DEFAULT_GRAPH_EDGE_ELASTICITY;

  /** 节点颜色图例：随聚类依据（簇 / 一级前缀下的首标签）与图层顺序；预设可覆盖 */
  const nodeColorLegendItems = useMemo(() => {
    if (presetLegendOverride && presetLegendOverride.length > 0) return presetLegendOverride;
    return buildGraphNodeColorLegendItems({
      notes,
      themeColor,
      frames: project.frames,
      clusterBasis,
      tagLayerOrder: mergedTagGraphLayers.order,
      frameLayerOrder: mergedFrameGraphLayers.order
    });
  }, [
    presetLegendOverride,
    notes,
    themeColor,
    project.frames,
    clusterBasis,
    mergedFrameGraphLayers.order,
    mergedTagGraphLayers.order
  ]);

  const legendLabelFontPx = graphStylesheetSizing.labelFontPx;

  const handleTagLayersChange = useCallback(
    (next: GraphLayerState) => {
      if (!onUpdateProject || !projectId) return;
      void onUpdateProject(projectId, { graphLayers: next });
    },
    [onUpdateProject, projectId]
  );

  const handleFrameLayersChange = useCallback(
    (next: GraphLayerState) => {
      if (!onUpdateProject || !projectId) return;
      void onUpdateProject(projectId, { graphFrameLayers: next });
    },
    [onUpdateProject, projectId]
  );

  const handleUpdateFrame = useCallback(
    (frame: Frame) => {
      if (!onUpdateProject || !projectId) return;
      const frames = (project.frames ?? []).map((f) => (f.id === frame.id ? frame : f));
      void onUpdateProject(projectId, { frames });
    },
    [onUpdateProject, projectId, project.frames]
  );

  const handleUpdateFrames = useCallback(
    (frames: Frame[]) => {
      if (!onUpdateProject || !projectId) return;
      void onUpdateProject(projectId, { frames });
    },
    [onUpdateProject, projectId]
  );

  /** 批量更新便签 notes：避免多次 updateNote 基于同一快照导致互相覆盖 */
  const handleBatchUpdateNotes = useCallback(
    async (nextNotes: Note[]) => {
      if (!onUpdateProject) return;
      await onUpdateProject({ ...project, notes: nextNotes });
    },
    [onUpdateProject, project]
  );

  const graphLayersOrderKey = useMemo(
    () => (timeClusterLayers.order ?? []).join('\u0001'),
    [timeClusterLayers.order]
  );

  const tagGraphLayersHiddenKey = useMemo(
    () => mergedTagGraphLayers.hidden.slice().sort().join('\u0001'),
    [mergedTagGraphLayers.hidden]
  );

  const tagGraphLayersWeightsKey = useMemo(
    () =>
      Object.entries(mergedTagGraphLayers.weights ?? {})
        .sort(([a], [b]) => a.localeCompare(b, 'zh-Hans-CN'))
        .map(([k, v]) => `${k}:${v}`)
        .join('\u0001'),
    [mergedTagGraphLayers.weights]
  );

  const frameGraphLayersHiddenKey = useMemo(
    () => mergedFrameGraphLayers.hidden.slice().sort().join('\u0001'),
    [mergedFrameGraphLayers.hidden]
  );

  const frameGraphLayersWeightsKey = useMemo(
    () =>
      Object.entries(mergedFrameGraphLayers.weights ?? {})
        .sort(([a], [b]) => a.localeCompare(b, 'zh-Hans-CN'))
        .map(([k, v]) => `${k}:${v}`)
        .join('\u0001'),
    [mergedFrameGraphLayers.weights]
  );

  /** 只有当前时间线分层的顺序 / 权重发生变化，才属于需要重排的显式布局设置。 */
  const graphLayersWeightsKey = isFrameClusterBasis(clusterBasis)
    ? frameGraphLayersWeightsKey
    : tagGraphLayersWeightsKey;

  const selectedConn = useMemo(
    () =>
      selectedConnectionId ? connections.find((c) => c.id === selectedConnectionId) ?? null : null,
    [connections, selectedConnectionId]
  );

  const persistGraphLayout = useCallback(
    (mode: GraphLayoutMode) => {
      if (projectId) setGraphLayoutCache(projectId, mode);
    },
    [projectId]
  );

  useEffect(() => {
    if (!projectId) {
      setActiveGraphLayout(coerceGraphLayoutMode(project.graphDefaultLayoutMode));
      return;
    }
    setActiveGraphLayout(
      getGraphLayoutCache(projectId) ?? coerceGraphLayoutMode(project.graphDefaultLayoutMode)
    );
  }, [projectId, project.graphDefaultLayoutMode]);

  const nodeStructureKey = useMemo(() => graphNodeStructureKey(notes), [notes]);
  /** 单节点图层显隐 / 叠放序变化时需重跑显隐与 z-index（不依赖节点增删） */
  const notesLayerVisualKey = useMemo(
    () =>
      notes
        .map(
          (n) =>
            `${n.id}\u0001${n.layerItemHidden ? 1 : 0}\u0001${n.layerStackOrder ?? n.createdAt}`
        )
        .sort()
        .join('\u0002'),
    [notes]
  );
  const edgeStructureKey = useMemo(
    () => connections.map((c) => c.id).slice().sort().join('\u0001'),
    [connections]
  );

  const noteById = useMemo(() => {
    const m = new Map<string, Note>();
    notes.forEach((n) => m.set(n.id, n));
    return m;
  }, [notes]);
  noteByIdRef.current = noteById;

  const clearSelection = useCallback(() => {
    if (graphNodeTapTimerRef.current) {
      clearTimeout(graphNodeTapTimerRef.current);
      graphNodeTapTimerRef.current = null;
    }
    const cy = cyRef.current;
    setFocusedNodeId(null);
    setSelectedNodeIds(new Set());
    setHoveredNote(null);
    setHoveredConnectionId(null);
    setSelectedConnectionId(null);
    setEdgeLabelDraft('');
    setNoteEditorSuppressedForGraphConnection(false);
    if (cy) {
      cy.elements().unselect();
      applyGraphNeighborHighlight(cy, null, chainLengthRef.current, null);
      syncDualLayerVisibility(cy);
    }
  }, [syncDualLayerVisibility]);

  /** 关闭节点编辑器但保留 hover（用于 NoteEditor 关闭/保存后） */
  const closeGraphNoteEditor = useCallback(() => {
    const cy = cyRef.current;
    setFocusedNodeId(null);
    setSelectedNodeIds(new Set());
    setNoteEditorSuppressedForGraphConnection(false);
    if (cy) {
      cy.elements().unselect();
      applyGraphNeighborHighlight(cy, null, chainLengthRef.current, null);
      syncDualLayerVisibility(cy);
    }
    onToggleEditor?.(false);
  }, [onToggleEditor, syncDualLayerVisibility]);

  /** 设置图节点选中：ids 为多选集合，primary 为主焦点（面板/编辑器用） */
  const setGraphNodeSelection = useCallback((ids: Set<string>, primary?: string | null) => {
    setSelectedNodeIds(ids);
    if (primary !== undefined) {
      setFocusedNodeId(primary);
      return;
    }
    if (ids.size === 0) {
      setFocusedNodeId(null);
      return;
    }
    setFocusedNodeId((prev) => (prev && ids.has(prev) ? prev : Array.from(ids)[0]));
  }, []);

  const selectedNodeIdsSig = useMemo(
    () => Array.from(selectedNodeIds).sort().join('\u0001'),
    [selectedNodeIds]
  );

  const highlightCenterIds = useMemo(
    () => (selectedNodeIds.size > 0 ? Array.from(selectedNodeIds) : null),
    [selectedNodeIds]
  );

  const focusedNote = useMemo(
    () => (focusedNodeId ? noteById.get(focusedNodeId) ?? null : null),
    [focusedNodeId, noteById]
  );

  const relatedEdgeLabelGroups = useMemo(() => {
    if (!focusedNodeId) return { from: [], to: [] };
    return collectRelatedEdgeLabelEntries(focusedNodeId, connections, chainLength);
  }, [focusedNodeId, connections, chainLength]);

  const relatedEdgeLabelEntries = useMemo(
    () => flattenRelatedEdgeLabelGroups(relatedEdgeLabelGroups),
    [relatedEdgeLabelGroups]
  );

  const relatedHighlightKeysSig = useMemo(
    () => Array.from(relatedHighlightLabelKeys).sort().join('\u0001'),
    [relatedHighlightLabelKeys]
  );

  /** 切换选中点 / 关系链变化：重建标签；已有键保留勾选，新增键默认勾选 */
  useEffect(() => {
    if (!focusedNodeId) {
      relatedFilterFocusRef.current = null;
      prevRelatedLabelAvailRef.current = new Set();
      setRelatedHighlightLabelKeys(new Set());
      return;
    }
    const availableKeys = relatedEdgeLabelEntries.map((e) => e.key);
    const focusChanged = relatedFilterFocusRef.current !== focusedNodeId;
    relatedFilterFocusRef.current = focusedNodeId;
    setRelatedHighlightLabelKeys((prev) => {
      if (focusChanged) return new Set(availableKeys);
      const prevAvail = prevRelatedLabelAvailRef.current;
      const next = new Set<string>();
      for (const key of availableKeys) {
        if (!prevAvail.has(key) || prev.has(key)) next.add(key);
      }
      return next;
    });
    prevRelatedLabelAvailRef.current = new Set(availableKeys);
  }, [focusedNodeId, relatedEdgeLabelEntries]);

  const allRelatedLabelKeysFor = useCallback((noteId: string) => {
    const groups = collectRelatedEdgeLabelEntries(
      noteId,
      connectionsRef.current,
      chainLengthRef.current
    );
    return new Set(flattenRelatedEdgeLabelGroups(groups).map((e) => e.key));
  }, []);

  const applyNeighborHighlightNow = useCallback(
    (cy: Core, noteId: string | null | readonly string[], keys?: Set<string> | null) => {
      if (!noteId || (Array.isArray(noteId) && noteId.length === 0)) {
        applyGraphNeighborHighlight(cy, null, chainLengthRef.current, null);
        syncDualLayerVisibility(cy);
        return;
      }
      const singleId = typeof noteId === 'string' ? noteId : noteId.length === 1 ? noteId[0] : null;
      const allow =
        keys !== undefined
          ? keys
          : singleId
            ? relatedHighlightLabelKeysRef.current
            : null;
      applyGraphNeighborHighlight(cy, noteId, chainLengthRef.current, allow);
      // 高亮后再同步显隐：临时显示被高亮的隐藏节点；取消勾选后恢复隐藏
      syncDualLayerVisibility(cy);
    },
    [syncDualLayerVisibility]
  );

  const toggleRelatedLabelKey = useCallback((key: string) => {
    setRelatedHighlightLabelKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleRelatedColumn = useCallback(
    (column: RelatedEdgeLabelColumn) => {
      const entries = column === 'from' ? relatedEdgeLabelGroups.from : relatedEdgeLabelGroups.to;
      const keys = entries.map((e) => e.key);
      if (keys.length === 0) return;
      setRelatedHighlightLabelKeys((prev) => {
        const allOn = keys.every((k) => prev.has(k));
        const next = new Set(prev);
        if (allOn) keys.forEach((k) => next.delete(k));
        else keys.forEach((k) => next.add(k));
        return next;
      });
    },
    [relatedEdgeLabelGroups]
  );

  const selectAllRelatedLabels = useCallback(() => {
    setRelatedHighlightLabelKeys(new Set(relatedEdgeLabelEntries.map((e) => e.key)));
  }, [relatedEdgeLabelEntries]);

  const clearAllRelatedLabels = useCallback(() => {
    setRelatedHighlightLabelKeys(new Set());
  }, []);

  const previewNote = hoveredNote ?? focusedNote;

  const emptyConnectionDraft = useCallback(
    (): ConnectionDraft => ({
      fromNoteId: '',
      toNoteId: '',
      label: '',
      fromArrow: project.graphNewConnectionFromArrow ?? 'none',
      toArrow: project.graphNewConnectionToArrow ?? 'arrow',
      weight: DEFAULT_CONNECTION_WEIGHT
    }),
    [project.graphNewConnectionFromArrow, project.graphNewConnectionToArrow]
  );

  const toggleConnectionPanel = useCallback(() => {
    if (showConnectionPanelRef.current) {
      setPickTarget(null);
      setShowConnectionPanel(false);
      return;
    }
    // 顶部「关联」打开面板时统一进入新建草稿，避免仍保留上次点选边的 editingKey，
    // 面板误呈「编辑连线」态（起点右侧减号等）。
    setPanelEditingKey('new');
    setConnectionDraft(emptyConnectionDraft());
    setPickTarget(null);
    setSelectedConnectionId(null);
    setEdgeLabelDraft('');
    setShowConnectionPanel(true);
  }, [emptyConnectionDraft]);

  const handleNewConnection = useCallback(() => {
    if (connectionSaveResetTimerRef.current) {
      clearTimeout(connectionSaveResetTimerRef.current);
      connectionSaveResetTimerRef.current = null;
    }
    connectionPanelCommitCooldownRef.current = false;
    setConnectionPanelSaveResetting(false);
    setPanelEditingKey('new');
    setConnectionDraft(emptyConnectionDraft());
    setPickTarget(null);
  }, [emptyConnectionDraft]);

  /** 保留关联面板打开：仅清除边选中、画布节点高亮与草稿起终点（减号） */
  const clearConnectionGraphAndDraft = useCallback(() => {
    const cy = cyRef.current;
    setSelectedConnectionId(null);
    setEdgeLabelDraft('');
    setFocusedNodeId(null);
    setSelectedNodeIds(new Set());
    setHoveredNote(null);
    setPickTarget(null);
    setNoteEditorSuppressedForGraphConnection(false);
    if (cy) {
      cy.elements().unselect();
      applyGraphNeighborHighlight(cy, null, chainLengthRef.current, null);
      syncDualLayerVisibility(cy);
    }
    // 已是「新建」时：只清起终点与图状态，不要整份 emptyConnectionDraft（否则等同再点一次「新建」）
    if (panelEditingKeyRef.current === 'new') {
      setConnectionDraft((d) => ({
        ...d,
        fromNoteId: '',
        toNoteId: ''
      }));
      return;
    }
    setPanelEditingKey('new');
    setConnectionDraft(emptyConnectionDraft());
  }, [emptyConnectionDraft, syncDualLayerVisibility]);

  /** 清起点：切到新建并保留终点/标签/箭头设置 */
  const clearConnectionFromOnly = useCallback(() => {
    const cy = cyRef.current;
    setSelectedConnectionId(null);
    setEdgeLabelDraft('');
    setFocusedNodeId(null);
    setSelectedNodeIds(new Set());
    setHoveredNote(null);
    setPickTarget(null);
    setNoteEditorSuppressedForGraphConnection(false);
    if (cy) {
      cy.elements().unselect();
      applyGraphNeighborHighlight(cy, null, chainLengthRef.current, null);
      syncDualLayerVisibility(cy);
    }
    setPanelEditingKey('new');
    setConnectionDraft((d) => ({ ...d, fromNoteId: '' }));
  }, [syncDualLayerVisibility]);

  /** 清终点：切到新建并保留起点/标签/箭头设置 */
  const clearConnectionToOnly = useCallback(() => {
    const cy = cyRef.current;
    setSelectedConnectionId(null);
    setEdgeLabelDraft('');
    setFocusedNodeId(null);
    setSelectedNodeIds(new Set());
    setHoveredNote(null);
    setPickTarget(null);
    setNoteEditorSuppressedForGraphConnection(false);
    if (cy) {
      cy.elements().unselect();
      applyGraphNeighborHighlight(cy, null, chainLengthRef.current, null);
      syncDualLayerVisibility(cy);
    }
    setPanelEditingKey('new');
    setConnectionDraft((d) => ({ ...d, toNoteId: '' }));
  }, [syncDualLayerVisibility]);

  /** 关联面板内点击已选便签标题：图中定位并高亮，不打开便签编辑器 */
  const focusNoteOnGraphFromPanel = useCallback((noteId: string) => {
    const cy = cyRef.current;
    setGraphNodeSelection(new Set([noteId]), noteId);
    setNoteEditorSuppressedForGraphConnection(true);
    if (cy) {
      applyNeighborHighlightNow(cy, noteId, allRelatedLabelKeysFor(noteId));
      requestAnimationFrame(() => animateGraphCenterOnNode(cy, noteId));
    }
  }, [allRelatedLabelKeysFor, applyNeighborHighlightNow, setGraphNodeSelection]);

  /** 属性面板「编辑便签」：解除图谱单选节点时的编辑器抑制，以便打开全文编辑器 */
  const openInspectorNoteEditor = useCallback((noteId: string) => {
    setNoteEditorSuppressedForGraphConnection(false);
    setGraphNodeSelection(new Set([noteId]), noteId);
  }, [setGraphNodeSelection]);

  /** 浏览态详情卡：打开全文编辑器（不进入视图编辑模式） */
  const openPreviewNoteEditor = useCallback((noteId: string) => {
    setSelectedConnectionId(null);
    setEdgeLabelDraft('');
    setHoveredNote(null);
    setNoteEditorSuppressedForGraphConnection(false);
    setGraphNodeSelection(new Set([noteId]), noteId);
  }, [setGraphNodeSelection]);

  /** 非点选状态下点加号：一键把当前图中选中节点写入起点/终点 */
  const addEndpointFromFocusedGraphNode = useCallback((which: 'from' | 'to', noteId: string) => {
    const cy = cyRef.current;
    const field = which === 'from' ? 'fromNoteId' : 'toNoteId';
    setSelectedConnectionId(null);
    setEdgeLabelDraft('');
    setConnectionDraft((d) => ({ ...d, [field]: noteId }));
    setPickTarget(null);
    setGraphNodeSelection(new Set([noteId]), noteId);
    setNoteEditorSuppressedForGraphConnection(true);
    setGraphPickNonce((n) => n + 1);
    if (cy) {
      applyNeighborHighlightNow(cy, noteId, allRelatedLabelKeysFor(noteId));
      requestAnimationFrame(() => animateGraphCenterOnNode(cy, noteId));
    }
  }, [allRelatedLabelKeysFor, applyNeighborHighlightNow, setGraphNodeSelection]);

  const handleInspectorNewConnection = useCallback(() => {
    if (connectionSaveResetTimerRef.current) {
      clearTimeout(connectionSaveResetTimerRef.current);
      connectionSaveResetTimerRef.current = null;
    }
    connectionPanelCommitCooldownRef.current = false;
    setConnectionPanelSaveResetting(false);
    setSelectedConnectionId(null);
    setEdgeLabelDraft('');
    setPanelEditingKey('new');
    const base = emptyConnectionDraft();
    if (focusedNodeId) {
      setConnectionDraft({ ...base, fromNoteId: focusedNodeId });
      setPickTarget('to');
    } else {
      setConnectionDraft(base);
      setPickTarget(null);
    }
    setShowConnectionPanel(true);
  }, [emptyConnectionDraft, focusedNodeId]);

  const handleInspectorEditConnection = useCallback((c: Connection) => {
    setSelectedConnectionId(c.id);
    setEdgeLabelDraft(c.label || '');
    setConnectionDraft(connectionToPanelDraft(c));
    setPanelEditingKey(c.id);
    setPickTarget(null);
    setShowConnectionPanel(true);
  }, []);

  const commitConnectionDraft = useCallback(() => {
    if (!onUpdateConnections) return;
    if (connectionPanelCommitCooldownRef.current) return;
    const draft = connectionDraftRef.current;
    const editingKey = panelEditingKeyRef.current;
    const { fromNoteId, toNoteId, label, fromArrow, toArrow, weight } = draft;
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

    const conns = connectionsRef.current;

    if (editingKey === 'new') {
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
      onUpdateConnections([...conns, newConn]);
    } else {
      const existing = conns.find((c) => c.id === editingKey);
      if (!existing) {
        window.alert('当前编辑的连线已不存在，请关闭面板后重试。');
        return;
      }
      onUpdateConnections(
        conns.map((c) =>
          c.id === editingKey
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
    connectionPanelCommitCooldownRef.current = true;
    setSelectedConnectionId(null);
    setEdgeLabelDraft('');
    setConnectionPanelSaveResetting(true);
    setConnectionSaveSuccessNonce((n) => n + 1);
    setPickTarget(null);
    if (connectionSaveResetTimerRef.current) clearTimeout(connectionSaveResetTimerRef.current);
    // 较原 1280ms 提前 0.5s 进入下一条新建，不必等成功动效播完
    connectionSaveResetTimerRef.current = setTimeout(() => {
      connectionSaveResetTimerRef.current = null;
      handleNewConnection();
      setGraphPickNonce((n) => n + 1);
    }, 780);
  }, [onUpdateConnections, handleNewConnection]);

  const handleDeleteConnection = useCallback(() => {
    if (!onUpdateConnections || panelEditingKey === 'new') return;
    onUpdateConnections(connections.filter((c) => c.id !== panelEditingKey));
    setShowConnectionPanel(false);
    setPickTarget(null);
    setPanelEditingKey('new');
  }, [onUpdateConnections, panelEditingKey, connections]);

  const bindCyEvents = useCallback(
    (cy: Core) => {
      const isShiftEvent = (evt: cytoscape.EventObject) => {
        const oe = evt.originalEvent;
        return !!(oe && typeof oe === 'object' && 'shiftKey' in oe && (oe as MouseEvent).shiftKey);
      };

      const isMetaNode = (n: NodeSingular) =>
        n.hasClass('frame-cluster-label') || n.hasClass('frame-cluster-halo');

      const onNodeTap = (evt: cytoscape.EventObject) => {
        const n = evt.target as NodeSingular;
        if (isMetaNode(n)) {
          cy.elements().unselect();
          return;
        }
        const id = n.id();
        const shift = isShiftEvent(evt);

        const ui = graphUiRef.current;
        if (ui.showConnectionPanel && ui.isGraphToolbarEditMode && ui.pickTarget) {
          cy.elements().unselect();
          const field = ui.pickTarget === 'from' ? 'fromNoteId' : 'toNoteId';
          setSelectedConnectionId(null);
          setEdgeLabelDraft('');
          setPanelEditingKey('new');
          // 必须合并当前草稿：先选起点再选终点时不能再用 empty 覆盖，否则会丢掉已选的一侧
          setConnectionDraft((d) => ({
            ...d,
            [field]: id
          }));
          setPickTarget(null);
          setGraphNodeSelection(new Set([id]), id);
          setNoteEditorSuppressedForGraphConnection(true);
          setGraphPickNonce((x) => x + 1);
          applyGraphNeighborHighlight(
            cy,
            id,
            chainLengthRef.current,
            new Set(
              flattenRelatedEdgeLabelGroups(
                collectRelatedEdgeLabelEntries(
                  id,
                  connectionsRef.current,
                  chainLengthRef.current
                )
              ).map((e) => e.key)
            )
          );
          syncDualLayerVisibility(cy);
          requestAnimationFrame(() => {
            animateGraphCenterOnNode(cy, id);
          });
          return;
        }

        if (shift) {
          if (graphNodeTapTimerRef.current) {
            clearTimeout(graphNodeTapTimerRef.current);
            graphNodeTapTimerRef.current = null;
          }
          cy.elements().unselect();
          const next = new Set(selectedNodeIdsRef.current);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          const primary =
            next.size === 0 ? null : next.has(id) ? id : Array.from(next)[0];
          setSelectedConnectionId(null);
          setEdgeLabelDraft('');
          setNoteEditorSuppressedForGraphConnection(true);
          setGraphNodeSelection(next, primary);
          return;
        }

        cy.elements().unselect();
        if (graphNodeTapTimerRef.current) {
          clearTimeout(graphNodeTapTimerRef.current);
          graphNodeTapTimerRef.current = null;
        }
        graphNodeTapTimerRef.current = setTimeout(() => {
          graphNodeTapTimerRef.current = null;
          setSelectedConnectionId(null);
          setEdgeLabelDraft('');
          setNoteEditorSuppressedForGraphConnection(true);
          setFocusedNodeId((prev) => {
            const nextId = prev === id ? null : id;
            setSelectedNodeIds(nextId ? new Set([nextId]) : new Set());
            return nextId;
          });
        }, 280);
      };

      const onNodeDblTap = (evt: cytoscape.EventObject) => {
        const ui = graphUiRef.current;
        if (ui.showConnectionPanel && ui.isGraphToolbarEditMode && ui.pickTarget) {
          return;
        }
        if (graphNodeTapTimerRef.current) {
          clearTimeout(graphNodeTapTimerRef.current);
          graphNodeTapTimerRef.current = null;
        }
        cy.elements().unselect();
        const n = evt.target as NodeSingular;
        if (isMetaNode(n)) {
          return;
        }
        const id = n.id();
        setSelectedConnectionId(null);
        setEdgeLabelDraft('');
        setNoteEditorSuppressedForGraphConnection(false);
        setGraphNodeSelection(new Set([id]), id);
        applyGraphNeighborHighlight(
          cy,
          id,
          chainLengthRef.current,
          new Set(
            flattenRelatedEdgeLabelGroups(
              collectRelatedEdgeLabelEntries(
                id,
                connectionsRef.current,
                chainLengthRef.current
              )
            ).map((e) => e.key)
          )
        );
        syncDualLayerVisibility(cy);
      };

      const onEdgeTap = (evt: cytoscape.EventObject) => {
        if (graphNodeTapTimerRef.current) {
          clearTimeout(graphNodeTapTimerRef.current);
          graphNodeTapTimerRef.current = null;
        }
        cy.elements().unselect();
        const e = evt.target as EdgeSingular;
        const id = e.id();
        const c = connectionsRef.current.find((x) => x.id === id);
        setFocusedNodeId(null);
        setSelectedNodeIds(new Set());
        setHoveredConnectionId(null);
        setNoteEditorSuppressedForGraphConnection(false);
        applyGraphNeighborHighlight(cy, null, chainLengthRef.current, null);
        syncDualLayerVisibility(cy);
        if (c) {
          setSelectedConnectionId(id);
          setEdgeLabelDraft(c.label || '');
          setConnectionDraft(connectionToPanelDraft(c));
          setPanelEditingKey(c.id);
          setPickTarget(null);
          if (graphUiRef.current.isGraphToolbarEditMode) {
            setShowConnectionPanel(true);
          }
        } else {
          setSelectedConnectionId(null);
          setEdgeLabelDraft('');
        }
      };

      const onBgTap = (evt: cytoscape.EventObject) => {
        if (evt.target !== cy) return;
        if (ignoreNextGraphBgTapRef.current) {
          ignoreNextGraphBgTapRef.current = false;
          return;
        }
        // 与 Map/Board 一致：按住 Shift 点空白不取消多选
        if (isShiftEvent(evt)) {
          cy.elements().unselect();
          return;
        }
        cy.elements().unselect();
        clearSelection();
      };

      const onBgDblTap = (evt: cytoscape.EventObject) => {
        if (evt.target !== cy) return;
        if (!graphUiRef.current.showConnectionPanel) return;
        if (connectionSaveResetTimerRef.current) {
          clearTimeout(connectionSaveResetTimerRef.current);
          connectionSaveResetTimerRef.current = null;
        }
        connectionPanelCommitCooldownRef.current = false;
        setConnectionPanelSaveResetting(false);
        setShowConnectionPanel(false);
        setPickTarget(null);
        clearSelection();
      };

      const onBoxEnd = () => {
        const boxed = cy
          .nodes(':selected')
          .filter((n) => !isMetaNode(n as NodeSingular))
          .map((n) => n.id());
        cy.elements().unselect();
        if (boxed.length === 0) return;
        ignoreNextGraphBgTapRef.current = true;
        // Shift 框选：在已有选中上并集（与 Board/Map 一致）
        const next = new Set(selectedNodeIdsRef.current);
        boxed.forEach((id) => next.add(id));
        const primary = boxed[boxed.length - 1];
        setSelectedConnectionId(null);
        setEdgeLabelDraft('');
        setNoteEditorSuppressedForGraphConnection(true);
        setGraphNodeSelection(next, primary);
      };

      const onNodeOver = (evt: cytoscape.EventObject) => {
        const n = evt.target as NodeSingular;
        if (isMetaNode(n)) {
          setHoveredNote(null);
          setPreviewImageIndex(0);
          return;
        }
        const note = noteByIdRef.current.get(n.id());
        setHoveredNote(note || null);
        setPreviewImageIndex(0);
      };

      const onNodeOut = () => {
        setHoveredNote(null);
      };

      const onEdgeOver = (evt: cytoscape.EventObject) => {
        const e = evt.target as EdgeSingular;
        setHoveredConnectionId(e.id());
      };

      const onEdgeOut = () => {
        setHoveredConnectionId(null);
      };

      cy.on('tap', 'node', onNodeTap);
      cy.on('dbltap', 'node', onNodeDblTap);
      cy.on('tap', 'edge', onEdgeTap);
      cy.on('tap', onBgTap);
      cy.on('dbltap', onBgDblTap);
      cy.on('boxend', onBoxEnd);
      cy.on('mouseover', 'node', onNodeOver);
      cy.on('mouseout', 'node', onNodeOut);
      cy.on('mouseover', 'edge', onEdgeOver);
      cy.on('mouseout', 'edge', onEdgeOut);

      return () => {
        if (graphNodeTapTimerRef.current) {
          clearTimeout(graphNodeTapTimerRef.current);
          graphNodeTapTimerRef.current = null;
        }
        cy.removeListener('tap', 'node', onNodeTap);
        cy.removeListener('dbltap', 'node', onNodeDblTap);
        cy.removeListener('tap', 'edge', onEdgeTap);
        cy.removeListener('tap', onBgTap);
        cy.removeListener('dbltap', onBgDblTap);
        cy.removeListener('boxend', onBoxEnd);
        cy.removeListener('mouseover', 'node', onNodeOver);
        cy.removeListener('mouseout', 'node', onNodeOut);
        cy.removeListener('mouseover', 'edge', onEdgeOver);
        cy.removeListener('mouseout', 'edge', onEdgeOut);
      };
    },
    [clearSelection, setGraphNodeSelection, syncDualLayerVisibility]
  );

  useEffect(() => {
    // 仅在节点 id 集合变化时重建；便签内容、连线与主题色由后续 effect 增量同步
    setFocusedNodeId(null);
    setSelectedNodeIds(new Set());
    setNoteEditorSuppressedForGraphConnection(false);
    setHoveredNote(null);
    const el = containerRef.current;
    if (!el) return;

    unbindRef.current?.();
    unbindRef.current = null;
    cyRef.current?.destroy();
    cyRef.current = null;

    const cy = createAppGraphCy(el, {
      elements: buildGraphElements(
        notes,
        connections,
        themeColor,
        graphStylesheetSizing.edgeWeight,
        mergedTagGraphLayers.weights,
        project.frames ?? [],
        graphStylesheetSizing.nodeSize,
        clusterBasis
      ),
      style: getGraphStylesheet(
        themeColor,
        graphStylesheetSizing,
        {
          opacity: mapUiChromeOpacity,
          blurPx: mapUiChromeBlurPx
        },
        { edgeCurve: graphEdgeCurve }
      )
    });
    /**
     * 力导（cose）何时重算布局：
     * - 新建 cy（便签 id 集合变化）时按缓存/默认模式跑一次
     * - 用户点击底栏「力导」时（applyCoseLayout）
     * 不重算：编辑态拖点、NoteEditor/侧栏改点、连线增删、图层面板显隐/权重、高亮筛选。
     */
    const cached = projectId ? getGraphLayoutCache(projectId) : null;
    let initialMode = coerceGraphLayoutMode(
      cached ?? project.graphDefaultLayoutMode ?? DEFAULT_GRAPH_LAYOUT_MODE
    );
    applyGraphLayoutMode(cy, initialMode, {
      silentTimeFallback: true,
      timeLayout: timeLayoutOpts,
      graphLayers: timeClusterLayers,
      graphLayerGroupStandard: isFrameClusterBasis(clusterBasis) ? 'frame' : 'tag'
    });
    if (initialMode === 'time') {
      const valid = cy.nodes().filter((n) => n.data('timeSort') != null);
      if (valid.length === 0) {
        initialMode = 'cose';
        applyGraphLayout(cy, 'fcose');
        if (projectId) setGraphLayoutCache(projectId, 'cose');
      }
    }
    setActiveGraphLayout(initialMode);
    cyRef.current = cy;
    setGraphCoseTimeXBias(cy, coseTimeXBias);
    setGraphEdgeElasticity(cy, edgeElasticity);
    setGraphCyEpoch((n) => n + 1);
    unbindRef.current = bindCyEvents(cy);

    const detachWheel = attachBoardlikeWheelZoom(cy);

    let labelSizeRaf: number | null = null;
    const syncHighlightLabelSize = () => {
      if (labelSizeRaf != null) return;
      labelSizeRaf = requestAnimationFrame(() => {
        labelSizeRaf = null;
        if (cy.destroyed()) return;
        applyGraphHighlightLabelScreenSize(cy, graphStylesheetSizingRef.current, mapUiChromeRef.current);
      });
    };
    cy.on('viewport', syncHighlightLabelSize);
    applyGraphHighlightLabelScreenSize(cy, graphStylesheetSizingRef.current, mapUiChromeRef.current);

    let curveRaf: number | null = null;
    const syncCurveFromLength = () => {
      if (curveRaf != null) return;
      curveRaf = requestAnimationFrame(() => {
        curveRaf = null;
        if (cy.destroyed()) return;
        if (graphEdgeCurveRef.current) syncGraphEdgeCurveDistances(cy);
      });
    };
    cy.on('position', syncCurveFromLength);
    cy.on('layoutstop', syncCurveFromLength);
    if (graphEdgeCurveRef.current) syncGraphEdgeCurveDistances(cy);

    const detachRo = attachGraphResizeObserver(cy, el);
    scheduleGraphResizeAndFit(cy);

    return () => {
      if (labelSizeRaf != null) cancelAnimationFrame(labelSizeRaf);
      if (curveRaf != null) cancelAnimationFrame(curveRaf);
      cy.removeListener('viewport', syncHighlightLabelSize);
      cy.removeListener('position', syncCurveFromLength);
      cy.removeListener('layoutstop', syncCurveFromLength);
      detachWheel();
      detachRo();
      unbindRef.current?.();
      unbindRef.current = null;
      cyRef.current?.destroy();
      cyRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅节点结构变化时重建；连线由增量同步，不触发布局刷新
  }, [nodeStructureKey, bindCyEvents, projectId]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    // 增量同步边与节点 data（含编辑器/侧栏改点）；不重跑力导或其它布局。
    const elements = buildGraphElements(
      notes,
      connections,
      themeColor,
      graphStylesheetSizing.edgeWeight,
      mergedTagGraphLayers.weights,
      project.frames ?? [],
      graphStylesheetSizing.nodeSize,
      clusterBasis
    );
    const desiredEdges = elements.filter((el) => {
      const d = (el as any).data as any;
      return d && typeof d.id === 'string' && d.source != null && d.target != null;
    });
    const desiredEdgeIds = new Set(desiredEdges.map((e) => (e as any).data.id as string));
    cy.batch(() => {
      cy.edges().forEach((edge) => {
        if (!desiredEdgeIds.has(edge.id())) edge.remove();
      });
      desiredEdges.forEach((edgeDef) => {
        const id = (edgeDef as any).data.id as string;
        if (cy.getElementById(id).empty()) cy.add(edgeDef as any);
      });
    });

    patchGraphElementsData(cy, elements);
    // 数据同步会按 clusterBasis 重写颜色；若正在用预设图例覆盖，把预设色写回
    if (presetLegendOverride && graphPresetsStore.activePresetId) {
      const preset = graphPresetsStore.presets.find(
        (p) => p.id === graphPresetsStore.activePresetId
      );
      if (preset?.nodeColors) {
        cy.batch(() => {
          for (const [id, color] of Object.entries(preset.nodeColors)) {
            const n = cy.getElementById(id);
            if (n.empty() || !n.isNode()) continue;
            if (n.hasClass('frame-cluster-label') || n.hasClass('frame-cluster-halo')) continue;
            const c = String(color ?? '').trim();
            if (c) n.data('color', c);
          }
        });
      }
    }
    if (graphEdgeCurve) syncGraphEdgeCurveDistances(cy);
    syncDualLayerVisibility(cy);
  }, [
    notes,
    connections,
    themeColor,
    graphStylesheetSizing.edgeWeight,
    graphStylesheetSizing.nodeSize,
    graphEdgeCurve,
    tagGraphLayersWeightsKey,
    syncDualLayerVisibility,
    clusterBasis,
    project.frames,
    presetLegendOverride,
    graphPresetsStore.activePresetId,
    graphPresetsStore.presets
  ]);

  /**
   * 样式设置单独同步：便签正文、Emoji、Weight、标签等数据编辑不再重建 stylesheet。
   * 这里只重绘样式，不运行任何 layout。
   */
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || cy.destroyed?.()) return;
    updateGraphStylesheet(
      cy,
      getGraphStylesheet(
        themeColor,
        graphStylesheetSizing,
        {
          opacity: mapUiChromeOpacity,
          blurPx: mapUiChromeBlurPx
        },
        { edgeCurve: graphEdgeCurve }
      )
    );
    applyGraphHighlightLabelScreenSize(cy, graphStylesheetSizing, {
      opacity: mapUiChromeOpacity,
      blurPx: mapUiChromeBlurPx
    });
    if (graphEdgeCurve) syncGraphEdgeCurveDistances(cy);
  }, [
    graphCyEpoch,
    themeColor,
    graphStylesheetSizing,
    graphEdgeCurve,
    mapUiChromeOpacity,
    mapUiChromeBlurPx
  ]);

  /** 悬停只改 class / z-index，不触发整图数据同步或布局。 */
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || cy.destroyed?.()) return;
    applyGraphHoverHighlight(cy, hoveredNote?.id ?? null);
  }, [graphCyEpoch, hoveredNote?.id]);

  /** 边标签筛选变化时单独刷新高亮（避免整图数据重同步） */
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || cy.destroyed?.()) return;
    applyGraphNeighborHighlight(
      cy,
      highlightCenterIds,
      chainLength,
      selectedNodeIds.size === 1 && focusedNodeId ? relatedHighlightLabelKeys : null
    );
    syncDualLayerVisibility(cy);
  }, [
    focusedNodeId,
    highlightCenterIds,
    selectedNodeIds.size,
    selectedNodeIdsSig,
    chainLength,
    relatedHighlightKeysSig,
    relatedHighlightLabelKeys,
    connections,
    graphCyEpoch,
    syncDualLayerVisibility
  ]);

  // edge 被删除后：避免继续编辑/选中一个已不存在的 edge
  useEffect(() => {
    if (panelEditingKey === 'new') return;
    const exists = connections.some((c) => c.id === panelEditingKey);
    if (!exists) setPanelEditingKey('new');
  }, [connections, panelEditingKey]);

  useEffect(() => {
    if (!selectedConnectionId) return;
    const exists = connections.some((c) => c.id === selectedConnectionId);
    if (!exists) setSelectedConnectionId(null);
  }, [connections, selectedConnectionId]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.batch(() => {
      cy.edges().removeClass('focus-edge-hover');
      cy.edges().removeClass('focus-edge-selected');
      cy.nodes().removeClass('focus-edge-endpoint');
      if (hoveredConnectionId) {
        const e = cy.getElementById(hoveredConnectionId);
        if (!e.empty() && e.isEdge()) e.addClass('focus-edge-hover');
      }
      if (selectedConnectionId) {
        const e = cy.getElementById(selectedConnectionId);
        if (!e.empty() && e.isEdge()) {
          e.addClass('focus-edge-selected');
          e.connectedNodes().forEach((n) => {
            if (n.isNode() && !n.hasClass('frame-cluster-label') && !n.hasClass('frame-cluster-halo')) {
              n.addClass('focus-edge-endpoint');
            }
          });
        }
      }
    });
    applyGraphNodeStackZIndex(cy);
  }, [hoveredConnectionId, selectedConnectionId, edgeStructureKey]);

  /** 有“选中对象”时：把未高亮的点/边整体再 dim 50%（在各自基础透明度上 *0.5） */
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const hasSelection = selectedNodeIds.size > 0 || !!selectedConnectionId;
    const keepSel =
      'node.focus-core, node.focus-nh, node.focus-hover, node.focus-edge-endpoint, node:selected,' +
      'edge.focus-e, edge.focus-edge-hover, edge.focus-edge-selected, edge:selected';
    cy.batch(() => {
      cy.elements().removeClass('graph-dim');
      if (!hasSelection) return;
      const keep = cy.elements(keepSel);
      cy.elements().not(keep).addClass('graph-dim');
    });
  }, [focusedNodeId, selectedNodeIdsSig, selectedNodeIds.size, selectedConnectionId, hoveredConnectionId, hoveredNote?.id, edgeStructureKey, nodeStructureKey, relatedHighlightKeysSig]);

  /**
   * 时间线只响应显式布局设置：牵引强度、聚类依据、分层顺序和分层权重。
   * 不响应 notes / layer 对象身份、显隐、标题、Emoji、Weight、时间或 Frame 归属编辑；
   * 这些编辑仅更新节点数据，用户可在需要时再次点击「时间线」主动整理位置。
   */
  useEffect(() => {
    if (activeGraphLayout !== 'time' || graphPresetsStore.activePresetId) return;
    const cy = cyRef.current;
    if (!cy) return;
    const valid = cy.nodes().filter((n) => n.data('timeSort') != null);
    if (valid.length === 0) return;
    applyGraphTimeLayout(
      cy,
      () => {},
      timeLayoutOpts,
      timeClusterLayersRef.current,
      isFrameClusterBasis(clusterBasis) ? 'frame' : 'tag'
    );
  }, [
    activeGraphLayout,
    graphPresetsStore.activePresetId,
    timeLayoutOpts,
    graphLayersOrderKey,
    graphLayersWeightsKey,
    clusterBasis
  ]);

  /** 力导布局下：同步 X 轴时间分布权重；用户改百分比时重跑 fcose */
  const coseTimeXBiasRef = useRef(coseTimeXBias);
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    setGraphCoseTimeXBias(cy, coseTimeXBias);
    if (coseTimeXBiasRef.current === coseTimeXBias) return;
    coseTimeXBiasRef.current = coseTimeXBias;
    if (activeGraphLayout !== 'cose' || graphPresetsStore.activePresetId) return;
    applyGraphLayout(cy, 'fcose');
  }, [activeGraphLayout, graphPresetsStore.activePresetId, coseTimeXBias]);

  /** 力导布局下：同步边弹性；用户改滑块时重跑 fcose */
  const edgeElasticityRef = useRef(edgeElasticity);
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    setGraphEdgeElasticity(cy, edgeElasticity);
    if (edgeElasticityRef.current === edgeElasticity) return;
    edgeElasticityRef.current = edgeElasticity;
    if (activeGraphLayout !== 'cose' || graphPresetsStore.activePresetId) return;
    applyGraphLayout(cy, 'fcose');
  }, [activeGraphLayout, graphPresetsStore.activePresetId, edgeElasticity]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    applyGraphDualLayerNodeVisibility(
      cy,
      mergedTagGraphLayers.hidden,
      mergedFrameGraphLayers.hidden,
      mergedTagGraphLayers.tagVisibilityLogic ?? 'or'
    );
  }, [
    activeGraphLayout,
    mergedTagGraphLayers.hidden,
    mergedTagGraphLayers.tagVisibilityLogic,
    mergedFrameGraphLayers.hidden,
    tagGraphLayersHiddenKey,
    frameGraphLayersHiddenKey,
    nodeStructureKey,
    notesLayerVisualKey,
    focusedNodeId,
    relatedHighlightKeysSig
  ]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onLeave = () => setHoveredNote(null);
    el.addEventListener('mouseleave', onLeave);
    return () => el.removeEventListener('mouseleave', onLeave);
  }, []);

  const applyCoseLayout = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    // 仅用户显式点「力导」时重算；编辑拖点/改内容不会走这里
    applyGraphLayout(cy, 'fcose');
    setActiveGraphLayout('cose');
    persistGraphLayout('cose');
    // 离开预设态（与时间线/力导互斥）
    setGraphPresetsStore((prev) => {
      if (!prev.activePresetId) return prev;
      const next = { ...prev, activePresetId: null };
      void saveGraphPresetsStore(projectId, next);
      return next;
    });
  }, [persistGraphLayout, projectId]);

  const applyTimeLayout = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    applyGraphTimeLayout(
      cy,
      undefined,
      timeLayoutOpts,
      timeClusterLayers,
      isFrameClusterBasis(clusterBasis) ? 'frame' : 'tag'
    );
    const valid = cy.nodes().filter((n) => n.data('timeSort') != null);
    if (valid.length > 0) {
      setActiveGraphLayout('time');
      persistGraphLayout('time');
      setGraphPresetsStore((prev) => {
        if (!prev.activePresetId) return prev;
        const next = { ...prev, activePresetId: null };
        void saveGraphPresetsStore(projectId, next);
        return next;
      });
    }
  }, [persistGraphLayout, timeLayoutOpts, timeClusterLayers, clusterBasis, projectId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const store = await loadGraphPresetsStore(projectId);
      if (cancelled) return;
      setGraphPresetsStore(store);
      setPresetLegendOverride(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  /** 布局模式或聚类依据变化时，预设图例覆盖失效（点位仍可保留在 cy） */
  useEffect(() => {
    setPresetLegendOverride(null);
  }, [activeGraphLayout, clusterBasis]);

  const persistPresetsStore = useCallback(
    (next: GraphPresetsStore) => {
      setGraphPresetsStore(next);
      void saveGraphPresetsStore(projectId, next);
    },
    [projectId]
  );

  const capturePresetOpts = useCallback(
    (name: string, existingId?: string) => ({
      name,
      existingId,
      notes,
      themeColor,
      frames: project.frames,
      clusterBasis,
      tagLayerOrder: mergedTagGraphLayers.order,
      frameLayerOrder: mergedFrameGraphLayers.order,
      tagHidden: mergedTagGraphLayers.hidden,
      frameHidden: mergedFrameGraphLayers.hidden,
      tagVisibilityLogic: mergedTagGraphLayers.tagVisibilityLogic
    }),
    [
      notes,
      themeColor,
      project.frames,
      clusterBasis,
      mergedTagGraphLayers.order,
      mergedTagGraphLayers.hidden,
      mergedTagGraphLayers.tagVisibilityLogic,
      mergedFrameGraphLayers.order,
      mergedFrameGraphLayers.hidden
    ]
  );

  const handleSaveGraphPreset = useCallback(
    (name: string) => {
      const cy = cyRef.current;
      if (!cy) return;
      const preset = captureGraphViewPreset(cy, capturePresetOpts(name));
      const next = upsertPresetInStore(graphPresetsStore, preset);
      persistPresetsStore({ ...next, activePresetId: preset.id });
      setPresetLegendOverride(preset.legendItems);
    },
    [capturePresetOpts, graphPresetsStore, persistPresetsStore]
  );

  /** 用当前视图覆盖已有预设（保留 id / 名称） */
  const handleUpdateGraphPreset = useCallback(
    (id: string) => {
      const cy = cyRef.current;
      const existing = graphPresetsStore.presets.find((p) => p.id === id);
      if (!cy || !existing) return;
      const preset = captureGraphViewPreset(cy, capturePresetOpts(existing.name, id));
      const next = upsertPresetInStore(graphPresetsStore, preset);
      persistPresetsStore({ ...next, activePresetId: id });
      setPresetLegendOverride(preset.legendItems);
    },
    [capturePresetOpts, graphPresetsStore, persistPresetsStore]
  );

  const handleApplyGraphPreset = useCallback(
    (id: string) => {
      const cy = cyRef.current;
      const preset = graphPresetsStore.presets.find((p) => p.id === id);
      if (!cy || !preset) return;
      applyGraphViewPresetToCy(cy, preset);
      applyGraphViewPresetVisibility(cy, preset);
      if (project.graphEdgeCurve !== false) syncGraphEdgeCurveDistances(cy);
      scheduleGraphResizeAndFit(cy);
      setPresetLegendOverride(preset.legendItems);
      persistPresetsStore({ ...graphPresetsStore, activePresetId: id });

      // 同步图层面板眼睛（会话内项目状态；预设库本身仍不进项目导出 JSON）
      if (onUpdateProject && projectId) {
        if (preset.tagHidden != null || preset.frameHidden != null) {
          void onUpdateProject(projectId, {
            graphLayers: {
              order: mergedTagGraphLayers.order ?? [],
              hidden: preset.tagHidden ?? [],
              weights: mergedTagGraphLayers.weights,
              tagVisibilityLogic: preset.tagVisibilityLogic === 'and' ? 'and' : 'or'
            },
            graphFrameLayers: {
              order: mergedFrameGraphLayers.order ?? [],
              hidden: preset.frameHidden ?? [],
              weights: mergedFrameGraphLayers.weights
            }
          });
        }
      }

      if (preset.layerItemHidden && onUpdateProject) {
        const map = preset.layerItemHidden;
        const nextNotes = notes.map((n) => {
          if (!(n.id in map)) return n;
          const want = Boolean(map[n.id]);
          if (Boolean(n.layerItemHidden) === want) return n;
          return { ...n, layerItemHidden: want };
        });
        const changed = nextNotes.some((n, i) => n !== notes[i]);
        if (changed) void handleBatchUpdateNotes(nextNotes);
      }
    },
    [
      graphPresetsStore,
      persistPresetsStore,
      project.graphEdgeCurve,
      onUpdateProject,
      projectId,
      mergedTagGraphLayers,
      mergedFrameGraphLayers,
      notes,
      handleBatchUpdateNotes
    ]
  );

  const handleRenameGraphPreset = useCallback(
    (id: string, name: string) => {
      persistPresetsStore(renamePresetInStore(graphPresetsStore, id, name));
    },
    [graphPresetsStore, persistPresetsStore]
  );

  const handleDeleteGraphPreset = useCallback(
    (id: string) => {
      const next = deletePresetInStore(graphPresetsStore, id);
      persistPresetsStore(next);
      if (graphPresetsStore.activePresetId === id) setPresetLegendOverride(null);
    },
    [graphPresetsStore, persistPresetsStore]
  );

  const saveEdgeLabel = useCallback(() => {
    if (!selectedConn || !onUpdateConnections) return;
    const next = connections.map((c) =>
      c.id === selectedConn.id ? { ...c, label: edgeLabelDraft } : c
    );
    onUpdateConnections(next);
  }, [selectedConn, edgeLabelDraft, connections, onUpdateConnections]);

  const exportStandaloneHtml = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const payload = buildGraphExportPayload(project, themeColor, cy, {
      chromeOpacity: mapUiChromeOpacity,
      chromeBlurPx: mapUiChromeBlurPx,
      chainLength,
      presets: graphPresetsStore.presets,
      activePresetId: graphPresetsStore.activePresetId,
      legendItemsOverride: presetLegendOverride
    });
    const html = buildStandaloneGraphHtml(payload);
    const safe = (project.name || 'graph').replace(/[/\\\\?%*:|"<>]/g, '_');
    downloadTextFile(`${safe}-graph-demo.html`, html, 'text/html;charset=utf-8');
  }, [
    project,
    themeColor,
    mapUiChromeOpacity,
    mapUiChromeBlurPx,
    chainLength,
    graphPresetsStore.presets,
    graphPresetsStore.activePresetId,
    presetLegendOverride
  ]);

  const exportJson = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const payload = buildGraphExportPayload(project, themeColor, cy, {
      chromeOpacity: mapUiChromeOpacity,
      chromeBlurPx: mapUiChromeBlurPx,
      chainLength,
      presets: graphPresetsStore.presets,
      activePresetId: graphPresetsStore.activePresetId,
      legendItemsOverride: presetLegendOverride
    });
    const safe = (project.name || 'graph').replace(/[/\\\\?%*:|"<>]/g, '_');
    downloadGraphPayloadJson(payload, safe);
  }, [
    project,
    themeColor,
    mapUiChromeOpacity,
    mapUiChromeBlurPx,
    chainLength,
    graphPresetsStore.presets,
    graphPresetsStore.activePresetId,
    presetLegendOverride
  ]);

  const exportMappViz = useCallback(() => {
    if (!(project.notes || []).length) {
      window.alert('该项目没有便签可导出');
      return;
    }
    downloadMappVizJson(project);
  }, [project]);

  const graphDownloadItems = useMemo(
    () => [
      { id: 'html', label: '导出独立演示网页', onSelect: () => exportStandaloneHtml() },
      { id: 'json', label: '导出 JSON 数据', onSelect: () => exportJson() },
      { id: 'viz', label: '导出 Bibliometrics (.viz.json)', onSelect: () => exportMappViz() }
    ],
    [exportStandaloneHtml, exportJson, exportMappViz]
  );

  useEffect(() => {
    if (!isUIVisible) onWorkspaceEditModeChange(false);
  }, [isUIVisible, onWorkspaceEditModeChange]);

  useEffect(() => {
    setPreviewImageIndex(0);
  }, [previewNote?.id]);

  /** 从 Table 等外部「定位到图谱」 */
  useEffect(() => {
    if (!navigateToGraphNoteId) return;
    focusNoteOnGraphFromPanel(navigateToGraphNoteId);
    onClearGraphNavigation?.();
  }, [navigateToGraphNoteId, focusNoteOnGraphFromPanel, onClearGraphNavigation]);

  /** 打开 NoteEditor 与视图编辑模式无关；单击选中会抑制，双击 / 详情铅笔 / 属性面板解除抑制 */
  const graphEditorOpen =
    isUIVisible &&
    !!focusedNodeId &&
    !selectedConn &&
    !noteEditorSuppressedForGraphConnection;
  useEffect(() => {
    onToggleEditor?.(graphEditorOpen);
  }, [graphEditorOpen, onToggleEditor]);

  /** 浏览/编辑均可拖点微调位置；力导模式下也不因拖动重跑 fcose */
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.autoungrabify(false);
  }, [activeGraphLayout, graphCyEpoch]);

  useEffect(() => {
    return () => {
      onToggleEditor?.(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅在离开图谱视图时复位 App 的 isEditorOpen
  }, []);

  const editorInitialNote = useMemo(() => {
    if (!focusedNodeId) return undefined;
    return notes.find((n) => n.id === focusedNodeId);
  }, [notes, focusedNodeId]);

  return (
    <div
      id="graph-view-container"
      className="relative flex h-full min-h-0 w-full flex-col bg-gray-50 overflow-hidden"
    >
      {/* 用 flex-1 参与文档流高度，避免仅 absolute 子节点导致父级高度塌成 0（导出页用 100vh 无此问题） */}
      <div
        ref={graphStageRef}
        className="relative min-h-0 min-w-0 flex-1 w-full"
        style={{ backgroundImage: 'radial-gradient(#e5e7eb 1px, transparent 1px)', backgroundSize: '20px 20px' }}
      >
        {/* cy 容器保持文档流高度（flex-1 祖先），避免 absolute 在部分布局下量到 0 */}
        <div ref={containerRef} className="h-full w-full min-h-0 min-w-0" />
        <GraphHighlightChromeLabels
          cyRef={cyRef}
          hostRef={graphStageRef}
          chromeOpacity={mapUiChromeOpacity}
          chromeBlurPx={mapUiChromeBlurPx}
          themeColor={themeColor}
          nodeSize={graphStylesheetSizing.nodeSize}
          labelFontPx={graphStylesheetSizing.labelFontPx}
          highlightKey={`${graphCyEpoch}\u0001${focusedNodeId ?? ''}\u0001${selectedNodeIdsSig}\u0001${hoveredNote?.id ?? ''}\u0001${selectedConnectionId ?? ''}\u0001${hoveredConnectionId ?? ''}\u0001${chainLength}\u0001${relatedHighlightKeysSig}\u0001${graphStylesheetSizing.labelFontPx}\u0001${nodeStructureKey}\u0001${tagGraphLayersHiddenKey}\u0001${frameGraphLayersHiddenKey}\u0001${notesLayerVisualKey}\u0001${mergedTagGraphLayers.tagVisibilityLogic ?? 'or'}`}
        />
      </div>

      {nodeColorLegendItems.length > 0 ? (
        <div
          className="absolute bottom-4 left-4 z-[44] pointer-events-none select-none origin-bottom-left transform scale-200"
          aria-hidden
        >
          <div className="flex flex-col gap-1.5">
            {nodeColorLegendItems.slice(0, 8).map((item) => {
              const swatch = Math.max(6, Math.round(legendLabelFontPx * 0.9));
              return (
              <div key={item.key} className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  {item.colors.slice(0, 3).map((c) => (
                    <span
                      key={`${item.key}:${c}`}
                      className="inline-block rounded-full border border-white/90 shadow-sm shrink-0"
                      style={{ backgroundColor: c, width: swatch, height: swatch }}
                    />
                  ))}
                </div>
                <span
                  className="text-gray-500 font-medium truncate"
                  style={{ fontSize: legendLabelFontPx }}
                >
                  {item.label}
                </span>
              </div>
              );
            })}
            {nodeColorLegendItems.length > 8 ? (
              <div className="text-gray-500 mt-1" style={{ fontSize: Math.max(8, legendLabelFontPx - 1) }}>
                …共 {nodeColorLegendItems.length} 类
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <GraphTopLeftToolbar
        isUIVisible={isUIVisible}
        themeColor={themeColor}
        chromeSurfaceStyle={ch}
        chromeHoverBackground={chHover}
        setShowSettingsPanel={setShowSettingsPanel}
        showSettingsPanel={showSettingsPanel}
        settingsButtonRef={settingsButtonRef}
        showTagLayerPanel={showTagLayerPanel}
        setShowTagLayerPanel={setShowTagLayerPanel}
        showFrameLayerPanel={showFrameLayerPanel}
        setShowFrameLayerPanel={setShowFrameLayerPanel}
        canShowLayer={!!onUpdateProject}
        panelChromeStyle={panelChromeStyle}
        mergedTagLayers={mergedTagGraphLayers}
        mergedFrameLayers={mergedFrameGraphLayers}
        onTagLayersChange={handleTagLayersChange}
        onFrameLayersChange={handleFrameLayersChange}
        notes={notes}
        onUpdateNote={onUpdateNote}
        onBatchUpdateNotes={handleBatchUpdateNotes}
        frames={project.frames ?? []}
        onUpdateFrame={handleUpdateFrame}
        projectId={projectId}
        onActivateNoteFromLayer={(n) => focusNoteOnGraphFromPanel(n.id)}
        belowToolbar={
          isUIVisible && previewNote && !selectedConn && !isGraphToolbarEditMode && !graphEditorOpen ? (
            <div className="flex flex-col gap-2 sm:gap-3 pointer-events-none">
              <NotePreviewCard
                note={previewNote}
                currentImageIndex={previewImageIndex}
                onImageIndexChange={setPreviewImageIndex}
                chromeSurfaceStyle={panelChromeStyle}
                passThrough={Boolean(hoveredNote && hoveredNote.id !== focusedNodeId)}
                embedded
                themeColor={themeColor}
                onOpenEditor={openPreviewNoteEditor}
              />
              {focusedNote ? (
                <GraphRelatedHighlightPanel
                  groups={relatedEdgeLabelGroups}
                  selectedKeys={relatedHighlightLabelKeys}
                  onToggleKey={toggleRelatedLabelKey}
                  onToggleColumn={toggleRelatedColumn}
                  onSelectAll={selectAllRelatedLabels}
                  onClearAll={clearAllRelatedLabels}
                  themeColor={themeColor}
                  chromeSurfaceStyle={panelChromeStyle}
                  embedded
                />
              ) : null}
            </div>
          ) : null
        }
      />

      {!isUIVisible && previewNote && !selectedConn ? (
        <NotePreviewCard
          note={previewNote}
          currentImageIndex={previewImageIndex}
          onImageIndexChange={setPreviewImageIndex}
          chromeSurfaceStyle={panelChromeStyle}
          passThrough={Boolean(hoveredNote && hoveredNote.id !== focusedNodeId)}
          themeColor={themeColor}
        />
      ) : null}

      <GraphTopCenterConnectionButton
        visible={isUIVisible && isGraphToolbarEditMode && !!onUpdateConnections}
        chromeSurfaceStyle={ch}
        chromeHoverBackground={chHover}
        showConnectionPanel={showConnectionPanel}
        onToggleConnectionPanel={toggleConnectionPanel}
      />

      <GraphTopRightToolbar
        isUIVisible={isUIVisible}
        themeColor={themeColor}
        chromeSurfaceStyle={ch}
        chromeHoverBackground={chHover}
        graphDownloadItems={graphDownloadItems}
        isGraphToolbarEditMode={isGraphToolbarEditMode}
        setIsGraphToolbarEditMode={onWorkspaceEditModeChange}
        notes={notes}
        cyRef={cyRef}
        onLocateNote={focusNoteOnGraphFromPanel}
        graphCyKey={nodeStructureKey}
        reserveRightForInspector={isGraphToolbarEditMode}
      />

      <GraphLayoutModeBar
        panelChromeStyle={panelChromeStyle}
        themeColor={themeColor}
        activeGraphLayout={activeGraphLayout}
        activeGraphPresetId={graphPresetsStore.activePresetId}
        onApplyTimeLayout={applyTimeLayout}
        onApplyCoseLayout={applyCoseLayout}
        graphPresets={graphPresetsStore.presets}
        onSaveGraphPreset={handleSaveGraphPreset}
        onUpdateGraphPreset={handleUpdateGraphPreset}
        onApplyGraphPreset={handleApplyGraphPreset}
        onRenameGraphPreset={handleRenameGraphPreset}
        onDeleteGraphPreset={handleDeleteGraphPreset}
      />

      {graphEditorOpen && editorInitialNote && (
        <NoteEditor
          isOpen
          onClose={closeGraphNoteEditor}
          initialNote={editorInitialNote}
          onSave={(updated) => {
            if (!updated.id) return;
            const existingNote = notes.find((n) => n.id === updated.id);
            if (!existingNote) return;
            const fullNote: Note = {
              ...existingNote,
              ...updated,
              variant: updated.variant || existingNote.variant,
              isFavorite: updated.isFavorite ?? existingNote.isFavorite ?? false,
              images: updated.images !== undefined ? updated.images : (existingNote.images || []),
              sketch: 'sketch' in updated ? updated.sketch : existingNote.sketch
            };
            onUpdateNote(fullNote);
          }}
          onDelete={onDeleteNote}
          onSwitchToMapView={undefined}
          onSwitchToBoardView={
            onSwitchToBoardView
              ? (coords) => {
                  closeGraphNoteEditor();
                  onSwitchToBoardView(coords);
                }
              : undefined
          }
          onSwitchToGraphView={(noteId) => {
            closeGraphNoteEditor();
            focusNoteOnGraphFromPanel(noteId);
          }}
          themeColor={themeColor}
          panelChromeStyle={panelChromeStyle}
        />
      )}

      {showConnectionPanel && isGraphToolbarEditMode && onUpdateConnections && isUIVisible && (
        <GraphConnectionPanel
          isOpen
          themeColor={themeColor}
          panelChromeStyle={panelChromeStyle}
          notes={notes}
          draft={connectionDraft}
          onDraftChange={(patch) => setConnectionDraft((d) => ({ ...d, ...patch }))}
          panelEditingKey={panelEditingKey}
          pickTarget={pickTarget}
          onPickTargetChange={setPickTarget}
          onCommit={commitConnectionDraft}
          onDelete={handleDeleteConnection}
          onNewConnection={handleNewConnection}
          onBeginEndpointEdit={handleNewConnection}
          graphPickNonce={graphPickNonce}
          onClearGraphAndDraftSelection={clearConnectionGraphAndDraft}
          onClearFromSelection={clearConnectionFromOnly}
          onClearToSelection={clearConnectionToOnly}
          showClearSelection={
            !!selectedConnectionId ||
            selectedNodeIds.size > 0 ||
            !!focusedNodeId ||
            !!connectionDraft.fromNoteId ||
            !!connectionDraft.toNoteId ||
            !!pickTarget
          }
          onFocusNoteOnGraph={focusNoteOnGraphFromPanel}
          graphFocusedNoteId={focusedNodeId}
          onAddEndpointFromGraph={addEndpointFromFocusedGraphNode}
          saveSuccessNonce={connectionSaveSuccessNonce}
          commitDisabled={connectionPanelSaveResetting}
          onClose={() => {
            if (connectionSaveResetTimerRef.current) {
              clearTimeout(connectionSaveResetTimerRef.current);
              connectionSaveResetTimerRef.current = null;
            }
            connectionPanelCommitCooldownRef.current = false;
            setConnectionPanelSaveResetting(false);
            setShowConnectionPanel(false);
            setPickTarget(null);
          }}
        />
      )}

      <AnimatedEditInspectorPanel
        payload={
          isUIVisible && isGraphToolbarEditMode
            ? {
                note: focusedNote,
                inspectorConnection: focusedNote ? null : selectedConn,
                groupContext: null,
                coordMode: 'graph',
                themeColor,
                panelChromeStyle,
                frames: project.frames ?? [],
                connections,
                notes,
                hasConnectionWrite: !!onUpdateConnections,
                onUpdateNote,
                onOpenFullNoteEditor: openInspectorNoteEditor,
                onEditConnection: handleInspectorEditConnection,
                onNewConnection: handleInspectorNewConnection,
                onFocusPeerInView: focusNoteOnGraphFromPanel,
                onUpdateFrames: onUpdateProject ? handleUpdateFrames : undefined
              }
            : null
        }
      />

      <SettingsPanel
        isOpen={showSettingsPanel}
        onClose={() => setShowSettingsPanel(false)}
        anchorRef={settingsButtonRef}
        settingsContextView="graph"
        themeColor={themeColor}
        onThemeColorChange={onThemeColorChange ?? (() => {})}
        mapUiChromeOpacity={mapUiChromeOpacity}
        onMapUiChromeOpacityChange={onMapUiChromeOpacityChange ?? (() => {})}
        mapUiChromeBlurPx={mapUiChromeBlurPx}
        onMapUiChromeBlurPxChange={onMapUiChromeBlurPxChange ?? (() => {})}
        currentMapStyle={mapStyleId}
        onMapStyleChange={onMapStyleChange ?? (() => {})}
        graphProject={project}
        onGraphProjectPatch={
          onUpdateProject ? (patch) => void onUpdateProject(projectId, patch) : undefined
        }
      />
    </div>
  );
};
