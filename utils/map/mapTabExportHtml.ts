import type { MapTabExportPayload } from './mapTabExportPayload';
import mapTabStandaloneInline from './mapTabStandalone.inline.js?raw';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 与地图 Tab 模式一致：全屏地图、悬停/选中预览卡片、无侧栏与底栏 */
export function buildStandaloneMapTabHtml(payload: MapTabExportPayload): string {
  const json = JSON.stringify(payload);
  const b64 = btoa(unescape(encodeURIComponent(json)));
  const title = escapeHtml(payload.projectName || 'map');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} · Tab 预览</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  <style>
    html, body { margin: 0; height: 100%; overflow: hidden; }
    #map { position: absolute; inset: 0; z-index: 0; background: #f3f4f6; }
    .mapping-preview-markdown p { margin-bottom: 0.6rem; line-height: 1.4; }
    .mapping-preview-markdown p:last-child { margin-bottom: 0; }
    .mapping-preview-markdown h1 { font-size: 1.25rem; font-weight: 800; margin: 0.8rem 0 0.4rem; }
    .mapping-preview-markdown h2 { font-size: 1.1rem; font-weight: 700; margin: 0.7rem 0 0.3rem; }
    .mapping-preview-markdown h3 { font-size: 1rem; font-weight: 600; margin: 0.6rem 0 0.2rem; }
    .mapping-preview-markdown ul, .mapping-preview-markdown ol { margin-bottom: 0.5rem; padding-left: 1.2rem; }
    .mapping-preview-markdown li { margin-bottom: 0.2rem; }
    .mapping-preview-markdown blockquote { border-left: 3px solid #e5e7eb; padding-left: 0.8rem; color: #6b7280; font-style: italic; margin: 0.5rem 0; }
    .mapping-preview-markdown code { background: #f3f4f6; padding: 0.1rem 0.3rem; border-radius: 3px; font-size: 0.85em; font-family: monospace; }
    .mapping-preview-markdown pre { background: #f9fafb; padding: 0.5rem; border-radius: 6px; overflow-x: auto; margin: 0.5rem 0; border: 1px solid #f3f4f6; }
    .mapping-preview-markdown a { color: #2563eb; text-decoration: underline; text-underline-offset: 2px; word-break: break-all; }
    .mapping-preview-markdown a:hover { color: #1d4ed8; }
    /* 保留瓦片来源文字与链接，但不让默认白色控件底遮住地图。 */
    .leaflet-control-attribution { background: transparent !important; box-shadow: none; }
  </style>
</head>
<body class="bg-gray-50 text-gray-800 antialiased">
  <div id="map"></div>
  <div id="km-map-tab-preview" class="hidden"></div>
  <script>window.__KM_MAP_TAB__=${JSON.stringify({ b64 })};</script>
  <script>${mapTabStandaloneInline}</script>
</body>
</html>`;
}
