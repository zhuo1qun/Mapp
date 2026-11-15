import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { useMap } from 'react-leaflet';
import {
  resolveMapTileKeepBuffer,
  shouldPrefetchMapTiles,
  type TileRenderingEnvironment
} from '../../utils/map/tileRenderingPolicy';

type TileLayerEventHandlers = Record<string, ((event: L.LeafletEvent) => void) | undefined>;

export type MapTileMetricsSnapshot = {
  styleId: string;
  startedAt: number;
  requested: number;
  loaded: number;
  failed: number;
  aborted: number;
  visibleCoverage: number;
  firstVisibleTileMs: number | null;
  visibleReadyMs: number | null;
  activeTileElements: number;
};

declare global {
  interface Window {
    __MAPP_TILE_METRICS__?: MapTileMetricsSnapshot;
  }
}

function readTileEnvironment(): TileRenderingEnvironment {
  const connection = (navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
    deviceMemory?: number;
  }).connection;
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    coarsePointer:
      typeof window.matchMedia === 'function' && window.matchMedia('(any-pointer: coarse)').matches,
    saveData: connection?.saveData === true,
    effectiveType: connection?.effectiveType,
    deviceMemory: nav.deviceMemory
  };
}

export function getAdaptiveMapTileKeepBuffer(): number {
  return resolveMapTileKeepBuffer(readTileEnvironment());
}

/** Keep required basemap credits while removing Leaflet's non-essential UI prefix. */
export function MapAttributionPrefix() {
  const map = useMap();

  useEffect(() => {
    map.attributionControl?.setPrefix(false);
  }, [map]);

  return null;
}

/** MapContainer only reads its style once, so sync the live container after a basemap change. */
export function MapCanvasBackground({ color }: { color: string }) {
  const map = useMap();

  useEffect(() => {
    map.getContainer().style.backgroundColor = color;
  }, [color, map]);

  return null;
}

/**
 * Keeps a two-levels-lower basemap beneath the main layer. It fills newly
 * revealed land during zoom-out while high-resolution tiles are still loading.
 */
export function MapCrossfadeTileLayer({
  styleId,
  url,
  attribution,
  maxZoom,
  maxNativeZoom,
  updateWhenIdle,
  keepBuffer,
  eventHandlers
}: {
  styleId: string;
  url: string;
  attribution: string;
  maxZoom: number;
  maxNativeZoom?: number;
  updateWhenIdle: boolean;
  keepBuffer: number;
  eventHandlers?: TileLayerEventHandlers;
}) {
  const map = useMap();
  const currentLayerRef = useRef<L.TileLayer | null>(null);
  const layersRef = useRef(new Set<L.TileLayer>());

  useEffect(() => {
    const layers = layersRef.current;
    return () => {
      layers.forEach((layer) => layer.remove());
      layers.clear();
      currentLayerRef.current = null;
    };
  }, [map]);

  useEffect(() => {
    const previousLayer = currentLayerRef.current;
    layersRef.current.forEach((candidate) => {
      if (candidate === previousLayer) return;
      candidate.remove();
      layersRef.current.delete(candidate);
    });
    const startedAt = performance.now();
    const loadedVisibleTiles = new Set<string>();
    let firstVisibleTileMs: number | null = null;
    let visibleReadyMs: number | null = null;
    let transitionStarted = false;
    const metrics: MapTileMetricsSnapshot = {
      styleId,
      startedAt: Date.now(),
      requested: 0,
      loaded: 0,
      failed: 0,
      aborted: 0,
      visibleCoverage: 0,
      firstVisibleTileMs: null,
      visibleReadyMs: null,
      activeTileElements: 0
    };

    const layer = L.tileLayer(url, {
      attribution,
      maxZoom,
      maxNativeZoom,
      zIndex: previousLayer ? 2 : 1,
      tileSize: 256,
      zoomOffset: 0,
      updateWhenZooming: true,
      updateWhenIdle,
      keepBuffer,
      opacity: previousLayer ? 0 : 1
    });
    currentLayerRef.current = layer;

    const publishMetrics = () => {
      metrics.firstVisibleTileMs = firstVisibleTileMs;
      metrics.visibleReadyMs = visibleReadyMs;
      metrics.activeTileElements = map.getContainer().querySelectorAll('.leaflet-tile').length;
      window.__MAPP_TILE_METRICS__ = { ...metrics };
      window.dispatchEvent(new CustomEvent('mapp:tile-metrics', { detail: { ...metrics } }));
      if (localStorage.getItem('mapp-debug-tiles') === '1') {
        console.debug('[Mapp tile metrics]', metrics);
      }
    };

    const visibleTileKeys = (zoom: number) => {
      const geographicBounds = map.getBounds();
      const min = map.project(geographicBounds.getNorthWest(), zoom).divideBy(256).floor();
      const max = map
        .project(geographicBounds.getSouthEast(), zoom)
        .subtract([1, 1])
        .divideBy(256)
        .floor();
      const keys = new Set<string>();
      for (let x = min.x; x <= max.x; x += 1) {
        for (let y = min.y; y <= max.y; y += 1) keys.add(`${zoom}:${x}:${y}`);
      }
      return keys;
    };

    const beginTransition = () => {
      if (transitionStarted) return;
      transitionStarted = true;
      visibleReadyMs = performance.now() - startedAt;
      layer.setOpacity(1);
      if (previousLayer) {
        previousLayer.setOpacity(0);
        setTimeout(() => {
          previousLayer.remove();
          layersRef.current.delete(previousLayer);
        }, 280);
      }
      publishMetrics();
    };

    const forward = (name: string, event: L.LeafletEvent) => eventHandlers?.[name]?.(event);
    layer.on('loading', (event) => forward('loading', event));
    layer.on('tileloadstart', (event) => {
      metrics.requested += 1;
      forward('tileloadstart', event);
    });
    layer.on('tileload', (event: L.TileEvent) => {
      metrics.loaded += 1;
      const coords = event.coords;
      const key = `${coords.z}:${coords.x}:${coords.y}`;
      const visible = visibleTileKeys(coords.z);
      if (visible.has(key)) {
        loadedVisibleTiles.add(key);
        if (firstVisibleTileMs == null) firstVisibleTileMs = performance.now() - startedAt;
        let visibleLoaded = 0;
        visible.forEach((visibleKey) => {
          if (loadedVisibleTiles.has(visibleKey)) visibleLoaded += 1;
        });
        metrics.visibleCoverage = visible.size === 0 ? 1 : visibleLoaded / visible.size;
        if (!previousLayer || metrics.visibleCoverage >= 0.65) beginTransition();
      }
      forward('tileload', event);
      publishMetrics();
    });
    layer.on('tileerror', (event) => {
      metrics.failed += 1;
      forward('tileerror', event);
      publishMetrics();
    });
    layer.on('tileabort', (event) => {
      metrics.aborted += 1;
      forward('tileabort', event);
    });
    layer.on('load', (event) => {
      beginTransition();
      forward('load', event);
    });
    layer.addTo(map);
    layersRef.current.add(layer);

    return () => {
      // Keep the current layer mounted across a style change; the next layer removes it
      // after reaching the visible-coverage threshold. The unmount effect clears all layers.
    };
  }, [
    attribution,
    eventHandlers,
    keepBuffer,
    map,
    maxNativeZoom,
    maxZoom,
    styleId,
    updateWhenIdle,
    url
  ]);

  return null;
}

/** Preloads at most one low-resolution tile column after a meaningful pan. */
export function MapTileDirectionalPrefetch({
  url,
  maxZoom,
  maxNativeZoom
}: {
  url: string;
  maxZoom: number;
  maxNativeZoom?: number;
}) {
  const map = useMap();
  const previousCenterRef = useRef<L.LatLng | null>(null);
  const prefetchedAtRef = useRef(new Map<string, number>());
  const pendingImagesRef = useRef(new Map<string, HTMLImageElement>());

  useEffect(() => {
    if (!shouldPrefetchMapTiles(readTileEnvironment())) return;

    const tileUrlFor = (x: number, y: number, z: number) => {
      const subdomains = 'abc';
      const s = subdomains[Math.abs((x + y) % subdomains.length)];
      return L.Util.template(url, { x, y, z, s, r: '' });
    };
    const prunePrefetches = (now: number) => {
      for (const [tileUrl, startedAt] of prefetchedAtRef.current) {
        if (now - startedAt > 10 * 60 * 1000) prefetchedAtRef.current.delete(tileUrl);
      }
    };

    let prefetchTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleDirectionalPrefetch = () => {
      if (prefetchTimer) clearTimeout(prefetchTimer);
      prefetchTimer = setTimeout(() => {
        prefetchTimer = null;
        const center = map.getCenter();
        const previousCenter = previousCenterRef.current;
        previousCenterRef.current = center;
        if (!previousCenter) return;

        const targetZoom = Math.max(
          map.getMinZoom(),
          Math.min(maxNativeZoom ?? maxZoom, Math.floor(map.getZoom()) - 2)
        );
        const current = map.project(center, targetZoom);
        const previous = map.project(previousCenter, targetZoom);
        const dx = current.x - previous.x;
        const dy = current.y - previous.y;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 32) return;

        const bounds = map.getBounds();
        const northWest = map.project(bounds.getNorthWest(), targetZoom).divideBy(256).floor();
        const southEast = map.project(bounds.getSouthEast(), targetZoom).divideBy(256).floor();
        const xDirection = Math.abs(dx) >= Math.abs(dy) ? Math.sign(dx) : 0;
        const yDirection = Math.abs(dy) > Math.abs(dx) ? Math.sign(dy) : 0;
        const candidates: Array<[number, number]> = [];

        if (xDirection !== 0) {
          const x = xDirection > 0 ? southEast.x + 1 : northWest.x - 1;
          for (let y = northWest.y; y <= southEast.y; y += 1) candidates.push([x, y]);
        } else if (yDirection !== 0) {
          const y = yDirection > 0 ? southEast.y + 1 : northWest.y - 1;
          for (let x = northWest.x; x <= southEast.x; x += 1) candidates.push([x, y]);
        }

        const worldTiles = 2 ** targetZoom;
        const now = Date.now();
        prunePrefetches(now);
        candidates.slice(0, 4).forEach(([rawX, y]) => {
          if (y < 0 || y >= worldTiles) return;
          const x = ((rawX % worldTiles) + worldTiles) % worldTiles;
          const tileUrl = tileUrlFor(x, y, targetZoom);
          if (prefetchedAtRef.current.has(tileUrl) || pendingImagesRef.current.has(tileUrl)) return;

          const image = new Image();
          image.decoding = 'async';
          image.fetchPriority = 'low';
          const complete = () => pendingImagesRef.current.delete(tileUrl);
          image.onload = complete;
          image.onerror = complete;
          pendingImagesRef.current.set(tileUrl, image);
          prefetchedAtRef.current.set(tileUrl, now);
          image.src = tileUrl;
        });
      }, 500);
    };

    previousCenterRef.current = map.getCenter();
    map.on('moveend', scheduleDirectionalPrefetch);
    return () => {
      if (prefetchTimer) clearTimeout(prefetchTimer);
      map.off('moveend', scheduleDirectionalPrefetch);
      pendingImagesRef.current.forEach((image) => {
        image.onload = null;
        image.onerror = null;
        image.src = '';
      });
      pendingImagesRef.current.clear();
    };
  }, [map, maxNativeZoom, maxZoom, url]);

  return null;
}
