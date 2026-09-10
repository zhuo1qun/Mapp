export type BuiltinExampleManifestEntry = {
  id: string;
  title: string;
  description?: string;
  file: string;
  order?: number;
};

const MANIFEST_URL = '/examples/manifest.json';

export async function fetchBuiltinExamplesManifest(): Promise<BuiltinExampleManifestEntry[]> {
  // 示例清单会随发版更新；要求浏览器先向服务器校验，而不是完全禁止缓存。
  const res = await fetch(MANIFEST_URL, { cache: 'no-cache' });
  if (!res.ok) return [];
  const data = (await res.json()) as BuiltinExampleManifestEntry[] | { examples?: BuiltinExampleManifestEntry[] };
  const list = Array.isArray(data) ? data : data.examples;
  if (!Array.isArray(list)) return [];
  return [...list].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.title.localeCompare(b.title, 'zh-Hans-CN'));
}

export function slugifyId(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\u4e00-\u9fff-]/gi, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'example';
}
