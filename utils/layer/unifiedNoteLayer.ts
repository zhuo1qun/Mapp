import type { Frame, GraphLayerState, Note, TagVisibilityLogic } from '../../types';
import { GRAPH_UNTAGGED_TAG_GROUP } from '../graph/graphRuntimeCore';
import type { GraphLayerGroupStandard } from '../graph/graphRuntimeCore';

/** 没有 emoji 的便签在 Emoji 图层中的稳定分组键。 */
export const GRAPH_UNEMOJI_GROUP = '无 Emoji';

export function normalizeTagVisibilityLogic(raw?: string | null): TagVisibilityLogic {
  return raw === 'and' ? 'and' : 'or';
}

/**
 * 地图可绘制的地理坐标：standard / image 且有效数字、非占位 0,0（无坐标/仅白板数据的导入使用 0,0）。
 */
export function noteHasRenderableMapPosition(note: Note): boolean {
  if (note.variant !== 'standard' && note.variant !== 'image') return false;
  const c = note.coords;
  if (!c || typeof c.lat !== 'number' || typeof c.lng !== 'number' || isNaN(c.lat) || isNaN(c.lng)) {
    return false;
  }
  if (c.lat === 0 && c.lng === 0) return false;
  return true;
}

export function truncateRawTextLabel(text: string, maxLen = 56): string {
  const raw = String(text ?? '');
  const singleLine = raw.replace(/\r\n/g, '\n').replace(/\n/g, ' ').trim();
  if (!singleLine) return '（空）';
  return singleLine.length > maxLen ? `${singleLine.slice(0, Math.max(0, maxLen - 1))}…` : singleLine;
}

export function noteTagLabels(note: Note): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of note.tags ?? []) {
    const l = String(t.label ?? '').trim();
    if (!l || seen.has(l)) continue;
    seen.add(l);
    out.push(l);
  }
  return out;
}

export function noteTagLayerGroupKey(note: Note): string {
  const raw = note.tags?.[0]?.label?.trim() ?? '';
  if (raw !== '') return raw;
  return GRAPH_UNTAGGED_TAG_GROUP;
}

/** Emoji 是与标签、簇并列的图层分组依据，不再拼入标签层键。 */
export function noteEmojiLayerGroupKey(note: Note): string {
  return String(note.emoji ?? '').trim() || GRAPH_UNEMOJI_GROUP;
}

/**
 * 将旧版混在标签层里的 `【emoji】 · 🙂` 顺序和显隐偏好带入新版 Emoji 层。
 * 只在项目尚未写入 `graphEmojiLayers` 时使用；不会再把 emoji 视为标签。
 */
export function emojiLayerStateFromLegacyTagState(saved?: GraphLayerState | null): GraphLayerState | null {
  if (!saved) return null;
  const toEmoji = (value: string): string | null => {
    const match = /^【emoji】\s*·\s*(.+)$/.exec(String(value ?? '').trim());
    return match?.[1]?.trim() || null;
  };
  const order = (saved.order ?? []).map(toEmoji).filter((x): x is string => x != null);
  if (order.length === 0) return null;
  const hidden = (saved.hidden ?? []).map(toEmoji).filter((x): x is string => x != null);
  const weights: Record<string, number> = {};
  for (const [key, value] of Object.entries(saved.weights ?? {})) {
    const emoji = toEmoji(key);
    if (emoji) weights[emoji] = value;
  }
  return { order, hidden, weights };
}

export function noteFrameIdCandidates(note: Note): string[] {
  const raw = note.groupIds?.length
    ? note.groupIds.slice(0, 1)
    : note.groupId
      ? [note.groupId]
      : note.groupNames?.length
        ? note.groupNames.slice(0, 1)
        : note.groupName
          ? [note.groupName]
          : [];
  return raw.map((x) => String(x).trim()).filter((x) => x !== '');
}

/** 与图谱 frame 模式一致：取第一个未在 hiddenSet 中的簇；否则退回首候选 */
export function effectiveFrameGroupKeyForNote(note: Note, hiddenSet: Set<string>): string {
  const candidates = noteFrameIdCandidates(note);
  if (candidates.length === 0) return '';
  for (const id of candidates) {
    if (!hiddenSet.has(id)) return id;
  }
  return candidates[0];
}

export function noteBelongsToLayerGroupKey(
  note: Note,
  groupKey: string,
  standard: GraphLayerGroupStandard
): boolean {
  const k = String(groupKey).trim();
  if (standard === 'tag') {
    const labels = noteTagLabels(note);
    if (k === '' || k === GRAPH_UNTAGGED_TAG_GROUP) return labels.length === 0;
    return labels.includes(k);
  }
  if (standard === 'emoji') return noteEmojiLayerGroupKey(note) === k;
  if (k === '') {
    return noteFrameIdCandidates(note).length === 0;
  }
  return noteFrameIdCandidates(note).includes(k);
}

/**
 * 组级未隐藏 且 节点未 layerItemHidden 时可在各视图显示。
 * tag：按 tagVisibilityLogic（默认 or）；无标签看「无标签」组。
 * frame：按 effectiveFrameGroupKey。
 */
export function isNoteVisibleInUnifiedLayer(
  note: Note,
  merged: GraphLayerState,
  standard: GraphLayerGroupStandard
): boolean {
  if (note.layerItemHidden) return false;
  const hiddenSet = new Set((merged.hidden ?? []).map((h) => String(h).trim()));
  if (standard === 'tag') {
    return noteVisibleByTagHiddenSet(
      note,
      hiddenSet,
      normalizeTagVisibilityLogic(merged.tagVisibilityLogic)
    );
  }
  if (standard === 'emoji') return !hiddenSet.has(noteEmojiLayerGroupKey(note));
  const g = effectiveFrameGroupKeyForNote(note, hiddenSet);
  return !hiddenSet.has(g);
}

/**
 * 标签层显隐。
 * - or：任一标签未隐藏则可见
 * - and：全部标签均未隐藏才可见（有一个隐藏就隐藏节点）
 */
export function noteVisibleByTagHiddenSet(
  note: Note,
  tagHidden: Set<string>,
  logic: TagVisibilityLogic = 'or'
): boolean {
  const labels = noteTagLabels(note);
  if (labels.length === 0) return !tagHidden.has(GRAPH_UNTAGGED_TAG_GROUP);
  if (logic === 'and') return labels.every((l) => !tagHidden.has(l));
  return labels.some((l) => !tagHidden.has(l));
}

export function groupDisplayLabel(
  key: string,
  standard: GraphLayerGroupStandard,
  framesById: Map<string, Frame>
): string {
  const k = String(key).trim();
  if (standard === 'tag') {
    if (k === '' || k === GRAPH_UNTAGGED_TAG_GROUP) return '无标签';
    return k;
  }
  if (standard === 'emoji') return k === GRAPH_UNEMOJI_GROUP ? '无 Emoji' : k;
  if (k === '') return '无簇';
  return framesById.get(k)?.title ?? k;
}

export function sortNotesByLayerStack(noteList: Note[]): Note[] {
  return [...noteList].sort((a, b) => {
    const oa = a.layerStackOrder ?? a.createdAt;
    const ob = b.layerStackOrder ?? b.createdAt;
    if (oa !== ob) return oa - ob;
    return a.id.localeCompare(b.id);
  });
}

/** 同组内列表展示顺序：叠放靠前（大 layerStackOrder）在上 */
export function sortNotesForLayerPanelDesc(noteList: Note[]): Note[] {
  return [...noteList].sort((a, b) => {
    const oa = a.layerStackOrder ?? a.createdAt;
    const ob = b.layerStackOrder ?? b.createdAt;
    if (oa !== ob) return ob - oa;
    return a.id.localeCompare(b.id);
  });
}
