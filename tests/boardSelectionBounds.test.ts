import assert from 'node:assert/strict';
import type { Note } from '../types';
import {
  resolveBoardSelectionBounds,
  selectNotesIntersectingBoardRect
} from '../utils/board/boardSelectionBounds';

const note = (id: string, overrides: Partial<Note> = {}): Note => ({
  id,
  coords: { lat: 0, lng: 0 },
  emoji: '',
  text: id,
  fontSize: 3,
  images: [],
  tags: [],
  boardX: 0,
  boardY: 0,
  createdAt: 0,
  variant: 'standard',
  ...overrides
});

assert.equal(resolveBoardSelectionBounds([], { padding: 10 }), null);
assert.deepEqual(
  resolveBoardSelectionBounds([note('a'), note('b', { boardX: 300, boardY: 100 })], { padding: 10 }),
  { x: -10, y: -10, width: 576, height: 376 }
);
assert.deepEqual(
  resolveBoardSelectionBounds([note('expanded', { boardSize: 'expanded' })], { padding: 10 }),
  { x: -10, y: -10, width: 404, height: 308 }
);
assert.equal(
  resolveBoardSelectionBounds([
    note('long', { boardSize: 'expanded', text: `Long title\n${'很长的正文内容'.repeat(180)}` })
  ], { padding: 10 })?.height,
  532
);

const boxNotes = [note('a'), note('b', { boardX: 300, boardY: 0 })];
assert.deepEqual(
  [...selectNotesIntersectingBoardRect(boxNotes, { x: 20, y: 20 }, { x: 270, y: 270 }, ['b'], false)],
  ['a']
);
assert.deepEqual(
  [...selectNotesIntersectingBoardRect(boxNotes, { x: 20, y: 20 }, { x: 270, y: 270 }, ['b'], true)],
  ['b', 'a']
);
assert.deepEqual(
  resolveBoardSelectionBounds([note('a'), note('b', { boardX: 300, boardY: 100 })], {
    padding: 10,
    draggingNoteId: 'a',
    dragOffset: { x: 20, y: 30 },
    isMultiSelectDragging: true,
    multiSelectDragOffset: { x: 40, y: -10 }
  }),
  { x: 50, y: 10, width: 556, height: 346 }
);
assert.deepEqual(
  resolveBoardSelectionBounds([note('a')], {
    padding: 10,
    imageResizePreview: { id: 'a', x: 500, y: 600, width: 100, height: 80 },
    selectionScalePreview: new Map([['a', { boardX: 10, boardY: 20 }]])
  }),
  { x: 490, y: 590, width: 120, height: 100 }
);

console.log('PASS: Board selection bounds share card preview and drag geometry');
