/**
 * 外部地图导航：优先用 geo: / 原生 App scheme 唤起系统「用何应用打开」，
 * 避免 window.open(https://…) 直接进网页。
 *
 * 应用内坐标为 WGS-84；Apple / 高德等国内图源按需转 GCJ-02。
 */

import { wgs84ToGcj02 } from './chinaCoords';

export function hasNavigableGpsCoords(coords: { lat: number; lng: number } | null | undefined): boolean {
  if (!coords) return false;
  const { lat, lng } = coords;
  if (typeof lat !== 'number' || typeof lng !== 'number' || Number.isNaN(lat) || Number.isNaN(lng)) {
    return false;
  }
  if (lat === 0 && lng === 0) return false;
  return true;
}

export function isLikelyIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1;
}

export function isLikelyAndroid(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent || '');
}

function isLikelyMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (isLikelyIOS() || isLikelyAndroid()) return true;
  return /Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent || '');
}

/** 同页跳转 scheme（供一键导航的原生 App 路径使用）。 */
function assignUrl(url: string): void {
  window.location.assign(url);
}

/** 用户从地图服务列表明确选择后，网页端在新窗口打开点位。 */
function openWebMap(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * 网页无法可靠侦测某个地图 App 是否已安装。移动端先尝试它的 scheme；
 * 若页面没有离开，再以该服务的网页点位页兜底，且永远不传路线参数。
 */
function openNativeMapWithFallback(nativeUrl: string, fallbackUrl: string): void {
  assignUrl(nativeUrl);
  window.setTimeout(() => {
    if (document.visibilityState === 'visible') openWebMap(fallbackUrl);
  }, 900);
}

export type ExternalMapAppId = 'system' | 'apple' | 'amap' | 'baidu' | 'google';

export type ExternalMapAppChoice = {
  id: ExternalMapAppId;
  label: string;
  hint?: string;
};

/**
 * 可选地图应用列表。首项固定为 Apple 地图，所有项只查看点位。
 */
export function listExternalMapApps(): ExternalMapAppChoice[] {
  const apps: ExternalMapAppChoice[] = [
    {
      id: 'apple',
      label: 'Apple 地图'
    }
  ];
  apps.push(
    { id: 'amap', label: '高德地图' },
    { id: 'baidu', label: '百度地图' },
    { id: 'google', label: 'Google 地图' }
  );
  return apps;
}

function geoUri(lat: number, lng: number, label: string): string {
  // geo: 为通用意图；多数地图 App 会自行处理 WGS-84
  const q = label ? `${lat},${lng}(${label})` : `${lat},${lng}`;
  return `geo:${lat},${lng}?q=${encodeURIComponent(q)}`;
}

function appleMapsAppUri(lat: number, lng: number, label: string): string {
  const gcj = wgs84ToGcj02(lat, lng);
  let url = `maps://?ll=${gcj.lat},${gcj.lng}`;
  if (label) url += `&q=${encodeURIComponent(label)}`;
  return url;
}

function appleMapsWebUri(lat: number, lng: number, label: string): string {
  const gcj = wgs84ToGcj02(lat, lng);
  let url = `https://maps.apple.com/?ll=${gcj.lat},${gcj.lng}`;
  if (label) url += `&q=${encodeURIComponent(label)}`;
  return url;
}

function googleMapsUri(lat: number, lng: number, label: string, preferApp: boolean): string {
  const point = `${lat},${lng}`;
  if (preferApp && isLikelyIOS()) {
    let url = `comgooglemaps://?center=${encodeURIComponent(point)}&zoom=16`;
    if (label) url += `&q=${encodeURIComponent(label)}`;
    return url;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(point)}`;
}

function amapWebUri(lat: number, lng: number, label: string): string {
  const gcj = wgs84ToGcj02(lat, lng);
  const point = `${gcj.lng},${gcj.lat}`;
  return `https://uri.amap.com/marker?position=${encodeURIComponent(point)}&name=${encodeURIComponent(label || '点位')}&src=Mapp&callnative=0`;
}

function baiduWebUri(lat: number, lng: number, label: string): string {
  return `https://api.map.baidu.com/marker?location=${encodeURIComponent(`${lat},${lng}`)}&title=${encodeURIComponent(label || '点位')}&coord_type=wgs84&output=html&src=Mapp`;
}

function amapAppUri(lat: number, lng: number, label: string): string {
  const gcj = wgs84ToGcj02(lat, lng);
  const scheme = isLikelyIOS() ? 'iosamap' : 'androidamap';
  return `${scheme}://viewMap?sourceApplication=Mapp&poiname=${encodeURIComponent(label || '点位')}&lat=${gcj.lat}&lon=${gcj.lng}&dev=0`;
}

function baiduAppUri(lat: number, lng: number, label: string): string {
  return `baidumap://map/marker?location=${lat},${lng}&title=${encodeURIComponent(label || '点位')}&coord_type=wgs84&src=Mapp`;
}

/**
 * 分享给其它应用时只使用 HTTPS 点位链接：自定义 App scheme 仅在当前设备可用，
 * 不能作为微信等接收方的可靠内容。
 */
export function externalMapShareUrl(
  appId: ExternalMapAppId,
  lat: number,
  lng: number,
  opts?: { label?: string }
): string | null {
  if (!hasNavigableGpsCoords({ lat, lng })) return null;
  const label = (opts?.label || '').trim() || 'mark';
  switch (appId) {
    case 'apple':
      return appleMapsWebUri(lat, lng, label);
    case 'amap':
      return amapWebUri(lat, lng, label);
    case 'baidu':
      return baiduWebUri(lat, lng, label);
    case 'google':
    case 'system':
    default:
      return googleMapsUri(lat, lng, label, false);
  }
}

/** 打开指定地图服务并标出点位；不发起路线导航。 */
export function openExternalMapApp(
  appId: ExternalMapAppId,
  lat: number,
  lng: number,
  opts?: { label?: string }
): void {
  if (!hasNavigableGpsCoords({ lat, lng })) return;
  const label = (opts?.label || '').trim() || 'mark';

  switch (appId) {
    case 'system':
      if (isLikelyMobile()) {
        assignUrl(geoUri(lat, lng, label));
      } else {
        openWebMap(googleMapsUri(lat, lng, label, false));
      }
      return;
    case 'apple':
      if (isLikelyIOS()) {
        openNativeMapWithFallback(appleMapsAppUri(lat, lng, label), appleMapsWebUri(lat, lng, label));
      } else {
        openWebMap(appleMapsWebUri(lat, lng, label));
      }
      return;
    case 'amap':
      if (isLikelyMobile()) {
        openNativeMapWithFallback(amapAppUri(lat, lng, label), amapWebUri(lat, lng, label));
      } else {
        openWebMap(amapWebUri(lat, lng, label));
      }
      return;
    case 'baidu':
      if (isLikelyMobile()) {
        openNativeMapWithFallback(baiduAppUri(lat, lng, label), baiduWebUri(lat, lng, label));
      } else {
        openWebMap(baiduWebUri(lat, lng, label));
      }
      return;
    case 'google':
      if (isLikelyIOS()) {
        openNativeMapWithFallback(googleMapsUri(lat, lng, label, true), googleMapsUri(lat, lng, label, false));
      } else if (isLikelyAndroid()) {
        assignUrl(geoUri(lat, lng, label));
      } else {
        openWebMap(googleMapsUri(lat, lng, label, false));
      }
      return;
    default:
      openWebMap(googleMapsUri(lat, lng, label, false));
  }
}

/**
 * 旧的一键路线导航入口：移动端优先 geo:（系统询问用何应用）；
 * iOS 无多应用选择器时退到 Apple 地图 App（maps://，非网页）；
 * 桌面打开 Google 网页版。
 *
 * 新界面中的「在地图中打开」请使用 ExternalNavigationSheet + openExternalMapApp，
 * 该路径只会标出点位，不会创建路线。
 */
export function openExternalNavigation(
  lat: number,
  lng: number,
  opts?: { label?: string }
): void {
  if (!hasNavigableGpsCoords({ lat, lng })) return;
  const label = (opts?.label || '').trim() || 'mark';

  if (isLikelyAndroid()) {
    // Android：geo: 会弹出系统「用哪个应用打开」
    assignUrl(geoUri(lat, lng, label));
    return;
  }

  if (isLikelyIOS()) {
    // iOS WebView/Safari 没有多地图系统选择器；maps:// 进 App，避免 https 网页
    assignUrl(appleMapsAppUri(lat, lng, label));
    return;
  }

  if (isLikelyMobile()) {
    assignUrl(geoUri(lat, lng, label));
    return;
  }

  // 桌面：无原生地图意图时用网页
  window.open(googleMapsUri(lat, lng, label, false), '_blank', 'noopener,noreferrer');
}

/** @deprecated 保留兼容；中国境内判断见 chinaCoords */
export { isCoordInChina } from './chinaCoords';
