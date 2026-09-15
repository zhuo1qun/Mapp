import { convertHeicImageIfNeeded } from '../media/imageFileProcessing';

/** Board image objects use a normalized short side and retain their rendered dimensions. */
export async function compressImageToBase64(
  file: File,
  targetShortSide = 512
): Promise<{ base64: string; width: number; height: number }> {
  const processedFile = await convertHeicImageIfNeeded(file);
  const source = await readFileAsDataUrl(processedFile);
  const image = await loadImage(source);
  const scale = targetShortSide / Math.min(image.width, image.height);
  const width = Math.round(image.width * scale);
  const height = Math.round(image.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Cannot get canvas context');
  context.drawImage(image, 0, 0, width, height);

  return {
    base64: canvas.toDataURL('image/png'),
    width,
    height
  };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to decode image'));
    image.src = src;
  });
}
