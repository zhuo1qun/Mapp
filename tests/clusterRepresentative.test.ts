import assert from 'node:assert/strict';
import type { Note } from '../types';
import { selectClusterRepresentative } from '../utils/map/clusterRepresentative';

const base = {
  createdAt: 1,
  coords: { lat: 31, lng: 121 },
  text: '',
  fontSize: 3,
  emoji: '',
  images: [],
  tags: [],
  variant: 'standard' as const,
  isFavorite: false,
  color: '#fff',
  boardX: 0,
  boardY: 0
};

const plainHigh = { ...base, id: 'plain-high', text: '# 文本' } satisfies Note;
const mediaLow = { ...base, id: 'media-low', images: ['data:image/png;base64,AA=='] } satisfies Note;
const mediaHigh = { ...base, id: 'media-high', images: ['data:image/png;base64,BB=='] } satisfies Note;
const ranks = new Map([
  ['plain-high', 30],
  ['media-high', 20],
  ['media-low', 10]
]);

assert.equal(
  selectClusterRepresentative([mediaLow, plainHigh, mediaHigh], ranks, true).id,
  'media-high',
  'media-on should prefer the highest-ranked media member'
);
assert.equal(
  selectClusterRepresentative([mediaLow, plainHigh, mediaHigh], ranks, false).id,
  'plain-high',
  'media-off should use normal stack order without media preference'
);

console.log('PASS: cluster representative follows the map media visibility switch');
