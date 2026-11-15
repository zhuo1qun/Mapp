import assert from 'node:assert/strict';
import type { Note } from '../types';
import { reorderBoardNoteLayers, sortNotesByBoardLayer } from '../utils/board/boardLayerOrder';

const note = (id: string, createdAt: number, boardX: number, boardY: number): Note => ({
  id, createdAt, boardX, boardY, coords: { lat: 0, lng: 0 }, emoji: '', text: id,
  fontSize: 3, images: [], tags: [], variant: 'standard'
});
const notes = [note('a', 1, 900, 10), note('b', 2, -500, 800), note('c', 3, 0, -900)];
const ids = (items: Note[]) => sortNotesByBoardLayer(items).map((item) => item.id);

assert.deepEqual(ids(reorderBoardNoteLayers(notes, new Set(['b']), 'front')), ['a', 'c', 'b']);
assert.deepEqual(ids(reorderBoardNoteLayers(notes, new Set(['b']), 'back')), ['b', 'a', 'c']);
assert.deepEqual(ids(reorderBoardNoteLayers(notes, new Set(['a']), 'forward')), ['b', 'a', 'c']);
assert.deepEqual(ids(reorderBoardNoteLayers(notes, new Set(['c']), 'backward')), ['a', 'c', 'b']);

const explicit = reorderBoardNoteLayers(notes, new Set(['b']), 'front');
assert.deepEqual(explicit.map((item) => item.layerStackOrder).sort((a, b) => a! - b!), [0, 1, 2]);
assert.deepEqual(ids(notes), ['a', 'b', 'c'], 'canvas coordinates must not affect layer order');

console.log('PASS: Board layer commands use explicit Figma-style order without canvas position');
