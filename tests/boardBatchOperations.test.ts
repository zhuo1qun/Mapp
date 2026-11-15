import assert from 'node:assert/strict';
import type { Note } from '../types';
import {
  appendTagToSelectedNotes,
  assignSelectedNotesToGroup,
  clearGroupsSharedWithSelectedNotes,
  parseBoardBatchTimeRange,
  setSelectedNotesTimeRange
} from '../utils/board/boardBatchOperations';

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

assert.deepEqual(parseBoardBatchTimeRange(' 1997 ', '2001'), {
  startYear: 1997,
  endYear: 2001
});
assert.deepEqual(parseBoardBatchTimeRange('2001', '2001'), { startYear: 2001, endYear: undefined });
assert.deepEqual(parseBoardBatchTimeRange('not-a-year', '2001'), { startYear: undefined, endYear: undefined });

const source = [note('a', { tags: [{ id: 'old', label: 'old', color: '#000' }] }), note('b'), note('c')];
let tagNumber = 0;
const tagged = appendTagToSelectedNotes(source, ['a', 'c'], { label: 'river', color: '#00f' }, () => `new-${++tagNumber}`);
assert.deepEqual(tagged.map((item) => item.tags.map((tag) => tag.id)), [['old', 'new-1'], [], ['new-2']]);
assert.equal(source[0].tags.length, 1);
assert.equal(tagged[1], source[1]);

const timed = setSelectedNotesTimeRange(source, ['b'], { startYear: 1911, endYear: 1949 });
assert.deepEqual(timed[1], { ...source[1], startYear: 1911, endYear: 1949 });
assert.equal(timed[0], source[0]);

const layeredSource = source.map((item, index) => ({ ...item, layerStackOrder: index * 10 }));
const grouped = assignSelectedNotesToGroup(layeredSource, ['a', 'c'], 'group-1');
assert.equal(grouped[0].noteGroupId, 'group-1');
assert.equal(grouped[1].noteGroupId, undefined);
assert.equal(grouped[2].noteGroupId, 'group-1');
assert.deepEqual(grouped.map((item) => item.layerStackOrder), [0, 10, 20]);

const groupedSource = [note('a', { noteGroupId: 'g1' }), note('b', { noteGroupId: 'g1' }), note('c', { noteGroupId: 'g2' })];
const ungrouped = clearGroupsSharedWithSelectedNotes(groupedSource, ['a']);
assert.deepEqual(ungrouped?.map((item) => item.noteGroupId), [undefined, undefined, 'g2']);
assert.equal(clearGroupsSharedWithSelectedNotes(source, ['a']), null);

const layeredGroups = [note('a', { noteGroupId: 'g1', layerStackOrder: 4 }), note('b', { noteGroupId: 'g1', layerStackOrder: 9 })];
assert.deepEqual(
  clearGroupsSharedWithSelectedNotes(layeredGroups, ['a'])?.map((item) => item.layerStackOrder),
  [4, 9]
);

console.log('PASS: Board batch operations keep selection-scoped update rules');
