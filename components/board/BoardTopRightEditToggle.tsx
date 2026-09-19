import React from 'react';
import { Check, Pencil } from 'lucide-react';
import { ChromeIconButton } from '../ui/ChromeIconButton';
import { PortalTooltip } from '../ui/PortalTooltip';

type Props = {
  isUIVisible: boolean;
  isEditMode: boolean;
  themeColor: string;
  chromeSurfaceStyle?: React.CSSProperties;
  chromeHoverBackground?: string;
  onEnterEditMode: () => void;
  onExitEditMode: () => void;
  /** 与右侧属性面板错开：lg 为 w-80 面板 + 0.75rem 间距（子元素 margin 无法改变 fixed 容器的 right） */
  reserveRightForInspector?: boolean;
};

function darkenHex(hex: string, factor = 0.9): string {
  const darkR = Math.max(0, Math.floor(parseInt(hex.slice(1, 3), 16) * factor));
  const darkG = Math.max(0, Math.floor(parseInt(hex.slice(3, 5), 16) * factor));
  const darkB = Math.max(0, Math.floor(parseInt(hex.slice(5, 7), 16) * factor));
  return (
    '#' +
    [darkR, darkG, darkB]
      .map((x) => {
        const h = x.toString(16);
        return h.length === 1 ? '0' + h : h;
      })
      .join('')
      .toUpperCase()
  );
}

export const BoardTopRightEditToggle: React.FC<Props> = ({
  isUIVisible,
  isEditMode,
  themeColor,
  chromeSurfaceStyle,
  chromeHoverBackground,
  onEnterEditMode,
  onExitEditMode,
  reserveRightForInspector = false
}) => {
  if (!isUIVisible) return null;

  return (
    <div
      data-allow-context-menu
      className={`fixed top-2 sm:top-4 z-[500] hidden h-10 sm:h-12 gap-3 pointer-events-auto items-center sm:flex ${
        reserveRightForInspector
          ? 'right-2 sm:right-4 lg:right-[calc(20rem+0.75rem)]'
          : 'right-2 sm:right-4'
      }`}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {!isEditMode ? (
        <ChromeIconButton
          chromeSurfaceStyle={chromeSurfaceStyle}
          chromeHoverBackground={chromeHoverBackground}
          nonChromeIdleHover="imperative-gray100"
          onClick={() => onEnterEditMode()}
          tooltip="编辑"
        >
          <Pencil size={18} className="sm:w-5 sm:h-5" />
        </ChromeIconButton>
      ) : (
        <PortalTooltip content="完成" compact>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onExitEditMode();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="flex h-10 sm:h-12 items-center gap-1 sm:gap-2 px-2 sm:px-3 text-theme-chrome-fg rounded-xl shadow-lg font-bold"
            style={{ backgroundColor: themeColor }}
            aria-label="完成"
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = darkenHex(themeColor);
            }}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = themeColor)}
          >
            <Check size={18} className="sm:w-5 sm:h-5" />
            <span className="hidden sm:inline">Done</span>
          </button>
        </PortalTooltip>
      )}
    </div>
  );
};
