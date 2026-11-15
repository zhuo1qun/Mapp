import assert from 'node:assert/strict';
import type { Note } from '../types';
import { resolveBoardNoteRenderPose } from '../utils/board/boardNoteRenderPose';

const note = (overrides: Partial<Note>): Note => ({
  id: 'note',
  coords: { lat: 0, lng: 0 },
  emoji: '',
  text: 'A note',
  fontSize: 3,
  images: [],
  tags: [],
  boardX: 100,
  boardY: 200,
  createdAt: 0,
  variant: 'standard',
  ...overrides
});

assert.deepEqual(resolveBoardNoteRenderPose(note({}), {}), {
  x: 100,
  y: 200,
  width: 256,
  height: 256
});

assert.deepEqual(
  resolveBoardNoteRenderPose(note({}), {
    isDragging: true,
    dragOffset: { x: 18, y: -12 },
    isMultiSelectDragging: true,
    isInMultiSelect: true,
    multiSelectDragOffset: { x: 30, y: 24 }
  }),
  { x: 148, y: 212, width: 256, height: 256 }
);

assert.deepEqual(
  resolveBoardNoteRenderPose(note({ text: '', images: ['data:image/png;base64,AA=='], imageWidth: 420, imageHeight: 180 }), {
    selectionScalePreview: { boardX: 320, boardY: 440 },
    imageResizePreview: { id: 'note', x: 360, y: 460, width: 510, height: 230 }
  }),
  { x: 360, y: 460, width: 510, height: 230 }
);

console.log('PASS: Board note render poses share preview and drag precedence');
