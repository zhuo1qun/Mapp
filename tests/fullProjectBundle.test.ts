import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { clear } from 'idb-keyval';
import type { Note, Project } from '../types';
import { buildFullProjectExportPayload, restoreFullProjectMedia } from '../utils/export/fullProjectBundle';
import { dataUrlToBlob } from '../utils/persistence/imageAssetStore';
import {
  createStickerVariantFromOperations,
  loadImageEdit,
  loadImageVariant,
  loadMaskBitmapBlob,
  loadVariantRasterBlob,
  saveImageVariant,
  saveMaskBitmapBlob,
  saveVariantRasterBlob
} from '../utils/persistence/imageVariantStore';
import { loadImage, saveImage, saveProject } from '../utils/persistence/storage';

const globals = globalThis as typeof globalThis & {
  Image: typeof Image;
  FileReader: typeof FileReader;
};

const runtimeValues = globalThis as unknown as Record<string, unknown>;
if (!runtimeValues.localStorage) {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, String(value)); }
  } as Storage });
}

globals.Image = class TestImage {
  naturalWidth = 1;
  naturalHeight = 1;
  width = 1;
  height = 1;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(_value: string) { queueMicrotask(() => this.onload?.()); }
} as unknown as typeof Image;

globals.FileReader = class TestFileReader {
  result: string | ArrayBuffer | null = null;
  error: DOMException | null = null;
  onload: ((event: ProgressEvent<FileReader>) => void) | null = null;
  onerror: ((event: ProgressEvent<FileReader>) => void) | null = null;
  readAsDataURL(blob: Blob) {
    void blob.arrayBuffer().then((buffer) => {
      this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(buffer).toString('base64')}`;
      this.onload?.({} as ProgressEvent<FileReader>);
    });
  }
} as unknown as typeof FileReader;

async function runFullProjectBundleTest() {
await clear();
const imageData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB';
const maskData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAC';
const assetId = await saveImage(imageData);
const maskBlobKey = await saveMaskBitmapBlob('bundle-test', await dataUrlToBlob(maskData));
const created = await createStickerVariantFromOperations({
  assetId,
  operations: [{ type: 'mask', mask: { type: 'ai', maskBlobKey, model: 'test-model' } }]
});
const rasterBlobKey = await saveVariantRasterBlob(created.variant.id, await dataUrlToBlob(maskData));
await saveImageVariant({ ...created.variant, blobKey: rasterBlobKey, width: 1, height: 1 });

const note: Note = {
  id: 'note-with-media',
  createdAt: 1,
  coords: { lat: 1, lng: 2 },
  emoji: '',
  text: '',
  fontSize: 3,
  images: [assetId],
  imageRefs: [{ assetId, variantId: created.variant.id, variantEnabled: true }],
  media: [{ id: 'media-1', kind: 'image', assetId, variantId: created.variant.id, variantEnabled: true }],
  tags: [],
  boardX: 0,
  boardY: 0,
  variant: 'image'
};
const project: Project = {
  id: 'bundle-project',
  name: 'Bundle project',
  type: 'map',
  projectKind: 'mapping',
  createdAt: 1,
  notes: [note],
  frames: [],
  connections: []
};
await saveProject(project);

const payload = await buildFullProjectExportPayload(project.id);
assert.equal(payload.version, '2.0');
assert.equal(payload.mediaBundle.assets.length, 1);
assert.equal(payload.mediaBundle.edits.length, 1);
assert.equal(payload.mediaBundle.variants.length, 1);
assert.equal(payload.mediaBundle.masks.length, 1);

await clear();
const restored = await restoreFullProjectMedia(payload);
const restoredMedia = restored.notes[0].media?.[0];
assert.ok(restoredMedia?.assetId);
assert.ok(restoredMedia?.variantId);
assert.equal(await loadImage(restoredMedia.assetId), imageData);

const restoredVariant = await loadImageVariant(restoredMedia.variantId);
assert.ok(restoredVariant?.editId);
assert.ok(await loadVariantRasterBlob(restoredVariant?.blobKey || restoredMedia.variantId));
const restoredEdit = await loadImageEdit(restoredVariant.editId);
assert.equal(restoredEdit?.assetId, restoredMedia.assetId);
const restoredMask = restoredEdit?.operations.find((operation) => operation.type === 'mask');
assert.ok(restoredMask && restoredMask.type === 'mask' && restoredMask.mask.type === 'ai');
if (restoredMask && restoredMask.type === 'mask' && restoredMask.mask.type === 'ai') {
  assert.ok(await loadMaskBitmapBlob(restoredMask.mask.maskBlobKey));
}

await clear();
const legacy = await restoreFullProjectMedia({
  version: '1.0',
  project: {
    ...project,
    notes: [{
      ...note,
      images: [imageData],
      imageRefs: [{ assetId: 'img-old-device', variantId: 'ivar-old-device' }],
      media: [{ id: 'legacy-media', kind: 'image', assetId: 'img-old-device', variantId: 'ivar-old-device' }]
    }]
  }
});
const legacyMedia = legacy.notes[0].media?.[0];
assert.ok(legacyMedia?.assetId && legacyMedia.assetId !== 'img-old-device');
assert.equal(legacyMedia?.variantId, undefined);
assert.equal(await loadImage(legacyMedia!.assetId), imageData);

console.log('PASS: Full project bundle restores complete v2 media and preserves visible pixels from v1 files');
}

void runFullProjectBundleTest().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

