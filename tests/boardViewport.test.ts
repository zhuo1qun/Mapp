import assert from 'node:assert/strict';
import type { Note } from '../types';
import { fitBoardNotesToViewport } from '../utils/board/boardViewport';

const note = (overrides: Partial<Note>): Note => ({
  id: 'note',
  coords: { lat: 0, lng: 0 },
  emoji: '',
  text: '',
  fontSize: 3,
  images: [],
  tags: [],
  boardX: 0,
  boardY: 0,
  createdAt: 0,
  variant: 'standard',
  ...overrides
});

assert.deepEqual(fitBoardNotesToViewport([], { width: 1200, height: 800 }), {
  x: 0,
  y: 0,
  scale: 1
});

const fitted = fitBoardNotesToViewport(
  [note({ boardX: 100, boardY: 200 })],
  { width: 1000, height: 800 }
);
assert.equal(fitted.x, 140);
assert.equal(fitted.y, -117.89473684210526);
assert.equal(fitted.scale, 1.5789473684210527);

assert.equal(
  fitBoardNotesToViewport([note({ boardX: 0, boardY: 0 })], { width: 10000, height: 10000 }).scale,
  4
);

assert.deepEqual(
  fitBoardNotesToViewport([note({ boardX: 0, boardY: 0, isInitialPosition: true })], {
    width: 1200,
    height: 800
  }),
  { x: 0, y: 0, scale: 1 }
);

console.log('PASS: Board viewport fitting preserves empty, placed, clamped and unplaced behavior');
