import type { CSSProperties } from 'react';

/** 全屏模态遮罩（便签编辑器等）：轻半透明 + 背景模糊，避免过重黑层 */
export const MODAL_BACKDROP_MASK_STYLE: CSSProperties = {
  backgroundColor: 'rgba(0, 0, 0, 0.15)',
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)'
};

/** 项目菜单等轻覆盖：模糊强度与 map UI chrome 一致，避免平整灰色遮罩 */
export function mapChromeMenuBackdropStyle(blurPx: number): CSSProperties {
  const b = Math.min(48, Math.max(0, blurPx));
  const style: CSSProperties = {
    backgroundColor: 'rgba(0, 0, 0, 0.12)'
  };
  if (b > 0) {
    const f = `blur(${b}px)`;
    style.backdropFilter = f;
    style.WebkitBackdropFilter = f;
  }
  return style;
}

export const DEFAULT_MAP_UI_CHROME_OPACITY = 0.9;
export const DEFAULT_MAP_UI_CHROME_BLUR_PX = 8;

/**
 * 地图上的小型悬浮控件使用与底图相称的中性色。这里刻意按「底图类型」切换，
 * 而非逐帧采样瓦片像素：后者在拖动地图时容易造成前景闪烁，也会增加合成成本。
 */
export function isDarkMapStyle(mapStyleId?: string): boolean {
  return mapStyleId === 'carto-dark' || mapStyleId === 'satellite';
}

export type MapChromeAppearance = 'light' | 'dark';

export function mapChromeAppearance(mapStyleId?: string): MapChromeAppearance {
  return isDarkMapStyle(mapStyleId) ? 'dark' : 'light';
}

/**
 * 仅用于图标优先的地图工具栏；边框也随深浅材质调整，避免深色地图上出现刺眼白框。
 */
export function mapChromeControlStyle(
  opacity: number,
  blurPx: number,
  mapStyleId?: string
): CSSProperties {
  const o = Math.min(1, Math.max(0, opacity));
  const b = Math.min(48, Math.max(0, blurPx));
  const dark = isDarkMapStyle(mapStyleId);
  const style: CSSProperties = {
    backgroundColor: dark ? `rgba(24, 24, 27, ${o})` : `rgba(255, 255, 255, ${o})`,
    // 内联 color 覆盖图标按钮的默认 Tailwind 前景色，让 SVG 图标与文字一同继承。
    color: dark ? 'rgba(255, 255, 255, 0.92)' : '#374151',
    // 深色玻璃保留一丝高光即可；默认 gray-100/80 在暗底上会显得像实线白框。
    borderColor: dark ? 'rgba(255, 255, 255, 0.18)' : undefined
  };
  if (b > 0) {
    const f = `blur(${b}px)`;
    style.backdropFilter = f;
    style.WebkitBackdropFilter = f;
  }
  return style;
}

/** 图标工具栏的悬停面，与 mapChromeControlStyle 保持同一亮暗语义。 */
export function mapChromeControlHoverBackground(opacity: number, mapStyleId?: string): string {
  const o = Math.min(1, Math.max(0, opacity) + 0.1);
  return isDarkMapStyle(mapStyleId) ? `rgba(24, 24, 27, ${o})` : `rgba(255, 255, 255, ${o})`;
}

/**
 * 文字密集的详情卡与编辑器使用的材质。
 * 与小控件共用深/浅语义，并严格沿用用户设置的透明度与模糊半径。
 */
export function mapChromeContentStyle(
  opacity: number,
  blurPx: number,
  mapStyleId?: string
): CSSProperties {
  const o = Math.min(1, Math.max(0, opacity));
  const b = Math.min(48, Math.max(0, blurPx));
  const dark = isDarkMapStyle(mapStyleId);
  const style: CSSProperties = {
    backgroundColor: dark ? `rgba(24, 24, 27, ${o})` : `rgba(255, 255, 255, ${o})`,
    color: dark ? 'rgba(255, 255, 255, 0.92)' : '#1f2937',
    // 面板根节点本身也必须覆盖原本的 gray-100 描边，不能只处理内部子元素。
    borderColor: dark ? 'rgba(255, 255, 255, 0.16)' : undefined
  };
  if (b > 0) {
    const f = `blur(${b}px)`;
    style.backdropFilter = f;
    style.WebkitBackdropFilter = f;
  }
  return style;
}

/**
 * 全局玻璃浮层描边：只用这一条细灰边，不要再叠 `ring-*`，否则会出现两种描边色。
 * gray-100/80 ≈ #f3f4f6 @ 80%，与 ChromeIconButton / canvas paint 一致。
 */
export const MAP_CHROME_SURFACE_BORDER_CLASS = 'border border-gray-100/80';

/**
 * 全局玻璃浮层外壳 class（圆角 / 阴影 / 描边）。
 * 与 ChromeIconButton、ChromeLabeledSlider 一致；底色+模糊用 `mapChromeSurfaceStyle`。
 */
export const MAP_CHROME_SURFACE_SHELL_CLASS = `rounded-lg shadow-lg ${MAP_CHROME_SURFACE_BORDER_CLASS}`;

/** 已有 `panelChromeStyle` 时的描边 class（替代 gray-200 + ring 双描边） */
export const MAP_CHROME_PANEL_EDGE_CLASS = MAP_CHROME_SURFACE_BORDER_CLASS;

export function mapChromeSurfaceStyle(opacity: number, blurPx: number): CSSProperties {
  const o = Math.min(1, Math.max(0, opacity));
  const b = Math.min(48, Math.max(0, blurPx));
  const style: CSSProperties = {
    backgroundColor: `rgba(255, 255, 255, ${o})`
  };
  if (b > 0) {
    const f = `blur(${b}px)`;
    style.backdropFilter = f;
    style.WebkitBackdropFilter = f;
  }
  return style;
}

/**
 * Leaflet DivIcon 等内联 HTML 用：与 `mapChromeSurfaceStyle` + `MAP_CHROME_SURFACE_SHELL_CLASS` 等价
 *（圆角 / 阴影 / 细描边 / 半透明白底 / backdrop）。
 */
export function mapChromeSurfaceInlineCss(opacity: number, blurPx: number): string {
  const o = Math.min(1, Math.max(0, opacity));
  const b = Math.min(48, Math.max(0, blurPx));
  const parts = [
    `background-color:rgba(255,255,255,${o})`,
    'border:1px solid rgba(243,244,246,0.8)',
    'border-radius:0.5rem',
    'box-shadow:0 10px 15px -3px rgba(0,0,0,0.1),0 4px 6px -4px rgba(0,0,0,0.1)'
  ];
  if (b > 0) {
    parts.push(`backdrop-filter:blur(${b}px)`, `-webkit-backdrop-filter:blur(${b}px)`);
  }
  return parts.join(';');
}

/** 图谱圆形底衬：填充与 mapChromeSurfaceStyle 一致，描边随不透明度略提亮 */
export function mapChromeHaloFillAndBorder(opacity: number, blurPx: number): { fill: string; border: string } {
  const surface = mapChromeSurfaceStyle(opacity, blurPx);
  const fill =
    typeof surface.backgroundColor === 'string'
      ? surface.backgroundColor
      : `rgba(255, 255, 255, ${DEFAULT_MAP_UI_CHROME_OPACITY})`;
  const o = Math.min(1, Math.max(0, opacity));
  const border = `rgba(255, 255, 255, ${Math.min(1, o + 0.1)})`;
  return { fill, border };
}

/**
 * Canvas / Cytoscape 用的玻璃面拆分色：
 * Cytoscape 的 `*-color` 只取 RGB，透明度必须写在独立的 `*-opacity` 上
 *（否则 rgba 里的 alpha 会被丢掉，看起来像实心白底）。
 * 边框对齐 ChromeIconButton：`border-gray-100/80`。
 */
export function mapChromeCanvasPaint(opacity: number): {
  fillColor: string;
  fillOpacity: number;
  borderColor: string;
  borderOpacity: number;
  borderWidth: number;
} {
  const o = Math.min(1, Math.max(0, opacity));
  return {
    fillColor: '#ffffff',
    fillOpacity: o,
    borderColor: '#f3f4f6',
    borderOpacity: 0.8,
    borderWidth: 1
  };
}

export function mapChromeHoverBackground(opacity: number): string {
  const o = Math.min(1, Math.max(0, opacity) + 0.1);
  return `rgba(255, 255, 255, ${o})`;
}
