import type { Core, ElementDefinition } from 'cytoscape';
import type { Connection, Frame, Note, Project } from '../../types';
import { parseNoteContent } from '../../utils';
import { DEFAULT_MAP_UI_CHROME_BLUR_PX, DEFAULT_MAP_UI_CHROME_OPACITY } from '../map/mapChromeStyle';
import { mergeGraphLayerState } from './graphRuntimeCore';
import { noteTagLabels, noteTagLayerGroupKey } from '../layer/unifiedNoteLayer';
import {
  buildGraphNodeColorLegendItems,
  GRAPH_CLUSTER_BASIS_FRAME,
  noteColorForClusterBasis,
  normalizeGraphClusterBasis,
  type GraphClusterBasis,
  type GraphNodeColorLegendItem
} from './graphClusterBasis';
import type { GraphViewPreset } from './graphPresets';

// Cytoscape 的 style stylesheet 类型在当前工具链下可能不可用，这里用宽类型避免无关类型检查阻塞。
type Stylesheet = any[];

export type GraphEdgeDirection = 'forward' | 'backward' | 'both' | 'none';

/** 连线权重：未设置或非法时按 1（兼容旧数据） */
export const DEFAULT_CONNECTION_WEIGHT = 1;

/** 节点视觉权重：未设置或非法时按 1（兼容旧数据） */
export const DEFAULT_NOTE_WEIGHT = 1;

/** 夹紧节点视觉权重到可用范围（0.1～10） */
export function clampNoteWeight(raw: unknown): number {
  const w = Number(raw);
  if (!Number.isFinite(w) || w <= 0) return DEFAULT_NOTE_WEIGHT;
  return Math.round(Math.max(0.1, Math.min(10, w)) * 10) / 10;
}

/** 夹紧连线权重到可用范围（0.1～10） */
export function clampConnectionWeight(raw: unknown): number {
  const w = Number(raw);
  if (!Number.isFinite(w) || w <= 0) return DEFAULT_CONNECTION_WEIGHT;
  return Math.round(Math.max(0.1, Math.min(10, w)) * 10) / 10;
}

/** 与看板连线逻辑一致：由 arrow / fromArrow / toArrow 推导方向 */
export function connectionToGraphDirection(c: Connection): GraphEdgeDirection {
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

/**
 * 「箭头仅在开端 / source 端、末端无箭头」（backward）时，交换两端便签与锚边及箭头字段，
 * 使语义变为「末端（target）指向开端」即 Cytoscape forward。
 */
export function reverseConnectionEndpoints(c: Connection): Connection {
  const next: Connection = {
    ...c,
    fromNoteId: c.toNoteId,
    toNoteId: c.fromNoteId,
    fromSide: c.toSide,
    toSide: c.fromSide,
    fromArrow: c.toArrow,
    toArrow: c.fromArrow
  };
  if (next.fromArrow != null || next.toArrow != null) {
    delete next.arrow;
  } else {
    if (c.arrow === 'reverse') next.arrow = 'forward';
    else if (c.arrow === 'forward') next.arrow = 'reverse';
  }
  return next;
}

/**
 * 打开项目时整理连线：删除端点便签已不存在的边；将仅开端带箭头的边规范为交换端点后的 forward。
 */
export function normalizeProjectConnections(project: Project): { project: Project; mutated: boolean } {
  const noteIds = new Set(project.notes.map((n) => n.id));
  const raw = project.connections ?? [];
  let mutated = false;
  const next: Connection[] = [];

  for (const c of raw) {
    if (!noteIds.has(c.fromNoteId) || !noteIds.has(c.toNoteId)) {
      mutated = true;
      continue;
    }
    let row: Connection = c;
    if (
      c.labelAnchorNoteId != null &&
      c.labelAnchorNoteId !== c.fromNoteId &&
      c.labelAnchorNoteId !== c.toNoteId
    ) {
      row = { ...row };
      delete row.labelAnchorNoteId;
      mutated = true;
    }
    if (connectionToGraphDirection(row) === 'backward') {
      row = reverseConnectionEndpoints(row);
      mutated = true;
    }
    next.push(row);
  }

  if (!mutated) {
    return { project, mutated: false };
  }
  return { project: { ...project, connections: next }, mutated: true };
}

function noteNodeColor(
  note: Note,
  fallback: string,
  framesById?: Map<string, Frame>,
  clusterBasis: GraphClusterBasis = GRAPH_CLUSTER_BASIS_FRAME
): string {
  return noteColorForClusterBasis(note, fallback, clusterBasis, framesById);
}

/** 首行（换行符前），与 parseNoteContent 一致 */
function graphNoteFirstLine(text: string): string {
  const t = (text || '').trim();
  if (!t) return '';
  const br = t.indexOf('\n');
  return br === -1 ? t : t.slice(0, br);
}

/**
 * 关系图节点短标题：先按换行取首行，再按英文/中文逗号取逗号前一段（与便签「标题, 副标题」习惯一致）
 */
function graphNoteShortTitle(text: string): string {
  const line = graphNoteFirstLine(text).replace(/^#+\s+/, '').trim();
  if (!line) return '便签';
  const parts = line.split(/[,，]/, 2);
  const head = (parts[0] ?? '').trim();
  return head || '便签';
}

function noteLabel(note: Note): string {
  const short = graphNoteShortTitle(note.text || '');
  // Emoji 单独绘制在节点圆内；HTML label 只保留标题文字。
  const raw = short.trim();
  return raw.length > 48 ? `${raw.slice(0, 45)}…` : raw;
}

/** 与关联面板检索一致，供顶栏节点定位等复用（含 emoji / 标签） */
export function graphNoteSearchLabel(note: Note): string {
  const short = graphNoteShortTitle(note.text || '');
  const layerTags = noteTagLabels(note).join(' ');
  const raw = `${short} ${layerTags}`.trim();
  return raw || '便签';
}

function yearLabel(note: Note): string {
  if (note.startYear == null) return '';
  if (note.endYear != null && note.endYear !== note.startYear) {
    return `${note.startYear}–${note.endYear}`;
  }
  return String(note.startYear);
}

/** 图谱节点直径上限（px）；滑块值为下限 */
export const GRAPH_NODE_SIZE_MAX_PX = 36;

/**
 * 按关联度数映射节点直径：`minSize` 为无关联/最低值，最高关联度映射到 `GRAPH_NODE_SIZE_MAX_PX`。
 */
export function graphNodeSizeFromDegree(
  degree: number,
  maxDegree: number,
  minSize: number
): number {
  const minS = Math.min(GRAPH_NODE_SIZE_MAX_PX, Math.max(1, minSize));
  const maxS = GRAPH_NODE_SIZE_MAX_PX;
  if (maxS <= minS || maxDegree <= 0 || !(degree > 0)) return minS;
  const t = Math.max(0, Math.min(1, degree / maxDegree));
  const eased = Math.pow(t, 0.65);
  return Math.round((minS + (maxS - minS) * eased) * 100) / 100;
}

/**
 * 在关联度尺寸之上叠加节点自身 weight：1 保持原尺寸；0.1 / 10 分别约 -8 / +8px。
 * 对数映射让 1 附近更容易微调，同时避免高权重过早把所有节点顶到尺寸上限。
 */
export function graphNodeSizeWithWeight(baseSize: number, rawWeight: unknown): number {
  const weight = clampNoteWeight(rawWeight);
  const weighted = baseSize + Math.log10(weight) * 8;
  return Math.round(Math.max(1, Math.min(GRAPH_NODE_SIZE_MAX_PX, weighted)) * 100) / 100;
}

/** 节点圆内 Emoji 字号，随节点直径温和缩放。 */
function graphNodeEmojiSize(nodeSize: number): number {
  return Math.round(Math.max(9, Math.min(24, nodeSize * 0.58)) * 100) / 100;
}

function attachNodeDegreeSizes(
  notes: Note[],
  connections: Connection[],
  noteIds: Set<string>,
  minSize: number
): Map<string, { degree: number; nodeSize: number; nodeWeight: number }> {
  const adj = new Map<string, Set<string>>();
  for (const id of noteIds) adj.set(id, new Set());
  for (const c of connections) {
    if (!noteIds.has(c.fromNoteId) || !noteIds.has(c.toNoteId)) continue;
    if (c.fromNoteId === c.toNoteId) continue;
    adj.get(c.fromNoteId)!.add(c.toNoteId);
    adj.get(c.toNoteId)!.add(c.fromNoteId);
  }
  let maxDegree = 0;
  const degrees = new Map<string, number>();
  for (const id of noteIds) {
    const d = adj.get(id)?.size ?? 0;
    degrees.set(id, d);
    if (d > maxDegree) maxDegree = d;
  }
  const out = new Map<string, { degree: number; nodeSize: number; nodeWeight: number }>();
  const noteById = new Map(notes.map((note) => [note.id, note]));
  for (const id of noteIds) {
    const degree = degrees.get(id) ?? 0;
    const nodeWeight = clampNoteWeight(noteById.get(id)?.weight);
    const degreeSize = graphNodeSizeFromDegree(degree, maxDegree, minSize);
    out.set(id, {
      degree,
      nodeSize: graphNodeSizeWithWeight(degreeSize, nodeWeight),
      nodeWeight
    });
  }
  return out;
}

export function buildGraphElements(
  notes: Note[],
  connections: Connection[],
  themeColor: string,
  edgeWeightBase?: number,
  tagLayerWeights?: Record<string, number>,
  frames?: Frame[],
  nodeSizeMin?: number,
  clusterBasis: GraphClusterBasis = GRAPH_CLUSTER_BASIS_FRAME
): ElementDefinition[] {
  const noteById = new Map<string, Note>();
  notes.forEach((n) => noteById.set(n.id, n));
  const noteIds = new Set(noteById.keys());
  const framesById = new Map((frames ?? []).map((f) => [String(f.id).trim(), f]));
  const sizeMin = nodeSizeMin ?? DEFAULT_GRAPH_STYLESHEET_SIZING.nodeSize;
  const degreeSizes = attachNodeDegreeSizes(notes, connections, noteIds, sizeMin);
  const basis = normalizeGraphClusterBasis(clusterBasis);
  const favScale = 1.5;
  const coreScale = GRAPH_FOCUS_CORE_NODE_SCALE;

  // 连线粗细：按 Connection.weight 表现，设置面板「连线粗细」控制线宽上限。
  const edgeWeightSetting = Math.max(
    0.1,
    Math.min(2, edgeWeightBase ?? DEFAULT_GRAPH_STYLESHEET_SIZING.edgeWeight)
  );
  // Cytoscape 的箭头几何由 `arrow-scale` 控制；但其内部对小线宽存在最小值截断，
  // 导致箭头尺寸在小边权上会“看起来不随边权变化”。这里显式把 arrow-scale
  // 与线宽绑定，并保持当前基准外观（默认对应 0.8）。
  const EDGE_ARROW_SCALE_BASE = 0.8;
  const EDGE_ARROW_SCALE_MIN_FACTOR = 0.25;
  const EDGE_ARROW_WIDTH_GROWTH_HIGH_EXP = 0.75;
  const EDGE_LINE_MIN = 0.4;
  const EDGE_LINE_ABS_MAX = 4.6;
  // Cytoscape 内部 getArrowWidth 实际为：
  //   size = max((edgeWidth * 13.37)^0.9, 29) * arrow-scale
  const arrowWidthDenom = (edgeWidth: number) => Math.max(Math.pow(edgeWidth * 13.37, 0.9), 29);

  const getArrowScaleForEdgeWidth = (
    edgeWidth: number,
    baseEdgeWidth: number,
    minEdgeWidth: number
  ): number => {
    const safeBase = baseEdgeWidth > 0 ? baseEdgeWidth : 1;
    const safeMin = minEdgeWidth > 0 ? minEdgeWidth : 1;
    const baseDenom = arrowWidthDenom(safeBase);
    const denom = arrowWidthDenom(edgeWidth);

    const range = safeBase - safeMin;
    const t = range <= 1e-6 ? 1 : Math.max(0, Math.min(1, (edgeWidth - safeMin) / range));
    const factor = EDGE_ARROW_SCALE_MIN_FACTOR + (1 - EDGE_ARROW_SCALE_MIN_FACTOR) * t;

    const growthExp = edgeWidth <= safeBase ? 1 : EDGE_ARROW_WIDTH_GROWTH_HIGH_EXP;
    const baseArrowWidth = EDGE_ARROW_SCALE_BASE * baseDenom;
    const targetArrowWidth =
      baseArrowWidth * factor * Math.pow(edgeWidth / safeBase, growthExp);

    return targetArrowWidth / denom;
  };

  /** 设置项 graphEdgeWeight（0.1～2）→ 线宽上限 px */
  const maxEdgeLine = Math.max(
    EDGE_LINE_MIN,
    Math.min(
      EDGE_LINE_ABS_MAX,
      Math.round((EDGE_LINE_MIN + ((edgeWeightSetting - 0.1) / 0.9) * 2.8) * 100) / 100
    )
  );

  /**
   * 连线权重 → 线宽：先将 weight∈[0.1,10] 归一化到 [0,1]，再线性铺满 [EDGE_LINE_MIN, maxEdgeLine]。
   * t = (w − 0.1) / (10 − 0.1)；edgeLine = 0.4 + t × (maxEdgeLine − 0.4)
   */
  const connectionWeightToLines = (weight: number) => {
    const w = clampConnectionWeight(weight);
    const t = Math.max(0, Math.min(1, (w - 0.1) / (10 - 0.1)));
    const edgeLine =
      Math.round((EDGE_LINE_MIN + t * (maxEdgeLine - EDGE_LINE_MIN)) * 100) / 100;
    const edgeLineFocus = Math.max(
      0.8,
      Math.min(6.6, Math.round(edgeLine * 1.35 * 100) / 100)
    );
    const edgeLineHi = Math.max(
      0.8,
      Math.min(9.2, Math.round(edgeLine * 1.85 * 100) / 100)
    );
    return { edgeLine, edgeLineFocus, edgeLineHi };
  };
  const refLines = connectionWeightToLines(DEFAULT_CONNECTION_WEIGHT);
  const refEdgeLine = refLines.edgeLine;
  const refEdgeLineFocus = refLines.edgeLineFocus;
  const refEdgeLineHi = refLines.edgeLineHi;

  const linkedIds = new Set<string>();
  for (const c of connections) {
    if (!noteIds.has(c.fromNoteId) || !noteIds.has(c.toNoteId)) continue;
    linkedIds.add(c.fromNoteId);
    linkedIds.add(c.toNoteId);
  }

  const stackOrder = [...notes].sort((a, b) => {
    const oa = a.layerStackOrder ?? a.createdAt;
    const ob = b.layerStackOrder ?? b.createdAt;
    if (oa !== ob) return oa - ob;
    return a.id.localeCompare(b.id);
  });
  const stackZById = new Map<string, number>();
  stackOrder.forEach((n, i) => stackZById.set(n.id, 2 + i));

  const nodes: ElementDefinition[] = notes.map((note) => {
      const tagGroup = noteTagLayerGroupKey(note);
      const rawTagLayerW = Number(tagLayerWeights?.[tagGroup] ?? 0.5);
      const tagLayerW = Math.min(
        1,
        Math.max(0.1, Number.isFinite(rawTagLayerW) ? rawTagLayerW : 0.5)
      );
      /** 0～1，与图层面板半径权重一致；力导 idealEdgeLength 单独引用，增强 tag 对边长的影响 */
      const tagLayerNorm = (tagLayerW - 0.1) / 0.9;
      const main = noteLabel(note);
      const yl = yearLabel(note);
      /** 单行：时间在主标题右侧（用 em 空格拉开，避免框过窄过高） */
      const label = yl ? `${main}\u2003\u2003${yl}` : main;
      const sized = degreeSizes.get(note.id) ?? {
        degree: 0,
        nodeSize: graphNodeSizeWithWeight(
          graphNodeSizeFromDegree(0, 0, sizeMin),
          note.weight
        ),
        nodeWeight: clampNoteWeight(note.weight)
      };
      const ns = sized.nodeSize;
      const nsFav = Math.round(ns * favScale * 100) / 100;
      const nsCore = Math.round(ns * coreScale * 100) / 100;
      const nsFavCore = Math.round(ns * favScale * coreScale * 100) / 100;
      const layerTagLabels = noteTagLabels(note);
      return {
        data: {
          id: note.id,
          label,
          emoji: note.emoji || '',
          fullTitle: parseNoteContent(note.text || '').title || '便签',
          year: yl,
          timeSort: note.startYear != null ? note.startYear : undefined,
          color: noteNodeColor(note, themeColor, framesById, basis),
          layerItemHidden: Boolean(note.layerItemHidden),
          stackZ: stackZById.get(note.id) ?? 2,
          /** 0~1：图中“相对层级(level)”归一化分数（后续在本函数末尾填充） */
          levelNorm: 0,
          linkDegree: sized.degree,
          nodeWeight: sized.nodeWeight,
          nodeSize: ns,
          nodeSizeFav: nsFav,
          nodeSizeCore: nsCore,
          nodeSizeFavCore: nsFavCore,
          nodeEmojiSize: graphNodeEmojiSize(ns),
          nodeEmojiSizeFav: graphNodeEmojiSize(nsFav),
          nodeEmojiSizeCore: graphNodeEmojiSize(nsCore),
          nodeEmojiSizeFavCore: graphNodeEmojiSize(nsFavCore),
          /** 图谱「按标签分组」用：无首个标签时归入 GRAPH_UNTAGGED_TAG_GROUP */
          tagGroup,
          /** 全部标签（含 emoji；显隐：任一未隐藏则显示） */
          tagLabels: layerTagLabels,
          /**
           * 单簇归属（旧多簇取第一个）
           */
          frameGroups: (() => {
            const raw =
              note.groupIds?.length
                ? note.groupIds.slice(0, 1)
                : note.groupId
                  ? [note.groupId]
                  : note.groupNames?.length
                    ? note.groupNames.slice(0, 1)
                    : note.groupName
                      ? [note.groupName]
                      : [];
            return raw.map((x) => String(x).trim()).filter((x) => x !== '');
          })(),
          frameGroup: String(
            note.groupIds?.[0] ?? note.groupId ?? note.groupNames?.[0] ?? note.groupName ?? ''
          ).trim(),
          tagHint: layerTagLabels.join(' · ') || '',
          tagLayerNorm,
          favorite: note.isFavorite ? 'yes' : 'no',
          graphLinked: linkedIds.has(note.id) ? 'yes' : 'no'
        }
      };
    });

  // ---- level（相对层级，连续值）----
  // 仅使用“有效单向边”参与：forward/backward；排除 both/none（不提供层级约束）
  const nodeIds = notes.map((n) => n.id);
  const dirEdges: Array<{ u: string; v: string; w: number }> = [];
  for (const c of connections) {
    if (!noteIds.has(c.fromNoteId) || !noteIds.has(c.toNoteId)) continue;
    const dir = connectionToGraphDirection(c);
    if (dir !== 'forward' && dir !== 'backward') continue;
    const u = dir === 'forward' ? c.fromNoteId : c.toNoteId; // u -> v
    const v = dir === 'forward' ? c.toNoteId : c.fromNoteId;
    if (u === v) continue;
    dirEdges.push({ u, v, w: clampConnectionWeight(c.weight) });
  }

  // 用 soft 约束拟合层级：希望 L(v) - L(u) >= margin；允许违背但惩罚
  // logistic loss: log(1 + exp(margin - (Lv - Lu))) + l2
  const level = new Map<string, number>();
  nodeIds.forEach((id) => {
    const note = noteById.get(id);
    const t = note?.startYear;
    // 有时间时用时间做一个温和初始化（更快收敛）；无时间则 0
    level.set(id, t != null && Number.isFinite(t) ? Number(t) : 0);
  });
  const levelVals0 = nodeIds.map((id) => level.get(id) ?? 0);
  const min0 = Math.min(...levelVals0, 0);
  const max0 = Math.max(...levelVals0, 0);
  if (max0 - min0 > 1e-6) {
    nodeIds.forEach((id) => {
      const x = level.get(id) ?? 0;
      level.set(id, (x - min0) / (max0 - min0));
    });
  }

  const margin = 0.08;
  const lr = 0.06;
  const l2 = 0.0025;
  const iters = Math.max(60, Math.min(240, Math.round(18 + dirEdges.length * 0.12)));
  for (let iter = 0; iter < iters; iter += 1) {
    // 简单洗牌（Fisher–Yates）
    for (let i = dirEdges.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = dirEdges[i];
      dirEdges[i] = dirEdges[j];
      dirEdges[j] = tmp;
    }
    for (const e of dirEdges) {
      const lu = level.get(e.u) ?? 0;
      const lv = level.get(e.v) ?? 0;
      const d = lv - lu;
      const z = margin - d;
      // sigmoid(z) = 1 / (1 + exp(-z))
      const s = 1 / (1 + Math.exp(-z));
      const g = s * e.w;
      // 梯度：∂/∂lu = +g , ∂/∂lv = -g （推动 lv-lu 变大）
      const du = g + l2 * lu;
      const dv = -g + l2 * lv;
      level.set(e.u, lu - lr * du);
      level.set(e.v, lv - lr * dv);
    }
  }

  // 归一化到 0~1（分位数，抗极端值）
  const lvAll = nodeIds.map((id) => level.get(id) ?? 0).sort((a, b) => a - b);
  const q = (p: number) => {
    if (lvAll.length === 0) return 0;
    const idx = Math.max(0, Math.min(lvAll.length - 1, Math.round(p * (lvAll.length - 1))));
    return lvAll[idx];
  };
  const p10 = q(0.1);
  const p90 = q(0.9);
  const span = Math.abs(p90 - p10) < 1e-9 ? 1 : (p90 - p10);
  const levelNormById = new Map<string, number>();
  nodeIds.forEach((id) => {
    const s = level.get(id) ?? 0;
    levelNormById.set(id, Math.max(0, Math.min(1, (s - p10) / span)));
  });

  nodes.forEach((n) => {
    const id = String(n.data?.id ?? '');
    if (!id) return;
    (n.data as any).levelNorm = levelNormById.get(id) ?? 0;
  });

  const edges: ElementDefinition[] = [];
  /** 同对节点平行边序号：交替弯曲方向；实际曲率幅度由 syncGraphEdgeCurveDistances 按边长刷新 */
  const pairCurveIndex = new Map<string, number>();
  for (const c of connections) {
    if (!noteIds.has(c.fromNoteId) || !noteIds.has(c.toNoteId)) continue;
    const direction = connectionToGraphDirection(c);

    const edgeUntagged = 'no';

    const connectionWeight = clampConnectionWeight(c.weight);
    // 粗细 / 力导边权均直接使用连线权重（不再叠加收藏端点、标签层、跨层宽度因子）
    const edgeWeight = connectionWeight;
    const { edgeLine, edgeLineFocus, edgeLineHi } = connectionWeightToLines(connectionWeight);

    // level → 理想边长（跨层/源头辐射）；不再改线宽
    let edgeIdealLenFactor = 1;
    if (direction === 'forward' || direction === 'backward') {
      const a = direction === 'forward' ? c.fromNoteId : c.toNoteId; // source (语义起点)
      const b = direction === 'forward' ? c.toNoteId : c.fromNoteId; // target
      const la = levelNormById.get(a) ?? 0;
      const lb = levelNormById.get(b) ?? 0;
      const d = Math.max(0, lb - la); // “顺层”跨度；跨层/回指不作为辐射依据
      const edgeSpan = Math.min(1, Math.max(0, d / 0.6)); // 经验尺度：0.6 视为“大跨度”
      const sourceRootness = Math.max(0, Math.min(1, 1 - la)); // 1=最源头，0=最末端
      const rootBoost = 0.9 + 3.1 * Math.pow(sourceRootness, 2.2); // 0.9..4.0
      const spanBoost = 1.0 + 1.2 * Math.pow(edgeSpan, 1.35); // 1.0..2.2
      edgeIdealLenFactor = rootBoost * spanBoost; // 0.9..~8.8（布局侧会夹紧到 4.0）
    }

    const edgeArrowScale = Math.min(
      1.35,
      Math.max(0.15, getArrowScaleForEdgeWidth(edgeLine, refEdgeLine, 0.4))
    );
    const edgeArrowScaleFocus = Math.min(
      1.35,
      Math.max(0.15, getArrowScaleForEdgeWidth(edgeLineFocus, refEdgeLineFocus, 0.8))
    );
    const edgeArrowScaleHi = Math.min(
      1.35,
      Math.max(0.15, getArrowScaleForEdgeWidth(edgeLineHi, refEdgeLineHi, 0.8))
    );

    const pairKey =
      c.fromNoteId < c.toNoteId
        ? `${c.fromNoteId}\0${c.toNoteId}`
        : `${c.toNoteId}\0${c.fromNoteId}`;
    const pairIdx = pairCurveIndex.get(pairKey) ?? 0;
    pairCurveIndex.set(pairKey, pairIdx + 1);
    // 占位：布局后由 syncGraphEdgeCurveDistances 按实际边长覆盖幅度
    const controlPointDistance = pairIdx % 2 === 0 ? 40 : -40;

    edges.push({
      data: {
        id: c.id,
        source: c.fromNoteId,
        target: c.toNoteId,
        label: c.label || '',
        direction,
        /** 与 connectionWeight 相同；供力导 idealEdgeLength 等读取 */
        edgeWeight,
        /** 连线权重（旧数据缺省为 1）：决定线宽（受「连线粗细」上限约束）；力导 edgeElasticity = 全局弹性 / 此值 */
        connectionWeight,
        // 兼容样式表字段；无标签便签已归入「无标签」分组，此处恒为可见
        edgeUntagged,
        // 用于样式表中按数据决定连线粗细
        edgeLineWidth: edgeLine,
        edgeLineFocusWidth: edgeLineFocus,
        edgeLineHiWidth: edgeLineHi,
        // 用于力导 idealEdgeLength：让源头边更长、更像辐射
        edgeIdealLenFactor,
        // 用于样式表中按数据决定箭头端点几何大小
        edgeArrowScale,
        edgeArrowScaleFocus,
        edgeArrowScaleHi,
        // unbundled-bezier 控制点距（布局后按边长动态刷新）
        controlPointDistance,
        /** 平行边弯曲方向：+1 / -1 */
        curveSign: pairIdx % 2 === 0 ? 1 : -1
      }
    });
  }

  return [...nodes, ...edges];
}

/** 仅便签 id 集合：用于决定何时重建 Cytoscape（连线增删用增量同步，避免非力导向布局被重算） */
export function graphNodeStructureKey(notes: Note[]): string {
  return notes
    .map((x) => x.id)
    .sort()
    .join(',');
}

export function graphStructureKey(notes: Note[], connections: Connection[]): string {
  const n = notes
    .map((x) => x.id)
    .sort()
    .join(',');
  const e = connections
    .map((c) => c.id)
    .sort()
    .join(',');
  return `${n}|${e}`;
}

export type GraphStylesheetChrome = {
  opacity: number;
  blurPx?: number;
};

export type GraphStylesheetSizing = {
  nodeSize: number;
  labelFontPx: number;
  edgeWeight: number;
  /** 边标签字号（与连线粗细解耦） */
  edgeLabelFontPx: number;
};

export const DEFAULT_GRAPH_STYLESHEET_SIZING: GraphStylesheetSizing = {
  nodeSize: 28,
  labelFontPx: 10,
  edgeWeight: 0.3,
  edgeLabelFontPx: 6
};

/** 时间线「按聚类分层」（Y 轴）默认强度（未设置时） */
export const DEFAULT_GRAPH_TIME_AXIS_WEIGHT_BIAS = 0.8;

/** 力导「按时间分布」（X 轴）默认强度（未设置时） */
export const DEFAULT_GRAPH_COSE_TIME_X_BIAS = 0.8;

/** 力导边弹性（fCoSE edgeElasticity）默认值 */
export const DEFAULT_GRAPH_EDGE_ELASTICITY = 0.45;

/** 选中对象（节点/边）高亮 label 的固定屏上字号（不受设置面板 Label Size 影响） */
export const GRAPH_HIGHLIGHT_LABEL_SCREEN_PX = 16;
/** 非选中的关联高亮 label 屏上字号 */
export const GRAPH_HIGHLIGHT_RELATED_LABEL_SCREEN_PX = 12;

/** 关系链/选点高亮中心（focus-core）相对邻居（focus-nh）的节点缩放，便于区分 */
export const GRAPH_FOCUS_CORE_NODE_SCALE = 1.5;

function mergeGraphSizing(partial?: Partial<GraphStylesheetSizing>): GraphStylesheetSizing {
  const o = { ...DEFAULT_GRAPH_STYLESHEET_SIZING };
  if (partial?.nodeSize != null && Number.isFinite(partial.nodeSize)) {
    o.nodeSize = Math.min(36, Math.max(1, partial.nodeSize));
  }
  if (partial?.labelFontPx != null && Number.isFinite(partial.labelFontPx)) {
    o.labelFontPx = Math.min(16, Math.max(4, partial.labelFontPx));
  }
  if (partial?.edgeWeight != null && Number.isFinite(partial.edgeWeight)) {
    o.edgeWeight = Math.min(4, Math.max(0.1, Math.round(partial.edgeWeight * 10) / 10));
  }
  if (partial?.edgeLabelFontPx != null && Number.isFinite(partial.edgeLabelFontPx)) {
    o.edgeLabelFontPx = Math.min(16, Math.max(3, Math.round(partial.edgeLabelFontPx)));
  }
  return o;
}

/** 节点/标签尺寸 → 样式表各 px 字段 */
function graphSizingCss(themeColor: string, s: GraphStylesheetSizing) {
  const ns = s.nodeSize;
  const nf = s.labelFontPx;
  const ew = s.edgeWeight;
  const ewNorm = (Math.max(0.1, ew) - 0.1) / 0.9;
  const px = (n: number) => `${n}px`;
  const pad = Math.max(4, Math.round(nf * 0.8));
  /** 标签与节点间距：随字号留底限，并按节点直径相对默认 28px 缩放，小节点时间距同步收紧 */
  const refNs = DEFAULT_GRAPH_STYLESHEET_SIZING.nodeSize;
  const baseGap = Math.max(4, Math.round(nf * 0.8));
  const marginY = Math.max(2, Math.round((ns / refNs) * baseGap));
  const coreScale = GRAPH_FOCUS_CORE_NODE_SCALE;
  const nsCore = Math.round(ns * coreScale * 100) / 100;
  const favScale = 1.5;
  const favNs = ns * favScale;
  const favNf = nf * favScale;
  const padFav = Math.max(4, Math.round(favNf * 0.8));
  const baseGapFav = Math.max(4, Math.round(favNf * 0.8));
  const marginYFav = Math.max(2, Math.round((favNs / refNs) * baseGapFav));
  const favNsCore = Math.round(favNs * coreScale * 100) / 100;
  const marginYCore = Math.max(2, Math.round(marginY * coreScale));
  const marginYFavCore = Math.max(2, Math.round(marginYFav * coreScale));

  // 连线权重同时联动默认节点白描边（普通与收藏态均复用同一 ewNorm）。
  const borderBase = Math.max(0.2, Math.min(0.6, Math.round((ns * 0.071) * (0.1 + 0.2 * ewNorm) * 100) / 100));
  const borderBaseFav = Math.max(
    0.2,
    Math.min(0.6, Math.round((favNs * 0.071) * (0.1 + 0.2 * ewNorm) * 100) / 100)
  );
  const borderNh = Math.max(3, Math.min(8, Math.round(ns * 0.11)));
  const borderNhFav = Math.max(3, Math.min(8, Math.round(favNs * 0.11)));
  const borderCore = Math.max(4, Math.min(10, Math.round(ns * 0.14)));
  const borderCoreFav = Math.max(4, Math.min(10, Math.round(favNs * 0.14)));
  const borderSel = Math.max(3, Math.min(8, Math.round(ns * 0.11)));
  const borderSelFav = Math.max(3, Math.min(8, Math.round(favNs * 0.11)));
  const edgeLine = Math.max(0.4, Math.min(4.6, Math.round((0.4 + ewNorm * 2.8) * 100) / 100));
  const edgeFontScaled = Math.max(3, Math.min(16, s.edgeLabelFontPx));
  const edgeMarginY = Math.max(2, Math.round(edgeFontScaled * 0.72));
  const edgeOutline = Math.max(0.6, Math.min(1.4, Math.round((0.6 + ewNorm * 0.8) * 100) / 100));
  // 高亮态 label 描边：相对边标签字号缩放，避免过细/过粗
  const edgeOutlineHighlight = Math.max(2.8, Math.min(5.6, edgeFontScaled * 0.7));
  const edgeLineFocus = Math.max(0.8, Math.min(6.6, Math.round((edgeLine * 1.35) * 100) / 100));
  const edgeLineHi = Math.max(0.8, Math.min(9.2, Math.round((edgeLine * 1.85) * 100) / 100));
  const vpEdgeOff = Math.max(48, Math.round(ns * 3.2));
  return {
    ns,
    favNs,
    nf,
    favNf,
    px,
    pad,
    padFav,
    marginY,
    marginYFav,
    nsCore,
    favNsCore,
    marginYCore,
    marginYFavCore,
    borderBase,
    borderBaseFav,
    borderNh,
    borderNhFav,
    borderCore,
    borderCoreFav,
    borderSel,
    borderSelFav,
    edgeLine,
    edgeLineFocus,
    edgeLineHi,
    edgeFont: edgeFontScaled,
    edgeMarginY,
    edgeOutline,
    edgeOutlineHighlight,
    vpEdgeOff,
    themeColor
  };
}

export type GraphStylesheetOpts = {
  /**
   * true / 未设 → 可见曲线（unbundled-bezier + 控制点；bundled `bezier` 单边会画成直线）；
   * false → straight（保留箭头；haystack 不支持箭头）
   */
  edgeCurve?: boolean;
};

export function getGraphStylesheet(
  themeColor: string,
  sizingPartial?: Partial<GraphStylesheetSizing>,
  _chrome?: GraphStylesheetChrome,
  opts?: GraphStylesheetOpts
): Stylesheet {
  const sizing = mergeGraphSizing(sizingPartial);
  const z = graphSizingCss(themeColor, sizing);
  const edgeCurveOn = opts?.edgeCurve !== false;
  const curveStyle = edgeCurveOn ? 'unbundled-bezier' : 'straight';
  return [
    {
      selector: 'node',
      style: {
        /** 标题由 HTML overlay 绘制；节点 canvas label 只画圆内 Emoji。 */
        label: 'data(emoji)',
        'background-color': 'data(color)',
        // 交互命中区域：略外扩，减少贴边时误点到连线
        'bounds-expansion': 4,
        color: '#111827',
        'text-valign': 'center',
        'text-halign': 'center',
        'text-margin-y': 0,
        'font-size': 'data(nodeEmojiSize)',
        'font-family': 'Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif',
        'font-weight': '400',
        'line-height': 1,
        width: 'data(nodeSize)',
        height: 'data(nodeSize)',
        'border-width': z.borderBase,
        'border-color': '#ffffff',
        'text-opacity': 1,
        'text-background-opacity': 0,
        'text-border-width': 0,
        /**
         * 普通节点留在 auto 层（z > 普通边），避免挡住高亮连线（高亮边在 top）。
         * 高亮节点单独抬到 top。
         */
        'z-compound-depth': 'auto',
        'z-index-compare': 'manual',
        'z-index': 100
      }
    },
    {
      selector: 'node[graphLinked = "no"]',
      style: {
        opacity: 0.42
      }
    },
    {
      selector: 'node[favorite = "yes"]',
      style: {
        'font-size': 'data(nodeEmojiSizeFav)',
        width: 'data(nodeSizeFav)',
        height: 'data(nodeSizeFav)',
        'border-width': z.borderBaseFav
      }
    },
    {
      selector: 'node:selected',
      style: {
        opacity: 1,
        'border-width': z.borderSel,
        'border-color': z.themeColor
      }
    },
    {
      selector: 'node:selected[favorite = "yes"]',
      style: {
        opacity: 1,
        'border-width': z.borderSelFav,
        'border-color': z.themeColor
      }
    },
    /** 与选中点相连：节点描边高亮；标题由 HTML chrome 层绘制，Emoji 保留在圆内。 */
    {
      selector: 'node.focus-nh',
      style: {
        'border-width': z.borderNh,
        'border-color': z.themeColor,
        opacity: 1,
        'text-background-opacity': 0,
        'text-border-width': 0,
        'z-compound-depth': 'top',
        'z-index-compare': 'manual',
        'z-index': 200
      }
    },
    {
      selector: 'node.focus-nh[favorite = "yes"]',
      style: {
        'border-width': z.borderNhFav,
        'font-size': 'data(nodeEmojiSizeFav)'
      }
    },
    /** 选中边时两端便签 */
    {
      selector: 'node.focus-edge-endpoint',
      style: {
        'border-width': z.borderNh,
        'border-color': z.themeColor,
        opacity: 1,
        'text-background-opacity': 0,
        'text-border-width': 0,
        'z-compound-depth': 'top',
        'z-index-compare': 'manual',
        'z-index': 250
      }
    },
    {
      selector: 'node.focus-edge-endpoint[favorite = "yes"]',
      style: {
        'border-width': z.borderNhFav,
        'font-size': 'data(nodeEmojiSizeFav)'
      }
    },
    /** 选中（焦点中心）：标题由 HTML chrome 层绘制，Emoji 随圆放大。 */
    {
      selector: 'node.focus-core',
      style: {
        opacity: 1,
        width: 'data(nodeSizeCore)',
        height: 'data(nodeSizeCore)',
        'font-size': 'data(nodeEmojiSizeCore)',
        'border-width': z.borderCore,
        'border-color': z.themeColor,
        'text-background-opacity': 0,
        'text-border-width': 0,
        'z-compound-depth': 'top',
        'z-index-compare': 'manual',
        'z-index': 300
      }
    },
    {
      selector: 'node.focus-core[favorite = "yes"]',
      style: {
        opacity: 1,
        width: 'data(nodeSizeFavCore)',
        height: 'data(nodeSizeFavCore)',
        'font-size': 'data(nodeEmojiSizeFavCore)',
        'border-width': z.borderCoreFav,
        'font-weight': '400'
      }
    },
    /** 悬停节点：标题由 HTML chrome 层绘制，Emoji 保留在圆内。 */
    {
      selector: 'node.focus-hover',
      style: {
        opacity: 1,
        'border-width': z.borderCore,
        'border-color': z.themeColor,
        'text-background-opacity': 0,
        'text-border-width': 0,
        'z-compound-depth': 'top',
        'z-index-compare': 'manual',
        'z-index': 400
      }
    },
    {
      selector: 'node.focus-hover[favorite = "yes"]',
      style: {
        opacity: 1,
        'border-width': z.borderCoreFav,
        'font-size': 'data(nodeEmojiSizeFav)'
      }
    },
    {
      selector: 'edge',
      style: {
        label: 'data(label)',
        opacity: 0.4,
        'line-color': '#d1d5db',
        width: 'data(edgeLineWidth)',
        'arrow-scale': 'data(edgeArrowScale)',
        'curve-style': curveStyle,
        ...(edgeCurveOn
          ? {
              // bundled bezier 在单边时会退回直线；unbundled + 距离控制点才能看到弧度
              'control-point-distances': 'data(controlPointDistance)',
              'control-point-weights': 0.5
            }
          : {}),
        'target-arrow-shape': 'triangle',
        'target-arrow-color': '#d1d5db',
        'source-arrow-shape': 'none',
        'font-size': z.px(z.edgeFont),
        'text-rotation': 'autorotate',
        'text-margin-y': -z.edgeMarginY,
        color: '#9ca3af',
        /**
         * 普通连线：auto 层且 z 低于普通节点，点在节点上优先命中节点。
         */
        'z-compound-depth': 'auto',
        'z-index': 1,
        'z-index-compare': 'manual'
      }
    },
    {
      selector: 'edge[direction = "forward"]',
      style: {
        'source-arrow-shape': 'none',
        'target-arrow-shape': 'triangle'
      }
    },
    {
      selector: 'edge[direction = "backward"]',
      style: {
        'source-arrow-shape': 'triangle',
        'target-arrow-shape': 'none',
        'source-arrow-color': '#d1d5db'
      }
    },
    {
      selector: 'edge[direction = "both"]',
      style: {
        'source-arrow-shape': 'triangle',
        'target-arrow-shape': 'triangle',
        'source-arrow-color': '#d1d5db'
      }
    },
    {
      selector: 'edge[direction = "none"]',
      style: {
        'source-arrow-shape': 'none',
        'target-arrow-shape': 'none'
      }
    },
    {
      selector: 'edge:selected',
      style: {
        opacity: 1,
        'line-color': z.themeColor,
        'target-arrow-color': z.themeColor,
        'source-arrow-color': z.themeColor,
        /** top：盖过未高亮节点/边；仍低于高亮节点（200+） */
        'z-compound-depth': 'top',
        'z-index-compare': 'manual',
        'z-index': 50
      }
    },
    {
      selector: 'edge.focus-e',
      style: {
        opacity: 1,
        'line-color': z.themeColor,
        'target-arrow-color': z.themeColor,
        'source-arrow-color': z.themeColor,
        width: 'data(edgeLineFocusWidth)',
        'arrow-scale': 'data(edgeArrowScaleFocus)',
        'z-compound-depth': 'top',
        'z-index-compare': 'manual',
        'z-index': 50,
        'font-weight': '600',
        color: '#374151',
        'text-outline-width': z.edgeOutlineHighlight,
        'text-outline-color': '#ffffff',
        'text-outline-opacity': 1
      }
    },
    /** 悬停边：高于未高亮内容，低于高亮节点 */
    {
      selector: 'edge.focus-edge-hover',
      style: {
        opacity: 1,
        'line-color': z.themeColor,
        'target-arrow-color': z.themeColor,
        'source-arrow-color': z.themeColor,
        width: 'data(edgeLineHiWidth)',
        'arrow-scale': 'data(edgeArrowScaleHi)',
        'z-compound-depth': 'top',
        'z-index-compare': 'manual',
        'z-index': 80,
        'font-weight': '600',
        color: '#374151',
        'text-outline-width': z.edgeOutlineHighlight,
        'text-outline-color': '#ffffff',
        'text-outline-opacity': 1
      }
    },
    /** 选中边：同悬停，盖过未高亮节点/边 */
    {
      selector: 'edge.focus-edge-selected',
      style: {
        opacity: 1,
        'line-color': z.themeColor,
        'target-arrow-color': z.themeColor,
        'source-arrow-color': z.themeColor,
        width: 'data(edgeLineHiWidth)',
        'arrow-scale': 'data(edgeArrowScaleHi)',
        'z-compound-depth': 'top',
        'z-index-compare': 'manual',
        'z-index': 80,
        'font-weight': '600',
        color: '#374151',
        'text-outline-width': z.edgeOutlineHighlight,
        'text-outline-color': '#ffffff',
        'text-outline-opacity': 1
      }
    },
    /**
     * 仅一端在视口内时：主 label 改到屏内端（source-label / target-label），避免放大后中点在屏外。
     * 由 applyGraphEdgeLabelViewportPlacement 挂类 edge-lbl-vp-src | edge-lbl-vp-tgt。
     */
    {
      selector:
        'edge.focus-e.edge-lbl-vp-src, edge.focus-edge-hover.edge-lbl-vp-src, edge.focus-edge-selected.edge-lbl-vp-src',
      style: {
        label: '',
        'source-label': 'data(label)',
        'target-label': '',
        /** 沿边远离 source 端（屏内可见节点），避免贴在节点旁 */
        'source-text-offset': z.vpEdgeOff,
        'source-text-rotation': 'autorotate',
        'source-text-margin-y': -z.edgeMarginY,
        'font-size': z.px(z.edgeFont),
        'font-weight': '600',
        color: '#374151',
        'text-outline-width': z.edgeOutlineHighlight,
        'text-outline-color': '#ffffff',
        'text-outline-opacity': 1
      }
    },
    {
      selector:
        'edge.focus-e.edge-lbl-vp-tgt, edge.focus-edge-hover.edge-lbl-vp-tgt, edge.focus-edge-selected.edge-lbl-vp-tgt',
      style: {
        label: '',
        'source-label': '',
        'target-label': 'data(label)',
        /** 沿边远离 target 端（屏内可见节点） */
        'target-text-offset': z.vpEdgeOff,
        'target-text-rotation': 'autorotate',
        'target-text-margin-y': -z.edgeMarginY,
        'font-size': z.px(z.edgeFont),
        'font-weight': '600',
        color: '#374151',
        'text-outline-width': z.edgeOutlineHighlight,
        'text-outline-color': '#ffffff',
        'text-outline-opacity': 1
      }
    },
    {
      // 无标签节点直接隐藏：确保它们不参与渲染（含 label / 框）
      selector: 'node[tagGroup = ""]',
      style: {
        display: 'none'
      }
    },
    {
      // 避免无标签节点“把边线留在画面上”
      selector: 'edge[edgeUntagged = "yes"]',
      style: {
        display: 'none'
      }
    },
    {
      selector: 'node.graph-layer-hidden',
      style: {
        display: 'none'
      }
    },
    /** 有选中对象时（GraphView 会给未高亮元素挂 graph-dim 类）：在“原透明度基础上再 *0.5” */
    {
      selector: 'node.graph-dim',
      style: {
        opacity: 0.5
      }
    },
    {
      selector: 'node[graphLinked = "no"].graph-dim',
      style: {
        opacity: 0.21
      }
    },
    {
      selector: 'edge.graph-dim',
      style: {
        opacity: 0.2
      }
    },
    {
      selector: 'edge.graph-layer-hidden',
      style: {
        display: 'none'
      }
    }
  ];
}

/**
 * Hover / 选中（及关系链高亮）时：
 * - 选中对象（focus-core / focus-hover / focus-edge-selected / focus-edge-hover）label 16px
 * - 关联高亮（focus-nh / focus-edge-endpoint / focus-e）label 12px
 * 节点高亮 label 由 HTML chrome 层绘制，此处只隐藏 canvas 字并校正边标签。
 * 设置面板的 Label Size / Edge Label 仅作用于未高亮样式。
 */
export function applyGraphHighlightLabelScreenSize(
  cy: Core,
  sizingPartial?: Partial<GraphStylesheetSizing>,
  _chrome?: GraphStylesheetChrome
): void {
  if (!cy || cy.destroyed?.()) return;
  const sizing = mergeGraphSizing(sizingPartial);
  const z = graphSizingCss('#000000', sizing);
  const zoom = Math.max(0.08, cy.zoom());
  const hiFontSel = GRAPH_HIGHLIGHT_LABEL_SCREEN_PX;
  const hiFontRel = GRAPH_HIGHLIGHT_RELATED_LABEL_SCREEN_PX;
  const snum = (n: number) => Math.round((n / zoom) * 1000) / 1000;
  const edgeMetrics = (fontPx: number) => ({
    marginY: Math.max(2, Math.round(fontPx * 0.36)),
    outline: Math.max(2, fontPx * 0.28)
  });
  const selM = edgeMetrics(hiFontSel);
  const relM = edgeMetrics(hiFontRel);

  const nodeHi =
    'node.focus-nh, node.focus-edge-endpoint, node.focus-core, node.focus-hover';
  const edgeRel = 'edge.focus-e';
  const edgeSel = 'edge.focus-edge-hover, edge.focus-edge-selected';
  const edgeRelVpSrc = 'edge.focus-e.edge-lbl-vp-src';
  const edgeSelVpSrc =
    'edge.focus-edge-hover.edge-lbl-vp-src, edge.focus-edge-selected.edge-lbl-vp-src';
  const edgeRelVpTgt = 'edge.focus-e.edge-lbl-vp-tgt';
  const edgeSelVpTgt =
    'edge.focus-edge-hover.edge-lbl-vp-tgt, edge.focus-edge-selected.edge-lbl-vp-tgt';

  (cy.style() as any)
    .selector(nodeHi)
    .style({
      // Cytoscape 的 node label 现在只承载圆内 Emoji；高亮时仍须保持可见。
      'text-opacity': 1,
      'text-background-opacity': 0,
      'text-border-width': 0
    } as Record<string, string | number>)
    .selector(edgeRel)
    .style({
      'font-size': snum(hiFontRel),
      'text-outline-width': snum(relM.outline),
      'text-margin-y': snum(-relM.marginY)
    } as Record<string, string | number>)
    .selector(edgeSel)
    .style({
      'font-size': snum(hiFontSel),
      'text-outline-width': snum(selM.outline),
      'text-margin-y': snum(-selM.marginY)
    } as Record<string, string | number>)
    .selector(edgeRelVpSrc)
    .style({
      'font-size': snum(hiFontRel),
      'text-outline-width': snum(relM.outline),
      'source-text-offset': snum(z.vpEdgeOff),
      'source-text-margin-y': snum(-relM.marginY)
    } as Record<string, string | number>)
    .selector(edgeSelVpSrc)
    .style({
      'font-size': snum(hiFontSel),
      'text-outline-width': snum(selM.outline),
      'source-text-offset': snum(z.vpEdgeOff),
      'source-text-margin-y': snum(-selM.marginY)
    } as Record<string, string | number>)
    .selector(edgeRelVpTgt)
    .style({
      'font-size': snum(hiFontRel),
      'text-outline-width': snum(relM.outline),
      'target-text-offset': snum(z.vpEdgeOff),
      'target-text-margin-y': snum(-relM.marginY)
    } as Record<string, string | number>)
    .selector(edgeSelVpTgt)
    .style({
      'font-size': snum(hiFontSel),
      'text-outline-width': snum(selM.outline),
      'target-text-offset': snum(z.vpEdgeOff),
      'target-text-margin-y': snum(-selM.marginY)
    } as Record<string, string | number>)
    .update();
}

/** 导出页悬停/预览用（与 NotePreviewCard 数据源一致） */
export interface GraphNotePreview {
  emoji: string;
  previewTitle: string;
  previewDetailMd: string;
  images: string[];
  sketch?: string;
  startYear?: number;
  endYear?: number;
}

function buildNotePreviewsFromNotes(notes: Note[]): Record<string, GraphNotePreview> {
  const m: Record<string, GraphNotePreview> = {};
  for (const n of notes) {
    const { title, detail } = parseNoteContent(n.text || '');
    m[n.id] = {
      emoji: n.emoji || '',
      previewTitle: (title || 'Untitled Note').replace(/,\s/, '\n'),
      previewDetailMd: detail || '',
      images: [...(n.images || [])],
      sketch: n.sketch,
      startYear: n.startYear ?? undefined,
      endYear: n.endYear ?? undefined
    };
  }
  return m;
}

/** 独立页图层面板便签条目 @deprecated 展示页已改用 legendItems */
export interface GraphExportLayerNote {
  id: string;
  title: string;
  tagLabels: string[];
  frameGroups: string[];
  layerItemHidden?: boolean;
}

export interface GraphExportPayload {
  version: 1;
  app: 'mapp-graph-export';
  projectName: string;
  themeColor: string;
  exportedAt: number;
  /** cytoscape.json().elements */
  elements:
    | { nodes?: ElementDefinition[]; edges?: ElementDefinition[] }
    | ElementDefinition[];
  /** 独立网页内嵌样式（与主应用一致） */
  stylesheet: Stylesheet;
  /** 标签图层（显隐 / 权重）；独立页与簇层同时生效 */
  graphLayers?: import('../../types').GraphLayerState;
  /** 簇图层（显隐 / 权重） */
  graphFrameLayers?: import('../../types').GraphLayerState;
  /**
   * @deprecated 独立页已改为双层显隐；保留字段兼容旧导出 JSON
   */
  graphLayerGroupStandard?: 'tag' | 'frame';
  /** 独立页时间线纵轴聚类强度（0～1；默认 0.8） */
  graphTimeAxisWeightBias?: number;
  /** 独立页时间线聚类依据：frame 或一级标签前缀 */
  graphClusterBasis?: string;
  /** 独立页力导横轴按时间分布强度（0～1；默认 0.8） */
  graphCoseTimeXBias?: number;
  /** 独立页力导边弹性基数（默认 0.45） */
  graphEdgeElasticity?: number;
  /** 独立页悬停预览卡片（Markdown / 图片） */
  notePreviews?: Record<string, GraphNotePreview>;
  /** UI 玻璃（高亮 chrome label） */
  chrome?: GraphStylesheetChrome;
  /** 关系链高亮深度（无 UI，仅 bake） */
  chainLength?: number;
  /** 节点尺寸（chrome label 间距） */
  nodeSize?: number;
  /** 空闲节点标签字号 */
  labelFontPx?: number;
  /** 连线粗细基数 */
  edgeWeight?: number;
  /** 边标签字号 */
  edgeLabelFontPx?: number;
  /** 连线是否曲线 */
  edgeCurve?: boolean;
  /** 左下角节点色图例（导出时顺序与 App 一致） */
  legendItems?: GraphNodeColorLegendItem[];
  /** 临时图谱预设（点位 + 颜色 + 图例）；演示页可切换 */
  presets?: GraphViewPreset[];
  /** 导出时激活的预设 id */
  activePresetId?: string | null;
  /** 关联 From/To 筛选用连线副本 */
  connections?: Array<{
    id: string;
    fromNoteId: string;
    toNoteId: string;
    label?: string;
    arrow?: Connection['arrow'];
    fromArrow?: Connection['fromArrow'];
    toArrow?: Connection['toArrow'];
    weight?: number;
  }>;
}

export type BuildGraphExportPayloadOpts = {
  chromeOpacity?: number;
  chromeBlurPx?: number;
  chainLength?: number;
  presets?: GraphViewPreset[];
  activePresetId?: string | null;
  /** App 内预设覆盖的图例（优先于现场重算） */
  legendItemsOverride?: GraphNodeColorLegendItem[] | null;
};

export function buildGraphExportPayload(
  project: Project,
  themeColor: string,
  cy: Core,
  opts?: BuildGraphExportPayloadOpts
): GraphExportPayload {
  const tagLayers = mergeGraphLayerState(project.notes || [], project.graphLayers ?? null, 'tag');
  const frameLayers = mergeGraphLayerState(
    project.notes || [],
    project.graphFrameLayers ?? null,
    'frame'
  );
  /** 旧字段：仅兼容；独立页启动优先双层 */
  const standard = project.graphLayerStandard ?? 'tag';

  const nodeSize = project.graphNodeSize ?? DEFAULT_GRAPH_STYLESHEET_SIZING.nodeSize;
  const chrome: GraphStylesheetChrome = {
    opacity: opts?.chromeOpacity ?? DEFAULT_MAP_UI_CHROME_OPACITY,
    blurPx: opts?.chromeBlurPx ?? DEFAULT_MAP_UI_CHROME_BLUR_PX
  };
  const chainLength = Math.max(
    1,
    Math.min(3, Math.round(opts?.chainLength ?? 1))
  );

  const connections = (project.connections || []).map((c) => ({
    id: c.id,
    fromNoteId: c.fromNoteId,
    toNoteId: c.toNoteId,
    label: c.label,
    arrow: c.arrow,
    fromArrow: c.fromArrow,
    toArrow: c.toArrow,
    weight: clampConnectionWeight(c.weight)
  }));

  const legendItems =
    opts?.legendItemsOverride && opts.legendItemsOverride.length > 0
      ? opts.legendItemsOverride
      : buildGraphNodeColorLegendItems({
          notes: project.notes || [],
          themeColor,
          frames: project.frames,
          clusterBasis: project.graphClusterBasis,
          tagLayerOrder: tagLayers.order,
          frameLayerOrder: frameLayers.order
        });

  const presets = (opts?.presets ?? []).filter((p) => p && typeof p.id === 'string');

  return {
    version: 1,
    app: 'mapp-graph-export',
    projectName: project.name || '项目',
    themeColor,
    exportedAt: Date.now(),
    elements: cy.json().elements,
    stylesheet: getGraphStylesheet(
      themeColor,
      {
        nodeSize,
        labelFontPx: project.graphLabelFontPx,
        edgeWeight: project.graphEdgeWeight,
        edgeLabelFontPx: project.graphEdgeLabelFontPx
      },
      chrome,
      { edgeCurve: project.graphEdgeCurve !== false }
    ),
    graphLayers: tagLayers,
    graphFrameLayers: frameLayers,
    graphLayerGroupStandard: standard,
    graphTimeAxisWeightBias:
      project.graphTimeAxisWeightBias ?? DEFAULT_GRAPH_TIME_AXIS_WEIGHT_BIAS,
    graphClusterBasis: project.graphClusterBasis ?? GRAPH_CLUSTER_BASIS_FRAME,
    graphCoseTimeXBias: project.graphCoseTimeXBias ?? DEFAULT_GRAPH_COSE_TIME_X_BIAS,
    graphEdgeElasticity: project.graphEdgeElasticity ?? DEFAULT_GRAPH_EDGE_ELASTICITY,
    notePreviews: buildNotePreviewsFromNotes(project.notes || []),
    chrome,
    chainLength,
    nodeSize,
    labelFontPx: project.graphLabelFontPx ?? DEFAULT_GRAPH_STYLESHEET_SIZING.labelFontPx,
    edgeWeight: project.graphEdgeWeight ?? DEFAULT_GRAPH_STYLESHEET_SIZING.edgeWeight,
    edgeLabelFontPx: project.graphEdgeLabelFontPx ?? DEFAULT_GRAPH_STYLESHEET_SIZING.edgeLabelFontPx,
    edgeCurve: project.graphEdgeCurve !== false,
    legendItems,
    presets: presets.length > 0 ? presets : undefined,
    activePresetId: opts?.activePresetId ?? null,
    connections
  };
}
