import type { Coordinates, Note } from '../../types';
import {
  LEGACY_UNPLACED_MAP_COORDS,
  moveNoteToMapUnplaced,
  placeNoteOnMap
} from './notePlacement';

/**
 * 没有地图位置的历史记录仍需满足 `Note.coords` 的数据结构；统一以 0,0 作为
 * 「待定位」的内部哨兵值，渲染层会把它排除在地图之外。
 */
export const UNPLACED_NOTE_COORDS: Readonly<Coordinates> = LEGACY_UNPLACED_MAP_COORDS;

export type NoteSpatialTarget =
  | { kind: 'map'; coords: Coordinates }
  | { kind: 'unplaced' };

/**
 * 在地图位置与待定位箱之间批量移动记录。以后 Board 接入时只需扩展目标类型，
 * 不必在各个拖拽入口分别修改 note。
 */
export function transferNotesSpatially(
  notes: Note[],
  noteIds: Iterable<string>,
  target: NoteSpatialTarget
): Note[] {
  const ids = new Set(noteIds);
  return notes.map((note) => {
    if (!ids.has(note.id)) return note;
    return target.kind === 'map'
      ? placeNoteOnMap(note, target.coords)
      : moveNoteToMapUnplaced(note);
  });
}
