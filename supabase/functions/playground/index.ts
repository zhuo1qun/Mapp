import { corsHeaders } from '../_shared/cors.ts';

const HOURS_TO_LIVE = 48;
const MAX_ENTRIES_PER_IP = 24;
const MAX_IMAGES_PER_IP = 6;
const MAX_IMAGES_PER_ENTRY = 3;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MEDIA_BUCKET = 'playground-media';
const allowedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

type PublicEntry = {
  id: string;
  note: Record<string, unknown>;
  imageUrls: string[];
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
};

function json(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...(init.headers || {}) }
  });
}

function serviceHeaders() {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');
  return { apikey: key, Authorization: `Bearer ${key}` };
}

function supabaseUrl() {
  const url = Deno.env.get('SUPABASE_URL');
  if (!url) throw new Error('SUPABASE_URL is required');
  return url.replace(/\/$/, '');
}

async function sha256(value: string) {
  const data = new TextEncoder().encode(value);
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  return [...bytes].map((item) => item.toString(16).padStart(2, '0')).join('');
}

function sourceIp(req: Request) {
  const forwarded = req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for') || '';
  return forwarded.split(',')[0].trim();
}

async function ipHash(req: Request) {
  const ip = sourceIp(req);
  const salt = Deno.env.get('PLAYGROUND_IP_SALT');
  if (!ip || !salt) throw new Error('IP rate limiting is not configured');
  return sha256(`${salt}:${ip}`);
}

function ownerToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function toUrl(path: string) {
  return `${supabaseUrl()}/storage/v1/object/public/${MEDIA_BUCKET}/${path}`;
}

function asTime(value: unknown) {
  const time = new Date(String(value)).getTime();
  return Number.isFinite(time) ? time : Date.now();
}

function publicEntry(row: Record<string, unknown>): PublicEntry {
  const paths = Array.isArray(row.image_paths) ? row.image_paths.filter((path): path is string => typeof path === 'string') : [];
  return {
    id: String(row.id),
    note: (row.note && typeof row.note === 'object' ? row.note : {}) as Record<string, unknown>,
    imageUrls: paths.map(toUrl),
    createdAt: asTime(row.created_at),
    updatedAt: asTime(row.updated_at),
    expiresAt: asTime(row.expires_at)
  };
}

function sanitizeEntry(value: unknown) {
  if (!value || typeof value !== 'object') throw new Error('Invalid entry');
  const input = value as Record<string, unknown>;
  const coords = input.coords as Record<string, unknown> | undefined;
  const lat = Number(coords?.lat);
  const lng = Number(coords?.lng);
  const text = typeof input.text === 'string' ? input.text.trim() : '';
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    throw new Error('Invalid map position');
  }
  if (!text || text.length > 5000) throw new Error('Text must be between 1 and 5000 characters');
  const emoji = typeof input.emoji === 'string' ? input.emoji.slice(0, 12) : '📍';
  const tags = Array.isArray(input.tags)
    ? input.tags.slice(0, 8).flatMap((tag) => {
        if (!tag || typeof tag !== 'object') return [];
        const candidate = tag as Record<string, unknown>;
        const label = typeof candidate.label === 'string' ? candidate.label.trim().slice(0, 48) : '';
        return label ? [{ id: crypto.randomUUID(), label, color: '#64748b' }] : [];
      })
    : [];
  const color = typeof input.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(input.color) ? input.color : undefined;
  return { coords: { lat, lng }, text, emoji, tags, ...(color ? { color } : {}), variant: 'standard' };
}

async function rest(path: string, init: RequestInit = {}) {
  const response = await fetch(`${supabaseUrl()}/rest/v1/${path}`, {
    ...init,
    headers: { ...serviceHeaders(), ...(init.headers || {}) }
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof body?.message === 'string' ? body.message : 'Database request failed');
  return body;
}

async function removeStorage(paths: string[]) {
  if (!paths.length) return;
  await fetch(`${supabaseUrl()}/storage/v1/object/${MEDIA_BUCKET}`, {
    method: 'DELETE',
    headers: { ...serviceHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefixes: paths })
  });
}

async function cleanupExpired() {
  const expired = await rest(`playground_entries?select=id,image_paths&expires_at=lt.${encodeURIComponent(new Date().toISOString())}`) as Array<Record<string, unknown>>;
  if (!expired.length) return;
  await removeStorage(expired.flatMap((entry) => Array.isArray(entry.image_paths) ? entry.image_paths.filter((path): path is string => typeof path === 'string') : []));
  await rest(`playground_entries?id=in.(${expired.map((entry) => entry.id).join(',')})`, { method: 'DELETE' });
}

async function uploadImage(entryId: string, file: File, index: number) {
  if (!allowedImageTypes.has(file.type) || file.size > MAX_IMAGE_BYTES) {
    throw new Error('Each image must be JPEG, PNG, WebP, or GIF and no larger than 5 MB');
  }
  const extension = file.type.split('/')[1] === 'jpeg' ? 'jpg' : file.type.split('/')[1];
  const path = `${entryId}/${crypto.randomUUID()}.${extension}`;
  const response = await fetch(`${supabaseUrl()}/storage/v1/object/${MEDIA_BUCKET}/${path}`, {
    method: 'POST',
    headers: { ...serviceHeaders(), 'Content-Type': file.type, 'x-upsert': 'false' },
    body: file
  });
  if (!response.ok) throw new Error(`Image ${index + 1} upload failed`);
  return path;
}

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin') ?? undefined;
  const cors = corsHeaders(origin);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    await cleanupExpired();
    const url = new URL(req.url);
    const tail = url.pathname.split('/').filter(Boolean).at(-1) || '';
    // `/functions/v1/playground` 的最后一段也是函数名；只有 UUID 才是记录 id。
    const id = /^[0-9a-f-]{36}$/i.test(tail) ? tail : undefined;

    if (req.method === 'GET') {
      const rows = await rest('playground_entries?select=id,note,image_paths,created_at,updated_at,expires_at&order=created_at.desc') as Array<Record<string, unknown>>;
      return json({ data: rows.map(publicEntry) }, { headers: { ...cors, 'Cache-Control': 'no-store' } });
    }

    if (req.method === 'POST' && !id) {
      const ip = await ipHash(req);
      const form = await req.formData();
      if (form.get('action') !== 'create') return json({ error: 'Unknown action' }, { status: 400, headers: cors });
      const entry = sanitizeEntry(JSON.parse(String(form.get('entry') || 'null')));
      const images = form.getAll('images').filter((item): item is File => item instanceof File);
      if (images.length > MAX_IMAGES_PER_ENTRY) return json({ error: `最多 ${MAX_IMAGES_PER_ENTRY} 张图片` }, { status: 400, headers: cors });
      const quotaRows = await rest(`playground_entries?select=image_count&client_ip_hash=eq.${ip}&created_at=gt.${encodeURIComponent(new Date(Date.now() - HOURS_TO_LIVE * 3600_000).toISOString())}`) as Array<{ image_count: number }>;
      const usedImages = quotaRows.reduce((total, row) => total + (Number(row.image_count) || 0), 0);
      if (quotaRows.length >= MAX_ENTRIES_PER_IP) return json({ error: `同一网络在 ${HOURS_TO_LIVE} 小时内最多可发布 ${MAX_ENTRIES_PER_IP} 条记录。`, code: 'entry_quota' }, { status: 429, headers: cors });
      if (usedImages + images.length > MAX_IMAGES_PER_IP) return json({ error: `同一网络在 ${HOURS_TO_LIVE} 小时内最多可发布 ${MAX_IMAGES_PER_IP} 张图片。`, code: 'image_quota' }, { status: 429, headers: cors });

      const entryId = crypto.randomUUID();
      const token = ownerToken();
      let imagePaths: string[] = [];
      try {
        imagePaths = await Promise.all(images.map((file, index) => uploadImage(entryId, file, index)));
        const now = new Date();
        const expiresAt = new Date(now.getTime() + HOURS_TO_LIVE * 3600_000);
        const inserted = await rest('rpc/create_playground_entry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            p_id: entryId,
            p_client_ip_hash: ip,
            p_owner_token_hash: await sha256(token),
            p_note: entry,
            p_image_paths: imagePaths,
            p_image_count: imagePaths.length,
            p_created_at: now.toISOString(),
            p_expires_at: expiresAt.toISOString()
          })
        }) as Array<Record<string, unknown>> | Record<string, unknown>;
        const row = Array.isArray(inserted) ? inserted[0] : inserted;
        return json({ data: publicEntry(row), ownerToken: token }, { status: 201, headers: cors });
      } catch (error) {
        await removeStorage(imagePaths);
        throw error;
      }
    }

    if (!id) return json({ error: 'Invalid entry id' }, { status: 400, headers: cors });
    const token = req.headers.get('X-Playground-Owner') || '';
    if (!token) return json({ error: 'Only the publisher can change this entry' }, { status: 403, headers: cors });
    const rows = await rest(`playground_entries?select=*&id=eq.${id}&owner_token_hash=eq.${await sha256(token)}`) as Array<Record<string, unknown>>;
    const current = rows[0];
    if (!current) return json({ error: 'Entry not found or not owned by this browser' }, { status: 404, headers: cors });

    if (req.method === 'POST') {
      const form = await req.formData();
      if (form.get('action') !== 'update') return json({ error: 'Unknown action' }, { status: 400, headers: cors });
      const note = sanitizeEntry(JSON.parse(String(form.get('entry') || 'null')));
      const images = form.getAll('images').filter((item): item is File => item instanceof File);
      if (images.length > MAX_IMAGES_PER_ENTRY) return json({ error: `最多 ${MAX_IMAGES_PER_ENTRY} 张图片` }, { status: 400, headers: cors });
      const quotaRows = await rest(`playground_entries?select=image_count&client_ip_hash=eq.${String(current.client_ip_hash)}&created_at=gt.${encodeURIComponent(new Date(Date.now() - HOURS_TO_LIVE * 3600_000).toISOString())}`) as Array<{ image_count: number }>;
      const usedImages = quotaRows.reduce((total, row) => total + (Number(row.image_count) || 0), 0);
      const existingImageCount = Number(current.image_count) || 0;
      if (usedImages - existingImageCount + images.length > MAX_IMAGES_PER_IP) {
        return json({ error: `同一网络在 ${HOURS_TO_LIVE} 小时内最多可发布 ${MAX_IMAGES_PER_IP} 张图片。`, code: 'image_quota' }, { status: 429, headers: cors });
      }
      let imagePaths: string[] = [];
      try {
        imagePaths = await Promise.all(images.map((file, index) => uploadImage(id, file, index)));
        const updated = await rest(`playground_entries?id=eq.${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
          body: JSON.stringify({
            note,
            image_paths: imagePaths,
            image_count: imagePaths.length,
            updated_at: new Date().toISOString()
          })
        }) as Array<Record<string, unknown>>;
        const oldPaths = Array.isArray(current.image_paths)
          ? current.image_paths.filter((path): path is string => typeof path === 'string')
          : [];
        await removeStorage(oldPaths);
        return json({ data: publicEntry(updated[0]) }, { headers: cors });
      } catch (error) {
        await removeStorage(imagePaths);
        throw error;
      }
    }

    if (req.method === 'PATCH') {
      const note = sanitizeEntry(await req.json());
      const updated = await rest(`playground_entries?id=eq.${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({ note, updated_at: new Date().toISOString() })
      }) as Array<Record<string, unknown>>;
      return json({ data: publicEntry(updated[0]) }, { headers: cors });
    }
    if (req.method === 'DELETE') {
      await removeStorage(Array.isArray(current.image_paths) ? current.image_paths.filter((path): path is string => typeof path === 'string') : []);
      await rest(`playground_entries?id=eq.${id}`, { method: 'DELETE' });
      return json({ data: { id } }, { headers: cors });
    }
    return json({ error: 'Method not allowed' }, { status: 405, headers: cors });
  } catch (error) {
    console.error('playground error', error);
    const message = error instanceof Error ? error.message : 'Unexpected error';
    const status = message.includes('最多可发布') ? 429 : 500;
    return json({ error: message }, { status, headers: cors });
  }
});
