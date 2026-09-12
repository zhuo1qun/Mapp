import React, { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import { Note } from '../../types';
import { THEME_COLOR } from '../../constants';
import { Locate, Loader2, Settings, MapPin, Plus, Image as ImageIcon } from 'lucide-react';
import { ChromeIconButton } from '../ui/ChromeIconButton';
import { ChromeMenuItem } from '../ui/ChromeMenuItem';
import { ChromeMenuShell } from '../ui/ChromeMenuShell';
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
      {(showLocateMenu || showCreateMenu) && (
        <button
          type="button"
          aria-label="关闭操作菜单"
          className="fixed inset-0 z-[1999] bg-black/15 backdrop-blur-[2px] sm:hidden"
          onClick={onCloseMenus}
        />
      )}
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
        <ChromeMenuShell
          data-locate-menu
          appearance={menuChromeAppearance}
          className={`map-compact-action-sheet fixed inset-x-2 bottom-2 z-[2000] w-auto rounded-2xl py-1.5 sm:absolute sm:left-0 sm:right-auto sm:top-full sm:bottom-auto sm:mt-2 sm:w-48 sm:rounded-xl sm:py-1 ${neutralStyle ? '' : 'bg-white'}`}
          style={menuChromeSurfaceStyle ?? neutralStyle}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerMove={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseMove={(e) => e.stopPropagation()}
        >
          <div className="px-3 pb-1 pt-2 text-xs font-bold text-gray-500 sm:hidden">定位</div>
          <ChromeMenuItem
            className="group"
            hoverBackground={neutralHover}
            icon={
              isLocating ? (
                <Loader2 size={16} className="animate-spin text-blue-500" />
              ) : (
                <Locate size={16} className="text-gray-400 transition-colors group-hover:text-blue-500" />
              )
            }
            onClick={(e) => {
              e.stopPropagation();
              onLocateCurrentPosition();
              onCloseMenus();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerMove={(e) => e.stopPropagation()}
            disabled={isLocating}
          >
            {isLocating ? 'Locating...' : 'My Location'}
          </ChromeMenuItem>
          <ChromeMenuItem
            className="group"
            hoverBackground={neutralHover}
            icon={<MapPin size={16} className="text-gray-400 transition-colors group-hover:text-red-500" />}
            onClick={(e) => {
              e.stopPropagation();
              locateToLatestPin();
              onCloseMenus();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerMove={(e) => e.stopPropagation()}
          >
            Latest Note
          </ChromeMenuItem>
        </ChromeMenuShell>
      )}

      {showCreateMenu && (
        <ChromeMenuShell
          data-create-node-menu
          appearance={menuChromeAppearance}
          className={`map-compact-action-sheet fixed inset-x-2 bottom-2 z-[2000] w-auto rounded-2xl py-1.5 sm:absolute sm:left-0 sm:right-auto sm:top-full sm:bottom-auto sm:mt-2 sm:w-52 sm:rounded-xl sm:py-1 ${neutralStyle ? '' : 'bg-white'}`}
          style={menuChromeSurfaceStyle ?? neutralStyle}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerMove={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseMove={(e) => e.stopPropagation()}
        >
          <div className="px-3 pb-1 pt-2 text-xs font-bold text-gray-500 sm:hidden">新建</div>
          <ChromeMenuItem
            className="group"
            hoverBackground={neutralHover}
            icon={
              isCreatingAtLocation ? (
                <Loader2 size={16} className="animate-spin text-blue-500" />
              ) : (
                <MapPin size={16} className="text-gray-400 transition-colors group-hover:text-blue-500" />
              )
            }
            onClick={(e) => {
              e.stopPropagation();
              onCloseMenus();
              onCreateAtCurrentLocation();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerMove={(e) => e.stopPropagation()}
            disabled={isCreatingAtLocation}
          >
            在当前位置添加
          </ChromeMenuItem>
          <ChromeMenuItem
            className="group"
            hoverBackground={neutralHover}
            icon={<ImageIcon size={16} className="text-gray-400 transition-colors group-hover:text-blue-500" />}
            onClick={(e) => {
              e.stopPropagation();
              onCloseMenus();
              onImportFromPhotos();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerMove={(e) => e.stopPropagation()}
          >
            从相册导入图片
          </ChromeMenuItem>
        </ChromeMenuShell>
      )}
    </div>
  );
};
