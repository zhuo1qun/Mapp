import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import React, { useEffect, useState } from 'react';
import { act, create } from 'react-test-renderer';
import { useMediaHandler } from '../components/hooks/useMediaHandler';
import { CameraCaptureDialog } from '../components/map/overlays/CameraCaptureDialog';
import { blobToDataUrl } from '../utils/persistence/imageAssetStore';
import { loadNoteImages, loadProject, saveProject } from '../utils/persistence/storage';
import type { Note, Project } from '../types';

// Browser IO boundaries only. IndexedDB, project normalization, asset reading,
// React effects and the editor's media hook run their production code.
globalThis.FileReader = class {
  result: string | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readAsDataURL(blob: Blob) {
    void blob.arrayBuffer().then((bytes) => {
      this.result = `data:${blob.type};base64,${Buffer.from(bytes).toString('base64')}`;
      this.onload?.();
    });
  }
} as any;
globalThis.Image = class {
  naturalWidth = 640;
  naturalHeight = 480;
  onload: (() => void) | null = null;
  set src(_: string) {
    queueMicrotask(() => this.onload?.());
  }
} as any;
globalThis.window = globalThis as any;
const photo = new Blob(['captured photo bytes'], { type: 'image/jpeg' });
let cameraCalls = 0;
let encodedFrames = 0;
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: {
    mediaDevices: {
      getUserMedia: async () => {
        cameraCalls++;
        return { getTracks: () => [{ stop() {} }] };
      }
    }
  }
});
globalThis.document = {
  createElement: (tag: string) => {
    assert.equal(tag, 'canvas');
    return {
      getContext: () => ({ drawImage() {} }),
      toBlob: (callback: (blob: Blob) => void) => {
        encodedFrames++;
        callback(photo);
      }
    };
  }
} as any;
const createNodeMock = (element: any) =>
  element.type === 'video'
    ? {
        videoWidth: 640,
        videoHeight: 480,
        clientWidth: 320,
        clientHeight: 240,
        play: () => Promise.resolve(),
        srcObject: null
      }
    : null;
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

/**
 * 新流程契约：定位 → 打开编辑器取景 overlay → 快门只 append 媒体；
 * 保存时才写入项目（对标涂鸦，不再 MapView 先落盘再建编辑器）。
 */
async function run() {
  let locationCalls = 0;
  let resolveLocation: (value: { lat: number; lng: number } | null) => void;
  let stagedNote: Partial<Note> | null = null;
  let cameraOpen = false;
  let preparing = false;

  async function startPhotoNewPin() {
    if (preparing || cameraOpen) return;
    preparing = true;
    locationCalls++;
    const location = await new Promise<{ lat: number; lng: number } | null>((resolve) => {
      resolveLocation = resolve;
    });
    preparing = false;
    if (!location) return;
    stagedNote = {
      id: `note-${Date.now()}`,
      coords: location,
      emoji: '',
      text: '',
      images: [],
      tags: [],
      variant: 'standard',
      createdAt: Date.now(),
      boardX: 0,
      boardY: 0,
      isFavorite: false
    };
    cameraOpen = true;
  }

  const firstPin = startPhotoNewPin();
  assert.equal(locationCalls, 1);
  assert.equal(cameraCalls, 0, 'camera must wait while location is pending');
  assert.equal(preparing, true);
  assert.equal(cameraOpen, false);

  await act(async () => {
    resolveLocation!({ lat: 28, lng: 112 });
  });
  await firstPin;
  assert.equal(preparing, false);
  assert.ok(stagedNote?.coords);
  assert.equal(cameraOpen, true);
  assert.equal(cameraCalls, 0, 'camera opens only after NoteEditor mounts the overlay');

  let capturedIntoEditor: string | null = null;
  let editor: ReturnType<typeof useMediaHandler>;
  function EditorWithCamera() {
    editor = useMediaHandler({
      initialNote: stagedNote as Note,
      isOpen: true,
      text: '',
      setText() {},
      textareaRef: { current: null }
    });
    const [open, setOpen] = useState(true);
    useEffect(() => {
      // Mirror NoteEditor autoOpenCamera: mount overlay after editor is open.
    }, []);
    return (
      <CameraCaptureDialog
        open={open}
        variant="overlay"
        onClose={() => setOpen(false)}
        onCapture={async (blob) => {
          const dataUrl = await blobToDataUrl(blob);
          editor.appendDisplayImages([dataUrl]);
          capturedIntoEditor = dataUrl;
          setOpen(false);
          cameraOpen = false;
        }}
      />
    );
  }

  let tree: ReturnType<typeof create>;
  await act(async () => {
    tree = create(<EditorWithCamera />, { createNodeMock });
  });
  assert.equal(cameraCalls, 1, 'overlay getUserMedia after editor opens');

  const shutter = () => tree!.root.findByProps({ 'aria-label': '拍照' });
  assert.equal(shutter().props.disabled, false);
  await act(async () => {
    await shutter().props.onClick();
  });
  assert.equal(locationCalls, 1, 'shutter must never request location');
  assert.ok(capturedIntoEditor?.startsWith('data:image/jpeg'));
  assert.equal(editor!.mediaItems.length, 1);
  assert.equal(editor!.mediaItems[0].kind, 'image');
  assert.equal(editor!.displaySrcs[0], capturedIntoEditor);

  // 用户保存：persist → 写入项目（对标涂鸦落盘时机）
  const persistedMedia = await editor!.persistMediaForSave();
  assert.ok(persistedMedia.media[0].assetId.startsWith('img-'));
  let project: Project = {
    id: 'camera-test',
    name: 'Camera test',
    type: 'map',
    createdAt: 1,
    notes: [
      {
        ...(stagedNote as Note),
        images: persistedMedia.images,
        imageRefs: persistedMedia.imageRefs,
        media: persistedMedia.media
      }
    ]
  };
  project = await saveProject(project);
  const reloaded = await loadProject(project.id);
  assert.ok(reloaded);
  const hydrated = await loadNoteImages(reloaded.notes[0]);
  assert.equal(
    hydrated.images[0],
    'data:image/jpeg;base64,' + Buffer.from('captured photo bytes').toString('base64')
  );
  console.log('PASS: location → editor camera overlay → append media → save persists photo');

  await act(async () => {
    tree!.unmount();
  });

  // 定位失败：不打开取景器
  cameraOpen = false;
  preparing = false;
  const beforeCam = cameraCalls;
  const p = startPhotoNewPin();
  await act(async () => {
    resolveLocation!(null);
  });
  await p;
  assert.equal(cameraOpen, false);
  assert.equal(cameraCalls, beforeCam, 'failed location must not request camera');
  console.log('PASS: failed location does not open camera');

  // 保存失败保留同一帧供重试
  let attempts = 0;
  const before = encodedFrames;
  const captured: Blob[] = [];
  await act(async () => {
    tree = create(
      <CameraCaptureDialog
        open
        variant="overlay"
        onClose={() => {}}
        onCapture={async (blob) => {
          captured.push(blob);
          if (++attempts === 1) throw new Error('Simulated storage failure');
        }}
      />,
      { createNodeMock }
    );
  });
  await act(async () => {
    await tick();
  });
  const retryShutter = () => tree!.root.findByProps({ 'aria-label': '拍照' });
  assert.equal(retryShutter().props.disabled, false);
  await act(async () => {
    await retryShutter().props.onClick();
  });
  assert.equal(retryShutter().props.disabled, false);
  const retry = tree!.root
    .findAllByType('button')
    .find((button) => button.props.children === '重试保存这张照片');
  assert.ok(retry);
  await act(async () => {
    await retry.props.onClick();
  });
  assert.equal(captured[0], captured[1]);
  assert.equal(encodedFrames, before + 1, 'save retry must not recapture a different frame');
  await act(async () => {
    tree!.unmount();
  });
  console.log('PASS: failed save keeps the exact photo for retry and releases shutter');
}

void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
