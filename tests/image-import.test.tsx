import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import React, { useState } from 'react';
import { act, create } from 'react-test-renderer';
import { set } from 'idb-keyval';
import { useImageImport } from '../components/hooks/useImageImport';
import { ImportPreviewDialog } from '../components/ImportPreviewDialog';
import { readImageGpsMetadata } from '../utils/media/imageFileProcessing';
import { fingerprintImageBlob, fingerprintStoredImage } from '../utils/media/imageImportContent';
import { blobToDataUrl, hashMediaPayload } from '../utils/persistence/imageAssetStore';
import { loadNoteImages, loadProject, saveImage, saveProject } from '../utils/persistence/storage';
import type { Note, Project } from '../types';

// Browser IO only. The hook, EXIF parser, content hashes and IndexedDB storage are production code.
const dataReads = new Map<string, number>();
let failDataRead = '';
let holdMetadataRead = false;
let releaseMetadataRead: (() => void) | undefined;
let holdDataRead = false;
let releaseDataRead: (() => void) | undefined;
let imageDecodes = 0;
globalThis.FileReader = class {
  result: string | ArrayBuffer | null = null;
  error: Error | null = null;
  onload: ((event: any) => void) | null = null;
  onloadend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readAsArrayBuffer(blob: Blob) {
    const finish = async () => {
      this.result = await blob.arrayBuffer();
      this.onload?.({ target: this });
      this.onloadend?.();
    };
    if (holdMetadataRead) {
      holdMetadataRead = false;
      releaseMetadataRead = () => void finish();
    } else void finish();
  }
  readAsDataURL(blob: Blob) {
    const name = (blob as File).name || 'stored-blob';
    dataReads.set(name, (dataReads.get(name) || 0) + 1);
    if (name === failDataRead) {
      this.error = new Error('temporary read failure');
      queueMicrotask(() => this.onerror?.());
      return;
    }
    const finish = async () => {
      this.result = `data:${blob.type};base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`;
      this.onload?.({ target: this });
      this.onloadend?.();
    };
    if (holdDataRead) {
      holdDataRead = false;
      releaseDataRead = () => void finish();
    } else void finish();
  }
} as any;
globalThis.Image = class {
  naturalWidth = 640;
  naturalHeight = 480;
  onload: (() => void) | null = null;
  set src(_: string) {
    imageDecodes++;
    queueMicrotask(() => this.onload?.());
  }
} as any;
globalThis.window = globalThis as any;
const openUrls = new Set<string>();
let urlId = 0;
URL.createObjectURL = () => {
  const url = `blob:test-${++urlId}`;
  openUrls.add(url);
  return url;
};
URL.revokeObjectURL = (url) => { openUrls.delete(url); };

// Minimal JPEG with a genuine little-endian EXIF GPS IFD. Identity bytes distinguish files
// with the same coordinates. Pixel decoding is mocked, metadata parsing is not.
function photo(name: string, identity: string, lat = 28, lng = 112, mime = 'image/jpeg') {
  const tiff = Buffer.alloc(128);
  tiff.write('II', 0);
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(8, 4);
  tiff.writeUInt16LE(1, 8);
  tiff.writeUInt16LE(0x8825, 10);
  tiff.writeUInt16LE(4, 12);
  tiff.writeUInt32LE(1, 14);
  tiff.writeUInt32LE(26, 18);
  tiff.writeUInt16LE(4, 26);
  const entry = (at: number, tag: number, type: number, count: number, value: number) => {
    tiff.writeUInt16LE(tag, at);
    tiff.writeUInt16LE(type, at + 2);
    tiff.writeUInt32LE(count, at + 4);
    tiff.writeUInt32LE(value, at + 8);
  };
  entry(28, 1, 2, 2, (lat < 0 ? 'S' : 'N').charCodeAt(0));
  entry(40, 2, 5, 3, 80);
  entry(52, 3, 2, 2, (lng < 0 ? 'W' : 'E').charCodeAt(0));
  entry(64, 4, 5, 3, 104);
  for (const [offset, degrees] of [[80, Math.abs(lat)], [104, Math.abs(lng)]]) {
    [degrees, 0, 0].forEach((value, index) => {
      tiff.writeUInt32LE(value, offset + index * 8);
      tiff.writeUInt32LE(1, offset + index * 8 + 4);
    });
  }
  const exif = Buffer.concat([Buffer.from('Exif\0\0'), tiff]);
  const header = Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0, 0]);
  header.writeUInt16BE(exif.length + 2, 4);
  return new File([header, exif, Buffer.from([0xff, 0xd9]), identity], name, { type: mime });
}

function makeNote(id: string, images: string[] = []): Note {
  return {
    id, images, coords: { lat: 28, lng: 112 }, text: '', emoji: '📍', fontSize: 3,
    tags: [], variant: 'image', createdAt: 1, boardX: 100, boardY: 100
  };
}
let projectCounter = 0;
async function harness(notes: Note[] = []) {
  let api!: ReturnType<typeof useImageImport>;
  let project: Project = { id: `import-test-${++projectCounter}`, name: 'Import test', type: 'map', createdAt: 1, notes };
  let change!: (project: Project) => void;
  let failSave = false;
  let saveCalls = 0;
  const submitted: Project[] = [];
  const created: Note[][] = [];
  function Harness() {
    const [current, setCurrent] = useState(project);
    project = current;
    change = setCurrent;
    api = useImageImport({
      project: current, notes: current.notes, mapInstance: null,
      onUpdateProject: async (next) => {
        saveCalls++;
        submitted.push(next);
        if (failSave) throw new Error('project write failed');
        const persisted = await saveProject(next);
        setCurrent(persisted);
      },
      onNotesCreated: (notes) => created.push(notes)
    });
    return null;
  }
  let tree: ReturnType<typeof create>;
  await act(async () => { tree = create(<Harness />); });
  return {
    get api() { return api; }, get project() { return project; },
    get saveCalls() { return saveCalls; }, submitted, created,
    failSave(value: boolean) { failSave = value; },
    change,
    async dispose() { await act(async () => tree!.unmount()); }
  };
}
const step = async (action: () => unknown) => { await act(async () => { await action(); }); };

async function run() {
  const a = photo('a.jpg', 'first photo');
  const b = photo('b.jpg', 'second photo');
  const c = photo('c.jpg', 'third photo');
  assert.deepEqual((({ lat, lng }) => ({ lat, lng }))(await readImageGpsMetadata(a)), { lat: 28, lng: 112 });
  const southern = await readImageGpsMetadata(photo('south.jpg', 'south', -28, -112));
  assert.equal(southern.lat, -28);
  assert.equal(southern.lng, -112);
  assert.equal((await readImageGpsMetadata(photo('zero.jpg', 'zero', 0, 0))).lat, 0);
  await assert.rejects(readImageGpsMetadata(photo('bad-gps.jpg', 'bad', 100, 112)), /超出有效范围/);
  console.log('PASS: real EXIF parsing, hemisphere signs, zero coordinates and invalid ranges');

  const sampleA = photo('sample-a.jpg', 'A'.repeat(6000));
  const sampleBytes = new Uint8Array(await sampleA.arrayBuffer());
  sampleBytes[1000] = 66; // Outside the storage hash's start/middle/end samples.
  const sampleB = new File([sampleBytes], 'sample-b.jpg', { type: 'image/jpeg' });
  const sampleDataA = await blobToDataUrl(sampleA);
  const sampleDataB = await blobToDataUrl(sampleB);
  assert.equal(await hashMediaPayload(sampleDataA), await hashMediaPayload(sampleDataB));
  const sampleIdA = await saveImage(sampleDataA);
  const sampleIdB = await saveImage(sampleDataB);
  assert.notEqual(sampleIdA, sampleIdB, 'sample hash collisions must not substitute another photo');
  assert.equal(await saveImage(sampleDataB), sampleIdB, 'identical full content still reuses its asset');
  console.log('PASS: storage verifies full content even when legacy sampled hashes collide');

  const aData = await blobToDataUrl(a);
  const assetId = await saveImage(aData);
  await set('mapp-image-img-legacy-string', aData);
  await set('mapp-image-img-legacy-object', { data: aData });
  for (const source of [assetId, 'img-legacy-string', 'img-legacy-object', aData]) {
    assert.equal(await fingerprintStoredImage(source), await fingerprintImageBlob(a));
  }
  const h = await harness([makeNote('existing', [assetId])]);
  const input = { value: 'C:\\fakepath\\b.jpg' };
  (h.api.fileInputRef as any).current = input;
  imageDecodes = 0;
  await step(() => h.api.handleImageImport([b, c, a, b]));
  assert.equal(input.value, '');
  assert.deepEqual(h.api.importPreview.map(p => p.isDuplicate), [false, false, true, true]);
  assert.equal(imageDecodes, 0, 'duplicate checks must not decode images');
  assert.equal(h.api.importProgress.completed, 4);
  await step(() => Promise.all([h.api.handleConfirmImport(), h.api.handleConfirmImport()]));
  assert.equal(h.saveCalls, 1, 'double confirm must not save twice');
  assert.equal(h.project.notes.length, 3);
  assert.equal(new Set(h.project.notes.map(n => `${n.boardX}_${n.boardY}`)).size, 3);
  assert.equal(h.api.showImportDialog, false);
  const reloaded = await loadProject(h.project.id);
  assert.ok(reloaded);
  assert.equal((await loadNoteImages(reloaded.notes[1])).images[0], await blobToDataUrl(b));
  assert.ok(reloaded.notes[1].media?.[0].assetId.startsWith('img-'));
  await step(() => h.api.handleImageImport([b]));
  assert.equal(h.api.importPreview[0].isDuplicate, true, 'reimport uses persisted photo content');
  await step(() => h.api.handleCancelImport());
  await step(() => h.api.handleImageImport([c]));
  assert.equal(h.api.showImportDialog, true, 'same-file reselect remains possible');
  await h.dispose();
  assert.equal(openUrls.size, 0);
  console.log('PASS: same-location photos, batch/existing duplicates, no decode scan, media persistence and distinct board positions');

  const retry = await harness();
  const r1 = photo('retry-a.jpg', 'retry a');
  const r2 = photo('retry-b.jpg', 'retry b');
  await step(() => retry.api.handleImageImport([r1, r2]));
  failDataRead = r2.name;
  await step(() => retry.api.handleConfirmImport());
  assert.equal(retry.saveCalls, 0, 'do not commit a batch with a failed photo');
  assert.equal(retry.api.showImportDialog, true);
  assert.equal(retry.api.hasImportError, true);
  assert.equal(retry.api.importPreview.length, 2);
  assert.match(retry.api.importPreview[1].saveError!, /temporary read failure/);
  failDataRead = '';
  retry.failSave(true);
  await step(() => retry.api.handleConfirmImport());
  assert.equal(retry.api.isConfirmingImport, false);
  assert.equal(retry.api.showImportDialog, true);
  const idsBeforeRetry = retry.submitted[0].notes.map(n => n.id);
  retry.failSave(false);
  await step(() => retry.api.handleConfirmImport());
  assert.deepEqual(retry.project.notes.map(n => n.id), idsBeforeRetry);
  assert.equal(dataReads.get(r1.name), 1, 'successful asset is not read again on retry');
  assert.equal(dataReads.get(r2.name), 2, 'failed file is reread once, not after project failure');
  assert.equal(retry.project.notes.length, 2);
  await retry.dispose();
  console.log('PASS: per-file/project failures retain previews, stable IDs and already-saved media for retry');

  const mixed = await harness();
  const noGps = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], 'no-gps.jpg', { type: 'image/jpeg' });
  const corrupt = new File(['not a JPEG'], 'corrupt.jpg', { type: 'image/jpeg' });
  await step(() => mixed.api.handleImageImport([b, noGps, corrupt]));
  assert.equal(mixed.api.importPreview[1].errorKind, 'gps-missing');
  assert.equal(mixed.api.importPreview[2].errorKind, 'gps-read');
  await step(() => mixed.api.handleConfirmImport());
  assert.equal(mixed.project.notes.length, 1);
  assert.equal(mixed.api.importPreview.length, 2, 'invalid photos must not silently disappear');
  assert.equal(mixed.api.showImportDialog, true);
  await step(() => mixed.api.handleRetryPreparation());
  assert.equal(mixed.api.importPreview.length, 2, 'retry must not re-add already imported photos');
  assert.equal(mixed.project.notes.length, 1);
  await mixed.dispose();
  console.log('PASS: distinguish missing GPS from read failure; retain only failed entries after partial import');

  const pending = await harness();
  holdMetadataRead = true;
  let first!: Promise<void>;
  await step(() => { first = pending.api.handleImageImport([a]); });
  assert.equal(pending.api.showImportDialog, true);
  assert.equal(pending.api.isPreparingImport, true);
  await step(() => pending.api.handleConfirmImport());
  assert.equal(pending.saveCalls, 0);
  await step(() => pending.api.handleCancelImport());
  await step(() => pending.api.handleImageImport([b]));
  await step(async () => { releaseMetadataRead!(); await first; });
  assert.equal(pending.api.importPreview[0].file.name, b.name, 'old completion cannot replace a new selection');
  await pending.dispose();
  assert.equal(openUrls.size, 0);
  console.log('PASS: preparation is visible/cancellable; stale completion cannot reopen or replace a batch');

  const current = await harness();
  const emptyMime = photo('no-mime.jpg', 'empty mime', 28, 112, '');
  await step(() => current.api.handleImageImport([emptyMime]));
  assert.equal(current.api.importPreview[0].file.type, 'image/jpeg');
  holdDataRead = true;
  let saving!: Promise<void>;
  await step(() => { saving = current.api.handleConfirmImport(); });
  await step(() => current.change({ ...current.project, name: 'Updated during import', notes: [makeNote('concurrent')] }));
  await step(async () => { releaseDataRead!(); await saving; });
  assert.equal(current.project.name, 'Updated during import');
  assert.equal(current.project.notes.length, 2);
  assert.equal(current.project.notes[0].id, 'concurrent');
  await current.dispose();
  console.log('PASS: empty MIME files retain image type; project updates during file IO are preserved');

  const unmounted = await harness();
  await step(() => unmounted.api.handleImageImport([a]));
  holdDataRead = true;
  let abandoned!: Promise<void>;
  await step(() => { abandoned = unmounted.api.handleConfirmImport(); });
  await unmounted.dispose();
  await step(async () => { releaseDataRead!(); await abandoned; });
  assert.equal(unmounted.saveCalls, 0, 'unmount during IO must not write points into an abandoned project');
  assert.equal(openUrls.size, 0);
  console.log('PASS: unmount cancels pending file IO results without creating points');

  let dialog: ReturnType<typeof create>;
  await step(() => {
    dialog = create(<ImportPreviewDialog isOpen themeColor="#abcdef" importPreview={[]}
      onConfirm={() => {}} onCancel={() => {}} isPreparing progress={{ completed: 0, total: 3 }} />);
  });
  const buttons = dialog!.root.findAllByType('button');
  assert.equal(buttons.find(button => button.children.includes('Preparing…'))?.props.disabled, true);
  assert.equal(buttons.find(button => button.children.includes('Cancel'))?.props.disabled, false);
  await step(() => dialog!.unmount());
  assert.equal(openUrls.size, 0);
  console.log('PASS: dialog disables confirmation during preparation and permits cancellation');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
