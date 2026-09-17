import type { Frame, Note } from '../../types';
import { boardNoteDimensions } from './boardPlacement';
import { noteWithBoardDragCommit } from './boardNoteDrag';

export type SelectionScaleCorner = 'tl' | 'tr' | 'bl' | 'br';

export type SelectionBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export type SelectionNotePose = {
  boardX: number;
  boardY: number;
  width: number;
  height: number;
};

export type SelectionScaleAxes = {
  scaleX: number;
  scaleY: number;
};

const MIN_SCALE = 0.08;
const MAX_SCALE = 24;

/** 选中便签的内容包围盒（不含 UI padding）。 */
export function computeSelectionContentBounds(
  notes: Iterable<Pick<Note, 'boardX' | 'boardY' | 'imageWidth' | 'imageHeight' | 'variant' | 'media' | 'imageRefs'>>,
  getPose?: (note: Note) => { boardX: number; boardY: number } | null
): SelectionBounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let count = 0;
  for (const note of notes) {
    const { width, height } = boardNoteDimensions(note as Note);
    const pose = getPose?.(note as Note);
    const x = pose?.boardX ?? note.boardX;
    const y = pose?.boardY ?? note.boardY;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + width);
    maxY = Math.max(maxY, y + height);
    count += 1;
  }
  if (count === 0 || !Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

export function selectionFixedPoint(
  bounds: SelectionBounds,
  corner: SelectionScaleCorner
): { x: number; y: number } {
  switch (corner) {
    case 'br':
      return { x: bounds.minX, y: bounds.minY };
    case 'bl':
      return { x: bounds.maxX, y: bounds.minY };
    case 'tr':
      return { x: bounds.minX, y: bounds.maxY };
    case 'tl':
      return { x: bounds.maxX, y: bounds.maxY };
  }
}

export function selectionMovingCorner(
  bounds: SelectionBounds,
  corner: SelectionScaleCorner
): { x: number; y: number } {
  switch (corner) {
    case 'br':
      return { x: bounds.maxX, y: bounds.maxY };
    case 'bl':
      return { x: bounds.minX, y: bounds.maxY };
    case 'tr':
      return { x: bounds.maxX, y: bounds.minY };
    case 'tl':
      return { x: bounds.minX, y: bounds.minY };
  }
}

export function clampSelectionScale(scale: number): number {
  if (!Number.isFinite(scale) || scale <= 0) return MIN_SCALE;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/**
 * 对角拖拽 → 长宽各自缩放系数（非等比）。
 * 用相对固定角的轴向距离比，避免越过固定角时镜像翻转。
 */
export function selectionScaleAxesFromPointer(
  fixed: { x: number; y: number },
  startMoving: { x: number; y: number },
  pointer: { x: number; y: number }
): SelectionScaleAxes {
  const startW = Math.abs(startMoving.x - fixed.x);
  const startH = Math.abs(startMoving.y - fixed.y);
  const currW = Math.abs(pointer.x - fixed.x);
  const currH = Math.abs(pointer.y - fixed.y);
  return {
    scaleX: startW < 1e-6 ? 1 : clampSelectionScale(currW / startW),
    scaleY: startH < 1e-6 ? 1 : clampSelectionScale(currH / startH)
  };
}

export function snapshotSelectionPoses(
  notes: Note[],
  noteIds: Iterable<string>
): Map<string, SelectionNotePose> {
  const idSet = noteIds instanceof Set ? noteIds : new Set(noteIds);
  const out = new Map<string, SelectionNotePose>();
  for (const n of notes) {
    if (!idSet.has(n.id)) continue;
    const { width, height } = boardNoteDimensions(n);
    out.set(n.id, { boardX: n.boardX, boardY: n.boardY, width, height });
  }
  return out;
}

/**
 * 相对固定角按 scaleX/scaleY 独立缩放各卡中心（尺寸不变）→ 新的 boardX/boardY。
 */
export function scaledSelectionPositions(
  startPoses: Map<string, SelectionNotePose>,
  fixed: { x: number; y: number },
  axes: SelectionScaleAxes
): Map<string, { boardX: number; boardY: number }> {
  const scaleX = clampSelectionScale(axes.scaleX);
  const scaleY = clampSelectionScale(axes.scaleY);
  const out = new Map<string, { boardX: number; boardY: number }>();
  for (const [id, pose] of startPoses) {
    const cx = pose.boardX + pose.width / 2;
    const cy = pose.boardY + pose.height / 2;
    const ncx = fixed.x + (cx - fixed.x) * scaleX;
    const ncy = fixed.y + (cy - fixed.y) * scaleY;
    out.set(id, {
      boardX: ncx - pose.width / 2,
      boardY: ncy - pose.height / 2
    });
  }
  return out;
}

/** 批量写回缩放后的位置，并同步 Frame 归属。 */
export function applySelectionScaleToNotes(
  notes: Note[],
  scaledPositions: Map<string, { boardX: number; boardY: number }>,
  frames: Frame[]
): { notes: Note[]; changed: boolean } {
  if (scaledPositions.size === 0) return { notes, changed: false };
  let changed = false;
  const next = notes.map((n) => {
    const pos = scaledPositions.get(n.id);
    if (!pos) return n;
    if (pos.boardX === n.boardX && pos.boardY === n.boardY) return n;
    changed = true;
    return noteWithBoardDragCommit(n, pos.boardX, pos.boardY, frames);
  });
  return { notes: next, changed };
}
