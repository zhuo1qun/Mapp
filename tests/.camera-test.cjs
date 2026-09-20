var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// utils/persistence/imageAssetStore.ts
function generateMediaId() {
  return `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
function isMediaRefId(value) {
  return typeof value === "string" && value.startsWith("img-");
}
function extractMediaId(imageData) {
  if (isMediaRefId(imageData)) return imageData;
  return null;
}
function syncNoteImageRefs(note) {
  const existingByAsset = new Map(
    (note.imageRefs || []).filter((r) => isMediaRefId(r.assetId)).map((r) => [r.assetId, r])
  );
  const ids = (note.images || []).filter(isMediaRefId);
  const fromRefs = [...existingByAsset.keys()];
  const merged = ids.length > 0 ? ids : fromRefs;
  const unique = [...new Set(merged)];
  return {
    ...note,
    images: unique,
    imageRefs: unique.map((assetId) => existingByAsset.get(assetId) ?? { assetId })
  };
}
async function dataUrlToBlob(dataUrl) {
  const res = await fetch(dataUrl);
  return res.blob();
}
async function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("blobToDataUrl failed"));
    reader.readAsDataURL(blob);
  });
}
async function probeImageSize(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const dims = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth || 0, height: img.naturalHeight || 0 });
      img.onerror = () => reject(new Error("image probe failed"));
      img.src = url;
    });
    return dims;
  } catch {
    return { width: 0, height: 0 };
  } finally {
    URL.revokeObjectURL(url);
  }
}
function parseDataUrlMime(dataUrl) {
  const m = /^data:([^;,]+)/i.exec(dataUrl);
  return m?.[1] || "image/png";
}
async function hashMediaPayload(payload) {
  let hashInput = payload;
  if (payload.length > 2e3) {
    const start = payload.substring(0, 500);
    const middle = payload.substring(
      Math.floor(payload.length / 2) - 250,
      Math.floor(payload.length / 2) + 250
    );
    const end = payload.substring(payload.length - 500);
    hashInput = `${start}${middle}${end}${payload.length}`;
  }
  const encoder = new TextEncoder();
  const data = encoder.encode(hashInput);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
function isStoredImageRecordV1(value) {
  return !!value && typeof value === "object" && value.v === 1 && value.blob instanceof Blob && !!value.asset;
}
async function storedValueToDataUrl(value) {
  if (typeof value === "string") {
    if (value.startsWith("data:image/")) return value;
    return null;
  }
  if (isStoredImageRecordV1(value)) {
    return blobToDataUrl(value.blob);
  }
  if (value && typeof value === "object" && typeof value.data === "string") {
    const d = value.data;
    return d.startsWith("data:image/") ? d : null;
  }
  return null;
}
async function loadMediaDataUrl(prefix, id, opts) {
  const key = `${prefix}${id}`;
  const raw = await (0, import_idb_keyval.get)(key);
  if (raw == null) return null;
  if (isStoredImageRecordV1(raw)) {
    return blobToDataUrl(raw.blob);
  }
  const dataUrl = await storedValueToDataUrl(raw);
  if (!dataUrl) return null;
  if (opts?.upgradeLegacy) {
    try {
      await writeMediaRecordFromDataUrl(prefix, id, dataUrl, {
        kind: opts.kind ?? (prefix === SKETCH_PREFIX ? "sketch" : "image"),
        existingId: id
      });
    } catch (err) {
      console.warn(`Failed to upgrade legacy media ${id}:`, err);
    }
  }
  return dataUrl;
}
async function writeMediaRecordFromDataUrl(prefix, id, dataUrl, opts) {
  if (!dataUrl.startsWith("data:image/")) {
    throw new Error("Invalid image data: not a valid data URL");
  }
  const blob = await dataUrlToBlob(dataUrl);
  const mime = blob.type || parseDataUrlMime(dataUrl);
  const { width, height } = await probeImageSize(blob);
  const contentHash = opts.contentHash ?? await hashMediaPayload(dataUrl);
  const asset = {
    id,
    mime,
    width,
    height,
    size: blob.size,
    createdAt: Date.now(),
    filename: opts.filename,
    contentHash
  };
  const record = {
    v: 1,
    kind: opts.kind,
    asset,
    blob
  };
  await (0, import_idb_keyval.set)(`${prefix}${id}`, record);
  return asset;
}
async function findMediaIdByContentHash(prefix, contentHash) {
  const allKeys = await (0, import_idb_keyval.keys)();
  const mediaKeys = allKeys.filter(
    (key) => typeof key === "string" && key.startsWith(prefix)
  );
  for (const key of mediaKeys) {
    try {
      const raw = await (0, import_idb_keyval.get)(key);
      if (!raw) continue;
      if (isStoredImageRecordV1(raw)) {
        if (raw.asset.contentHash === contentHash) {
          return key.slice(prefix.length);
        }
        continue;
      }
      const dataUrl = await storedValueToDataUrl(raw);
      if (!dataUrl) continue;
      const h = await hashMediaPayload(dataUrl);
      if (h === contentHash) return key.slice(prefix.length);
    } catch {
      continue;
    }
  }
  return null;
}
var import_idb_keyval, IMAGE_PREFIX, SKETCH_PREFIX;
var init_imageAssetStore = __esm({
  "utils/persistence/imageAssetStore.ts"() {
    import_idb_keyval = require("idb-keyval");
    IMAGE_PREFIX = "mapp-image-";
    SKETCH_PREFIX = "mapp-sketch-";
  }
});

// utils/persistence/mediaDisplay.ts
var mediaDisplay_exports = {};
__export(mediaDisplay_exports, {
  isDisplayableImageSrc: () => isDisplayableImageSrc,
  isImageRefCropActive: () => isImageRefCropActive,
  isMediaItemCropActive: () => isMediaItemCropActive,
  noteHasActiveFirstMediaCrop: () => noteHasActiveFirstMediaCrop,
  noteHasBoardMedia: () => noteHasBoardMedia,
  noteHasBoardTextContent: () => noteHasBoardTextContent,
  noteNeedsMediaResolve: () => noteNeedsMediaResolve,
  noteRendersAsBoardSticker: () => noteRendersAsBoardSticker
});
function isDisplayableImageSrc(src) {
  if (!src) return false;
  if (isMediaRefId(src)) return false;
  return src.startsWith("data:image/") || src.startsWith("blob:") || src.startsWith("http://") || src.startsWith("https://");
}
function isImageRefCropActive(ref) {
  return !!ref?.variantId && ref.variantEnabled !== false;
}
function isMediaItemCropActive(item) {
  return isImageRefCropActive(item);
}
function noteHasActiveFirstMediaCrop(note) {
  if (note.media && note.media.length > 0) {
    return isMediaItemCropActive(note.media[0]);
  }
  return isImageRefCropActive(note.imageRefs?.[0]);
}
function noteHasBoardTextContent(note) {
  const text = note.text || "";
  const firstNewline = text.indexOf("\n");
  const rawTitle = firstNewline === -1 ? text : text.slice(0, firstNewline);
  const detail = firstNewline === -1 ? "" : text.slice(firstNewline + 1);
  const title = rawTitle.replace(/^#+\s+/, "").trim();
  return title.length > 0 || detail.trim().length > 0;
}
function noteHasBoardMedia(note) {
  return Boolean(
    note.media?.length || note.imageRefs?.length || note.images?.length || note.sketch
  );
}
function noteRendersAsBoardSticker(note) {
  return !noteHasBoardTextContent(note) && noteHasBoardMedia(note);
}
function noteNeedsMediaResolve(note) {
  if (note.media && note.media.length > 0) {
    if (note.media.some((m) => isMediaRefId(m.assetId))) return true;
    return false;
  }
  if ((note.images || []).some(isMediaRefId)) return true;
  if (note.sketch && isMediaRefId(note.sketch)) return true;
  const refs = note.imageRefs || [];
  if (refs.length === 0) return false;
  const images = note.images || [];
  if (images.length < refs.length) return true;
  if (images.some((img) => !isDisplayableImageSrc(img))) return true;
  return false;
}
var init_mediaDisplay = __esm({
  "utils/persistence/mediaDisplay.ts"() {
    init_imageAssetStore();
  }
});

// utils/persistence/imageVariantStore.ts
function generateEditId() {
  return `ied-${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
function generateVariantId() {
  return `ivar-${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
async function saveImageEdit(edit) {
  const next = {
    ...edit,
    updatedAt: Date.now()
  };
  await (0, import_idb_keyval2.set)(`${IMAGE_EDIT_PREFIX}${next.id}`, next);
  return next;
}
async function loadImageEdit(editId) {
  const data = await (0, import_idb_keyval2.get)(`${IMAGE_EDIT_PREFIX}${editId}`);
  return data ?? null;
}
async function saveImageVariant(variant) {
  await (0, import_idb_keyval2.set)(`${IMAGE_VARIANT_PREFIX}${variant.id}`, variant);
  return variant;
}
async function loadImageVariant(variantId) {
  const data = await (0, import_idb_keyval2.get)(`${IMAGE_VARIANT_PREFIX}${variantId}`);
  return data ?? null;
}
async function saveVariantRasterBlob(variantId, blob) {
  const key = `${IMAGE_VARIANT_BLOB_PREFIX}${variantId}`;
  await (0, import_idb_keyval2.set)(key, blob);
  return key;
}
async function loadVariantRasterBlob(variantIdOrKey) {
  const key = variantIdOrKey.startsWith(IMAGE_VARIANT_BLOB_PREFIX) ? variantIdOrKey : `${IMAGE_VARIANT_BLOB_PREFIX}${variantIdOrKey}`;
  const blob = await (0, import_idb_keyval2.get)(key);
  return blob instanceof Blob ? blob : null;
}
async function loadMaskBitmapBlob(maskBlobKey) {
  const key = maskBlobKey.startsWith(IMAGE_MASK_BLOB_PREFIX) ? maskBlobKey : `${IMAGE_MASK_BLOB_PREFIX}${maskBlobKey}`;
  const blob = await (0, import_idb_keyval2.get)(key);
  return blob instanceof Blob ? blob : null;
}
async function createStickerVariantFromOperations(opts) {
  const now = Date.now();
  const edit = {
    id: generateEditId(),
    assetId: opts.assetId,
    operations: opts.operations,
    createdAt: now,
    updatedAt: now
  };
  await saveImageEdit(edit);
  const variant = {
    id: generateVariantId(),
    assetId: opts.assetId,
    kind: opts.kind ?? "sticker",
    editId: edit.id,
    createdAt: now
  };
  await saveImageVariant(variant);
  return { edit, variant };
}
var import_idb_keyval2, IMAGE_EDIT_PREFIX, IMAGE_VARIANT_PREFIX, IMAGE_VARIANT_BLOB_PREFIX, IMAGE_MASK_BLOB_PREFIX;
var init_imageVariantStore = __esm({
  "utils/persistence/imageVariantStore.ts"() {
    import_idb_keyval2 = require("idb-keyval");
    init_imageAssetStore();
    IMAGE_EDIT_PREFIX = "mapp-image-edit-";
    IMAGE_VARIANT_PREFIX = "mapp-image-variant-";
    IMAGE_VARIANT_BLOB_PREFIX = "mapp-variant-blob-";
    IMAGE_MASK_BLOB_PREFIX = "mapp-mask-blob-";
  }
});

// utils/media/imageMaskRender.ts
var imageMaskRender_exports = {};
__export(imageMaskRender_exports, {
  buildCanvasPathFromNormPoints: () => buildCanvasPathFromNormPoints,
  normPointsToSvgPathD: () => normPointsToSvgPathD,
  pixelBoundsFromNormPoints: () => pixelBoundsFromNormPoints,
  polygonMaskFromOperations: () => polygonMaskFromOperations,
  renderEditToCanvas: () => renderEditToCanvas,
  resolveNoteImageRefUrl: () => resolveNoteImageRefUrl,
  resolveVariantDisplayUrl: () => resolveVariantDisplayUrl
});
async function loadAssetOrSketchDataUrl(assetId) {
  const asImage = await loadMediaDataUrl(IMAGE_PREFIX, assetId, {
    upgradeLegacy: true,
    kind: "image"
  });
  if (asImage) return asImage;
  return loadMediaDataUrl(SKETCH_PREFIX, assetId, {
    upgradeLegacy: true,
    kind: "sketch"
  });
}
function loadHtmlImage(src, timeoutMs = 2e4) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timer = window.setTimeout(() => {
      img.onload = null;
      img.onerror = null;
      reject(new Error("Timed out loading image for mask render"));
    }, timeoutMs);
    img.onload = () => {
      window.clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error("Failed to load image for mask render"));
    };
    img.src = src;
  });
}
function polygonMaskFromOperations(operations) {
  for (let i = operations.length - 1; i >= 0; i--) {
    const op = operations[i];
    if (op.type === "lasso" && op.points.length >= 3) return op.points;
    if (op.type === "mask" && op.mask.type === "polygon" && op.mask.points.length >= 3) {
      return op.mask.points;
    }
  }
  return null;
}
function pixelBoundsFromNormPoints(points, width, height, padding = 2) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [nx, ny] of points) {
    const x3 = nx * width;
    const y3 = ny * height;
    minX = Math.min(minX, x3);
    minY = Math.min(minY, y3);
    maxX = Math.max(maxX, x3);
    maxY = Math.max(maxY, y3);
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
function buildCanvasPathFromNormPoints(ctx, points, width, height) {
  const path = new Path2D();
  if (points.length === 0) return path;
  path.moveTo(points[0][0] * width, points[0][1] * height);
  for (let i = 1; i < points.length; i++) {
    path.lineTo(points[i][0] * width, points[i][1] * height);
  }
  path.closePath();
  return path;
}
function normPointsToSvgPathD(points, width, height) {
  if (points.length === 0) return "";
  const parts = points.map((p, i) => {
    const x = p[0] * width;
    const y = p[1] * height;
    return `${i === 0 ? "M" : "L"}${x},${y}`;
  });
  return `${parts.join(" ")} Z`;
}
async function applyBitmapMask(ctx, mask, width, height) {
  const blob = await loadMaskBitmapBlob(mask.maskBlobKey);
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  try {
    const maskImg = await loadHtmlImage(url);
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(maskImg, 0, 0, width, height);
    ctx.globalCompositeOperation = "source-over";
  } finally {
    URL.revokeObjectURL(url);
  }
}
function cropCanvasToBounds(source, bounds) {
  const out = document.createElement("canvas");
  out.width = bounds.w;
  out.height = bounds.h;
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");
  ctx.clearRect(0, 0, bounds.w, bounds.h);
  ctx.drawImage(
    source,
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
async function renderEditToCanvas(assetDataUrl, edit, canvas) {
  const img = await loadHtmlImage(assetDataUrl);
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  const out = canvas ?? Object.assign(document.createElement("canvas"), { width, height });
  if ("width" in out) {
    out.width = width;
    out.height = height;
  }
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");
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
    if (op.type === "outline" && poly) {
      outlinePad = Math.max(outlinePad, Math.ceil(op.width));
      const path = buildCanvasPathFromNormPoints(ctx, poly, width, height);
      ctx.save();
      ctx.strokeStyle = op.color || "#ffffff";
      ctx.lineWidth = op.width;
      ctx.lineJoin = "round";
      ctx.stroke(path);
      ctx.restore();
    }
  }
  for (const op of edit.operations) {
    if (op.type === "mask" && (op.mask.type === "bitmap" || op.mask.type === "ai")) {
      await applyBitmapMask(ctx, op.mask, width, height);
    }
  }
  if (poly) {
    const bounds = pixelBoundsFromNormPoints(poly, width, height, Math.max(2, outlinePad + 1));
    return cropCanvasToBounds(out, bounds);
  }
  return out;
}
async function canvasToPngBlob(canvas) {
  if (canvas instanceof HTMLCanvasElement) {
    const dataUrl = canvas.toDataURL("image/png");
    return dataUrlToBlob(dataUrl);
  }
  return canvas.convertToBlob({ type: "image/png" });
}
async function resolveVariantDisplayUrl(variantId, opts) {
  const variant = await loadImageVariant(variantId);
  if (!variant) return null;
  if (variant.blobKey && !opts?.forceRerender) {
    const needsTightUpgrade = variant.kind === "sticker" && variant.layout !== "tight";
    if (!needsTightUpgrade) {
      const blob2 = await loadVariantRasterBlob(variant.blobKey);
      if (blob2) return blobToDataUrl(blob2);
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
  if (opts?.rasterizeIfMissing || opts?.forceRerender || variant.kind === "sticker") {
    const key = await saveVariantRasterBlob(variant.id, blob);
    await saveImageVariant({
      ...variant,
      blobKey: key,
      width: "width" in canvas ? canvas.width : void 0,
      height: "height" in canvas ? canvas.height : void 0,
      layout: polygonMaskFromOperations(edit.operations) ? "tight" : variant.layout
    });
  }
  return dataUrl;
}
async function resolveNoteImageRefUrl(ref) {
  if (ref.variantId && ref.variantEnabled !== false) {
    const fromVariant = await resolveVariantDisplayUrl(ref.variantId, { rasterizeIfMissing: true });
    if (fromVariant) return fromVariant;
  }
  if (!isMediaRefId(ref.assetId)) return null;
  return loadAssetOrSketchDataUrl(ref.assetId);
}
var init_imageMaskRender = __esm({
  "utils/media/imageMaskRender.ts"() {
    init_imageAssetStore();
    init_imageVariantStore();
  }
});

// tests/camera-flow.test.tsx
var import_auto = require("fake-indexeddb/auto");
var import_strict = __toESM(require("node:assert/strict"), 1);
var import_react4 = require("react");
var import_react_test_renderer = require("react-test-renderer");

// components/hooks/useMediaHandler.ts
var import_react = require("react");

// constants.ts
var EMOJI_CATEGORIES = {
  "Recent": ["\u{1F34B}", "\u{1F4CD}", "\u{1F3E0}", "\u{1F3E2}", "\u{1F333}", "\u2764\uFE0F", "\u2B50", "\u{1F374}", "\u2615", "\u{1F37A}", "\u{1F4F7}", "\u2708\uFE0F", "\u{1F6B4}", "\u{1F3C3}", "\u{1F3A8}", "\u{1F3B5}", "\u{1F6D2}", "\u{1F393}", "\u{1F4BC}", "\u{1F4A1}"],
  "Smileys & Emotion": ["\u{1F600}", "\u{1F603}", "\u{1F604}", "\u{1F601}", "\u{1F606}", "\u{1F605}", "\u{1F923}", "\u{1F602}", "\u{1F642}", "\u{1F643}", "\u{1F609}", "\u{1F60A}", "\u{1F607}", "\u{1F970}", "\u{1F60D}", "\u{1F929}", "\u{1F618}", "\u{1F617}", "\u{1F61A}", "\u{1F619}", "\u{1F60B}", "\u{1F61B}", "\u{1F61C}", "\u{1F92A}", "\u{1F61D}", "\u{1F911}", "\u{1F917}", "\u{1F92D}", "\u{1F92B}", "\u{1F914}", "\u{1F910}", "\u{1F928}", "\u{1F610}", "\u{1F611}", "\u{1F636}", "\u{1F60F}", "\u{1F612}", "\u{1F644}", "\u{1F62C}", "\u{1F925}", "\u{1F60C}", "\u{1F614}", "\u{1F62A}", "\u{1F924}", "\u{1F634}", "\u{1F637}", "\u{1F912}", "\u{1F915}", "\u{1F922}", "\u{1F92E}"],
  "Food & Drink": ["\u{1F34E}", "\u{1F34A}", "\u{1F34B}", "\u{1F34C}", "\u{1F349}", "\u{1F347}", "\u{1F353}", "\u{1F348}", "\u{1F352}", "\u{1F351}", "\u{1F96D}", "\u{1F34D}", "\u{1F965}", "\u{1F95D}", "\u{1F345}", "\u{1F346}", "\u{1F951}", "\u{1F966}", "\u{1F96C}", "\u{1F952}", "\u{1F336}\uFE0F", "\u{1F33D}", "\u{1F955}", "\u{1F954}", "\u{1F360}", "\u{1F950}", "\u{1F96F}", "\u{1F35E}", "\u{1F956}", "\u{1F968}", "\u{1F9C0}", "\u{1F95A}", "\u{1F373}", "\u{1F95E}", "\u{1F953}", "\u{1F969}", "\u{1F357}", "\u{1F356}", "\u{1F32D}", "\u{1F354}", "\u{1F35F}", "\u{1F355}", "\u{1F96A}", "\u{1F959}", "\u{1F32E}", "\u{1F32F}", "\u{1F957}", "\u{1F958}", "\u{1F96B}", "\u{1F35D}", "\u{1F35C}", "\u{1F372}", "\u{1F35B}", "\u{1F363}", "\u{1F371}", "\u{1F95F}", "\u{1F364}", "\u{1F359}", "\u{1F35A}", "\u{1F358}", "\u{1F365}", "\u{1F960}", "\u{1F362}", "\u{1F361}", "\u{1F367}", "\u{1F368}", "\u{1F366}", "\u{1F967}", "\u{1F370}", "\u{1F382}", "\u{1F36E}", "\u{1F36D}", "\u{1F36C}", "\u{1F36B}", "\u{1F37F}", "\u{1F369}", "\u{1F36A}", "\u{1F330}", "\u{1F95C}", "\u{1F36F}", "\u{1F95B}", "\u{1F37C}", "\u2615\uFE0F", "\u{1F375}", "\u{1F964}", "\u{1F376}", "\u{1F37A}", "\u{1F37B}", "\u{1F942}", "\u{1F377}", "\u{1F943}", "\u{1F378}", "\u{1F379}", "\u{1F37E}"],
  "Travel & Places": ["\u{1F697}", "\u{1F695}", "\u{1F699}", "\u{1F68C}", "\u{1F68E}", "\u{1F3CE}\uFE0F", "\u{1F693}", "\u{1F691}", "\u{1F692}", "\u{1F690}", "\u{1F69A}", "\u{1F69B}", "\u{1F69C}", "\u{1F6F4}", "\u{1F6B2}", "\u{1F6F5}", "\u{1F3CD}\uFE0F", "\u{1F6FA}", "\u{1F6A8}", "\u{1F694}", "\u{1F68D}", "\u{1F698}", "\u{1F696}", "\u{1F6A1}", "\u{1F6A0}", "\u{1F69F}", "\u{1F683}", "\u{1F68B}", "\u{1F69E}", "\u{1F69D}", "\u{1F684}", "\u{1F685}", "\u{1F688}", "\u{1F682}", "\u{1F686}", "\u{1F687}", "\u{1F68A}", "\u{1F689}", "\u2708\uFE0F", "\u{1F6EB}", "\u{1F6EC}", "\u{1F6E9}\uFE0F", "\u{1F4BA}", "\u{1F681}", "\u{1F69F}", "\u{1F680}", "\u{1F6F8}", "\u{1F6A4}", "\u26F5\uFE0F", "\u{1F6E5}\uFE0F", "\u{1F6F3}\uFE0F", "\u26F4\uFE0F", "\u{1F6A2}", "\u2693\uFE0F", "\u26FD\uFE0F", "\u{1F6A7}", "\u{1F6A6}", "\u{1F6A5}", "\u{1F5FA}\uFE0F", "\u{1F5FF}", "\u{1F5FD}", "\u{1F5FC}", "\u{1F3F0}", "\u{1F3EF}", "\u{1F3DF}\uFE0F", "\u{1F3A1}", "\u{1F3A2}", "\u{1F3A0}", "\u26F2\uFE0F", "\u26F1\uFE0F", "\u{1F3D6}\uFE0F", "\u{1F3DD}\uFE0F", "\u{1F3DC}\uFE0F", "\u{1F30B}", "\u26F0\uFE0F", "\u{1F3D4}\uFE0F", "\u{1F5FB}", "\u{1F3D5}\uFE0F", "\u26FA\uFE0F", "\u{1F3E0}", "\u{1F3E1}", "\u{1F3D8}\uFE0F", "\u{1F3DA}\uFE0F", "\u{1F3D7}\uFE0F", "\u{1F3ED}", "\u{1F3E2}", "\u{1F3EC}", "\u{1F3E3}", "\u{1F3E4}", "\u{1F3E5}", "\u{1F3E6}", "\u{1F3E8}", "\u{1F3EA}", "\u{1F3EB}", "\u{1F3E9}", "\u{1F492}", "\u{1F3DB}\uFE0F", "\u26EA\uFE0F", "\u{1F54C}", "\u{1F54D}", "\u{1F54B}", "\u26E9\uFE0F", "\u{1F6E4}\uFE0F", "\u{1F6E3}\uFE0F", "\u{1F5FE}", "\u{1F391}", "\u{1F3DE}\uFE0F", "\u{1F305}", "\u{1F304}", "\u{1F320}", "\u{1F387}", "\u{1F386}", "\u{1F307}", "\u{1F306}", "\u{1F3D9}\uFE0F", "\u{1F303}", "\u{1F30C}", "\u{1F309}", "\u{1F301}"],
  "Activities": ["\u26BD\uFE0F", "\u{1F3C0}", "\u{1F3C8}", "\u26BE\uFE0F", "\u{1F94E}", "\u{1F3BE}", "\u{1F3D0}", "\u{1F3C9}", "\u{1F94F}", "\u{1F3B1}", "\u{1F3D3}", "\u{1F3F8}", "\u{1F3D2}", "\u{1F3D1}", "\u{1F94D}", "\u{1F3CF}", "\u{1F945}", "\u26F3\uFE0F", "\u{1F3F9}", "\u{1F3A3}", "\u{1F94A}", "\u{1F94B}", "\u{1F3BD}", "\u{1F6F9}", "\u{1F6F7}", "\u26F8\uFE0F", "\u{1F94C}", "\u{1F3BF}", "\u26F7\uFE0F", "\u{1F3C2}", "\u{1F3CB}\uFE0F\u200D\u2640\uFE0F", "\u{1F3CB}\uFE0F", "\u{1F93C}\u200D\u2640\uFE0F", "\u{1F93C}\u200D\u2642\uFE0F", "\u{1F938}\u200D\u2640\uFE0F", "\u{1F938}\u200D\u2642\uFE0F", "\u26F9\uFE0F\u200D\u2640\uFE0F", "\u26F9\uFE0F", "\u{1F93A}", "\u{1F93E}\u200D\u2640\uFE0F", "\u{1F93E}\u200D\u2642\uFE0F", "\u{1F3CC}\uFE0F\u200D\u2640\uFE0F", "\u{1F3CC}\uFE0F", "\u{1F3C7}", "\u{1F9D8}\u200D\u2640\uFE0F", "\u{1F9D8}\u200D\u2642\uFE0F", "\u{1F3C4}\u200D\u2640\uFE0F", "\u{1F3C4}", "\u{1F3CA}\u200D\u2640\uFE0F", "\u{1F3CA}", "\u{1F93D}\u200D\u2640\uFE0F", "\u{1F93D}\u200D\u2642\uFE0F", "\u{1F6A3}\u200D\u2640\uFE0F", "\u{1F6A3}", "\u{1F9D7}\u200D\u2640\uFE0F", "\u{1F9D7}\u200D\u2642\uFE0F", "\u{1F6B5}\u200D\u2640\uFE0F", "\u{1F6B5}", "\u{1F6B4}\u200D\u2640\uFE0F", "\u{1F6B4}", "\u{1F3C3}\u200D\u2640\uFE0F", "\u{1F3C3}", "\u{1F3C3}\u200D\u2642\uFE0F", "\u{1F46B}", "\u{1F46D}", "\u{1F46C}", "\u{1F491}", "\u{1F469}\u200D\u2764\uFE0F\u200D\u{1F469}", "\u{1F468}\u200D\u2764\uFE0F\u200D\u{1F468}", "\u{1F48F}", "\u{1F469}\u200D\u2764\uFE0F\u200D\u{1F48B}\u200D\u{1F469}", "\u{1F468}\u200D\u2764\uFE0F\u200D\u{1F48B}\u200D\u{1F468}", "\u{1F46A}", "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}", "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466}", "\u{1F468}\u200D\u{1F469}\u200D\u{1F466}\u200D\u{1F466}", "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F467}", "\u{1F469}\u200D\u{1F469}\u200D\u{1F466}", "\u{1F469}\u200D\u{1F469}\u200D\u{1F467}", "\u{1F469}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466}", "\u{1F469}\u200D\u{1F469}\u200D\u{1F466}\u200D\u{1F466}", "\u{1F469}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F467}", "\u{1F468}\u200D\u{1F468}\u200D\u{1F466}", "\u{1F468}\u200D\u{1F468}\u200D\u{1F467}", "\u{1F468}\u200D\u{1F468}\u200D\u{1F467}\u200D\u{1F466}", "\u{1F468}\u200D\u{1F468}\u200D\u{1F466}\u200D\u{1F466}", "\u{1F468}\u200D\u{1F468}\u200D\u{1F467}\u200D\u{1F467}", "\u{1F469}\u200D\u{1F466}", "\u{1F469}\u200D\u{1F467}", "\u{1F469}\u200D\u{1F467}\u200D\u{1F466}", "\u{1F469}\u200D\u{1F466}\u200D\u{1F466}", "\u{1F469}\u200D\u{1F467}\u200D\u{1F467}", "\u{1F468}\u200D\u{1F466}", "\u{1F468}\u200D\u{1F467}", "\u{1F468}\u200D\u{1F467}\u200D\u{1F466}", "\u{1F468}\u200D\u{1F466}\u200D\u{1F466}", "\u{1F468}\u200D\u{1F467}\u200D\u{1F467}"],
  "Objects": ["\u231A\uFE0F", "\u{1F4F1}", "\u{1F4F2}", "\u{1F4BB}", "\u2328\uFE0F", "\u{1F5A5}\uFE0F", "\u{1F5A8}\uFE0F", "\u{1F5B1}\uFE0F", "\u{1F5B2}\uFE0F", "\u{1F579}\uFE0F", "\u{1F5DC}\uFE0F", "\u{1F4BE}", "\u{1F4BF}", "\u{1F4C0}", "\u{1F4FC}", "\u{1F4F7}", "\u{1F4F8}", "\u{1F4F9}", "\u{1F3A5}", "\u{1F4FD}\uFE0F", "\u{1F39E}\uFE0F", "\u{1F4DE}", "\u260E\uFE0F", "\u{1F4DF}", "\u{1F4E0}", "\u{1F4FA}", "\u{1F4FB}", "\u{1F399}\uFE0F", "\u{1F39A}\uFE0F", "\u{1F39B}\uFE0F", "\u23F1\uFE0F", "\u23F2\uFE0F", "\u23F0", "\u{1F570}\uFE0F", "\u231B\uFE0F", "\u23F3", "\u{1F4E1}", "\u{1F50B}", "\u{1F50C}", "\u{1F4A1}", "\u{1F526}", "\u{1F56F}\uFE0F", "\u{1FA94}", "\u{1F9EF}", "\u{1F6E2}\uFE0F", "\u{1F4B8}", "\u{1F4B5}", "\u{1F4B4}", "\u{1F4B6}", "\u{1F4B7}", "\u{1F4B0}", "\u{1F4B3}", "\u{1F48E}", "\u2696\uFE0F", "\u{1FA9C}", "\u{1F9F0}", "\u{1FA9B}", "\u{1F527}", "\u{1F528}", "\u2692\uFE0F", "\u{1F6E0}\uFE0F", "\u26CF\uFE0F", "\u{1FA9A}", "\u{1F529}", "\u2699\uFE0F", "\u{1FAA4}", "\u{1F9F1}", "\u26D3\uFE0F", "\u{1F9F2}", "\u{1F52B}", "\u{1F4A3}", "\u{1F9E8}", "\u{1FA93}", "\u{1F52A}", "\u{1F5E1}\uFE0F", "\u2694\uFE0F", "\u{1F6E1}\uFE0F", "\u{1F6AC}", "\u26B0\uFE0F", "\u{1FAA6}", "\u26B1\uFE0F", "\u{1F3FA}", "\u{1F52E}", "\u{1F4FF}", "\u{1F9FF}", "\u{1F488}", "\u2697\uFE0F", "\u{1F52D}", "\u{1F52C}", "\u{1F573}\uFE0F", "\u{1FA79}", "\u{1FA7A}", "\u{1F48A}", "\u{1F489}", "\u{1FA78}", "\u{1F9EC}", "\u{1F9A0}", "\u{1F9EB}", "\u{1F9EA}", "\u{1F321}\uFE0F", "\u{1F9F9}", "\u{1FAA0}", "\u{1F9FA}", "\u{1F9FB}", "\u{1F6BD}", "\u{1F6B0}", "\u{1F6BF}", "\u{1F6C1}", "\u{1F6C0}", "\u{1F9FC}", "\u{1FAA5}", "\u{1FA92}", "\u{1F9FD}", "\u{1FAA3}", "\u{1F9F4}", "\u{1F6CE}\uFE0F", "\u{1F511}", "\u{1F5DD}\uFE0F", "\u{1F6AA}", "\u{1FA91}", "\u{1F6CB}\uFE0F", "\u{1F6CF}\uFE0F", "\u{1F6CC}", "\u{1F9F8}", "\u{1FA86}", "\u{1F5BC}\uFE0F", "\u{1FA9E}", "\u{1FA9F}", "\u{1F6CD}\uFE0F", "\u{1F6D2}", "\u{1F381}", "\u{1F388}", "\u{1F389}", "\u{1F38A}", "\u{1F380}", "\u{1F397}\uFE0F", "\u{1FA84}", "\u{1FA85}", "\u{1FAA1}", "\u{1F9F5}", "\u{1FAA2}"],
  "Symbols": ["\u2764\uFE0F", "\u{1F9E1}", "\u{1F49B}", "\u{1F49A}", "\u{1F499}", "\u{1F49C}", "\u{1F5A4}", "\u{1F90D}", "\u{1F90E}", "\u{1F494}", "\u2763\uFE0F", "\u{1F495}", "\u{1F49E}", "\u{1F493}", "\u{1F497}", "\u{1F496}", "\u{1F498}", "\u{1F49D}", "\u{1F49F}", "\u262E\uFE0F", "\u271D\uFE0F", "\u262A\uFE0F", "\u{1F549}\uFE0F", "\u2638\uFE0F", "\u2721\uFE0F", "\u{1F52F}", "\u{1F54E}", "\u262F\uFE0F", "\u2626\uFE0F", "\u{1F6D0}", "\u26CE", "\u2648\uFE0F", "\u2649\uFE0F", "\u264A\uFE0F", "\u264B\uFE0F", "\u264C\uFE0F", "\u264D\uFE0F", "\u264E\uFE0F", "\u264F\uFE0F", "\u2650\uFE0F", "\u2651\uFE0F", "\u2652\uFE0F", "\u2653\uFE0F", "\u{1F194}", "\u269B\uFE0F", "\u{1F251}", "\u2622\uFE0F", "\u2623\uFE0F", "\u{1F4F4}", "\u{1F4F3}", "\u{1F236}", "\u{1F21A}\uFE0F", "\u{1F238}", "\u{1F23A}", "\u{1F237}\uFE0F", "\u2734\uFE0F", "\u{1F19A}", "\u{1F4AE}", "\u{1F250}", "\u3299\uFE0F", "\u3297\uFE0F", "\u{1F234}", "\u{1F235}", "\u{1F239}", "\u{1F232}", "\u{1F170}\uFE0F", "\u{1F171}\uFE0F", "\u{1F18E}", "\u{1F191}", "\u{1F17E}\uFE0F", "\u{1F198}", "\u274C", "\u2B55\uFE0F", "\u{1F6D1}", "\u26D4\uFE0F", "\u{1F4DB}", "\u{1F6AB}", "\u{1F4AF}", "\u{1F4A2}", "\u2668\uFE0F", "\u{1F6B7}", "\u{1F6AF}", "\u{1F6B3}", "\u{1F6B1}", "\u{1F51E}", "\u{1F4F5}", "\u{1F6AD}", "\u2757\uFE0F", "\u2753", "\u2755", "\u2754", "\u203C\uFE0F", "\u2049\uFE0F", "\u{1F505}", "\u{1F506}", "\u303D\uFE0F", "\u26A0\uFE0F", "\u{1F6B8}", "\u{1F531}", "\u269C\uFE0F", "\u{1F530}", "\u267B\uFE0F", "\u2705", "\u{1F22F}\uFE0F", "\u{1F4B9}", "\u2747\uFE0F", "\u2733\uFE0F", "\u274E", "\u{1F310}", "\u{1F4A0}", "\u24C2\uFE0F", "\u{1F300}", "\u{1F4A4}", "\u{1F3E7}", "\u{1F6BE}", "\u267F\uFE0F", "\u{1F17F}\uFE0F", "\u{1F233}", "\u{1F202}\uFE0F", "\u{1F6C2}", "\u{1F6C3}", "\u{1F6C4}", "\u{1F6C5}", "\u{1F6B9}", "\u{1F6BA}", "\u{1F6BC}", "\u{1F6BB}", "\u{1F6AE}", "\u{1F3A6}", "\u{1F4F6}", "\u{1F201}", "\u{1F523}", "\u2139\uFE0F", "\u{1F524}", "\u{1F521}", "\u{1F520}", "\u{1F196}", "\u{1F197}", "\u{1F199}", "\u{1F192}", "\u{1F195}", "\u{1F193}", "0\uFE0F\u20E3", "1\uFE0F\u20E3", "2\uFE0F\u20E3", "3\uFE0F\u20E3", "4\uFE0F\u20E3", "5\uFE0F\u20E3", "6\uFE0F\u20E3", "7\uFE0F\u20E3", "8\uFE0F\u20E3", "9\uFE0F\u20E3", "\u{1F51F}", "\u{1F522}", "#\uFE0F\u20E3", "*\uFE0F\u20E3", "\u23CF\uFE0F", "\u25B6\uFE0F", "\u23F8\uFE0F", "\u23EF\uFE0F", "\u23F9\uFE0F", "\u23FA\uFE0F", "\u23ED\uFE0F", "\u23EE\uFE0F", "\u23E9\uFE0F", "\u23EA\uFE0F", "\u23EB", "\u23EC", "\u25C0\uFE0F", "\u{1F53C}", "\u{1F53D}", "\u27A1\uFE0F", "\u2B05\uFE0F", "\u2B06\uFE0F", "\u2B07\uFE0F", "\u2197\uFE0F", "\u2198\uFE0F", "\u2199\uFE0F", "\u2196\uFE0F", "\u2195\uFE0F", "\u2194\uFE0F", "\u21AA\uFE0F", "\u21A9\uFE0F", "\u2934\uFE0F", "\u2935\uFE0F", "\u{1F500}", "\u{1F501}", "\u{1F502}", "\u{1F504}", "\u{1F503}", "\u{1F3B5}", "\u{1F3B6}", "\u2795", "\u2796", "\u2797", "\u2716\uFE0F", "\u{1F4B2}", "\u{1F4B1}", "\u2122\uFE0F", "\xA9\uFE0F", "\xAE\uFE0F", "\u3030\uFE0F", "\u27B0", "\u27BF", "\u{1F51A}", "\u{1F519}", "\u{1F51B}", "\u{1F51C}", "\u{1F51D}", "\u{1F6D0}", "\u271D\uFE0F", "\u262A\uFE0F", "\u262E\uFE0F", "\u{1F549}\uFE0F", "\u2638\uFE0F", "\u2721\uFE0F", "\u{1F52F}", "\u{1F54E}", "\u262F\uFE0F", "\u2626\uFE0F", "\u{1F6D0}", "\u26CE", "\u2648\uFE0F", "\u2649\uFE0F", "\u264A\uFE0F", "\u264B\uFE0F", "\u264C\uFE0F", "\u264D\uFE0F", "\u264E\uFE0F", "\u264F\uFE0F", "\u2650\uFE0F", "\u2651\uFE0F", "\u2652\uFE0F", "\u2653\uFE0F", "\u{1F194}", "\u269B\uFE0F", "\u{1F251}", "\u2622\uFE0F", "\u2623\uFE0F", "\u{1F4F4}", "\u{1F4F3}", "\u{1F236}", "\u{1F21A}\uFE0F", "\u{1F238}", "\u{1F23A}", "\u{1F237}\uFE0F", "\u2734\uFE0F", "\u{1F19A}", "\u{1F4AE}", "\u{1F250}", "\u3299\uFE0F", "\u3297\uFE0F", "\u{1F234}", "\u{1F235}", "\u{1F239}", "\u{1F232}", "\u{1F170}\uFE0F", "\u{1F171}\uFE0F", "\u{1F18E}", "\u{1F191}", "\u{1F17E}\uFE0F", "\u{1F198}", "\u274C", "\u2B55\uFE0F", "\u{1F6D1}", "\u26D4\uFE0F", "\u{1F4DB}", "\u{1F6AB}", "\u{1F4AF}", "\u{1F4A2}", "\u2668\uFE0F", "\u{1F6B7}", "\u{1F6AF}", "\u{1F6B3}", "\u{1F6B1}", "\u{1F51E}", "\u{1F4F5}", "\u{1F6AD}", "\u2757\uFE0F", "\u2753", "\u2755", "\u2754", "\u203C\uFE0F", "\u2049\uFE0F", "\u{1F505}", "\u{1F506}", "\u303D\uFE0F", "\u26A0\uFE0F", "\u{1F6B8}", "\u{1F531}", "\u269C\uFE0F", "\u{1F530}", "\u267B\uFE0F", "\u2705", "\u{1F22F}\uFE0F", "\u{1F4B9}", "\u2747\uFE0F", "\u2733\uFE0F", "\u274E", "\u{1F310}", "\u{1F4A0}", "\u24C2\uFE0F", "\u{1F300}", "\u{1F4A4}", "\u{1F3E7}", "\u{1F6BE}", "\u267F\uFE0F", "\u{1F17F}\uFE0F", "\u{1F233}", "\u{1F202}\uFE0F", "\u{1F6C2}", "\u{1F6C3}", "\u{1F6C4}", "\u{1F6C5}", "\u{1F6B9}", "\u{1F6BA}", "\u{1F6BC}", "\u{1F6BB}", "\u{1F6AE}", "\u{1F3A6}", "\u{1F4F6}", "\u{1F201}", "\u{1F523}", "\u2139\uFE0F", "\u{1F524}", "\u{1F521}", "\u{1F520}", "\u{1F196}", "\u{1F197}", "\u{1F199}", "\u{1F192}", "\u{1F195}", "\u{1F193}", "0\uFE0F\u20E3", "1\uFE0F\u20E3", "2\uFE0F\u20E3", "3\uFE0F\u20E3", "4\uFE0F\u20E3", "5\uFE0F\u20E3", "6\uFE0F\u20E3", "7\uFE0F\u20E3", "8\uFE0F\u20E3", "9\uFE0F\u20E3", "\u{1F51F}", "\u{1F522}", "#\uFE0F\u20E3", "*\uFE0F\u20E3", "\u23CF\uFE0F", "\u25B6\uFE0F", "\u23F8\uFE0F", "\u23EF\uFE0F", "\u23F9\uFE0F", "\u23FA\uFE0F", "\u23ED\uFE0F", "\u23EE\uFE0F", "\u23E9\uFE0F", "\u23EA\uFE0F", "\u23EB", "\u23EC", "\u25C0\uFE0F", "\u{1F53C}", "\u{1F53D}", "\u27A1\uFE0F", "\u2B05\uFE0F", "\u2B06\uFE0F", "\u2B07\uFE0F", "\u2197\uFE0F", "\u2198\uFE0F", "\u2199\uFE0F", "\u2196\uFE0F", "\u2195\uFE0F", "\u2194\uFE0F", "\u21AA\uFE0F", "\u21A9\uFE0F", "\u2934\uFE0F", "\u2935\uFE0F", "\u{1F500}", "\u{1F501}", "\u{1F502}", "\u{1F504}", "\u{1F503}", "\u{1F3B5}", "\u{1F3B6}", "\u2795", "\u2796", "\u2797", "\u2716\uFE0F", "\u{1F4B2}", "\u{1F4B1}", "\u2122\uFE0F", "\xA9\uFE0F", "\xAE\uFE0F", "\u3030\uFE0F", "\u27B0", "\u27BF", "\u{1F51A}", "\u{1F519}", "\u{1F51B}", "\u{1F51C}", "\u{1F51D}"]
};
var EMOJI_LIST = EMOJI_CATEGORIES["Recent"];
var DEFAULT_THEME_COLOR = "#FFDD00";
var DEFAULT_THEME_COLOR_DARK = "#E6C300";
var getCurrentThemeColor = () => {
  try {
    const saved = localStorage.getItem("mapp-theme-color");
    return saved || DEFAULT_THEME_COLOR;
  } catch {
    return DEFAULT_THEME_COLOR;
  }
};
var getCurrentThemeColorDark = () => {
  try {
    const saved = localStorage.getItem("mapp-theme-color-dark");
    return saved || DEFAULT_THEME_COLOR_DARK;
  } catch {
    return DEFAULT_THEME_COLOR_DARK;
  }
};
var THEME_COLOR = getCurrentThemeColor();
var THEME_COLOR_DARK = getCurrentThemeColorDark();
var PROJECT_OPEN_OVERLAY_FADE_S = 0.2;
var PROJECT_OPEN_OVERLAY_FADE_MS = Math.round(PROJECT_OPEN_OVERLAY_FADE_S * 1e3);

// utils.ts
var import_html_to_image = require("html-to-image");

// utils/media/imageFileProcessing.ts
function isHeicImageFile(file) {
  const lowerName = file.name.toLowerCase();
  return file.type === "image/heic" || file.type === "image/heif" || lowerName.endsWith(".heic") || lowerName.endsWith(".heif");
}
var HEIC_CONVERSION_METHODS = [
  { toType: "image/jpeg", quality: 0.9, extension: ".jpg", mimeType: "image/jpeg" },
  { toType: "image/jpeg", quality: 0.8, extension: ".jpg", mimeType: "image/jpeg" },
  { toType: "image/png", quality: void 0, extension: ".png", mimeType: "image/png" }
];
async function convertHeicImageIfNeeded(file) {
  if (!isHeicImageFile(file)) return file;
  const heic2anyModule = await import("heic2any");
  const heic2any = heic2anyModule.default || heic2anyModule;
  let lastError = null;
  for (const method of HEIC_CONVERSION_METHODS) {
    try {
      const result = await heic2any({
        blob: file,
        toType: method.toType,
        ...method.quality === void 0 ? {} : { quality: method.quality }
      });
      const blob = Array.isArray(result) ? result[0] : result;
      if (!(blob instanceof Blob) || blob.size === 0) {
        throw new Error("Conversion returned empty result");
      }
      return new File([blob], file.name.replace(/\.(heic|heif)$/i, method.extension), {
        type: method.mimeType,
        lastModified: file.lastModified
      });
    } catch (error) {
      lastError = error;
    }
  }
  const message = lastError instanceof Error ? lastError.message : "Unknown error";
  if (message.includes("ERR_LIBHEIF") || message.includes("format not supported")) {
    throw new Error(
      "\u5F53\u524D\u6D4F\u89C8\u5668\u8F6C\u6362\u5668\u4E0D\u652F\u6301\u6B64 HEIC/HEIF \u6587\u4EF6\uFF0C\u8BF7\u5148\u5728\u7CFB\u7EDF\u76F8\u518C\u6216\u9884\u89C8\u5E94\u7528\u4E2D\u8F6C\u6362\u4E3A JPEG/PNG \u540E\u91CD\u8BD5\u3002"
    );
  }
  throw new Error(`HEIC/HEIF \u56FE\u7247\u8F6C\u6362\u5931\u8D25: ${message}

\u8BF7\u5C06\u56FE\u7247\u8F6C\u6362\u4E3A JPEG/PNG \u683C\u5F0F\u540E\u91CD\u8BD5\u3002`);
}

// utils.ts
var compressImage = (file, maxWidth = 1920, maxHeight = 1920, quality = 0.8) => {
  return new Promise(async (resolve, reject) => {
    try {
      const processedFile = await convertHeicImageIfNeeded(file);
      const reader = new FileReader();
      reader.readAsDataURL(processedFile);
      reader.onload = (e) => {
        const img = new Image();
        img.src = e.target?.result;
        img.onload = () => {
          const canvas = document.createElement("canvas");
          let width = img.width;
          let height = img.height;
          if (width > maxWidth || height > maxHeight) {
            const ratio = Math.min(maxWidth / width, maxHeight / height);
            width = width * ratio;
            height = height * ratio;
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("Could not get canvas context"));
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          const preservesAlpha = /image\/(png|webp|gif)/i.test(processedFile.type);
          const compressedDataUrl = preservesAlpha ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", quality);
          resolve(compressedDataUrl);
        };
        img.onerror = (error) => reject(error);
      };
      reader.onerror = (error) => reject(error);
    } catch (error) {
      reject(error);
    }
  });
};
var fileToBase64 = (file, compress = true) => {
  if (compress && file.type.startsWith("image/")) {
    return compressImage(file);
  }
  return new Promise(async (resolve, reject) => {
    try {
      const processedFile = await convertHeicImageIfNeeded(file);
      const reader = new FileReader();
      reader.readAsDataURL(processedFile);
      reader.onload = () => resolve(reader.result);
      reader.onerror = (error) => reject(error);
    } catch (error) {
      reject(error);
    }
  });
};

// utils/persistence/storage.ts
var import_idb_keyval3 = require("idb-keyval");

// utils/theme/themeChrome.ts
var LAB_EPS = 216 / 24389;
var LAB_KAPPA = 24389 / 27;

// utils/map/mapChromeStyle.ts
var DEFAULT_MAP_UI_CHROME_OPACITY = 0.6;
var DEFAULT_MAP_UI_CHROME_BLUR_PX = 4;
function mapChromeModalBackdropStyle(opacity, blurPx) {
  const o = Math.min(1, Math.max(0, opacity));
  const b = Math.min(48, Math.max(0, blurPx));
  const style = {
    // 透明面板对应更轻的背景压暗；满不透明面板也只到 20%，保持地图/画布仍可辨认。
    backgroundColor: `rgba(0, 0, 0, ${0.04 + o * 0.16})`
  };
  if (b > 0) {
    const f = `blur(${b}px)`;
    style.backdropFilter = f;
    style.WebkitBackdropFilter = f;
  }
  return style;
}
var MODAL_BACKDROP_MASK_STYLE = mapChromeModalBackdropStyle(
  DEFAULT_MAP_UI_CHROME_OPACITY,
  DEFAULT_MAP_UI_CHROME_BLUR_PX
);
var MAP_CHROME_SURFACE_BORDER_CLASS = "border border-gray-100/80";
var MAP_CHROME_SURFACE_SHELL_CLASS = `rounded-lg shadow-lg ${MAP_CHROME_SURFACE_BORDER_CLASS}`;

// utils/graph/graphRuntimeCore.ts
var GRAPH_LAYER_WEIGHT_MIN = 0.1;
var GRAPH_LAYER_WEIGHT_MAX = 1;
var GRAPH_LAYER_WEIGHT_SPAN = GRAPH_LAYER_WEIGHT_MAX - GRAPH_LAYER_WEIGHT_MIN;
var DEFAULT_GRAPH_LAYOUT_MODE = "cose";
function coerceGraphLayoutMode(raw) {
  if (raw === "time" || raw === "cose") return raw;
  return DEFAULT_GRAPH_LAYOUT_MODE;
}

// utils/graph/graphData.ts
function connectionToGraphDirection(c) {
  if (c.arrow === "none") return "none";
  const derivedFrom = c.fromArrow != null ? c.fromArrow : c.arrow === "reverse" ? "arrow" : "none";
  const derivedTo = c.toArrow != null ? c.toArrow : c.arrow === "forward" ? "arrow" : "none";
  if (derivedFrom === "arrow" && derivedTo === "arrow") return "both";
  if (derivedTo === "arrow") return "forward";
  if (derivedFrom === "arrow") return "backward";
  return "none";
}
function reverseConnectionEndpoints(c) {
  const next = {
    ...c,
    fromNoteId: c.toNoteId,
    toNoteId: c.fromNoteId,
    fromSide: c.toSide,
    toSide: c.fromSide,
    fromArrow: c.toArrow,
    toArrow: c.fromArrow
  };
  if (next.fromArrow != null || next.toArrow != null) {
    delete next.arrow;
  } else {
    if (c.arrow === "reverse") next.arrow = "forward";
    else if (c.arrow === "forward") next.arrow = "reverse";
  }
  return next;
}
function normalizeProjectConnections(project) {
  const noteIds = new Set(project.notes.map((n) => n.id));
  const raw = project.connections ?? [];
  let mutated = false;
  const next = [];
  for (const c of raw) {
    if (!noteIds.has(c.fromNoteId) || !noteIds.has(c.toNoteId)) {
      mutated = true;
      continue;
    }
    let row = c;
    if (c.labelAnchorNoteId != null && c.labelAnchorNoteId !== c.fromNoteId && c.labelAnchorNoteId !== c.toNoteId) {
      row = { ...row };
      delete row.labelAnchorNoteId;
      mutated = true;
    }
    if (connectionToGraphDirection(row) === "backward") {
      row = reverseConnectionEndpoints(row);
      mutated = true;
    }
    next.push(row);
  }
  if (!mutated) {
    return { project, mutated: false };
  }
  return { project: { ...project, connections: next }, mutated: true };
}

// utils/projectKind.ts
function isProjectKind(value) {
  return value === "mapping" || value === "graph";
}
function sanitizeProjectKind(value) {
  return isProjectKind(value) ? value : void 0;
}

// utils/frame/noteFrameMembership.ts
function primaryFrameId(note) {
  const fromIds = note.groupIds?.map((x) => String(x).trim()).filter(Boolean);
  if (fromIds?.length) return fromIds[0];
  const gid = note.groupId?.trim();
  if (gid) return gid;
  const fromNames = note.groupNames?.map((x) => String(x).trim()).filter(Boolean);
  if (fromNames?.length) return fromNames[0];
  const gn = note.groupName?.trim();
  return gn || void 0;
}
function primaryFrameName(note) {
  const fromNames = note.groupNames?.map((x) => String(x).trim()).filter(Boolean);
  if (fromNames?.length) return fromNames[0];
  const gn = note.groupName?.trim();
  if (gn) return gn;
  return void 0;
}
function normalizeNoteToSingleFrame(note) {
  const id = primaryFrameId(note);
  const name = primaryFrameName(note);
  if (!id && !name) {
    if (note.groupId == null && note.groupName == null && (note.groupIds == null || note.groupIds.length === 0) && (note.groupNames == null || note.groupNames.length === 0)) {
      return note;
    }
    const { groupId: _a, groupName: _b, groupIds: _c, groupNames: _d, ...rest } = note;
    return rest;
  }
  return {
    ...note,
    groupId: id,
    groupName: name ?? note.groupName,
    groupIds: id ? [id] : void 0,
    groupNames: name ? [name] : id ? note.groupNames?.slice(0, 1) : void 0
  };
}
function normalizeNotesToSingleFrame(notes) {
  return notes.map(normalizeNoteToSingleFrame);
}

// utils/persistence/storage.ts
init_imageAssetStore();

// utils/persistence/noteMediaSync.ts
init_imageAssetStore();
init_mediaDisplay();
function generateNoteMediaItemId() {
  return `mid-${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
function sketchAssetId(sketch) {
  if (!sketch) return null;
  if (isMediaRefId(sketch)) return sketch;
  return extractMediaId(sketch);
}
function syncNoteMediaFromLegacy(note) {
  const synced = syncNoteImageRefs({ ...note });
  const prevMedia = note.media || [];
  const refs = synced.imageRefs && synced.imageRefs.length > 0 ? synced.imageRefs : (synced.images || []).filter(isMediaRefId).map((assetId) => ({ assetId }));
  if (prevMedia.length > 0) {
    const refByAsset = new Map(refs.map((r) => [r.assetId, r]));
    const usedImage = new Set(
      prevMedia.filter((m) => m.kind === "image" && isMediaRefId(m.assetId)).map((m) => m.assetId)
    );
    const usedSketch = new Set(
      prevMedia.filter((m) => m.kind === "sketch" && isMediaRefId(m.assetId)).map((m) => m.assetId)
    );
    const media = prevMedia.map((m) => {
      if (m.kind === "image" && isMediaRefId(m.assetId) && refByAsset.has(m.assetId)) {
        const r = refByAsset.get(m.assetId);
        return {
          ...m,
          variantId: r.variantId ?? m.variantId,
          variantEnabled: r.variantEnabled ?? m.variantEnabled
        };
      }
      return m;
    });
    for (const ref of refs) {
      if (!isMediaRefId(ref.assetId) || usedImage.has(ref.assetId)) continue;
      media.push({
        id: generateNoteMediaItemId(),
        kind: "image",
        assetId: ref.assetId,
        variantId: ref.variantId,
        variantEnabled: ref.variantEnabled
      });
      usedImage.add(ref.assetId);
    }
    const skId2 = sketchAssetId(synced.sketch);
    if (skId2 && !usedSketch.has(skId2)) {
      media.push({
        id: generateNoteMediaItemId(),
        kind: "sketch",
        assetId: skId2
      });
    }
    return { ...synced, media };
  }
  const next = [];
  const usedIds = /* @__PURE__ */ new Set();
  for (const ref of refs) {
    if (!isMediaRefId(ref.assetId)) continue;
    const id = generateNoteMediaItemId();
    usedIds.add(id);
    next.push({
      id,
      kind: "image",
      assetId: ref.assetId,
      variantId: ref.variantId,
      variantEnabled: ref.variantEnabled
    });
  }
  const skId = sketchAssetId(synced.sketch);
  if (skId) {
    next.push({
      id: generateNoteMediaItemId(),
      kind: "sketch",
      assetId: skId
    });
  }
  return { ...synced, media: next };
}
function syncNoteLegacyFromMedia(note) {
  const media = note.media || [];
  const images = [];
  const imageRefs = [];
  let sketch;
  for (const m of media) {
    if (!isMediaRefId(m.assetId)) continue;
    if (m.kind === "sketch") {
      if (!sketch) sketch = m.assetId;
      continue;
    }
    images.push(m.assetId);
    imageRefs.push({
      assetId: m.assetId,
      variantId: m.variantId,
      variantEnabled: m.variantEnabled
    });
  }
  return {
    ...note,
    images,
    imageRefs,
    sketch,
    media
  };
}
function ensureNoteMediaSynced(note) {
  if ((note.images || []).some((image) => typeof image === "string" && image.startsWith("data:image/"))) {
    return { ...note };
  }
  const withMedia = syncNoteMediaFromLegacy(note);
  const synced = syncNoteLegacyFromMedia(withMedia);
  if (synced.variant === "image" && noteHasActiveFirstMediaCrop(synced)) {
    return { ...synced, variant: "standard" };
  }
  return synced;
}

// utils/persistence/storage.ts
var PROJECT_LIST_KEY = "mapp-project-list";
var PROJECT_PREFIX = "mapp-project-";
var CURRENT_STORAGE_VERSION = 3;
var projectIdsPendingConnectionMigration = /* @__PURE__ */ new Set();
function generateImageId() {
  return generateMediaId();
}
function extractImageId(imageData) {
  return extractMediaId(imageData);
}
async function saveImage(base64Data) {
  if (!base64Data || !base64Data.startsWith("data:image/")) {
    throw new Error("Invalid image data: not a valid Base64 image");
  }
  const dataSizeMB = base64Data.length * 3 / 4 / (1024 * 1024);
  if (dataSizeMB > 10) {
    console.warn(`Large image detected: ${dataSizeMB.toFixed(2)}MB, may cause storage issues`);
  }
  const contentHash = await hashMediaPayload(base64Data);
  const existingId = await findMediaIdByContentHash(IMAGE_PREFIX, contentHash);
  if (existingId) {
    console.log(`Reusing existing image: ${existingId}`);
    return existingId;
  }
  const imageId = generateImageId();
  try {
    await writeMediaRecordFromDataUrl(IMAGE_PREFIX, imageId, base64Data, {
      kind: "image",
      contentHash
    });
    console.log(`Saved new image asset: ${imageId} (${dataSizeMB.toFixed(2)}MB)`);
    return imageId;
  } catch (error) {
    console.error("Failed to save image:", error);
    throw error;
  }
}
async function loadImage(imageId) {
  try {
    const dataUrl = await loadMediaDataUrl(IMAGE_PREFIX, imageId, {
      upgradeLegacy: true,
      kind: "image"
    });
    if (!dataUrl) {
      console.warn(`Image not found in IndexedDB: ${imageId}`);
      return null;
    }
    return dataUrl;
  } catch (error) {
    console.error(`Failed to load image ${imageId}:`, error);
    return null;
  }
}
async function findExistingSketchId(sketchData) {
  try {
    const sketchHash = await hashMediaPayload(sketchData);
    return findMediaIdByContentHash(SKETCH_PREFIX, sketchHash);
  } catch (error) {
    console.warn("Failed to check for existing sketch:", error);
    return null;
  }
}
async function saveSketch(base64Data) {
  if (!base64Data || !base64Data.startsWith("data:image/")) {
    throw new Error("Invalid sketch data: not a valid data URL");
  }
  const contentHash = await hashMediaPayload(base64Data);
  const existingId = await findExistingSketchId(base64Data);
  if (existingId) {
    console.log(`Reusing existing sketch: ${existingId}`);
    return existingId;
  }
  const sketchId = generateImageId();
  await writeMediaRecordFromDataUrl(SKETCH_PREFIX, sketchId, base64Data, {
    kind: "sketch",
    contentHash
  });
  console.log(`Saved new sketch asset: ${sketchId}`);
  return sketchId;
}
async function loadSketch(sketchId) {
  try {
    return await loadMediaDataUrl(SKETCH_PREFIX, sketchId, {
      upgradeLegacy: true,
      kind: "sketch"
    });
  } catch (error) {
    console.error(`Failed to load sketch ${sketchId}:`, error);
    return null;
  }
}
function ensureNoteVariant(note) {
  if (!note.variant) {
    return { ...note, variant: "standard" };
  }
  const rawVariant = note.variant;
  if (rawVariant === "compact") {
    return ensureNoteVariant({ ...note, variant: "standard" });
  }
  const validVariants = ["standard", "image"];
  if (!validVariants.includes(note.variant)) {
    return { ...note, variant: "standard" };
  }
  const fixedNote = { ...note };
  if (!fixedNote.coords || typeof fixedNote.coords.lat !== "number" || isNaN(fixedNote.coords.lat) || typeof fixedNote.coords.lng !== "number" || isNaN(fixedNote.coords.lng)) {
    fixedNote.coords = {
      lat: fixedNote.coords && typeof fixedNote.coords.lat === "number" && !isNaN(fixedNote.coords.lat) ? fixedNote.coords.lat : 0,
      lng: fixedNote.coords && typeof fixedNote.coords.lng === "number" && !isNaN(fixedNote.coords.lng) ? fixedNote.coords.lng : 0
    };
  }
  if (!fixedNote.images) {
    fixedNote.images = [];
  }
  if (!fixedNote.tags) {
    fixedNote.tags = [];
  }
  if (typeof fixedNote.fontSize !== "number") {
    fixedNote.fontSize = 3;
  }
  if (typeof fixedNote.boardX !== "number") {
    fixedNote.boardX = 0;
  }
  if (typeof fixedNote.boardY !== "number") {
    fixedNote.boardY = 0;
  }
  return fixedNote;
}
async function migrateNoteImages(note) {
  const migratedNote = ensureNoteVariant({ ...note });
  const prevRefs = note.imageRefs || [];
  if (note.images && note.images.length > 0) {
    const nextRefs = [];
    for (let i = 0; i < note.images.length; i++) {
      const imageData = note.images[i];
      const prev = prevRefs[i];
      try {
        const existingId = extractImageId(imageData);
        if (existingId) {
          const item = { assetId: existingId };
          if (prev?.assetId === existingId) {
            if (prev.variantId) item.variantId = prev.variantId;
            if (prev.variantEnabled !== void 0) item.variantEnabled = prev.variantEnabled;
          }
          nextRefs.push(item);
        } else if (typeof imageData === "string" && imageData.startsWith("data:image/")) {
          if (prev?.assetId && isMediaRefId(prev.assetId)) {
            const item = { assetId: prev.assetId };
            if (prev.variantId) item.variantId = prev.variantId;
            if (prev.variantEnabled !== void 0) item.variantEnabled = prev.variantEnabled;
            nextRefs.push(item);
          } else {
            const imageId = await saveImage(imageData);
            const item = { assetId: imageId };
            if (prev?.variantId) item.variantId = prev.variantId;
            if (prev?.variantEnabled !== void 0) item.variantEnabled = prev.variantEnabled;
            nextRefs.push(item);
          }
        }
      } catch (error) {
        console.error(`Failed to migrate image for note ${note.id}:`, error);
        throw error;
      }
    }
    migratedNote.images = nextRefs.map((r) => r.assetId);
    migratedNote.imageRefs = nextRefs;
  } else if (prevRefs.length > 0) {
    migratedNote.images = prevRefs.map((r) => r.assetId).filter(isMediaRefId);
    migratedNote.imageRefs = prevRefs.filter((r) => isMediaRefId(r.assetId));
  }
  if (note.sketch) {
    try {
      const existingId = extractImageId(note.sketch);
      if (existingId) {
        migratedNote.sketch = existingId;
      } else if (note.sketch.startsWith("data:image/")) {
        const sketchId = await saveSketch(note.sketch);
        migratedNote.sketch = sketchId;
      }
    } catch (error) {
      console.error(`Failed to migrate sketch for note ${note.id}:`, error);
      throw error;
    }
  }
  return ensureNoteMediaSynced(syncNoteImageRefs(migratedNote));
}
async function loadNoteImages(note) {
  const { noteNeedsMediaResolve: noteNeedsMediaResolve2 } = await Promise.resolve().then(() => (init_mediaDisplay(), mediaDisplay_exports));
  let synced = ensureNoteMediaSynced({ ...note });
  if (!noteNeedsMediaResolve2(synced)) {
    return synced;
  }
  const loadedNote = { ...synced };
  const media = synced.media || [];
  const { resolveNoteImageRefUrl: resolveNoteImageRefUrl2 } = await Promise.resolve().then(() => (init_imageMaskRender(), imageMaskRender_exports));
  if (media.length > 0) {
    const loadedImages = [];
    let firstSketch;
    for (const item of media) {
      try {
        const url = await resolveNoteImageRefUrl2({
          assetId: item.assetId,
          variantId: item.variantId,
          variantEnabled: item.variantEnabled
        });
        if (item.kind === "sketch") {
          let sketchUrl = url || "";
          if (!sketchUrl) {
            const sk = await loadSketch(item.assetId);
            if (sk) sketchUrl = sk;
          }
          if (sketchUrl && firstSketch === void 0) firstSketch = sketchUrl;
        } else {
          loadedImages.push(url || "");
        }
      } catch (err) {
        console.warn(`Failed to load media for note ${note.id}:`, err);
        if (item.kind === "image") loadedImages.push("");
      }
    }
    loadedNote.images = loadedImages;
    if (firstSketch !== void 0) loadedNote.sketch = firstSketch;
    loadedNote.media = media;
    loadedNote.imageRefs = media.filter((m) => m.kind === "image").map((m) => ({
      assetId: m.assetId,
      variantId: m.variantId,
      variantEnabled: m.variantEnabled
    }));
    return loadedNote;
  }
  const refs = synced.imageRefs && synced.imageRefs.length > 0 ? synced.imageRefs : (synced.images || []).map((assetId) => ({ assetId }));
  if (refs.length > 0) {
    const loadedImages = [];
    for (const ref of refs) {
      try {
        if (ref.variantId || isMediaRefId(ref.assetId)) {
          const url = await resolveNoteImageRefUrl2(ref);
          loadedImages.push(url || "");
          if (!url) console.warn(`Failed to resolve image ref for note ${note.id}`, ref);
        } else if (typeof ref.assetId === "string" && ref.assetId.startsWith("data:")) {
          loadedImages.push(ref.assetId);
        } else {
          loadedImages.push("");
        }
      } catch (err) {
        console.warn(`Failed to load image for note ${note.id}:`, err);
        loadedImages.push("");
      }
    }
    loadedNote.images = loadedImages;
  }
  if (synced.sketch) {
    const existingId = extractImageId(synced.sketch);
    if (existingId) {
      const sketchData = await loadSketch(existingId);
      if (sketchData) loadedNote.sketch = sketchData;
      else console.warn(`Failed to load sketch ${existingId} for note ${note.id}`);
    }
  }
  return loadedNote;
}
function ensureProjectCompatibility(project) {
  const fixedProject = { ...project };
  fixedProject.type = "map";
  delete fixedProject.backgroundImage;
  const kind = sanitizeProjectKind(fixedProject.projectKind);
  if (kind) fixedProject.projectKind = kind;
  else delete fixedProject.projectKind;
  if (!fixedProject.notes) {
    fixedProject.notes = [];
  }
  fixedProject.notes = normalizeNotesToSingleFrame(
    fixedProject.notes.map((n) => ensureNoteMediaSynced(ensureNoteVariant(n)))
  );
  if (fixedProject.graphDefaultLayoutMode != null) {
    fixedProject.graphDefaultLayoutMode = coerceGraphLayoutMode(fixedProject.graphDefaultLayoutMode);
  }
  const { project: withConnections, mutated: connectionsMutated } = normalizeProjectConnections(fixedProject);
  if (connectionsMutated) {
    projectIdsPendingConnectionMigration.add(withConnections.id);
  }
  return withConnections;
}
async function flushPendingConnectionMigrationSave(project) {
  if (!projectIdsPendingConnectionMigration.has(project.id)) {
    return;
  }
  projectIdsPendingConnectionMigration.delete(project.id);
  try {
    await saveProject(project);
  } catch (e) {
    console.warn("flushPendingConnectionMigrationSave failed", e);
  }
}
function scheduleConnectionMigrationPersist(project) {
  if (!projectIdsPendingConnectionMigration.has(project.id)) {
    return;
  }
  const snapshot = project;
  setTimeout(() => {
    void flushPendingConnectionMigrationSave(snapshot);
  }, 0);
}
async function saveProject(project) {
  const compatibleProject = ensureProjectCompatibility(project);
  const migratedProject = { ...compatibleProject };
  migratedProject.notes = await Promise.all(
    compatibleProject.notes.map((note) => migrateNoteImages(note))
  );
  const projectWithVersion = {
    ...migratedProject,
    version: Date.now(),
    // 使用时间戳作为版本号
    storageVersion: CURRENT_STORAGE_VERSION
  };
  await (0, import_idb_keyval3.set)(`${PROJECT_PREFIX}${project.id}`, projectWithVersion);
  const projectList = await (0, import_idb_keyval3.get)(PROJECT_LIST_KEY) || [];
  if (!projectList.includes(project.id)) {
    projectList.push(project.id);
    await (0, import_idb_keyval3.set)(PROJECT_LIST_KEY, projectList);
  }
  return projectWithVersion;
}
async function loadProject(projectId, loadImages = false) {
  const project = await (0, import_idb_keyval3.get)(`${PROJECT_PREFIX}${projectId}`);
  if (!project) {
    return null;
  }
  const compatibleProject = ensureProjectCompatibility(project);
  if (loadImages) {
    compatibleProject.notes = await Promise.all(
      compatibleProject.notes.map((note) => loadNoteImages(note))
    );
    scheduleConnectionMigrationPersist(compatibleProject);
  }
  return compatibleProject;
}

// components/hooks/useMediaHandler.ts
init_imageAssetStore();
init_mediaDisplay();

// utils/media/pathSimplify.ts
function perpendicularDistance(point, lineStart, lineEnd) {
  const [x, y] = point;
  const [x1, y1] = lineStart;
  const [x2, y2] = lineEnd;
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) {
    return Math.hypot(x - x1, y - y1);
  }
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.hypot(x - projX, y - projY);
}
function simplifyPathRdp(points, epsilon = 3e-3) {
  if (points.length < 3) return points.slice();
  let maxDist = 0;
  let index = 0;
  const end = points.length - 1;
  for (let i = 1; i < end; i++) {
    const d = perpendicularDistance(points[i], points[0], points[end]);
    if (d > maxDist) {
      index = i;
      maxDist = d;
    }
  }
  if (maxDist > epsilon) {
    const left = simplifyPathRdp(points.slice(0, index + 1), epsilon);
    const right = simplifyPathRdp(points.slice(index), epsilon);
    return left.slice(0, -1).concat(right);
  }
  return [points[0], points[end]];
}
function smoothPathMovingAverage(points, window2 = 3) {
  if (points.length < 3 || window2 < 3) return points.slice();
  const half = Math.floor(window2 / 2);
  const out = [];
  for (let i = 0; i < points.length; i++) {
    if (i === 0 || i === points.length - 1) {
      out.push(points[i]);
      continue;
    }
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (let j = i - half; j <= i + half; j++) {
      if (j < 0 || j >= points.length) continue;
      sx += points[j][0];
      sy += points[j][1];
      n++;
    }
    out.push([sx / n, sy / n]);
  }
  return out;
}
function prepareLassoPath(raw, opts) {
  let pts = simplifyPathRdp(raw, opts?.epsilon ?? 3e-3);
  if (opts?.smooth !== false) {
    pts = smoothPathMovingAverage(pts, 3);
  }
  return pts;
}

// utils/media/createLassoSticker.ts
init_imageVariantStore();
async function createLassoSticker(opts) {
  const points = prepareLassoPath(opts.rawPoints);
  if (points.length < 3) {
    throw new Error("Lasso path too short");
  }
  const operations = [
    { type: "lasso", points },
    ...opts.outlineWidth != null && opts.outlineWidth > 0 ? [{ type: "outline", width: opts.outlineWidth }] : []
  ];
  const { edit, variant } = await createStickerVariantFromOperations({
    assetId: opts.assetId,
    operations,
    kind: "sticker"
  });
  return {
    edit,
    variant,
    ref: { assetId: opts.assetId, variantId: variant.id, variantEnabled: true }
  };
}

// components/hooks/useMediaHandler.ts
init_imageMaskRender();
async function ensureAssetIdForKind(displaySrc, kind, existingAssetId) {
  if (existingAssetId && isMediaRefId(existingAssetId)) return existingAssetId;
  if (isMediaRefId(displaySrc)) return displaySrc;
  if (displaySrc.startsWith("data:image/")) {
    return kind === "sketch" ? saveSketch(displaySrc) : saveImage(displaySrc);
  }
  throw new Error("Cannot resolve asset id");
}
async function loadAssetOriginal(assetId, kind) {
  if (kind === "sketch") {
    return await loadSketch(assetId) || await loadImage(assetId);
  }
  return await loadImage(assetId) || await loadSketch(assetId);
}
function buildInitialMedia(note) {
  if (!note) return [];
  return ensureNoteMediaSynced(note).media || [];
}
function useMediaHandler({
  initialNote,
  isOpen,
  text,
  setText,
  textareaRef,
  insertTextAtSelection
}) {
  const [mediaItems, setMediaItems] = (0, import_react.useState)(() => buildInitialMedia(initialNote));
  const [displaySrcs, setDisplaySrcs] = (0, import_react.useState)(
    () => buildInitialMedia(initialNote).map(() => "")
  );
  const [isProcessingImages, setIsProcessingImages] = (0, import_react.useState)(false);
  const [isResolvingMedia, setIsResolvingMedia] = (0, import_react.useState)(false);
  const [previewImage, setPreviewImage] = (0, import_react.useState)(null);
  const [previewImageIndex, setPreviewImageIndex] = (0, import_react.useState)(0);
  const prevIsOpenRef = (0, import_react.useRef)(false);
  const prevNoteIdRef = (0, import_react.useRef)(void 0);
  const prevChecksumRef = (0, import_react.useRef)("");
  const noteId = initialNote?.id;
  const loadGenRef = (0, import_react.useRef)(0);
  const noteMediaChecksum = (0, import_react.useMemo)(() => {
    const media = initialNote?.media;
    if (media?.length) {
      return media.map(
        (m) => `${m.id}:${m.kind}:${m.assetId}>${m.variantId || ""}>${m.variantEnabled === false ? "0" : "1"}`
      ).join(";");
    }
    return [
      (initialNote?.images || []).join(","),
      (initialNote?.imageRefs || []).map((r) => `${r.assetId}>${r.variantId || ""}>${r.variantEnabled === false ? "0" : "1"}`).join(";"),
      initialNote?.sketch || ""
    ].join("|");
  }, [initialNote?.media, initialNote?.images, initialNote?.imageRefs, initialNote?.sketch]);
  const images = (0, import_react.useMemo)(
    () => mediaItems.map((m, i) => m.kind === "image" ? displaySrcs[i] || "" : null).filter((x) => x != null),
    [mediaItems, displaySrcs]
  );
  const imageRefs = (0, import_react.useMemo)(
    () => mediaItems.filter((m) => m.kind === "image").map((m) => ({
      assetId: m.assetId,
      variantId: m.variantId,
      variantEnabled: m.variantEnabled
    })),
    [mediaItems]
  );
  const sketch = (0, import_react.useMemo)(() => {
    const idx = mediaItems.findIndex((m) => m.kind === "sketch");
    if (idx < 0) return void 0;
    return displaySrcs[idx] || void 0;
  }, [mediaItems, displaySrcs]);
  const appendDisplayImages = (0, import_react.useCallback)((base64Images) => {
    if (base64Images.length === 0) return;
    setMediaItems((prev) => [
      ...prev,
      ...base64Images.map(() => ({
        id: generateNoteMediaItemId(),
        kind: "image",
        assetId: ""
      }))
    ]);
    setDisplaySrcs((prev) => [...prev, ...base64Images]);
  }, []);
  const setImages = (0, import_react.useCallback)(
    (updater) => {
      setMediaItems((prevMedia) => {
        const imageIndices = prevMedia.map((m, i) => m.kind === "image" ? i : -1).filter((i) => i >= 0);
        setDisplaySrcs((prevDisplay) => {
          const prevImageSrcs = imageIndices.map((i) => prevDisplay[i] || "");
          const nextImageSrcs = typeof updater === "function" ? updater(prevImageSrcs) : updater;
          if (nextImageSrcs.length > prevImageSrcs.length) {
            const added = nextImageSrcs.slice(prevImageSrcs.length);
            queueMicrotask(() => appendDisplayImages(added));
            return prevDisplay;
          }
          const next = prevDisplay.slice();
          imageIndices.forEach((mi, j) => {
            if (j < nextImageSrcs.length) next[mi] = nextImageSrcs[j] || "";
          });
          return next;
        });
        return prevMedia;
      });
    },
    [appendDisplayImages]
  );
  const appendSketch = (0, import_react.useCallback)((dataUrl) => {
    if (!dataUrl) return;
    setMediaItems((prev) => [
      ...prev,
      {
        id: generateNoteMediaItemId(),
        kind: "sketch",
        assetId: isMediaRefId(dataUrl) ? dataUrl : ""
      }
    ]);
    setDisplaySrcs((prev) => [...prev, dataUrl]);
  }, []);
  const setSketch = (0, import_react.useCallback)((next) => {
    if (!next || next === "") {
      setMediaItems((prev) => {
        const idx = prev.findIndex((m) => m.kind === "sketch");
        if (idx < 0) return prev;
        setDisplaySrcs((d) => d.filter((_, i) => i !== idx));
        return prev.filter((_, i) => i !== idx);
      });
      return;
    }
    appendSketch(next);
  }, [appendSketch]);
  const setImageRefs = (0, import_react.useCallback)((_refs) => {
  }, []);
  (0, import_react.useEffect)(() => {
    if (!isOpen) {
      prevIsOpenRef.current = false;
      setIsResolvingMedia(false);
      return;
    }
    const openedNow = !prevIsOpenRef.current;
    const noteChanged = noteId !== prevNoteIdRef.current;
    const mediaChanged = noteMediaChecksum !== prevChecksumRef.current;
    prevIsOpenRef.current = true;
    prevNoteIdRef.current = noteId;
    prevChecksumRef.current = noteMediaChecksum;
    if (!(openedNow || noteChanged || mediaChanged)) return;
    if (openedNow || noteChanged) {
      setPreviewImage(null);
      setPreviewImageIndex(0);
    }
    const probe = ensureNoteMediaSynced({
      ...initialNote,
      images: initialNote?.images || [],
      imageRefs: initialNote?.imageRefs,
      sketch: initialNote?.sketch,
      media: initialNote?.media
    });
    const items = probe.media || [];
    setMediaItems(items);
    if (!noteNeedsMediaResolve(probe) && items.every((_, i) => false)) {
    }
    const needsResolve = noteNeedsMediaResolve(probe) || items.some((m) => isMediaRefId(m.assetId));
    setDisplaySrcs(items.map(() => ""));
    if (!needsResolve) {
      setIsResolvingMedia(false);
      return;
    }
    setIsResolvingMedia(true);
    const gen = ++loadGenRef.current;
    void (async () => {
      try {
        const { resolveNoteImageRefUrl: resolveNoteImageRefUrl2 } = await Promise.resolve().then(() => (init_imageMaskRender(), imageMaskRender_exports));
        if (loadGenRef.current !== gen) return;
        const srcs = await Promise.all(
          items.map(async (m) => {
            if (!isMediaRefId(m.assetId)) return "";
            try {
              const url = await resolveNoteImageRefUrl2({
                assetId: m.assetId,
                variantId: m.variantId,
                variantEnabled: m.variantEnabled
              });
              if (url && isDisplayableImageSrc(url)) return url;
              if (m.kind === "sketch") {
                const sk = await loadSketch(m.assetId);
                return sk && isDisplayableImageSrc(sk) ? sk : "";
              }
              const img = await loadImage(m.assetId);
              return img && isDisplayableImageSrc(img) ? img : "";
            } catch {
              return "";
            }
          })
        );
        if (loadGenRef.current !== gen) return;
        setMediaItems(items);
        setDisplaySrcs(srcs);
      } catch (err) {
        console.error("Failed to resolve note media for editor", err);
        if (loadGenRef.current !== gen) return;
        setDisplaySrcs(items.map(() => ""));
      } finally {
        if (loadGenRef.current === gen) setIsResolvingMedia(false);
      }
    })();
  }, [noteId, isOpen, noteMediaChecksum, initialNote]);
  const reorderMedia = (0, import_react.useCallback)((nextItems) => {
    setMediaItems((prev) => {
      const byId = new Map(prev.map((m, i) => [m.id, { m, i }]));
      setDisplaySrcs(
        (prevSrcs) => nextItems.map((item) => {
          const hit = byId.get(item.id);
          return hit ? prevSrcs[hit.i] || "" : "";
        })
      );
      return nextItems;
    });
  }, []);
  const removeMediaAt = (0, import_react.useCallback)((index) => {
    setMediaItems((prev) => prev.filter((_, i) => i !== index));
    setDisplaySrcs((prev) => {
      const next = prev.filter((_, i) => i !== index);
      setPreviewImageIndex((pidx) => {
        if (pidx === index) {
          if (next.length === 0) {
            setPreviewImage(null);
            return 0;
          }
          const newIndex = Math.min(index, next.length - 1);
          setPreviewImage(next[newIndex] || null);
          return newIndex;
        }
        if (pidx > index) return pidx - 1;
        return pidx;
      });
      return next;
    });
  }, []);
  const removeImage = (0, import_react.useCallback)(
    (index) => {
      if (index === void 0) {
        setMediaItems((prev) => {
          const next = prev.filter((m) => m.kind !== "image");
          setDisplaySrcs((d) => {
            const kept = [];
            prev.forEach((m, i) => {
              if (m.kind !== "image") kept.push(d[i] || "");
            });
            return kept;
          });
          return next;
        });
        setPreviewImage(null);
        setPreviewImageIndex(0);
        return;
      }
      let imageOrdinal = -1;
      const mediaIndex = mediaItems.findIndex((m) => {
        if (m.kind !== "image") return false;
        imageOrdinal += 1;
        return imageOrdinal === index;
      });
      if (mediaIndex >= 0) removeMediaAt(mediaIndex);
    },
    [mediaItems, removeMediaAt]
  );
  const removeSketch = (0, import_react.useCallback)(() => {
    const idx = mediaItems.findIndex((m) => m.kind === "sketch");
    if (idx >= 0) removeMediaAt(idx);
  }, [mediaItems, removeMediaAt]);
  const applyLassoSticker = (0, import_react.useCallback)(
    async (index, rawPoints) => {
      const item = mediaItems[index];
      if (!item) throw new Error("Media missing");
      const displaySrc = displaySrcs[index] || "";
      const assetId = await ensureAssetIdForKind(displaySrc, item.kind, item.assetId);
      const { ref, variant } = await createLassoSticker({
        assetId,
        rawPoints,
        outlineWidth: 0
      });
      const displayUrl = await resolveVariantDisplayUrl(variant.id, { rasterizeIfMissing: true, forceRerender: true }) || displaySrc;
      setMediaItems(
        (prev) => prev.map(
          (m, i) => i === index ? {
            ...m,
            assetId,
            variantId: ref.variantId,
            variantEnabled: true
          } : m
        )
      );
      if (displayUrl) {
        setDisplaySrcs((prev) => prev.map((s, i) => i === index ? displayUrl : s));
        setPreviewImageIndex(index);
        setPreviewImage(displayUrl);
      }
      if (displayUrl) {
        const dims = await new Promise((resolve) => {
          const img = new Image();
          img.onload = () => resolve({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height });
          img.onerror = () => resolve({ width: 0, height: 0 });
          img.src = displayUrl;
        });
        if (dims.width > 0 && dims.height > 0) return dims;
      }
      return null;
    },
    [mediaItems, displaySrcs]
  );
  const setLassoStickerEnabled = (0, import_react.useCallback)(
    async (index, enabled) => {
      const item = mediaItems[index];
      if (!item || !isMediaRefId(item.assetId)) return;
      if (!enabled) {
        const original = await loadAssetOriginal(item.assetId, item.kind);
        setMediaItems(
          (prev) => prev.map((m, i) => i === index ? { ...m, variantEnabled: false } : m)
        );
        if (original) {
          setDisplaySrcs((prev) => prev.map((s, i) => i === index ? original : s));
          if (previewImageIndex === index) setPreviewImage(original);
        }
        return;
      }
      setMediaItems(
        (prev) => prev.map((m, i) => i === index ? { ...m, variantEnabled: true } : m)
      );
      if (!item.variantId) return;
      const url = await resolveVariantDisplayUrl(item.variantId, { rasterizeIfMissing: true });
      if (url) {
        setDisplaySrcs((prev) => prev.map((s, i) => i === index ? url : s));
        if (previewImageIndex === index) setPreviewImage(url);
      }
    },
    [mediaItems, previewImageIndex]
  );
  const clearLassoSticker = (0, import_react.useCallback)(
    async (index) => setLassoStickerEnabled(index, false),
    [setLassoStickerEnabled]
  );
  const loadOriginalImageSrc = (0, import_react.useCallback)(
    async (index) => {
      const item = mediaItems[index];
      if (!item) return null;
      if (isMediaRefId(item.assetId)) {
        const url = await loadAssetOriginal(item.assetId, item.kind);
        if (url) return url;
      }
      const fallback = displaySrcs[index];
      return isDisplayableImageSrc(fallback) ? fallback : null;
    },
    [mediaItems, displaySrcs]
  );
  const persistMediaForSave = (0, import_react.useCallback)(async () => {
    const nextItems = [];
    for (let i = 0; i < mediaItems.length; i++) {
      const m = mediaItems[i];
      const src = displaySrcs[i] || "";
      let assetId = m.assetId;
      if (!isMediaRefId(assetId) && isDisplayableImageSrc(src)) {
        assetId = await ensureAssetIdForKind(src, m.kind, m.assetId);
      }
      if (!isMediaRefId(assetId)) continue;
      nextItems.push({ ...m, assetId });
    }
    const note = syncNoteLegacyFromMedia({
      ...initialNote,
      media: nextItems
    });
    return {
      media: nextItems,
      images: note.images,
      imageRefs: note.imageRefs,
      sketch: note.sketch
    };
  }, [mediaItems, displaySrcs, initialNote]);
  const handleImageUpload = (0, import_react.useCallback)(async (e) => {
    if (!e.target.files || e.target.files.length === 0) return;
    try {
      const files = Array.from(e.target.files);
      setIsProcessingImages(true);
      const base64Images = await Promise.all(files.map((file) => fileToBase64(file)));
      appendDisplayImages(base64Images);
      e.target.value = "";
    } catch (err) {
      console.error("Failed to convert image", err);
    } finally {
      setIsProcessingImages(false);
    }
  }, [appendDisplayImages]);
  const handlePaste = (0, import_react.useCallback)(
    async (e) => {
      if (!e.clipboardData) return;
      const items = Array.from(e.clipboardData.items);
      const imageItems = items.filter((item) => item.type.startsWith("image/"));
      const textData = e.clipboardData.getData("text/plain");
      if (imageItems.length > 0) {
        e.preventDefault();
        setIsProcessingImages(true);
        try {
          if (textData && insertTextAtSelection) {
            insertTextAtSelection(textData);
          } else if (textData && textareaRef.current) {
            const start = textareaRef.current.selectionStart;
            const end = textareaRef.current.selectionEnd;
            const newText = text.substring(0, start) + textData + text.substring(end);
            setText(newText);
            setTimeout(() => {
              if (textareaRef.current) {
                textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + textData.length;
              }
            }, 0);
          }
          const imageFiles = imageItems.map((item) => item.getAsFile()).filter((file) => file !== null);
          const base64Images = await Promise.all(imageFiles.map((file) => fileToBase64(file)));
          if (base64Images.length > 0) appendDisplayImages(base64Images);
        } catch (err) {
          console.error("Failed to process pasted content", err);
        } finally {
          setIsProcessingImages(false);
        }
      }
    },
    [setText, text, textareaRef, insertTextAtSelection, appendDisplayImages]
  );
  const handleDropImages = (0, import_react.useCallback)(
    async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const files = Array.from(e.dataTransfer.files);
      const imageFiles = files.filter((file) => file.type.startsWith("image/"));
      if (imageFiles.length === 0 || isProcessingImages) return;
      setIsProcessingImages(true);
      try {
        const base64Images = await Promise.all(imageFiles.map((file) => fileToBase64(file)));
        appendDisplayImages(base64Images);
      } catch (err) {
        console.error("Failed to convert dragged image", err);
      } finally {
        setIsProcessingImages(false);
      }
    },
    [isProcessingImages, appendDisplayImages]
  );
  return {
    mediaItems,
    displaySrcs,
    reorderMedia,
    removeMediaAt,
    images,
    setImages,
    imageRefs,
    setImageRefs,
    sketch,
    setSketch,
    appendSketch,
    appendDisplayImages,
    isProcessingImages,
    isResolvingMedia,
    handleImageUpload,
    handlePaste,
    handleDropImages,
    removeImage,
    removeSketch,
    applyLassoSticker,
    setLassoStickerEnabled,
    clearLassoSticker,
    loadOriginalImageSrc,
    persistMediaForSave,
    isCropActiveAt: (index) => isMediaItemCropActive(mediaItems[index]),
    previewImage,
    setPreviewImage,
    previewImageIndex,
    setPreviewImageIndex
  };
}

// components/map/overlays/CameraCaptureDialog.tsx
var import_react3 = require("react");
var import_lucide_react = require("lucide-react");

// test-shell:window
var import_react2 = __toESM(require("react"));
function ChromeWindow({ open, children }) {
  const [present, setPresent] = (0, import_react2.useState)(false);
  (0, import_react2.useEffect)(() => setPresent(open), [open]);
  return present ? import_react2.default.createElement("div", null, children) : null;
}

// components/map/overlays/CameraCaptureDialog.tsx
var import_jsx_runtime = require("react/jsx-runtime");
function CameraCaptureDialog({
  open,
  onClose,
  onCapture,
  variant = "window",
  title = "\u62CD\u7167",
  themeColor = THEME_COLOR,
  chromeSurfaceStyle,
  chromeAppearance
}) {
  const videoRef = (0, import_react3.useRef)(null);
  const [videoElement, setVideoElement] = (0, import_react3.useState)(null);
  const setVideoRef = (0, import_react3.useCallback)((node) => {
    videoRef.current = node;
    setVideoElement(node);
  }, []);
  const captureBusyRef = (0, import_react3.useRef)(false);
  const capturedPhotoRef = (0, import_react3.useRef)(null);
  const streamRef = (0, import_react3.useRef)(null);
  const [facingMode, setFacingMode] = (0, import_react3.useState)("environment");
  const [isReady, setIsReady] = (0, import_react3.useState)(false);
  const [isCapturing, setIsCapturing] = (0, import_react3.useState)(false);
  const [errorMessage, setErrorMessage] = (0, import_react3.useState)(null);
  const [shutterHover, setShutterHover] = (0, import_react3.useState)(false);
  const stopCamera = (0, import_react3.useCallback)(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);
  (0, import_react3.useEffect)(() => {
    setIsCapturing(false);
    captureBusyRef.current = false;
    capturedPhotoRef.current = null;
    setErrorMessage(null);
    setFacingMode("environment");
  }, [open]);
  (0, import_react3.useEffect)(() => {
    if (!open || !videoElement) return;
    let disposed = false;
    setIsReady(false);
    setErrorMessage(null);
    const startCamera = async () => {
      try {
        stopCamera();
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facingMode } },
          audio: false
        });
        if (disposed) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoElement;
        video.srcObject = stream;
        await video.play();
        if (!disposed) setIsReady(true);
      } catch (error) {
        if (!disposed) setErrorMessage(error instanceof Error ? error.message : "\u65E0\u6CD5\u6253\u5F00\u6444\u50CF\u5934");
      }
    };
    void startCamera();
    return () => {
      disposed = true;
      stopCamera();
    };
  }, [open, stopCamera, videoElement, facingMode]);
  const handleClose = (0, import_react3.useCallback)(() => {
    stopCamera();
    onClose();
  }, [onClose, stopCamera]);
  const handleFlipCamera = (0, import_react3.useCallback)(() => {
    if (isCapturing) return;
    setIsReady(false);
    setFacingMode((prev) => prev === "environment" ? "user" : "environment");
  }, [isCapturing]);
  const handleCapture = (0, import_react3.useCallback)(async () => {
    const video = videoRef.current;
    if (captureBusyRef.current) return;
    if (!capturedPhotoRef.current && (!video || !video.videoWidth || !video.videoHeight)) return;
    captureBusyRef.current = true;
    setIsCapturing(true);
    setErrorMessage(null);
    try {
      if (!capturedPhotoRef.current && video) {
        const viewportWidth = video.clientWidth || video.videoWidth;
        const viewportHeight = video.clientHeight || video.videoHeight;
        const viewportRatio = viewportWidth / viewportHeight;
        const sourceRatio = video.videoWidth / video.videoHeight;
        let sourceX = 0;
        let sourceY = 0;
        let sourceWidth = video.videoWidth;
        let sourceHeight = video.videoHeight;
        if (sourceRatio > viewportRatio) {
          sourceWidth = video.videoHeight * viewportRatio;
          sourceX = (video.videoWidth - sourceWidth) / 2;
        } else if (sourceRatio < viewportRatio) {
          sourceHeight = video.videoWidth / viewportRatio;
          sourceY = (video.videoHeight - sourceHeight) / 2;
        }
        const maxEdge = 1920;
        const scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(sourceWidth * scale));
        canvas.height = Math.max(1, Math.round(sourceHeight * scale));
        const context = canvas.getContext("2d");
        if (!context) throw new Error("\u65E0\u6CD5\u5904\u7406\u62CD\u6444\u7684\u7167\u7247");
        context.drawImage(
          video,
          sourceX,
          sourceY,
          sourceWidth,
          sourceHeight,
          0,
          0,
          canvas.width,
          canvas.height
        );
        const image = await new Promise((resolve, reject) => {
          canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("\u65E0\u6CD5\u751F\u6210\u7167\u7247")), "image/jpeg", 0.84);
        });
        capturedPhotoRef.current = image;
      }
      await onCapture(capturedPhotoRef.current);
      capturedPhotoRef.current = null;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "\u62CD\u6444\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5");
    } finally {
      captureBusyRef.current = false;
      setIsCapturing(false);
    }
  }, [onCapture]);
  const shutterBg = shutterHover ? themeColor === THEME_COLOR ? THEME_COLOR_DARK : themeColor : themeColor;
  const floatingToolbar = /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "div",
    {
      className: "absolute bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border border-gray-100 bg-white/95 px-4 py-2 shadow-xl backdrop-blur-md",
      onPointerDown: (e) => e.stopPropagation(),
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            onClick: () => handleClose(),
            className: "rounded-full p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500",
            "aria-label": "\u53D6\u6D88\u62CD\u7167",
            children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.X, { size: 20 })
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "h-6 w-px bg-gray-200" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            onClick: () => handleFlipCamera(),
            disabled: !isReady || isCapturing || !!errorMessage,
            className: "rounded-full p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-40",
            "aria-label": "\u5207\u6362\u6444\u50CF\u5934",
            title: "\u5207\u6362\u6444\u50CF\u5934",
            children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.SwitchCamera, { size: 20 })
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "h-6 w-px bg-gray-200" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            onClick: () => void handleCapture(),
            disabled: !isReady || isCapturing || !!errorMessage && !capturedPhotoRef.current,
            className: "flex h-10 w-10 items-center justify-center rounded-full text-theme-chrome-fg shadow-sm transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-45",
            style: { backgroundColor: shutterBg },
            onMouseEnter: () => setShutterHover(true),
            onMouseLeave: () => setShutterHover(false),
            "aria-label": "\u62CD\u7167",
            children: isCapturing ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.Loader2, { className: "animate-spin", size: 20 }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.Camera, { size: 20 })
          }
        )
      ]
    }
  );
  const body = /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "div",
    {
      className: variant === "overlay" ? "relative flex h-full min-h-0 flex-col bg-black" : "relative flex min-h-[min(100dvh,34rem)] flex-col overflow-hidden bg-black sm:min-h-[28rem]",
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between px-4 pb-8 pt-4 bg-gradient-to-b from-black/45 to-transparent", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "pointer-events-auto", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              type: "button",
              onClick: handleClose,
              className: "rounded-xl border border-white/20 bg-white/90 p-2 text-gray-700 shadow-lg backdrop-blur-md transition hover:bg-white",
              "aria-label": "\u5173\u95ED\u53D6\u666F\u5668",
              children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.X, { size: 18 })
            }
          ) }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "rounded-full border border-white/15 bg-black/35 px-3 py-1 text-xs font-semibold tracking-wide text-white backdrop-blur-md", children: title }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "w-10", "aria-hidden": true })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "relative flex min-h-0 flex-1 items-center justify-center overflow-hidden", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "video",
            {
              ref: setVideoRef,
              autoPlay: true,
              playsInline: true,
              muted: true,
              className: `h-full w-full object-cover ${facingMode === "user" ? "scale-x-[-1]" : ""}`
            }
          ),
          !isReady && !errorMessage ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/50 text-sm text-white", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.Loader2, { className: "animate-spin", size: 28 }),
            "\u6B63\u5728\u6253\u5F00\u6444\u50CF\u5934\u2026"
          ] }) : null,
          errorMessage ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "absolute inset-0 flex items-center justify-center bg-black/55 px-6", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "w-full max-w-xs rounded-2xl border border-gray-100/80 bg-white/95 p-4 text-center shadow-xl backdrop-blur-md", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "text-sm font-medium text-gray-800", children: errorMessage }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "mt-3 flex flex-col gap-2", children: [
              capturedPhotoRef.current ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "button",
                {
                  type: "button",
                  onClick: () => void handleCapture(),
                  disabled: isCapturing,
                  className: "rounded-xl px-4 py-2 text-sm font-semibold text-theme-chrome-fg shadow-sm transition active:scale-[0.98] disabled:opacity-50",
                  style: { backgroundColor: themeColor },
                  children: "\u91CD\u8BD5\u4FDD\u5B58\u8FD9\u5F20\u7167\u7247"
                }
              ) : null,
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "button",
                {
                  type: "button",
                  onClick: handleClose,
                  className: "rounded-xl bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-200",
                  children: "\u5173\u95ED"
                }
              )
            ] })
          ] }) }) : null
        ] }),
        floatingToolbar
      ]
    }
  );
  if (variant === "overlay") {
    if (!open) return null;
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "absolute inset-0 z-50 flex flex-col", onPointerDown: (e) => e.stopPropagation(), children: body });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    ChromeWindow,
    {
      open,
      onClose: handleClose,
      backdropLabel: "\u5173\u95ED\u62CD\u7167",
      placement: "center",
      surface: "window",
      appearance: chromeAppearance,
      compactBehavior: "fullscreen",
      className: "w-[min(100vw-2rem,32rem)] overflow-hidden rounded-3xl",
      style: chromeSurfaceStyle,
      children: body
    }
  );
}

// tests/camera-flow.test.tsx
init_imageAssetStore();
var import_jsx_runtime2 = require("react/jsx-runtime");
globalThis.FileReader = class {
  constructor() {
    this.result = null;
    this.onload = null;
    this.onerror = null;
  }
  readAsDataURL(blob) {
    void blob.arrayBuffer().then((bytes) => {
      this.result = `data:${blob.type};base64,${Buffer.from(bytes).toString("base64")}`;
      this.onload?.();
    });
  }
};
globalThis.Image = class {
  constructor() {
    this.naturalWidth = 640;
    this.naturalHeight = 480;
    this.onload = null;
  }
  set src(_) {
    queueMicrotask(() => this.onload?.());
  }
};
globalThis.window = globalThis;
var photo = new Blob(["captured photo bytes"], { type: "image/jpeg" });
var cameraCalls = 0;
var encodedFrames = 0;
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: {
    mediaDevices: {
      getUserMedia: async () => {
        cameraCalls++;
        return { getTracks: () => [{ stop() {
        } }] };
      }
    }
  }
});
globalThis.document = {
  createElement: (tag) => {
    import_strict.default.equal(tag, "canvas");
    return {
      getContext: () => ({ drawImage() {
      } }),
      toBlob: (callback) => {
        encodedFrames++;
        callback(photo);
      }
    };
  }
};
var createNodeMock = (element) => element.type === "video" ? {
  videoWidth: 640,
  videoHeight: 480,
  clientWidth: 320,
  clientHeight: 240,
  play: () => Promise.resolve(),
  srcObject: null
} : null;
async function run() {
  let locationCalls = 0;
  let resolveLocation;
  let stagedNote = null;
  let cameraOpen = false;
  let preparing = false;
  async function startPhotoNewPin() {
    if (preparing || cameraOpen) return;
    preparing = true;
    locationCalls++;
    const location = await new Promise((resolve) => {
      resolveLocation = resolve;
    });
    preparing = false;
    if (!location) return;
    stagedNote = {
      id: `note-${Date.now()}`,
      coords: location,
      emoji: "\u{1F4F7}",
      text: "",
      images: [],
      tags: [],
      variant: "standard",
      createdAt: Date.now(),
      boardX: 0,
      boardY: 0,
      isFavorite: false
    };
    cameraOpen = true;
  }
  const firstPin = startPhotoNewPin();
  import_strict.default.equal(locationCalls, 1);
  import_strict.default.equal(cameraCalls, 0, "camera must wait while location is pending");
  import_strict.default.equal(preparing, true);
  import_strict.default.equal(cameraOpen, false);
  await (0, import_react_test_renderer.act)(async () => {
    resolveLocation({ lat: 28, lng: 112 });
  });
  await firstPin;
  import_strict.default.equal(preparing, false);
  import_strict.default.ok(stagedNote?.coords);
  import_strict.default.equal(cameraOpen, true);
  import_strict.default.equal(cameraCalls, 0, "camera opens only after NoteEditor mounts the overlay");
  let capturedIntoEditor = null;
  let editor;
  function EditorWithCamera() {
    editor = useMediaHandler({
      initialNote: stagedNote,
      isOpen: true,
      text: "",
      setText() {
      },
      textareaRef: { current: null }
    });
    const [open, setOpen] = (0, import_react4.useState)(true);
    (0, import_react4.useEffect)(() => {
    }, []);
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      CameraCaptureDialog,
      {
        open,
        variant: "overlay",
        onClose: () => setOpen(false),
        onCapture: async (blob) => {
          const dataUrl = await blobToDataUrl(blob);
          editor.appendDisplayImages([dataUrl]);
          capturedIntoEditor = dataUrl;
          setOpen(false);
          cameraOpen = false;
        }
      }
    );
  }
  let tree;
  await (0, import_react_test_renderer.act)(async () => {
    tree = (0, import_react_test_renderer.create)(/* @__PURE__ */ (0, import_jsx_runtime2.jsx)(EditorWithCamera, {}), { createNodeMock });
  });
  import_strict.default.equal(cameraCalls, 1, "overlay getUserMedia after editor opens");
  const shutter = () => tree.root.findByProps({ "aria-label": "\u62CD\u7167" });
  import_strict.default.equal(shutter().props.disabled, false);
  await (0, import_react_test_renderer.act)(async () => {
    await shutter().props.onClick();
  });
  import_strict.default.equal(locationCalls, 1, "shutter must never request location");
  import_strict.default.ok(capturedIntoEditor?.startsWith("data:image/jpeg"));
  import_strict.default.equal(editor.mediaItems.length, 1);
  import_strict.default.equal(editor.mediaItems[0].kind, "image");
  import_strict.default.equal(editor.displaySrcs[0], capturedIntoEditor);
  const persistedMedia = await editor.persistMediaForSave();
  import_strict.default.ok(persistedMedia.media[0].assetId.startsWith("img-"));
  let project = {
    id: "camera-test",
    name: "Camera test",
    type: "map",
    createdAt: 1,
    notes: [
      {
        ...stagedNote,
        images: persistedMedia.images,
        imageRefs: persistedMedia.imageRefs,
        media: persistedMedia.media
      }
    ]
  };
  project = await saveProject(project);
  const reloaded = await loadProject(project.id);
  import_strict.default.ok(reloaded);
  const hydrated = await loadNoteImages(reloaded.notes[0]);
  import_strict.default.equal(
    hydrated.images[0],
    "data:image/jpeg;base64," + Buffer.from("captured photo bytes").toString("base64")
  );
  console.log("PASS: location \u2192 editor camera overlay \u2192 append media \u2192 save persists photo");
  await (0, import_react_test_renderer.act)(async () => {
    tree.unmount();
  });
  cameraOpen = false;
  preparing = false;
  const beforeCam = cameraCalls;
  const p = startPhotoNewPin();
  await (0, import_react_test_renderer.act)(async () => {
    resolveLocation(null);
  });
  await p;
  import_strict.default.equal(cameraOpen, false);
  import_strict.default.equal(cameraCalls, beforeCam, "failed location must not request camera");
  console.log("PASS: failed location does not open camera");
  let attempts = 0;
  const before = encodedFrames;
  const captured = [];
  await (0, import_react_test_renderer.act)(async () => {
    tree = (0, import_react_test_renderer.create)(
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        CameraCaptureDialog,
        {
          open: true,
          variant: "overlay",
          onClose: () => {
          },
          onCapture: async (blob) => {
            captured.push(blob);
            if (++attempts === 1) throw new Error("Simulated storage failure");
          }
        }
      ),
      { createNodeMock }
    );
  });
  await (0, import_react_test_renderer.act)(async () => {
    await shutter().props.onClick();
  });
  import_strict.default.equal(shutter().props.disabled, false);
  const retry = tree.root.findAllByType("button").find((button) => button.props.children === "\u91CD\u8BD5\u4FDD\u5B58\u8FD9\u5F20\u7167\u7247");
  import_strict.default.ok(retry);
  await (0, import_react_test_renderer.act)(async () => {
    await retry.props.onClick();
  });
  import_strict.default.equal(captured[0], captured[1]);
  import_strict.default.equal(encodedFrames, before + 1, "save retry must not recapture a different frame");
  await (0, import_react_test_renderer.act)(async () => {
    tree.unmount();
  });
  console.log("PASS: failed save keeps the exact photo for retry and releases shutter");
}
void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
