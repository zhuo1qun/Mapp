import type { Note } from '../../types';
import { noteTagLabels } from '../layer/unifiedNoteLayer';

/** 便签年份区间（无时间则 null） */
export function getNoteYearSpan(note: Note): { min: number; max: number } | null {
  if (note.startYear == null) return null;
  const start = note.startYear;
  const end = note.endYear != null && note.endYear !== start ? note.endYear : start;
  return { min: Math.min(start, end), max: Math.max(start, end) };
}

/** 便签起止年区间完全落在筛选区间内（非交集） */
export function noteTimeRangeFullyContainedInFilter(note: Note, range: { min: number; max: number }): boolean {
  const span = getNoteYearSpan(note);
  return !!span && span.min >= range.min && span.max <= range.max;
}

export function computeTimeRangeFromSelection(ids: Set<string>, allNotes: Note[]): { min: number; max: number } | null {
  let min = Infinity;
  let max = -Infinity;
  allNotes.forEach((note) => {
    if (!ids.has(note.id)) return;
    const span = getNoteYearSpan(note);
    if (!span) return;
    min = Math.min(min, span.min);
    max = Math.max(max, span.max);
  });
  return min === Infinity ? null : { min, max };
}

export function computeTimeRangeFromAllNotes(allNotes: Note[]): { min: number; max: number } | null {
  let min = Infinity;
  let max = -Infinity;
  allNotes.forEach((note) => {
    const span = getNoteYearSpan(note);
    if (!span) return;
    min = Math.min(min, span.min);
    max = Math.max(max, span.max);
  });
  return min === Infinity ? null : { min, max };
}

export function selectionHasTimedNotesInSelection(ids: Set<string>, allNotes: Note[]): boolean {
  return allNotes.some((note) => ids.has(note.id) && getNoteYearSpan(note) != null);
}

export function collectTagLabelsFromSelection(ids: Set<string>, allNotes: Note[]): Set<string> {
  const labels = new Set<string>();
  allNotes.forEach((note) => {
    if (!ids.has(note.id)) return;
    noteTagLabels(note).forEach((label) => labels.add(label));
  });
  return labels;
}

/** 多选框内出现的标签文案，去重后按文本排序（与颜色无关） */
export function collectSortedUniqueTagLabelsFromSelection(ids: Set<string>, allNotes: Note[]): string[] {
  return Array.from(collectTagLabelsFromSelection(ids, allNotes)).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
}

export function selectionHasUntaggedNotes(ids: Set<string>, allNotes: Note[]): boolean {
  return allNotes.some((note) => ids.has(note.id) && noteTagLabels(note).length === 0);
}

/** 勾选「无标签」或任一 label（并集；含 emoji） */
export function noteMatchesBoardTagFilter(note: Note, labels: Set<string>, includeUntagged: boolean): boolean {
  const noteLabels = noteTagLabels(note);
  const untagged = noteLabels.length === 0;
  if (includeUntagged && untagged) return true;
  return labels.size > 0 && noteLabels.some((label) => labels.has(label));
}
