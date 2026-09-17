import type { GraphExportPayload } from './graphData';
import graphStandaloneInline from './graphStandalone.inline.js?raw';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 与 GraphView 顶栏一致的 inline SVG（stroke） */
const ICON = {
  settings: `<svg class="w-[18px] h-[18px] sm:w-5 sm:h-5" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`
};

const BTN =
  'map-chrome-surface p-2 sm:p-3 rounded-xl shadow-lg transition-colors w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center text-gray-700 border border-gray-100/80';

const PANEL =
  'hidden absolute left-0 top-full z-[2000] mt-2 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-gray-100/80 map-chrome-surface shadow-xl pointer-events-auto';

/** 生成可离线打开的独立 HTML（浏览态：设置 + 节点色图例；不含图层设置 / JSON 导出） */
export function buildStandaloneGraphHtml(payload: GraphExportPayload): string {
  const json = JSON.stringify(payload);
  const b64 = btoa(unescape(encodeURIComponent(json)));
  const title = escapeHtml(payload.projectName || 'graph');
  const safeName = (payload.projectName || 'graph').replace(/[/\\\\?%*:|"<>]/g, '_');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/cytoscape/3.26.0/cytoscape.min.js"></script>
  <script src="https://unpkg.com/layout-base/layout-base.js"></script>
  <script src="https://unpkg.com/cose-base/cose-base.js"></script>
  <script src="https://unpkg.com/cytoscape-fcose/cytoscape-fcose.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  <style>
    :root {
      --theme-color: ${payload.themeColor};
      --map-ui-chrome-opacity: ${payload.chrome?.opacity ?? 0.6};
      --map-ui-chrome-blur-px: ${(payload.chrome?.blurPx ?? 4) === 0 ? '0px' : `${payload.chrome?.blurPx ?? 4}px`};
    }
    #cy { width: 100%; height: 100%; height: 100dvh; background: #f9fafb;
      background-image: radial-gradient(#e5e7eb 1px, transparent 1px); background-size: 20px 20px; }
    #graph-stage { position: relative; width: 100%; height: 100%; height: 100dvh; overflow: hidden; }
    html, body { height: 100%; height: 100dvh; max-height: 100dvh; overflow: hidden; margin: 0; }
    #graph-chrome-labels { position: absolute; inset: 0; z-index: 15; overflow: hidden; pointer-events: none; }
    #graph-related-panel:empty { display: none; }
    /* 与 App index.css .map-chrome-surface-fallback 一致：面板透明/模糊走 CSS 变量 */
    .map-chrome-surface {
      background-color: rgb(255 255 255 / var(--map-ui-chrome-opacity, 0.6));
      backdrop-filter: blur(var(--map-ui-chrome-blur-px, 4px));
      -webkit-backdrop-filter: blur(var(--map-ui-chrome-blur-px, 4px));
    }
    .mapping-preview-markdown p { margin-bottom: 0.6rem; line-height: 1.4; }
    .mapping-preview-markdown p:last-child { margin-bottom: 0; }
    .mapping-preview-markdown h1 { font-size: 1.25rem; font-weight: 800; margin: 0.8rem 0 0.4rem; }
    .mapping-preview-markdown h2 { font-size: 1.1rem; font-weight: 700; margin: 0.7rem 0 0.3rem; }
    .mapping-preview-markdown h3 { font-size: 1rem; font-weight: 600; margin: 0.6rem 0 0.2rem; }
    .mapping-preview-markdown ul, .mapping-preview-markdown ol { margin-bottom: 0.5rem; padding-left: 1.2rem; }
    .mapping-preview-markdown li { margin-bottom: 0.2rem; }
    .mapping-preview-markdown code { background: #f3f4f6; padding: 0.1rem 0.3rem; border-radius: 3px; font-size: 0.85em; font-family: monospace; }
    .mapping-preview-markdown pre { background: #f9fafb; padding: 0.5rem; border-radius: 6px; overflow-x: auto; margin: 0.5rem 0; border: 1px solid #f3f4f6; }
    .mapping-preview-markdown a { color: #2563eb; text-decoration: underline; text-underline-offset: 2px; word-break: break-all; }
    .mapping-preview-markdown a:hover { color: #1d4ed8; }
  </style>
</head>
<body class="bg-gray-50 text-gray-800 antialiased overflow-hidden m-0">
  <div id="graph-stage">
    <div id="cy"></div>
    <div id="graph-chrome-labels" aria-hidden="true"></div>
    <div id="graph-node-legend" class="absolute bottom-4 left-4 z-[44] pointer-events-none select-none origin-bottom-left transform scale-200 hidden" aria-hidden="true"></div>
  </div>

  <div id="graph-top-left" class="fixed top-2 left-2 sm:top-4 sm:left-4 z-[500] pointer-events-none flex flex-col gap-2">
    <div class="pointer-events-auto flex h-10 sm:h-12 items-center gap-1.5 sm:gap-2">
      <div class="relative">
        <button type="button" id="btnSettings" title="设置" class="${BTN}">${ICON.settings}</button>
        <div id="graph-settings-panel" class="${PANEL} sm:w-[min(28rem,calc(100vw-2rem))]"></div>
      </div>
    </div>
  </div>

  <div id="graph-preset-switcher" class="hidden fixed top-2 right-2 sm:top-4 sm:right-4 z-[500] pointer-events-auto">
    <label class="flex h-10 sm:h-12 items-center gap-2 rounded-xl border border-gray-100/80 map-chrome-surface px-2.5 sm:px-3 shadow-lg">
      <span class="hidden sm:inline text-[10px] font-semibold uppercase tracking-wide text-gray-400 shrink-0">预设</span>
      <select id="graph-preset-select" class="min-w-0 max-w-[10rem] sm:max-w-[14rem] bg-transparent text-xs sm:text-sm text-gray-800 outline-none" style="accent-color:var(--theme-color)"></select>
    </label>
  </div>

  <div id="graph-side-stack" class="fixed top-16 sm:top-[4.75rem] left-2 sm:left-4 z-[1000] flex flex-col gap-3 pointer-events-none max-h-[calc(100dvh-5.5rem)] p-3 -m-3">
    <div id="graph-note-preview" class="hidden"></div>
    <div id="graph-related-panel"></div>
  </div>

  <script>window.__KM_GRAPH__=${JSON.stringify({ b64, safeName })};</script>
  <script>${graphStandaloneInline}</script>
</body>
</html>`;
}

export function downloadTextFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
