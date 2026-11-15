import type { Coordinates, Note } from '../../types';
import { generateId } from '../../utils';
import type { ImportErrorDetail } from './importErrorFormat';
import {
  formatJsonParseFailure,
  validateNotesOnlyImportPayload
} from './importErrorFormat';

export function generateBoardSlotForImport(index: number): { boardX: number; boardY: number } {
  const col = index % 6;
  const row = Math.floor(index / 6);
  return { boardX: 100 + col * 306, boardY: 100 + row * 306 };
}

function normalizeCoordsFromRaw(note: Note): Coordinates {
  const c = note?.coords;
  if (c && typeof c.lat === 'number' && typeof c.lng === 'number' && !isNaN(c.lat) && !isNaN(c.lng)) {
    return { lat: c.lat, lng: c.lng };
  }
  return { lat: 0, lng: 0 };
}

function notesAreNearDuplicate(a: Note, b: Note): boolean {
  if ((a.text || '').trim() !== (b.text || '').trim()) return false;
  const ca = a.coords;
  const cb = b.coords;
  if (!ca || !cb) return false;
  if (Math.abs(ca.lat - cb.lat) >= 0.0001 || Math.abs(ca.lng - cb.lng) >= 0.0001) return false;
  if (Math.abs(a.boardX - b.boardX) >= 5 || Math.abs(a.boardY - b.boardY) >= 5) return false;
  return true;
}

/**
 * 自项目导出 JSON（data.project.notes）生成待合并的新便签：补全坐标/看板位、分配新 id。
 * 无地理信息的条目 coords 为 0,0，地图侧不绘制。
 */
export function buildNewNotesFromProjectJsonRaws(rawNotes: Note[], existingNotes: Note[]): Note[] {
  const combinedForDedupe: Note[] = [...existingNotes];
  const out: Note[] = [];

  rawNotes.forEach((raw, importIdx) => {
    const coords = normalizeCoordsFromRaw(raw);
    const hasBoard =
      typeof raw.boardX === 'number' &&
      !isNaN(raw.boardX) &&
      typeof raw.boardY === 'number' &&
      !isNaN(raw.boardY);
    const board = hasBoard
      ? { boardX: raw.boardX!, boardY: raw.boardY! }
      : generateBoardSlotForImport(combinedForDedupe.length + out.length);

    const rawVar = (raw as Note & { variant?: string }).variant;
    const variant: 'standard' | 'image' = rawVar === 'image' ? 'image' : 'standard';

    const candidate: Note = {
      ...raw,
      id: generateId(),
      createdAt: Date.now() + importIdx * 0.001 + Math.random(),
      coords,
      boardX: board.boardX,
      boardY: board.boardY,
      emoji: raw.emoji ?? '',
      text: raw.text ?? '',
      fontSize: typeof raw.fontSize === 'number' ? raw.fontSize : 3,
      isFavorite: raw.isFavorite ?? false,
      color: raw.color ?? '#FFFDF5',
      images: Array.isArray(raw.images) ? raw.images : [],
      tags: Array.isArray(raw.tags) ? raw.tags : [],
      variant,
      startYear: raw.startYear,
      endYear: raw.endYear,
      sketch: raw.sketch,
      imageWidth: raw.imageWidth,
      imageHeight: raw.imageHeight,
      layoutScale: raw.layoutScale,
      boardSize: raw.boardSize === 'expanded' ? 'expanded' : undefined,
      groupId: raw.groupId,
      groupName: raw.groupName,
      groupIds: raw.groupIds,
      groupNames: raw.groupNames,
      noteGroupId: raw.noteGroupId,
      layerItemHidden: raw.layerItemHidden,
      layerStackOrder: raw.layerStackOrder
    };

    if (combinedForDedupe.some((e) => notesAreNearDuplicate(candidate, e))) return;
    if (out.some((o) => notesAreNearDuplicate(candidate, o))) return;
    out.push(candidate);
  });

  return out;
}

export type ParseProjectJsonNotesResult =
  | { ok: true; rawNotes: Note[] }
  | { ok: false; error: ImportErrorDetail };

/** @deprecated 优先用 parseProjectJsonNotesPayloadResult，便于带回出错位置 */
export function parseProjectJsonNotesPayload(text: string): { rawNotes: Note[] } | null {
  const r = parseProjectJsonNotesPayloadResult(text);
  return r.ok ? { rawNotes: r.rawNotes } : null;
}

export function parseProjectJsonNotesPayloadResult(text: string): ParseProjectJsonNotesResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: formatJsonParseFailure(text, e) };
  }
  const invalid = validateNotesOnlyImportPayload(data);
  if (invalid) return { ok: false, error: invalid };
  const notes = (data as { project: { notes: Note[] } }).project.notes;
  return { ok: true, rawNotes: notes };
}
