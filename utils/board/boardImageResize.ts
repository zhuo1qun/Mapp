import type { SelectionScaleCorner } from './boardSelectionScale';

/** 贴纸最短边下限，避免缩到点不到。 */
export const BOARD_IMAGE_MIN_SIZE = 48;

export type ImageResizeRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** 被拖角的对角：缩放时钉住的固定点。 */
export function imageResizeFixedCorner(
  start: ImageResizeRect,
  corner: SelectionScaleCorner
): { x: number; y: number } {
  switch (corner) {
    case 'br':
      return { x: start.x, y: start.y };
    case 'bl':
      return { x: start.x + start.width, y: start.y };
    case 'tr':
      return { x: start.x, y: start.y + start.height };
    case 'tl':
      return { x: start.x + start.width, y: start.y + start.height };
  }
}

/**
 * 角点缩放贴纸：默认锁定宽高比、对角固定；lockAspect=false 时两轴独立。
 * 指针越过固定点时取绝对值，避免翻转。
 */
export function resizeBoardImageFromPointer(input: {
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
  corner: SelectionScaleCorner;
  pointerX: number;
  pointerY: number;
  lockAspect: boolean;
  minSize?: number;
}): ImageResizeRect {
  const minSize = input.minSize ?? BOARD_IMAGE_MIN_SIZE;
  const startW = Math.max(1, input.startWidth);
  const startH = Math.max(1, input.startHeight);
  const fixed = imageResizeFixedCorner(
    { x: input.startX, y: input.startY, width: startW, height: startH },
    input.corner
  );

  const rawW = Math.abs(input.pointerX - fixed.x);
  const rawH = Math.abs(input.pointerY - fixed.y);

  let width: number;
  let height: number;

  if (input.lockAspect) {
    const startLen = Math.hypot(startW, startH);
    const currLen = Math.hypot(rawW, rawH);
    const minScale = minSize / Math.min(startW, startH);
    const scale = Math.max(minScale, startLen > 0 ? currLen / startLen : minScale);
    width = startW * scale;
    height = startH * scale;
  } else {
    width = Math.max(minSize, rawW);
    height = Math.max(minSize, rawH);
  }

  width = Math.max(minSize, Math.round(width));
  height = Math.max(minSize, Math.round(height));
  if (input.lockAspect) {
    height = Math.max(minSize, Math.round(width * (startH / startW)));
    if (height < minSize) {
      height = minSize;
      width = Math.max(minSize, Math.round(height * (startW / startH)));
    }
  }

  switch (input.corner) {
    case 'br':
      return { x: fixed.x, y: fixed.y, width, height };
    case 'bl':
      return { x: fixed.x - width, y: fixed.y, width, height };
    case 'tr':
      return { x: fixed.x, y: fixed.y - height, width, height };
    case 'tl':
      return { x: fixed.x - width, y: fixed.y - height, width, height };
  }
}
