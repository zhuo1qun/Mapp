import React from 'react';
import type { Map as LeafletMap } from 'leaflet';
import {
  ChromeCapsuleSlider,
  type ChromeCapsuleSliderWidth
} from './ChromeCapsuleSlider';

export type CustomHorizontalSliderWidth = ChromeCapsuleSliderWidth;

interface CustomHorizontalSliderProps {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  /** 拖动/点击轨道结束后触发一次（抬起时）；不传则仅 onChange */
  onCommit?: (value: number) => void;
  /** 保留以兼容既有调用方；胶囊填充走 chrome 材质，不再用主题色描边拇指 */
  themeColor?: string;
  /** 固定像素宽度，或 `stretch` 占满父级（用于设置面板等自适应布局） */
  width: CustomHorizontalSliderWidth;
  formatValue: (value: number) => string;
  mapInstance: LeafletMap | null;
  'aria-label'?: string;
}

/** 顶栏快捷滑块：共用 `ChromeCapsuleSlider`，窄宽时用紧凑高度。 */
export const CustomHorizontalSlider: React.FC<CustomHorizontalSliderProps> = ({
  themeColor: _themeColor,
  'aria-label': ariaLabel,
  ...rest
}) => <ChromeCapsuleSlider size="sm" aria-label={ariaLabel} {...rest} />;
