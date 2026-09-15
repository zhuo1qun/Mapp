/**
 * Nominatim / Overpass 访问层：优先 Supabase Edge，失败再直连；
 * 画边界时优先 Nominatim polygon_geojson，再 Overpass。
 */
import {
  getSupabasePublishableKey,
  getSupabaseUrl,
  hasSupabaseClientConfig
} from '../supabaseEnv';

export type OsmType = 'relation' | 'way' | 'node';

export type NominatimResult = {
  place_id: number;
  licence?: string;
  osm_type: OsmType;
  osm_id: number;
  lat: string;
  lon: string;
  display_name: string;
  class?: string;
  type?: string;
  importance?: number;
  address?: Record<string, string>;
  geojson?: GeoJSON.Geometry;
};

export interface OverpassElement {
  type: OsmType;
  id: number;
  tags?: Record<string, string>;
  members?: Array<{
    type: OsmType;
    ref: number;
    role: string;
    geometry?: Array<{ lat: number; lon: number }>;
  }>;
  geometry?: Array<{ lat: number; lon: number }>;
}

export interface OverpassResponse {
  elements: OverpassElement[];
}

const DIRECT_OVERPASS_ENDPOINTS = [
  'https://overpass-api.de',
  'https://overpass.kumi.systems',
  'https://overpass.nchc.org.tw'
];

const ACCEPT_LANGUAGE = () =>
  typeof navigator !== 'undefined' && navigator.language
    ? `${navigator.language},zh;q=0.9,en;q=0.8`
    : 'zh-CN,zh;q=0.9,en;q=0.8';

function edgeAuthHeaders(): HeadersInit {
  const key = getSupabasePublishableKey();
  return {
    Accept: 'application/json',
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Accept-Language': ACCEPT_LANGUAGE()
  };
}

async function fetchEdgeJson<T>(pathAndQuery: string): Promise<T | null> {
  if (!hasSupabaseClientConfig()) return null;
  const base = getSupabaseUrl().replace(/\/$/, '');
  try {
    const response = await fetch(`${base}/functions/v1/${pathAndQuery}`, {
      headers: edgeAuthHeaders()
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch (error) {
    console.warn('Supabase edge request failed, will fallback:', pathAndQuery, error);
    return null;
  }
}

function sortRegionResults(results: NominatimResult[]): NominatimResult[] {
  return [...results].sort((a, b) => {
    const score = (item: NominatimResult) => {
      let s = item.osm_type === 'relation' ? 4 : item.osm_type === 'way' ? 2 : 0;
      if (item.class === 'boundary') s += 3;
      if (item.class === 'place') s += 1;
      if (item.type === 'administrative') s += 2;
      s += (item.importance ?? 0) * 2;
      return s;
    };
    return score(b) - score(a);
  });
}

export type SearchNominatimOptions = {
  q: string;
  mode: 'region' | 'place';
  limit?: number;
  /** Nominatim: left,top,right,bottom = west,north,east,south */
  viewbox?: string;
  /** true 时严格限制在 viewbox 内 */
  bounded?: boolean;
};

/**
 * 地名/区域搜索：Edge geocode → 直连 Nominatim。
 * region 仅用合法单一 featuretype=settlement。
 */
export async function searchNominatim(options: SearchNominatimOptions): Promise<NominatimResult[]> {
  const q = options.q.trim();
  if (!q) return [];
  const limit = Math.max(1, Math.min(30, options.limit ?? 15));

  const edgeParams = new URLSearchParams({
    q,
    limit: String(limit),
    mode: options.mode
  });
  if (options.viewbox) edgeParams.set('viewbox', options.viewbox);
  if (options.bounded) edgeParams.set('bounded', '1');

  const fromEdge = await fetchEdgeJson<NominatimResult[]>(`geocode?${edgeParams.toString()}`);
  if (Array.isArray(fromEdge)) {
    return options.mode === 'region' ? sortRegionResults(fromEdge) : fromEdge;
  }

  // Nominatim 合法 featuretype 仅为 country|state|city|settlement（不可逗号列表）
  const featuretype = options.mode === 'region' ? '&featuretype=settlement' : '';
  let url =
    `https://nominatim.openstreetmap.org/search?format=json` +
    `&q=${encodeURIComponent(q)}` +
    `&limit=${limit}` +
    `&addressdetails=1` +
    featuretype;
  if (options.viewbox) {
    url += `&viewbox=${encodeURIComponent(options.viewbox)}`;
    if (options.bounded) url += '&bounded=1';
  }

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'Accept-Language': ACCEPT_LANGUAGE()
    }
  });
  if (!response.ok) throw new Error('Nominatim search failed');
  const data = (await response.json()) as NominatimResult[];
  return options.mode === 'region' ? sortRegionResults(data) : data;
}

/** @deprecated 使用 searchNominatim */
export const searchRegionBoundaries = async (name: string): Promise<NominatimResult[]> =>
  searchNominatim({ q: name, mode: 'region', limit: 10 });

function nominatimResultToFeatureCollection(
  result: NominatimResult
): GeoJSON.FeatureCollection | null {
  if (!result.geojson) return null;
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          name: result.display_name,
          osm_type: result.osm_type,
          osm_id: result.osm_id,
          class: result.class,
          type: result.type
        },
        geometry: result.geojson
      }
    ]
  };
}

async function lookupNominatimPolygon(
  osmId: number,
  osmType: OsmType
): Promise<GeoJSON.FeatureCollection | null> {
  const edgeParams = new URLSearchParams({
    osmId: String(osmId),
    osmType,
    polygon: '1'
  });
  const fromEdge = await fetchEdgeJson<NominatimResult[]>(`geocode?${edgeParams.toString()}`);
  if (Array.isArray(fromEdge) && fromEdge[0]) {
    return nominatimResultToFeatureCollection(fromEdge[0]);
  }

  const prefix = osmType === 'relation' ? 'R' : osmType === 'way' ? 'W' : 'N';
  const url =
    `https://nominatim.openstreetmap.org/lookup?format=json` +
    `&osm_ids=${prefix}${osmId}` +
    `&addressdetails=1&polygon_geojson=1`;
  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'Accept-Language': ACCEPT_LANGUAGE()
      }
    });
    if (!response.ok) return null;
    const data = (await response.json()) as NominatimResult[];
    if (!data[0]) return null;
    return nominatimResultToFeatureCollection(data[0]);
  } catch (error) {
    console.warn('Nominatim lookup failed:', error);
    return null;
  }
}

/**
 * Enhanced converter from OSM to GeoJSON
 * Handles both Relations (with members) and Ways (with direct geometry)
 */
export function convertOsmToGeoJSON(element: OverpassElement): GeoJSON.FeatureCollection | null {
  if (element.members && element.members.length > 0) {
    const ways = element.members
      .filter((m) => m.type === 'way' && m.geometry && m.geometry.length > 0)
      .map((m) => ({
        role: m.role || 'outer',
        coordinates: m.geometry!.map((g) => [g.lon, g.lat] as [number, number])
      }));

    if (ways.length === 0) return null;

    return {
      type: 'FeatureCollection',
      features: ways.map((way) => ({
        type: 'Feature',
        properties: { role: way.role, ...element.tags },
        geometry: { type: 'LineString', coordinates: way.coordinates }
      }))
    };
  }

  if (element.geometry && element.geometry.length > 0) {
    const coordinates = element.geometry.map((g) => [g.lon, g.lat] as [number, number]);
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { ...element.tags },
          geometry: { type: 'LineString', coordinates }
        }
      ]
    };
  }

  return null;
}

async function fetchOverpassDirect(
  osmId: number,
  osmType: OsmType
): Promise<GeoJSON.FeatureCollection | null> {
  const query = `
    [out:json][timeout:25];
    ${osmType}(${osmId});
    out geom;
  `;

  let lastError: unknown = null;
  for (const base of DIRECT_OVERPASS_ENDPOINTS) {
    try {
      const response = await fetch(
        `${base}/api/interpreter?data=${encodeURIComponent(query)}`,
        { headers: { Accept: 'application/json' } }
      );
      if (!response.ok) {
        lastError = new Error(`Overpass ${base} status ${response.status}`);
        continue;
      }
      const data = (await response.json()) as OverpassResponse;
      const element = data.elements.find((e) => e.id === osmId);
      if (!element) {
        lastError = new Error('No data found for this ID');
        continue;
      }
      return convertOsmToGeoJSON(element);
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError) console.warn('All direct Overpass endpoints failed:', lastError);
  return null;
}

/**
 * Fetch full geometry for a specific OSM ID（兼容旧调用名）
 * 优先 Edge Overpass → 直连多节点 Overpass。
 */
export const fetchRelationGeometry = async (
  osmId: number,
  osmType: OsmType = 'relation'
): Promise<GeoJSON.FeatureCollection | null> => {
  const edgeParams = new URLSearchParams({
    osmId: String(osmId),
    osmType
  });
  const fromEdge = await fetchEdgeJson<GeoJSON.FeatureCollection | { error?: string }>(
    `overpass?${edgeParams.toString()}`
  );
  if (fromEdge && typeof fromEdge === 'object' && 'type' in fromEdge) {
    return fromEdge as GeoJSON.FeatureCollection;
  }

  const direct = await fetchOverpassDirect(osmId, osmType);
  if (direct) return direct;
  throw new Error('Failed to fetch relation geometry');
};

/**
 * 画边界：Nominatim 简化多边形优先，失败再 Overpass。
 */
export async function fetchBoundaryGeoJSON(
  osmId: number,
  osmType: OsmType
): Promise<GeoJSON.FeatureCollection | null> {
  if (osmType !== 'node') {
    const fromNominatim = await lookupNominatimPolygon(osmId, osmType);
    if (fromNominatim) return fromNominatim;
  }
  return fetchRelationGeometry(osmId, osmType);
}
