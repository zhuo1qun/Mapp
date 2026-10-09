import type { Coordinates, Note } from '../../types';

/**
 * A note has two independent placements: its geographic point and its Board
 * point.  Older projects encode "not placed" as map (0,0) and/or the Board
 * `isInitialPosition` flag; keep that storage compatibility at this boundary
 * instead of teaching every view about those legacy details.
 */
export const LEGACY_UNPLACED_MAP_COORDS: Readonly<Coordinates> = { lat: 0, lng: 0 };

export type NoteMapPlacement =
  | { kind: 'placed'; coords: Coordinates }
  | { kind: 'unplaced' };

export type NoteBoardPlacement =
  | { kind: 'placed'; x: number; y: number }
  | { kind: 'unplaced' };

export function hasUsableMapCoordinates(coords: Coordinates | null | undefined): coords is Coordinates {
  if (!coords || !Number.isFinite(coords.lat) || !Number.isFinite(coords.lng)) return false;
  // `0,0` has historically meant “awaiting placement”. Preserve that meaning
  // until persisted placement state is migrated in a later schema change.
  return coords.lat !== 0 || coords.lng !== 0;
}

export function noteMapPlacement(note: Note): NoteMapPlacement {
  return hasUsableMapCoordinates(note.coords)
    ? { kind: 'placed', coords: note.coords }
    : { kind: 'unplaced' };
}

export function noteBoardPlacement(note: Note): NoteBoardPlacement {
  if (
    note.isInitialPosition === true ||
    !Number.isFinite(note.boardX) ||
    !Number.isFinite(note.boardY)
  ) {
    return { kind: 'unplaced' };
  }
  return { kind: 'placed', x: note.boardX, y: note.boardY };
}

export function isNoteMapPlaced(note: Note): boolean {
  return noteMapPlacement(note).kind === 'placed';
}

export function isNoteBoardPlaced(note: Note): boolean {
  return noteBoardPlacement(note).kind === 'placed';
}

export function isNoteBoardUnplaced(note: Note): boolean {
  return !isNoteBoardPlaced(note);
}

export function unplacedMapCoordinates(): Coordinates {
  return { ...LEGACY_UNPLACED_MAP_COORDS };
}

export function placeNoteOnMap(note: Note, coords: Coordinates): Note {
  return { ...note, coords: { lat: coords.lat, lng: coords.lng } };
}

export function moveNoteToMapUnplaced(note: Note, unplacedOrder = note.unplacedOrder): Note {
  return {
    ...note,
    coords: unplacedMapCoordinates(),
    ...(unplacedOrder === undefined ? {} : { unplacedOrder })
  };
}

export function placeNoteOnBoard(note: Note, point: { x: number; y: number }): Note {
  return { ...note, boardX: point.x, boardY: point.y, isInitialPosition: false };
}

export function moveNoteToBoardUnplaced(note: Note, unplacedOrder = note.unplacedOrder): Note {
  return {
    ...note,
    boardX: 0,
    boardY: 0,
    isInitialPosition: true,
    ...(unplacedOrder === undefined ? {} : { unplacedOrder })
  };
}
