/**
 * GPS / 定位飞入意图：跨 MapView 卸载（切换看板等）仍然保留。
 * 定位进行中禁止用当前镜头覆盖缓存，避免回到地图时落到半途坐标。
 */
export type PendingMapLocate = {
  projectId: string;
  generation: number;
  phase: 'requesting' | 'ready';
  lat?: number;
  lng?: number;
  zoom: number;
};

export const PENDING_MAP_LOCATE_EVENT = 'mapp-pending-locate';

let current: PendingMapLocate | null = null;
let nextGeneration = 1;

const notify = () => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(PENDING_MAP_LOCATE_EVENT, { detail: current }));
};

export function getPendingMapLocate(projectId: string): PendingMapLocate | null {
  if (!current || current.projectId !== projectId) return null;
  return current;
}

export function isMapLocatePending(projectId: string): boolean {
  return getPendingMapLocate(projectId) != null;
}

export function peekReadyMapLocate(
  projectId: string
): { lat: number; lng: number; zoom: number } | null {
  const pending = getPendingMapLocate(projectId);
  if (!pending || pending.phase !== 'ready' || pending.lat == null || pending.lng == null) {
    return null;
  }
  return { lat: pending.lat, lng: pending.lng, zoom: pending.zoom };
}

export function beginPendingMapLocate(projectId: string, zoom = 16): number {
  const generation = nextGeneration++;
  current = { projectId, generation, phase: 'requesting', zoom };
  notify();
  return generation;
}

export function completePendingMapLocate(
  projectId: string,
  generation: number,
  lat: number,
  lng: number,
  zoom = 16
): boolean {
  if (!current || current.projectId !== projectId || current.generation !== generation) {
    return false;
  }
  current = { projectId, generation, phase: 'ready', lat, lng, zoom };
  notify();
  return true;
}

export function cancelPendingMapLocate(projectId: string, generation?: number): void {
  if (!current || current.projectId !== projectId) return;
  if (generation != null && current.generation !== generation) return;
  current = null;
  notify();
}

export function consumeReadyMapLocate(
  projectId: string
): { lat: number; lng: number; zoom: number } | null {
  const ready = peekReadyMapLocate(projectId);
  if (!ready) return null;
  current = null;
  notify();
  return ready;
}

function isLiveMap(map: { getContainer?: () => HTMLElement | undefined } | null | undefined): boolean {
  const el = map?.getContainer?.();
  return !!el && el.isConnected;
}

export function applyReadyMapLocate(
  map: {
    flyTo: Function;
    setView: Function;
    once: Function;
    getCenter: Function;
    getZoom: Function;
    getContainer?: () => HTMLElement | undefined;
  },
  projectId: string,
  animate: boolean
): boolean {
  const ready = peekReadyMapLocate(projectId);
  if (!ready || !isLiveMap(map)) return false;

  try {
    const center = map.getCenter();
    const zoom = map.getZoom();
    const alreadyThere =
      !!center &&
      Math.abs(center.lat - ready.lat) < 1e-5 &&
      Math.abs(center.lng - ready.lng) < 1e-5 &&
      Math.abs(zoom - ready.zoom) < 0.08;

    if (alreadyThere || !animate) {
      if (!alreadyThere) {
        map.setView([ready.lat, ready.lng], ready.zoom, { animate: false });
      }
      consumeReadyMapLocate(projectId);
      return true;
    }

    map.once('moveend', () => {
      consumeReadyMapLocate(projectId);
    });
    map.flyTo([ready.lat, ready.lng], ready.zoom, { duration: 1.5 });
    return true;
  } catch (error) {
    console.warn('applyReadyMapLocate failed:', error);
    return false;
  }
}
