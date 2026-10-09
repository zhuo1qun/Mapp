import type { Coordinates, PlaygroundEntry, Tag } from '../../types';
import { getSupabasePublishableKey, getSupabaseUrl, hasSupabaseClientConfig } from '../supabaseEnv';

const OWNER_TOKENS_KEY = 'mapp-playground-owner-tokens-v1';

export type PlaygroundDraft = {
  coords: Coordinates;
  text: string;
  emoji?: string;
  tags?: Tag[];
  color?: string;
};

type PlaygroundResponse<T> = {
  data?: T;
  error?: string;
  code?: string;
  ownerToken?: string;
};

function endpoint(): string {
  const url = getSupabaseUrl();
  if (!url) throw new Error('Playground 尚未配置共享服务。');
  return `${url.replace(/\/$/, '')}/functions/v1/playground`;
}

function ownerTokens(): Record<string, string> {
  try {
    const value = JSON.parse(localStorage.getItem(OWNER_TOKENS_KEY) || '{}');
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

function saveOwnerToken(entryId: string, token: string): void {
  const tokens = ownerTokens();
  tokens[entryId] = token;
  localStorage.setItem(OWNER_TOKENS_KEY, JSON.stringify(tokens));
}

function removeOwnerToken(entryId: string): void {
  const tokens = ownerTokens();
  delete tokens[entryId];
  localStorage.setItem(OWNER_TOKENS_KEY, JSON.stringify(tokens));
}

async function request<T>(path = '', init?: RequestInit): Promise<PlaygroundResponse<T>> {
  const key = getSupabasePublishableKey();
  if (!key) throw new Error('Playground 尚未配置公开 API 密钥。');
  const response = await fetch(`${endpoint()}${path}`, {
    ...init,
    headers: {
      apikey: key,
      ...(init?.headers || {})
    }
  });
  const body = (await response.json().catch(() => ({}))) as PlaygroundResponse<T>;
  if (!response.ok) throw new Error(body.error || 'Playground 请求失败。');
  return body;
}

export function isPlaygroundConfigured(): boolean {
  return hasSupabaseClientConfig();
}

export function isEntryOwnedByThisBrowser(entryId: string): boolean {
  return Boolean(ownerTokens()[entryId]);
}

export async function listPlaygroundEntries(): Promise<PlaygroundEntry[]> {
  const response = await request<PlaygroundEntry[]>();
  return response.data || [];
}

export async function createPlaygroundEntry(
  draft: PlaygroundDraft,
  images: File[]
): Promise<PlaygroundEntry> {
  const form = new FormData();
  form.set('action', 'create');
  form.set('entry', JSON.stringify(draft));
  images.forEach((image) => form.append('images', image, image.name));
  const response = await request<PlaygroundEntry>('', { method: 'POST', body: form });
  if (!response.data || !response.ownerToken) throw new Error('发布成功，但未收到编辑凭证。');
  saveOwnerToken(response.data.id, response.ownerToken);
  return response.data;
}

export async function updatePlaygroundEntry(
  entryId: string,
  draft: PlaygroundDraft,
  images?: File[]
): Promise<PlaygroundEntry> {
  const ownerToken = ownerTokens()[entryId];
  if (!ownerToken) throw new Error('这条记录只能由发布它的浏览器编辑。');
  if (images) {
    const form = new FormData();
    form.set('action', 'update');
    form.set('entry', JSON.stringify(draft));
    images.forEach((image) => form.append('images', image, image.name));
    const response = await request<PlaygroundEntry>(`/${encodeURIComponent(entryId)}`, {
      method: 'POST',
      headers: { 'X-Playground-Owner': ownerToken },
      body: form
    });
    if (!response.data) throw new Error('更新失败。');
    return response.data;
  }
  const response = await request<PlaygroundEntry>(`/${encodeURIComponent(entryId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'X-Playground-Owner': ownerToken },
    body: JSON.stringify(draft)
  });
  if (!response.data) throw new Error('更新失败。');
  return response.data;
}

export async function deletePlaygroundEntry(entryId: string): Promise<void> {
  const ownerToken = ownerTokens()[entryId];
  if (!ownerToken) throw new Error('这条记录只能由发布它的浏览器删除。');
  await request(`/${encodeURIComponent(entryId)}`, {
    method: 'DELETE',
    headers: { 'X-Playground-Owner': ownerToken }
  });
  removeOwnerToken(entryId);
}
