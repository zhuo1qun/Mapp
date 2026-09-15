import { useLayoutEffect, useState, type RefObject } from 'react';

/** 与顶栏 `right-2 sm:right-4` / 编辑栏 `lg:right-[calc(20rem+0.75rem)]` 一致 */
export const WORKSPACE_INSPECTOR_RIGHT_EDGE = 'calc(20rem + 0.75rem)';

/**
 * 编辑属性侧栏可见时，同步顶栏右侧菜单的 page-right 对齐边距。
 */
export function applyWorkspaceRightEdgeForInspector(active: boolean) {
  const root = document.documentElement;
  if (active && window.matchMedia('(min-width: 1024px)').matches) {
    root.style.setProperty('--workspace-ui-right-edge', WORKSPACE_INSPECTOR_RIGHT_EDGE);
  } else {
    root.style.removeProperty('--workspace-ui-right-edge');
  }
}

/** 固定定位菜单：仅取锚点下方 top，左右由 `.ui-chrome-menu-page-left/right` 决定 */
export function useChromeMenuTop(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  gapPx = 8
): number | null {
  const [top, setTop] = useState<number | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      // 关闭后保留上次 top，供 ChromePresence 退出动画继续锚定。
      return;
    }
    const update = () => {
      const el = anchorRef.current;
      if (!el) return;
      setTop(el.getBoundingClientRect().bottom + gapPx);
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, anchorRef, gapPx]);

  return top;
}
