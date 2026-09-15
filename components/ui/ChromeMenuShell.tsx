import React from 'react';
import type { MapChromeAppearance } from '../../utils/map/mapChromeStyle';
import { useChromeAppearance } from './chromeAppearanceContext';
import { AnchoredWorkspaceWindow } from './AnchoredWorkspaceWindow';

export type ChromeMenuShellProps = React.HTMLAttributes<HTMLDivElement> & {
  appearance?: MapChromeAppearance;
};

/** 浮层选项菜单统一外壳：圆角、描边、阴影、纵向留白与深浅地图前景色。 */
export const ChromeMenuShell: React.FC<ChromeMenuShellProps> = ({
  appearance: appearanceProp,
  className = '',
  children,
  ...props
}) => {
  const appearance = useChromeAppearance(appearanceProp);
  return (
    <AnchoredWorkspaceWindow
      {...props}
      className={`map-chrome-content-${appearance} rounded-xl border border-gray-100/80 py-1 shadow-xl ${className}`.trim()}
    >
      {children}
    </AnchoredWorkspaceWindow>
  );
};
