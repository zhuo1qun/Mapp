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

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin') ?? undefined;
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) });
  if (req.method !== 'GET') {
    return json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders(origin) });
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get('q') ?? '').trim();
  const limit = Math.max(1, Math.min(30, Number(url.searchParams.get('limit') ?? '15') || 15));
  const mode = (url.searchParams.get('mode') ?? 'region') as 'region' | 'place';

  if (!q) {
    return json({ error: 'Missing q' }, { status: 400, headers: corsHeaders(origin) });
  }

  const endpoint = Deno.env.get('NOMINATIM_ENDPOINT') || 'https://nominatim.openstreetmap.org';
  const acceptLang = req.headers.get('Accept-Language') || 'en';

  // Nominatim policy recommends a valid User-Agent identifying your app.
  const userAgent =
    Deno.env.get('NOMINATIM_USER_AGENT') ||
    (Deno.env.get('NOMINATIM_EMAIL') ? `mapping-app (${Deno.env.get('NOMINATIM_EMAIL')})` : 'mapping-app');

  const featuretype =
    mode === 'region' ? '&featuretype=settlement,boundary,territory' : '';

  const upstream =
    `${endpoint}/search?format=json` +
    `&q=${encodeURIComponent(q)}` +
    `&limit=${limit}` +
    `&addressdetails=1` +
    featuretype;

  const r = await fetch(upstream, {
    headers: {
      Accept: 'application/json',
      'Accept-Language': acceptLang,
      'User-Agent': userAgent
    }
  });

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
      // 地理编码结果不可使用不可变长缓存，客户端每次应向服务器校验。
      'Cache-Control': 'public, max-age=0, must-revalidate'
    }
  });
});
