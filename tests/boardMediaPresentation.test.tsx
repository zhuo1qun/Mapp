import assert from 'node:assert/strict';
import React from 'react';
import TestRenderer from 'react-test-renderer';
import type { Note } from '../types';
import { boardAttachedStickerBottomClass, BoardNoteObject } from '../components/note/BoardNoteObject';
import { boardNoteVisibleForMediaSetting } from '../components/board/BoardNoteLayer';

const note = (overrides: Partial<Note> = {}): Note => ({
  id: 'note',
  createdAt: 1,
  coords: { lat: 0, lng: 0 },
  text: '# 标题\n\n正文',
  emoji: '',
  fontSize: 3,
  images: ['data:image/png;base64,AA=='],
  tags: [],
  variant: 'standard',
  isFavorite: false,
  color: '#fff',
  boardX: 0,
  boardY: 0,
  ...overrides
});

function render(mode: 'background' | 'sticker', showMedia = true, overrides: Partial<Note> = {}) {
  return TestRenderer.create(
    <BoardNoteObject
      note={note(overrides)}
      selected={false}
      contentWidth={208}
      showMedia={showMedia}
      mediaMode={mode}
    />
  ).root;
}

const backgroundImages = render('background').findAllByType('img');
assert.equal(backgroundImages.length, 1);
assert.match(String(backgroundImages[0].props.className), /opacity-35/);

const stickerImages = render('sticker').findAllByType('img');
assert.equal(stickerImages.length, 1);
assert.match(String(stickerImages[0].props.className), /board-sticker-elevation/);
assert.doesNotMatch(String(stickerImages[0].props.className), /opacity-35/);

const taggedNote = note({ tags: [{ id: 'tag', label: '标签', color: '#333' }] });
assert.equal(boardAttachedStickerBottomClass(taggedNote, true), '-bottom-[42%]');
assert.equal(boardAttachedStickerBottomClass(taggedNote, false), '-bottom-[32%]');

assert.equal(render('sticker', false).findAllByType('img').length, 0);
assert.equal(boardNoteVisibleForMediaSetting(note({ text: '' }), false), false);
assert.equal(boardNoteVisibleForMediaSetting(note(), false), true);

console.log('PASS: Board media switches between background, attached sticker, and hidden states');
