import { TAG_COLORS } from './constants';
import { Tag } from './types';
import { toJpeg, toPng } from 'html-to-image';
import { convertHeicImageIfNeeded } from './utils/media/imageFileProcessing';

export const generateId = (): string => {
  return Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
};

export const getTagColor = (label: string): string => {
  let hash = 0;
  for (let i = 0; i < label.length; i++) {
    hash = label.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % TAG_COLORS.length;
  return TAG_COLORS[index];
};

export const createTag = (label: string): Tag => {
  return {
    id: generateId(),
    label,
    color: getTagColor(label)
  };
};

// Compress image from base64 string
export const compressImageFromBase64 = (base64: string, maxWidth: number = 1920, maxHeight: number = 1920, quality: number = 0.8): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = base64;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      // Calculate new dimensions while maintaining aspect ratio
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = width * ratio;
        height = height * ratio;
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }

      // PNG / WebP 可能包含 alpha；输出 JPEG 会把透明像素合成为黑色。
      // 此处统一输出 PNG，以保留透明通道。
      ctx.drawImage(img, 0, 0, width, height);
      const preservesAlpha = /^data:image\/(png|webp|gif);/i.test(base64);
      const compressedDataUrl = preservesAlpha
        ? canvas.toDataURL('image/png')
        : canvas.toDataURL('image/jpeg', quality);
      resolve(compressedDataUrl);
    };
    img.onerror = (error) => reject(error);
  });
};

export const compressImage = (file: File, maxWidth: number = 1920, maxHeight: number = 1920, quality: number = 0.8): Promise<string> => {
  return new Promise(async (resolve, reject) => {
    try {
      // Convert HEIC if needed
      const processedFile = await convertHeicImageIfNeeded(file);
      
      const reader = new FileReader();
      reader.readAsDataURL(processedFile);
      reader.onload = (e) => {
        const img = new Image();
        img.src = e.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          // Calculate new dimensions while maintaining aspect ratio
          if (width > maxWidth || height > maxHeight) {
            const ratio = Math.min(maxWidth / width, maxHeight / height);
            width = width * ratio;
            height = height * ratio;
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Could not get canvas context'));
            return;
          }

          // PNG / WebP / GIF 均可能有透明通道，不能编码成 JPEG。
          ctx.drawImage(img, 0, 0, width, height);
          const preservesAlpha = /image\/(png|webp|gif)/i.test(processedFile.type);
          const compressedDataUrl = preservesAlpha
            ? canvas.toDataURL('image/png')
            : canvas.toDataURL('image/jpeg', quality);
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

// Base64 helper for file reading (with optional compression)
export const fileToBase64 = (file: File, compress: boolean = true): Promise<string> => {
  // Only compress image files
  if (compress && file.type.startsWith('image/')) {
    return compressImage(file);
  }
  
  // For non-image files or when compression is disabled, still check for HEIC
  return new Promise(async (resolve, reject) => {
    try {
      const processedFile = await convertHeicImageIfNeeded(file);
      const reader = new FileReader();
      reader.readAsDataURL(processedFile);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    } catch (error) {
      reject(error);
    }
  });
};

export const formatDate = (timestamp: number): string => {
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

/**
 * 将便签文本分割为标题和内容
 * 逻辑：第一个换行符之前为标题，之后为内容
 * 渲染时可以自动去除 Markdown 标题标识符
 */
export const parseNoteContent = (text: string) => {
  const firstNewlineIndex = text.indexOf('\n');
  let title = firstNewlineIndex === -1 ? text : text.substring(0, firstNewlineIndex);
  const detail = firstNewlineIndex === -1 ? '' : text.substring(firstNewlineIndex + 1);

  // 去除标题中的 Markdown 标识符 (如 #, ##, ###)
  const cleanTitle = title.replace(/^#+\s+/, '').trim();

  return {
    title: cleanTitle,
    detail
  };
};

// 等待视图内图片结束加载；失败或超时也要继续导出，不能让弹窗永久卡住。
const waitForImagesLoaded = async (element: HTMLElement): Promise<void> => {
  const images = Array.from(element.querySelectorAll('img'));
  await Promise.all(
    images.map(
      (image) =>
        new Promise<void>((resolve) => {
          if (image.complete) {
            resolve();
            return;
          }
          let settled = false;
          const finish = () => {
            if (settled) return;
            settled = true;
            image.removeEventListener('load', finish);
            image.removeEventListener('error', finish);
            window.clearTimeout(timeout);
            resolve();
          };
          const timeout = window.setTimeout(finish, 5000);
          image.addEventListener('load', finish, { once: true });
          image.addEventListener('error', finish, { once: true });
        })
    )
  );
};

/**
 * Leaflet 瓦片加载完后会有 opacity 淡入；导出前等齐 `leaflet-tile-loaded`，
 * 避免截到半透明中间态。
 */
const waitForLeafletTilesReady = async (
  root: HTMLElement,
  timeoutMs = 10000
): Promise<void> => {
  const pane = root.querySelector('.leaflet-tile-pane');
  if (!pane) return;

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const tiles = Array.from(pane.querySelectorAll<HTMLElement>('.leaflet-tile'));
    const pending = tiles.filter((tile) => {
      if (!tile.classList.contains('leaflet-tile-loaded')) return true;
      if (tile instanceof HTMLImageElement) {
        return !tile.complete || tile.naturalWidth === 0;
      }
      return false;
    });
    if (pending.length === 0) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      return;
    }
    await new Promise<void>((resolve) => window.setTimeout(resolve, 50));
  }
};

// 处理跨域图片（勿改已绘制的 Leaflet 瓦片：写 crossOrigin 会触发重载，导出时易截到半透明淡入）
const prepareCorsImages = (element: HTMLElement): void => {
  const images = element.querySelectorAll('img');
  images.forEach((img) => {
    if (img.classList.contains('leaflet-tile') || img.closest('.leaflet-tile-pane')) return;
    // 已解码完成的图再改 crossOrigin 也会重载，跳过
    if (img.complete && img.naturalWidth > 0) return;
    if (img.src && img.src.startsWith('http') && !img.crossOrigin) {
      try {
        img.crossOrigin = 'anonymous';
      } catch (e) {
        console.warn('Failed to set crossOrigin on image:', img.src);
      }
    }
  });
};

// 导出当前视图的中心对齐截图
export type WorkspaceSnapshotView = 'map' | 'board' | 'graph';

export type WorkspaceSnapshotOptions = {
  includeBackground?: boolean;
  includeBorder?: boolean;
  includePins?: boolean;
};

/**
 * 导出当前工作区视口。
 * 三种视图共用尺寸、编码和 UI 过滤流程，图层差异只保留在明确的视图分支中。
 */
export const exportWorkspaceSnapshot = async (
  elementId: string,
  fileName: string,
  pixelRatio: number = Math.min(2, window.devicePixelRatio || 1),
  options: WorkspaceSnapshotOptions = {
    includeBackground: true,
    includeBorder: true,
    includePins: true
  },
  viewOverride?: WorkspaceSnapshotView
) => {
  const node = document.getElementById(elementId);
  if (!node) {
    window.alert('无法找到要导出的视图');
    return;
  }

  const view: WorkspaceSnapshotView =
    viewOverride ??
    (elementId === 'map-view-container'
      ? 'map'
      : elementId === 'graph-view-container'
        ? 'graph'
        : 'board');
  const exportAsPng = options.includeBackground === false;
  const rect = node.getBoundingClientRect();
  const exportWidth = Math.max(1, Math.round(rect.width));
  const exportHeight = Math.max(1, Math.round(rect.height));
  const originalBackgrounds = new Map<
    HTMLElement,
    { background: string; backgroundPriority: string; backgroundColor: string; backgroundColorPriority: string }
  >();

  const setTransparentBackground = (element: HTMLElement | null) => {
    if (!element || originalBackgrounds.has(element)) return;
    originalBackgrounds.set(element, {
      background: element.style.getPropertyValue('background'),
      backgroundPriority: element.style.getPropertyPriority('background'),
      backgroundColor: element.style.getPropertyValue('background-color'),
      backgroundColorPriority: element.style.getPropertyPriority('background-color')
    });
    element.style.setProperty('background', 'none', 'important');
    element.style.setProperty('background-color', 'transparent', 'important');
  };

  const restoreInlineProperty = (
    element: HTMLElement,
    name: 'background' | 'background-color',
    value: string,
    priority: string
  ) => {
    if (value) element.style.setProperty(name, value, priority);
    else element.style.removeProperty(name);
  };

  try {
    if (exportAsPng) {
      setTransparentBackground(node);
      if (view === 'map') {
        setTransparentBackground(node.querySelector<HTMLElement>('.leaflet-container'));
      } else if (view === 'graph') {
        setTransparentBackground(node.querySelector<HTMLElement>('.workspace-canvas--graph'));
      }
    }

    const leafletContainer =
      view === 'map' ? node.querySelector<HTMLElement>('.leaflet-container') : null;
    if (leafletContainer) {
      leafletContainer.classList.add('mapp-snapshot-exporting');
    }

    try {
      prepareCorsImages(node);
      if (view === 'map' && options.includeBackground !== false) {
        await waitForLeafletTilesReady(node);
      }
      await waitForImagesLoaded(node);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      const filter = (candidate: HTMLElement) => {
        if (!(candidate instanceof Element)) return true;
        if (candidate.closest('[data-mapp-export-keep]')) return true;
        if (candidate.closest('[data-mapp-export-ui]')) return false;
        if (candidate.matches('button, input, select, textarea')) return false;
        if (candidate.classList.contains('fixed')) return false;

        if (view === 'map') {
          if (candidate.closest('.leaflet-control-zoom')) return false;
          if (
            options.includeBackground === false &&
            candidate.closest('.leaflet-tile-pane, .leaflet-shadow-pane')
          ) {
            return false;
          }
          if (options.includeBorder === false && candidate.closest('.leaflet-overlay-pane')) {
            return false;
          }
          if (
            options.includePins === false &&
            candidate.closest('.leaflet-marker-pane, .custom-text-label')
          ) {
            return false;
          }
        }

        if (view === 'board') {
          if (
            options.includeBackground === false &&
            candidate instanceof HTMLElement &&
            candidate.style.backgroundImage.includes('radial-gradient')
          ) {
            return false;
          }
          if (options.includeBorder === false && candidate.closest('[data-board-export-frame]')) {
            return false;
          }
          if (options.includePins === false && candidate.closest('[data-is-note="true"]')) {
            return false;
          }
        }

        return true;
      };

      const computedBackground = window.getComputedStyle(node).backgroundColor;
      const opaqueFallback =
        computedBackground && computedBackground !== 'rgba(0, 0, 0, 0)'
          ? computedBackground
          : '#f9fafb';
      const render = exportAsPng ? toPng : toJpeg;
      const dataUrl = await render(node, {
        quality: 0.95,
        pixelRatio: Math.min(4, Math.max(1, pixelRatio)),
        backgroundColor: exportAsPng ? 'transparent' : opaqueFallback,
        width: exportWidth,
        height: exportHeight,
        skipFonts: true,
        includeQueryParams: true,
        imagePlaceholder:
          'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=',
        filter
      });

      const link = document.createElement('a');
      link.download = `${fileName}.${exportAsPng ? 'png' : 'jpg'}`;
      link.href = dataUrl;
      link.click();
    } finally {
      leafletContainer?.classList.remove('mapp-snapshot-exporting');
    }
  } catch (error) {
    console.error('Export failed:', error);
    window.alert('导出失败，请重试');
  } finally {
    originalBackgrounds.forEach((style, element) => {
      restoreInlineProperty(
        element,
        'background',
        style.background,
        style.backgroundPriority
      );
      restoreInlineProperty(
        element,
        'background-color',
        style.backgroundColor,
        style.backgroundColorPriority
      );
    });
  }
};
