import { corsHeaders } from '../_shared/cors.ts';

type OverpassElement = {
  type: 'relation' | 'way' | 'node';
  id: number;
  tags?: Record<string, string>;
  members?: Array<{
    type: 'node' | 'way' | 'relation';
    ref: number;
    role: string;
    geometry?: Array<{ lat: number; lon: number }>;
  }>;
  geometry?: Array<{ lat: number; lon: number }>;
};

type OverpassResponse = { elements: OverpassElement[] };

function json(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...(init?.headers ?? {})
    }
  });
}

function convertOsmToGeoJSON(element: OverpassElement): unknown | null {
  if (element.members && element.members.length > 0) {
    const ways = element.members
      .filter((m) => m.type === 'way' && m.geometry && m.geometry.length > 0)
      .map((m) => ({
        role: m.role || 'outer',
        coordinates: m.geometry!.map((g) => [g.lon, g.lat])
      }));
    if (ways.length === 0) return null;
    return {
      type: 'FeatureCollection',
      features: ways.map((way) => ({
        type: 'Feature',
        properties: { role: way.role, ...(element.tags ?? {}) },
        geometry: { type: 'LineString', coordinates: way.coordinates }
      }))
    };
  }

  if (element.geometry && element.geometry.length > 0) {
    const coordinates = element.geometry.map((g) => [g.lon, g.lat]);
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { ...(element.tags ?? {}) },
          geometry: { type: 'LineString', coordinates }
        }
      ]
    };
  }

  return null;
}

function parseEndpointsFromEnv(): string[] {
  const raw = Deno.env.get('OVERPASS_ENDPOINTS');
  if (!raw) {
    return ['https://overpass-api.de', 'https://overpass.kumi.systems', 'https://overpass.nchc.org.tw'];
  }
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin') ?? undefined;
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) });
  if (req.method !== 'GET') {
    return json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders(origin) });
  }

  const url = new URL(req.url);
  const osmId = Number(url.searchParams.get('osmId') ?? '');
  const osmType = (url.searchParams.get('osmType') ?? 'relation') as 'relation' | 'way' | 'node';
  if (!Number.isFinite(osmId) || osmId <= 0) {
    return json({ error: 'Missing/invalid osmId' }, { status: 400, headers: corsHeaders(origin) });
  }
  if (!['relation', 'way', 'node'].includes(osmType)) {
    return json({ error: 'Invalid osmType' }, { status: 400, headers: corsHeaders(origin) });
  }

  const query = `
    [out:json][timeout:25];
    ${osmType}(${osmId});
    out geom;
  `;

  const acceptLang = req.headers.get('Accept-Language') || 'en';
  const endpoints = parseEndpointsFromEnv();

  let lastStatus = 0;
  let lastBody = '';
  for (const base of endpoints) {
    const upstream = `${base}/api/interpreter?data=${encodeURIComponent(query)}`;
    try {
      const r = await fetch(upstream, {
        headers: {
          Accept: 'application/json',
          'Accept-Language': acceptLang
        }
      });
      lastStatus = r.status;
      const text = await r.text();
      if (!r.ok) {
        lastBody = text;
        continue;
      }
      let data: OverpassResponse;
      try {
        data = JSON.parse(text);
      } catch {
        lastBody = text;
        continue;
      }

      const element = data.elements.find((e) => e.id === osmId);
      if (!element) {
        return json({ error: 'No data found for this ID' }, { status: 404, headers: corsHeaders(origin) });
      }
      const geojson = convertOsmToGeoJSON(element);
      return json(geojson, {
        headers: {
          ...corsHeaders(origin),
          // 同一 osmId 几何短期内可复用，减轻公共 Overpass 压力
          'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400'
        }
      });
    } catch (e) {
      lastBody = String(e);
      continue;
    }
  }

  return json(
    { error: 'All Overpass endpoints failed', lastStatus, lastBody: lastBody.slice(0, 2000) },
    { status: 502, headers: corsHeaders(origin) }
  );
});
