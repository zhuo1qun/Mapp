import { useState, useCallback, useEffect, useRef, useLayoutEffect } from 'react';
import type { Map as LeafletMap } from 'leaflet';
import type { Note } from '../../types';
import { unwrapLngNearCenter } from '../../utils/map/lngWorldWrap';

interface ClusterResult {
  notes: Note[];
  position: [number, number];
}

function sortNotes(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => {
    const favA = a.isFavorite ? 1 : 0;
    const favB = b.isFavorite ? 1 : 0;
    if (favA !== favB) return favB - favA;
    if (Math.abs(a.coords.lat - b.coords.lat) > 0.0001) {
      return a.coords.lat - b.coords.lat;
    }
    return a.coords.lng - b.coords.lng;
  });
}

function calculatePinDistance(
  map: LeafletMap,
  note1: Note,
  note2: Note
): number | null {
  try {
    const container = map.getContainer();
    if (!container) return null;

    const cLng = map.getCenter().lng;
    const lng1 = unwrapLngNearCenter(note1.coords.lng, cLng);
    const lng2 = unwrapLngNearCenter(note2.coords.lng, cLng);

    const point1 = map.latLngToContainerPoint([note1.coords.lat, lng1]);
    const point2 = map.latLngToContainerPoint([note2.coords.lat, lng2]);

    if (
      !point1 ||
      !point2 ||
      isNaN(point1.x) ||
      isNaN(point1.y) ||
      isNaN(point2.x) ||
      isNaN(point2.y)
    ) {
      return null;
    }

    return point1.distanceTo(point2);
  } catch (e) {
    console.warn('Distance calculation error:', e);
    return null;
  }
}

function detectClusters(
  notes: Note[],
  map: LeafletMap,
  threshold: number,
  forceSingleNoteIds: string[] = []
): ClusterResult[] {
  if (!map || notes.length === 0) return [];

  try {
    const container = map.getContainer();
    if (!container || !container.offsetParent) return [];
  } catch {
    return [];
  }

  const sortedNotes = sortNotes(notes);
  const forceSet = new Set(forceSingleNoteIds);
  const clusters: ClusterResult[] = [];
  const processed = new Set<string>();

  sortedNotes.forEach((note) => {
    if (processed.has(note.id)) return;

    const cluster: Note[] = [note];
    processed.add(note.id);

    // 被强制单独显示的点不与其他点聚合
    if (!forceSet.has(note.id)) {
      sortedNotes.forEach((otherNote) => {
        if (processed.has(otherNote.id)) return;
        if (forceSet.has(otherNote.id)) return;

        const distance = calculatePinDistance(map, note, otherNote);
        if (distance !== null && distance < threshold) {
          cluster.push(otherNote);
          processed.add(otherNote.id);
        }
      });
    }

    const clusterNotes = sortNotes(cluster);
    const bottomNote = clusterNotes[0];
    clusters.push({
      notes: clusterNotes,
      position: [bottomNote.coords.lat, bottomNote.coords.lng]
    });
  });

  return clusters;
}

interface UseMapClusteringProps {
  mapInstance: LeafletMap | null;
  getFilteredNotes: () => Note[];
  clusterThreshold: number;
  /** 这些 noteId 强制不参与聚合，始终以单独 pin 显示（用于连线端点） */
  forceSingleNoteIds?: string[];
}

export function useMapClustering({
  mapInstance,
  getFilteredNotes,
  clusterThreshold,
  forceSingleNoteIds = []
}: UseMapClusteringProps) {
  const [clusteredMarkers, setClusteredMarkers] = useState<ClusterResult[]>([]);
  const mapInstanceRef = useRef<LeafletMap | null>(null);
  /** 缩放过程中为 true；供 rAF 内读取，避免仅用闭包变量与 Leaflet 异步不同步 */
  const isZoomingRef = useRef(false);
  const getFilteredNotesRef = useRef(getFilteredNotes);
  useLayoutEffect(() => {
    getFilteredNotesRef.current = getFilteredNotes;
  }, [getFilteredNotes]);

  useEffect(() => {
    mapInstanceRef.current = mapInstance;
  }, [mapInstance]);

  useEffect(() => {
    if (!mapInstance) {
      setClusteredMarkers([]);
      return;
    }

    let updateTimeoutId: ReturnType<typeof setTimeout> | null = null;
    let rafId: number | null = null;

    let settleRemoveTimer: ReturnType<typeof setTimeout> | null = null;

    const clearClusterSettleClass = () => {
      if (settleRemoveTimer != null) {
        clearTimeout(settleRemoveTimer);
        settleRemoveTimer = null;
      }
      mapInstanceRef.current?.getContainer()?.classList.remove('map-cluster-settling');
    };

    const updateClusters = () => {
      if (isZoomingRef.current) return;

      const currentMap = mapInstanceRef.current;
      if (!currentMap) return;

      if (updateTimeoutId) {
        clearTimeout(updateTimeoutId);
        updateTimeoutId = null;
      }

      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }

      const requestedRafId = requestAnimationFrame(() => {
        if (isZoomingRef.current) return;

        const currentMap = mapInstanceRef.current;
        if (!currentMap) return;

        try {
          const container = currentMap.getContainer();
          if (!container || !container.offsetParent) {
            if (!isZoomingRef.current) {
              updateTimeoutId = setTimeout(updateClusters, 50);
            }
            return;
          }

          const mapPane = currentMap.getPane('mapPane');
          if (!mapPane) {
            if (!isZoomingRef.current) {
              updateTimeoutId = setTimeout(updateClusters, 50);
            }
            return;
          }

          const clusters = detectClusters(
            getFilteredNotesRef.current(),
            currentMap,
            clusterThreshold,
            forceSingleNoteIds
          );
          setClusteredMarkers(clusters);
        } catch (e) {
          console.warn('Failed to update clusters:', e);
          if (!isZoomingRef.current) {
            updateTimeoutId = setTimeout(updateClusters, 50);
          }
        }
      });
      rafId = requestedRafId;
    };

    const timeoutId = setTimeout(updateClusters, 100);

    const handleZoomStart = () => {
      isZoomingRef.current = true;
      clearClusterSettleClass();
      if (updateTimeoutId) {
        clearTimeout(updateTimeoutId);
        updateTimeoutId = null;
      }
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    };

    const handleZoomEnd = () => {
      isZoomingRef.current = false;
      clearClusterSettleClass();
      if (updateTimeoutId) {
        clearTimeout(updateTimeoutId);
        updateTimeoutId = null;
      }
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      /**
       * 等 smooth pinch/wheel 的 view 完全 commit 后再聚类。
       * 移动端略加长，避免与 touchend 后最后几帧 zoomanim 抢跑导致点位跳一下。
       */
      const settleMs =
        typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
          ? 320
          : 180;
      updateTimeoutId = setTimeout(() => {
        const el = mapInstanceRef.current?.getContainer();
        el?.classList.add('map-cluster-settling');
        updateClusters();
        settleRemoveTimer = setTimeout(() => {
          mapInstanceRef.current?.getContainer()?.classList.remove('map-cluster-settling');
          settleRemoveTimer = null;
        }, 340);
      }, settleMs);
    };

    const handleMoveEnd = () => {
      if (isZoomingRef.current) return;
      if (updateTimeoutId) clearTimeout(updateTimeoutId);
      updateTimeoutId = setTimeout(updateClusters, 50);
    };

    mapInstance.on('zoomstart', handleZoomStart);
    mapInstance.on('zoomend', handleZoomEnd);
    mapInstance.on('moveend', handleMoveEnd);

    return () => {
      clearTimeout(timeoutId);
      if (updateTimeoutId) clearTimeout(updateTimeoutId);
      if (rafId !== null) cancelAnimationFrame(rafId);
      clearClusterSettleClass();
      mapInstance.off('zoomstart', handleZoomStart);
      mapInstance.off('zoomend', handleZoomEnd);
      mapInstance.off('moveend', handleMoveEnd);
    };
  }, [mapInstance, clusterThreshold, forceSingleNoteIds]);

  const sortNotesCallback = useCallback((notes: Note[]) => sortNotes(notes), []);

  return { clusteredMarkers, sortNotes: sortNotesCallback };
}
