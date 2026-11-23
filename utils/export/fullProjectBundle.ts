import type {
  ImageEdit,
  ImageOperation,
  ImageVariant,
  Note,
  NoteImageRef,
  NoteMediaItem,
  NoteMediaKind,
  Project
} from '../../types';
import { loadProject, saveImage, saveSketch } from '../persistence/storage';
import {
  IMAGE_PREFIX,
  SKETCH_PREFIX,
  blobToDataUrl,
  dataUrlToBlob,
  isMediaRefId,
  loadMediaDataUrl
} from '../persistence/imageAssetStore';
import {
  generateEditId,
  generateVariantId,
  loadImageEdit,
  loadImageVariant,
  loadMaskBitmapBlob,
  loadVariantRasterBlob,
  saveImageEdit,
  saveImageVariant,
  saveMaskBitmapBlob,
  saveVariantRasterBlob
} from '../persistence/imageVariantStore';

type BundledAsset = {
  assetId: string;
  kind: NoteMediaKind;
  dataUrl: string;
};

type BundledEdit = {
  edit: ImageEdit;
  assetKind: NoteMediaKind;
};

type BundledVariant = {
  variant: ImageVariant;
  assetKind: NoteMediaKind;
  rasterDataUrl?: string;
};

type BundledMask = {
  key: string;
  dataUrl: string;
};

export type FullProjectMediaBundle = {
  assets: BundledAsset[];
  edits: BundledEdit[];
  variants: BundledVariant[];
  masks: BundledMask[];
};

export type FullProjectExportPayload = {
  version: '2.0';
  format: 'mapp-full-project';
  project: Project;
  mediaBundle: FullProjectMediaBundle;
};

const assetKey = (kind: NoteMediaKind, assetId: string) => `${kind}:${assetId}`;

function addLocalAsset(target: Map<string, NoteMediaKind>, assetId: string | undefined, kind: NoteMediaKind) {
  if (assetId && isMediaRefId(assetId)) target.set(assetKey(kind, assetId), kind);
}

function collectProjectMedia(project: Project) {
  const assets = new Map<string, NoteMediaKind>();
  const variants = new Map<string, NoteMediaKind>();
  for (const note of project.notes || []) {
    for (const item of note.media || []) {
      if (item.source?.kind === 'remote') addLocalAsset(assets, item.source.cachedAssetId, 'image');
      else addLocalAsset(assets, item.assetId, item.kind);
      if (item.variantId) variants.set(item.variantId, item.kind);
    }
    for (const ref of note.imageRefs || []) {
      if (ref.source?.kind === 'remote') addLocalAsset(assets, ref.source.cachedAssetId, 'image');
      else addLocalAsset(assets, ref.assetId, 'image');
      if (ref.variantId) variants.set(ref.variantId, 'image');
    }
    for (const image of note.images || []) addLocalAsset(assets, image, 'image');
    addLocalAsset(assets, note.sketch, 'sketch');
  }
  return { assets, variants };
}

function bitmapMaskKeys(operations: ImageOperation[]) {
  return operations.flatMap((operation) =>
    operation.type === 'mask' && (operation.mask.type === 'bitmap' || operation.mask.type === 'ai')
      ? [operation.mask.maskBlobKey]
      : []
  );
}

export async function buildFullProjectExportPayload(projectId: string): Promise<FullProjectExportPayload> {
  const project = await loadProject(projectId, false);
  if (!project) throw new Error('无法加载项目数据');

  const collected = collectProjectMedia(project);
  const bundledVariants: BundledVariant[] = [];
  const edits = new Map<string, BundledEdit>();
  const maskKeys = new Set<string>();

  for (const [variantId, kind] of collected.variants) {
    const variant = await loadImageVariant(variantId);
    if (!variant) throw new Error(`媒体 Variant 缺失：${variantId}`);
    addLocalAsset(collected.assets, variant.assetId, kind);
    let rasterDataUrl: string | undefined;
    const raster = await loadVariantRasterBlob(variant.blobKey || variant.id);
    if (raster) rasterDataUrl = await blobToDataUrl(raster);
    bundledVariants.push({ variant, assetKind: kind, rasterDataUrl });

    if (variant.editId && !edits.has(variant.editId)) {
      const edit = await loadImageEdit(variant.editId);
      if (edit) {
        edits.set(edit.id, { edit, assetKind: kind });
        addLocalAsset(collected.assets, edit.assetId, kind);
        bitmapMaskKeys(edit.operations).forEach((key) => maskKeys.add(key));
      } else if (!rasterDataUrl) {
        throw new Error(`媒体编辑记录缺失：${variant.editId}`);
      }
    }
  }

  const assets: BundledAsset[] = [];
  for (const [key, kind] of collected.assets) {
    const assetId = key.slice(kind.length + 1);
    const dataUrl = await loadMediaDataUrl(kind === 'sketch' ? SKETCH_PREFIX : IMAGE_PREFIX, assetId);
    if (!dataUrl) throw new Error(`媒体资产缺失：${assetId}`);
    assets.push({ assetId, kind, dataUrl });
  }

  const masks: BundledMask[] = [];
  for (const key of maskKeys) {
    const blob = await loadMaskBitmapBlob(key);
    if (!blob) throw new Error(`蒙版数据缺失：${key}`);
    masks.push({ key, dataUrl: await blobToDataUrl(blob) });
  }

  return {
    version: '2.0',
    format: 'mapp-full-project',
    project,
    mediaBundle: {
      assets,
      edits: [...edits.values()],
      variants: bundledVariants,
      masks
    }
  };
}

function isFullProjectMediaBundle(value: unknown): value is FullProjectMediaBundle {
  if (!value || typeof value !== 'object') return false;
  const bundle = value as Partial<FullProjectMediaBundle>;
  return Array.isArray(bundle.assets) && Array.isArray(bundle.edits) &&
    Array.isArray(bundle.variants) && Array.isArray(bundle.masks);
}

function rewriteMaskOperation(operation: ImageOperation, maskMap: Map<string, string>): ImageOperation {
  if (operation.type !== 'mask' || operation.mask.type === 'polygon') return operation;
  const maskBlobKey = maskMap.get(operation.mask.maskBlobKey);
  if (!maskBlobKey) throw new Error(`导入包缺少蒙版：${operation.mask.maskBlobKey}`);
  return { ...operation, mask: { ...operation.mask, maskBlobKey } };
}

function rewriteSource(source: NoteImageRef['source'], assetMap: Map<string, string>) {
  if (source?.kind !== 'remote' || !source.cachedAssetId) return source;
  return { ...source, cachedAssetId: assetMap.get(assetKey('image', source.cachedAssetId)) };
}

function rewriteBundledProject(
  project: Project,
  assetMap: Map<string, string>,
  variantMap: Map<string, string>
): Project {
  const rewriteAsset = (kind: NoteMediaKind, id: string) =>
    isMediaRefId(id) ? assetMap.get(assetKey(kind, id)) || id : id;
  const notes = (project.notes || []).map((note): Note => ({
    ...note,
    images: (note.images || []).map((id) => rewriteAsset('image', id)),
    sketch: note.sketch ? rewriteAsset('sketch', note.sketch) : undefined,
    imageRefs: (note.imageRefs || []).map((ref) => ({
      ...ref,
      assetId: ref.source?.kind === 'remote' ? ref.assetId : rewriteAsset('image', ref.assetId),
      source: rewriteSource(ref.source, assetMap),
      variantId: ref.variantId ? variantMap.get(ref.variantId) : undefined
    })),
    media: (note.media || []).map((item) => ({
      ...item,
      assetId: item.source?.kind === 'remote' ? item.assetId : rewriteAsset(item.kind, item.assetId),
      source: rewriteSource(item.source, assetMap),
      variantId: item.variantId ? variantMap.get(item.variantId) : undefined
    }))
  }));
  return { ...project, notes };
}

async function restoreBundledProject(project: Project, bundle: FullProjectMediaBundle): Promise<Project> {
  const assetMap = new Map<string, string>();
  for (const asset of bundle.assets) {
    if (!asset.dataUrl?.startsWith('data:image/')) throw new Error(`无效媒体资产：${asset.assetId}`);
    const newId = asset.kind === 'sketch' ? await saveSketch(asset.dataUrl) : await saveImage(asset.dataUrl);
    assetMap.set(assetKey(asset.kind, asset.assetId), newId);
  }

  const maskMap = new Map<string, string>();
  for (const mask of bundle.masks) {
    const id = `mask-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    maskMap.set(mask.key, await saveMaskBitmapBlob(id, await dataUrlToBlob(mask.dataUrl)));
  }

  const editMap = new Map<string, string>();
  for (const bundled of bundle.edits) {
    const id = generateEditId();
    const mappedAsset = assetMap.get(assetKey(bundled.assetKind, bundled.edit.assetId));
    if (!mappedAsset) throw new Error(`编辑记录引用了缺失资产：${bundled.edit.assetId}`);
    await saveImageEdit({
      ...bundled.edit,
      id,
      assetId: mappedAsset,
      operations: bundled.edit.operations.map((operation) => rewriteMaskOperation(operation, maskMap))
    });
    editMap.set(bundled.edit.id, id);
  }

  const variantMap = new Map<string, string>();
  for (const bundled of bundle.variants) {
    const id = generateVariantId();
    const mappedAsset = assetMap.get(assetKey(bundled.assetKind, bundled.variant.assetId));
    if (!mappedAsset) throw new Error(`Variant 引用了缺失资产：${bundled.variant.assetId}`);
    let blobKey: string | undefined;
    if (bundled.rasterDataUrl) {
      blobKey = await saveVariantRasterBlob(id, await dataUrlToBlob(bundled.rasterDataUrl));
    }
    await saveImageVariant({
      ...bundled.variant,
      id,
      assetId: mappedAsset,
      editId: bundled.variant.editId ? editMap.get(bundled.variant.editId) : undefined,
      blobKey
    });
    variantMap.set(bundled.variant.id, id);
  }

  return rewriteBundledProject(project, assetMap, variantMap);
}

async function restoreLegacyNote(note: Note): Promise<Note> {
  const visibleImages = note.images || [];
  if (note.media?.length) {
    let imageIndex = 0;
    const media: NoteMediaItem[] = [];
    for (const item of note.media) {
      if (item.kind === 'image') {
        const visible = visibleImages[imageIndex++];
        if (item.source?.kind === 'remote') {
          media.push({ ...item, variantId: undefined, variantEnabled: undefined });
        } else if (visible?.startsWith('data:image/')) {
          media.push({ ...item, assetId: await saveImage(visible), source: { kind: 'local' }, variantId: undefined, variantEnabled: undefined });
        } else {
          media.push(item);
        }
      } else if (note.sketch?.startsWith('data:image/')) {
        media.push({ ...item, assetId: await saveSketch(note.sketch), source: { kind: 'local' }, variantId: undefined, variantEnabled: undefined });
      } else {
        media.push(item);
      }
    }
    const imageMedia = media.filter((item) => item.kind === 'image');
    const sketch = media.find((item) => item.kind === 'sketch');
    return {
      ...note,
      media,
      images: imageMedia.map((item) => item.source?.kind === 'remote' ? item.source.url : item.assetId),
      imageRefs: imageMedia.map((item) => ({
        assetId: item.assetId,
        source: item.source,
        variantId: item.variantId,
        variantEnabled: item.variantEnabled
      })),
      sketch: sketch?.assetId
    };
  }

  const imageRefs: NoteImageRef[] = [];
  for (const visible of visibleImages) {
    if (visible.startsWith('data:image/')) imageRefs.push({ assetId: await saveImage(visible), source: { kind: 'local' } });
    else if (/^https?:\/\//i.test(visible)) imageRefs.push({ assetId: visible, source: { kind: 'remote', url: visible, cacheStatus: 'none' } });
  }
  const sketch = note.sketch?.startsWith('data:image/') ? await saveSketch(note.sketch) : note.sketch;
  return {
    ...note,
    images: imageRefs.map((ref) => ref.source?.kind === 'remote' ? ref.source.url : ref.assetId),
    imageRefs,
    sketch
  };
}

/** Restores v2 media records; v1 files fall back to their embedded visible pixels. */
export async function restoreFullProjectMedia(data: unknown): Promise<Project> {
  const root = data as { project: Project; mediaBundle?: unknown };
  if (isFullProjectMediaBundle(root.mediaBundle)) {
    return restoreBundledProject(root.project, root.mediaBundle);
  }
  return {
    ...root.project,
    notes: await Promise.all((root.project.notes || []).map(restoreLegacyNote))
  };
}

