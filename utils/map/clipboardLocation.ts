import type { Coordinates } from '../../types';
import { bd09ToWgs84, gcj02ToWgs84 } from './chinaCoords';

export type ClipboardLocationSource =
  | 'coordinates'
  | 'geo-uri'
  | 'google-maps'
  | 'apple-maps'
  | 'amap'
  | 'baidu-maps'
  | 'openstreetmap'
  | 'bing-maps'
  | 'url';

export type ParsedClipboardLocation = {
  coords: Coordinates;
  source: ClipboardLocationSource;
  title?: string;
  body?: string;
};

const DECIMAL = '[-+]?\\d{1,3}(?:\\.\\d+)?';

function normalizeSharedLocationText(value: string): string {
  return value
    // 地图网站的“嵌入地图”通常复制为 iframe HTML，查询参数分隔符会被实体化。
    .replace(/&(?:amp|#0*38|#x0*26);/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    // 兼容聊天或 Markdown 中为避免自动链接而添加的反斜杠。
    .replace(/\\([:/?.&=])/g, '$1');
}

function coords(latValue: unknown, lngValue: unknown): Coordinates | null {
  const lat = typeof latValue === 'number' ? latValue : Number.parseFloat(String(latValue));
  const lng = typeof lngValue === 'number' ? lngValue : Number.parseFloat(String(lngValue));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function pair(value: string | null | undefined, separator = /\s*[,，]\s*/): Coordinates | null {
  if (!value) return null;
  const parts = value.trim().split(separator);
  if (parts.length < 2) return null;
  return coords(parts[0], parts[1]);
}

function queryPair(params: URLSearchParams, latKeys: string[], lngKeys: string[]): Coordinates | null {
  for (const latKey of latKeys) {
    for (const lngKey of lngKeys) {
      const result = coords(params.get(latKey), params.get(lngKey));
      if (params.has(latKey) && params.has(lngKey) && result) return result;
    }
  }
  return null;
}

function gcjPair(value: string | null | undefined, lngFirst = false): Coordinates | null {
  if (!value) return null;
  const parts = value.trim().split(/\s*[,，]\s*/);
  if (parts.length < 2) return null;
  const raw = lngFirst ? coords(parts[1], parts[0]) : coords(parts[0], parts[1]);
  return raw ? gcj02ToWgs84(raw.lat, raw.lng) : null;
}

function textParam(params: URLSearchParams, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = params.get(key)?.replace(/\s+/g, ' ').trim();
    if (value) return value;
  }
  return undefined;
}

function parseUrl(url: URL): ParsedClipboardLocation | null {
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const params = url.searchParams;

  if (host.endsWith('openstreetmap.org')) {
    const marker = queryPair(params, ['mlat'], ['mlon']);
    if (marker) return { coords: marker, source: 'openstreetmap' };
    const hash = url.hash.match(/(?:^#|[?&])map=\d+(?:\.\d+)?\/([-+\d.]+)\/([-+\d.]+)/i);
    const center = hash ? coords(hash[1], hash[2]) : null;
    if (center) return { coords: center, source: 'openstreetmap' };
  }

  if (host.endsWith('google.com') || host.endsWith('google.cn')) {
    for (const key of ['destination', 'query', 'center', 'viewpoint', 'origin']) {
      const result = pair(params.get(key));
      if (result) return { coords: result, source: 'google-maps' };
    }
    const at = decodeURIComponent(url.pathname).match(new RegExp(`@(${DECIMAL}),(${DECIMAL})(?:,|$)`));
    const dataCoords = decodeURIComponent(`${url.pathname}${url.search}`).match(
      new RegExp(`!3d(${DECIMAL})!4d(${DECIMAL})(?:!|$)`)
    );
    const result = at
      ? coords(at[1], at[2])
      : dataCoords
        ? coords(dataCoords[1], dataCoords[2])
        : null;
    if (result) return { coords: result, source: 'google-maps' };
  }

  if (host === 'maps.apple.com' || host.endsWith('.maps.apple.com')) {
    const content = {
      title: textParam(params, ['name']),
      body: textParam(params, ['address'])
    };
    // Apple 新版统一 URL 使用 WGS-84 的 coordinate / center。
    for (const key of ['coordinate', 'center']) {
      const result = pair(params.get(key));
      if (result) return { coords: result, source: 'apple-maps', ...content };
    }
    // 旧版中国区 ll 等参数沿用 Apple 地图显示坐标（GCJ-02）。
    for (const key of ['ll', 'daddr', 'saddr', 'sll']) {
      const result = gcjPair(params.get(key));
      if (result) return { coords: result, source: 'apple-maps', ...content };
    }
  }

  if (host === 'amap.com' || host === 'uri.amap.com' || host.endsWith('.amap.com')) {
    const content = {
      title: textParam(params, ['name', 'poiname']),
      body: textParam(params, ['address'])
    };
    // 本项目分享的高德网页链接使用 position=lng,lat，坐标系为 GCJ-02。
    for (const key of ['position', 'center']) {
      const isWgs84 = (params.get('coordinate') || '').toLowerCase() === 'wgs84';
      const raw = params.get(key);
      const result = isWgs84 && raw
        ? (() => {
            const values = raw.split(/\s*[,，]\s*/);
            return values.length >= 2 ? coords(values[1], values[0]) : null;
          })()
        : gcjPair(raw, true);
      if (result) return { coords: result, source: 'amap', ...content };
    }
    const raw = queryPair(params, ['lat', 'latitude'], ['lon', 'lng', 'longitude']);
    if (raw) {
      return { coords: gcj02ToWgs84(raw.lat, raw.lng), source: 'amap', ...content };
    }
  }

  if (host === 'baidu.com' || host === 'api.map.baidu.com' || host.endsWith('.baidu.com')) {
    const location = pair(params.get('location'));
    if (location) {
      // 本项目生成的百度分享链接明确写入 coord_type=wgs84。
      const coordType = (params.get('coord_type') || '').toLowerCase();
      return {
        coords:
          coordType === 'wgs84'
            ? location
            : coordType === 'gcj02'
              ? gcj02ToWgs84(location.lat, location.lng)
              : bd09ToWgs84(location.lat, location.lng),
        source: 'baidu-maps',
        title: textParam(params, ['title', 'name']),
        body: textParam(params, ['content', 'address'])
      };
    }
  }

  if (host.endsWith('bing.com')) {
    const result = pair(params.get('cp'), /\s*~\s*/);
    if (result) return { coords: result, source: 'bing-maps' };
  }

  const generic = queryPair(
    params,
    ['lat', 'latitude', 'y'],
    ['lng', 'lon', 'long', 'longitude', 'x']
  );
  return generic ? { coords: generic, source: 'url' } : null;
}

/**
 * 只接受包含明确经纬度的剪贴板内容，避免把普通地址误判后创建到错误位置。
 */
export function parseClipboardLocation(rawText: string): ParsedClipboardLocation | null {
  const text = normalizeSharedLocationText(rawText).trim();
  if (!text) return null;

  const geo = text.match(new RegExp(`(?:^|\\s)geo:(${DECIMAL}),(${DECIMAL})(?:[,;?\\s]|$)`, 'i'));
  const geoCoords = geo ? coords(geo[1], geo[2]) : null;
  if (geoCoords) return { coords: geoCoords, source: 'geo-uri' };

  const urlText = text.match(/https?:\/\/[^\s<>"']+/i)?.[0]?.replace(/[)\]}>，。；;]+$/, '');
  if (urlText) {
    try {
      const parsed = parseUrl(new URL(urlText));
      if (parsed) return parsed;
    } catch {
      // 继续尝试纯文本坐标。
    }
  }

  const labelled = text.match(
    new RegExp(`(?:纬度|latitude|lat)\\s*[:：=]?\\s*(${DECIMAL})[\\s,，;；]+(?:经度|longitude|long|lng|lon)\\s*[:：=]?\\s*(${DECIMAL})`, 'i')
  );
  const labelledCoords = labelled ? coords(labelled[1], labelled[2]) : null;
  if (labelledCoords) return { coords: labelledCoords, source: 'coordinates' };

  const plain = text.match(new RegExp(`^\\s*[（(]?\\s*(${DECIMAL})\\s*[,，]\\s*(${DECIMAL})\\s*[）)]?\\s*$`));
  const plainCoords = plain ? coords(plain[1], plain[2]) : null;
  return plainCoords ? { coords: plainCoords, source: 'coordinates' } : null;
}

