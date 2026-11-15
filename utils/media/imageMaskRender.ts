/**
 * Asset + Mask 非破坏渲染：优先 clip；需要时再 rasterize 为透明 PNG。
 * 有套索/多边形时裁到内容包围盒，展示不再沿用原图宽高。
 */
import type { ImageEdit, ImageMask, ImageOperation, NormPoint } from '../../types';
import { blobToDataUrl, dataUrlToBlob, IMAGE_PREFIX, SKETCH_PREFIX, isMediaRefId, loadMediaDataUrl } from '../persistence/imageAssetStore';
import {
  loadImageEdit,
  loadImageVariant,
  loadMaskBitmapBlob,
  loadVariantRasterBlob,
  saveImageVariant,
  saveVariantRasterBlob
} from '../persistence/imageVariantStore';

async function loadAssetOrSketchDataUrl(assetId: string): Promise<string | null> {
  const asImage = await loadMediaDataUrl(IMAGE_PREFIX, assetId, {
    upgradeLegacy: true,
    kind: 'image'
  });
  if (asImage) return asImage;
  return loadMediaDataUrl(SKETCH_PREFIX, assetId, {
    upgradeLegacy: true,
    kind: 'sketch'
  });
}

function loadHtmlImage(src: string, timeoutMs = 20000): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timer = window.setTimeout(() => {
      img.onload = null;
      img.onerror = null;
      reject(new Error('Timed out loading image for mask render'));
    }, timeoutMs);
    img.onload = () => {
      window.clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error('Failed to load image for mask render'));
    };
    img.src = src;
  });
}

/** 从 Edit.operations 提取有效多边形遮罩（lasso / mask.polygon） */
export function polygonMaskFromOperations(operations: ImageOperation[]): NormPoint[] | null {
  for (let i = operations.length - 1; i >= 0; i--) {
    const op = operations[i];
    if (op.type === 'lasso' && op.points.length >= 3) return op.points;
    if (op.type === 'mask' && op.mask.type === 'polygon' && op.mask.points.length >= 3) {
      return op.mask.points;
    }
  }
  return null;
}

/** 归一化点 → 像素包围盒（含 padding，不超出画布） */
export function pixelBoundsFromNormPoints(
  points: NormPoint[],
  width: number,
  height: number,
  padding = 2
): { x: number; y: number; w: number; h: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [nx, ny] of points) {
    const x = nx * width;
    const y = ny * height;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    return { x: 0, y: 0, w: width, h: height };
  }
  const x = Math.max(0, Math.floor(minX - padding));
  const y = Math.max(0, Math.floor(minY - padding));
  const x2 = Math.min(width, Math.ceil(maxX + padding));
  const y2 = Math.min(height, Math.ceil(maxY + padding));
  return { x, y, w: Math.max(1, x2 - x), h: Math.max(1, y2 - y) };
}

export function buildCanvasPathFromNormPoints(
  ctx: CanvasRenderingContext2D,
  points: NormPoint[],
  width: number,
  height: number
): Path2D {
  const path = new Path2D();
  if (points.length === 0) return path;
  path.moveTo(points[0][0] * width, points[0][1] * height);
  for (let i = 1; i < points.length; i++) {
    path.lineTo(points[i][0] * width, points[i][1] * height);
  }
  path.closePath();
  return path;
}

/** SVG path `d`（像素坐标），供 clipPath 使用 */
export function normPointsToSvgPathD(points: NormPoint[], width: number, height: number): string {
  if (points.length === 0) return '';
  const parts = points.map((p, i) => {
    const x = p[0] * width;
    const y = p[1] * height;
    return `${i === 0 ? 'M' : 'L'}${x},${y}`;
  });
  return `${parts.join(' ')} Z`;
}

async function applyBitmapMask(
  ctx: CanvasRenderingContext2D,
  mask: Extract<ImageMask, { type: 'bitmap' | 'ai' }>,
  width: number,
  height: number
): Promise<void> {
  const blob = await loadMaskBitmapBlob(mask.maskBlobKey);
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  try {
    const maskImg = await loadHtmlImage(url);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(maskImg, 0, 0, width, height);
    ctx.globalCompositeOperation = 'source-over';
  } finally {
    URL.revokeObjectURL(url);
  }
}

function alphaBounds(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  padding = 2
): { x: number; y: number; w: number; h: number } {
  const pixels = ctx.getImageData(0, 0, width, height).data;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pixels[(y * width + x) * 4 + 3] <= 4) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX || maxY < minY) return { x: 0, y: 0, w: 1, h: 1 };
  const x = Math.max(0, minX - padding);
  const y = Math.max(0, minY - padding);
  const x2 = Math.min(width, maxX + padding + 1);
  const y2 = Math.min(height, maxY + padding + 1);
  return { x, y, w: Math.max(1, x2 - x), h: Math.max(1, y2 - y) };
}

function cropCanvasToBounds(
  source: HTMLCanvasElement | OffscreenCanvas,
  bounds: { x: number; y: number; w: number; h: number }
): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = bounds.w;
  out.height = bounds.h;
  const ctx = out.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  ctx.clearRect(0, 0, bounds.w, bounds.h);
  ctx.drawImage(
    source as CanvasImageSource,
    bounds.x,
    bounds.y,
    bounds.w,
    bounds.h,
    0,
    0,
    bounds.w,
    bounds.h
  );
  return out;
}

/**
 * 将原图按 Edit 画到 canvas（非破坏合成）。
 * 有 polygon 时用 clip，并裁到贴纸包围盒（透明底）。
 */
export async function renderEditToCanvas(
  assetDataUrl: string,
  edit: ImageEdit,
  canvas?: HTMLCanvasElement | OffscreenCanvas
): Promise<HTMLCanvasElement | OffscreenCanvas> {
  const img = await loadHtmlImage(assetDataUrl);
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  const out =
    canvas ??
    Object.assign(document.createElement('canvas'), { width, height });
  if ('width' in out) {
    out.width = width;
    out.height = height;
  }

  const ctx = out.getContext('2d') as CanvasRenderingContext2D | null;
  if (!ctx) throw new Error('2d context unavailable');

  ctx.clearRect(0, 0, width, height);

  const poly = polygonMaskFromOperations(edit.operations);
  let outlinePad = 0;
  if (poly) {
    const path = buildCanvasPathFromNormPoints(ctx, poly, width, height);
    ctx.save();
    ctx.clip(path);
    ctx.drawImage(img, 0, 0, width, height);
    ctx.restore();
  } else {
    ctx.drawImage(img, 0, 0, width, height);
  }

  for (const op of edit.operations) {
    if (op.type === 'outline' && poly) {
      outlinePad = Math.max(outlinePad, Math.ceil(op.width));
      const path = buildCanvasPathFromNormPoints(ctx, poly, width, height);
      ctx.save();
      ctx.strokeStyle = op.color || '#ffffff';
      ctx.lineWidth = op.width;
      ctx.lineJoin = 'round';
      ctx.stroke(path);
      ctx.restore();
    }
  }

  let hasBitmapMask = false;
  for (const op of edit.operations) {
    if (op.type === 'mask' && (op.mask.type === 'bitmap' || op.mask.type === 'ai')) {
      hasBitmapMask = true;
      await applyBitmapMask(ctx, op.mask, width, height);
    }
  }

  if (poly) {
    const bounds = pixelBoundsFromNormPoints(poly, width, height, Math.max(2, outlinePad + 1));
    return cropCanvasToBounds(out, bounds);
  }

  if (hasBitmapMask) {
    return cropCanvasToBounds(out, alphaBounds(ctx, width, height));
  }

  return out;
}

async function canvasToPngBlob(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<Blob> {
  if (canvas instanceof HTMLCanvasElement) {
    const dataUrl = canvas.toDataURL('image/png');
    return dataUrlToBlob(dataUrl);
  }
  return canvas.convertToBlob({ type: 'image/png' });
}

/** 解析 Variant 为可展示的 data URL：有缓存 Blob 则用之，否则按 Edit 虚渲染（可选写回缓存） */
export async function resolveVariantDisplayUrl(
  variantId: string,
  opts?: { rasterizeIfMissing?: boolean; forceRerender?: boolean }
): Promise<string | null> {
  const variant = await loadImageVariant(variantId);
  if (!variant) return null;

  if (variant.blobKey && !opts?.forceRerender) {
    const needsTightUpgrade = variant.kind === 'sticker' && variant.layout !== 'tight';
    if (!needsTightUpgrade) {
      const blob = await loadVariantRasterBlob(variant.blobKey);
      if (blob) return blobToDataUrl(blob);
    }
  }

  const assetUrl = await loadAssetOrSketchDataUrl(variant.assetId);
  if (!assetUrl) return null;

  if (!variant.editId) {
    return assetUrl;
  }

  const edit = await loadImageEdit(variant.editId);
  if (!edit) return assetUrl;

  const canvas = await renderEditToCanvas(assetUrl, edit);
  const blob = await canvasToPngBlob(canvas);
  const dataUrl = await blobToDataUrl(blob);

  if (opts?.rasterizeIfMissing || opts?.forceRerender || variant.kind === 'sticker') {
    const key = await saveVariantRasterBlob(variant.id, blob);
    await saveImageVariant({
      ...variant,
      blobKey: key,
      width: 'width' in canvas ? canvas.width : undefined,
      height: 'height' in canvas ? canvas.height : undefined,
      layout: edit.operations.some((op) => op.type === 'lasso' || op.type === 'mask') ? 'tight' : variant.layout
    });
  }

  return dataUrl;
}

/** 按 NoteImageRef 解析展示 URL：优先 Variant（且未关闭），否则 Asset */
export async function resolveNoteImageRefUrl(ref: {
  assetId: string;
  variantId?: string;
  variantEnabled?: boolean;
}): Promise<string | null> {
  if (ref.variantId && ref.variantEnabled !== false) {
    const fromVariant = await resolveVariantDisplayUrl(ref.variantId, { rasterizeIfMissing: true });
    if (fromVariant) return fromVariant;
  }
  if (!isMediaRefId(ref.assetId)) return null;
  return loadAssetOrSketchDataUrl(ref.assetId);
}
