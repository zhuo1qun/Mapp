import { RefObject, useLayoutEffect, useState } from 'react';
import { computeAnchoredPanelPlacement } from './anchoredPanelPlacement';

export type FixedAnchorPosition = { left: number; top: number };

/**
 * 将面板锚定到按钮附近：默认对齐锚点右缘，下方不够则翻到上方（与 NoteEditor 同一套 placement）。
 * 关闭后保留上次坐标，供退出动画继续锚定。
 * `layoutRevision` 应在锚点可能因滚动、缩放、拖拽而移动时变化。
 */
export function useFixedAnchorPosition(
  enabled: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  options: {
    panelWidth: number;
    panelHeight?: number;
    horizontalPadding?: number;
    gapAbove?: number;
  },
  layoutRevision: unknown
): FixedAnchorPosition | null {
  const {
    panelWidth,
    panelHeight = 280,
    horizontalPadding = 8,
    gapAbove = 8
  } = options;
  const [pos, setPos] = useState<FixedAnchorPosition | null>(null);

  useLayoutEffect(() => {
    if (!enabled) return;
    const update = () => {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const next = computeAnchoredPanelPlacement(r, {
        panelWidth,
        panelHeight,
        gap: gapAbove,
        padding: horizontalPadding,
        align: 'end'
      });
      setPos({ left: next.left, top: next.top });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [enabled, panelWidth, panelHeight, horizontalPadding, gapAbove, layoutRevision]);

  return pos;
}

/** 与重构方案中的命名对齐（语义同 {@link useFixedAnchorPosition}） */
export { useFixedAnchorPosition as useFixedAnchorPortal };
