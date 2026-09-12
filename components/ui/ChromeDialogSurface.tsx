import React from 'react';
import type { MapChromeAppearance } from '../../utils/map/mapChromeStyle';

export type ChromeDialogSurfaceProps = React.HTMLAttributes<HTMLDivElement> & {
  appearance?: MapChromeAppearance;
};

/**
 * 常规居中对话框统一外壳。
 * 只收敛表面材质，不处理遮罩、关闭行为或移动端抽屉的定位差异。
 */
export const ChromeDialogSurface: React.FC<ChromeDialogSurfaceProps> = ({
  appearance = 'light',
  className = '',
  children,
  ...props
}) => (
  <div
    {...props}
    className={`map-chrome-content-${appearance} relative w-full rounded-2xl border border-gray-100/80 shadow-xl ${className}`.trim()}
  >
    {children}
  </div>
);
