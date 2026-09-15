import React, { useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { ChromeIconButton } from './ChromeIconButton';
import { ChromeMenuItem } from './ChromeMenuItem';
import { ChromeWindow } from './ChromeWindow';
import { useChromeMenuTop } from '../../utils/ui/chromeMenuPosition';

export interface ChromeDownloadMenuItem {
  id: string;
  label: string;
  onSelect: () => void;
}

export interface ChromeDownloadMenuProps {
  chromeSurfaceStyle?: React.CSSProperties;
  chromeHoverBackground?: string;
  /** 主按钮 title */
  title?: string;
  items: ChromeDownloadMenuItem[];
  /** 菜单额外 class */
  menuClassName?: string;
}

/**
 * 下载图标点击展开菜单：合并「独立网页」「JSON」等导出项，与 Map / Graph 顶栏玻璃风格一致。
 */
export const ChromeDownloadMenu: React.FC<ChromeDownloadMenuProps> = ({
  chromeSurfaceStyle,
  chromeHoverBackground,
  title = '导出',
  items,
  menuClassName = ''
}) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuTop = useChromeMenuTop(open, wrapRef, 6);

  return (
    <div ref={wrapRef} className="relative flex h-10 sm:h-12 items-center shrink-0">
      <ChromeIconButton
        chromeSurfaceStyle={chromeSurfaceStyle}
        chromeHoverBackground={chromeHoverBackground}
        nonChromeIdleHover="imperative-gray100"
        tooltip={title}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Download size={18} className="sm:w-5 sm:h-5" />
      </ChromeIconButton>

      <ChromeWindow
        open={open && items.length > 0}
        onClose={() => setOpen(false)}
        backdropLabel="关闭导出菜单"
        surface="menu"
        align="end"
        top={menuTop}
        className={`min-w-[13rem] ${menuClassName}`.trim()}
        style={chromeSurfaceStyle}
        dismissIgnoreRefs={[wrapRef]}
        role="menu"
      >
        {items.map((item) => (
          <ChromeMenuItem
            key={item.id}
            role="menuitem"
            hoverBackground={chromeHoverBackground}
            onClick={(e) => {
              e.stopPropagation();
              item.onSelect();
              setOpen(false);
            }}
          >
            {item.label}
          </ChromeMenuItem>
        ))}
      </ChromeWindow>
    </div>
  );
};
