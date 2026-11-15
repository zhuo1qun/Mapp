import assert from 'node:assert/strict';
import type { Note } from '../types';
import { fitBoardNotesForEditMode } from '../utils/board/boardEditModeFit';

const note = (overrides: Partial<Note> = {}): Note => ({
  id: 'note', coords: { lat: 0, lng: 0 }, emoji: '', text: '', fontSize: 3,
  images: [], tags: [], boardX: 0, boardY: 0, createdAt: 0, variant: 'standard', ...overrides
});

assert.equal(fitBoardNotesForEditMode([], { width: 1000, height: 800 }), null);
assert.deepEqual(
  fitBoardNotesForEditMode([note()], { width: 1000, height: 800 }),
  { x: 275.43859649122805, y: 175.43859649122805, scale: 1.7543859649122806 }
);
assert.equal(
  fitBoardNotesForEditMode([note({ isInitialPosition: true })], { width: 1000, height: 800 }),
  null
);
console.log('PASS: Board edit mode fitting preserves full-card bounds and ignores unplaced notes');
