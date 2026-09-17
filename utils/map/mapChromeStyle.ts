import type { CSSProperties } from 'react';
import { parseHexToRgb } from '../theme/themeChrome';

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

export const DEFAULT_MAP_UI_CHROME_OPACITY = 0.6;
export const DEFAULT_MAP_UI_CHROME_OPACITY_BOTTOM = 0.4;
export const DEFAULT_MAP_UI_CHROME_BLUR_PX = 4;

function chromeGradientBackground(dark: boolean, opacity: number): string {
  const o = Math.min(1, Math.max(0, opacity));
  const rgb = dark ? '24 24 27' : '255 255 255';
  const top = `var(--map-ui-chrome-opacity-top, var(--map-ui-chrome-opacity, ${o}))`;
  const bottom = `var(--map-ui-chrome-opacity-bottom, var(--map-ui-chrome-opacity, ${o}))`;
  return `linear-gradient(180deg, rgb(${rgb} / ${top}) 0%, rgb(${rgb} / ${bottom}) 100%)`;
}

/**
 * 对话框的背景遮罩也跟随「面板背景透明度 / 模糊半径」。
 *
 * 遮罩仍保留少量明暗分离，避免低透明度时编辑器和背景完全融在一起；但不会再
 * 固定为一层 50% 黑色或 10px 模糊，因而 0px 模糊与低透明度会立刻体现在弹窗上。
 */
export function mapChromeModalBackdropStyle(opacity: number, blurPx: number): CSSProperties {
  const o = Math.min(1, Math.max(0, opacity));
  const b = Math.min(48, Math.max(0, blurPx));
  const style: CSSProperties = {
    // 透明面板对应更轻的背景压暗；满不透明面板也只到 20%，保持地图/画布仍可辨认。
    backgroundColor: `rgba(0, 0, 0, ${0.04 + o * 0.16})`
  };
  if (b > 0) {
    const f = `blur(${b}px)`;
    style.backdropFilter = f;
    style.WebkitBackdropFilter = f;
  }
  return style;
}

/**
 * 已拿到面板玻璃样式的组件（例如 NoteEditor / ThemeColorPicker）可用此函数让
 * 其 sibling 遮罩复用同一组参数，而无需额外穿透两层 props。
 */
export function mapChromeModalBackdropFromSurfaceStyle(surface?: CSSProperties): CSSProperties {
  const declaredOpacity = (surface as Record<string, unknown> | undefined)?.[
    '--map-chrome-surface-opacity'
  ];
  const background = typeof surface?.backgroundColor === 'string' ? surface.backgroundColor : '';
  const alpha = /rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\s*\)/i.exec(background)?.[1];
  const backdrop = typeof surface?.backdropFilter === 'string' ? surface.backdropFilter : '';
  const blur = /blur\(\s*([\d.]+)px\s*\)/i.exec(backdrop)?.[1];

  return mapChromeModalBackdropStyle(
    typeof declaredOpacity === 'number'
      ? declaredOpacity
      : alpha === undefined
        ? DEFAULT_MAP_UI_CHROME_OPACITY
        : Number(alpha),
    blur === undefined ? DEFAULT_MAP_UI_CHROME_BLUR_PX : Number(blur)
  );
}

/** 兼容尚未传入具体玻璃面参数的旧弹窗。 */
export const MODAL_BACKDROP_MASK_STYLE = mapChromeModalBackdropStyle(
  DEFAULT_MAP_UI_CHROME_OPACITY,
  DEFAULT_MAP_UI_CHROME_BLUR_PX
);

export type MapChromeAppearance = 'light' | 'dark';

export const SATELLITE_MAP_STYLE_ID = 'satellite';

export function isSatelliteMapStyle(mapStyleId?: string): boolean {
  return mapStyleId === SATELLITE_MAP_STYLE_ID;
}

function chromeIsDark(appearance?: MapChromeAppearance): boolean {
  return appearance === 'dark';
}

/**
 * 面板亮暗：用户在主题设置里的「暗色模式」优先；
 * 仅 Mapping 页的卫星底图会强制暗色（深色画布不再自动切暗）。
 */
export function resolveChromeAppearance(options: {
  darkMode: boolean;
  mapStyleId?: string;
  forceSatelliteDark?: boolean;
}): MapChromeAppearance {
  if (options.forceSatelliteDark && isSatelliteMapStyle(options.mapStyleId)) return 'dark';
  return options.darkMode ? 'dark' : 'light';
}

/** @deprecated 仅卫星仍视为暗底图；请改用 resolveChromeAppearance。 */
export function isDarkMapStyle(mapStyleId?: string): boolean {
  return isSatelliteMapStyle(mapStyleId);
}

export function mapChromeAppearance(
  mapStyleId?: string,
  darkMode = false,
  forceSatelliteDark = false
): MapChromeAppearance {
  return resolveChromeAppearance({ darkMode, mapStyleId, forceSatelliteDark });
}

/**
 * 仅用于图标优先的地图工具栏；边框也随深浅材质调整，避免深色地图上出现刺眼白框。
 */
export function mapChromeControlStyle(
  opacity: number,
  blurPx: number,
  appearance: MapChromeAppearance = 'light'
): CSSProperties {
  const o = Math.min(1, Math.max(0, opacity));
  const b = Math.min(48, Math.max(0, blurPx));
  const dark = chromeIsDark(appearance);
  const style = {
    // 不能再铺一层带 alpha 的 backgroundColor；它会与渐变复合，导致下端受上端牵连。
    backgroundColor: 'transparent',
    backgroundImage: chromeGradientBackground(dark, o),
    '--map-chrome-surface-opacity': o,
    // 内联 color 覆盖图标按钮的默认 Tailwind 前景色，让 SVG 图标与文字一同继承。
    color: dark ? 'rgba(255, 255, 255, 0.92)' : '#374151',
    // 深色玻璃保留一丝高光即可；默认 gray-100/80 在暗底上会显得像实线白框。
    borderColor: dark ? 'rgba(255, 255, 255, 0.18)' : undefined
  } as CSSProperties;
  if (b > 0) {
    const f = `blur(${b}px)`;
    style.backdropFilter = f;
    style.WebkitBackdropFilter = f;
  }
  return style;
}

/** 图标工具栏的悬停面，与 mapChromeControlStyle 保持同一亮暗语义。 */
export function mapChromeControlHoverBackground(
  opacity: number,
  appearance: MapChromeAppearance = 'light'
): string {
  const o = Math.min(1, Math.max(0, opacity) + 0.1);
  return chromeIsDark(appearance) ? `rgba(24, 24, 27, ${o})` : `rgba(255, 255, 255, ${o})`;
}

/**
 * 文字密集的详情卡与编辑器使用的材质。
 * 与小控件共用深/浅语义，并严格沿用用户设置的透明度与模糊半径。
 */
export function mapChromeContentStyle(
  opacity: number,
  blurPx: number,
  appearance: MapChromeAppearance = 'light'
): CSSProperties {
  const o = Math.min(1, Math.max(0, opacity));
  const b = Math.min(48, Math.max(0, blurPx));
  const dark = chromeIsDark(appearance);
  const style = {
    backgroundColor: 'transparent',
    backgroundImage: chromeGradientBackground(dark, o),
    '--map-chrome-surface-opacity': o,
    color: dark ? 'rgba(255, 255, 255, 0.92)' : '#1f2937',
    // 面板根节点本身也必须覆盖原本的 gray-100 描边，不能只处理内部子元素。
    borderColor: dark ? 'rgba(255, 255, 255, 0.16)' : undefined
  } as CSSProperties;
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

export function mapChromeSurfaceStyle(
  opacity: number,
  blurPx: number,
  appearance: MapChromeAppearance = 'light'
): CSSProperties {
  const o = Math.min(1, Math.max(0, opacity));
  const b = Math.min(48, Math.max(0, blurPx));
  const dark = chromeIsDark(appearance);
  const style = {
    backgroundColor: 'transparent',
    backgroundImage: chromeGradientBackground(dark, o),
    '--map-chrome-surface-opacity': o,
    color: dark ? 'rgba(255, 255, 255, 0.92)' : undefined,
    borderColor: dark ? 'rgba(255, 255, 255, 0.16)' : undefined
  } as CSSProperties;
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
    'background-color:transparent',
    `background-image:${chromeGradientBackground(false, o)}`,
    'border:1px solid rgba(243,244,246,0.8)',
    'border-radius:0.5rem',
    'box-shadow:0 10px 15px -3px rgba(0,0,0,0.1),0 4px 6px -4px rgba(0,0,0,0.1)'
  ];
  if (b > 0) {
    parts.push(`backdrop-filter:blur(${b}px)`, `-webkit-backdrop-filter:blur(${b}px)`);
  }
  return parts.join(';');
}

/**
 * 地图点位文字标签的玻璃面：在保留全局透明度与模糊设置的同时，
 * 以主题色轻微染色背景，并使用同色系描边。
 *
 * 不用 CSS `color-mix()`，使 Leaflet DivIcon 的内联样式在较旧 WebView 中也能稳定工作。
 */
export function mapChromeTextLabelInlineCss(
  opacity: number,
  blurPx: number,
  themeColor: string
): string {
  const themeRgb = parseHexToRgb(themeColor);
  if (!themeRgb) return mapChromeSurfaceInlineCss(opacity, blurPx);

  const o = Math.min(1, Math.max(0, opacity));
  // 使用白色与主题色的预混色，避免纯主题色半透明叠在深色底图上后显脏或降低可读性。
  const tint = 0.13;
  const background = [themeRgb.r, themeRgb.g, themeRgb.b]
    .map((channel) => Math.round(255 + (channel - 255) * tint))
    .join(',');
  const borderOpacity = Math.min(0.72, o * 0.75);

  return [
    mapChromeSurfaceInlineCss(o, blurPx),
    'background-color:transparent',
    `background-image:linear-gradient(180deg,rgba(${background},var(--map-ui-chrome-opacity-top,var(--map-ui-chrome-opacity,${o}))) 0%,rgba(${background},var(--map-ui-chrome-opacity-bottom,var(--map-ui-chrome-opacity,${o}))) 100%)`,
    `border-color:rgba(${themeRgb.r},${themeRgb.g},${themeRgb.b},${borderOpacity})`
  ].join(';');
}

/** 图谱圆形底衬：填充与 mapChromeSurfaceStyle 一致，描边随不透明度略提亮 */
export function mapChromeHaloFillAndBorder(opacity: number, _blurPx: number): { fill: string; border: string } {
  const o = Math.min(1, Math.max(0, opacity));
  // Canvas/Cytoscape 不支持 CSS 背景渐变，继续使用上端透明度作为单色近似。
  const fill = `rgba(255, 255, 255, ${o})`;
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

export function mapChromeHoverBackground(
  opacity: number,
  appearance: MapChromeAppearance = 'light'
): string {
  const o = Math.min(1, Math.max(0, opacity) + 0.1);
  return chromeIsDark(appearance) ? `rgba(24, 24, 27, ${o})` : `rgba(255, 255, 255, ${o})`;
}
