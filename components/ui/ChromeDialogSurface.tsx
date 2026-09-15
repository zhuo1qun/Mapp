import React from 'react';
import type { MapChromeAppearance } from '../../utils/map/mapChromeStyle';
import { useChromeAppearance } from './chromeAppearanceContext';

export type ChromeDialogSurfaceProps = React.HTMLAttributes<HTMLDivElement> & {
  appearance?: MapChromeAppearance;
};

/** 对话框、编辑器共用的圆角 / 描边 / 投影外壳；底色与模糊由调用方的材质样式提供。 */
export const CHROME_DIALOG_SURFACE_SHELL_CLASS = 'rounded-xl border border-gray-100/80 shadow-xl';

/**
 * 常规居中对话框统一外壳。
 * 只收敛表面材质，不处理遮罩、关闭行为或移动端抽屉的定位差异。
 */
export const ChromeDialogSurface: React.FC<ChromeDialogSurfaceProps> = ({
  appearance: appearanceProp,
  className = '',
  children,
  ...props
}) => {
  const appearance = useChromeAppearance(appearanceProp);
  return (
    <div
      {...props}
      className={`map-chrome-content-${appearance} relative w-full ${CHROME_DIALOG_SURFACE_SHELL_CLASS} ${className}`.trim()}
    >
      {children}
    </div>
  );
};
