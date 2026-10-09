import { useLayoutEffect, useState, type RefObject } from 'react';

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
