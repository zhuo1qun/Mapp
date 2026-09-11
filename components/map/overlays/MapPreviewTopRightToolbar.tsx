import React from 'react';
import { Download } from 'lucide-react';
import type { Frame } from '../../../types';
import type { GraphLayerGroupStandard } from '../../../utils/graph/graphRuntimeCore';
import { MapSearchPanel, type BorderSearchState } from '../controls/MapSearchPanel';
import { MapLayerControl } from '../controls/MapLayerControl';
import { ChromeIconButton } from '../../ui/ChromeIconButton';
import type { MapChromeAppearance } from '../../../utils/map/mapChromeStyle';

interface MapPreviewTopRightToolbarProps {
  showBorderPanel: boolean;
  onToggleBorderPanel: () => void;
  themeColor: string;
  chromeSurfaceStyle: React.CSSProperties;
  menuChromeSurfaceStyle?: React.CSSProperties;
  menuChromeAppearance?: MapChromeAppearance;
  chromeHoverBackground: string;
  borderSearch: BorderSearchState;
  borderGeoJSON: any;
  onClearBorder: () => void;
  onCloseBorderPanel: () => void;
  showFrameLayerPanel: boolean;
  onToggleFrameLayerPanel: () => void;
  frames: Frame[];
  frameLayerVisibility: Record<string, boolean>;
  setFrameLayerVisibility: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  showAllFrames: boolean;
  setShowAllFrames: React.Dispatch<React.SetStateAction<boolean>>;
  frameLayerRef: React.RefObject<HTMLDivElement | null>;
  onExportStandaloneTab: () => void;
  layerGroupStandard: GraphLayerGroupStandard;
}

export function MapPreviewTopRightToolbar({
  showBorderPanel,
  onToggleBorderPanel,
  themeColor,
  chromeSurfaceStyle,
  menuChromeSurfaceStyle,
  menuChromeAppearance = 'light',
  chromeHoverBackground,
  borderSearch,
  borderGeoJSON,
  onClearBorder,
  onCloseBorderPanel,
  showFrameLayerPanel,
  onToggleFrameLayerPanel,
  frames,
  frameLayerVisibility,
  setFrameLayerVisibility,
  showAllFrames,
  setShowAllFrames,
  frameLayerRef,
  onExportStandaloneTab,
  layerGroupStandard
}: MapPreviewTopRightToolbarProps) {
  return (
    <div
      data-allow-context-menu
      className="fixed top-2 sm:top-4 right-2 sm:right-4 z-[500] pointer-events-auto flex h-10 sm:h-12 items-center gap-1.5 sm:gap-2"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <MapSearchPanel
        isOpen={showBorderPanel}
        onToggle={onToggleBorderPanel}
        themeColor={themeColor}
        chromeSurfaceStyle={chromeSurfaceStyle}
        menuChromeSurfaceStyle={menuChromeSurfaceStyle}
        menuChromeAppearance={menuChromeAppearance}
        chromeHoverBackground={chromeHoverBackground}
        borderSearch={borderSearch}
        borderGeoJSON={borderGeoJSON}
        onClearBorder={onClearBorder}
        onClose={onCloseBorderPanel}
      />
      <MapLayerControl
        showPanel={showFrameLayerPanel}
        onTogglePanel={onToggleFrameLayerPanel}
        themeColor={themeColor}
        chromeSurfaceStyle={chromeSurfaceStyle}
        menuChromeSurfaceStyle={menuChromeSurfaceStyle}
        menuChromeAppearance={menuChromeAppearance}
        chromeHoverBackground={chromeHoverBackground}
        frames={frames}
        frameLayerVisibility={frameLayerVisibility}
        setFrameLayerVisibility={setFrameLayerVisibility}
        showAllFrames={showAllFrames}
        setShowAllFrames={setShowAllFrames}
        frameLayerRef={frameLayerRef}
        layerGroupStandard={layerGroupStandard}
      />
      <ChromeIconButton
        tooltip="导出"
        chromeSurfaceStyle={chromeSurfaceStyle}
        chromeHoverBackground={chromeHoverBackground}
        onClick={onExportStandaloneTab}
      >
        <Download size={18} className="sm:w-5 sm:h-5" />
      </ChromeIconButton>
    </div>
  );
}
