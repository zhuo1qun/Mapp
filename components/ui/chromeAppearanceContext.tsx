import { createContext, useContext } from 'react';
import type { MapChromeAppearance } from '../../utils/map/mapChromeStyle';

/** 当前有效的面板亮暗（用户开关 + Mapping 卫星强制）。 */
export const ChromeAppearanceContext = createContext<MapChromeAppearance>('light');

export function useChromeAppearance(override?: MapChromeAppearance): MapChromeAppearance {
  const ctx = useContext(ChromeAppearanceContext);
  return override ?? ctx;
}
