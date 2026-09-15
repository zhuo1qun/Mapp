import { TAG_COLORS } from './constants';
import { Tag } from './types';
import { toJpeg, toPng } from 'html-to-image';

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

// Convert HEIC to JPEG/PNG if needed
const convertHeicIfNeeded = async (file: File): Promise<File> => {
  // Check if file is HEIC format
  const isHeic = file.type === 'image/heic' || 
                 file.type === 'image/heif' || 
                 file.name.toLowerCase().endsWith('.heic') ||
                 file.name.toLowerCase().endsWith('.heif');
  
  if (!isHeic) {
    return file;
  }
  
  // Dynamically import heic2any to avoid issues with ESM/CommonJS
  const heic2anyModule = await import('heic2any');
  // heic2any can be exported as default or named export
  const heic2anyFn = (heic2anyModule as any).default || heic2anyModule;
  
  // Try multiple conversion methods for better compatibility with iPhone 15 Pro HEIF
  const conversionMethods = [
    { toType: 'image/jpeg', quality: 0.9, extension: '.jpg', mimeType: 'image/jpeg' },
    { toType: 'image/jpeg', quality: 0.8, extension: '.jpg', mimeType: 'image/jpeg' },
    { toType: 'image/png', quality: undefined, extension: '.png', mimeType: 'image/png' }
  ];
  
  let lastError: any = null;
  
  for (const method of conversionMethods) {
    try {
      const options: any = {
        blob: file,
        toType: method.toType
      };
      if (method.quality !== undefined) {
        options.quality = method.quality;
      }
      
      const convertedBlob = await heic2anyFn(options);
      
      // heic2any returns an array, get the first item
      const blob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
      
      if (!blob) {
        throw new Error('Conversion returned empty result');
      }
      
      // Create a new File object from the converted blob
      const newFileName = file.name.replace(/\.(heic|heif)$/i, method.extension);
      return new File([blob], newFileName, {
        type: method.mimeType,
        lastModified: file.lastModified
      });
    } catch (error: any) {
      console.log(`HEIC conversion failed with ${method.toType} (quality: ${method.quality}):`, error);
      lastError = error;
      // Continue to next method
      continue;
    }
  }
  
  // All conversion methods failed
  console.error('All HEIC conversion methods failed. Last error:', lastError);
  const errorMessage = lastError?.message || 'Unknown error';
  
  // Check for specific error types
  if (errorMessage.includes('ERR_LIBHEIF') || errorMessage.includes('format not supported')) {
    const detailedError = `无法转换此 HEIC/HEIF 文件

可能原因：
• iPhone 15 Pro 等新设备使用了更新的 HEIF 格式
• 浏览器端转换库暂不支持此格式

解决方案（推荐按顺序尝试）：
1. 【最简单】在 iPhone 上更改设置：
   设置 > 相机 > 格式 > 选择"兼容性最佳"
   这样新照片会直接保存为 JPEG 格式

2. 使用 Mac 预览应用转换：
   打开图片 > 文件 > 导出 > 选择 JPEG 格式

3. 使用在线转换工具：
   • https://cloudconvert.com/heic-to-jpg
   • https://convertio.co/zh/heic-jpg/
   • https://heictojpeg.com/

4. 使用 App Store 中的转换应用

注意：这是浏览器端转换库的技术限制，不是应用的问题。`;
    throw new Error(detailedError);
  }
  
  throw new Error(`HEIC/HEIF 图片转换失败: ${errorMessage}\n\n请尝试将图片转换为 JPEG/PNG 格式后重试。`);
};

// Compress image before converting to base64
export const compressImage = (file: File, maxWidth: number = 1920, maxHeight: number = 1920, quality: number = 0.8): Promise<string> => {
  return new Promise(async (resolve, reject) => {
    try {
      // Convert HEIC if needed
      const processedFile = await convertHeicIfNeeded(file);
      
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
      const processedFile = await convertHeicIfNeeded(file);
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
const checkImagesLoaded = async (element: HTMLElement): Promise<void> => {
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
// 处理跨域图片
const handleCorsImages = (element: HTMLElement): void => {
  const images = element.querySelectorAll('img');
  images.forEach((img) => {
    // 如果图片是跨域的，尝试添加 crossOrigin 属性
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

    handleCorsImages(node);
    await checkImagesLoaded(node);
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
