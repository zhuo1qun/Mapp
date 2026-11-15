import type { Note } from '../../types';

export interface BoardBatchTimeRange {
  startYear?: number;
  endYear?: number;
}

export interface BoardBatchTag {
  label: string;
  color: string;
}

/** 将批量编辑面板里的年份输入转换为记录字段。 */
export function parseBoardBatchTimeRange(
  startValue: string,
  endValue: string
): BoardBatchTimeRange {
  const parsedStart = startValue.trim() ? Number.parseInt(startValue.trim(), 10) : undefined;
  const parsedEnd = endValue.trim() ? Number.parseInt(endValue.trim(), 10) : undefined;
  const startYear = parsedStart != null && !Number.isNaN(parsedStart) ? parsedStart : undefined;
  const endYear =
    startYear != null &&
    parsedEnd != null &&
    !Number.isNaN(parsedEnd) &&
    parsedEnd !== startYear
      ? parsedEnd
      : undefined;

  return { startYear, endYear };
}

/** 为所选记录追加同一种标签；每张记录保留自己稳定的标签 ID。 */
export function appendTagToSelectedNotes(
  notes: Note[],
  selectedNoteIds: Iterable<string>,
  tag: BoardBatchTag,
  createTagId: () => string
): Note[] {
  const ids = new Set(selectedNoteIds);
  return notes.map((note) =>
    ids.has(note.id)
      ? {
          ...note,
          tags: [...(note.tags || []), { id: createTagId(), ...tag }]
        }
      : note
  );
}

/** 覆盖所选记录的时间范围。 */
export function setSelectedNotesTimeRange(
  notes: Note[],
  selectedNoteIds: Iterable<string>,
  timeRange: BoardBatchTimeRange
): Note[] {
  const ids = new Set(selectedNoteIds);
  return notes.map((note) =>
    ids.has(note.id) ? { ...note, ...timeRange } : note
  );
}

/** 将所选记录纳入一个轻量分组；只修改组关系，显式层级顺序保持不变。 */
export function assignSelectedNotesToGroup(
  notes: Note[],
  selectedNoteIds: Iterable<string>,
  groupId: string
): Note[] {
  const ids = new Set(selectedNoteIds);
  return notes.map((note) =>
    ids.has(note.id) ? { ...note, noteGroupId: groupId } : note
  );
}

/**
 * 解散所选记录所属的全部轻量分组；只修改组关系，显式层级顺序保持不变。
 * 返回 null 表示所选记录中没有分组，调用方无需写回项目。
 */
export function clearGroupsSharedWithSelectedNotes(
  notes: Note[],
  selectedNoteIds: Iterable<string>
): Note[] | null {
  const ids = new Set(selectedNoteIds);
  const groupIds = new Set(
    notes
      .filter((note) => ids.has(note.id) && note.noteGroupId)
      .map((note) => note.noteGroupId!)
  );
  if (groupIds.size === 0) return null;

  return notes.map((note) =>
    note.noteGroupId && groupIds.has(note.noteGroupId)
      ? { ...note, noteGroupId: undefined }
      : note
  );
}
