import { get, set, del, keys } from 'idb-keyval';
import { Project, Note } from '../../types';
import type { NoteImageRef, ProjectKind } from '../../types';
import type { GraphLayoutMode } from '../graph/graphRuntimeCore';
import { normalizeProjectConnections } from '../graph/graphData';
import { sanitizeProjectKind } from '../projectKind';
import { normalizeNotesToSingleFrame } from '../frame/noteFrameMembership';
import { coerceGraphLayoutMode } from '../graph/graphRuntimeCore';
import {
  IMAGE_PREFIX,
  SKETCH_PREFIX,
  extractMediaId,
  findMediaIdByContentHash,
  generateMediaId,
  hashMediaPayload,
  isMediaRefId,
  loadMediaDataUrl,
  mediaRecordExists,
  syncNoteImageRefs,
  writeMediaRecordFromDataUrl
} from './imageAssetStore';
import { ensureNoteMediaSynced } from './noteMediaSync';

// Storage keys
const PROJECT_LIST_KEY = 'mapp-project-list';
const PROJECT_PREFIX = 'mapp-project-';
const BACKGROUND_IMAGE_PREFIX = 'mapp-bg-';
const STORAGE_VERSION_KEY = 'mapp-storage-version';
/** v3：图片以 Blob+ImageAsset 存储；Note 持有 imageRefs / asset id */
const CURRENT_STORAGE_VERSION = 3;

/** 连线规范化（删孤儿边、箭头方向修正）后待写回 IndexedDB 的项目 id */
const projectIdsPendingConnectionMigration = new Set<string>();

// View position cache (sessionStorage, cleared on page close or project switch)
const getViewPositionCacheKey = (projectId: string, viewType: 'map' | 'board'): string => {
  return `mapp-view-pos-${projectId}-${viewType}`;
};

export function getViewPositionCache(projectId: string, viewType: 'map' | 'board'): { center?: [number, number], zoom?: number, x?: number, y?: number, scale?: number } | null {
  try {
    const key = getViewPositionCacheKey(projectId, viewType);
    const cached = sessionStorage.getItem(key);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (err) {
    console.warn('Failed to load view position cache', err);
  }
  return null;
}

export function setViewPositionCache(projectId: string, viewType: 'map' | 'board', position: { center?: [number, number], zoom?: number, x?: number, y?: number, scale?: number }): void {
  try {
    const key = getViewPositionCacheKey(projectId, viewType);
    sessionStorage.setItem(key, JSON.stringify(position));
  } catch (err) {
    console.warn('Failed to save view position cache', err);
  }
}

const getGraphLayoutCacheKey = (projectId: string): string => `mapp-graph-layout-${projectId}`;

export function getGraphLayoutCache(projectId: string): GraphLayoutMode | null {
  if (!projectId) return null;
  try {
    const raw = sessionStorage.getItem(getGraphLayoutCacheKey(projectId));
    if (raw === 'time' || raw === 'cose') return raw;
    // 历史 frameCluster → 由 coerceGraphLayoutMode 统一回退
    if (raw === 'frameCluster') return coerceGraphLayoutMode(raw);
  } catch (err) {
    console.warn('Failed to load graph layout cache', err);
  }
  return null;
}

export function setGraphLayoutCache(projectId: string, mode: GraphLayoutMode): void {
  if (!projectId) return;
  try {
    sessionStorage.setItem(getGraphLayoutCacheKey(projectId), mode);
  } catch (err) {
    console.warn('Failed to save graph layout cache', err);
  }
}

export function clearViewPositionCache(projectId: string): void {
  try {
    sessionStorage.removeItem(getViewPositionCacheKey(projectId, 'map'));
    sessionStorage.removeItem(getViewPositionCacheKey(projectId, 'board'));
    sessionStorage.removeItem(getGraphLayoutCacheKey(projectId));
  } catch (err) {
    console.warn('Failed to clear view position cache', err);
  }
}

// 生成图片 ID
function generateImageId(): string {
  return generateMediaId();
}

function extractImageId(imageData: string): string | null {
  return extractMediaId(imageData);
}

// 检查 IndexedDB 存储使用情况
export async function checkStorageUsage(): Promise<{ used: number, available: number, percentage: number } | null> {
  try {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      const used = estimate.usage || 0;
      const quota = estimate.quota || 0;
      const available = quota - used;
      const percentage = quota > 0 ? (used / quota) * 100 : 0;

      return {
        used: used / (1024 * 1024), // MB
        available: available / (1024 * 1024), // MB
        percentage
      };
    }
  } catch (error) {
    console.warn('Cannot check storage usage:', error);
  }
  return null;
}

// 分析重复图片的详细信息
export async function analyzeDuplicateImages(): Promise<{
  duplicateGroups: Array<{
    hash: string;
    count: number;
    size: number;
    ids: string[];
    timestamps: number[];
    sampleData: string;
  }>;
  suspiciousGroups: Array<{
    hash: string;
    count: number;
    reason: string;
    ids: string[];
    timestamps: number[];
  }>;
} | null> {
  try {
    const allKeys = await keys();
    const imageKeys = allKeys.filter(key =>
      typeof key === 'string' && (key as string).startsWith(IMAGE_PREFIX)
    );

    console.log(`Analyzing ${imageKeys.length} images for detailed duplicate patterns...`);
    const hashMap = new Map<string, {
      count: number;
      size: number;
      ids: string[];
      timestamps: number[];
      sampleData: string;
    }>();

    for (const key of imageKeys) {
      try {
        const data = await get<string>(key as string);
        if (data) {
          const hash = await calculateImageHash(data);
          const size = (data.length * 3) / 4 / (1024 * 1024); // MB

          // 提取时间戳 (从ID中提取)
          const id = (key as string).replace(IMAGE_PREFIX, '');
          const timestampMatch = id.match(/img-(\d+)-/);
          const timestamp = timestampMatch ? parseInt(timestampMatch[1]) : 0;

          if (hashMap.has(hash)) {
            const existing = hashMap.get(hash)!;
            existing.count++;
            existing.size += size;
            existing.ids.push(id);
            existing.timestamps.push(timestamp);
          } else {
            hashMap.set(hash, {
              count: 1,
              size,
              ids: [id],
              timestamps: [timestamp],
              sampleData: data.substring(0, 100) // 保存前100个字符用于分析
            });
          }
        }
      } catch (error) {
        console.warn(`Failed to analyze image ${key}:`, error);
      }
    }

    // 只保留重复的组
    const duplicateGroups = Array.from(hashMap.entries())
      .filter(([, info]) => info.count > 1)
      .map(([hash, info]) => ({
        hash,
        count: info.count,
        size: info.size,
        ids: info.ids,
        timestamps: info.timestamps,
        sampleData: info.sampleData
      }))
      .sort((a, b) => b.size - a.size);

    // 识别可疑的重复组
    const suspiciousGroups = duplicateGroups
      .filter(group => {
        const timestamps = group.timestamps;
        const minTime = Math.min(...timestamps);
        const maxTime = Math.max(...timestamps);
        const timeSpan = maxTime - minTime;

        // 如果多个图片在很短时间内生成，认为是可疑的
        if (timeSpan < 1000 && group.count > 2) { // 1秒内生成多个重复
          return { reason: 'Multiple duplicates created within 1 second', timeSpan };
        }

        // 如果时间戳完全相同
        if (timeSpan === 0 && group.count > 1) {
          return { reason: 'Exact same timestamp for multiple images', timeSpan: 0 };
        }

        return false;
      })
      .map(group => {
        const timestamps = group.timestamps;
        const minTime = Math.min(...timestamps);
        const maxTime = Math.max(...timestamps);
        const timeSpan = maxTime - minTime;

        let reason = '';
        if (timeSpan === 0) {
          reason = 'Exact same timestamp - possible batch import error';
        } else if (timeSpan < 1000) {
          reason = `Created within ${timeSpan}ms - possible rapid successive saves`;
        }

        return {
          hash: group.hash,
          count: group.count,
          reason,
          ids: group.ids,
          timestamps: group.timestamps
        };
      });

    console.log(`Found ${duplicateGroups.length} duplicate groups, ${suspiciousGroups.length} suspicious`);

    return {
      duplicateGroups,
      suspiciousGroups
    };
  } catch (error) {
    console.error('Failed to analyze duplicate images:', error);
    return null;
  }
}

// 分析存储冗余情况
export async function analyzeStorageRedundancy(): Promise<{
  uniqueImages: number;
  duplicateImages: number;
  uniqueSketches: number;
  duplicateSketches: number;
  redundantSpace: number;
  duplicateGroups: Array<{
    hash: string;
    count: number;
    size: number;
    ids: string[];
  }>;
} | null> {
  try {
    const allKeys = await keys();
    const imageKeys = allKeys.filter(key =>
      typeof key === 'string' && (key as string).startsWith(IMAGE_PREFIX)
    );
    const sketchKeys = allKeys.filter(key =>
      typeof key === 'string' && (key as string).startsWith(SKETCH_PREFIX)
    );

    const hashMap = new Map<string, { count: number; size: number; ids: string[] }>();
    let totalRedundantSpace = 0;

    // 分析图片冗余
    console.log(`Analyzing ${imageKeys.length} images for redundancy...`);
    let processedCount = 0;

    for (const key of imageKeys) {
      try {
        const data = await get<string>(key as string);
        if (data) {
          const hash = await calculateImageHash(data);
          const size = (data.length * 3) / 4 / (1024 * 1024); // MB

          if (hashMap.has(hash)) {
            const existing = hashMap.get(hash)!;
            existing.count++;
            existing.size += size;
            existing.ids.push((key as string).replace(IMAGE_PREFIX, ''));
            totalRedundantSpace += size;
            console.log(`Found duplicate: ${key} matches existing group (hash: ${hash.substring(0, 16)})`);
          } else {
            hashMap.set(hash, { count: 1, size, ids: [(key as string).replace(IMAGE_PREFIX, '')] });
          }
        }

        processedCount++;
        if (processedCount % 10 === 0) {
          console.log(`Processed ${processedCount}/${imageKeys.length} images...`);
        }
      } catch (error) {
        console.warn(`Failed to analyze image ${key}:`, error);
      }
    }

    // 统计重复组
    const duplicateGroupsTemp = Array.from(hashMap.entries())
      .filter(([, info]) => info.count > 1)
      .map(([hash, info]) => ({
        hash,
        count: info.count,
        size: info.size,
        ids: info.ids
      }))
      .sort((a, b) => b.size - a.size);

    console.log(`Image analysis complete. Found ${duplicateGroupsTemp.length} duplicate groups.`);

    const duplicateImages = duplicateGroupsTemp.reduce((sum, group) => sum + group.count - 1, 0);
    const uniqueImages = imageKeys.length - duplicateImages;

    // 分析涂鸦（简化版）
    const sketchHashMap = new Map<string, number>();
    for (const key of sketchKeys) {
      try {
        const data = await get<string>(key as string);
        if (data) {
          const hash = await calculateImageHash(data);
          sketchHashMap.set(hash, (sketchHashMap.get(hash) || 0) + 1);
        }
      } catch (error) {
        // 忽略错误
      }
    }

    const duplicateSketches = Array.from(sketchHashMap.values())
      .filter(count => count > 1)
      .reduce((sum, count) => sum + count - 1, 0);
    const uniqueSketches = sketchKeys.length - duplicateSketches;

    console.log('Duplicate analysis details:');
    duplicateGroupsTemp.slice(0, 5).forEach((group, index) => {
      console.log(`Group ${index + 1}: ${group.count} duplicates, ${group.size.toFixed(2)}MB total, hash: ${group.hash}`);
      console.log(`  IDs: ${group.ids.join(', ')}`);
    });

    return {
      uniqueImages,
      duplicateImages,
      uniqueSketches,
      duplicateSketches,
      redundantSpace: totalRedundantSpace,
      duplicateGroups: duplicateGroupsTemp
    };
  } catch (error) {
    console.error('Failed to analyze storage redundancy:', error);
    return null;
  }
}

// 检查 IndexedDB 中存储的数据详情
export async function checkStorageDetails(): Promise<{
  totalKeys: number;
  imageKeys: number;
  sketchKeys: number;
  projectKeys: number;
  totalImageSize: number;
  largestImages: Array<{ key: string, size: number }>;
} | null> {
  try {
    const allKeys = await keys();

    const imageKeys = allKeys.filter(key =>
      typeof key === 'string' && (key as string).startsWith(IMAGE_PREFIX)
    );
    const sketchKeys = allKeys.filter(key =>
      typeof key === 'string' && (key as string).startsWith(SKETCH_PREFIX)
    );
    const projectKeys = allKeys.filter(key =>
      typeof key === 'string' && (
        (key as string).startsWith(PROJECT_PREFIX) ||
        (key as string) === PROJECT_LIST_KEY ||
        (key as string).startsWith(BACKGROUND_IMAGE_PREFIX) ||
        (key as string).startsWith('mapp-')
      )
    );

    let totalImageSize = 0;
    const imageSizes: Array<{ key: string, size: number }> = [];

    // 检查图片和涂鸦的大小
    for (const key of [...imageKeys, ...sketchKeys]) {
      try {
        const data = await get<string>(key as string);
        if (data && typeof data === 'string') {
          const size = data.length;
          totalImageSize += size;
          imageSizes.push({ key: key as string, size });
        }
      } catch (error) {
        console.warn(`Failed to check size for ${key}:`, error);
      }
    }

    // 按大小排序，找出最大的几个
    const largestImages = imageSizes
      .sort((a, b) => b.size - a.size)
      .slice(0, 10);

    return {
      totalKeys: allKeys.length,
      imageKeys: imageKeys.length,
      sketchKeys: sketchKeys.length,
      projectKeys: projectKeys.length,
      totalImageSize: totalImageSize / (1024 * 1024), // MB
      largestImages: largestImages.map(item => ({
        key: item.key,
        size: item.size / (1024 * 1024) // MB
      }))
    };
  } catch (error) {
    console.error('Failed to check storage details:', error);
    return null;
  }
}

// 计算图片数据的哈希值（用于去重 / 分析工具）
async function calculateImageHash(imageData: string): Promise<string> {
  const full = await hashMediaPayload(imageData);
  return full.substring(0, 32);
}

async function findExistingImageId(imageData: string): Promise<string | null> {
  try {
    const imageHash = await hashMediaPayload(imageData);
    return findMediaIdByContentHash(IMAGE_PREFIX, imageHash);
  } catch (error) {
    console.warn('Failed to check for existing image:', error);
    return null;
  }
}

/** 保存图片资产（Blob + ImageAsset），返回 asset id */
export async function saveImage(base64Data: string): Promise<string> {
  if (!base64Data || !base64Data.startsWith('data:image/')) {
    throw new Error('Invalid image data: not a valid Base64 image');
  }

  const dataSizeMB = (base64Data.length * 3) / 4 / (1024 * 1024);
  if (dataSizeMB > 10) {
    console.warn(`Large image detected: ${dataSizeMB.toFixed(2)}MB, may cause storage issues`);
  }

  const contentHash = await hashMediaPayload(base64Data);
  // The legacy contentHash samples the payload. Verify full content before reusing
  // an asset, otherwise different photos with matching samples share the wrong pixels.
  const existingId = await findMediaIdByContentHash(IMAGE_PREFIX, contentHash, base64Data);
  if (existingId) {
    console.log(`Reusing existing image: ${existingId}`);
    return existingId;
  }

  const imageId = generateImageId();
  try {
    await writeMediaRecordFromDataUrl(IMAGE_PREFIX, imageId, base64Data, {
      kind: 'image',
      contentHash
    });
    console.log(`Saved new image asset: ${imageId} (${dataSizeMB.toFixed(2)}MB)`);
    return imageId;
  } catch (error) {
    console.error('Failed to save image:', error);
    throw error;
  }
}

// 添加图片到项目的引用
export async function addImageToProject(imageId: string, projectId: string): Promise<void> {
  try {
    const key = `${IMAGE_PREFIX}${imageId}`;
    const currentData = await get(key);

    if (!currentData) {
      console.warn(`Image ${imageId} not found`);
      return;
    }

    // 处理新旧格式的兼容性
    let imageData: any;
    if (typeof currentData === 'string') {
      // 旧格式：纯字符串
      imageData = {
        data: currentData,
        projects: [projectId],
        createdAt: Date.now(),
        size: currentData.length
      };
    } else {
      // 新格式：对象
      imageData = { ...currentData };
      if (!imageData.projects) {
        imageData.projects = [];
      }
      if (!imageData.projects.includes(projectId)) {
        imageData.projects.push(projectId);
      }
    }

    await set(key, imageData);
  } catch (error) {
    console.warn(`Failed to add image ${imageId} to project ${projectId}:`, error);
  }
}

// 从项目引用中移除图片
export async function removeImageFromProject(imageId: string, projectId: string): Promise<void> {
  try {
    const key = `${IMAGE_PREFIX}${imageId}`;
    const currentData = await get(key);

    if (!currentData || typeof currentData === 'string') {
      // 旧格式或不存在，直接返回
      return;
    }

    const imageData = { ...currentData };
    if (imageData.projects) {
      imageData.projects = imageData.projects.filter((pid: string) => pid !== projectId);
    }

    await set(key, imageData);
  } catch (error) {
    console.warn(`Failed to remove image ${imageId} from project ${projectId}:`, error);
  }
}

// 获取图片被哪些项目引用
export async function getImageProjects(imageId: string): Promise<string[]> {
  try {
    const currentData = await get(`${IMAGE_PREFIX}${imageId}`);
    if (!currentData) return [];

    if (typeof currentData === 'string') {
      // 旧格式，没有项目信息
      return [];
    }

    return currentData.projects || [];
  } catch (error) {
    console.warn(`Failed to get projects for image ${imageId}:`, error);
    return [];
  }
}

// 从所有媒体文件中移除项目的引用
export async function removeProjectFromAllMedia(projectId: string): Promise<void> {
  try {
    const allKeys = await keys();
    const mediaKeys = allKeys.filter(key =>
      typeof key === 'string' && (
        (key as string).startsWith(IMAGE_PREFIX) ||
        (key as string).startsWith(SKETCH_PREFIX)
      )
    );

    console.log(`Removing project ${projectId} from ${mediaKeys.length} media files`);

    const updatePromises: Promise<void>[] = [];

    for (const key of mediaKeys) {
      updatePromises.push(
        (async () => {
          try {
            const currentData = await get(key);
            if (!currentData || typeof currentData === 'string') {
              // 旧格式或不存在，跳过
              return;
            }

            const mediaData = { ...currentData };
            if (mediaData.projects && Array.isArray(mediaData.projects)) {
              const originalLength = mediaData.projects.length;
              mediaData.projects = mediaData.projects.filter((pid: string) => pid !== projectId);

              // 只有在项目列表发生变化时才更新
              if (mediaData.projects.length !== originalLength) {
                await set(key, mediaData);
                console.log(`Removed project ${projectId} from ${key}`);
              }
            }
          } catch (error) {
            console.warn(`Failed to update media file ${key}:`, error);
          }
        })()
      );
    }

    await Promise.allSettled(updatePromises);
    console.log(`Completed removing project ${projectId} from all media files`);
  } catch (error) {
    console.warn(`Failed to remove project ${projectId} from media files:`, error);
  }
}

// 清理没有项目引用的媒体文件（图片和涂鸦）
export async function cleanupOrphanedMedia(): Promise<{ cleaned: number, spaceFreed: number }> {
  let cleaned = 0;
  let spaceFreed = 0;

  try {
    const allKeys = await keys();
    const mediaKeys = allKeys.filter(key =>
      typeof key === 'string' && (
        (key as string).startsWith(IMAGE_PREFIX) ||
        (key as string).startsWith(SKETCH_PREFIX)
      )
    );

    console.log(`Checking ${mediaKeys.length} media files for orphaned data`);

    for (const key of mediaKeys) {
      try {
        const currentData = await get(key);
        if (!currentData) continue;

        let shouldDelete = false;
        let dataSize = 0;

        if (typeof currentData === 'string') {
          // 旧格式：没有项目标签，可能是孤立数据
          shouldDelete = true;
          dataSize = currentData.length;
        } else {
          // 新格式：检查项目引用
          const projects = currentData.projects || [];
          if (projects.length === 0) {
            shouldDelete = true;
            dataSize = currentData.size || currentData.data?.length || 0;
          }
        }

        if (shouldDelete) {
          await del(key);
          cleaned++;
          spaceFreed += dataSize;
          const mediaType = (key as string).startsWith(IMAGE_PREFIX) ? 'image' : 'sketch';
          const mediaId = (key as string).replace(IMAGE_PREFIX, '').replace(SKETCH_PREFIX, '');
          console.log(`Cleaned orphaned ${mediaType}: ${mediaId}`);
        }
      } catch (error) {
        console.warn(`Failed to check media file ${key}:`, error);
      }
    }

    console.log(`Orphaned media cleanup complete: ${cleaned} files cleaned, ${(spaceFreed / (1024 * 1024)).toFixed(2)}MB freed`);
  } catch (error) {
    console.error('Failed to cleanup orphaned media:', error);
  }

  return { cleaned, spaceFreed };
}

// 从 IndexedDB 加载图片（返回 data URL 供 <img src>；底层为 Blob 资产）
export async function loadImage(imageId: string): Promise<string | null> {
  try {
    const dataUrl = await loadMediaDataUrl(IMAGE_PREFIX, imageId, {
      upgradeLegacy: true,
      kind: 'image'
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

async function findExistingSketchId(sketchData: string): Promise<string | null> {
  try {
    const sketchHash = await hashMediaPayload(sketchData);
    return findMediaIdByContentHash(SKETCH_PREFIX, sketchHash);
  } catch (error) {
    console.warn('Failed to check for existing sketch:', error);
    return null;
  }
}

/** 保存涂鸦资产（Blob + ImageAsset） */
export async function saveSketch(base64Data: string): Promise<string> {
  if (!base64Data || !base64Data.startsWith('data:image/')) {
    throw new Error('Invalid sketch data: not a valid data URL');
  }
  const contentHash = await hashMediaPayload(base64Data);
  const existingId = await findExistingSketchId(base64Data);
  if (existingId) {
    console.log(`Reusing existing sketch: ${existingId}`);
    return existingId;
  }

  const sketchId = generateImageId();
  await writeMediaRecordFromDataUrl(SKETCH_PREFIX, sketchId, base64Data, {
    kind: 'sketch',
    contentHash
  });
  console.log(`Saved new sketch asset: ${sketchId}`);
  return sketchId;
}

export async function loadSketch(sketchId: string): Promise<string | null> {
  try {
    return await loadMediaDataUrl(SKETCH_PREFIX, sketchId, {
      upgradeLegacy: true,
      kind: 'sketch'
    });
  } catch (error) {
    console.error(`Failed to load sketch ${sketchId}:`, error);
    return null;
  }
}

// 保存背景图片
export async function saveBackgroundImage(projectId: string, base64Data: string): Promise<string> {
  const imageId = generateImageId();
  await set(`${BACKGROUND_IMAGE_PREFIX}${projectId}`, base64Data);
  return imageId;
}

// 加载背景图片
export async function loadBackgroundImage(projectId: string): Promise<string | null> {
  return await get<string>(`${BACKGROUND_IMAGE_PREFIX}${projectId}`);
}

// 删除图片
export async function deleteImage(imageId: string): Promise<void> {
  await del(`${IMAGE_PREFIX}${imageId}`);
}

// 尝试恢复丢失的图片（从note数据中重新保存）
export async function attemptImageRecovery(): Promise<{ imagesRecovered: number, sketchesRecovered: number }> {
  let imagesRecovered = 0;
  let sketchesRecovered = 0;

  try {
    // 获取所有项目
    const projectIds = await loadProjectList();
    const projects = await Promise.all(
      projectIds.map(id => loadProject(id, true)) // 加载图片
    );

    const validProjects = projects.filter(p => p !== null);

    for (const project of validProjects) {
      if (!project) continue;

      for (const note of project.notes) {
        // 检查图片
        if (note.images && note.images.length > 0) {
          for (let i = 0; i < note.images.length; i++) {
            const imageData = note.images[i];
            const existingId = extractImageId(imageData);

            if (!existingId && imageData.startsWith('data:image/')) {
              // 这是一个Base64图片但没有对应的ID，尝试重新保存
              try {
                const imageId = await saveImage(imageData);
                // 更新note中的图片引用
                note.images[i] = imageId;
                imagesRecovered++;
                console.log(`Recovered image for note ${note.id}: ${imageId}`);
              } catch (error) {
                console.error(`Failed to recover image for note ${note.id}:`, error);
              }
            }
          }
        }

        // 检查sketch
        if (note.sketch && !extractImageId(note.sketch) && note.sketch.startsWith('data:image/')) {
          try {
            const sketchId = await saveSketch(note.sketch);
            note.sketch = sketchId;
            sketchesRecovered++;
            console.log(`Recovered sketch for note ${note.id}: ${sketchId}`);
          } catch (error) {
            console.error(`Failed to recover sketch for note ${note.id}:`, error);
          }
        }
      }

      // 保存恢复后的项目
      await saveProject(project);
    }

    console.log(`Recovery attempt complete: ${imagesRecovered} images, ${sketchesRecovered} sketches recovered`);
  } catch (error) {
    console.error('Failed to attempt image recovery:', error);
  }

  return { imagesRecovered, sketchesRecovered };
}

// 清理重复的图片，只保留每个哈希组的第一个图片
export async function cleanupDuplicateImages(autoDelete: boolean = false, options: {
  forceDeleteSuspicious?: boolean;
  skipSuspicious?: boolean;
} = {}): Promise<{
  imagesCleaned: number;
  spaceFreed: number;
  keptImages: string[];
  suspiciousGroups: Array<{
    hash: string;
    count: number;
    reason: string;
    ids: string[];
    timestamps: number[];
  }>;
  skippedSuspicious: number;
} | null> {
  try {
    const redundancyAnalysis = await analyzeStorageRedundancy();
    if (!redundancyAnalysis) return null;

    // 获取详细的重复分析
    const detailedAnalysis = await analyzeDuplicateImages();

    let imagesCleaned = 0;
    let spaceFreed = 0;
    let skippedSuspicious = 0;
    const keptImages: string[] = [];
    const suspiciousGroups = detailedAnalysis?.suspiciousGroups || [];

    console.log(`Found ${redundancyAnalysis.duplicateGroups.length} duplicate groups, ${suspiciousGroups.length} suspicious`);

    // 处理可疑的重复组
    if (suspiciousGroups.length > 0) {
      if (options.forceDeleteSuspicious) {
        console.warn('⚠️  Force deleting suspicious duplicate groups:');
      } else if (options.skipSuspicious) {
        console.log('⏭️  Skipping suspicious duplicate groups (as requested):');
      } else {
        console.warn('⚠️  Found suspicious duplicate groups - NOT auto-deleting these:');
      }

      suspiciousGroups.forEach(group => {
        console.warn(`  Hash ${group.hash.substring(0, 16)}: ${group.count} duplicates - ${group.reason}`);
        console.warn(`    IDs: ${group.ids.join(', ')}`);
        console.warn(`    Timestamps: ${group.timestamps.map(t => new Date(t).toISOString()).join(', ')}`);
      });
    }

    for (const group of redundancyAnalysis.duplicateGroups) {
      // 检查这个组是否可疑
      const isSuspicious = suspiciousGroups.some(suspicious => suspicious.hash === group.hash);

      if (isSuspicious && !options.forceDeleteSuspicious) {
        if (options.skipSuspicious) {
          console.log(`⏭️ Skipping suspicious duplicate group (hash: ${group.hash.substring(0, 16)})`);
        } else {
          console.log(`⚠️ Skipping suspicious duplicate group (hash: ${group.hash.substring(0, 16)})`);
        }
        // 对于可疑的组，保留所有图片
        group.ids.forEach(id => keptImages.push(id));
        skippedSuspicious++;
        continue;
      }

      if (isSuspicious && options.forceDeleteSuspicious) {
        console.warn(`🔥 Force deleting suspicious duplicate group (hash: ${group.hash.substring(0, 16)})`);
      }

      // 处理重复组：保留最早的，删除其他的
      const [keepId, ...deleteIds] = group.ids;

      keptImages.push(keepId);

      for (const deleteId of deleteIds) {
        try {
          if (autoDelete) {
            await deleteImage(deleteId);
            imagesCleaned++;
            spaceFreed += group.size / group.count;
            const suspiciousMark = isSuspicious ? ' (suspicious)' : '';
            console.log(`✅ Cleaned duplicate image: ${deleteId} (kept: ${keepId})${suspiciousMark}`);
          } else {
            const suspiciousMark = isSuspicious ? ' (suspicious)' : '';
            console.log(`Would clean duplicate image: ${deleteId} (kept: ${keepId})${suspiciousMark}`);
          }
        } catch (error) {
          console.warn(`Failed to delete duplicate image ${deleteId}:`, error);
        }
      }
    }

    console.log(`Duplicate cleanup complete: ${imagesCleaned} images cleaned, ${spaceFreed.toFixed(2)}MB freed, ${skippedSuspicious} suspicious groups skipped`);
    return { imagesCleaned, spaceFreed, keptImages, suspiciousGroups, skippedSuspicious };
  } catch (error) {
    console.error('Failed to cleanup duplicate images:', error);
    return null;
  }
}

// 查找孤立数据（不再被项目引用的图片和涂鸦）
export async function findOrphanedData(): Promise<{
  orphanedImages: string[];
  orphanedSketches: string[];
  orphanedBackgrounds: string[];
  totalOrphanedSpace: number;
  referencedImages: Set<string>;
  referencedSketches: Set<string>;
  referencedBackgrounds: Set<string>;
}> {
  try {
    const allKeys = await keys();

    // 获取所有媒体文件键
    const imageKeys = allKeys.filter(key =>
      typeof key === 'string' && (key as string).startsWith(IMAGE_PREFIX)
    );

    const sketchKeys = allKeys.filter(key =>
      typeof key === 'string' && (key as string).startsWith(SKETCH_PREFIX)
    );

    const backgroundKeys = allKeys.filter(key =>
      typeof key === 'string' && (key as string).startsWith(BACKGROUND_IMAGE_PREFIX)
    ).map(key => (key as string).replace(BACKGROUND_IMAGE_PREFIX, ''));

    const orphanedImages: string[] = [];
    const orphanedSketches: string[] = [];
    const referencedImages = new Set<string>();
    const referencedSketches = new Set<string>();
    const referencedBackgrounds = new Set<string>();

    // 检查所有图片数据中的项目引用
    for (const key of imageKeys) {
      try {
        const currentData = await get(key);
        if (!currentData) continue;

        const imageId = (key as string).replace(IMAGE_PREFIX, '');

        if (typeof currentData === 'string') {
          // 旧格式：没有项目标签，可能是孤立数据
          orphanedImages.push(imageId);
        } else {
          // 新格式：检查项目引用
          const projects = currentData.projects || [];
          if (projects.length === 0) {
            orphanedImages.push(imageId);
          } else {
            // 记录被引用的图片
            referencedImages.add(imageId);
          }
        }
      } catch (error) {
        console.warn(`Failed to check image ${key}:`, error);
      }
    }

    // 检查所有涂鸦数据中的项目引用
    for (const key of sketchKeys) {
      try {
        const currentData = await get(key);
        if (!currentData) continue;

        const sketchId = (key as string).replace(SKETCH_PREFIX, '');

        if (typeof currentData === 'string') {
          // 旧格式：没有项目标签，可能是孤立数据
          orphanedSketches.push(sketchId);
        } else {
          // 新格式：检查项目引用
          const projects = currentData.projects || [];
          if (projects.length === 0) {
            orphanedSketches.push(sketchId);
          } else {
            // 记录被引用的涂鸦
            referencedSketches.add(sketchId);
          }
        }
      } catch (error) {
        console.warn(`Failed to check sketch ${key}:`, error);
      }
    }

    // 背景图片：仍然需要通过项目数据来检查引用
    const projectIds = await loadProjectList();
    const projects = await Promise.all(
      projectIds.map(id => loadProject(id, false)) // 不加载图片，只加载项目结构
    );

    const validProjects = projects.filter(p => p !== null);

    // 收集背景图片引用
    for (const project of validProjects) {
      if (project.backgroundImage && project.backgroundImage !== 'stored') {
        const bgId = extractImageId(project.backgroundImage);
        if (bgId) referencedBackgrounds.add(bgId);
      }
    }

    // 找出孤立的背景图片
    const orphanedBackgrounds = backgroundKeys.filter(id => !referencedBackgrounds.has(id));

    // 计算孤立数据的总大小
    let totalOrphanedSpace = 0;

    for (const imageId of orphanedImages) {
      try {
        const data = await get<string>(`${IMAGE_PREFIX}${imageId}`);
        if (data) {
          totalOrphanedSpace += (data.length * 3) / 4;
        }
      } catch (error) {
        // 忽略错误
      }
    }

    for (const sketchId of orphanedSketches) {
      try {
        const data = await get<string>(`${SKETCH_PREFIX}${sketchId}`);
        if (data) {
          totalOrphanedSpace += (data.length * 3) / 4;
        }
      } catch (error) {
        // 忽略错误
      }
    }

    console.log(`Found ${orphanedImages.length} orphaned images, ${orphanedSketches.length} orphaned sketches, ${orphanedBackgrounds.length} orphaned backgrounds`);
    console.log(`Total orphaned space: ${(totalOrphanedSpace / (1024 * 1024)).toFixed(2)}MB`);

    return {
      orphanedImages,
      orphanedSketches,
      orphanedBackgrounds,
      totalOrphanedSpace,
      referencedImages,
      referencedSketches,
      referencedBackgrounds
    };
  } catch (error) {
    console.error('Failed to find orphaned data:', error);
    return {
      orphanedImages: [],
      orphanedSketches: [],
      orphanedBackgrounds: [],
      totalOrphanedSpace: 0,
      referencedImages: new Set(),
      referencedSketches: new Set(),
      referencedBackgrounds: new Set()
    };
  }
}

// 清理孤立数据
export async function cleanupOrphanedData(): Promise<{
  imagesCleaned: number;
  sketchesCleaned: number;
  backgroundsCleaned: number;
  spaceFreed: number;
}> {
  try {
    const orphanedData = await findOrphanedData();

    let imagesCleaned = 0;
    let sketchesCleaned = 0;
    let backgroundsCleaned = 0;
    let spaceFreed = 0;

    // 删除孤立的图片
    for (const imageId of orphanedData.orphanedImages) {
      try {
        await deleteImage(imageId);
        imagesCleaned++;
      } catch (error) {
        console.warn(`Failed to delete orphaned image ${imageId}:`, error);
      }
    }

    // 删除孤立的涂鸦
    for (const sketchId of orphanedData.orphanedSketches) {
      try {
        await deleteSketch(sketchId);
        sketchesCleaned++;
      } catch (error) {
        console.warn(`Failed to delete orphaned sketch ${sketchId}:`, error);
      }
    }

    // 删除孤立的背景图片
    for (const bgId of orphanedData.orphanedBackgrounds) {
      try {
        await del(`${BACKGROUND_IMAGE_PREFIX}${bgId}`);
        backgroundsCleaned++;
      } catch (error) {
        console.warn(`Failed to delete orphaned background ${bgId}:`, error);
      }
    }

    spaceFreed = orphanedData.totalOrphanedSpace;

    console.log(`Orphaned data cleanup complete: ${imagesCleaned} images, ${sketchesCleaned} sketches, ${backgroundsCleaned} backgrounds cleaned, ${(spaceFreed / (1024 * 1024)).toFixed(2)}MB freed`);

    return {
      imagesCleaned,
      sketchesCleaned,
      backgroundsCleaned,
      spaceFreed
    };
  } catch (error) {
    console.error('Failed to cleanup orphaned data:', error);
    return {
      imagesCleaned: 0,
      sketchesCleaned: 0,
      backgroundsCleaned: 0,
      spaceFreed: 0
    };
  }
}

// 清理大文件以释放存储空间
export async function cleanupLargeImages(maxSizeMB: number = 2): Promise<{ imagesCleaned: number, spaceFreed: number }> {
  let imagesCleaned = 0;
  let spaceFreed = 0;

  try {
    const allKeys = await keys();
    const imageKeys = allKeys.filter(key =>
      typeof key === 'string' && (key as string).startsWith(IMAGE_PREFIX)
    );

    for (const key of imageKeys) {
      try {
        const data = await get<string>(key as string);
        if (data && typeof data === 'string') {
          const sizeMB = (data.length * 3) / 4 / (1024 * 1024);
          if (sizeMB > maxSizeMB) {
            await del(key as string);
            imagesCleaned++;
            spaceFreed += sizeMB;
            console.log(`Cleaned large image: ${key} (${sizeMB.toFixed(2)}MB)`);
          }
        }
      } catch (error) {
        console.warn(`Failed to check size for ${key}:`, error);
      }
    }

    console.log(`Large image cleanup complete: ${imagesCleaned} images cleaned, ${spaceFreed.toFixed(2)}MB freed`);
  } catch (error) {
    console.error('Failed to cleanup large images:', error);
  }

  return { imagesCleaned, spaceFreed };
}

// 清理明显损坏的图片和sketch（只删除无法访问或明显无效的数据）
export async function cleanupCorruptedImages(): Promise<{ imagesCleaned: number, sketchesCleaned: number }> {
  let imagesCleaned = 0;
  let sketchesCleaned = 0;

  try {
    const allKeys = await keys();
    const imageKeys = allKeys.filter(key => typeof key === 'string' && (key as string).startsWith(IMAGE_PREFIX));
    const sketchKeys = allKeys.filter(key => typeof key === 'string' && (key as string).startsWith(SKETCH_PREFIX));

    // 检查图片 - 只删除无法访问的数据，不删除格式不匹配的数据
    for (const key of imageKeys) {
      try {
        const data = await get<string>(key as string);
        // 只删除明显无效的数据：null、undefined、空字符串或异常短的数据
        if (data === null || data === undefined || data === '' || (typeof data === 'string' && data.length < 20)) {
          await del(key as string);
          imagesCleaned++;
          console.log(`Cleaned invalid image data: ${key}`);
        }
      } catch (error) {
        // 只有在无法访问数据时才删除
        await del(key as string);
        imagesCleaned++;
        console.log(`Cleaned inaccessible image: ${key}`);
      }
    }

    // 检查sketch - 同样的保守策略
    for (const key of sketchKeys) {
      try {
        const data = await get<string>(key as string);
        // 只删除明显无效的数据
        if (data === null || data === undefined || data === '' || (typeof data === 'string' && data.length < 20)) {
          await del(key as string);
          sketchesCleaned++;
          console.log(`Cleaned invalid sketch data: ${key}`);
        }
      } catch (error) {
        // 只有在无法访问数据时才删除
        await del(key as string);
        sketchesCleaned++;
        console.log(`Cleaned inaccessible sketch: ${key}`);
      }
    }

    console.log(`Conservative cleanup complete: ${imagesCleaned} images, ${sketchesCleaned} sketches cleaned`);
  } catch (error) {
    console.error('Failed to cleanup corrupted images:', error);
  }

  return { imagesCleaned, sketchesCleaned };
}

// 删除 sketch
export async function deleteSketch(sketchId: string): Promise<void> {
  await del(`${SKETCH_PREFIX}${sketchId}`);
}

// 确保Note有variant字段，并修复旧数据的兼容性问题
function ensureNoteVariant(note: Note): Note {
  // 如果 variant 缺失，默认为 standard
  if (!note.variant) {
    return { ...note, variant: 'standard' };
  }
  
  // 小便签 compact 已废弃，统一为大便签 standard（旧 JSON 仍可能带 compact）
  const rawVariant = (note as { variant?: string }).variant;
  if (rawVariant === 'compact') {
    return ensureNoteVariant({ ...note, variant: 'standard' });
  }
  const validVariants: ('standard' | 'image')[] = ['standard', 'image'];
  if (!validVariants.includes(note.variant as 'standard' | 'image')) {
    return { ...note, variant: 'standard' };
  }
  
  // 确保必要的字段存在
  const fixedNote = { ...note };
  
  // 确保 coords 存在且有效（对于地图项目很重要）
  if (!fixedNote.coords || 
      typeof fixedNote.coords.lat !== 'number' || 
      isNaN(fixedNote.coords.lat) ||
      typeof fixedNote.coords.lng !== 'number' || 
      isNaN(fixedNote.coords.lng)) {
    // 如果 coords 无效，设置默认坐标
    // 注意：这只是一个安全措施，理想情况下不应该发生
    fixedNote.coords = { 
      lat: (fixedNote.coords && typeof fixedNote.coords.lat === 'number' && !isNaN(fixedNote.coords.lat)) 
        ? fixedNote.coords.lat : 0, 
      lng: (fixedNote.coords && typeof fixedNote.coords.lng === 'number' && !isNaN(fixedNote.coords.lng)) 
        ? fixedNote.coords.lng : 0 
    };
  }
  
  // 确保其他必要字段存在
  if (!fixedNote.images) {
    fixedNote.images = [];
  }
  if (!fixedNote.tags) {
    fixedNote.tags = [];
  }
  if (typeof fixedNote.fontSize !== 'number') {
    fixedNote.fontSize = 3;
  }
  if (typeof fixedNote.boardX !== 'number') {
    fixedNote.boardX = 0;
  }
  if (typeof fixedNote.boardY !== 'number') {
    fixedNote.boardY = 0;
  }
  
  return fixedNote;
}

// 转换 Note 的图片从 Base64 到图片 ID，并同步 imageRefs（保留 variantId）
async function migrateNoteImages(note: Note): Promise<Note> {
  const migratedNote = ensureNoteVariant({ ...note });
  const prevRefs = note.imageRefs || [];

  if (note.images && note.images.length > 0) {
    const nextRefs: NoteImageRef[] = [];
    for (let i = 0; i < note.images.length; i++) {
      const imageData = note.images[i];
      const prev = prevRefs[i];
      try {
        const existingId = extractImageId(imageData);
        if (existingId) {
          const item: NoteImageRef = { assetId: existingId };
          if (prev?.assetId === existingId) {
            if (prev.variantId) item.variantId = prev.variantId;
            if (prev.variantEnabled !== undefined) item.variantEnabled = prev.variantEnabled;
          }
          nextRefs.push(item);
        } else if (typeof imageData === 'string' && imageData.startsWith('data:image/')) {
          // 编辑器展示态 data URL：若已有 asset 引用则勿另存一份像素
          if (prev?.assetId && isMediaRefId(prev.assetId)) {
            const item: NoteImageRef = { assetId: prev.assetId };
            if (prev.variantId) item.variantId = prev.variantId;
            if (prev.variantEnabled !== undefined) item.variantEnabled = prev.variantEnabled;
            nextRefs.push(item);
          } else {
            const imageId = await saveImage(imageData);
            const item: NoteImageRef = { assetId: imageId };
            if (prev?.variantId) item.variantId = prev.variantId;
            if (prev?.variantEnabled !== undefined) item.variantEnabled = prev.variantEnabled;
            nextRefs.push(item);
          }
        }
      } catch (error) {
        console.error(`Failed to migrate image for note ${note.id}:`, error);
        // 不能把失败图片悄悄从持久化项目中排除；调用方必须得到失败并保留临时点，
        // 否则会出现“当前会话看得到、刷新后照片丢失”的假成功。
        throw error;
      }
    }
    migratedNote.images = nextRefs.map((r) => r.assetId);
    migratedNote.imageRefs = nextRefs;
  } else if (prevRefs.length > 0) {
    migratedNote.images = prevRefs.map((r) => r.assetId).filter(isMediaRefId);
    migratedNote.imageRefs = prevRefs.filter((r) => isMediaRefId(r.assetId));
  }

  // 迁移 sketch
  if (note.sketch) {
    try {
      const existingId = extractImageId(note.sketch);
      if (existingId) {
        migratedNote.sketch = existingId;
      } else if (note.sketch.startsWith('data:image/')) {
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

/**
 * 将 Note 中的资产 / Variant 解析为展示用 data URL（返回副本，勿写回项目持久化态）。
 * 若有 media[]，按 media 顺序解析到 images（仅 image 项）与 sketch（sketch 项展示 URL 写入 sketch，variant 时为裁切图）。
 */
export async function loadNoteImages(note: Note): Promise<Note> {
  const { noteNeedsMediaResolve } = await import('./mediaDisplay');
  let synced = ensureNoteMediaSynced({ ...note });
  if (!noteNeedsMediaResolve(synced)) {
    return synced;
  }

  const loadedNote = { ...synced };
  const media = synced.media || [];
  const { resolveNoteImageRefUrl } = await import('../media/imageMaskRender');

  if (media.length > 0) {
    const loadedImages: string[] = [];
    let firstSketch: string | undefined;
    for (const item of media) {
      try {
        const url = await resolveNoteImageRefUrl({
          assetId: item.assetId,
          variantId: item.variantId,
          variantEnabled: item.variantEnabled
        });
        if (item.kind === 'sketch') {
          let sketchUrl = url || '';
          if (!sketchUrl) {
            const sk = await loadSketch(item.assetId);
            if (sk) sketchUrl = sk;
          }
          if (sketchUrl && firstSketch === undefined) firstSketch = sketchUrl;
        } else {
          loadedImages.push(url || '');
        }
      } catch (err) {
        console.warn(`Failed to load media for note ${note.id}:`, err);
        if (item.kind === 'image') loadedImages.push('');
      }
    }
    loadedNote.images = loadedImages;
    if (firstSketch !== undefined) loadedNote.sketch = firstSketch;
    loadedNote.media = media;
    loadedNote.imageRefs = media
      .filter((m) => m.kind === 'image')
      .map((m) => ({
        assetId: m.assetId,
        variantId: m.variantId,
        variantEnabled: m.variantEnabled
      }));
    return loadedNote;
  }

  const refs: NoteImageRef[] =
    synced.imageRefs && synced.imageRefs.length > 0
      ? synced.imageRefs
      : (synced.images || []).map((assetId) => ({ assetId } satisfies NoteImageRef));

  if (refs.length > 0) {
    const loadedImages: string[] = [];
    for (const ref of refs) {
      try {
        if (ref.variantId || isMediaRefId(ref.assetId)) {
          const url = await resolveNoteImageRefUrl(ref);
          loadedImages.push(url || '');
          if (!url) console.warn(`Failed to resolve image ref for note ${note.id}`, ref);
        } else if (typeof ref.assetId === 'string' && ref.assetId.startsWith('data:')) {
          loadedImages.push(ref.assetId);
        } else {
          loadedImages.push('');
        }
      } catch (err) {
        console.warn(`Failed to load image for note ${note.id}:`, err);
        loadedImages.push('');
      }
    }
    loadedNote.images = loadedImages;
  }

  if (synced.sketch) {
    const existingId = extractImageId(synced.sketch);
    if (existingId) {
      // sketch 也可能挂 variant：从 media 已处理；legacy 仅原图
      const sketchData = await loadSketch(existingId);
      if (sketchData) loadedNote.sketch = sketchData;
      else console.warn(`Failed to load sketch ${existingId} for note ${note.id}`);
    }
  }

  return loadedNote;
}

/** 将展示态（可能含 data URL）收束为仅资产引用，供写回 project state */
export function noteMediaToRefsOnly(note: Note): Note {
  const images = (note.images || []).filter(isMediaRefId);
  const sketch =
    note.sketch && isMediaRefId(note.sketch)
      ? note.sketch
      : note.sketch && extractImageId(note.sketch)
        ? extractImageId(note.sketch)!
        : undefined;
  return ensureNoteMediaSynced(
    syncNoteImageRefs({
      ...note,
      images,
      sketch: sketch && isMediaRefId(sketch) ? sketch : undefined
    })
  );
}

// 清理便签中不存在的图片和草图引用
export async function cleanBrokenReferences(notes: Note[]): Promise<Note[]> {
  const cleanedNotes: Note[] = [];

  for (const note of notes) {
    let cleanedNote = syncNoteImageRefs({ ...note });

    if (cleanedNote.images && cleanedNote.images.length > 0) {
      const validImages: string[] = [];
      for (const imageRef of cleanedNote.images) {
        const imageId = extractImageId(imageRef);
        if (imageId) {
          if (await mediaRecordExists(IMAGE_PREFIX, imageId)) {
            validImages.push(imageId);
          } else {
            console.warn(`Removing broken image reference: ${imageRef} from note ${note.id}`);
          }
        } else if (typeof imageRef === 'string' && imageRef.startsWith('data:image/')) {
          // 未迁移的 data URL：保留，留给 save 时 migrate
          validImages.push(imageRef);
        }
      }
      cleanedNote.images = validImages;
    }

    if (cleanedNote.sketch) {
      const sketchId = extractImageId(cleanedNote.sketch);
      if (sketchId) {
        if (!(await mediaRecordExists(SKETCH_PREFIX, sketchId))) {
          console.warn(`Removing broken sketch reference: ${cleanedNote.sketch} from note ${note.id}`);
          cleanedNote.sketch = undefined;
        }
      }
    }

    cleanedNote = syncNoteImageRefs(cleanedNote);
    cleanedNotes.push(cleanedNote);
  }

  return cleanedNotes;
}

// 确保项目数据的完整性和兼容性
function ensureProjectCompatibility(project: Project): Project {
  const fixedProject = { ...project };
  
  // 历史图片背景模式已移除；保留合法 projectKind，无效值清掉以便首次打开询问（不静默猜测）
  fixedProject.type = 'map';
  delete fixedProject.backgroundImage;
  const kind = sanitizeProjectKind(fixedProject.projectKind);
  if (kind) fixedProject.projectKind = kind;
  else delete fixedProject.projectKind;
  
  // 确保 notes 数组存在
  if (!fixedProject.notes) {
    fixedProject.notes = [];
  }
  
  // 修复所有 notes 的兼容性问题
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

/**
 * 将本次打开项目时产生的连线规范化结果异步写回存储（不阻塞 UI）。
 * 在完整加载便签（含图片）之后再调用，避免过早 save 与主流程打架。
 */
export async function flushPendingConnectionMigrationSave(project: Project): Promise<void> {
  if (!projectIdsPendingConnectionMigration.has(project.id)) {
    return;
  }
  projectIdsPendingConnectionMigration.delete(project.id);
  try {
    await saveProject(project);
  } catch (e) {
    console.warn('flushPendingConnectionMigrationSave failed', e);
  }
}

function scheduleConnectionMigrationPersist(project: Project): void {
  if (!projectIdsPendingConnectionMigration.has(project.id)) {
    return;
  }
  const snapshot = project;
  setTimeout(() => {
    void flushPendingConnectionMigrationSave(snapshot);
  }, 0);
}

// 保存项目（分片存储，图片分离）；返回已迁移为引用的 Project，供内存态使用
export async function saveProject(project: Project): Promise<Project> {
  // 0. 确保项目数据兼容性
  const compatibleProject = ensureProjectCompatibility(project);
  
  // 1. 迁移项目中的图片
  const migratedProject = { ...compatibleProject };
  
  // 迁移所有 notes 的图片
  migratedProject.notes = await Promise.all(
    compatibleProject.notes.map(note => migrateNoteImages(note))
  );
  
  // 2. 添加版本号
  const projectWithVersion: Project = {
    ...migratedProject,
    version: Date.now(), // 使用时间戳作为版本号
    storageVersion: CURRENT_STORAGE_VERSION
  };
  
  // 3. 保存项目数据（不包含 Base64 图片）
  await set(`${PROJECT_PREFIX}${project.id}`, projectWithVersion);
  
  // 4. 更新项目列表
  const projectList = await get<string[]>(PROJECT_LIST_KEY) || [];
  if (!projectList.includes(project.id)) {
    projectList.push(project.id);
    await set(PROJECT_LIST_KEY, projectList);
  }

  return projectWithVersion;
}

// 加载项目（按需加载，图片懒加载）
export async function loadProject(projectId: string, loadImages: boolean = false): Promise<Project | null> {
  const project = await get<Project>(`${PROJECT_PREFIX}${projectId}`);
  if (!project) {
    return null;
  }
  
  // 确保项目数据的完整性和兼容性
  const compatibleProject = ensureProjectCompatibility(project);
  
  // 如果需要加载图片，则加载所有图片
  if (loadImages) {
    // 加载所有 notes 的图片
    compatibleProject.notes = await Promise.all(
      compatibleProject.notes.map(note => loadNoteImages(note))
    );
    scheduleConnectionMigrationPersist(compatibleProject);
  }

  return compatibleProject;
}

// 加载所有项目 ID 列表
export async function loadProjectList(): Promise<string[]> {
  return await get<string[]>(PROJECT_LIST_KEY) || [];
}

// 加载项目摘要（只包含基本信息，不包含图片，用于项目列表显示）
export interface ProjectSummary {
  id: string;
  name: string;
  type: 'map';
  projectKind?: ProjectKind;
  createdAt: number;
  notesCount: number;
  hasImages: boolean;
  hasSketches: boolean;
}

export async function loadProjectSummaries(): Promise<ProjectSummary[]> {
  const projectIds = await loadProjectList();
  const summaries: ProjectSummary[] = [];

  for (const projectId of projectIds) {
    try {
  const project = await loadProject(projectId, false);
  if (project) {
        // 计算项目统计信息
        let hasImages = false;
        let hasSketches = false;

    for (const note of project.notes) {
          if (note.images && note.images.length > 0) {
            hasImages = true;
          }
          if (note.sketch) {
            hasSketches = true;
          }
          // 如果都找到了就可以提前退出
          if (hasImages && hasSketches) break;
        }

        summaries.push({
          id: project.id,
          name: project.name,
          type: project.type,
          projectKind: project.projectKind,
          createdAt: project.createdAt,
          notesCount: project.notes.length,
          hasImages,
          hasSketches
        });
      }
    } catch (error) {
      console.error(`Failed to load project summary for ${projectId}:`, error);
          }
        }

  return summaries;
}

// 加载所有项目（不加载图片，用于列表显示）
export async function loadAllProjects(loadImages: boolean = false): Promise<Project[]> {
  const projectList = await loadProjectList();
  const projects = await Promise.all(
    projectList.map(id => loadProject(id, loadImages))
  );
  return projects.filter((p): p is Project => p !== null);
    }
    
// 删除项目
export async function deleteProject(projectId: string): Promise<void> {
  // 首先删除项目数据和更新列表（快速操作）
  await del(`${PROJECT_PREFIX}${projectId}`);
  
  const projectList = await loadProjectList();
  const updatedList = projectList.filter(id => id !== projectId);
  await set(PROJECT_LIST_KEY, updatedList);

  // 异步清理项目相关的媒体文件（不阻塞UI）
  setTimeout(async () => {
    try {
      console.log(`Starting cleanup for deleted project: ${projectId}`);

      // 方法1：从所有媒体文件中移除项目引用
      await removeProjectFromAllMedia(projectId);

      // 方法2：清理没有任何项目引用的媒体文件
      const cleanupResult = await cleanupOrphanedMedia();

      // 删除背景图片
      try {
        await del(`${BACKGROUND_IMAGE_PREFIX}${projectId}`);
        console.log(`Deleted background image for project ${projectId}`);
      } catch (error) {
        // 背景图片可能不存在，忽略错误
      }

      console.log(`Project cleanup complete: ${cleanupResult.cleaned} orphaned media files removed, ${cleanupResult.spaceFreed} bytes freed`);
    } catch (error) {
      console.warn(`Failed to cleanup files for deleted project ${projectId}:`, error);
    }
  }, 100);
}

// 数据迁移：从旧格式迁移到新格式
export async function migrateFromOldFormat(): Promise<void> {
  const currentVersion = await get<number>(STORAGE_VERSION_KEY) || 1;
  
  if (currentVersion >= CURRENT_STORAGE_VERSION) {
    return; // 已经是最新版本
  }
  
  console.log('开始数据迁移...');
  
  // 尝试从旧格式加载
  const oldProjects = await get<Project[]>('mapp-projects');
  
  if (oldProjects && oldProjects.length > 0) {
    console.log(`发现 ${oldProjects.length} 个旧格式项目，开始迁移...`);
    
    // 迁移每个项目
    for (const project of oldProjects) {
      await saveProject(project);
    }
    
    // 删除旧数据
    await del('mapp-projects');
    console.log('旧数据已删除');
  }
  
  // 更新版本号
  await set(STORAGE_VERSION_KEY, CURRENT_STORAGE_VERSION);
  console.log('数据迁移完成');
}

// 获取项目的版本号（用于增量同步）
export async function getProjectVersion(projectId: string): Promise<number> {
  const project = await loadProject(projectId, false);
  return project?.version || 0;
}
