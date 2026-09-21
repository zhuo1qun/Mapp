import type { Note } from '../../types';

export type NoteDraftOutcome = 'saved' | 'discarded';

/** 内容决定是否为空；id、坐标、历史保存状态和收藏状态都不是内容。 */
export function isNoteContentEmpty(note: Partial<Note>, compact = false): boolean {
  return !note.text?.trim() &&
    (compact || !note.emoji?.trim()) &&
    !note.images?.length && !note.sketch?.length && !note.media?.length &&
    (compact || !note.tags?.length) &&
    note.startYear == null && note.endYear == null;
}

/** 空内容一律放弃；是否已落盘仅决定要不要执行持久化删除。 */
export async function submitNoteDraft(
  note: Partial<Note>,
  actions: {
    isNewNote: boolean;
    onSave: (note: Partial<Note>) => void | Promise<void>;
    onDelete?: (id: string) => void | Promise<void>;
  }
): Promise<NoteDraftOutcome> {
  if (isNoteContentEmpty(note)) {
    if (note.id && !actions.isNewNote) {
      if (!actions.onDelete) throw new Error('无法删除空便签：缺少删除操作');
      await actions.onDelete(note.id);
    }
    return 'discarded';
  }
  await actions.onSave(note);
  return 'saved';
}
