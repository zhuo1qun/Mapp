import assert from 'node:assert/strict';
import {
  resolveMapTileKeepBuffer,
  shouldPrefetchMapTiles
} from '../utils/map/tileRenderingPolicy';

assert.equal(
  resolveMapTileKeepBuffer({ coarsePointer: false, saveData: false, deviceMemory: 8 }),
  4
);
assert.equal(
  resolveMapTileKeepBuffer({ coarsePointer: true, saveData: false, deviceMemory: 8 }),
  3
);
assert.equal(
  resolveMapTileKeepBuffer({ coarsePointer: false, saveData: false, deviceMemory: 4 }),
  3
);
assert.equal(
  resolveMapTileKeepBuffer({ coarsePointer: false, saveData: true, deviceMemory: 8 }),
  2
);
assert.equal(
  resolveMapTileKeepBuffer({ coarsePointer: false, saveData: false, effectiveType: '2g' }),
  2
);

assert.equal(shouldPrefetchMapTiles({ coarsePointer: false, saveData: false, deviceMemory: 8 }), true);
assert.equal(shouldPrefetchMapTiles({ coarsePointer: false, saveData: true, deviceMemory: 8 }), false);
assert.equal(shouldPrefetchMapTiles({ coarsePointer: false, saveData: false, deviceMemory: 2 }), false);

console.log('PASS: map tile buffering and prefetch adapt to device and network constraints');

