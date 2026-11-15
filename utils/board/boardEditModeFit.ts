import type { Note } from '../../types';
import { computeBoardBounds } from './boardPlacement';
import { isNoteBoardPlaced } from '../note/notePlacement';

export type BoardTransform = { x: number; y: number; scale: number };

/** 编辑模式下将所有已投放卡片完整置入视口；保留历史上不设缩放上下限的规则。 */
export function fitBoardNotesForEditMode(
  notes: Note[],
  viewport: { width: number; height: number },
  padding = 100
): BoardTransform | null {
  const bounds = computeBoardBounds(notes.filter(isNoteBoardPlaced));
  if (!bounds) return null;
  const minX = bounds.minX - padding;
  const minY = bounds.minY - padding;
  const contentWidth = bounds.maxX - bounds.minX + padding * 2;
  const contentHeight = bounds.maxY - bounds.minY + padding * 2;
  const scale = Math.min(viewport.width / contentWidth, viewport.height / contentHeight);
  return {
    x: (viewport.width - contentWidth * scale) / 2 - minX * scale,
    y: (viewport.height - contentHeight * scale) / 2 - minY * scale,
    scale
  };
}
