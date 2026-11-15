import type { Frame, Note } from '../../types';
import { boardNoteDimensions } from '../board/boardPlacement';

/** 便签中心落在哪个 Frame 内；重叠时沿用数组中的第一个。 */
export function findFrameContainingNoteCenter(
  note: Pick<Note, 'boardX' | 'boardY' | 'imageWidth' | 'imageHeight' | 'variant' | 'media' | 'imageRefs'>,
  boardX: number,
  boardY: number,
  frames: Frame[]
): Frame | undefined {
  const { width, height } = boardNoteDimensions(note as Note);
  const centerX = boardX + width / 2;
  const centerY = boardY + height / 2;
  return frames.find(
    (frame) =>
      centerX >= frame.x &&
      centerX <= frame.x + frame.width &&
      centerY >= frame.y &&
      centerY <= frame.y + frame.height
  );
}

/**
 * 根据当前 Board 位置同步便签的 Frame 归属。
 * 保持旧行为：只有 Frame ID 改变时才写入，以免单纯改名引发无关项目更新。
 */
export function syncNotesToContainingFrames(
  notes: Note[],
  frames: Frame[]
): { notes: Note[]; changed: boolean } {
  let changed = false;
  const nextNotes = notes.map((note) => {
    const frame = findFrameContainingNoteCenter(note, note.boardX, note.boardY, frames);
    const nextGroupIds = frame ? [frame.id] : undefined;
    const previousGroupIds = note.groupIds || (note.groupId ? [note.groupId] : []);
    const currentGroupIds = nextGroupIds || [];
    if (JSON.stringify(previousGroupIds) === JSON.stringify(currentGroupIds)) return note;

    changed = true;
    return {
      ...note,
      groupIds: nextGroupIds,
      groupNames: frame ? [frame.title] : undefined,
      groupId: frame?.id,
      groupName: frame?.title
    };
  });

  return { notes: nextNotes, changed };
}
