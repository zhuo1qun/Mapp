import React from 'react';
import { Check, Pencil } from 'lucide-react';
import { ChromeIconButton } from './ChromeIconButton';
import { PortalTooltip } from './PortalTooltip';

type Props = {
  isEditMode: boolean;
  themeColor: string;
  chromeSurfaceStyle?: React.CSSProperties;
  chromeHoverBackground?: string;
  onEnterEditMode: () => void;
  onExitEditMode: () => void;
};

function darkenHex(hex: string, factor = 0.9): string {
  const channels = [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)].map((value) =>
    Math.max(0, Math.floor(parseInt(value, 16) * factor)).toString(16).padStart(2, '0')
  );
  return `#${channels.join('')}`.toUpperCase();
}

/** Map 与 Board 共用的工作区编辑/完成按钮。 */
export function WorkspaceEditToggle({ isEditMode, themeColor, chromeSurfaceStyle, chromeHoverBackground, onEnterEditMode, onExitEditMode }: Props) {
  if (!isEditMode) {
    return <ChromeIconButton chromeSurfaceStyle={chromeSurfaceStyle} chromeHoverBackground={chromeHoverBackground} nonChromeIdleHover="imperative-gray100" onClick={onEnterEditMode} tooltip="编辑"><Pencil size={18} className="sm:h-5 sm:w-5" /></ChromeIconButton>;
  }
  return (
    <PortalTooltip content="完成" compact>
      <button type="button" onClick={(event) => { event.stopPropagation(); event.preventDefault(); onExitEditMode(); }} onPointerDown={(event) => event.stopPropagation()} className="ui-chrome-icon-button-expands flex h-10 items-center gap-1 rounded-xl px-2 text-sm font-bold text-theme-chrome-fg shadow-lg sm:h-12 sm:gap-2 sm:px-3" style={{ backgroundColor: themeColor }} aria-label="完成" onMouseEnter={(event) => { event.currentTarget.style.backgroundColor = darkenHex(themeColor); }} onMouseLeave={(event) => { event.currentTarget.style.backgroundColor = themeColor; }}>
        <Check size={18} className="sm:h-5 sm:w-5" />
        <span className="ui-chrome-icon-button-label hidden sm:inline">完成</span>
      </button>
    </PortalTooltip>
  );
}
