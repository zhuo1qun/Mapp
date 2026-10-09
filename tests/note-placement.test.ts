import assert from 'node:assert/strict';
import type { Note } from '../types';
import {
  isNoteBoardPlaced,
  isNoteMapPlaced,
  moveNoteToBoardUnplaced,
  moveNoteToMapUnplaced,
  placeNoteOnBoard,
  placeNoteOnMap
} from '../utils/note/notePlacement';
import { transferNotesSpatially } from '../utils/note/spatialTransfer';

const note = (overrides: Partial<Note> = {}): Note => ({
  id: 'note-1',
  createdAt: 1,
  coords: { lat: 28.2, lng: 112.9 },
  emoji: '',
  text: '',
  fontSize: 3,
  images: [],
  tags: [],
  boardX: 120,
  boardY: 240,
  variant: 'standard',
  ...overrides
});

function run() {
  const placed = note();
  assert.equal(isNoteMapPlaced(placed), true);
  assert.equal(isNoteBoardPlaced(placed), true);

  const mapUnplaced = moveNoteToMapUnplaced(placed, 11);
  assert.equal(isNoteMapPlaced(mapUnplaced), false);
  assert.equal(isNoteBoardPlaced(mapUnplaced), true, 'map transfer must not alter Board placement');
  assert.equal(mapUnplaced.unplacedOrder, 11);

  const boardUnplaced = moveNoteToBoardUnplaced(placed, 12);
  assert.equal(isNoteMapPlaced(boardUnplaced), true, 'Board transfer must not alter map placement');
  assert.equal(isNoteBoardPlaced(boardUnplaced), false);
  assert.equal(boardUnplaced.unplacedOrder, 12);

  const restored = placeNoteOnBoard(placeNoteOnMap(boardUnplaced, { lat: 28.3, lng: 113 }), { x: 80, y: 160 });
  assert.equal(isNoteMapPlaced(restored), true);
  assert.equal(isNoteBoardPlaced(restored), true);
  assert.deepEqual(restored.coords, { lat: 28.3, lng: 113 });
  assert.equal(restored.boardX, 80);
  assert.equal(restored.boardY, 160);

  const transferred = transferNotesSpatially([placed, note({ id: 'note-2' })], ['note-2'], { kind: 'unplaced' });
  assert.equal(isNoteMapPlaced(transferred[0]), true);
  assert.equal(isNoteMapPlaced(transferred[1]), false);
  assert.strictEqual(transferred[0], placed, 'unaffected notes should retain their identity');
  console.log('PASS: note map and Board placements remain independent and legacy sentinels stay contained');
}

run();
