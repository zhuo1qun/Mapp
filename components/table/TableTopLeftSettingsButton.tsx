import React from 'react';
import { Settings } from 'lucide-react';
import { ChromeIconButton } from '../ui/ChromeIconButton';

type Props = {
  isUIVisible: boolean;
  themeColor?: string;
  chromeSurfaceStyle?: React.CSSProperties;
  chromeHoverBackground?: string;
  onOpenSettings: () => void;
  settingsOpen?: boolean;
  settingsButtonRef?: React.RefObject<HTMLButtonElement | null>;
};

export const TableTopLeftSettingsButton: React.FC<Props> = ({
  isUIVisible,
  themeColor,
  chromeSurfaceStyle,
  chromeHoverBackground,
  onOpenSettings,
  settingsOpen = false,
  settingsButtonRef
}) => {
  if (!isUIVisible) return null;
  return (
    <div
      data-allow-context-menu
      className="fixed ui-workspace-safe-top ui-workspace-left z-[500] pointer-events-auto flex h-10 sm:h-12 items-center"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <ChromeIconButton
        ref={settingsButtonRef}
        themeColor={themeColor}
        chromeSurfaceStyle={chromeSurfaceStyle}
        chromeHoverBackground={chromeHoverBackground}
        nonChromeIdleHover="imperative-gray100"
        active={settingsOpen}
        pressThemeFlash
        onClick={(e) => {
          e.stopPropagation();
          onOpenSettings();
        }}
        onPointerDown={(e) => e.stopPropagation()}
        tooltip="设置"
      >
        <Settings size={18} className="sm:w-5 sm:h-5" />
      </ChromeIconButton>
    </div>
  );
};

