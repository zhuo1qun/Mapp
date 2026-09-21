export type ImageGpsMetadata = {
  lat: number | null;
  lng: number | null;
  output: Record<string, unknown> | null;
};

export function isHeicImageFile(file: File): boolean {
  const lowerName = file.name.toLowerCase();
  return (
    file.type === 'image/heic' ||
    file.type === 'image/heif' ||
    lowerName.endsWith('.heic') ||
    lowerName.endsWith('.heif')
  );
}

/** EXIF is intentionally loaded only when an image import actually needs metadata. */
export async function readImageGpsMetadata(file: File): Promise<ImageGpsMetadata> {
  const exifrModule = await import('exifr');
  const exifr = (exifrModule as any).default || exifrModule;
  const output = (await exifr.parse(file, {
    tiff: true,
    exif: true,
    gps: true,
    xmp: true,
    translateValues: true,
    mergeOutput: true,
    reviveValues: true
  })) as Record<string, unknown> | null;

  if (!output) return { lat: null, lng: null, output: null };

  const latitude =
    typeof output.latitude === 'number'
      ? output.latitude
      : typeof output.GPSLatitude === 'number'
        ? output.GPSLatitude
        : null;
  const longitude =
    typeof output.longitude === 'number'
      ? output.longitude
      : typeof output.GPSLongitude === 'number'
        ? output.GPSLongitude
        : null;
  const lat = latitude !== null && Number.isFinite(latitude) ? latitude : null;
  const lng = longitude !== null && Number.isFinite(longitude) ? longitude : null;

  if ((lat !== null && Math.abs(lat) > 90) || (lng !== null && Math.abs(lng) > 180)) {
    throw new Error('照片 GPS 坐标超出有效范围');
  }

  return { lat, lng, output };
}

const HEIC_CONVERSION_METHODS = [
  { toType: 'image/jpeg', quality: 0.9, extension: '.jpg', mimeType: 'image/jpeg' },
  { toType: 'image/jpeg', quality: 0.8, extension: '.jpg', mimeType: 'image/jpeg' },
  { toType: 'image/png', quality: undefined, extension: '.png', mimeType: 'image/png' }
] as const;

/** HEIC support is a low-frequency path; heic2any must never enter normal view loading. */
export async function convertHeicImageIfNeeded(file: File): Promise<File> {
  if (!isHeicImageFile(file)) return file;

  const heic2anyModule = await import('heic2any');
  const heic2any = (heic2anyModule as any).default || heic2anyModule;
  let lastError: unknown = null;

  for (const method of HEIC_CONVERSION_METHODS) {
    try {
      const result = await heic2any({
        blob: file,
        toType: method.toType,
        ...(method.quality === undefined ? {} : { quality: method.quality })
      });
      const blob = Array.isArray(result) ? result[0] : result;
      if (!(blob instanceof Blob) || blob.size === 0) {
        throw new Error('Conversion returned empty result');
      }

      return new File([blob], file.name.replace(/\.(heic|heif)$/i, method.extension), {
        type: method.mimeType,
        lastModified: file.lastModified
      });
    } catch (error) {
      lastError = error;
    }
  }

  const message = lastError instanceof Error ? lastError.message : 'Unknown error';
  if (message.includes('ERR_LIBHEIF') || message.includes('format not supported')) {
    throw new Error(
      '当前浏览器转换器不支持此 HEIC/HEIF 文件，请先在系统相册或预览应用中转换为 JPEG/PNG 后重试。'
    );
  }
  throw new Error(`HEIC/HEIF 图片转换失败: ${message}\n\n请将图片转换为 JPEG/PNG 格式后重试。`);
}
