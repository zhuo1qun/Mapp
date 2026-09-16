import cytoscape, { type Core, type ElementDefinition, type NodeSingular } from 'cytoscape';
import {
  DEFAULT_MAP_UI_CHROME_BLUR_PX,
  DEFAULT_MAP_UI_CHROME_OPACITY
} from '../map/mapChromeStyle';
import { GRAPH_FOCUS_CORE_NODE_SCALE, DEFAULT_GRAPH_TIME_AXIS_WEIGHT_BIAS, type GraphExportPayload } from './graphData';
import type { GraphLayerState, Note } from '../../types';
import {
  compareTagLayerKeysForAutoOrder,
  defaultWeightForTagLayer
} from '../layer/layerRegistry';
import { noteEmojiLayerGroupKey, noteTagLabels, GRAPH_UNEMOJI_GROUP } from '../layer/unifiedNoteLayer';
import {
  GRAPH_CLUSTER_BASIS_FRAME,
  isFrameClusterBasis,
  normalizeGraphClusterBasis,
  resolveCyClusterGroupKey,
  type GraphClusterBasis
} from './graphClusterBasis';
import { tagHierarchyPrefix } from '../layer/tagHierarchy';
// Cytoscape 的 style stylesheet 类型导出在当前工具链下不稳定，这里用宽类型避免无关的类型检查阻塞。
type Stylesheet = any;

const GRAPH_SORT_LOCALE = 'zh-Hans-CN';

/** 便签无首个标签时，在图谱与图层面板中的分组键（与 buildGraphElements 一致） */
export const GRAPH_UNTAGGED_TAG_GROUP = '无标签';

function orderedTagGroupKeysFromState(allKeys: Set<string>, layers: GraphLayerState): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const k of layers.order) {
    const key = String(k).trim();
    if (allKeys.has(key) && !seen.has(key)) {
      ordered.push(key);
      seen.add(key);
    }
  }
  const rest = [...allKeys]
    .filter((k) => !seen.has(k))
    .sort((a, b) => {
      if (a === '' && b !== '') return 1;
      if (b === '' && a !== '') return -1;
      return a.localeCompare(b, GRAPH_SORT_LOCALE);
    });
  return [...ordered, ...rest];
}

export const GRAPH_LAYER_WEIGHT_MIN = 0.1;
export const GRAPH_LAYER_WEIGHT_MAX = 1;
const GRAPH_LAYER_WEIGHT_SPAN = GRAPH_LAYER_WEIGHT_MAX - GRAPH_LAYER_WEIGHT_MIN;

function clampGraphLayerWeight(w: number): number {
  return Math.min(GRAPH_LAYER_WEIGHT_MAX, Math.max(GRAPH_LAYER_WEIGHT_MIN, Number.isFinite(w) ? w : 0.5));
}

function graphLayerWeightNorm(wgt: number): number {
  return (clampGraphLayerWeight(wgt) - GRAPH_LAYER_WEIGHT_MIN) / GRAPH_LAYER_WEIGHT_SPAN;
}

/** 稳定字符串哈希：用于给每个标签组分配固定相位，避免全组重叠在同一角度。 */
function stableAngleSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

export type GraphLayerGroupStandard = 'tag' | 'emoji' | 'frame';

function getGraphLayerCandidateKeys(n: NodeSingular, standard: GraphLayerGroupStandard): string[] {
  if (standard === 'tag') {
    const k = n.data('tagGroup');
    return [String(k ?? '').trim()];
  }
  if (standard === 'emoji') {
    return [String(n.data('emojiGroup') ?? GRAPH_UNEMOJI_GROUP).trim() || GRAPH_UNEMOJI_GROUP];
  }

  const raw = n.data('frameGroups') as unknown;
  const arr =
    Array.isArray(raw)
      ? raw
      : // 兼容旧导出/历史数据：仅有首簇归属字段
        [n.data('frameGroup')];
  return arr.map((x) => String(x ?? '').trim()).filter((x) => x !== '');
}

function getGraphLayerEffectiveGroupKey(
  n: NodeSingular,
  standard: GraphLayerGroupStandard,
  hiddenSet: Set<string>
): string {
  if (standard === 'tag' || standard === 'emoji') {
    // 标签和 Emoji 都是单一归属；不需要跳过 hidden（hidden 决定显示/隐藏）
    const k = n.data(standard === 'tag' ? 'tagGroup' : 'emojiGroup');
    return String(k ?? '').trim();
  }

  const candidates = getGraphLayerCandidateKeys(n, standard);
  // 没有簇候选：归属空组（后续由 hidden 控制显示/隐藏）
  if (candidates.length === 0) return '';

  // 逐个跳过已隐藏的簇：取第一个“未隐藏”的归属簇
  for (const id of candidates) {
    if (!hiddenSet.has(id)) return id;
  }

  // 全部被隐藏：退回第一个候选（最终会被隐藏）
  return candidates[0];
}

/** 按 graphLayers.hidden 控制节点显示（与分组标准一致：tagGroup / frameGroup） */
export function applyGraphLayerNodeVisibility(
  cy: Core,
  hidden: string[],
  standard: GraphLayerGroupStandard = 'tag'
): void {
  const hiddenSet = new Set(hidden.map((h) => String(h).trim()));
  cy.batch(() => {
    cy.nodes().forEach((node) => {
      const g = getGraphLayerEffectiveGroupKey(node, standard, hiddenSet);
      let disp: 'none' | 'element' = hiddenSet.has(g) ? 'none' : 'element';
      if (disp === 'element') {
        const lh = node.data('layerItemHidden');
        if (lh === true || lh === 'yes' || lh === 1) disp = 'none';
      }
      node.style('display', disp);
    });
  });
  applyGraphNodeStackZIndex(cy);
}

/** 标签、Emoji 与簇层同时生效：任一层隐藏则节点隐藏；选中高亮的邻居临时强制显示 */
export function applyGraphDualLayerNodeVisibility(
  cy: Core,
  tagHidden: string[],
  frameHidden: string[],
  tagVisibilityLogic: 'and' | 'or' = 'or',
  emojiHidden: string[] = []
): void {
  const tagSet = new Set(tagHidden.map((h) => String(h).trim()));
  const frameSet = new Set(frameHidden.map((h) => String(h).trim()));
  const emojiSet = new Set(emojiHidden.map((h) => String(h).trim()));
  const logic = tagVisibilityLogic === 'and' ? 'and' : 'or';
  cy.batch(() => {
    cy.nodes().forEach((node) => {
      if (node.hasClass('frame-cluster-halo') || node.hasClass('frame-cluster-label')) return;
      const rawLabels = node.data('tagLabels');
      const tagLabels: string[] = Array.isArray(rawLabels)
        ? rawLabels.map((x) => String(x).trim()).filter(Boolean)
        : [];
      let tagBlocked: boolean;
      if (tagLabels.length === 0) {
        tagBlocked = tagSet.has(GRAPH_UNTAGGED_TAG_GROUP);
      } else if (logic === 'and') {
        // 且：只要有一个标签隐藏就隐藏节点
        tagBlocked = tagLabels.some((l) => tagSet.has(l));
      } else {
        // 或：只要有一个标签显示就显示节点
        tagBlocked = tagLabels.every((l) => tagSet.has(l));
      }
      const frameKey = getGraphLayerEffectiveGroupKey(node, 'frame', frameSet);
      const emojiKey = getGraphLayerEffectiveGroupKey(node, 'emoji', emojiSet);
      let disp: 'none' | 'element' =
        tagBlocked || frameSet.has(frameKey) || emojiSet.has(emojiKey) ? 'none' : 'element';
      if (disp === 'element') {
        const lh = node.data('layerItemHidden');
        if (lh === true || lh === 'yes' || lh === 1) disp = 'none';
      }
      // 选中关系链高亮：临时显示本应隐藏的相连节点（筛选取消勾选后会去掉 class 并回到隐藏）
      if (
        disp === 'none' &&
        (node.hasClass('focus-core') ||
          node.hasClass('focus-nh') ||
          node.hasClass('focus-edge-endpoint'))
      ) {
        disp = 'element';
      }
      node.style('display', disp);
    });
  });
  applyGraphNodeStackZIndex(cy);
}

/**
 * 便签叠放序写在元素 bypass `z-index` 上，会盖过样式表。
 * 高亮节点抬到 top 并大幅抬升 z；未高亮保持 auto，让高亮连线（top）能盖过它们。
 */
const GRAPH_Z_BOOST = {
  nh: 100_000,
  endpoint: 110_000,
  core: 120_000,
  hover: 130_000
} as const;

export function applyGraphNodeStackZIndex(cy: Core): void {
  if (!cy || cy.destroyed?.()) return;
  cy.batch(() => {
    cy.nodes().forEach((node) => {
      if (node.hasClass('frame-cluster-halo') || node.hasClass('frame-cluster-label')) return;
      const base = Number(node.data('stackZ'));
      const stack = Number.isFinite(base) ? base : 2;
      let boost = 0;
      if (node.hasClass('focus-hover')) boost = GRAPH_Z_BOOST.hover;
      else if (node.hasClass('focus-core')) boost = GRAPH_Z_BOOST.core;
      else if (node.hasClass('focus-edge-endpoint')) boost = GRAPH_Z_BOOST.endpoint;
      else if (node.hasClass('focus-nh')) boost = GRAPH_Z_BOOST.nh;
      // bypass 同步 compound：避免仅改 z-index 时仍停在错误层
      node.style({
        'z-compound-depth': boost > 0 ? 'top' : 'auto',
        'z-index': stack + boost
      });
    });
  });
}

function applyGraphWeightedCircleLayout(
  cy: Core,
  layers: GraphLayerState,
  standard: GraphLayerGroupStandard
): void {
  const nodes = cy.nodes();
  if (nodes.length === 0) return;

  const hiddenSet = new Set((layers.hidden ?? []).map((h) => String(h).trim()));

  const byGroup = new Map<string, NodeSingular[]>();
  nodes.forEach((n) => {
    const key = getGraphLayerEffectiveGroupKey(n, standard, hiddenSet);
    if (standard === 'tag' && key === '') return; // 无标签节点：不参与圆环分组/布局
    if (!byGroup.has(key)) byGroup.set(key, []);
    byGroup.get(key)!.push(n);
  });
  const allKeys = new Set(byGroup.keys());
  const keysOrdered = orderedTagGroupKeysFromState(allKeys, layers);

  const visibleGroups = new Map<string, NodeSingular[]>();
  const hiddenNodes: NodeSingular[] = [];
  for (const key of keysOrdered) {
    const groupNodes = [...(byGroup.get(key) ?? [])].sort((a, b) =>
      String(a.data('fullTitle') || '').localeCompare(String(b.data('fullTitle') || ''), GRAPH_SORT_LOCALE)
    );
    if (hiddenSet.has(key)) {
      hiddenNodes.push(...groupNodes);
    } else if (groupNodes.length > 0) {
      visibleGroups.set(key, groupNodes);
    }
  }

  const w = cy.width();
  const h = cy.height();
  const cx = w / 2;
  const cyy = h / 2;
  const baseR = Math.min(w, h) * 0.36;
  const rInner = baseR * 0.22;
  const rOuter = baseR;

  const pos = new Map<string, { x: number; y: number }>();

  // 每个标签组在自身权重半径上独立绕满 360°，并用稳定相位错开，避免只占一段弧。
  // 约定：权重越大越靠近圆心。
  visibleGroups.forEach((groupNodes, tagKey) => {
    const wgt = layers.weights?.[tagKey] ?? 0.5;
    const norm = graphLayerWeightNorm(wgt);
    const r = rInner + (1 - norm) * (rOuter - rInner);
    const n = groupNodes.length;
    const phase = stableAngleSeed(tagKey || '__untagged__') * 2 * Math.PI - Math.PI / 2;
    for (let i = 0; i < n; i += 1) {
      const angle = phase + (2 * Math.PI * i) / Math.max(1, n);
      const node = groupNodes[i];
      pos.set(node.id(), { x: cx + r * Math.cos(angle), y: cyy + r * Math.sin(angle) });
    }
  });
  hiddenNodes.forEach((node, i) => {
    pos.set(node.id(), { x: cx + (i - hiddenNodes.length / 2) * 10, y: cyy });
  });

  cy.nodes().layout({
    name: 'preset',
    animate: true,
    transform: (node) => pos.get(node.id()) ?? { x: cx, y: cyy }
  }).run();

  requestAnimationFrame(() => {
    cy.resize();
    cy.fit(undefined, 48);
  });
}

/** 与 Board 一致：缩放采用相对倍率，而不是向当前 zoom 线性加减。 */
export const GRAPH_WHEEL_ZOOM_SENSITIVITY = 0.004;

type RendererWithProject = {
  projectIntoViewport: (clientX: number, clientY: number) => number[];
};

function getCyRenderer(cy: Core): RendererWithProject | null {
  const r = (cy as unknown as { renderer?: () => RendererWithProject }).renderer?.();
  return r && typeof r.projectIntoViewport === 'function' ? r : null;
}

function isCyActive(cy: Core | null | undefined): cy is Core {
  if (!cy) return false;
  try {
    return !(cy as any).destroyed?.();
  } catch {
    return false;
  }
}

/**
 * 与看板一致：无修饰双指滑动平移；触控板捏合 / Cmd(Ctrl)+滚轮才缩放，
 * 并以指针下点为锚。需在 `wheelSensitivity: 0` 下使用，避免与内置滚轮叠加。
 */
export function attachBoardlikeWheelZoom(cy: Core): () => void {
  const container = cy.container();
  if (!container) return () => {};

  let pendingPanX = 0;
  let pendingPanY = 0;
  let panFrame: number | null = null;

  const wheelPixels = (e: WheelEvent) => {
    if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) return 16;
    if (e.deltaMode === WheelEvent.DOM_DELTA_PAGE) return container.clientHeight;
    return 1;
  };

  const flushPan = () => {
    panFrame = null;
    if (pendingPanX === 0 && pendingPanY === 0 || !isCyActive(cy)) return;
    cy.panBy({ x: -pendingPanX, y: -pendingPanY });
    pendingPanX = 0;
    pendingPanY = 0;
  };

  const handler = (e: WheelEvent) => {
    if (!container.contains(e.target as Node)) return;

    e.preventDefault();

    if (!(e.ctrlKey || e.metaKey)) {
      const pixels = wheelPixels(e);
      pendingPanX += e.deltaX * pixels;
      pendingPanY += e.deltaY * pixels;
      if (panFrame == null) panFrame = requestAnimationFrame(flushPan);
      return;
    }

    const scrollDelta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;

    if (scrollDelta === 0) return;

    const z = cy.zoom();
    const minZ = cy.minZoom();
    const maxZ = cy.maxZoom();
    const newZoom = Math.min(
      Math.max(minZ, z * Math.exp(-scrollDelta * GRAPH_WHEEL_ZOOM_SENSITIVITY)),
      maxZ
    );
    if (Math.abs(newZoom - z) < 1e-9) return;

    const r = getCyRenderer(cy);
    if (!r) return;

    const pos = r.projectIntoViewport(e.clientX, e.clientY);
    const pan = cy.pan();
    const rz = cy.zoom();
    const rx = pos[0] * rz + pan.x;
    const ry = pos[1] * rz + pan.y;

    cy.zoom({ level: newZoom, renderedPosition: { x: rx, y: ry } });
  };

  let attached = false;
  const attach = () => {
    if (attached) return;
    attached = true;
    container.addEventListener('wheel', handler, { passive: false });
  };

  cy.ready(attach);

  return () => {
    if (panFrame != null) cancelAnimationFrame(panFrame);
    if (attached) {
      container.removeEventListener('wheel', handler);
      attached = false;
    }
  };
}

export function decodeGraphPayloadFromBase64(b64: string): GraphExportPayload {
  const json = decodeURIComponent(escape(atob(b64)));
  return JSON.parse(json) as GraphExportPayload;
}

export function attachGraphResizeObserver(cy: Core, el: HTMLElement): () => void {
  const ro = new ResizeObserver(() => {
    requestAnimationFrame(() => {
      if (!isCyActive(cy)) return;
      cy.resize();
    });
  });
  ro.observe(el);
  return () => ro.disconnect();
}

export function scheduleGraphResizeAndFit(cy: Core): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (!isCyActive(cy)) return;
      cy.resize();
      cy.fit(undefined, 40);
    });
  });
}

/** 将视图平移到以指定节点为中心，不改变缩放（避免 fit 单点导致过度放大） */
export function animateGraphCenterOnNode(cy: Core, nodeId: string): void {
  const el = cy.getElementById(nodeId);
  if (el.empty() || !el.isNode()) return;
  cy.animate({
    center: { eles: el },
    duration: 220,
    easing: 'ease-out-cubic'
  });
}

const GRAPH_COSE_EDGE_LENGTH_MIN = 60;
const GRAPH_COSE_EDGE_LENGTH_MAX = 400;
/** 与 Connection.weight / clampConnectionWeight 一致 */
const GRAPH_COSE_CONN_WEIGHT_MIN = 0.1;
const GRAPH_COSE_CONN_WEIGHT_MAX = 10;
/** 固定节点排斥（不跟中心度 / 边权挂钩） */
const GRAPH_COSE_NODE_REPULSION = 5500;
/** 边弹性：弱边软、强边硬（压缩动态范围，不再直接 / w） */
const GRAPH_COSE_ELASTICITY_WEAK = 0.75;
const GRAPH_COSE_ELASTICITY_STRONG = 0.25;
/** 与设置默认边弹性一致；用于把滑块相对缩放到弱/强带子上 */
const GRAPH_COSE_ELASTICITY_SLIDER_REF = 0.45;
const GRAPH_COSE_CROSSING_OPT_MAX_EDGES = 220;
const GRAPH_COSE_FLOW_BIAS_MAX_EDGES = 500;

type GraphCoseSegment = {
  sourceId: string;
  targetId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

function graphCoseBuildVisibleSegments(cy: Core): GraphCoseSegment[] {
  const segs: GraphCoseSegment[] = [];
  cy.edges().forEach((e) => {
    const s = e.source();
    const t = e.target();
    if (s.empty() || t.empty()) return;
    if (s.id() === t.id()) return;
    if (s.style('display') === 'none' || t.style('display') === 'none' || e.style('display') === 'none') return;
    const sp = s.position();
    const tp = t.position();
    segs.push({
      sourceId: s.id(),
      targetId: t.id(),
      x1: sp.x,
      y1: sp.y,
      x2: tp.x,
      y2: tp.y
    });
  });
  return segs;
}

function graphCoseSegmentsShareEndpoint(a: GraphCoseSegment, b: GraphCoseSegment): boolean {
  return (
    a.sourceId === b.sourceId ||
    a.sourceId === b.targetId ||
    a.targetId === b.sourceId ||
    a.targetId === b.targetId
  );
}

function graphCoseOrientation(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cyy: number
): number {
  return (bx - ax) * (cyy - ay) - (by - ay) * (cx - ax);
}

function graphCoseSegmentsCross(a: GraphCoseSegment, b: GraphCoseSegment): boolean {
  const eps = 1e-7;
  const o1 = graphCoseOrientation(a.x1, a.y1, a.x2, a.y2, b.x1, b.y1);
  const o2 = graphCoseOrientation(a.x1, a.y1, a.x2, a.y2, b.x2, b.y2);
  const o3 = graphCoseOrientation(b.x1, b.y1, b.x2, b.y2, a.x1, a.y1);
  const o4 = graphCoseOrientation(b.x1, b.y1, b.x2, b.y2, a.x2, a.y2);
  if (Math.abs(o1) < eps || Math.abs(o2) < eps || Math.abs(o3) < eps || Math.abs(o4) < eps) return false;
  return (o1 > 0) !== (o2 > 0) && (o3 > 0) !== (o4 > 0);
}

function graphCoseCountCrossingsFromSegments(segs: GraphCoseSegment[]): number {
  let count = 0;
  for (let i = 0; i < segs.length; i += 1) {
    const a = segs[i];
    for (let j = i + 1; j < segs.length; j += 1) {
      const b = segs[j];
      if (graphCoseSegmentsShareEndpoint(a, b)) continue;
      if (graphCoseSegmentsCross(a, b)) count += 1;
    }
  }
  return count;
}

function runGraphCoseCrossingPostProcess(cy: Core): void {
  const edgeCount = cy.edges().length;
  if (edgeCount < 4 || edgeCount > GRAPH_COSE_CROSSING_OPT_MAX_EDGES) return;

  const allNodes = cy
    .nodes()
    .filter((n) => n.style('display') !== 'none' && !n.hasClass('frame-cluster-label') && !n.hasClass('frame-cluster-halo'));
  if (allNodes.length < 3) return;

  const nodes = allNodes
    .toArray()
    .filter((n): n is NodeSingular => n.isNode())
    .sort((a, b) => b.connectedEdges().length - a.connectedEdges().length)
    .slice(0, Math.min(28, allNodes.length));

  const viewport = Math.max(120, Math.min(cy.width(), cy.height()));
  const step = Math.max(10, Math.min(34, viewport * 0.02));
  const offsets = [
    { x: 0, y: 0 },
    { x: step, y: 0 },
    { x: -step, y: 0 },
    { x: 0, y: step },
    { x: 0, y: -step },
    { x: step, y: step },
    { x: step, y: -step },
    { x: -step, y: step },
    { x: -step, y: -step }
  ];

  for (let pass = 0; pass < 2; pass += 1) {
    let improved = false;
    for (const node of nodes) {
      const base = node.position();
      let bestX = base.x;
      let bestY = base.y;
      let bestCross = graphCoseCountCrossingsFromSegments(graphCoseBuildVisibleSegments(cy));
      for (const off of offsets) {
        const nx = base.x + off.x;
        const ny = base.y + off.y;
        node.position({ x: nx, y: ny });
        const c = graphCoseCountCrossingsFromSegments(graphCoseBuildVisibleSegments(cy));
        if (c < bestCross) {
          bestCross = c;
          bestX = nx;
          bestY = ny;
        }
      }
      node.position({ x: bestX, y: bestY });
      if (bestX !== base.x || bestY !== base.y) improved = true;
    }
    if (!improved) break;
  }
}

/**
 * 收集语义有向边 (from → to)。forward / backward；both、none 跳过。
 */
function graphCoseCollectDirectedPairs(cy: Core): Array<{ from: string; to: string }> {
  const visible = new Set<string>();
  cy.nodes().forEach((n) => {
    if (n.style('display') === 'none') return;
    if (n.hasClass('frame-cluster-label') || n.hasClass('frame-cluster-halo')) return;
    visible.add(n.id());
  });

  const pairs: Array<{ from: string; to: string }> = [];
  cy.edges().forEach((e) => {
    if (e.style('display') === 'none') return;
    const dir = String(e.data('direction') ?? 'none');
    const s = e.source().id();
    const t = e.target().id();
    if (!visible.has(s) || !visible.has(t) || s === t) return;
    if (dir === 'forward') {
      pairs.push({ from: s, to: t });
    } else if (dir === 'backward') {
      pairs.push({ from: t, to: s });
    }
  });
  return pairs.length > GRAPH_COSE_FLOW_BIAS_MAX_EDGES
    ? pairs.slice(0, GRAPH_COSE_FLOW_BIAS_MAX_EDGES)
    : pairs;
}

/** 历史：源头靠左（X）——有向边纠错；与时间分布抢 X 时默认关 */
function runGraphCoseLeftFlowPostProcess(cy: Core): void {
  const pairs = graphCoseCollectDirectedPairs(cy);
  if (pairs.length < 1) return;

  const ids = new Set<string>();
  for (const p of pairs) {
    ids.add(p.from);
    ids.add(p.to);
  }
  const pos = new Map<string, { x: number; y: number }>();
  ids.forEach((id) => {
    const n = cy.getElementById(id);
    if (n.empty() || !n.isNode()) return;
    const p = n.position();
    pos.set(id, { x: p.x, y: p.y });
  });

  const minGap = 36;
  const strength = 0.5;
  const passes = 8;
  for (let pass = 0; pass < passes; pass += 1) {
    for (const { from, to } of pairs) {
      const a = pos.get(from);
      const b = pos.get(to);
      if (!a || !b) continue;
      // 源头应在左：from.x < to.x - minGap
      if (a.x <= b.x - minGap) continue;
      const excess = a.x - b.x + minGap;
      const half = excess * 0.5 * strength;
      a.x -= half;
      b.x += half;
    }
  }

  cy.batch(() => {
    pos.forEach((p, id) => {
      const n = cy.getElementById(id);
      if (n.empty() || !n.isNode()) return;
      n.position({ x: p.x, y: p.y });
    });
  });
}

/**
 * 源头靠上（Y）：对每条有向边纠错——起点应在终点上方。
 * 只修正违反的边，保留 fcose 散开；不做深度分层。
 */
function runGraphCoseTopFlowPostProcess(cy: Core): void {
  const pairs = graphCoseCollectDirectedPairs(cy);
  if (pairs.length < 1) return;

  const ids = new Set<string>();
  for (const p of pairs) {
    ids.add(p.from);
    ids.add(p.to);
  }
  const pos = new Map<string, { x: number; y: number }>();
  ids.forEach((id) => {
    const n = cy.getElementById(id);
    if (n.empty() || !n.isNode()) return;
    const p = n.position();
    pos.set(id, { x: p.x, y: p.y });
  });

  const minGap = 36;
  const strength = 0.5;
  const passes = 10;
  for (let pass = 0; pass < passes; pass += 1) {
    for (const { from, to } of pairs) {
      const a = pos.get(from);
      const b = pos.get(to);
      if (!a || !b) continue;
      // 源头应在上：from.y < to.y - minGap（y 向下为正）
      if (a.y <= b.y - minGap) continue;
      const excess = a.y - b.y + minGap;
      const half = excess * 0.5 * strength;
      a.y -= half;
      b.y += half;
    }
  }

  cy.batch(() => {
    pos.forEach((p, id) => {
      const n = cy.getElementById(id);
      if (n.empty() || !n.isNode()) return;
      n.position({ x: p.x, y: p.y });
    });
  });
}

type GraphCosePostProcessOptions = {
  enableCrossingPostProcess?: boolean;
  enableLeftFlowPostProcess?: boolean;
  /** 布局后按边方向把源头往上推（Y）；默认可与时间 X 并存 */
  enableTopFlowPostProcess?: boolean;
  /** 布局后硬防节点重叠；默认开 */
  enableOverlapSeparationPostProcess?: boolean;
  /** 布局后仅用 timeSort 在 X 上分离；默认开 */
  enableDirectedAlignPostProcess?: boolean;
  /** X 时间分布强度 0～1；未传则读 cy scratch / 默认 0.8 */
  timeXStrength?: number;
};

const GRAPH_COSE_TIME_X_BIAS_SCRATCH = '_graphCoseTimeXBias';
const DEFAULT_GRAPH_COSE_TIME_X_STRENGTH = 0.8;
const GRAPH_EDGE_ELASTICITY_SCRATCH = '_graphEdgeElasticity';
const DEFAULT_GRAPH_EDGE_ELASTICITY_RUNTIME = 0.45;

function clampUnitInterval(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function clampGraphEdgeElasticity(v: number): number {
  return Math.max(0.05, Math.min(2, Math.round(v * 100) / 100));
}

/** 写入力导「按时间分布」强度，供布局后处理读取 */
export function setGraphCoseTimeXBias(cy: Core, bias: number): void {
  cy.scratch(GRAPH_COSE_TIME_X_BIAS_SCRATCH, clampUnitInterval(bias));
}

/** 写入力导全局边弹性（fCoSE edgeElasticity 基数） */
export function setGraphEdgeElasticity(cy: Core, elasticity: number): void {
  cy.scratch(GRAPH_EDGE_ELASTICITY_SCRATCH, clampGraphEdgeElasticity(elasticity));
}

function resolveGraphCoseTimeXStrength(cy: Core, override?: number): number {
  if (override != null && Number.isFinite(override)) return clampUnitInterval(override);
  const fromScratch = cy.scratch(GRAPH_COSE_TIME_X_BIAS_SCRATCH);
  if (typeof fromScratch === 'number' && Number.isFinite(fromScratch)) {
    return clampUnitInterval(fromScratch);
  }
  return DEFAULT_GRAPH_COSE_TIME_X_STRENGTH;
}

function resolveGraphEdgeElasticity(cy: Core): number {
  const fromScratch = cy.scratch(GRAPH_EDGE_ELASTICITY_SCRATCH);
  if (typeof fromScratch === 'number' && Number.isFinite(fromScratch)) {
    return clampGraphEdgeElasticity(fromScratch);
  }
  return DEFAULT_GRAPH_EDGE_ELASTICITY_RUNTIME;
}

/**
 * 力导硬防重叠：按节点外接尺寸推开过近的点（XY 均衡）。
 * 放在时间 X / 源头靠上 / 交叉优化之后，避免后处理再把点挤叠。
 */
function runGraphCoseOverlapSeparationPostProcess(cy: Core): void {
  const nodes = cy
    .nodes()
    .filter(
      (n) =>
        n.style('display') !== 'none' &&
        !n.hasClass('frame-cluster-label') &&
        !n.hasClass('frame-cluster-halo')
    );
  const n = nodes.length;
  if (n < 2) return;
  // 过大图 O(n²) 过贵：跳过硬分离，仍靠 nodeRepulsion
  if (n > 280) return;

  const nodesArr = nodes.toArray().filter((el): el is NodeSingular => el.isNode());
  const radii = nodesArr.map((node) => {
    const w = node.outerWidth();
    const h = node.outerHeight();
    const r = 0.5 * Math.max(w, h, 12);
    return Number.isFinite(r) ? r : 14;
  });
  const pos = nodesArr.map((node) => {
    const p = node.position();
    return { x: p.x, y: p.y };
  });

  const pad = 1.05;
  const iterations = 10;
  const step = 0.55;
  const maxPushPerIter = 28;
  // 防重叠略偏 X，少打乱纵向源头顺序（源头靠上会在其后再次校正 Y）
  const xScale = 1.0;
  const yScale = 0.45;
  const wLocal = cy.width();
  const hLocal = cy.height();

  for (let iter = 0; iter < iterations; iter += 1) {
    let moved = false;
    for (let i = 0; i < nodesArr.length; i += 1) {
      for (let j = i + 1; j < nodesArr.length; j += 1) {
        const minDist = (radii[i] + radii[j]) * pad;
        const dx = pos[j].x - pos[i].x;
        const dy = pos[j].y - pos[i].y;
        // 粗筛：轴对齐过远则跳过
        if (Math.abs(dx) > minDist && Math.abs(dy) > minDist) continue;

        let dist2 = dx * dx + dy * dy;
        if (dist2 >= minDist * minDist) continue;

        let ux: number;
        let uy: number;
        let dist: number;
        if (dist2 <= 1e-8) {
          // 完全重合：沿稳定方向弹开
          const ang = ((i * 37 + j * 17 + iter * 13) % 360) * (Math.PI / 180);
          ux = Math.cos(ang);
          uy = Math.sin(ang);
          dist = 1e-3;
        } else {
          dist = Math.sqrt(dist2);
          ux = dx / dist;
          uy = dy / dist;
        }

        const overlap = minDist - dist;
        let push = overlap * step * 0.5;
        if (push > maxPushPerIter) push = maxPushPerIter;
        if (push <= 1e-6) continue;

        pos[i].x -= ux * push * xScale;
        pos[i].y -= uy * push * yScale;
        pos[j].x += ux * push * xScale;
        pos[j].y += uy * push * yScale;
        moved = true;
      }
    }
    if (!moved) break;
  }

  cy.batch(() => {
    nodesArr.forEach((node, idx) => {
      const p = pos[idx];
      node.position({
        x: Math.max(8, Math.min(wLocal - 8, p.x)),
        y: Math.max(8, Math.min(hLocal - 8, p.y))
      });
    });
  });
}

/** X 方向：按 timeSort（年份）加权分离——早左晚右；Y 不动，交给 fCoSE */
function runGraphCoseTimeWeightedXSeparate(cy: Core, strengthRaw?: number): void {
  const strength = resolveGraphCoseTimeXStrength(cy, strengthRaw);
  if (strength <= 1e-6) return;

  const nodes = cy
    .nodes()
    .filter(
      (n) =>
        n.style('display') !== 'none' &&
        !n.hasClass('frame-cluster-label') &&
        !n.hasClass('frame-cluster-halo')
    );
  if (nodes.length < 2) return;

  const timed: Array<{ n: (typeof nodes)[0]; t: number }> = [];
  nodes.forEach((n) => {
    const raw = n.data('timeSort');
    if (raw == null) return;
    const t = Number(raw);
    if (!Number.isFinite(t)) return;
    timed.push({ n, t });
  });
  if (timed.length < 2) return;

  let minT = Infinity;
  let maxT = -Infinity;
  for (const { t } of timed) {
    if (t < minT) minT = t;
    if (t > maxT) maxT = t;
  }
  const range = Math.max(1e-6, maxT - minT);
  const width = cy.width();
  const left = width * 0.08;
  const right = width * 0.92;
  // 非线性拉开两端，避免中段挤在一起
  const remap = (u: number) =>
    0.5 + Math.sign(u - 0.5) * Math.pow(Math.abs(u - 0.5) * 2, 0.72) * 0.5;

  cy.batch(() => {
    for (const { n, t } of timed) {
      const u = remap(Math.max(0, Math.min(1, (t - minT) / range)));
      const xTarget = left + u * (right - left);
      const p = n.position();
      n.position({ x: p.x + (xTarget - p.x) * strength, y: p.y });
    }
  });
}

/** 连线权重 → 理想边长基底：权重大 → 边短（端点更近），域 [60, 400] */
function graphCoseIdealEdgeLengthFromWeight(connectionWeightRaw: number): number {
  const w = Number.isFinite(connectionWeightRaw) ? connectionWeightRaw : 1;
  const clamped = Math.max(GRAPH_COSE_CONN_WEIGHT_MIN, Math.min(GRAPH_COSE_CONN_WEIGHT_MAX, w));
  const tLinear =
    (clamped - GRAPH_COSE_CONN_WEIGHT_MIN) /
    (GRAPH_COSE_CONN_WEIGHT_MAX - GRAPH_COSE_CONN_WEIGHT_MIN);
  const t = Math.pow(Math.max(0, Math.min(1, tLinear)), 0.58);
  return (
    GRAPH_COSE_EDGE_LENGTH_MAX -
    t * (GRAPH_COSE_EDGE_LENGTH_MAX - GRAPH_COSE_EDGE_LENGTH_MIN)
  );
}

function graphCoseEdgeConnectionWeight(edge: { data?: (k: string) => unknown } | null): number {
  const rawCw = Number(edge?.data?.('connectionWeight'));
  if (Number.isFinite(rawCw) && rawCw > 0) {
    return Math.max(GRAPH_COSE_CONN_WEIGHT_MIN, Math.min(GRAPH_COSE_CONN_WEIGHT_MAX, rawCw));
  }
  const rawEw = Number(edge?.data?.('edgeWeight'));
  if (Number.isFinite(rawEw) && rawEw > 0) {
    return Math.max(GRAPH_COSE_CONN_WEIGHT_MIN, Math.min(GRAPH_COSE_CONN_WEIGHT_MAX, rawEw));
  }
  return 1;
}

/** 边权 → 弹性：弱 0.75、强 0.25；再按全局边弹性滑块相对默认缩放 */
function graphCoseEdgeElasticityFromWeight(connectionWeightRaw: number, globalBase: number): number {
  const w = Number.isFinite(connectionWeightRaw) ? connectionWeightRaw : 1;
  const clamped = Math.max(GRAPH_COSE_CONN_WEIGHT_MIN, Math.min(GRAPH_COSE_CONN_WEIGHT_MAX, w));
  const t =
    (clamped - GRAPH_COSE_CONN_WEIGHT_MIN) /
    (GRAPH_COSE_CONN_WEIGHT_MAX - GRAPH_COSE_CONN_WEIGHT_MIN);
  const band =
    GRAPH_COSE_ELASTICITY_WEAK +
    Math.max(0, Math.min(1, t)) * (GRAPH_COSE_ELASTICITY_STRONG - GRAPH_COSE_ELASTICITY_WEAK);
  const scaled = band * (globalBase / GRAPH_COSE_ELASTICITY_SLIDER_REF);
  return Math.max(0.05, Math.min(2, scaled));
}

/**
 * 力导布局参数：边权 → 更短理想边 + 更硬弹性；排斥固定；gravity 用 fCoSE 默认 0.25。
 * Y 完全由 fCoSE 决定；X 可在后处理中按 timeSort 时间加权分离。
 */
export function buildGraphCoseLayoutOptions(
  cy: Core,
  overrides?: Record<string, unknown>,
  postProcessOptions?: GraphCosePostProcessOptions
): Record<string, unknown> {
  const enableCrossingPostProcess = postProcessOptions?.enableCrossingPostProcess !== false;
  const enableLeftFlowPostProcess = postProcessOptions?.enableLeftFlowPostProcess === true;
  const enableTopFlowPostProcess = postProcessOptions?.enableTopFlowPostProcess !== false;
  const enableOverlapSeparationPostProcess =
    postProcessOptions?.enableOverlapSeparationPostProcess !== false;
  const enableTimeXPostProcess =
    postProcessOptions?.enableDirectedAlignPostProcess !== false;
  const timeXStrength = postProcessOptions?.timeXStrength;

  const userStop = typeof overrides?.stop === 'function' ? (overrides.stop as () => void) : undefined;
  const safeOverrides = { ...(overrides ?? {}) };
  if ('stop' in safeOverrides) delete safeOverrides.stop;

  return {
    name: 'fcose',
    animate: true,
    padding: 40,
    gravity: 0.25,
    // 弱边 0.75 → 强边 0.25；全局滑块相对默认缩放整条带子
    edgeElasticity: (edge: any) =>
      graphCoseEdgeElasticityFromWeight(
        graphCoseEdgeConnectionWeight(edge),
        resolveGraphEdgeElasticity(cy)
      ),
    // 仅边权 + 层级跨度因子；最终夹到 [60, 400]
    idealEdgeLength: (edge: any) => {
      const connW = graphCoseEdgeConnectionWeight(edge);
      let len = graphCoseIdealEdgeLengthFromWeight(connW);
      const rawLenFactor = Number(edge?.data?.('edgeIdealLenFactor'));
      if (Number.isFinite(rawLenFactor)) {
        const f = Math.max(0.55, Math.min(4.0, rawLenFactor));
        len *= f;
      }
      return Math.max(GRAPH_COSE_EDGE_LENGTH_MIN, Math.min(GRAPH_COSE_EDGE_LENGTH_MAX, len));
    },
    nodeRepulsion: GRAPH_COSE_NODE_REPULSION,
    stop: () => {
      if (!isCyActive(cy)) {
        userStop?.();
        return;
      }
      syncGraphEdgeCurveDistances(cy);
      const doTimeX = enableTimeXPostProcess;
      // 时间分 X 时不再跑「源头靠左」（抢同一轴）；「源头靠上」走 Y，可并存
      const doLeftFlow = enableLeftFlowPostProcess && !doTimeX;
      const doTopFlow = enableTopFlowPostProcess;
      const doCrossing = enableCrossingPostProcess;
      const doOverlap = enableOverlapSeparationPostProcess;
      // 交叉 / 防重叠会改 Y，须放在「源头靠上」之前；时间只动 X，可最后
      if (doLeftFlow) runGraphCoseLeftFlowPostProcess(cy);
      if (doCrossing) runGraphCoseCrossingPostProcess(cy);
      if (doOverlap) runGraphCoseOverlapSeparationPostProcess(cy);
      if (doTopFlow) runGraphCoseTopFlowPostProcess(cy);
      if (doTimeX) runGraphCoseTimeWeightedXSeparate(cy, timeXStrength);
      if (doTimeX || doLeftFlow || doTopFlow || doCrossing || doOverlap) {
        syncGraphEdgeCurveDistances(cy);
      }
      userStop?.();
      requestAnimationFrame(() => {
        if (!isCyActive(cy)) return;
        cy.resize();
      });
    },
    ...safeOverrides
  };
}

export function runGraphCoseLayout(cy: Core): void {
  try {
    cy.layout(buildGraphCoseLayoutOptions(cy) as any).run();
  } catch {
    // 防御：若第三方布局在某些数据组合下拒绝函数型 idealEdgeLength，回退到稳定默认值。
    cy.layout({ name: 'fcose', animate: true, padding: 40 } as any).run();
  }
}

/**
 * 圆环布局。
 * 传入合并后的 `graphLayers` 时：按标签组权重分配半径（越大越靠近圆心），不再接力导（避免破坏环形）。
 * 未传时：使用 cytoscape 内置圆环，并可选用短时 fcose 微调。
 */
export function applyGraphCircleLayout(
  cy: Core,
  refineWithForce = true,
  layers: GraphLayerState | null = null,
  standard: GraphLayerGroupStandard = 'tag'
): void {
  if (layers != null) {
    applyGraphWeightedCircleLayout(cy, layers, standard);
    return;
  }
  const circleLayout = cy.layout({ name: 'circle', animate: true, padding: 40 } as any);
  if (!refineWithForce) {
    circleLayout.run();
    return;
  }
  circleLayout.one('layoutstop', () => {
    cy.layout(buildGraphCoseLayoutOptions(cy, {
      randomize: false,
      animate: true,
      fit: true,
      // fCoSE：randomize:false 时须用 proof（增量精修）
      quality: 'proof',
      numIter: 600,
      nodeDimensionsIncludeLabels: true
    }) as any).run();
  });
  circleLayout.run();
}

/**
 * 切到力导前移除历史簇装饰节点（若有），避免 fcose 把 halo/label 当真实节点算力。
 */
export function prepareGraphForForceLayout(cy: Core): void {
  cy.batch(() => {
    cy.nodes('.frame-cluster-label').remove();
    cy.nodes('.frame-cluster-halo').remove();
  });
}

/** 是否已有可用的现有布局坐标（用于增量 fcose，从当前位置动画导向力导结果） */
function graphForceLayoutHasSeedPositions(cy: Core): boolean {
  const nodes = cy.nodes().filter((n) => {
    if (n.style('display') === 'none') return false;
    if (n.hasClass('frame-cluster-label') || n.hasClass('frame-cluster-halo')) return false;
    return true;
  });
  if (nodes.length < 2) return false;
  const bb = nodes.boundingBox({ includeLabels: false });
  return Number.isFinite(bb.w) && Number.isFinite(bb.h) && (bb.w > 48 || bb.h > 48);
}

function graphLayoutSnapshotPositions(cy: Core): Map<string, { x: number; y: number }> {
  const m = new Map<string, { x: number; y: number }>();
  cy.nodes().forEach((n) => {
    if (n.style('display') === 'none') return;
    if (n.hasClass('frame-cluster-label') || n.hasClass('frame-cluster-halo')) return;
    const p = n.position();
    m.set(n.id(), { x: p.x, y: p.y });
  });
  return m;
}

function graphLayoutApplyPositions(cy: Core, positions: Map<string, { x: number; y: number }>): void {
  cy.batch(() => {
    positions.forEach((p, id) => {
      const n = cy.getElementById(id);
      if (n.empty() || !n.isNode()) return;
      n.position({ x: p.x, y: p.y });
    });
  });
}

/** 按目标包围盒计算 fit 所需的 zoom/pan（不依赖当前节点位置） */
function graphLayoutFitZoomPanForPositions(
  cy: Core,
  positions: Map<string, { x: number; y: number }>,
  padding: number
): { zoom: number; pan: { x: number; y: number } } | null {
  if (positions.size === 0) return null;
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  positions.forEach((p) => {
    if (p.x < x1) x1 = p.x;
    if (p.y < y1) y1 = p.y;
    if (p.x > x2) x2 = p.x;
    if (p.y > y2) y2 = p.y;
  });
  const w = Math.max(1, x2 - x1);
  const h = Math.max(1, y2 - y1);
  const vw = Math.max(1, cy.width());
  const vh = Math.max(1, cy.height());
  const pad = Math.max(0, padding);
  let zoom = Math.min((vw - 2 * pad) / w, (vh - 2 * pad) / h);
  const minZ = cy.minZoom();
  const maxZ = cy.maxZoom();
  if (Number.isFinite(minZ)) zoom = Math.max(minZ, zoom);
  if (Number.isFinite(maxZ)) zoom = Math.min(maxZ, zoom);
  if (!Number.isFinite(zoom) || zoom <= 0) return null;
  const cx = (x1 + x2) / 2;
  const cyModel = (y1 + y2) / 2;
  return {
    zoom,
    pan: {
      x: vw / 2 - zoom * cx,
      y: vh / 2 - zoom * cyModel
    }
  };
}

/** 将节点与视口同步补间到目标（避免结束时 fit 造成瞬间缩放） */
function graphLayoutAnimateToPositions(
  cy: Core,
  to: Map<string, { x: number; y: number }>,
  durationMs: number
): void {
  let pending = 0;
  const onDone = () => {
    pending -= 1;
    if (pending > 0) return;
    if (!isCyActive(cy)) return;
    syncGraphEdgeCurveDistances(cy);
  };

  const fitVp = graphLayoutFitZoomPanForPositions(cy, to, 40);
  if (fitVp) {
    pending += 1;
    cy.stop(true);
    cy.animate(
      {
        zoom: fitVp.zoom,
        pan: fitVp.pan
      },
      {
        duration: durationMs,
        easing: 'ease-out-cubic',
        complete: onDone
      }
    );
  }

  to.forEach((p, id) => {
    const n = cy.getElementById(id);
    if (n.empty() || !n.isNode()) return;
    pending += 1;
    n.stop(true);
    n.animate(
      {
        position: { x: p.x, y: p.y }
      },
      {
        duration: durationMs,
        easing: 'ease-out-cubic',
        complete: onDone
      }
    );
  });

  if (pending === 0) onDone();
}

/**
 * 应用力导（fcose）布局。仅应在「用户点底栏力导」或「新建 cy 初次布局」时调用；
 * 编辑拖点 / 改便签内容 / 连线增量同步 不应触发本函数。
 */
export function applyGraphLayout(
  cy: Core,
  name: 'fcose' | 'circle',
  circleRefineWithForce = true,
  graphLayers: GraphLayerState | null = null,
  standard: GraphLayerGroupStandard = 'tag'
): void {
  if (name === 'circle') {
    applyGraphCircleLayout(cy, circleRefineWithForce, graphLayers, standard);
    return;
  }
  prepareGraphForForceLayout(cy);
  const incremental = graphForceLayoutHasSeedPositions(cy);

  // 从时间线等已有布局切入：先静默算出含后处理的最终坐标，再从当前位置动画过去，
  // 避免「动画到中间态 → 后处理瞬移」看起来不像朝最终力导图运动。
  if (incremental) {
    const fromPos = graphLayoutSnapshotPositions(cy);
    try {
      cy.layout(
        buildGraphCoseLayoutOptions(
          cy,
          {
            name: 'fcose',
            randomize: false,
            quality: 'proof',
            animate: false,
            fit: false,
            nodeDimensionsIncludeLabels: true,
            stop: () => {
              if (!isCyActive(cy)) return;
              const toPos = graphLayoutSnapshotPositions(cy);
              graphLayoutApplyPositions(cy, fromPos);
              // 下一帧再开补间，避免与静默布局同帧抢位置
              requestAnimationFrame(() => {
                if (!isCyActive(cy)) return;
                graphLayoutAnimateToPositions(cy, toPos, 1000);
              });
            }
          },
          {
            enableCrossingPostProcess: true,
            enableLeftFlowPostProcess: false,
            enableTopFlowPostProcess: true,
            enableDirectedAlignPostProcess: true
          }
        ) as any
      ).run();
    } catch {
      cy.layout({
        name: 'fcose',
        animate: true,
        animationDuration: 1000,
        padding: 40,
        randomize: false,
        quality: 'proof'
      } as any).run();
    }
    return;
  }

  try {
    // 冷启动（节点堆叠）：randomize:true 做光谱初值并带动画
    cy.layout(
      buildGraphCoseLayoutOptions(
        cy,
        {
          name: 'fcose',
          randomize: true,
          quality: 'default',
          animate: true,
          animationDuration: 1000,
          fit: true,
          nodeDimensionsIncludeLabels: true
        },
        {
          enableCrossingPostProcess: true,
          enableLeftFlowPostProcess: false,
          enableTopFlowPostProcess: true,
          enableDirectedAlignPostProcess: true
        }
      ) as any
    ).run();
  } catch {
    cy.layout({
      name: 'fcose',
      animate: true,
      animationDuration: 1000,
      padding: 40,
      randomize: true,
      quality: 'default'
    } as any).run();
  }
}

/**
 * 按标签分组（与节点主色一致：取便签第一个标签；无标签不参与布局），组内按完整标题拼音/笔画排序。
 * `layers` 为合并后的图层面板状态：控制组顺序、隐藏组缩在底部条带。
 */
export function applyGraphTagGridLayout(cy: Core, layers: GraphLayerState | null = null): void {
  const nodes = cy.nodes();
  if (nodes.length === 0) return;

  const w = cy.width();
  const margin = 56;
  const gapX = 20;
  const gapY = 26;
  const cellW = 128;
  const cellH = 70;
  const groupGapY = 40;

  const byGroup = new Map<string, NodeSingular[]>();
  nodes.forEach((n) => {
    const key = String(n.data('tagGroup') ?? '').trim();
    if (key === '') return; // 无标签节点：不参与标签网格布局
    if (!byGroup.has(key)) byGroup.set(key, []);
    byGroup.get(key)!.push(n);
  });

  const allKeys = new Set(byGroup.keys());
  const hiddenSet = new Set((layers?.hidden ?? []).map((h) => String(h).trim()));
  const keys = layers
    ? orderedTagGroupKeysFromState(allKeys, layers)
    : [...allKeys].sort((a, b) => {
        if (a === '' && b !== '') return 1;
        if (b === '' && a !== '') return -1;
        return a.localeCompare(b, GRAPH_SORT_LOCALE);
      });

  const usableW = Math.max(80, w - 2 * margin);
  const cols = Math.max(1, Math.floor(usableW / (cellW + gapX)));

  let yTop = margin;
  const pos = new Map<string, { x: number; y: number }>();

  for (const key of keys) {
    const groupNodes = byGroup.get(key)!;
    groupNodes.sort((a, b) =>
      String(a.data('fullTitle') || '').localeCompare(String(b.data('fullTitle') || ''), GRAPH_SORT_LOCALE)
    );
    if (hiddenSet.has(key)) {
      groupNodes.forEach((node, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = margin + col * (cellW + gapX) + cellW / 2;
        const y = Math.max(margin + cellH / 2, cy.height() - margin - row * (cellH + gapY) - cellH / 2);
        pos.set(node.id(), { x, y });
      });
      continue;
    }
    const rows = Math.ceil(groupNodes.length / cols);
    groupNodes.forEach((node, i) => {
      const row = Math.floor(i / cols);
      const col = i % cols;
      const x = margin + col * (cellW + gapX) + cellW / 2;
      const y = yTop + row * (cellH + gapY) + cellH / 2;
      pos.set(node.id(), { x, y });
    });
    yTop += rows * (cellH + gapY) + groupGapY;
  }

  cy.nodes().layout({
    name: 'preset',
    animate: true,
    transform: (node) => pos.get(node.id()) ?? { x: w / 2, y: cy.height() / 2 }
  }).run();

  requestAnimationFrame(() => {
    if (!isCyActive(cy)) return;
    cy.resize();
    cy.fit(undefined, 48);
  });
}

/** 图谱二级布局（时间线 / 力导），用于恢复上次选择 */
export type GraphLayoutMode = 'time' | 'cose';

export const DEFAULT_GRAPH_LAYOUT_MODE: GraphLayoutMode = 'cose';

export function coerceGraphLayoutMode(raw: unknown): GraphLayoutMode {
  if (raw === 'time' || raw === 'cose') return raw;
  // 历史 frameCluster 已移除，回退到默认力导
  return DEFAULT_GRAPH_LAYOUT_MODE;
}

/** 合并便签中出现的分组与已存顺序/隐藏；供时间线纵轴与导出一致 */
export function mergeGraphLayerState(
  notes: Note[],
  saved?: GraphLayerState | null,
  standard: GraphLayerGroupStandard = 'tag'
): GraphLayerState {
  const allKeys = new Set<string>();
  for (const n of notes) {
    if (standard === 'tag') {
      const labels = noteTagLabels(n);
      if (labels.length === 0) {
        allKeys.add(GRAPH_UNTAGGED_TAG_GROUP);
      } else {
        labels.forEach((l) => allKeys.add(l));
      }
      continue;
    }
    if (standard === 'emoji') {
      allKeys.add(noteEmojiLayerGroupKey(n));
      continue;
    }

    // frame 标准：每便签至多一个 frame（旧多簇取第一个）
    const candidates =
      n.groupIds?.length
        ? n.groupIds.slice(0, 1)
        : n.groupId
          ? [n.groupId]
          : n.groupNames?.length
            ? n.groupNames.slice(0, 1)
            : n.groupName
              ? [n.groupName]
              : [];

    const cleaned = candidates.map((x) => String(x).trim()).filter((x) => x !== '');
    if (cleaned.length === 0) {
      allKeys.add(''); // 无簇归属（可在面板中显隐/加权）
      continue;
    }
    cleaned.forEach((k) => allKeys.add(k));
  }
  const prevOrder = saved?.order ?? [];
  const ordered: string[] = [];
  const seen = new Set<string>();
  // 标签 / Emoji / 簇：均保留已存拖拽顺序；新键按默认规则追加（标签用首字母，「无标签」靠后）
  for (const k of prevOrder) {
    const key = String(k).trim();
    if (allKeys.has(key) && !seen.has(key)) {
      ordered.push(key);
      seen.add(key);
    }
  }
  const rest = [...allKeys]
    .filter((k) => !seen.has(k))
    .sort((a, b) =>
      standard === 'tag'
        ? compareTagLayerKeysForAutoOrder(a, b, GRAPH_UNTAGGED_TAG_GROUP)
        : (() => {
            if (a === '' && b !== '') return 1;
            if (b === '' && a !== '') return -1;
            return a.localeCompare(b, GRAPH_SORT_LOCALE);
          })()
    );
  const hidden = (saved?.hidden ?? []).filter((h) => allKeys.has(String(h).trim())).map((h) => String(h).trim());
  const prevW = saved?.weights ?? {};
  const weights: Record<string, number> = {};
  for (const k of allKeys) {
    const v = prevW[k];
    const fallback =
      standard === 'tag' ? defaultWeightForTagLayer(k) : 0.5;
    weights[k] =
      typeof v === 'number' && Number.isFinite(v) ? clampGraphLayerWeight(v) : clampGraphLayerWeight(fallback);
  }
  return {
    order: [...ordered, ...rest],
    hidden,
    weights,
    tagVisibilityLogic: saved?.tagVisibilityLogic === 'and' ? 'and' : 'or'
  };
}

/** 时间线 preset：横轴年份；纵轴按聚类依据分层，受 bias 牵引 */
export interface GraphTimeLayoutOptions {
  weightBias?: number;
  /** `'frame'` 或一级标签前缀；默认 frame */
  clusterBasis?: GraphClusterBasis;
}

/**
 * 按模式应用布局。`silentTimeFallback`：恢复缓存为时间线但无年份数据时，静默退回力导。
 */
export function applyGraphLayoutMode(
  cy: Core,
  mode: GraphLayoutMode,
  options?: {
    silentTimeFallback?: boolean;
    timeLayout?: GraphTimeLayoutOptions;
    /** @deprecated 圆环已移除；保留以免旧调用方报错 */
    circleRefineWithForce?: boolean;
    /**
     * 时间轴分组标准（frame / tag）；若提供 clusterBasis 则以之为准。
     */
    graphLayerGroupStandard?: GraphLayerGroupStandard;
    /**
     * 合并后的分层面板状态（簇层或标签层，与聚类依据一致）
     */
    graphLayers?: GraphLayerState | null;
  }
): void {
  const silent = options?.silentTimeFallback ?? false;
  const gl = options?.graphLayers ?? null;
  const groupStandard: GraphLayerGroupStandard =
    options?.graphLayerGroupStandard ??
    (isFrameClusterBasis(normalizeGraphClusterBasis(options?.timeLayout?.clusterBasis))
      ? 'frame'
      : 'tag');
  if (mode === 'cose') {
    applyGraphLayout(cy, 'fcose');
    return;
  }
  const valid = cy.nodes().filter((n) => n.data('timeSort') != null);
  if (valid.length === 0) {
    if (silent) {
      applyGraphLayout(cy, 'fcose');
    } else {
      applyGraphTimeLayout(cy, undefined, options?.timeLayout, gl, groupStandard);
    }
    return;
  }
  applyGraphTimeLayout(cy, undefined, options?.timeLayout, gl, groupStandard);
}

export function applyGraphTimeLayout(
  cy: Core,
  alertFn?: (message: string) => void,
  layoutOpts?: GraphTimeLayoutOptions,
  graphLayers?: GraphLayerState | null,
  standard: GraphLayerGroupStandard = 'tag'
): void {
  const fn = alertFn ?? ((m: string) => window.alert(m));
  const valid = cy.nodes().filter((n) => n.data('timeSort') != null);
  if (valid.length === 0) {
    fn('请先在便签中设置开始年份，再使用时间线排布。');
    return;
  }
  const biasRaw = layoutOpts?.weightBias ?? DEFAULT_GRAPH_TIME_AXIS_WEIGHT_BIAS;
  const bias = Math.max(0, Math.min(1, Number.isFinite(biasRaw) ? biasRaw : 0));
  const hasExplicitBasis = layoutOpts?.clusterBasis != null;
  const clusterBasis = hasExplicitBasis
    ? normalizeGraphClusterBasis(layoutOpts!.clusterBasis)
    : standard === 'frame'
      ? GRAPH_CLUSTER_BASIS_FRAME
      : null;

  const times = valid.map((n) => Number(n.data('timeSort')));
  const minT = Math.min(...times);
  const maxT = Math.max(...times);
  const range = maxT - minT || 1;
  const w = cy.width();
  const h = cy.height();
  const bandT = 80;
  const bandB = Math.max(bandT + 40, h - 80);
  const bandH = bandB - bandT;

  const hiddenSet = new Set((graphLayers?.hidden ?? []).map((h) => String(h).trim()));

  const resolveKey = (node: NodeSingular): string => {
    if (clusterBasis == null) {
      return getGraphLayerEffectiveGroupKey(node, standard, hiddenSet);
    }
    if (isFrameClusterBasis(clusterBasis)) {
      return getGraphLayerEffectiveGroupKey(node, 'frame', hiddenSet);
    }
    return resolveCyClusterGroupKey(
      String(node.data('tagGroup') ?? '').trim(),
      String(node.data('frameGroup') ?? '').trim(),
      clusterBasis,
      node.data('tagLabels')
    );
  };

  const groupKeysFromNodes = new Set<string>();
  valid.forEach((node) => {
    const groupKey = resolveKey(node);
    // 旧 tag 全量模式：无标签不占纵轴层
    if (clusterBasis == null && standard === 'tag' && groupKey === '') return;
    groupKeysFromNodes.add(groupKey);
  });
  const allKeys = groupKeysFromNodes;
  let keysOrdered = graphLayers
    ? orderedTagGroupKeysFromState(allKeys, graphLayers)
    : [...allKeys].sort((a, b) => {
        if (a === '' && b !== '') return 1;
        if (b === '' && a !== '') return -1;
        return a.localeCompare(b, GRAPH_SORT_LOCALE);
      });
  if (clusterBasis != null && !isFrameClusterBasis(clusterBasis)) {
    const nonempty = keysOrdered.filter(
      (k) => k !== '' && tagHierarchyPrefix(k) === clusterBasis
    );
    keysOrdered = allKeys.has('') ? [...nonempty, ''] : nonempty;
  }
  const keysVisible = keysOrdered.filter((k) => k === '' || !hiddenSet.has(k));
  const keysForY = keysVisible.length > 0 ? keysVisible : keysOrdered;
  const idxByKey = new Map<string, number>();
  keysForY.forEach((k, i) => idxByKey.set(k, i));
  const denom = Math.max(1, keysForY.length - 1);

  // 小斥力：在 preset 布局动画完成后，做一次近邻碰撞的轻推，避免点重叠。
  const applySmallRepulsion = (): void => {
    const repulseNodes =
      clusterBasis == null && standard === 'tag'
        ? cy.nodes().filter((n) => String(n.data('tagGroup') ?? '').trim() !== '')
        : cy.nodes();
    if (repulseNodes.length < 2) return;

    const nodesArr = repulseNodes.toArray();
    const baseSizeFallback = 28;
    let baseSize = baseSizeFallback;
    repulseNodes.forEach((n) => {
      baseSize = Math.max(baseSize, Math.max(n.outerWidth(), n.outerHeight()));
    });

    const minDist = Math.max(10, baseSize * 0.92);
    const minDist2 = minDist * minDist;

    const xScale = 0.18;
    const yScale = 1.0;
    const iterations = 3;
    const step = 0.42 * (0.2 + 0.8 * (1 - bias));

    const wLocal = cy.width();
    const hLocal = cy.height();

    const pos = nodesArr.map((n) => ({ x: n.position('x'), y: n.position('y') }));

    for (let iter = 0; iter < iterations; iter += 1) {
      for (let i = 0; i < nodesArr.length; i += 1) {
        for (let j = i + 1; j < nodesArr.length; j += 1) {
          const dx = pos[j].x - pos[i].x;
          const dy = pos[j].y - pos[i].y;

          if (Math.abs(dx) > minDist * 1.1) continue;

          const dist2 = dx * dx + dy * dy;
          if (dist2 <= 1e-9 || dist2 >= minDist2) continue;
          const dist = Math.sqrt(dist2);

          const overlap = (minDist - dist) / dist;
          const push = overlap * step;

          const pushX = dx * push * xScale;
          const pushY = dy * push * yScale;

          pos[i].x -= pushX;
          pos[i].y -= pushY;
          pos[j].x += pushX;
          pos[j].y += pushY;
        }
      }
    }

    cy.batch(() => {
      nodesArr.forEach((n, idx) => {
        const p = pos[idx];
        n.position({
          x: Math.max(0, Math.min(wLocal, p.x)),
          y: Math.max(0, Math.min(hLocal, p.y))
        });
      });
    });
  };

  const presetLayout = cy.nodes().layout({
    name: 'preset',
    animate: true,
    transform: (node) => {
      const t = node.data('timeSort');
      if (t == null) return { x: w / 2, y: h / 2 };
      const x = 80 + ((Number(t) - minT) / range) * (w - 160);
      const groupKey = resolveKey(node);
      const idx = idxByKey.get(groupKey) ?? 0;
      const norm = keysForY.length <= 1 ? 0 : idx / denom;
      const yTarget = bandT + norm * bandH;
      const maxJitter = bandH * 0.48 * (1 - bias);
      const yRaw = yTarget + (Math.random() - 0.5) * 2 * maxJitter;
      const y = yRaw;
      return { x, y };
    }
  });

  presetLayout.one('layoutstop', () => {
    applySmallRepulsion();
    requestAnimationFrame(() => cy.resize());
  });

  presetLayout.run();
}

export function patchGraphElementsData(cy: Core, elements: ElementDefinition[]): void {
  cy.batch(() => {
    elements.forEach((item) => {
      const id = item.data?.id as string | undefined;
      if (!id) return;
      const col = cy.getElementById(id);
      if (col.length > 0) col.data(item.data);
    });
  });
}

export function updateGraphStylesheet(cy: Core, stylesheet: Stylesheet): void {
  cy.style().fromJson(stylesheet as Parameters<Core['style']>[0]).update();
}

/**
 * 按当前节点间距刷新边的 unbundled-bezier 控制点距：
 * 幅度 ≈ 边长 × 比例（夹紧），平行边交替正负并拉开档位。
 */
export function syncGraphEdgeCurveDistances(cy: Core): void {
  const pairIndex = new Map<string, number>();
  cy.batch(() => {
    cy.edges().forEach((edge) => {
      const s = edge.source();
      const t = edge.target();
      if (s.empty() || t.empty() || !s.isNode() || !t.isNode()) return;
      if (
        s.hasClass('frame-cluster-label') ||
        t.hasClass('frame-cluster-label') ||
        s.hasClass('frame-cluster-halo') ||
        t.hasClass('frame-cluster-halo')
      ) {
        return;
      }
      const sp = s.position();
      const tp = t.position();
      const dx = tp.x - sp.x;
      const dy = tp.y - sp.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (!Number.isFinite(len) || len < 1e-3) {
        edge.data('controlPointDistance', 0);
        return;
      }
      const a = s.id();
      const b = t.id();
      const pairKey = a < b ? `${a}\0${b}` : `${b}\0${a}`;
      const idx = pairIndex.get(pairKey) ?? 0;
      pairIndex.set(pairKey, idx + 1);
      const sign = idx % 2 === 0 ? 1 : -1;
      const band = Math.floor(idx / 2) + 1;
      // 长边弯得更开；短边压低，避免小图里弧线夸张
      const mag = Math.max(14, Math.min(140, len * 0.2)) * (0.85 + (band - 1) * 0.45);
      edge.data('controlPointDistance', sign * mag);
      edge.data('curveSign', sign);
    });
  });
}

const HL = ['focus-core', 'focus-nh', 'focus-e'] as const;

/** 选中焦点节点直径放大/缩回动画时长 */
const FOCUS_CORE_SIZE_ANIM_MS = 180;

function graphNodeBaseSizePx(node: NodeSingular): number {
  const fav = node.data('favorite') === 'yes';
  const raw = Number(node.data(fav ? 'nodeSizeFav' : 'nodeSize'));
  if (Number.isFinite(raw) && raw > 0) return raw;
  return 28;
}

function graphNodeFocusCoreSizePx(node: NodeSingular): number {
  const fav = node.data('favorite') === 'yes';
  const raw = Number(node.data(fav ? 'nodeSizeFavCore' : 'nodeSizeCore'));
  if (Number.isFinite(raw) && raw > 0) return raw;
  return graphNodeBaseSizePx(node) * GRAPH_FOCUS_CORE_NODE_SCALE;
}

function graphNodeRenderedSizePx(node: NodeSingular): number {
  const w = node.numericStyle('width');
  if (typeof w === 'number' && Number.isFinite(w) && w > 0) return w;
  const bb = node.boundingBox({ includeLabels: false });
  const d = Math.max(bb.w, bb.h);
  return Number.isFinite(d) && d > 0 ? d : graphNodeBaseSizePx(node);
}

/**
 * 将节点宽高动画到目标直径；结束后若仍与 focus-core 状态一致则清 bypass，交回 stylesheet。
 */
function animateGraphNodeDiameter(node: NodeSingular, targetPx: number, wantCore: boolean): void {
  const cy = node.cy();
  if (!cy || cy.destroyed()) return;
  const from = graphNodeRenderedSizePx(node);
  node.stop(true);
  if (Math.abs(from - targetPx) < 0.5) {
    node.removeStyle('width');
    node.removeStyle('height');
    return;
  }
  node.style({ width: from, height: from });
  // cytoscape 类型把 style 动画标成必须带 position，运行时仅 style 合法
  const anim = node.animation({
    style: { width: targetPx, height: targetPx },
    duration: FOCUS_CORE_SIZE_ANIM_MS,
    easing: 'ease-out'
  } as any);
  anim.play().promise('complete').then(() => {
    if (cy.destroyed() || node.removed()) return;
    if (node.hasClass('focus-core') === wantCore) {
      node.removeStyle('width');
      node.removeStyle('height');
    }
  });
}

export const GRAPH_HOVER_CLASS = 'focus-hover';

/** 边标签用于筛选/合并的键：trim 后；空标签为 '' */
export function graphEdgeLabelKey(raw?: string | null): string {
  return String(raw ?? '').trim();
}

export const GRAPH_EMPTY_EDGE_LABEL_DISPLAY = '（无标签）';

export function graphEdgeLabelDisplay(key: string): string {
  return key === '' ? GRAPH_EMPTY_EDGE_LABEL_DISPLAY : key;
}

export type RelatedEdgeLabelColumn = 'from' | 'to';

export type RelatedEdgeLabelEntry = {
  /** `${column}\u0001${labelKey}`，同栏相同文案合并 */
  key: string;
  column: RelatedEdgeLabelColumn;
  labelKey: string;
  label: string;
  count: number;
};

export type RelatedEdgeLabelGroups = {
  from: RelatedEdgeLabelEntry[];
  to: RelatedEdgeLabelEntry[];
};

type ConnLabelLike = {
  id: string;
  fromNoteId: string;
  toNoteId: string;
  label?: string;
  arrow?: 'none' | 'forward' | 'reverse';
  fromArrow?: 'arrow' | 'none';
  toArrow?: 'arrow' | 'none';
};

/** 与 graphData.connectionToGraphDirection 一致（避免循环依赖） */
function connectionDirectionLocal(c: ConnLabelLike): 'forward' | 'backward' | 'both' | 'none' {
  if (c.arrow === 'none') return 'none';
  const derivedFrom: 'arrow' | 'none' =
    c.fromArrow != null ? c.fromArrow : c.arrow === 'reverse' ? 'arrow' : 'none';
  const derivedTo: 'arrow' | 'none' =
    c.toArrow != null ? c.toArrow : c.arrow === 'forward' ? 'arrow' : 'none';
  if (derivedFrom === 'arrow' && derivedTo === 'arrow') return 'both';
  if (derivedTo === 'arrow') return 'forward';
  if (derivedFrom === 'arrow') return 'backward';
  return 'none';
}

export function relatedEdgeSelectionKey(
  column: RelatedEdgeLabelColumn,
  labelKey: string
): string {
  return `${column}\u0001${labelKey}`;
}

/**
 * 相对「当前扩展端点」将边归入 From / To。
 * To = 选中点为语义起点的关系；From = 选中点为语义终点。
 * 双向与无箭头优先归入 To。
 */
export function relatedEdgeColumnForEndpoint(
  endpointId: string,
  dir: 'forward' | 'backward' | 'both' | 'none',
  fromNoteId: string,
  toNoteId: string
): RelatedEdgeLabelColumn {
  if (dir === 'both' || dir === 'none') return 'to';
  const semanticSource = dir === 'forward' ? fromNoteId : toNoteId;
  return endpointId === semanticSource ? 'to' : 'from';
}

function sortRelatedEntries(entries: RelatedEdgeLabelEntry[]): RelatedEdgeLabelEntry[] {
  return entries.sort((a, b) => {
    if (a.labelKey === '' && b.labelKey !== '') return 1;
    if (b.labelKey === '' && a.labelKey !== '') return -1;
    return a.label.localeCompare(b.label, GRAPH_SORT_LOCALE);
  });
}

/**
 * 无过滤时关系链内出现的边标签，按 From / To 分栏（栏内相同合并计数）。
 * 与 applyGraphNeighborHighlight 的 BFS 深度一致。
 */
export function collectRelatedEdgeLabelEntries(
  centerId: string,
  connections: ConnLabelLike[],
  chainLength: number = 1
): RelatedEdgeLabelGroups {
  const depth = Math.max(1, Math.floor(Number.isFinite(chainLength) ? chainLength : 1));
  const byNode = new Map<string, ConnLabelLike[]>();
  for (const c of connections) {
    if (!byNode.has(c.fromNoteId)) byNode.set(c.fromNoteId, []);
    if (!byNode.has(c.toNoteId)) byNode.set(c.toNoteId, []);
    byNode.get(c.fromNoteId)!.push(c);
    if (c.fromNoteId !== c.toNoteId) byNode.get(c.toNoteId)!.push(c);
  }

  const seenEdges = new Set<string>();
  const fromCounts = new Map<string, number>();
  const toCounts = new Map<string, number>();
  const nodeIds = new Set<string>([centerId]);
  let frontier = new Set<string>([centerId]);

  for (let dist = 0; dist < depth; dist += 1) {
    const nextFrontier = new Set<string>();
    for (const nodeId of frontier) {
      for (const c of byNode.get(nodeId) ?? []) {
        if (seenEdges.has(c.id)) continue;
        seenEdges.add(c.id);
        const labelKey = graphEdgeLabelKey(c.label);
        const dir = connectionDirectionLocal(c);
        const column = relatedEdgeColumnForEndpoint(nodeId, dir, c.fromNoteId, c.toNoteId);
        const bucket = column === 'from' ? fromCounts : toCounts;
        bucket.set(labelKey, (bucket.get(labelKey) ?? 0) + 1);
        const otherId = c.fromNoteId === nodeId ? c.toNoteId : c.fromNoteId;
        if (!nodeIds.has(otherId)) {
          nodeIds.add(otherId);
          nextFrontier.add(otherId);
        }
      }
    }
    frontier = nextFrontier;
    if (frontier.size === 0) break;
  }

  const toEntries = (column: RelatedEdgeLabelColumn, counts: Map<string, number>) =>
    sortRelatedEntries(
      [...counts.entries()].map(([labelKey, count]) => ({
        key: relatedEdgeSelectionKey(column, labelKey),
        column,
        labelKey,
        label: graphEdgeLabelDisplay(labelKey),
        count
      }))
    );

  return {
    from: toEntries('from', fromCounts),
    to: toEntries('to', toCounts)
  };
}

export function flattenRelatedEdgeLabelGroups(
  groups: RelatedEdgeLabelGroups
): RelatedEdgeLabelEntry[] {
  return [...groups.from, ...groups.to];
}

/** 点击节点：高亮自身、相邻节点及之间的连线（与 App 内 GraphView 一致；支持多中心） */
export function applyGraphNeighborHighlight(
  cy: Core,
  centerId: string | null | readonly string[],
  /** 关系链长度：通过连线连续扩展的层级数（1=当前实现） */
  chainLength: number = 1,
  /**
   * 允许遍历的边筛选键（`from\u0001label` / `to\u0001label`）；`null` 表示不过滤。
   * 空集合时仅高亮中心点。
   */
  allowedEdgeLabelKeys: Set<string> | null = null
): void {
  const centerIds = (
    !centerId ? [] : typeof centerId === 'string' ? [centerId] : [...centerId]
  ).filter((id) => typeof id === 'string' && id.length > 0);
  const centerSet = new Set(centerIds);

  const prevCores = cy.nodes('.focus-core').toArray();
  // 卸下 focus-core 前先 bypass 锁住当前直径，避免 stylesheet 瞬缩打断动画
  for (const n of prevCores) {
    if (centerSet.has(n.id())) continue;
    const w = graphNodeRenderedSizePx(n);
    n.stop(true);
    n.style({ width: w, height: w });
  }

  cy.batch(() => {
    cy.elements().removeClass([...HL]);
    if (centerIds.length === 0) return;

    const depth = Math.max(1, Math.floor(Number.isFinite(chainLength) ? chainLength : 1));

    const nodeIds = new Set<string>(centerIds);
    const edgeIds = new Set<string>();

    // BFS：从全部中心出发，按“经过的边数”扩展到 depth 层
    let frontier = new Set<string>(centerIds);
    for (let dist = 0; dist < depth; dist += 1) {
      const nextFrontier = new Set<string>();
      for (const nodeId of frontier) {
        const nodeEl = cy.getElementById(nodeId);
        if (nodeEl.empty() || !nodeEl.isNode()) continue;

        nodeEl.connectedEdges().forEach((edge) => {
          if (allowedEdgeLabelKeys) {
            const labelKey = graphEdgeLabelKey(edge.data('label'));
            const rawDir = String(edge.data('direction') ?? 'none');
            const dir =
              rawDir === 'forward' || rawDir === 'backward' || rawDir === 'both' || rawDir === 'none'
                ? rawDir
                : 'none';
            const srcId = edge.source().id();
            const tgtId = edge.target().id();
            const column = relatedEdgeColumnForEndpoint(nodeId, dir, srcId, tgtId);
            const selKey = relatedEdgeSelectionKey(column, labelKey);
            if (!allowedEdgeLabelKeys.has(selKey)) return;
          }
          edgeIds.add(edge.id());
          const ns = edge.connectedNodes();
          if (ns.length !== 2) return;
          const otherId = ns[0].id() === nodeId ? ns[1].id() : ns[0].id();
          if (!nodeIds.has(otherId)) {
            nodeIds.add(otherId);
            nextFrontier.add(otherId);
          }
        });
      }
      frontier = nextFrontier;
      if (frontier.size === 0) break;
    }

    for (const id of centerIds) {
      const el = cy.getElementById(id);
      if (!el.empty() && el.isNode()) el.addClass('focus-core');
    }
    nodeIds.forEach((id) => {
      if (centerSet.has(id)) return;
      const n = cy.getElementById(id);
      if (!n.empty() && n.isNode()) n.addClass('focus-nh');
    });
    edgeIds.forEach((id) => {
      const e = cy.getElementById(id);
      if (!e.empty() && e.isEdge()) e.addClass('focus-e');
    });
  });
  applyGraphNodeStackZIndex(cy);

  // 选中焦点：直径放大；取消/切换：旧焦点缩回
  const prevCoreIds = new Set(prevCores.map((n) => n.id()));
  for (const n of prevCores) {
    if (centerSet.has(n.id())) continue;
    animateGraphNodeDiameter(n, graphNodeBaseSizePx(n), false);
  }
  for (const id of centerIds) {
    const el = cy.getElementById(id);
    if (el.empty() || !el.isNode()) continue;
    if (prevCoreIds.has(id)) continue;
    const base = graphNodeBaseSizePx(el);
    el.stop(true);
    el.style({ width: base, height: base });
    animateGraphNodeDiameter(el, graphNodeFocusCoreSizePx(el), true);
  }
}

/** 悬停节点：加框 label 置顶（叠放序在 applyGraphNodeStackZIndex 中抬升） */
export function applyGraphHoverHighlight(cy: Core, hoverNodeId: string | null): void {
  cy.batch(() => {
    cy.nodes().removeClass(GRAPH_HOVER_CLASS);
    if (!hoverNodeId) return;
    const el = cy.getElementById(hoverNodeId);
    if (!el.empty() && el.isNode()) el.addClass(GRAPH_HOVER_CLASS);
  });
  applyGraphNodeStackZIndex(cy);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** marked 输出的链接：新窗口打开 */
function withExternalMarkdownLinks(html: string): string {
  return html.replace(/<a\b([^>]*)>/gi, (_full, attrs: string) => {
    let next = String(attrs)
      .replace(/\s*target\s*=\s*(["']).*?\1/gi, '')
      .replace(/\s*rel\s*=\s*(["']).*?\1/gi, '');
    return `<a${next} target="_blank" rel="noopener noreferrer">`;
  });
}

type MarkedLike = { parse: (md: string) => string } | null;

const STANDALONE_DIM_KEEP =
  'node.focus-core, node.focus-nh, node.focus-hover, node.focus-edge-endpoint, node:selected,' +
  'edge.focus-e, edge.focus-edge-hover, edge.focus-edge-selected, edge:selected';

function applyStandaloneGraphDim(cy: Core, hasSelection: boolean): void {
  cy.batch(() => {
    cy.elements().removeClass('graph-dim');
    if (!hasSelection) return;
    const keep = cy.elements(STANDALONE_DIM_KEEP);
    cy.elements().not(keep).addClass('graph-dim');
  });
}

function eyeSvg(open: boolean): string {
  return open
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-4.86"/><path d="m2 2 20 20"/></svg>`;
}

/** 独立 HTML：悬停预览 + 点击高亮 + From/To 筛选 + dim（与 GraphView 浏览态一致） */
export function wireStandaloneGraphInteractions(
  cy: Core,
  payload: GraphExportPayload,
  themeColor: string,
  marked: MarkedLike,
  onHighlightChange?: () => void
): { focusNote: (noteId: string) => void; clearFocus: () => void } {
  const previews = payload.notePreviews || {};
  const previewEl = document.getElementById('graph-note-preview');
  const relatedEl = document.getElementById('graph-related-panel');
  const chainLength = Math.max(1, Math.min(3, Math.round(payload.chainLength ?? 1)));
  const connections = payload.connections || [];
  let previewImgIdx = 0;
  let focusedId: string | null = null;
  let hoverId: string | null = null;
  let relatedKeys = new Set<string>();

  const notifyHighlight = () => {
    onHighlightChange?.();
  };

  const applyFocusHighlight = (noteId: string | null) => {
    if (!noteId) {
      applyGraphNeighborHighlight(cy, null, chainLength, null);
      applyStandaloneGraphDim(cy, false);
      notifyHighlight();
      return;
    }
    applyGraphNeighborHighlight(cy, noteId, chainLength, relatedKeys);
    applyStandaloneGraphDim(cy, true);
    notifyHighlight();
  };

  function renderRelatedPanel(): void {
    if (!relatedEl) return;
    if (!focusedId) {
      relatedEl.innerHTML = '';
      return;
    }
    const groups = collectRelatedEdgeLabelEntries(focusedId, connections, chainLength);
    const flat = flattenRelatedEdgeLabelGroups(groups);
    const total = flat.length;
    const selectedCount = flat.reduce((n, e) => n + (relatedKeys.has(e.key) ? 1 : 0), 0);

    const colHtml = (title: string, column: RelatedEdgeLabelColumn, entries: typeof groups.from) => {
      const allOn = entries.length > 0 && entries.every((e) => relatedKeys.has(e.key));
      const rows =
        entries.length === 0
          ? `<p class="text-[11px] text-gray-400">—</p>`
          : `<ul class="space-y-0.5">${entries
              .map((entry) => {
                const checked = relatedKeys.has(entry.key);
                return `<li>
                  <label class="flex cursor-pointer items-center gap-1.5 py-0.5 text-left text-xs ${checked ? 'text-gray-800' : 'text-gray-400'}">
                    <input type="checkbox" data-rel-key="${encodeURIComponent(entry.key)}" ${checked ? 'checked' : ''} class="h-3.5 w-3.5 shrink-0 rounded border-gray-300" style="accent-color:${escapeHtml(themeColor)}" />
                    <span class="min-w-0 flex-1 truncate font-medium" title="${escapeHtml(entry.label)}">${escapeHtml(entry.label)}</span>
                    <span class="shrink-0 tabular-nums text-[10px] text-gray-400">${entry.count}</span>
                  </label>
                </li>`;
              })
              .join('')}</ul>`;
      return `<div class="min-w-0 flex-1">
        <div class="mb-1.5 flex items-center justify-between gap-1">
          <div class="text-[10px] font-semibold uppercase tracking-wide text-gray-400">${title}</div>
          ${
            entries.length > 0
              ? `<button type="button" data-rel-col="${column}" class="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="${allOn ? `隐藏全部 ${title}` : `显示全部 ${title}`}">${eyeSvg(allOn)}</button>`
              : ''
          }
        </div>
        ${rows}
      </div>`;
    };

    relatedEl.innerHTML = `
      <div class="relative w-72 sm:w-80 shrink-0 pointer-events-auto" style="filter:drop-shadow(0 25px 50px rgb(0 0 0 / 0.15))">
        <div data-allow-context-menu class="relative rounded-2xl border border-gray-100/80 overflow-hidden flex flex-col map-chrome-surface" style="max-height:min(40vh,22rem)">
        <div class="shrink-0 flex items-center justify-between gap-2 border-b border-gray-100 px-3 py-2.5">
          <div class="min-w-0 flex-1">
            <div class="text-[10px] font-semibold uppercase tracking-wide text-gray-400">关联</div>
            <div class="truncate text-sm font-semibold text-gray-900">
              高亮筛选
              ${total > 0 ? `<span class="ml-1 font-medium text-gray-400">${selectedCount}/${total}</span>` : ''}
            </div>
          </div>
          ${
            total > 0
              ? `<span class="flex shrink-0 gap-1">
                  <button type="button" data-rel-all class="rounded-md px-1.5 py-0.5 text-[10px] font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800">全选</button>
                  <button type="button" data-rel-none class="rounded-md px-1.5 py-0.5 text-[10px] font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800">清空</button>
                </span>`
              : ''
          }
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
          ${
            total === 0
              ? `<p class="text-xs text-gray-400">当前关系链内暂无连线。</p>`
              : `<div class="flex gap-4">
                  ${colHtml('From', 'from', groups.from)}
                  <div class="w-px shrink-0 self-stretch bg-gray-100" aria-hidden="true"></div>
                  ${colHtml('To', 'to', groups.to)}
                </div>`
          }
        </div>
        </div>
      </div>`;

    relatedEl.querySelectorAll<HTMLInputElement>('input[data-rel-key]').forEach((input) => {
      input.addEventListener('change', () => {
        const raw = input.getAttribute('data-rel-key') || '';
        let key = '';
        try {
          key = decodeURIComponent(raw);
        } catch {
          key = raw;
        }
        if (!key) return;
        if (input.checked) relatedKeys.add(key);
        else relatedKeys.delete(key);
        applyFocusHighlight(focusedId);
        renderRelatedPanel();
      });
    });
    relatedEl.querySelectorAll<HTMLButtonElement>('button[data-rel-col]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const col = btn.getAttribute('data-rel-col') as RelatedEdgeLabelColumn | null;
        if (col !== 'from' && col !== 'to') return;
        const entries = col === 'from' ? groups.from : groups.to;
        const keys = entries.map((x) => x.key);
        const allOn = keys.length > 0 && keys.every((k) => relatedKeys.has(k));
        if (allOn) keys.forEach((k) => relatedKeys.delete(k));
        else keys.forEach((k) => relatedKeys.add(k));
        applyFocusHighlight(focusedId);
        renderRelatedPanel();
      });
    });
    relatedEl.querySelector<HTMLButtonElement>('button[data-rel-all]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      relatedKeys = new Set(flat.map((x) => x.key));
      applyFocusHighlight(focusedId);
      renderRelatedPanel();
    });
    relatedEl.querySelector<HTMLButtonElement>('button[data-rel-none]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      relatedKeys = new Set();
      applyFocusHighlight(focusedId);
      renderRelatedPanel();
    });
  }

  function renderPreview(): void {
    if (!previewEl) return;
    const id = hoverId || focusedId;
    if (!id) {
      previewEl.classList.add('hidden');
      previewEl.innerHTML = '';
      return;
    }
    const p = previews[id];
    if (!p) {
      previewEl.classList.add('hidden');
      previewEl.innerHTML = '';
      return;
    }
    if (previewImgIdx < 0) previewImgIdx = 0;
    const imgs = [...(p.images || [])];
    if (p.sketch) imgs.push(p.sketch);
    if (previewImgIdx >= imgs.length) previewImgIdx = 0;

    const timeRange =
      p.startYear != null
        ? p.endYear != null && p.endYear !== p.startYear
          ? `${p.startYear}–${p.endYear}`
          : String(p.startYear)
        : '';

    let detailHtml = '';
    if (p.previewDetailMd.trim()) {
      try {
        detailHtml = marked?.parse(p.previewDetailMd) ?? escapeHtml(p.previewDetailMd).replace(/\n/g, '<br/>');
      } catch {
        detailHtml = escapeHtml(p.previewDetailMd).replace(/\n/g, '<br/>');
      }
      detailHtml = withExternalMarkdownLinks(String(detailHtml));
    }

    const imgSection =
      imgs.length > 0
        ? `<div class="relative flex items-center justify-center shrink-0 px-4 py-3 bg-transparent">
            <img src="${escapeHtml(imgs[previewImgIdx])}" class="w-full max-h-64 object-contain" style="filter:drop-shadow(0 8px 18px rgba(15,23,42,0.28))" alt="" />
            ${
              imgs.length > 1
                ? `<button type="button" class="km-g-prev absolute left-2 p-1.5 bg-black/30 text-white rounded-full">‹</button>
                   <button type="button" class="km-g-next absolute right-2 p-1.5 bg-black/30 text-white rounded-full">›</button>`
                : ''
            }
          </div>`
        : '';

    previewEl.classList.remove('hidden');
    previewEl.innerHTML = `
      <div class="relative w-72 sm:w-80 shrink-0 pointer-events-auto" style="filter:drop-shadow(0 25px 50px rgb(0 0 0 / 0.15))">
        <div data-allow-context-menu class="relative rounded-2xl border border-gray-100/80 overflow-hidden flex flex-col map-chrome-surface" style="max-height:min(52vh,28rem)">
        <div class="p-4 pb-2 flex items-start justify-between gap-3 border-b border-gray-100 shrink-0">
          <div class="flex items-start gap-3 flex-1 min-w-0">
            ${p.emoji ? `<span class="text-2xl mt-0.5 shrink-0">${escapeHtml(p.emoji)}</span>` : ''}
            <div class="min-w-0 flex-1">
              <h3 class="text-lg font-bold text-gray-900 leading-tight whitespace-pre-line break-words">${escapeHtml(p.previewTitle)}</h3>
              ${timeRange ? `<div class="mt-1 text-xs text-gray-500 font-medium truncate">${escapeHtml(timeRange)}</div>` : ''}
            </div>
          </div>
        </div>
        <div class="flex-1 overflow-y-auto text-sm min-h-0">
          ${
            detailHtml
              ? `<div class="px-4 py-3 text-gray-800 leading-snug break-words border-b border-gray-50 bg-gray-50/30 mapping-preview-markdown">${detailHtml}</div>`
              : ''
          }
          ${imgSection}
        </div>
        </div>
      </div>`;

    const prev = previewEl.querySelector('.km-g-prev');
    const next = previewEl.querySelector('.km-g-next');
    prev?.addEventListener('click', (e) => {
      e.stopPropagation();
      previewImgIdx = (previewImgIdx - 1 + imgs.length) % imgs.length;
      renderPreview();
    });
    next?.addEventListener('click', (e) => {
      e.stopPropagation();
      previewImgIdx = (previewImgIdx + 1) % imgs.length;
      renderPreview();
    });
  }

  const clearFocus = () => {
    focusedId = null;
    relatedKeys = new Set();
    applyFocusHighlight(null);
    renderRelatedPanel();
    renderPreview();
  };

  cy.on('mouseover', 'node', (evt) => {
    const n = evt.target;
    if (n.hasClass?.('frame-cluster-label') || n.hasClass?.('frame-cluster-halo')) return;
    hoverId = n.id();
    previewImgIdx = 0;
    applyGraphHoverHighlight(cy, hoverId);
    notifyHighlight();
    renderPreview();
  });
  cy.on('mouseout', 'node', () => {
    hoverId = null;
    applyGraphHoverHighlight(cy, null);
    notifyHighlight();
    renderPreview();
  });

  cy.on('tap', 'node', (evt) => {
    cy.elements().unselect();
    const n = evt.target;
    if (n.hasClass?.('frame-cluster-label') || n.hasClass?.('frame-cluster-halo')) return;
    const id = n.id();
    if (focusedId === id) {
      clearFocus();
      return;
    }
    focusedId = id;
    const groups = collectRelatedEdgeLabelEntries(id, connections, chainLength);
    relatedKeys = new Set(flattenRelatedEdgeLabelGroups(groups).map((e) => e.key));
    previewImgIdx = 0;
    applyFocusHighlight(id);
    applyGraphHoverHighlight(cy, hoverId);
    renderRelatedPanel();
    renderPreview();
  });

  cy.on('tap', 'edge', () => {
    cy.elements().unselect();
    clearFocus();
  });

  cy.on('tap', (evt) => {
    if (evt.target === cy) {
      cy.elements().unselect();
      clearFocus();
    }
  });

  const focusNote = (noteId: string) => {
    const n = cy.getElementById(noteId);
    if (n.empty() || !n.isNode()) return;
    if (n.hasClass?.('frame-cluster-label') || n.hasClass?.('frame-cluster-halo')) return;
    cy.elements().unselect();
    focusedId = noteId;
    const groups = collectRelatedEdgeLabelEntries(noteId, connections, chainLength);
    relatedKeys = new Set(flattenRelatedEdgeLabelGroups(groups).map((e) => e.key));
    previewImgIdx = 0;
    applyFocusHighlight(noteId);
    applyGraphHoverHighlight(cy, hoverId);
    renderRelatedPanel();
    renderPreview();
  };

  return { focusNote, clearFocus };
}

export function downloadGraphPayloadJson(payload: GraphExportPayload, safeName: string): void {
  const text = JSON.stringify(payload, null, 2);
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${safeName}-graph-data.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function copyGraphPayloadJson(
  payload: GraphExportPayload,
  safeName: string,
  alertFn: (message: string) => void = (m) => window.alert(m)
): void {
  const text = JSON.stringify(payload, null, 2);
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(
      () => alertFn('已复制到剪贴板'),
      () => downloadGraphPayloadJson(payload, safeName)
    );
  } else {
    downloadGraphPayloadJson(payload, safeName);
  }
}

/** 独立 HTML：绑定固定 id 的按钮（与 graphExportHtml 中 DOM 一致） */
export function wireStandaloneGraphControls(
  _cy: Core,
  payload: GraphExportPayload,
  safeName: string
): void {
  const dl = document.getElementById('btnDlJson');
  const cp = document.getElementById('btnCopyJson');
  if (dl) {
    dl.onclick = (e) => {
      e.stopPropagation();
      downloadGraphPayloadJson(payload, safeName);
    };
  }
  if (cp) {
    cp.onclick = (e) => {
      e.stopPropagation();
      copyGraphPayloadJson(payload, safeName);
    };
  }
}
