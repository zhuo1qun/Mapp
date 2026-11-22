import type { Coordinates } from '../../types';

export type ClipboardLocationSource =
  | 'coordinates'
  | 'geo-uri'
  | 'google-maps'
  | 'apple-maps'
  | 'openstreetmap'
  | 'bing-maps'
  | 'url';

export type ParsedClipboardLocation = {
  coords: Coordinates;
  source: ClipboardLocationSource;
};

const DECIMAL = '[-+]?\\d{1,3}(?:\\.\\d+)?';

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
    const result = at ? coords(at[1], at[2]) : null;
    if (result) return { coords: result, source: 'google-maps' };
  }

  if (host === 'maps.apple.com' || host.endsWith('.maps.apple.com')) {
    for (const key of ['ll', 'daddr', 'saddr', 'sll', 'q']) {
      const result = pair(params.get(key));
      if (result) return { coords: result, source: 'apple-maps' };
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
  const text = rawText.trim();
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

