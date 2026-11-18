import { get, set } from 'idb-keyval';
import type { ImageEdit, ImageVariant, NoteImageRef } from '../../types';
import { createStickerVariantFromOperations, loadImageVariant, saveMaskBitmapBlob } from '../persistence/imageVariantStore';
import { removeImageBackground } from './backgroundRemovalClient';
import { loadCutoutResource } from '../resources/featureResources';

const AUTO_MASK_MODEL = 'BritishWerewolf/U-2-Netp';
const AUTO_MASK_VERSION = 'u2netp-sticker-forge-v1';
const AUTO_MASK_CACHE_PREFIX = 'mapp-auto-mask-cache-';
const ALPHA_THRESHOLD = 4;

type AutoMaskProgress = {
  status: 'checking' | 'downloading' | 'processing' | 'saving';
  progress?: number;
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('无法读取图片'));
    image.src = src;
  });
}

async function imagePixels(src: string): Promise<ImageData> {
  const image = await loadImage(src);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('无法创建图片处理画布');
  context.drawImage(image, 0, 0, width, height);
  return context.getImageData(0, 0, width, height);
}

function containsUsefulTransparency(data: Uint8ClampedArray): boolean {
  let transparent = 0;
  const pixelCount = data.length / 4;
  const sampleStep = Math.max(1, Math.floor(pixelCount / 120_000));
  let sampled = 0;
  for (let pixel = 0; pixel < pixelCount; pixel += sampleStep) {
    sampled += 1;
    if (data[pixel * 4 + 3] < 250) transparent += 1;
  }
  return sampled > 0 && transparent / sampled >= 0.002;
}

async function alphaMaskBlob(
  width: number,
  height: number,
  rgba: Uint8ClampedArray,
  preserveSourceAlpha: boolean
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('无法创建蒙版画布');
  const mask = context.createImageData(width, height);
  for (let i = 0; i < width * height; i += 1) {
    const alpha = rgba[i * 4 + 3];
    mask.data[i * 4] = 255;
    mask.data[i * 4 + 1] = 255;
    mask.data[i * 4 + 2] = 255;
    // 已透明图片只需要几何蒙版，避免把半透明边缘重复相乘。
    mask.data[i * 4 + 3] = preserveSourceAlpha ? (alpha > ALPHA_THRESHOLD ? 255 : 0) : alpha;
  }
  context.putImageData(mask, 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('无法生成蒙版')), 'image/png');
  });
}

export async function createAutoBackgroundRemovalSticker(options: {
  assetId: string;
  imageSrc: string;
  onProgress?: (progress: AutoMaskProgress) => void;
}): Promise<{ edit: ImageEdit; variant: ImageVariant; ref: NoteImageRef; reused: boolean }> {
  const cacheKey = `${AUTO_MASK_CACHE_PREFIX}${AUTO_MASK_VERSION}-${options.assetId}`;
  const cachedVariantId = await get<string>(cacheKey);
  if (cachedVariantId) {
    const cachedVariant = await loadImageVariant(cachedVariantId);
    if (cachedVariant) {
      return {
        edit: {
          id: cachedVariant.editId || '',
          assetId: options.assetId,
          operations: [],
          createdAt: cachedVariant.createdAt,
          updatedAt: cachedVariant.createdAt
        },
        variant: cachedVariant,
        ref: { assetId: options.assetId, variantId: cachedVariant.id, variantEnabled: true },
        reused: true
      };
    }
  }

  options.onProgress?.({ status: 'checking' });
  const sourcePixels = await imagePixels(options.imageSrc);
  const hasAlpha = containsUsefulTransparency(sourcePixels.data);
  let maskBlob: Blob;
  let model = 'source-alpha';

  if (hasAlpha) {
    maskBlob = await alphaMaskBlob(sourcePixels.width, sourcePixels.height, sourcePixels.data, true);
  } else {
    options.onProgress?.({ status: 'downloading' });
    await loadCutoutResource();
    const result = await removeImageBackground(options.imageSrc, ({ phase, progress }) => {
      options.onProgress?.({
        status: phase === 'loading' ? 'downloading' : 'processing',
        progress: progress == null ? undefined : Math.max(0, Math.min(1, progress / 100))
      });
    });
    maskBlob = await alphaMaskBlob(result.width, result.height, result.pixels, false);
    model = AUTO_MASK_MODEL;
  }

  options.onProgress?.({ status: 'saving' });
  const maskId = `mask-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const maskBlobKey = await saveMaskBitmapBlob(maskId, maskBlob);
  const { edit, variant } = await createStickerVariantFromOperations({
    assetId: options.assetId,
    operations: [{ type: 'mask', mask: { type: 'ai', maskBlobKey, model } }],
    kind: 'sticker'
  });
  await set(cacheKey, variant.id);
  return {
    edit,
    variant,
    ref: { assetId: options.assetId, variantId: variant.id, variantEnabled: true },
    reused: false
  };
}

export type { AutoMaskProgress };
