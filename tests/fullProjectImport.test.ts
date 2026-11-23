import assert from 'node:assert/strict';
import type { Connection, Frame, Note, Project } from '../types';
import {
  areProjectNotesDuplicates,
  createImportedProjectShell,
  mergeImportedProject,
  regenerateImportedProjectContent
} from '../utils/import/fullProjectImport';
import './fullProjectBundle.test';

const note = (id: string, overrides: Partial<Note> = {}): Note => ({
  id,
  createdAt: 1,
  coords: { lat: 28.2, lng: 112.9 },
  emoji: '',
  text: id,
  fontSize: 3,
  images: [],
  tags: [],
  boardX: 0,
  boardY: 0,
  variant: 'standard',
  ...overrides
});

const frame = (id: string): Frame => ({
  id,
  title: id,
  x: 0,
  y: 0,
  width: 200,
  height: 120,
  color: '#fff'
});

const connection = (id: string, fromNoteId: string, toNoteId: string): Connection => ({
  id,
  fromNoteId,
  toNoteId,
  fromSide: 'right',
  toSide: 'left'
});

const project = (overrides: Partial<Project> = {}): Project => ({
  id: 'source-project',
  name: 'Source',
  type: 'map',
  createdAt: 1,
  notes: [],
  frames: [],
  connections: [],
  ...overrides
});

const createSequentialIds = (...ids: string[]) => () => {
  const id = ids.shift();
  assert.ok(id, 'the test must supply enough generated IDs');
  return id;
};

const imported = project({
  notes: [
    note('first', { groupId: 'frame-a', groupIds: ['frame-a'] }),
    note('image', { variant: 'image', groupIds: ['frame-a', 'legacy-frame'] }),
    note('legacy', { variant: 'compact' as never })
  ],
  frames: [frame('frame-a')],
  connections: [connection('edge', 'first', 'image')]
});

const shell = createImportedProjectShell(imported, {
  createId: createSequentialIds('new-project'),
  now: () => 123
});
assert.equal(shell.id, 'new-project');
assert.equal(shell.name, 'Source (Imported)');
assert.equal(shell.createdAt, 123);

const regenerated = regenerateImportedProjectContent(shell, {
  createId: createSequentialIds('new-first', 'new-image', 'new-legacy', 'new-frame', 'new-edge')
});
assert.deepEqual(regenerated.notes.map((item) => item.id), ['new-first', 'new-image', 'new-legacy']);
assert.deepEqual(regenerated.notes.map((item) => item.variant), ['standard', 'image', 'standard']);
assert.deepEqual(regenerated.notes[0].groupIds, ['new-frame']);
assert.deepEqual(regenerated.notes[1].groupIds, ['new-frame', 'legacy-frame']);
assert.equal(regenerated.connections[0].fromNoteId, 'new-first');
assert.equal(regenerated.connections[0].toNoteId, 'new-image');

const existingDuplicate = note('existing', { text: 'first', groupId: undefined });
assert.equal(areProjectNotesDuplicates(imported.notes[0], existingDuplicate), true);
const merged = mergeImportedProject(project({ notes: [existingDuplicate] }), shell, {
  createId: createSequentialIds('merged-first', 'merged-image', 'merged-legacy', 'merged-frame', 'merged-edge')
});
assert.equal(merged.duplicateCount, 1);
assert.deepEqual(merged.project.notes.map((item) => item.id), ['existing', 'merged-image', 'merged-legacy']);
assert.deepEqual(merged.project.connections, []);

console.log('PASS: Full project import preserves ID remapping, duplicate filtering, and connection filtering');
