import assert from 'node:assert/strict';
import type { Frame, Note } from '../types';
import {
  findFrameContainingNoteCenter,
  syncNotesToContainingFrames
} from '../utils/frame/boardFrameMembership';

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

const frame = (id: string, overrides: Partial<Frame> = {}): Frame => ({
  id,
  title: id,
  x: 0,
  y: 0,
  width: 300,
  height: 300,
  color: '#fff',
  ...overrides
});

const frames = [frame('first'), frame('second')];
assert.equal(findFrameContainingNoteCenter(note('a'), 20, 20, frames)?.id, 'first');
assert.equal(findFrameContainingNoteCenter(note('a'), 400, 20, frames), undefined);

const source = [
  note('a', { groupId: 'old', groupIds: ['old'] }),
  note('b', { boardX: 400 }),
  note('c', { groupId: 'first', groupIds: ['first'], groupName: 'old name' })
];
const synced = syncNotesToContainingFrames(source, frames);
assert.equal(synced.changed, true);
assert.deepEqual(synced.notes.map((item) => item.groupId), ['first', undefined, 'first']);
assert.deepEqual(synced.notes[0].groupNames, ['first']);
assert.equal(synced.notes[2], source[2]);

assert.deepEqual(syncNotesToContainingFrames([source[2]], frames), {
  notes: [source[2]],
  changed: false
});

console.log('PASS: Board frame membership uses card centers and preserves write-on-change behavior');
