import type { GraphLayerState, Note } from '../../types';
import { compareTagLayerKeysForAutoOrder, defaultWeightForTagLayer } from './layerRegistry';
import { noteEmojiLayerGroupKey, noteTagLabels } from './unifiedNoteLayer';

export const UNTYPED_NOTE_LAYER_GROUP = '无标签';
export type NoteLayerGroupStandard = 'tag' | 'emoji' | 'frame';

const NOTE_LAYER_WEIGHT_MIN = 0.1;
const NOTE_LAYER_WEIGHT_MAX = 1;
const SORT_LOCALE = 'zh-Hans-CN';

function clampLayerWeight(value: number): number {
  return Math.min(NOTE_LAYER_WEIGHT_MAX, Math.max(NOTE_LAYER_WEIGHT_MIN, Number.isFinite(value) ? value : 0.5));
}

/** 合并项目中出现的分组、顺序、显隐与权重；地图、看板和表格共用。 */
export function mergeNoteLayerState(
  notes: Note[],
  saved?: GraphLayerState | null,
  standard: NoteLayerGroupStandard = 'tag'
): GraphLayerState {
  const allKeys = new Set<string>();
  for (const note of notes) {
    if (standard === 'tag') {
      const labels = noteTagLabels(note);
      if (labels.length === 0) allKeys.add(UNTYPED_NOTE_LAYER_GROUP);
      else labels.forEach((label) => allKeys.add(label));
      continue;
    }
    if (standard === 'emoji') {
      allKeys.add(noteEmojiLayerGroupKey(note));
      continue;
    }
    const candidates = note.groupIds?.length
      ? note.groupIds.slice(0, 1)
      : note.groupId
        ? [note.groupId]
        : note.groupNames?.length
          ? note.groupNames.slice(0, 1)
          : note.groupName
            ? [note.groupName]
            : [];
    const keys = candidates.map((value) => String(value).trim()).filter(Boolean);
    if (keys.length === 0) allKeys.add('');
    else keys.forEach((key) => allKeys.add(key));
  }

  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const value of saved?.order ?? []) {
    const key = String(value).trim();
    if (allKeys.has(key) && !seen.has(key)) {
      ordered.push(key);
      seen.add(key);
    }
  }
  const rest = [...allKeys].filter((key) => !seen.has(key)).sort((a, b) =>
    standard === 'tag'
      ? compareTagLayerKeysForAutoOrder(a, b, UNTYPED_NOTE_LAYER_GROUP)
      : a === '' && b !== ''
        ? 1
        : b === '' && a !== ''
          ? -1
          : a.localeCompare(b, SORT_LOCALE)
  );
  const hidden = (saved?.hidden ?? []).map((value) => String(value).trim()).filter((key) => allKeys.has(key));
  const weights: Record<string, number> = {};
  for (const key of allKeys) {
    const savedWeight = saved?.weights?.[key];
    const fallback = standard === 'tag' ? defaultWeightForTagLayer(key) : 0.5;
    weights[key] = clampLayerWeight(typeof savedWeight === 'number' ? savedWeight : fallback);
  }
  return {
    order: [...ordered, ...rest],
    hidden,
    weights,
    tagVisibilityLogic: saved?.tagVisibilityLogic === 'and' ? 'and' : 'or'
  };
}
