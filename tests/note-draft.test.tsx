import assert from 'node:assert/strict';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { isNoteContentEmpty, submitNoteDraft, type NoteDraftOutcome } from '../utils/note/draftLifecycle';
import { NoteHeader } from '../components/note-editor/NoteHeader';
import type { Note } from '../types';

async function run() {
  const empty: Partial<Note> = {
    id: 'camera-draft', coords: { lat: 28, lng: 112 }, createdAt: 123,
    boardX: 100, boardY: 100, isFavorite: true, variant: 'standard',
    text: ' \n ', emoji: '', images: [], media: [], tags: []
  };
  assert.equal(isNoteContentEmpty(empty), true, 'location, identity and save history are not content');
  let saves = 0;
  const deleted: string[] = [];
  const actions = {
    onSave: async () => { saves++; },
    onDelete: async (id: string) => { deleted.push(id); }
  };
  assert.equal(await submitNoteDraft(empty, { ...actions, isNewNote: true }), 'discarded');
  assert.equal(saves, 0);
  assert.deepEqual(deleted, []);
  console.log('PASS: cancelled camera with no content discards the new draft without saving');

  assert.equal(await submitNoteDraft(empty, { ...actions, isNewNote: false }), 'discarded');
  assert.equal(saves, 0);
  assert.deepEqual(deleted, [empty.id]);
  console.log('PASS: previously saved but now empty notes are deleted, never resaved');

  const content: Partial<Note>[] = [
    { text: '内容' }, { emoji: '📷' }, { images: ['img-photo'] }, { sketch: 'img-sketch' },
    { media: [{ id: 'mid-photo', kind: 'image', assetId: 'img-photo' }] },
    { tags: [{ id: 'tag', label: '位置', color: '#fff' }] }, { startYear: 0 }, { endYear: 2026 }
  ];
  for (const fields of content) {
    const note = { ...empty, ...fields };
    assert.equal(isNoteContentEmpty(note), false);
    assert.equal(await submitNoteDraft(note, { ...actions, isNewNote: false }), 'saved');
  }
  assert.equal(saves, content.length);
  assert.equal(deleted.length, 1);
  console.log('PASS: photos, user-selected emoji, text, tags, sketch and dates all preserve real content');

  let resolveDelete!: () => void;
  let completed = false;
  const pending = submitNoteDraft(empty, {
    isNewNote: false,
    onSave: actions.onSave,
    onDelete: () => new Promise<void>((resolve) => { resolveDelete = resolve; })
  }).then(outcome => { completed = true; return outcome; });
  await Promise.resolve();
  assert.equal(completed, false);
  resolveDelete();
  assert.equal(await pending, 'discarded');
  await assert.rejects(submitNoteDraft(empty, {
    isNewNote: false, onSave: actions.onSave, onDelete: async () => { throw new Error('delete failed'); }
  }), /delete failed/);
  await assert.rejects(submitNoteDraft(empty, { isNewNote: false, onSave: actions.onSave }), /缺少删除操作/);
  console.log('PASS: empty-note closure waits for deletion; failure cannot report a successful discard');

  for (const isNewNote of [true, false]) {
    let result: NoteDraftOutcome | undefined;
    let tree: ReturnType<typeof create>;
    await act(async () => {
      tree = create(<NoteHeader themeColor="#abcdef" isFavorite={false} onToggleFavorite={() => {}}
        showUpgrade={false} showLocateBoard={false} showLocateMap={false}
        discardDraft={isNoteContentEmpty(empty)}
        onSave={() => { throw new Error('Empty note must use discard action'); }}
        onDiscardDraft={async () => { result = await submitNoteDraft(empty, { ...actions, isNewNote }); }} />);
    });
    await act(async () => {
      await tree!.root.findByProps({ title: '取消并删除便签' }).props.onClick();
    });
    assert.equal(result, 'discarded');
    await act(async () => tree!.unmount());
  }
  console.log('PASS: both new and previously saved empty notes expose the same Cancel action');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
