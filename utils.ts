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

export const exportToJpeg = async (elementId: string, fileName: string) => {
  const node = document.getElementById(elementId);
  if (!node) {
    alert('Could not find view to export');
    return;
  }

  try {
    // 处理跨域图片
    handleCorsImages(node as HTMLElement);

    // 等待所有图片加载完成
    await checkImagesLoaded(node as HTMLElement);

    // 等待一帧确保图片占位符渲染
    await new Promise(resolve => requestAnimationFrame(resolve));

    const dataUrl = await toJpeg(node, {
      quality: 0.95,
      width: 1920,
      height: 1080,
      canvasWidth: 1920,
      canvasHeight: 1080,
      backgroundColor: '#f9fafb', // gray-50
      style: {
        transform: 'none', // Reset transforms to capture full content if needed, though for fixed viewport this is tricky
        overflow: 'hidden'
      },
      skipFonts: true,
      includeQueryParams: true,
    });

    const link = document.createElement('a');
    link.download = `${fileName}.jpg`;
    link.href = dataUrl;
    link.click();
  } catch (error) {
    console.error('Export failed', error);

    // 提供更详细的错误信息
    let errorMessage = 'Failed to export image.';
    if (error instanceof Error) {
      if (error.message.includes('cross-origin') || error.message.includes('CORS')) {
        errorMessage = 'Export failed: Cross-origin image restrictions. Please refresh and try again.';
      } else if (error.message.includes('canvas') || error.message.includes('Canvas')) {
        errorMessage = 'Export failed: Canvas rendering error, possibly due to unsupported image format.';
      } else if (error.message.includes('network') || error.message.includes('Network')) {
        errorMessage = 'Export failed: Network error, please check if image links are valid.';
  }
    }

    alert(errorMessage);
  }
};

// 检查图片是否加载完成
const checkImagesLoaded = (element: HTMLElement): Promise<void> => {
  return new Promise((resolve, reject) => {
    const images = element.querySelectorAll('img');
    if (images.length === 0) {
      resolve();
      return;
    }

    let loadedCount = 0;
    let hasError = false;
    const totalImages = images.length;

    const onImageLoad = () => {
      loadedCount++;
      if (loadedCount === totalImages && !hasError) {
        resolve();
      }
    };

    const onImageError = (img: HTMLImageElement, event: Event) => {
      console.warn('Image failed to load during export:', img.src, event);
      hasError = true;

      // 为失败的图片设置占位符
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width || 100;
      canvas.height = img.naturalHeight || img.height || 100;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#f3f4f6';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#6b7280';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('图片加载失败', canvas.width / 2, canvas.height / 2);
        img.src = canvas.toDataURL();
      }

      onImageLoad();
    };

    images.forEach((img) => {
      if (img.complete && img.naturalHeight > 0) {
        // 图片已经加载完成
        onImageLoad();
      } else {
        // 监听加载事件
        img.addEventListener('load', onImageLoad);
        img.addEventListener('error', (e) => onImageError(img, e));

        // 设置超时
        setTimeout(() => {
          if (!img.complete) {
            console.warn('Image load timeout:', img.src);
            onImageError(img, new Event('timeout'));
          }
        }, 5000); // 5秒超时
      }
    });
  });
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
export const exportToJpegCentered = async (
  elementId: string, 
  fileName: string, 
  pixelRatio: number = Math.min(2, window.devicePixelRatio || 1),
  options: { includeBackground?: boolean; includeBorder?: boolean; includePins?: boolean } = { includeBackground: true, includeBorder: true, includePins: true }
) => {
  const node = document.getElementById(elementId);
  if (!node) {
    alert('无法找到要导出的视图');
    return;
  }

  // 记录需要恢复的状态
  const originalStyles = new Map<HTMLElement, { display: string, background: string, backgroundColor: string }>();
  const uiElements = document.querySelectorAll('.fixed, .absolute, [class*="z-["]');
  const originalUIDisplays: string[] = [];

  try {
    // 1. 隐藏 UI 元素
    uiElements.forEach((el, index) => {
      const htmlEl = el as HTMLElement;
      originalUIDisplays[index] = htmlEl.style.display;
      // 图谱节点 HTML label 等需进截图，勿当控件隐藏
      if (
        htmlEl.hasAttribute('data-mapp-export-keep') ||
        htmlEl.closest('[data-mapp-export-keep]')
      ) {
        return;
      }
      // 只隐藏按钮、控件、下拉菜单等UI元素，不隐藏地图容器
      if (htmlEl.tagName === 'BUTTON' || 
          htmlEl.className.includes('pointer-events-auto') ||
          htmlEl.className.includes('z-[500]') ||
          htmlEl.className.includes('z-[400]') ||
          htmlEl.className.includes('z-[4000]') ||
          htmlEl.className.includes('z-50') ||
          htmlEl.className.includes('shadow-lg') ||
          htmlEl.className.includes('rounded-xl') ||
          htmlEl.tagName === 'DIV' && htmlEl.className.includes('absolute') && !htmlEl.id.includes('container')) {
        htmlEl.style.display = 'none';
      }
    });

    // 2. 识别并处理图层
    const isMapView = node.id === 'map-view-container';
    const exportAsPng = options.includeBackground === false;

    // 找出所有背景相关元素
    const backgroundElements: HTMLElement[] = [];
    if (isMapView) {
      const bg = node.querySelector('.leaflet-tile-pane');
      const shadow = node.querySelector('.leaflet-shadow-pane');
      const container = node.querySelector('.leaflet-container');
      if (bg) backgroundElements.push(bg as HTMLElement);
      if (shadow) backgroundElements.push(shadow as HTMLElement);
      if (container) backgroundElements.push(container as HTMLElement);
    } else {
      // BoardView 背景
      const gridBg = Array.from(node.querySelectorAll('div')).find(el => 
        el.style.backgroundImage && el.style.backgroundImage.includes('radial-gradient')
      );
      if (gridBg) backgroundElements.push(gridBg as HTMLElement);
      
      const containerBg = node.querySelector('.bg-gray-50');
      if (containerBg) backgroundElements.push(containerBg as HTMLElement);
    }
    // 根节点也可能是背景来源
    backgroundElements.push(node);

    // 处理背景
    if (exportAsPng) {
      backgroundElements.forEach(el => {
        originalStyles.set(el, { 
          display: el.style.display, 
          background: el.style.background, 
          backgroundColor: el.style.backgroundColor 
        });
        
        // 如果是纯背景层则隐藏，如果是容器则透明
        if (el.classList.contains('leaflet-tile-pane') || (el.style.backgroundImage && el.style.backgroundImage.includes('radial-gradient'))) {
          el.style.display = 'none';
        } else {
          el.style.setProperty('background', 'none', 'important');
          el.style.setProperty('background-color', 'transparent', 'important');
        }
      });
    }

    // 处理边界 (Border/Frames)
    if (options.includeBorder === false) {
      if (isMapView) {
        const border = node.querySelector('.leaflet-overlay-pane');
        if (border) {
          const el = border as HTMLElement;
          if (!originalStyles.has(el)) originalStyles.set(el, { display: el.style.display, background: el.style.background, backgroundColor: el.style.backgroundColor });
          el.style.display = 'none';
        }
      } else {
        const frames = node.querySelectorAll('div[style*="z-index: 10"], div[style*="z-index:10"]');
        frames.forEach(f => {
          const el = f as HTMLElement;
          if (el.style.position === 'absolute') {
            if (!originalStyles.has(el)) originalStyles.set(el, { display: el.style.display, background: el.style.background, backgroundColor: el.style.backgroundColor });
            el.style.display = 'none';
          }
        });
        const connections = node.querySelector('svg');
        if (connections) {
          const el = connections as unknown as HTMLElement;
          if (!originalStyles.has(el)) originalStyles.set(el, { display: el.style.display, background: el.style.background, backgroundColor: el.style.backgroundColor });
          el.style.display = 'none';
        }
      }
    }

    // 处理标记 (Pins/Notes)
    if (options.includePins === false) {
      if (isMapView) {
        const pins = node.querySelector('.leaflet-marker-pane');
        if (pins) {
          const el = pins as HTMLElement;
          if (!originalStyles.has(el)) originalStyles.set(el, { display: el.style.display, background: el.style.background, backgroundColor: el.style.backgroundColor });
          el.style.display = 'none';
        }
        const labels = node.querySelectorAll('.custom-text-label');
        labels.forEach(l => {
          const el = l as HTMLElement;
          if (!originalStyles.has(el)) originalStyles.set(el, { display: el.style.display, background: el.style.background, backgroundColor: el.style.backgroundColor });
          el.style.display = 'none';
        });
      } else {
        const notes = node.querySelectorAll('[data-is-note="true"]');
        notes.forEach(n => {
          const el = n as HTMLElement;
          if (!originalStyles.has(el)) originalStyles.set(el, { display: el.style.display, background: el.style.background, backgroundColor: el.style.backgroundColor });
          el.style.display = 'none';
        });
      }
    }

    // 等待渲染
    await new Promise(resolve => requestAnimationFrame(resolve));
    handleCorsImages(node as HTMLElement);
    await checkImagesLoaded(node as HTMLElement);
    await new Promise(resolve => setTimeout(resolve, 1000));
    await new Promise(resolve => requestAnimationFrame(resolve));
    
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // 执行导出
    const htmlToImage = await import('html-to-image');
    const toImage = exportAsPng ? htmlToImage.toPng : htmlToImage.toJpeg;
    
    const dataUrl = await toImage(node, {
      quality: 0.95,
      pixelRatio: pixelRatio,
      backgroundColor: exportAsPng ? 'transparent' : '#f9fafb',
      width: viewportWidth,
      height: viewportHeight,
      skipFonts: true,
      includeQueryParams: true,
    });

    // 直接下载
    const link = document.createElement('a');
    link.download = `${fileName}.${exportAsPng ? 'png' : 'jpg'}`;
    link.href = dataUrl;
    link.click();

  } catch (error) {
    console.error('Export failed:', error);
    alert('导出失败，请重试');
  } finally {
    // 恢复所有状态
    originalStyles.forEach((style, el) => {
      el.style.display = style.display;
      el.style.background = style.background;
      el.style.backgroundColor = style.backgroundColor;
    });

    uiElements.forEach((el, index) => {
      (el as HTMLElement).style.display = originalUIDisplays[index];
    });
  }
};
