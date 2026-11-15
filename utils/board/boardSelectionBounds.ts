import type { Note } from '../../types';
import { boardNoteDimensions } from './boardPlacement';
import {
  resolveBoardNoteRenderPose,
  type BoardImageResizePreview
} from './boardNoteRenderPose';

export interface BoardSelectionBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 根据卡片当前可见姿态计算选中范围；空选中不产生边界。 */
export function resolveBoardSelectionBounds(
  notes: Note[],
  options: {
    padding: number;
    imageResizePreview?: BoardImageResizePreview | null;
    selectionScalePreview?: Map<string, { boardX: number; boardY: number }> | null;
    draggingNoteId?: string | null;
    dragOffset?: { x: number; y: number };
    isMultiSelectDragging?: boolean;
    multiSelectDragOffset?: { x: number; y: number };
  }
): BoardSelectionBounds | null {
  if (notes.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  notes.forEach((note) => {
    const imageResizePreview =
      options.imageResizePreview?.id === note.id ? options.imageResizePreview : null;
    const pose = resolveBoardNoteRenderPose(note, {
      imageResizePreview,
      selectionScalePreview: options.selectionScalePreview?.get(note.id),
      isDragging: options.draggingNoteId === note.id,
      dragOffset: options.dragOffset,
      isMultiSelectDragging: options.isMultiSelectDragging,
      isInMultiSelect: true,
      multiSelectDragOffset: options.multiSelectDragOffset
    });
    minX = Math.min(minX, pose.x);
    minY = Math.min(minY, pose.y);
    maxX = Math.max(maxX, pose.x + pose.width);
    maxY = Math.max(maxY, pose.y + pose.height);
  });

  return {
    x: minX - options.padding,
    y: minY - options.padding,
    width: maxX - minX + options.padding * 2,
    height: maxY - minY + options.padding * 2
  };
}

/** 框选与卡片矩形相交的记录；additive 时保留之前的选择。 */
export function selectNotesIntersectingBoardRect(
  notes: Note[],
  start: { x: number; y: number },
  end: { x: number; y: number },
  currentSelection: Iterable<string>,
  additive: boolean
): Set<string> {
  const minX = Math.min(start.x, end.x);
  const maxX = Math.max(start.x, end.x);
  const minY = Math.min(start.y, end.y);
  const maxY = Math.max(start.y, end.y);
  const nextSelection = new Set(additive ? currentSelection : []);
  notes.forEach((note) => {
    const { width, height } = boardNoteDimensions(note);
    const intersects =
      note.boardX < maxX && note.boardX + width > minX &&
      note.boardY < maxY && note.boardY + height > minY;
    if (intersects) nextSelection.add(note.id);
    else if (!additive) nextSelection.delete(note.id);
  });
  return nextSelection;
}
