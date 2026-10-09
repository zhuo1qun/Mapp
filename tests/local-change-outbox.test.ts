import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { acknowledgeLocalChanges, loadLocalChangeOutbox } from '../utils/persistence/localChangeQueue';
import { deleteProject, loadProjectSummaries, saveProject } from '../utils/persistence/storage';
import type { Project } from '../types';

const project: Project = {
  id: 'outbox-project',
  name: 'Outbox project',
  type: 'map',
  createdAt: 1,
  notes: [{
    id: 'note-1',
    createdAt: 1,
    coords: { lat: 28.2, lng: 112.9 },
    emoji: '',
    text: 'first',
    fontSize: 2,
    images: [],
    tags: [],
    boardX: 0,
    boardY: 0,
    variant: 'standard'
  }],
  frames: [],
  connections: []
};

async function run() {
  const initial = await saveProject(project);
  assert.equal(initial.notes[0].revision, 1);
  assert.ok(initial.notes[0].updatedAt);
  assert.equal(initial.revision, 1);
  const summaries = await loadProjectSummaries();
  assert.deepEqual(summaries.map((summary) => summary.id), [project.id]);
  assert.equal(summaries[0].notesCount, 1);

  let outbox = await loadLocalChangeOutbox();
  assert.deepEqual(
    outbox.map((change) => `${change.entity}:${change.entityId}:${change.operation}`).sort(),
    ['note:note-1:upsert', 'project:outbox-project:upsert']
  );
  await acknowledgeLocalChanges(outbox.map((change) => change.id));

  const edited = await saveProject({
    ...initial,
    notes: initial.notes.map((note) => note.id === 'note-1' ? { ...note, text: 'edited' } : note)
  });
  outbox = await loadLocalChangeOutbox();
  assert.equal(outbox.length, 1);
  assert.equal(outbox[0].entity, 'note');
  assert.equal(outbox[0].operation, 'upsert');
  assert.equal(outbox[0].revision, 2);
  assert.equal((outbox[0].payload as { text: string }).text, 'edited');
  await acknowledgeLocalChanges(outbox.map((change) => change.id));

  await saveProject({ ...edited, notes: [] });
  outbox = await loadLocalChangeOutbox();
  assert.equal(outbox.length, 1);
  assert.equal(outbox[0].entity, 'note');
  assert.equal(outbox[0].operation, 'delete');
  assert.ok(outbox[0].deletedAt);
  await acknowledgeLocalChanges(outbox.map((change) => change.id));

  await deleteProject(project.id);
  outbox = await loadLocalChangeOutbox();
  assert.equal(outbox.length, 1);
  assert.equal(outbox[0].entity, 'project');
  assert.equal(outbox[0].operation, 'delete');
  assert.ok(outbox[0].deletedAt);

  await acknowledgeLocalChanges(outbox.map((change) => change.id));
  const transient: Project = {
    ...project,
    id: 'transient-project',
    notes: project.notes.map((note) => ({ ...note, id: 'transient-note' }))
  };
  await saveProject(transient);
  await deleteProject(transient.id);
  outbox = await loadLocalChangeOutbox();
  assert.deepEqual(
    outbox.map((change) => `${change.entity}:${change.entityId}:${change.operation}`),
    ['project:transient-project:delete'],
    'an unsynced project deletion keeps only its project tombstone, never orphan child updates'
  );

  console.log('PASS: local entity outbox records upsert, update and delete tombstones');
}

void run();
