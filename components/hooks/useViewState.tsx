import { useState, useCallback } from 'react';
import { ViewMode } from '../../types';
import { getViewPositionCache, setViewPositionCache } from '../../utils/persistence/storage';
import { isMapLocatePending } from '../../utils/map/pendingMapLocate';

interface NavigationCoords {
  lat: number;
  lng: number;
  zoom?: number;
}

interface BoardCoords {
  x: number;
  y: number;
}

interface UseViewStateReturn {
  // View state
  viewMode: ViewMode;
  isEditorOpen: boolean;
  /** Map / Board / Graph 共用的「视图编辑模式」，切换视图时保持，由各视图清空本地选中 */
  mappingWorkspaceEditMode: boolean;

  // Navigation state
  navigateToMapCoords: NavigationCoords | null;
  navigateToBoardCoords: BoardCoords | null;
  navigateToGraphNoteId: string | null;

  // Actions
  setViewMode: (mode: ViewMode) => void;
  setIsEditorOpen: (open: boolean) => void;
  setMappingWorkspaceEditMode: (edit: boolean) => void;

  // Navigation actions
  navigateToMap: (coords?: NavigationCoords) => void;
  navigateToBoard: (coords?: BoardCoords) => void;
  navigateToGraphNote: (noteId: string) => void;
  clearMapNavigation: () => void;
  clearBoardNavigation: () => void;
  clearGraphNavigation: () => void;

  // Position saving
  saveMapPosition: (projectId: string, mapInstance: any) => void;
  saveBoardPosition: (projectId: string, x: number, y: number, scale: number) => void;
}

export const useViewState = (): UseViewStateReturn => {
  const [viewMode, setViewMode] = useState<ViewMode>('map');
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [mappingWorkspaceEditMode, setMappingWorkspaceEditMode] = useState(false);

  const [navigateToMapCoords, setNavigateToMapCoords] = useState<NavigationCoords | null>(null);
  const [navigateToBoardCoords, setNavigateToBoardCoords] = useState<BoardCoords | null>(null);
  const [navigateToGraphNoteId, setNavigateToGraphNoteId] = useState<string | null>(null);

  // Navigation actions
  const navigateToMap = useCallback((coords?: NavigationCoords) => {
    setNavigateToMapCoords(coords || null);
  }, []);

  const navigateToBoard = useCallback((coords?: BoardCoords) => {
    setNavigateToBoardCoords(coords || null);
  }, []);

  const navigateToGraphNote = useCallback((noteId: string) => {
    setNavigateToGraphNoteId(noteId);
  }, []);

  const clearMapNavigation = useCallback(() => {
    setNavigateToMapCoords(null);
  }, []);

  const clearBoardNavigation = useCallback(() => {
    setNavigateToBoardCoords(null);
  }, []);

  const clearGraphNavigation = useCallback(() => {
    setNavigateToGraphNoteId(null);
  }, []);

  // Position saving
  const saveMapPosition = useCallback((projectId: string, mapInstance: any) => {
    if (!projectId || !mapInstance) return;
    if (isMapLocatePending(projectId)) return;

    try {
      const center = mapInstance.getCenter();
      const zoom = mapInstance.getZoom();
      if (center && typeof center.lat === 'number' && typeof center.lng === 'number') {
        setViewPositionCache(projectId, 'map', { center: [center.lat, center.lng], zoom });
        console.log('[ViewState] Saved map position:', { center, zoom, projectId });
      }
    } catch (err) {
      console.warn('[ViewState] Failed to save map position:', err);
    }
  }, []);

  const saveBoardPosition = useCallback((projectId: string, x: number, y: number, scale: number) => {
    if (!projectId) return;
    setViewPositionCache(projectId, 'board', { x, y, scale });
  }, []);

  return {
    viewMode,
    isEditorOpen,
    mappingWorkspaceEditMode,
    navigateToMapCoords,
    navigateToBoardCoords,
    navigateToGraphNoteId,
    setViewMode,
    setIsEditorOpen,
    setMappingWorkspaceEditMode,
    navigateToMap,
    navigateToBoard,
    navigateToGraphNote,
    clearMapNavigation,
    clearBoardNavigation,
    clearGraphNavigation,
    saveMapPosition,
    saveBoardPosition
  };
};
