import React from 'react';
import { Check, Pencil } from 'lucide-react';
import { ChromeIconButton } from '../../ui/ChromeIconButton';

interface MapTopRightEditToggleProps {
  isEditMode: boolean;
  themeColor: string;
  chromeSurfaceStyle: React.CSSProperties;
  chromeHoverBackground: string;
  onEnterEdit: () => void;
  onExitEdit: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

export function MapTopRightEditToggle({
  isEditMode,
  themeColor,
  chromeSurfaceStyle,
  chromeHoverBackground,
  onEnterEdit,
  onExitEdit
}: MapTopRightEditToggleProps) {
  return (
    <>
      {!isEditMode ? (
        <ChromeIconButton
          chromeSurfaceStyle={chromeSurfaceStyle}
          chromeHoverBackground={chromeHoverBackground}
          nonChromeIdleHover="imperative-gray100"
          onClick={onEnterEdit}
          tooltip="编辑"
        >
          <Pencil size={18} className="sm:w-5 sm:h-5" />
        </ChromeIconButton>
      ) : (
        <button
            type="button"
            onClick={onExitEdit}
            onPointerDown={(e) => e.stopPropagation()}
            className="ui-chrome-icon-button-expands flex h-10 sm:h-12 items-center gap-1 sm:gap-2 px-2 sm:px-3 text-sm text-theme-chrome-fg rounded-xl shadow-lg font-bold"
            style={{ backgroundColor: themeColor }}
            aria-label="完成"
            onMouseEnter={(e) => {
              const darkR = Math.max(0, Math.floor(parseInt(themeColor.slice(1, 3), 16) * 0.9));
              const darkG = Math.max(0, Math.floor(parseInt(themeColor.slice(3, 5), 16) * 0.9));
              const darkB = Math.max(0, Math.floor(parseInt(themeColor.slice(5, 7), 16) * 0.9));
              const darkHex =
                '#' +
                [darkR, darkG, darkB]
                  .map((x) => {
                    const hex = x.toString(16);
                    return hex.length === 1 ? '0' + hex : hex;
                  })
                  .join('')
                  .toUpperCase();
              e.currentTarget.style.backgroundColor = darkHex;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = themeColor;
            }}
          >
            <Check size={18} className="sm:w-5 sm:h-5" />
            <span className="ui-chrome-icon-button-label">完成</span>
          </button>
      )}
    </>
  );
}
