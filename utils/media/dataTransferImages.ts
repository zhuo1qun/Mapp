const IMAGE_EXTENSION_MIME: Record<string, string> = {
  avif: 'image/avif',
  bmp: 'image/bmp',
  gif: 'image/gif',
  heic: 'image/heic',
  heif: 'image/heif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  webp: 'image/webp'
};

function mimeFromName(name: string) {
  const extension = name.split('.').pop()?.toLowerCase() || '';
  return IMAGE_EXTENSION_MIME[extension] || '';
}

export function isLikelyImageFile(file: File, hintedType = '') {
  return (
    file.type.startsWith('image/') ||
    hintedType.startsWith('image/') ||
    !!mimeFromName(file.name)
  );
}

function normalizeImageFile(file: File, hintedType = '') {
  const type = file.type.startsWith('image/')
    ? file.type
    : hintedType.startsWith('image/')
      ? hintedType
      : mimeFromName(file.name);
  if (!type || file.type === type) return file;
  const fallbackExtension = type.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
  return new File([file], file.name || `dragged-image.${fallbackExtension}`, {
    type,
    lastModified: file.lastModified || Date.now()
  });
}

type WebkitFileEntry = {
  isFile?: boolean;
  file?: (success: (file: File) => void, failure?: () => void) => void;
};

async function promisedFileFromItem(item: DataTransferItem) {
  const direct = item.getAsFile();
  if (direct?.size) return direct;
  const entry = (item as unknown as {
    webkitGetAsEntry?: () => WebkitFileEntry | null;
  }).webkitGetAsEntry?.();
  if (!entry?.isFile || !entry.file) return null;
  return new Promise<File | null>((resolve) => entry.file?.(resolve, () => resolve(null)));
}

function dataUrlToFile(source: string, index: number) {
  const match = source.match(/^data:(image\/[a-z0-9.+-]+)(?:;[^,]*)?,/i);
  if (!match) return null;
  const type = match[1].toLowerCase();
  try {
    const comma = source.indexOf(',');
    const metadata = source.slice(0, comma);
    const payload = source.slice(comma + 1);
    const binary = /;base64/i.test(metadata) ? atob(payload) : decodeURIComponent(payload);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    const extension = type.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
    return new File([bytes], `dragged-image-${index + 1}.${extension}`, { type });
  } catch {
    return null;
  }
}

function embeddedImageDataUrls(dataTransfer: DataTransfer) {
  const sources: string[] = [];
  const plain = dataTransfer.getData('text/plain').trim();
  if (plain.startsWith('data:image/')) sources.push(plain);
  const html = dataTransfer.getData('text/html');
  if (html) {
    try {
      const document = new DOMParser().parseFromString(html, 'text/html');
      document.querySelectorAll<HTMLImageElement>('img[src^="data:image/"]').forEach((image) => {
        sources.push(image.src);
      });
    } catch {
      // A malformed HTML flavor must not prevent reading the file flavors.
    }
  }
  return sources;
}

/**
 * Reads normal files plus macOS/iOS promised-image drag items. Lifted-subject
 * drags often omit `DataTransfer.files` but expose an image item or data URL.
 */
export async function extractDroppedImageFiles(dataTransfer: DataTransfer): Promise<File[]> {
  const results: File[] = [];
  const seen = new Set<string>();
  const append = (file: File | null, hintedType = '') => {
    if (!file || !isLikelyImageFile(file, hintedType)) return;
    const normalized = normalizeImageFile(file, hintedType);
    const key = `${normalized.name}\u0000${normalized.size}\u0000${normalized.lastModified}\u0000${normalized.type}`;
    if (seen.has(key)) return;
    seen.add(key);
    results.push(normalized);
  };

  Array.from(dataTransfer.files || []).forEach((file) => append(file));

  const fileItems = Array.from(dataTransfer.items || []).filter((item) => item.kind === 'file');
  for (const item of fileItems) {
    append(await promisedFileFromItem(item), item.type);
  }

  if (!results.length) {
    embeddedImageDataUrls(dataTransfer).forEach((source, index) => {
      append(dataUrlToFile(source, index));
    });
  }
  return results;
}

