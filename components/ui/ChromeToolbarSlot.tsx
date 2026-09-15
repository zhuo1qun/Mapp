import React, { type CSSProperties, type ReactNode, type RefObject } from 'react';
import type { MapChromeAppearance } from '../../utils/map/mapChromeStyle';
import { useStickyValue } from '../../utils/ui/useStickyValue';
import {
  ChromeWindow,
  type ChromeWindowAlign,
  type ChromeWindowSurface
} from './ChromeWindow';

/** 顶栏槽共用的窗口尺寸：设置 / 筛选 / 检索同一外壳上 morph。 */
export const CHROME_TOOLBAR_WINDOW_CLASS =
  'flex flex-col w-[min(20rem,calc(100vw-1rem))] max-h-[min(72dvh,calc(100dvh-1rem))]';

export type ChromeToolbarSlotSpec = {
  align?: ChromeWindowAlign;
  surface?: ChromeWindowSurface;
  className?: string;
  style?: CSSProperties;
  backdropLabel: string;
  children: ReactNode;
  role?: string;
  'aria-label'?: string;
};

type ChromeToolbarSlotProps<K extends string> = {
  kind: K | null;
  onClose: () => void;
  appearance?: MapChromeAppearance;
  top?: number | null;
  dismissIgnoreRefs?: ReadonlyArray<RefObject<HTMLElement | null>>;
  resolve: (kind: K) => ChromeToolbarSlotSpec;
};

/**
 * 顶栏工作窗槽：kind 在各按钮间切换时壳不卸，只换内容并过渡尺寸/对齐。
 * 槽空了才走出场。
 */
export function ChromeToolbarSlot<K extends string>({
  kind,
  onClose,
  appearance,
  top,
  dismissIgnoreRefs,
  resolve
}: ChromeToolbarSlotProps<K>) {
  const sticky = useStickyValue(kind);
  if (sticky == null) return null;
  const spec = resolve(sticky);
  return (
    <ChromeWindow
      open={kind != null}
      onClose={onClose}
      appearance={appearance}
      top={top}
      align={spec.align}
      surface={spec.surface}
      className={spec.className}
      style={spec.style}
      backdropLabel={spec.backdropLabel}
      dismissIgnoreRefs={dismissIgnoreRefs}
      role={spec.role}
      aria-label={spec['aria-label']}
    >
      <div key={sticky} className="pointer-events-auto flex min-h-0 min-w-0 flex-1 flex-col">
        {spec.children}
      </div>
    </ChromeWindow>
  );
}
