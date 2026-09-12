import { useMemo, useCallback } from 'react';
import { getViewPositionCache, setViewPositionCache } from '../../utils/persistence/storage';
import { isMapLocatePending, peekReadyMapLocate } from '../../utils/map/pendingMapLocate';
import { Note } from '../../types';

interface UseMapPositionProps {
  isMapMode: boolean;
  projectId: string | undefined;
  navigateToCoords?: { lat: number; lng: number; zoom?: number } | null;
  mapNotes: Note[];
  currentLocation?: { lat: number; lng: number } | null;
  defaultCenter: [number, number];
}

export const useMapPosition = ({
  isMapMode,
  projectId,
  navigateToCoords,
  mapNotes,
  currentLocation,
  defaultCenter
}: UseMapPositionProps) => {

  // Calculate initial map position with priority order
  const initialMapPosition = useMemo(() => {
    if (!isMapMode || !projectId) {
      return null;
    }

    // 1. Navigation coordinates (highest priority - handled by MapContainer center prop)
    if (navigateToCoords) {
      return {
        center: [navigateToCoords.lat, navigateToCoords.lng] as [number, number],
        zoom: navigateToCoords.zoom ?? 19
      };
    }

    // 1.5 GPS locate that finished after leaving the map (view switch, etc.)
    if (projectId) {
      const pendingLocate = peekReadyMapLocate(projectId);
      if (pendingLocate) {
        return {
          center: [pendingLocate.lat, pendingLocate.lng] as [number, number],
          zoom: pendingLocate.zoom
        };
      }
    }

    // 2. Check cached position (saved when leaving mapping view)
    const cached = getViewPositionCache(projectId, 'map');
    if (cached?.center && cached.zoom) {
      return { center: cached.center, zoom: cached.zoom };
    }

    // 3. Fallback positions (zoom: 16)
    // 3.1 Last pin position
    if (mapNotes.length > 0) {
      const lastNote = mapNotes[mapNotes.length - 1];
      return {
        center: [lastNote.coords.lat, lastNote.coords.lng] as [number, number],
        zoom: 16
      };
    }

    // 3.2 Current location
    if (currentLocation) {
      return { center: [currentLocation.lat, currentLocation.lng] as [number, number], zoom: 16 };
    }

    // 3.3 Default fallback coordinates
    return { center: defaultCenter, zoom: 16 };
  }, [isMapMode, projectId, navigateToCoords, mapNotes.length, currentLocation?.lat, currentLocation?.lng, defaultCenter]);

  // Real-time map position saving (similar to board's transform saving)
  const handleMapPositionChange = useCallback((center: [number, number], zoom: number) => {
    if (!projectId) return;
    // Locate in flight / not yet applied: do not persist a mid-animation camera.
    if (isMapLocatePending(projectId)) return;
    console.log('[useMapPosition] 实时保存地图位置:', { center, zoom });
    setViewPositionCache(projectId, 'map', { center, zoom });
  }, [projectId]);

  return {
    initialMapPosition,
    handleMapPositionChange
  };
};
