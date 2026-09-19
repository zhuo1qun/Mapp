import React, { useEffect, useRef, useState } from 'react';
import { useMap } from 'react-leaflet';
import { Note } from '../../types';
import { THEME_COLOR } from '../../constants';
import { Locate, Loader2, Settings, MapPin, Plus, Image as ImageIcon, Camera } from 'lucide-react';
import { ChromeIconButton } from '../ui/ChromeIconButton';
import { ChromeMenuItem } from '../ui/ChromeMenuItem';
import { ChromeWindow } from '../ui/ChromeWindow';
import { useChromeMenuTop } from '../../utils/ui/chromeMenuPosition';
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
  onImportFromCamera: () => void;
  cameraAvailable: boolean;
  isCreatingAtLocation?: boolean;
  showLocateMenu: boolean;
  showCreateMenu: boolean;
  onToggleLocateMenu: () => void;
  onToggleCreateMenu: () => void;
  onCloseMenus: () => void;
  /** 由顶栏槽托管窗口时只渲染按钮。 */
  hostedWindow?: boolean;
  /** 紧凑视口的新建操作改为贴近按钮展开的扇形菜单。 */
  compactViewport?: boolean;
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
  onImportFromCamera,
  cameraAvailable,
  isCreatingAtLocation = false,
  showLocateMenu,
  showCreateMenu,
  onToggleLocateMenu,
  onToggleCreateMenu,
  onCloseMenus,
  hostedWindow = false,
  compactViewport = false
}) => {
  const neutralStyle = chromeSurfaceStyle;
  const neutralHover = chromeHoverBackground;
  const controlsRef = useRef<HTMLDivElement>(null);
  const menuOpen = showLocateMenu || showCreateMenu;
  const menuTop = useChromeMenuTop(menuOpen && !hostedWindow, controlsRef, 8);
  const [menuKind, setMenuKind] = useState<'locate' | 'create' | null>(null);

  useEffect(() => {
    if (showLocateMenu) setMenuKind('locate');
    else if (showCreateMenu) setMenuKind('create');
  }, [showLocateMenu, showCreateMenu]);

  useEffect(() => {
    const container = controlsRef.current;
    if (!container) return;
    const handleCaptureStart = (e: Event) => {
      e.stopPropagation();
    };
    container.addEventListener('mousedown', handleCaptureStart, { capture: true, passive: true });
    container.addEventListener('touchstart', handleCaptureStart, { capture: true, passive: true });
    container.addEventListener('pointerdown', handleCaptureStart, { capture: true, passive: true });
    return () => {
      container.removeEventListener('mousedown', handleCaptureStart, { capture: true });
      container.removeEventListener('touchstart', handleCaptureStart, { capture: true });
      container.removeEventListener('pointerdown', handleCaptureStart, { capture: true });
    };
  }, []);

  // 紧凑视口的新建菜单不再进入底部 sheet，因此在点到地图空白处或按 Escape 时自行收起。
  useEffect(() => {
    if (!compactViewport || !hostedWindow || !showCreateMenu) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && controlsRef.current?.contains(event.target)) return;
      onCloseMenus();
    };
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseMenus();
    };
    document.addEventListener('pointerdown', dismiss, true);
    document.addEventListener('keydown', dismissOnEscape);
    return () => {
      document.removeEventListener('pointerdown', dismiss, true);
      document.removeEventListener('keydown', dismissOnEscape);
    };
  }, [compactViewport, hostedWindow, onCloseMenus, showCreateMenu]);

  const renderedKind = menuKind ?? (showLocateMenu ? 'locate' : showCreateMenu ? 'create' : null);

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

      {/* 宽屏保留锚定式下拉；窄屏从主按钮向下展开，避免占用整个底部操作区。 */}
      <div className="hidden sm:block">
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
      </div>

      <div className="ui-map-compact-create-control fixed ui-workspace-left z-10 h-14 w-14 sm:hidden">
        <ChromeIconButton
          className="relative z-10 !h-14 !w-14 !rounded-2xl group"
          themeColor={themeColor}
          chromeSurfaceStyle={neutralStyle}
          chromeHoverBackground={neutralHover}
          active={showCreateMenu}
          onClick={onToggleCreateMenu}
          onPointerMove={(e) => e.stopPropagation()}
          tooltip="新建节点"
          aria-expanded={showCreateMenu}
          aria-controls="map-create-radial-menu"
        >
          {isCreatingAtLocation ? (
            <Loader2 size={24} className="animate-spin" />
          ) : (
            <Plus size={24} className={`transition-transform duration-200 ${showCreateMenu ? 'rotate-45' : ''}`} />
          )}
        </ChromeIconButton>

        <div
          id="map-create-radial-menu"
          className="pointer-events-none absolute left-2 top-2 z-0 h-10 w-10"
          aria-hidden={!showCreateMenu}
        >
          <div
            className="absolute inset-0"
            style={{
              transform: showCreateMenu ? 'translate3d(0, -78px, 0) scale(1)' : 'scale(0.66)',
              opacity: showCreateMenu ? 1 : 0,
              transition: `transform 220ms cubic-bezier(0.22, 1, 0.36, 1) ${showCreateMenu ? '0ms' : '45ms'}, opacity 150ms ease ${showCreateMenu ? '0ms' : '45ms'}`
            }}
          >
            <ChromeIconButton
              className="ui-map-create-radial-action pointer-events-auto"
              themeColor={themeColor}
              chromeSurfaceStyle={neutralStyle}
              chromeHoverBackground={neutralHover}
              disabled={isCreatingAtLocation || !showCreateMenu}
              tabIndex={showCreateMenu ? 0 : -1}
              onClick={() => {
                onCloseMenus();
                onCreateAtCurrentLocation();
              }}
              tooltip="在当前位置添加"
            >
              {isCreatingAtLocation ? <Loader2 size={18} className="animate-spin" /> : <MapPin size={18} />}
            </ChromeIconButton>
          </div>

          <div
            className="absolute inset-0"
            style={{
              transform: showCreateMenu ? 'translate3d(55px, -55px, 0) scale(1)' : 'scale(0.66)',
              opacity: showCreateMenu ? 1 : 0,
              transition: `transform 220ms cubic-bezier(0.22, 1, 0.36, 1) ${showCreateMenu ? '35ms' : '0ms'}, opacity 150ms ease ${showCreateMenu ? '35ms' : '0ms'}`
            }}
          >
            <ChromeIconButton
              className="ui-map-create-radial-action pointer-events-auto"
              themeColor={themeColor}
              chromeSurfaceStyle={neutralStyle}
              chromeHoverBackground={neutralHover}
              disabled={!showCreateMenu}
              tabIndex={showCreateMenu ? 0 : -1}
              onClick={() => {
                onCloseMenus();
                onImportFromPhotos();
              }}
              tooltip="从相册导入"
            >
              <ImageIcon size={18} />
            </ChromeIconButton>
          </div>

          <div
            className="absolute inset-0"
            style={{
              transform: showCreateMenu ? 'translate3d(78px, 0, 0) scale(1)' : 'scale(0.66)',
              opacity: showCreateMenu ? 1 : 0,
              transition: `transform 220ms cubic-bezier(0.22, 1, 0.36, 1) ${showCreateMenu ? '70ms' : '0ms'}, opacity 150ms ease ${showCreateMenu ? '70ms' : '0ms'}`
            }}
          >
            <ChromeIconButton
              className="ui-map-create-radial-action pointer-events-auto"
              themeColor={themeColor}
              chromeSurfaceStyle={neutralStyle}
              chromeHoverBackground={neutralHover}
              disabled={!cameraAvailable || !showCreateMenu}
              tabIndex={showCreateMenu && cameraAvailable ? 0 : -1}
              onClick={() => {
                onCloseMenus();
                onImportFromCamera();
              }}
              tooltip={cameraAvailable ? '拍照添加' : '拍照需要 HTTPS'}
            >
              <Camera size={18} />
            </ChromeIconButton>
          </div>
        </div>
      </div>

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

      {!hostedWindow ? (
      <ChromeWindow
        open={menuOpen}
        onClose={onCloseMenus}
        backdropLabel="关闭操作菜单"
        surface="menu"
        appearance={menuChromeAppearance}
        align="start"
        top={menuTop}
        className={`w-52 ${neutralStyle ? '' : 'bg-white'}`}
        style={menuChromeSurfaceStyle ?? neutralStyle}
        dismissIgnoreRefs={[controlsRef]}
        data-locate-menu={renderedKind === 'locate' ? '' : undefined}
        data-create-node-menu={renderedKind === 'create' ? '' : undefined}
      >
        <MapLocateCreateMenu
          kind={renderedKind === 'create' ? 'create' : 'locate'}
          isLocating={isLocating}
          isCreatingAtLocation={isCreatingAtLocation}
          chromeHoverBackground={neutralHover}
          onLocateCurrentPosition={onLocateCurrentPosition}
          onCreateAtCurrentLocation={onCreateAtCurrentLocation}
          onImportFromPhotos={onImportFromPhotos}
          onCloseMenus={onCloseMenus}
          mapNotes={mapNotes}
        />
      </ChromeWindow>
      ) : null}
    </div>
  );
};

export function MapLocateCreateMenu({
  kind,
  isLocating,
  isCreatingAtLocation,
  chromeHoverBackground,
  onLocateCurrentPosition,
  onCreateAtCurrentLocation,
  onImportFromPhotos,
  onCloseMenus,
  mapNotes
}: {
  kind: 'locate' | 'create';
  isLocating: boolean;
  isCreatingAtLocation: boolean;
  chromeHoverBackground?: string;
  onLocateCurrentPosition: () => void;
  onCreateAtCurrentLocation: () => void;
  onImportFromPhotos: () => void;
  onCloseMenus: () => void;
  mapNotes: Note[];
}) {
  const map = useMap();
  const locateToLatestPin = () => {
    if (mapNotes.length > 0) {
      const latestNote = mapNotes[mapNotes.length - 1];
      map.flyTo([latestNote.coords.lat, latestNote.coords.lng], 16);
    }
  };

  return (
    <>
      <div className="px-3 pb-1 pt-2 text-xs font-bold text-gray-500 sm:hidden">
        {kind === 'create' ? '新建' : '定位'}
      </div>
      {kind === 'create' ? (
        <>
          <ChromeMenuItem
            className="group"
            hoverBackground={chromeHoverBackground}
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
            hoverBackground={chromeHoverBackground}
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
        </>
      ) : (
        <>
          <ChromeMenuItem
            className="group"
            hoverBackground={chromeHoverBackground}
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
            hoverBackground={chromeHoverBackground}
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
        </>
      )}
    </>
  );
}
