import type { Note } from '../../types';
import { isNoteBoardPlaced } from '../note/notePlacement';
import { computeBoardBounds } from './boardPlacement';

export type BoardTransform = { x: number; y: number; scale: number };
export type BoardViewport = { width: number; height: number };

const DEFAULT_BOARD_TRANSFORM: BoardTransform = { x: 0, y: 0, scale: 1 };
const FIT_PADDING = 100;
const FIT_SCALE_FACTOR = 0.9;
const MIN_FIT_SCALE = 0.2;
const MAX_FIT_SCALE = 4;

/**
 * 将所有已放置的 Board 记录居中适配进一个可视区域。
 * 无记录时保留默认原点与缩放；缓存读取与 DOM 查询由调用方负责。
 */
export function fitBoardNotesToViewport(notes: Note[], viewport: BoardViewport): BoardTransform {
  const bounds = computeBoardBounds(notes.filter(isNoteBoardPlaced));
  if (!bounds) return DEFAULT_BOARD_TRANSFORM;

  const minX = bounds.minX - FIT_PADDING;
  const minY = bounds.minY - FIT_PADDING;
  const maxX = bounds.maxX + FIT_PADDING;
  const maxY = bounds.maxY + FIT_PADDING;
  const contentWidth = maxX - minX;
  const contentHeight = maxY - minY;
  const scaleX = viewport.width / contentWidth;
  const scaleY = viewport.height / contentHeight;
  const scale = Math.min(
    Math.max(MIN_FIT_SCALE, Math.min(scaleX, scaleY) * FIT_SCALE_FACTOR),
    MAX_FIT_SCALE
  );

  return {
    x: (viewport.width - contentWidth * scale) / 2 - minX * scale,
    y: (viewport.height - contentHeight * scale) / 2 - minY * scale,
    scale
  };
}
