export type ParsedClipboardContent =
  | { kind: 'images'; files: File[] }
  | { kind: 'remote-images'; urls: string[] }
  | { kind: 'link'; url: string; label?: string }
  | { kind: 'text'; text: string };

const IMAGE_URL_RE = /\.(?:avif|bmp|gif|heic|heif|jpe?g|png|svg|tiff?|webp)(?:[?#].*)?$/i;

export function isEditablePasteTarget(target: EventTarget | null): boolean {
  const el = target instanceof Element ? target : null;
  return !!el?.closest('input, textarea, select, [contenteditable="true"], .ProseMirror');
}

export function isLikelyImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return /^https?:$/.test(url.protocol) && IMAGE_URL_RE.test(`${url.pathname}${url.search}`);
  } catch {
    return false;
  }
}

function singleHttpUrl(value: string): string | null {
  const trimmed = value.trim();
  if (/\s/.test(trimmed)) return null;
  try {
    const url = new URL(trimmed);
    return /^https?:$/.test(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

export function parseClipboardData(data: DataTransfer): ParsedClipboardContent | null {
  const imageFiles = Array.from(data.items || [])
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter((file): file is File => !!file);
  if (imageFiles.length) return { kind: 'images', files: imageFiles };

  const html = data.getData('text/html');
  const plain = data.getData('text/plain').trim();
  if (html && typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const urls = Array.from(doc.querySelectorAll('img[src]'))
      .map((img) => img.getAttribute('src') || '')
      .filter((src) => /^https?:\/\//i.test(src));
    if (urls.length) return { kind: 'remote-images', urls: [...new Set(urls)] };
    const anchor = doc.querySelector<HTMLAnchorElement>('a[href^="http"]');
    if (anchor && (!plain || singleHttpUrl(plain))) {
      return { kind: 'link', url: anchor.href, label: anchor.textContent?.trim() || undefined };
    }
  }

  const uri = data.getData('text/uri-list').split(/\r?\n/).find((line) => line && !line.startsWith('#'));
  const url = singleHttpUrl(uri || plain);
  if (url) return isLikelyImageUrl(url)
    ? { kind: 'remote-images', urls: [url] }
    : { kind: 'link', url };
  return plain ? { kind: 'text', text: plain } : null;
}

export function fallbackLinkPreview(url: string, label?: string) {
  const parsed = new URL(url);
  return {
    url,
    canonicalUrl: url,
    title: label || parsed.hostname.replace(/^www\./, ''),
    siteName: parsed.hostname.replace(/^www\./, ''),
    faviconUrl: `${parsed.origin}/favicon.ico`,
    fetchedAt: Date.now(),
    status: 'ready' as const
  };
}

/** 尽力读取公开网页元数据；跨域失败时返回可用的域名级预览。 */
export async function enrichLinkPreview(url: string, label?: string) {
  const fallback = fallbackLinkPreview(url, label);
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 4500);
  try {
    const response = await fetch(url, {
      mode: 'cors',
      credentials: 'omit',
      headers: { Accept: 'text/html,application/xhtml+xml' },
      signal: controller.signal
    });
    if (!response.ok) return fallback;
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) return fallback;
    const html = await response.text();
    const doc = new DOMParser().parseFromString(html.slice(0, 600_000), 'text/html');
    const meta = (selector: string) => doc.querySelector<HTMLMetaElement>(selector)?.content?.trim();
    const canonical = doc.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href;
    const icon = doc.querySelector<HTMLLinkElement>('link[rel~="icon"]')?.href;
    return {
      ...fallback,
      canonicalUrl: canonical || fallback.canonicalUrl,
      title: label || meta('meta[property="og:title"]') || doc.title.trim() || fallback.title,
      description: meta('meta[property="og:description"]') || meta('meta[name="description"]'),
      siteName: meta('meta[property="og:site_name"]') || fallback.siteName,
      imageUrl: meta('meta[property="og:image"]'),
      faviconUrl: icon || fallback.faviconUrl,
      fetchedAt: Date.now()
    };
  } catch {
    return fallback;
  } finally {
    window.clearTimeout(timer);
  }
}
