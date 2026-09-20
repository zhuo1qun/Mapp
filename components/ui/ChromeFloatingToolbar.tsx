import React, { type CSSProperties, type ReactNode } from 'react';
import type { MapChromeAppearance } from '../../utils/map/mapChromeStyle';
import {
  DEFAULT_MAP_UI_CHROME_BLUR_PX,
  DEFAULT_MAP_UI_CHROME_OPACITY,
  mapChromeContentStyle
} from '../../utils/map/mapChromeStyle';
import { CHROME_DIALOG_SURFACE_SHELL_CLASS } from './ChromeDialogSurface';
import { useChromeAppearance } from './chromeAppearanceContext';

type Props = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  appearance?: MapChromeAppearance;
  /** 绝对定位；默认底部居中（涂鸦 / 取景器）。 */
  placement?: 'bottom' | 'none';
};

/**
 * 浮层工具条：与 ChromeWindow / 对话框同一套圆角、描边、投影与玻璃材质。
 */
export function ChromeFloatingToolbar({
  children,
  className = '',
  style,
  appearance: appearanceProp,
  placement = 'bottom'
}: Props) {
  const appearance = useChromeAppearance(appearanceProp);
  const surfaceStyle = style ?? mapChromeContentStyle(
    DEFAULT_MAP_UI_CHROME_OPACITY,
    DEFAULT_MAP_UI_CHROME_BLUR_PX,
    appearance
  );
  const placeCls =
    placement === 'bottom'
      ? 'absolute bottom-6 left-1/2 z-50 -translate-x-1/2'
      : '';

  return (
    <div
      className={`${placeCls} map-chrome-content-${appearance} ${CHROME_DIALOG_SURFACE_SHELL_CLASS} flex items-center gap-2 px-3 py-2 ${className}`.trim()}
      style={surfaceStyle}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}
