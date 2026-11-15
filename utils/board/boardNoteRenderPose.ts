import type { Note } from '../../types';
import { boardNoteDimensions } from './boardPlacement';

type BoardOffset = { x: number; y: number };

export type BoardImageResizePreview = BoardOffset & {
  id: string;
  width: number;
  height: number;
};

export type BoardNoteRenderPose = BoardOffset & {
  width: number;
  height: number;
};

/**
 * 记录在 Board 上的当前可见位置。
 * 图片尺寸预览优先，其次是多选缩放预览，最后才叠加单选 / 多选拖动偏移。
 * 卡片本体与多选边界必须共享此规则，避免拖动时二者不同步。
 */
export function resolveBoardNoteRenderPose(
  note: Note,
  options: {
    imageResizePreview?: BoardImageResizePreview | null;
    selectionScalePreview?: { boardX: number; boardY: number } | null;
    isDragging?: boolean;
    dragOffset?: BoardOffset;
    isMultiSelectDragging?: boolean;
    isInMultiSelect?: boolean;
    multiSelectDragOffset?: BoardOffset;
  }
): BoardNoteRenderPose {
  const { width: baseWidth, height: baseHeight } = boardNoteDimensions(note);
  const imageResizePreview = options.imageResizePreview;
  const dragOffset = options.dragOffset ?? { x: 0, y: 0 };
  const multiSelectDragOffset = options.multiSelectDragOffset ?? { x: 0, y: 0 };
  const dragX = (options.isDragging ? dragOffset.x : 0) +
    (options.isMultiSelectDragging && options.isInMultiSelect ? multiSelectDragOffset.x : 0);
  const dragY = (options.isDragging ? dragOffset.y : 0) +
    (options.isMultiSelectDragging && options.isInMultiSelect ? multiSelectDragOffset.y : 0);

  return {
    x: imageResizePreview?.x ?? options.selectionScalePreview?.boardX ?? note.boardX + dragX,
    y: imageResizePreview?.y ?? options.selectionScalePreview?.boardY ?? note.boardY + dragY,
    width: imageResizePreview?.width ?? baseWidth,
    height: imageResizePreview?.height ?? baseHeight
  };
}
