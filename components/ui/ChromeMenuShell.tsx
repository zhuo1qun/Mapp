import React from 'react';
import type { MapChromeAppearance } from '../../utils/map/mapChromeStyle';

export type ChromeMenuShellProps = React.HTMLAttributes<HTMLDivElement> & {
  appearance?: MapChromeAppearance;
};

/** 浮层选项菜单统一外壳：圆角、描边、阴影、纵向留白与深浅地图前景色。 */
export const ChromeMenuShell: React.FC<ChromeMenuShellProps> = ({
  appearance = 'light',
  className = '',
  children,
  ...props
}) => (
  <div
    {...props}
    className={`map-chrome-content-${appearance} rounded-xl border border-gray-100/80 py-1 shadow-xl ${className}`.trim()}
  >
    {children}
  </div>
);
