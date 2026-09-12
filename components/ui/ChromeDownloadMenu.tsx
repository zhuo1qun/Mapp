import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download } from 'lucide-react';
import { ChromeIconButton } from './ChromeIconButton';
import { ChromeMenuItem } from './ChromeMenuItem';
import { ChromeMenuShell } from './ChromeMenuShell';
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
  /**
   * 菜单水平对齐：`page-right`（默认）对齐页面右侧边距；
   * `page-left` 对齐页面左侧；`button` 与按钮右缘齐平（旧行为）。
   */
  menuEdge?: 'page-right' | 'page-left' | 'button';
}

/**
 * 下载图标点击展开菜单：合并「独立网页」「JSON」等导出项，与 Map / Graph 顶栏玻璃风格一致。
 */
export const ChromeDownloadMenu: React.FC<ChromeDownloadMenuProps> = ({
  chromeSurfaceStyle,
  chromeHoverBackground,
  title = '导出',
  items,
  menuClassName = '',
  menuEdge = 'page-right'
}) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuTop = useChromeMenuTop(open, wrapRef, 6);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        const t = e.target as Node;
        const menu = document.getElementById('chrome-download-menu-portal');
        if (menu?.contains(t)) return;
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc, true);
    return () => document.removeEventListener('mousedown', onDoc, true);
  }, [open]);

  const edgeCls =
    menuEdge === 'page-left'
      ? 'ui-chrome-menu-page-left'
      : menuEdge === 'page-right'
        ? 'ui-chrome-menu-page-right'
        : 'right-0';

  const menu = open && items.length > 0 && menuTop != null && (
    <ChromeMenuShell
      id="chrome-download-menu-portal"
      role="menu"
      className={
        menuEdge === 'button'
          ? `absolute right-0 top-[calc(100%+6px)] z-[600] min-w-[13rem] ${menuClassName}`.trim()
          : `fixed z-[600] ${edgeCls} min-w-[13rem] ${menuClassName}`.trim()
      }
      style={
        menuEdge === 'button'
          ? chromeSurfaceStyle
          : { top: menuTop, ...chromeSurfaceStyle }
      }
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
    </ChromeMenuShell>
  );

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

      {menuEdge === 'button'
        ? menu
        : menu
          ? createPortal(menu, document.body)
          : null}
    </div>
  );
};
