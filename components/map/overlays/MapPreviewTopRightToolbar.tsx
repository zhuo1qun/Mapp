import React from 'react';
import { Download } from 'lucide-react';
import { MapSearchPanel, type BorderSearchState } from '../controls/MapSearchPanel';
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
  onExportStandaloneTab: () => void;
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
  onExportStandaloneTab,
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
