import { corsHeaders } from '../_shared/cors.ts';

type NominatimSearchResult = {
  place_id: number;
  licence?: string;
  osm_type: 'node' | 'way' | 'relation';
  osm_id: number;
  lat: string;
  lon: string;
  display_name: string;
  class?: string;
  type?: string;
  importance?: number;
  address?: Record<string, string>;
  geojson?: unknown;
};

function json(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...(init?.headers ?? {})
    }
  });
}

function nominatimHeaders(req: Request): HeadersInit {
  const acceptLang =
    req.headers.get('Accept-Language') || 'zh-CN,zh;q=0.9,en;q=0.8';
  const userAgent =
    Deno.env.get('NOMINATIM_USER_AGENT') ||
    (Deno.env.get('NOMINATIM_EMAIL')
      ? `mapping-app (${Deno.env.get('NOMINATIM_EMAIL')})`
      : 'mapping-app/1.0 (boundary-search)');
  return {
    Accept: 'application/json',
    'Accept-Language': acceptLang,
    'User-Agent': userAgent
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin') ?? undefined;
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) });
  if (req.method !== 'GET') {
    return json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders(origin) });
  }

  const url = new URL(req.url);
  const endpoint = Deno.env.get('NOMINATIM_ENDPOINT') || 'https://nominatim.openstreetmap.org';
  const headers = nominatimHeaders(req);

  // —— lookup：按 osm id 取详情（可带 polygon_geojson）——
  const osmIdRaw = url.searchParams.get('osmId');
  const osmType = (url.searchParams.get('osmType') ?? '') as 'relation' | 'way' | 'node' | '';
  if (osmIdRaw) {
    const osmId = Number(osmIdRaw);
    if (!Number.isFinite(osmId) || osmId <= 0) {
      return json({ error: 'Missing/invalid osmId' }, { status: 400, headers: corsHeaders(origin) });
    }
    if (!['relation', 'way', 'node'].includes(osmType)) {
      return json({ error: 'Invalid osmType' }, { status: 400, headers: corsHeaders(origin) });
    }
    const prefix = osmType === 'relation' ? 'R' : osmType === 'way' ? 'W' : 'N';
    const wantPolygon = url.searchParams.get('polygon') !== '0';
    const upstream =
      `${endpoint}/lookup?format=json` +
      `&osm_ids=${prefix}${osmId}` +
      `&addressdetails=1` +
      (wantPolygon ? '&polygon_geojson=1' : '');

    const r = await fetch(upstream, { headers });
    const text = await r.text();
    if (!r.ok) {
      return json(
        { error: 'Upstream error', status: r.status, body: text.slice(0, 2000) },
        { status: 502, headers: corsHeaders(origin) }
      );
    }
    let data: NominatimSearchResult[];
    try {
      data = JSON.parse(text);
    } catch {
      return json({ error: 'Bad upstream JSON' }, { status: 502, headers: corsHeaders(origin) });
    }
    return json(data, {
      headers: {
        ...corsHeaders(origin),
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400'
      }
    });
  }

  // —— search ——
  const q = (url.searchParams.get('q') ?? '').trim();
  const limit = Math.max(1, Math.min(30, Number(url.searchParams.get('limit') ?? '15') || 15));
  const mode = (url.searchParams.get('mode') ?? 'region') as 'region' | 'place';
  const viewbox = (url.searchParams.get('viewbox') ?? '').trim();
  const bounded = url.searchParams.get('bounded') === '1';

  if (!q) {
    return json({ error: 'Missing q' }, { status: 400, headers: corsHeaders(origin) });
  }

  // Nominatim 仅接受单一 featuretype：country|state|city|settlement
  // 区域检索用 settlement；过严可去掉。禁止逗号列表。
  const featuretype = mode === 'region' ? '&featuretype=settlement' : '';

  let upstream =
    `${endpoint}/search?format=json` +
    `&q=${encodeURIComponent(q)}` +
    `&limit=${limit}` +
    `&addressdetails=1` +
    featuretype;

  if (viewbox) {
    upstream += `&viewbox=${encodeURIComponent(viewbox)}`;
    if (bounded) upstream += '&bounded=1';
  }

  const r = await fetch(upstream, { headers });
  const text = await r.text();
  if (!r.ok) {
    return json(
      { error: 'Upstream error', status: r.status, body: text.slice(0, 2000) },
      { status: 502, headers: corsHeaders(origin) }
    );
  }

  let data: NominatimSearchResult[];
  try {
    data = JSON.parse(text);
  } catch {
    return json({ error: 'Bad upstream JSON' }, { status: 502, headers: corsHeaders(origin) });
  }

  return json(data, {
    headers: {
      ...corsHeaders(origin),
      'Cache-Control': 'public, max-age=0, must-revalidate'
    }
  });
});
