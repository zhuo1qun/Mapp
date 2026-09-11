import React, { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import { Note } from '../../types';
import { THEME_COLOR } from '../../constants';
import { Locate, Loader2, Settings, MapPin, Plus, Image as ImageIcon } from 'lucide-react';
import { ChromeIconButton } from '../ui/ChromeIconButton';
import type { MapChromeAppearance } from '../../utils/map/mapChromeStyle';

interface MapControlsProps {
  onLocateCurrentPosition: () => void;
  isLocating?: boolean;
  mapNotes: Note[];
  themeColor?: string;
  /** 非主题色浮层面板：半透明白底 + backdrop-filter */
  chromeSurfaceStyle?: React.CSSProperties;
  /** 图标工具栏可按底图使用深/浅玻璃；展开菜单仍使用稳定的常规面板。 */
  menuChromeSurfaceStyle?: React.CSSProperties;
  menuChromeAppearance?: MapChromeAppearance;
  chromeHoverBackground?: string;
  onOpenSettings: () => void;
  /** 设置按钮是否处于打开态（高亮） */
  settingsOpen?: boolean;
  /** 锚定设置下拉面板 */
  settingsButtonRef?: React.RefObject<HTMLButtonElement | null>;
  onCreateAtCurrentLocation: () => void;
  onImportFromPhotos: () => void;
  isCreatingAtLocation?: boolean;
  showLocateMenu: boolean;
  showCreateMenu: boolean;
  onToggleLocateMenu: () => void;
  onToggleCreateMenu: () => void;
  onCloseMenus: () => void;
}

export const MapControls: React.FC<MapControlsProps> = ({
  onLocateCurrentPosition,
  isLocating = false,
  mapNotes,
  themeColor = THEME_COLOR,
  chromeSurfaceStyle,
  menuChromeSurfaceStyle,
  menuChromeAppearance = 'light',
  chromeHoverBackground,
  onOpenSettings,
  settingsOpen = false,
  settingsButtonRef,
  onCreateAtCurrentLocation,
  onImportFromPhotos,
  isCreatingAtLocation = false,
  showLocateMenu,
  showCreateMenu,
  onToggleLocateMenu,
  onToggleCreateMenu,
  onCloseMenus
}) => {
  const neutralStyle = chromeSurfaceStyle;
  const neutralHover = chromeHoverBackground;
  const map = useMap();
  const controlsRef = useRef<HTMLDivElement>(null);
  const locateMenuRef = useRef<HTMLDivElement>(null);

  const locateToLatestPin = () => {
    if (mapNotes.length > 0) {
      const latestNote = mapNotes[mapNotes.length - 1];
      map.flyTo([latestNote.coords.lat, latestNote.coords.lng], 16);
    }
  };

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (controlsRef.current && !controlsRef.current.contains(event.target as Node)) {
        onCloseMenus();
      }
    };
    if (showLocateMenu || showCreateMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showLocateMenu, showCreateMenu, onCloseMenus]);

  // Block map container from receiving pointer down events when pointer is in UI area
  useEffect(() => {
    const container = controlsRef.current;
    if (!container) return;

    const handleCaptureStart = (e: Event) => {
      // Stop event from reaching map container in capture phase
      e.stopPropagation();
    };

    // Use capture phase to intercept events before they reach map container
    // Mark as passive since we only call stopPropagation(), not preventDefault()
    container.addEventListener('mousedown', handleCaptureStart, { capture: true, passive: true });
    container.addEventListener('touchstart', handleCaptureStart, { capture: true, passive: true });
    container.addEventListener('pointerdown', handleCaptureStart, { capture: true, passive: true });

    return () => {
      container.removeEventListener('mousedown', handleCaptureStart, { capture: true });
      container.removeEventListener('touchstart', handleCaptureStart, { capture: true });
      container.removeEventListener('pointerdown', handleCaptureStart, { capture: true });
    };
  }, []);

  return (
    <div
      ref={controlsRef}
      className="relative flex flex-row items-center gap-1.5 sm:gap-2 pointer-events-auto"
      onPointerDown={(e) => e.stopPropagation()}
      onPointerMove={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onPointerCancel={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseMove={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      {/* First Row: Main Controls */}
      {/* 要求：设置按钮在左上角工具栏最左侧（第一个） */}
      <ChromeIconButton
        ref={settingsButtonRef}
        themeColor={themeColor}
        chromeSurfaceStyle={neutralStyle}
        chromeHoverBackground={neutralHover}
        nonChromeIdleHover="imperative-gray100"
        active={settingsOpen}
        pressThemeFlash
        onClick={() => {
          onCloseMenus();
          onOpenSettings();
        }}
        onPointerMove={(e) => e.stopPropagation()}
        tooltip="设置"
      >
        <Settings size={18} className="sm:w-5 sm:h-5" />
      </ChromeIconButton>

      <ChromeIconButton
        className="group"
        themeColor={themeColor}
        chromeSurfaceStyle={neutralStyle}
        chromeHoverBackground={neutralHover}
        active={showCreateMenu}
        onClick={onToggleCreateMenu}
        onPointerMove={(e) => e.stopPropagation()}
        tooltip="新建节点"
      >
        {isCreatingAtLocation ? (
          <Loader2 size={18} className="sm:w-5 sm:h-5 animate-spin" />
        ) : (
          <Plus size={18} className="sm:w-5 sm:h-5" />
        )}
      </ChromeIconButton>

      <div ref={locateMenuRef}>
        <ChromeIconButton
          className="group"
          themeColor={themeColor}
          chromeSurfaceStyle={neutralStyle}
          chromeHoverBackground={neutralHover}
          active={showLocateMenu}
          onClick={onToggleLocateMenu}
          onPointerMove={(e) => e.stopPropagation()}
          tooltip="定位"
        >
          <Locate size={18} className="sm:w-5 sm:h-5" />
        </ChromeIconButton>
      </div>

      {/* 菜单左缘与顶栏左侧（本控件左缘）对齐，而非与定位按钮齐平 */}
      {showLocateMenu && (
        <div
          data-locate-menu
          className={`map-chrome-content-${menuChromeAppearance} absolute left-0 top-full mt-2 w-48 rounded-xl shadow-xl border border-gray-100 py-1 z-[2000] ${neutralStyle ? '' : 'bg-white'}`}
          style={menuChromeSurfaceStyle ?? neutralStyle}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerMove={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseMove={(e) => e.stopPropagation()}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              onLocateCurrentPosition();
              onCloseMenus();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerMove={(e) => e.stopPropagation()}
            disabled={isLocating}
            className="group w-full text-left px-4 py-3 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-3 text-sm transition-colors"
          >
            {isLocating ? (
              <Loader2 size={16} className="text-blue-500 animate-spin" />
            ) : (
              <Locate size={16} className="text-gray-400 group-hover:text-blue-500 transition-colors" />
            )}
            <span>{isLocating ? 'Locating...' : 'My Location'}</span>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              locateToLatestPin();
              onCloseMenus();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerMove={(e) => e.stopPropagation()}
            className="group w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center gap-3 text-sm transition-colors"
          >
            <MapPin size={16} className="text-gray-400 group-hover:text-red-500 transition-colors" />
            <span>Latest Note</span>
          </button>
        </div>
      )}

      {showCreateMenu && (
        <div
          data-create-node-menu
          className={`map-chrome-content-${menuChromeAppearance} absolute left-0 top-full mt-2 w-52 rounded-xl shadow-xl border border-gray-100 py-1 z-[2000] ${neutralStyle ? '' : 'bg-white'}`}
          style={menuChromeSurfaceStyle ?? neutralStyle}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerMove={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseMove={(e) => e.stopPropagation()}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCloseMenus();
              onCreateAtCurrentLocation();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerMove={(e) => e.stopPropagation()}
            disabled={isCreatingAtLocation}
            className="group w-full text-left px-4 py-3 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-3 text-sm transition-colors"
          >
            {isCreatingAtLocation ? (
              <Loader2 size={16} className="text-blue-500 animate-spin" />
            ) : (
              <MapPin size={16} className="text-gray-400 group-hover:text-blue-500 transition-colors" />
            )}
            <span>在当前位置添加</span>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCloseMenus();
              onImportFromPhotos();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerMove={(e) => e.stopPropagation()}
            className="group w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center gap-3 text-sm transition-colors"
          >
            <ImageIcon size={16} className="text-gray-400 group-hover:text-blue-500 transition-colors" />
            <span>从相册导入图片</span>
          </button>
        </div>
      )}
    </div>
  );
};
