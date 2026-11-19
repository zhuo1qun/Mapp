export type FeatureResourceId = 'map' | 'board' | 'table' | 'editor' | 'media' | 'cutout';
export type FeatureResourceState = 'idle' | 'loading' | 'downloaded' | 'ready' | 'error';
export type FeatureResourceStage = 'waiting' | 'downloading' | 'loading' | 'initializing' | 'processing' | 'ready' | 'error';
export type FeatureResourceTask = { state: FeatureResourceState; stage: FeatureResourceStage; progress: number };

const ids: FeatureResourceId[] = ['map', 'board', 'table', 'editor', 'media', 'cutout'];
const tasks = Object.fromEntries(ids.map((id) => [id, { state: 'idle', stage: 'waiting', progress: 0 }])) as Record<FeatureResourceId, FeatureResourceTask>;
let snapshot: Record<FeatureResourceId, FeatureResourceTask> = { ...tasks };
const listeners = new Set<() => void>();
const pending = new Map<FeatureResourceId, Promise<unknown>>();
const progressTimers = new Map<FeatureResourceId, ReturnType<typeof setInterval>>();
const RESOURCE_INTENT_KEY = 'mapp-resource-download-intents-v1';

type ViteManifestEntry = { file: string; imports?: string[]; dynamicImports?: string[] };
type ViteManifest = Record<string, ViteManifestEntry>;

function downloadIntents(): Set<FeatureResourceId> {
  try {
    const parsed = JSON.parse(localStorage.getItem(RESOURCE_INTENT_KEY) || '[]');
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is FeatureResourceId => ids.includes(id)) : []);
  } catch { return new Set(); }
}

function setDownloadIntent(id: FeatureResourceId, active: boolean) {
  if (typeof localStorage === 'undefined') return;
  const intents = downloadIntents();
  if (active) intents.add(id); else intents.delete(id);
  localStorage.setItem(RESOURCE_INTENT_KEY, JSON.stringify([...intents]));
}

function publish(id: FeatureResourceId, patch: Partial<FeatureResourceTask>) {
  tasks[id] = { ...tasks[id], ...patch };
  snapshot = { ...tasks };
  listeners.forEach((listener) => listener());
}

function stopProgress(id: FeatureResourceId) {
  const timer = progressTimers.get(id);
  if (timer) clearInterval(timer);
  progressTimers.delete(id);
}

/** 动态 import 没有字节进度；计时只属于全局任务，因此视图切换不会从头播放。 */
function startModuleProgress(id: FeatureResourceId) {
  stopProgress(id);
  const startedAt = performance.now();
  const initialProgress = tasks[id].state === 'downloaded' ? 92 : Math.max(8, tasks[id].progress);
  publish(id, { state: 'loading', stage: 'loading', progress: initialProgress });
  const timer = setInterval(() => {
    const elapsed = performance.now() - startedAt;
    publish(id, { progress: Math.max(tasks[id].progress, Math.min(92, Math.floor(8 + 84 * (1 - Math.exp(-elapsed / 1900))))) });
  }, 100);
  progressTimers.set(id, timer);
}

function tracked<T>(id: FeatureResourceId, loader: () => Promise<T>): Promise<T> {
  const existing = pending.get(id) as Promise<T> | undefined;
  if (existing) return existing;
  setDownloadIntent(id, true);
  startModuleProgress(id);
  const request = loader().then(async (value) => {
    stopProgress(id);
    // Explicit downloads should reach Cache Storage before the UI clears the intent.
    await persistModuleResource(id).catch(() => {});
    publish(id, { state: 'ready', stage: 'ready', progress: 100 });
    setDownloadIntent(id, false);
    return value;
  }).catch((error) => {
    pending.delete(id);
    stopProgress(id);
    publish(id, { state: 'error', stage: 'error' });
    throw error;
  });
  pending.set(id, request);
  return request;
}

export const loadMapResource = () => tracked('map', () => import('../../components/MapView'));
export const loadBoardResource = () => tracked('board', () => import('../../components/BoardView'));
export const loadTableResource = () => tracked('table', () => import('../../components/TableView'));
export const loadEditorResource = () => tracked('editor', () => import('../../components/NoteEditor'));
export const loadDrawingResource = () => import('../../components/DrawingCanvas');
export const loadCameraResource = () => import('../../components/map/overlays/CameraCaptureDialog');
export const loadMediaDetailResource = () => import('../../components/note-editor/MediaDetailWindow');
export const loadMediaToolsResource = () => tracked('media', () => Promise.all([import('../../components/DrawingCanvas'), import('../../components/map/overlays/CameraCaptureDialog'), import('../../components/note-editor/MediaDetailWindow')]));

export function loadCutoutResource(): Promise<void> {
  const existing = pending.get('cutout') as Promise<void> | undefined;
  if (existing) return existing;
  setDownloadIntent('cutout', true);
  publish('cutout', { state: 'loading', stage: 'downloading', progress: 0 });
  const request = (async () => {
    const response = await fetch('/models/BritishWerewolf/U-2-Netp/onnx/model.onnx', { cache: 'force-cache' });
    if (!response.ok) throw new Error('模型下载失败');
    if ('caches' in window) {
      const cache = await caches.open('ai-models');
      await cache.put('/models/BritishWerewolf/U-2-Netp/onnx/model.onnx', response.clone());
    }
    const total = Number(response.headers.get('content-length')) || 0;
    if (!response.body || !total) {
      await response.arrayBuffer();
    } else {
      const reader = response.body.getReader();
      let loaded = 0;
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        loaded += chunk.value.byteLength;
        publish('cutout', { progress: Math.min(99, Math.round((loaded / total) * 100)) });
      }
    }
    publish('cutout', { state: 'downloaded', stage: 'waiting', progress: 100 });
    setDownloadIntent('cutout', false);
  })().catch((error) => {
    pending.delete('cutout');
    publish('cutout', { state: 'error', stage: 'error' });
    throw error;
  });
  pending.set('cutout', request);
  return request;
}

export function reportCutoutRuntime(stage: 'initializing' | 'processing' | 'ready' | 'error', progress?: number) {
  publish('cutout', {
    state: stage === 'ready' ? 'ready' : stage === 'error' ? 'error' : 'loading',
    stage,
    progress: progress == null ? tasks.cutout.progress : Math.max(0, Math.min(100, progress))
  });
}

function manifestFile(manifest: ViteManifest, sourceSuffix: string): string | null {
  const key = Object.keys(manifest).find((candidate) => candidate.endsWith(sourceSuffix));
  return key ? manifest[key]?.file ?? null : null;
}

const moduleSources: Partial<Record<FeatureResourceId, string[]>> = {
  map: ['components/MapView.tsx'],
  board: ['components/BoardView.tsx'],
  table: ['components/TableView.tsx'],
  editor: ['components/NoteEditor.tsx'],
  media: ['components/DrawingCanvas.tsx', 'components/map/overlays/CameraCaptureDialog.tsx', 'components/note-editor/MediaDetailWindow.tsx']
};

let manifestRequest: Promise<ViteManifest | null> | null = null;
function currentManifest(): Promise<ViteManifest | null> {
  manifestRequest ??= fetch('/.vite/manifest.json', { cache: 'no-cache' })
    .then((response) => response.ok ? response.json() as Promise<ViteManifest> : null)
    .catch(() => null);
  return manifestRequest;
}

function collectManifestFiles(manifest: ViteManifest, key: string, files: Set<string>) {
  const entry = manifest[key];
  if (!entry || files.has(entry.file)) return;
  files.add(entry.file);
  for (const importedKey of entry.imports || []) collectManifestFiles(manifest, importedKey, files);
}

async function persistModuleResource(id: FeatureResourceId) {
  const sources = moduleSources[id];
  if (!sources || !('caches' in window)) return;
  const manifest = await currentManifest();
  if (!manifest) return;
  const files = new Set<string>();
  for (const source of sources) {
    const key = Object.keys(manifest).find((candidate) => candidate.endsWith(source));
    if (key) collectManifestFiles(manifest, key, files);
  }
  const cache = await caches.open('app-modules');
  await Promise.all([...files].map(async (file) => {
    const url = new URL(file, window.location.origin).href;
    if (!(await cache.match(url))) await cache.add(url);
  }));
}

async function cacheContains(cache: Cache, file: string | null): Promise<boolean> {
  if (!file) return false;
  return !!(await cache.match(new URL(file, window.location.origin).href));
}

/** 刷新后按当前构建的哈希清单恢复“已下载”；旧版本同名前缀不会被误判。 */
async function hydratePersistedResourceState() {
  if (typeof window === 'undefined' || !('caches' in window)) return;
  try {
    const manifest = await currentManifest();
    if (!manifest) return;
    const moduleCache = await caches.open('app-modules');
    const sourceById: Record<'map' | 'board' | 'table' | 'editor', string> = {
      map: 'components/MapView.tsx',
      board: 'components/BoardView.tsx',
      table: 'components/TableView.tsx',
      editor: 'components/NoteEditor.tsx'
    };
    await Promise.all(Object.entries(sourceById).map(async ([rawId, source]) => {
      const id = rawId as keyof typeof sourceById;
      if (tasks[id].state !== 'idle') return;
      if (await cacheContains(moduleCache, manifestFile(manifest, source))) {
        publish(id, { state: 'downloaded', stage: 'waiting', progress: 100 });
      }
    }));

    if (tasks.media.state === 'idle') {
      const mediaFiles = [
        manifestFile(manifest, 'components/DrawingCanvas.tsx'),
        manifestFile(manifest, 'components/map/overlays/CameraCaptureDialog.tsx'),
        manifestFile(manifest, 'components/note-editor/MediaDetailWindow.tsx')
      ];
      const mediaReady = mediaFiles.every(Boolean) && (await Promise.all(mediaFiles.map((file) => cacheContains(moduleCache, file)))).every(Boolean);
      if (mediaReady) publish('media', { state: 'downloaded', stage: 'waiting', progress: 100 });
    }

    if (tasks.cutout.state === 'idle') {
      const modelCache = await caches.open('ai-models');
      if (await cacheContains(modelCache, '/models/BritishWerewolf/U-2-Netp/onnx/model.onnx')) {
        publish('cutout', { state: 'downloaded', stage: 'waiting', progress: 100 });
      }
    }

    // 页面或浏览器在下载中被关闭时，下次启动自动恢复未完成的用户请求。
    const resumeLoaders: Record<FeatureResourceId, () => Promise<unknown>> = {
      map: loadMapResource,
      board: loadBoardResource,
      table: loadTableResource,
      editor: loadEditorResource,
      media: loadMediaToolsResource,
      cutout: loadCutoutResource
    };
    for (const id of downloadIntents()) {
      if (tasks[id].state === 'downloaded' || tasks[id].state === 'ready') {
        setDownloadIntent(id, false);
        continue;
      }
      void resumeLoaders[id]().catch(() => {});
    }
  } catch {
    // 未注册 Service Worker、开发环境或离线清单不可用时保持 idle，实际加载仍可正常进行。
  }
}

export const featureResourceSnapshot = () => snapshot;
export function subscribeFeatureResources(listener: () => void): () => void { listeners.add(listener); return () => listeners.delete(listener); }

/** Re-check actual Cache Storage whenever the resource window is opened or restored. */
export async function refreshFeatureResourceState() {
  manifestRequest = null;
  await hydratePersistedResourceState();
}

void hydratePersistedResourceState();
