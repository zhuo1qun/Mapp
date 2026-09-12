import React, { useState, useEffect, useRef } from 'react';
import { get } from 'idb-keyval';
import { Note } from '../../types';

interface UseAppStateReturn {
  // Theme
  themeColor: string;
  setThemeColor: (color: string) => void;

  // Sidebar
  isSidebarOpen: boolean;
  setIsSidebarOpen: (open: boolean) => void;
  sidebarButtonY: number;
  setSidebarButtonY: (y: number) => void;

  // Map import menu
  showMapImportMenu: boolean;
  setShowMapImportMenu: (show: boolean) => void;

  // Border feature
  showBorderPanel: boolean;
  setShowBorderPanel: (show: boolean) => void;
  borderGeoJSON: any | null;
  setBorderGeoJSON: (data: any | null) => void;

  // File input ref
  mapViewFileInputRef: React.RefObject<HTMLInputElement>;

  // Sidebar drag
  sidebarButtonDragRef: React.MutableRefObject<{
    isDragging: boolean;
    startY: number;
    startButtonY: number;
  }>;

  // Route planning
  isRouteMode: boolean;
  setIsRouteMode: (mode: boolean) => void;
  waypoints: Note[];
  setWaypoints: (waypoints: Note[]) => void;
}

export const useAppState = (): UseAppStateReturn => {
  const [themeColor, setThemeColor] = useState('#3B82F6');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [sidebarButtonY, setSidebarButtonY] = useState(96);
  const [showMapImportMenu, setShowMapImportMenu] = useState(false);
  const [showBorderPanel, setShowBorderPanel] = useState(false);
  const [borderGeoJSON, setBorderGeoJSON] = useState<any | null>(null);
  // Route planning
  const [isRouteMode, setIsRouteMode] = useState(false);
  const [waypoints, setWaypoints] = useState<Note[]>([]);

  const mapViewFileInputRef = useRef<HTMLInputElement | null>(null);
  const sidebarButtonDragRef = useRef({ isDragging: false, startY: 0, startButtonY: 0 });

  // Load theme color on mount
  useEffect(() => {
    const loadThemeColor = async () => {
      try {
        const saved = await get('app-theme-color');
        if (saved) {
          setThemeColor(saved);
        }
      } catch (error) {
        console.warn('Failed to load theme color:', error);
      }
    };

    loadThemeColor();
  }, []);

  // Set initial sidebar button position
  useEffect(() => {
    const centerY = (window.innerHeight - 50) / 2;
    setSidebarButtonY(centerY);
  }, []);

  return {
    themeColor,
    setThemeColor,
    isSidebarOpen,
    setIsSidebarOpen,
    sidebarButtonY,
    setSidebarButtonY,
    showMapImportMenu,
    setShowMapImportMenu,
    showBorderPanel,
    setShowBorderPanel,
    borderGeoJSON,
    setBorderGeoJSON,
    mapViewFileInputRef,
    sidebarButtonDragRef,
    isRouteMode,
    setIsRouteMode,
    waypoints,
    setWaypoints
  };
};





