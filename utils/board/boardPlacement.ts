/**
 * Board 视图便签放置算法
 *
 * 对外暴露三类接口：
 *  - 常量（PLACEMENT_*）
 *  - createGridAllocator：基于细粒度 cell 占用的任意位置分配器（双击指定位置 / 批量导入用）
 *  - 辅助函数：boardNoteDimensions / computeBoardBounds
 */

import type { Note } from '../../types';
import { isNoteBoardPlaced } from '../note/notePlacement';
import { noteRendersAsBoardSticker } from '../persistence/mediaDisplay';
import { getExpandedNoteLayout, EXPANDED_NOTE_WIDTH, EXPANDED_NOTE_MAX_HEIGHT } from '../note/expandedNoteLayout';

// ── 常量 ──────────────────────────────────────────────────────────────────────

export const PLACEMENT_PADDING = 100;
export const PLACEMENT_GAP = 50;
export const PLACEMENT_GRID_CELL = 24;
export const PLACEMENT_WRAP_COLS = 6;

export const PLACEMENT_NOTE_W = 256;
export const PLACEMENT_NOTE_H = 256;
export const EXPANDED_NOTE_W = EXPANDED_NOTE_WIDTH;
export const EXPANDED_NOTE_H = EXPANDED_NOTE_MAX_HEIGHT;

/** 媒体贴纸保持完整比例，并以便签的最长边作为默认显示尺度。 */
export function fitBoardMediaDimensions(
  width: number,
  height: number
): { width: number; height: number } {
  const sourceWidth = Number.isFinite(width) && width > 0 ? width : PLACEMENT_NOTE_W;
  const sourceHeight = Number.isFinite(height) && height > 0 ? height : PLACEMENT_NOTE_H;
  const scale = PLACEMENT_NOTE_W / Math.max(sourceWidth, sourceHeight);
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale))
  };
}

// ── 类型 ──────────────────────────────────────────────────────────────────────

export interface BoardBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface GridAllocator {
  findAndOccupy: (
    width: number,
    height: number,
    anchorX: number,
    anchorY: number
  ) => { x: number; y: number };
}

// ── 工具函数 ──────────────────────────────────────────────────────────────────

/** 便签未缩放前的实际宽高（贴纸/image 取 imageWidth/imageHeight，其余 256×256）。 */
export function boardNoteDimensions(note: Note): { width: number; height: number } {
  if (noteRendersAsBoardSticker(note)) {
    return { width: note.imageWidth || 256, height: note.imageHeight || 256 };
  }
  if (note.boardSize === 'expanded') {
    const layout = getExpandedNoteLayout(note);
    return { width: layout.width, height: layout.height };
  }
  return { width: 256, height: 256 };
}

/** 计算一组已放置便签的包围盒；空数组返回 null。 */
export function computeBoardBounds(boardNotes: Note[]): BoardBounds | null {
  if (boardNotes.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  boardNotes.forEach((note) => {
    const { width, height } = boardNoteDimensions(note);
    const left = note.boardX ?? 0;
    const top = note.boardY ?? 0;
    minX = Math.min(minX, left);
    minY = Math.min(minY, top);
    maxX = Math.max(maxX, left + width);
    maxY = Math.max(maxY, top + height);
  });
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null;
  }
  return { minX, minY, maxX, maxY };
}

// ── 网格分配器（双击指定位置 / 批量导入） ──────────────────────────────────────

/**
 * 创建一个基于细粒度 cell 占用的分配器，适合"放在指定位置附近且不重叠"的场景。
 *
 * 工作原理：
 *  - 用 cellSize×cellSize 的网格记录占用
 *  - 以 anchor 所在的 slot 为起点，按行优先顺序扫描第一个可用 slot
 *  - 首行从 ancCol 开始扫，后续行从 col=0 开始（保证行优先填充）
 */
export function createGridAllocator(params: {
  existingNotes: Note[];
  padding: number;
  gap: number;
  cellSize: number;
  /** 换行前的最大列数（与缩放无关）。默认 PLACEMENT_WRAP_COLS。 */
  wrapCols?: number;
}): GridAllocator {
  const { existingNotes, padding, gap, cellSize, wrapCols = PLACEMENT_WRAP_COLS } = params;
  const occupied = new Set<string>();
  const maxScanRows = 2000;

  const toCell = (v: number) => Math.floor(v / cellSize);
  const keyOf = (col: number, row: number) => `${col},${row}`;

  const getCellRect = (x: number, y: number, width: number, height: number) => ({
    colStart: Math.max(0, toCell(x)),
    colEnd:   Math.max(0, toCell(Math.max(x, x + width - 1))),
    rowStart: Math.max(0, toCell(y)),
    rowEnd:   Math.max(0, toCell(Math.max(y, y + height - 1)))
  });

  const canPlace = (x: number, y: number, width: number, height: number): boolean => {
    const r = getCellRect(x, y, width, height);
    for (let row = r.rowStart; row <= r.rowEnd; row++) {
      for (let col = r.colStart; col <= r.colEnd; col++) {
        if (occupied.has(keyOf(col, row))) return false;
      }
    }
    return true;
  };

  const occupy = (x: number, y: number, width: number, height: number) => {
    const r = getCellRect(x, y, width, height);
    for (let row = r.rowStart; row <= r.rowEnd; row++) {
      for (let col = r.colStart; col <= r.colEnd; col++) {
        occupied.add(keyOf(col, row));
      }
    }
  };

  // 将现有便签写入占用集
  existingNotes.forEach((note) => {
    if (!isNoteBoardPlaced(note)) return;
    const { width, height } = boardNoteDimensions(note);
    occupy(note.boardX, note.boardY, width, height);
  });

  const findAndOccupy = (width: number, height: number, anchorX: number, anchorY: number) => {
    const slotW = Math.max(cellSize, width + gap);
    const slotH = Math.max(cellSize, height + gap);
    const maxCols = Math.max(1, wrapCols);

    const ancCol = Math.max(0, Math.floor((Math.max(padding, anchorX) - padding) / slotW));
    const ancRow = Math.max(0, Math.floor((Math.max(padding, anchorY) - padding) / slotH));

    for (let row = ancRow; row < ancRow + maxScanRows; row++) {
      const colStart = row === ancRow ? Math.min(ancCol, maxCols - 1) : 0;
      for (let col = colStart; col < maxCols; col++) {
        const x = padding + col * slotW;
        const y = padding + row * slotH;
        if (!canPlace(x, y, width, height)) continue;
        occupy(x, y, width, height);
        return { x, y };
      }
    }
    const fallbackX = padding;
    const fallbackY = padding + (ancRow + maxScanRows) * slotH;
    occupy(fallbackX, fallbackY, width, height);
    return { x: fallbackX, y: fallbackY };
  };

  return { findAndOccupy };
}
