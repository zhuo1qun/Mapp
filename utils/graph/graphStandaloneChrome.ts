import type { Core } from 'cytoscape';
import {
  DEFAULT_MAP_UI_CHROME_BLUR_PX,
  DEFAULT_MAP_UI_CHROME_OPACITY
} from '../map/mapChromeStyle';
import {
  applyGraphHighlightLabelScreenSize,
  DEFAULT_GRAPH_STYLESHEET_SIZING,
  getGraphStylesheet,
  GRAPH_FOCUS_CORE_NODE_SCALE,
  GRAPH_NODE_SIZE_MAX_PX,
  graphNodeSizeFromDegree,
  graphNodeSizeWithWeight,
  type GraphExportPayload,
  type GraphStylesheetChrome,
  type GraphStylesheetSizing
} from './graphData';
import { applyGraphViewPresetToCy, applyGraphViewPresetVisibility } from './graphPresets';
import {
  applyGraphDualLayerNodeVisibility,
  scheduleGraphResizeAndFit,
  syncGraphEdgeCurveDistances,
  updateGraphStylesheet
} from './graphRuntimeCore';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function setBtnActive(btn: HTMLElement | null, active: boolean, themeColor: string): void {
  if (!btn) return;
  if (active) {
    btn.style.backgroundColor = themeColor;
    btn.style.backdropFilter = 'none';
    (btn.style as CSSStyleDeclaration & { webkitBackdropFilter?: string }).webkitBackdropFilter = 'none';
    btn.classList.add('text-white');
    btn.classList.remove('text-gray-700');
  } else {
    btn.style.backgroundColor = '';
    btn.style.backdropFilter = '';
    (btn.style as CSSStyleDeclaration & { webkitBackdropFilter?: string }).webkitBackdropFilter = '';
    btn.classList.remove('text-white');
    btn.classList.add('text-gray-700');
  }
}

function applyChromeCssVars(chrome: GraphStylesheetChrome): void {
  const root = document.documentElement;
  const o = Math.min(1, Math.max(0, chrome.opacity));
  const b = Math.min(48, Math.max(0, chrome.blurPx));
  root.style.setProperty('--map-ui-chrome-opacity', String(o));
  root.style.setProperty('--map-ui-chrome-blur-px', b === 0 ? '0px' : `${b}px`);
}

export type StandaloneChromeOpts = {
  onRefreshChromeLabels?: () => void;
  /** 样式变更时同步 chrome label 层参数（可变对象） */
  chromeLabelOpts?: {
    nodeSize: number;
    chromeOpacity: number;
    chromeBlurPx: number;
    labelFontPx: number;
  };
};

function renderLegendItems(
  items: NonNullable<GraphExportPayload['legendItems']>,
  labelFontPx: number
): void {
  const host = document.getElementById('graph-node-legend');
  if (!host) return;
  if (!items || items.length === 0) {
    host.innerHTML = '';
    host.classList.add('hidden');
    return;
  }
  host.classList.remove('hidden');
  const swatch = Math.max(6, Math.round(labelFontPx * 0.9));
  const shown = items.slice(0, 8);
  const rows = shown
    .map((item) => {
      const dots = (item.colors ?? [])
        .slice(0, 3)
        .map(
          (c) =>
            `<span class="inline-block rounded-full border border-white/90 shadow-sm shrink-0" style="background-color:${escapeHtml(c)};width:${swatch}px;height:${swatch}px"></span>`
        )
        .join('');
      return `<div class="flex items-center gap-2">
        <div class="flex items-center gap-1.5">${dots}</div>
        <span class="text-gray-500 font-medium truncate" style="font-size:${labelFontPx}px">${escapeHtml(item.label)}</span>
      </div>`;
    })
    .join('');
  const more =
    items.length > 8
      ? `<div class="text-gray-500 mt-1" style="font-size:${Math.max(8, labelFontPx - 1)}px">…共 ${items.length} 类</div>`
      : '';
  host.innerHTML = `<div class="flex flex-col gap-1.5">${rows}${more}</div>`;
}

/**
 * 独立展示页：设置 + 节点色图例（顺序与 App 导出时一致）。
 * 不含标签/簇图层面板。
 */
export function wireStandaloneGraphChrome(
  cy: Core,
  payload: GraphExportPayload,
  opts?: StandaloneChromeOpts
): void {
  const themeColor = payload.themeColor || '#2563eb';

  let sizing: GraphStylesheetSizing = {
    nodeSize: payload.nodeSize ?? DEFAULT_GRAPH_STYLESHEET_SIZING.nodeSize,
    labelFontPx: payload.labelFontPx ?? DEFAULT_GRAPH_STYLESHEET_SIZING.labelFontPx,
    edgeWeight: payload.edgeWeight ?? DEFAULT_GRAPH_STYLESHEET_SIZING.edgeWeight,
    edgeLabelFontPx: payload.edgeLabelFontPx ?? DEFAULT_GRAPH_STYLESHEET_SIZING.edgeLabelFontPx
  };
  /** 图例字号独立于节点标签 */
  let legendFontPx = Math.max(
    6,
    Math.min(24, Math.round(payload.labelFontPx ?? DEFAULT_GRAPH_STYLESHEET_SIZING.labelFontPx))
  );
  let edgeCurve = payload.edgeCurve !== false;
  let chrome: GraphStylesheetChrome = {
    opacity: payload.chrome?.opacity ?? DEFAULT_MAP_UI_CHROME_OPACITY,
    blurPx: payload.chrome?.blurPx ?? DEFAULT_MAP_UI_CHROME_BLUR_PX
  };

  let settingsOpen = false;
  const btnSettings = document.getElementById('btnSettings');
  const panelSettings = document.getElementById('graph-settings-panel');
  let currentLegendItems = [...(payload.legendItems ?? [])];
  const presets = (payload.presets ?? []).filter((p) => p && p.id);
  let activePresetId = payload.activePresetId ?? null;

  const applyStyles = () => {
    applyChromeCssVars(chrome);
    updateGraphStylesheet(
      cy,
      getGraphStylesheet(themeColor, sizing, chrome, { edgeCurve })
    );

    let maxDegree = 0;
    cy.nodes().forEach((node) => {
      if (node.hasClass('frame-cluster-halo') || node.hasClass('frame-cluster-label')) return;
      const d = Number(node.data('linkDegree') ?? 0);
      if (Number.isFinite(d) && d > maxDegree) maxDegree = d;
    });
    const favScale = 1.5;
    const coreScale = GRAPH_FOCUS_CORE_NODE_SCALE;
    cy.batch(() => {
      cy.nodes().forEach((node) => {
        if (node.hasClass('frame-cluster-halo') || node.hasClass('frame-cluster-label')) return;
        const degree = Number(node.data('linkDegree') ?? 0);
        const ns = graphNodeSizeWithWeight(
          graphNodeSizeFromDegree(
            Number.isFinite(degree) ? degree : 0,
            maxDegree,
            sizing.nodeSize
          ),
          node.data('nodeWeight')
        );
        node.data('nodeSize', ns);
        node.data('nodeSizeFav', Math.round(ns * favScale * 100) / 100);
        node.data('nodeSizeCore', Math.round(ns * coreScale * 100) / 100);
        node.data('nodeSizeFavCore', Math.round(ns * favScale * coreScale * 100) / 100);
        const emojiSize = (diameter: number) =>
          Math.round(Math.max(9, Math.min(24, diameter * 0.58)) * 100) / 100;
        node.data('nodeEmojiSize', emojiSize(ns));
        node.data('nodeEmojiSizeFav', emojiSize(ns * favScale));
        node.data('nodeEmojiSizeCore', emojiSize(ns * coreScale));
        node.data('nodeEmojiSizeFavCore', emojiSize(ns * favScale * coreScale));
      });
    });

    applyGraphHighlightLabelScreenSize(cy, sizing, chrome);
    if (edgeCurve) syncGraphEdgeCurveDistances(cy);
    if (opts?.chromeLabelOpts) {
      opts.chromeLabelOpts.nodeSize = sizing.nodeSize;
      opts.chromeLabelOpts.labelFontPx = sizing.labelFontPx;
      opts.chromeLabelOpts.chromeOpacity = chrome.opacity;
      opts.chromeLabelOpts.chromeBlurPx = chrome.blurPx;
    }
    renderLegendItems(currentLegendItems, legendFontPx);
    opts?.onRefreshChromeLabels?.();
  };

  const applyPresetById = (id: string) => {
    const preset = presets.find((p) => p.id === id);
    if (!preset) return;
    activePresetId = id;
    applyGraphViewPresetToCy(cy, preset);
    applyGraphViewPresetVisibility(cy, preset);
    // 旧预设无显隐字段时仍用导出时 bake 的双层状态
    if (preset.tagHidden == null && preset.frameHidden == null) {
      applyGraphDualLayerNodeVisibility(
        cy,
        payload.graphLayers?.hidden ?? [],
        payload.graphFrameLayers?.hidden ?? [],
        payload.graphLayers?.tagVisibilityLogic ?? 'or',
        payload.graphEmojiLayers?.hidden ?? []
      );
    }
    if (edgeCurve) syncGraphEdgeCurveDistances(cy);
    currentLegendItems = [...(preset.legendItems ?? [])];
    renderLegendItems(currentLegendItems, legendFontPx);
    scheduleGraphResizeAndFit(cy);
    opts?.onRefreshChromeLabels?.();
    const sel = document.getElementById('graph-preset-select') as HTMLSelectElement | null;
    if (sel) sel.value = id;
  };

  const syncOpenUi = () => {
    setBtnActive(btnSettings, settingsOpen, themeColor);
    panelSettings?.classList.toggle('hidden', !settingsOpen);
  };

  function renderSettings(): void {
    if (!panelSettings) return;
    const slider = (
      id: string,
      label: string,
      value: number,
      min: number,
      max: number,
      step: number,
      fmt: (v: number) => string
    ) => `
      <label class="block min-w-0">
        <div class="mb-1 flex items-center justify-between gap-2">
          <span class="text-xs font-medium text-gray-600">${label}</span>
          <span class="tabular-nums text-[10px] text-gray-400" data-val-for="${id}">${fmt(value)}</span>
        </div>
        <input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${value}"
          class="w-full" style="accent-color:${escapeHtml(themeColor)}" />
      </label>`;

    panelSettings.innerHTML = `
      <h2 class="shrink-0 px-3 pt-2.5 text-xs font-medium text-gray-500">设置</h2>
      <div class="overflow-y-auto px-3 pt-2 pb-3 space-y-4" style="max-height:min(22rem,60dvh)">
        <div>
          <div class="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">界面外观</div>
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            ${slider('st-chrome-op', '面板背景透明度', chrome.opacity, 0.15, 1, 0.05, (v) => `${Math.round(v * 100)}%`)}
            ${slider('st-chrome-blur', '背景模糊半径', chrome.blurPx, 0, 24, 1, (v) => `${Math.round(v)}px`)}
          </div>
        </div>
        <div>
          <div class="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Graph Style</div>
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            ${slider('st-node', '节点最小尺寸', sizing.nodeSize, 1, GRAPH_NODE_SIZE_MAX_PX, 1, (v) => `${Math.round(v)}px`)}
            ${slider('st-label', '节点标签字号', sizing.labelFontPx, 4, 16, 1, (v) => `${Math.round(v)}px`)}
            ${slider('st-legend', '图例字号', legendFontPx, 6, 24, 1, (v) => `${Math.round(v)}px`)}
            ${slider('st-edge-label', '边标签字号', sizing.edgeLabelFontPx, 3, 16, 1, (v) => `${Math.round(v)}px`)}
            <div class="flex min-w-0 items-center justify-between gap-3 sm:col-span-2">
              <span class="text-xs font-medium text-gray-800">曲线相连</span>
              <button
                type="button"
                id="st-curve"
                role="switch"
                aria-checked="${edgeCurve ? 'true' : 'false'}"
                aria-label="曲线相连"
                class="relative h-5 w-9 shrink-0 rounded-full border-0 cursor-pointer transition-colors ${edgeCurve ? '' : 'bg-gray-200'}"
                style="${edgeCurve ? `background-color:${escapeHtml(themeColor)}` : ''}"
              >
                <span
                  class="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${edgeCurve ? 'translate-x-4' : 'translate-x-0'}"
                ></span>
              </button>
            </div>
          </div>
        </div>
      </div>`;

    const bindRange = (id: string, apply: (v: number) => void) => {
      const el = panelSettings.querySelector<HTMLInputElement>(`#${id}`);
      if (!el) return;
      el.addEventListener('input', () => {
        const v = Number(el.value);
        apply(v);
        const label = panelSettings.querySelector(`[data-val-for="${id}"]`);
        if (label) {
          if (id === 'st-node' || id === 'st-label' || id === 'st-legend' || id === 'st-edge-label' || id === 'st-chrome-blur') {
            label.textContent = `${Math.round(v)}px`;
          } else if (id === 'st-chrome-op') {
            label.textContent = `${Math.round(v * 100)}%`;
          } else {
            label.textContent = String(Math.round(v));
          }
        }
        applyStyles();
      });
    };

    bindRange('st-node', (v) => {
      sizing = { ...sizing, nodeSize: Math.round(Math.min(GRAPH_NODE_SIZE_MAX_PX, Math.max(1, v))) };
    });
    bindRange('st-label', (v) => {
      sizing = { ...sizing, labelFontPx: Math.round(Math.min(16, Math.max(4, v))) };
    });
    bindRange('st-legend', (v) => {
      legendFontPx = Math.round(Math.min(24, Math.max(6, v)));
    });
    bindRange('st-edge-label', (v) => {
      sizing = { ...sizing, edgeLabelFontPx: Math.round(Math.min(16, Math.max(3, v))) };
    });
    bindRange('st-chrome-op', (v) => {
      chrome = { ...chrome, opacity: Math.max(0.15, Math.min(1, v)) };
    });
    bindRange('st-chrome-blur', (v) => {
      chrome = { ...chrome, blurPx: Math.round(Math.max(0, Math.min(24, v))) };
    });
    panelSettings.querySelector<HTMLButtonElement>('#st-curve')?.addEventListener('click', (e) => {
      e.stopPropagation();
      edgeCurve = !edgeCurve;
      applyStyles();
      renderSettings();
    });
  }

  btnSettings?.addEventListener('click', (e) => {
    e.stopPropagation();
    settingsOpen = !settingsOpen;
    syncOpenUi();
    if (settingsOpen) renderSettings();
  });

  document.addEventListener('pointerdown', (e) => {
    if (!settingsOpen) return;
    const t = e.target as Node | null;
    const host = document.getElementById('graph-top-left');
    if (host && t && host.contains(t)) return;
    settingsOpen = false;
    syncOpenUi();
  });

  renderLegendItems(currentLegendItems, legendFontPx);
  applyChromeCssVars(chrome);
  syncOpenUi();

  const presetHost = document.getElementById('graph-preset-switcher');
  const presetSelect = document.getElementById('graph-preset-select') as HTMLSelectElement | null;
  if (presets.length > 0 && presetHost && presetSelect) {
    presetHost.classList.remove('hidden');
    presetSelect.innerHTML = presets
      .map(
        (p) =>
          `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name || '预设')}</option>`
      )
      .join('');
    const initial =
      (activePresetId && presets.some((p) => p.id === activePresetId)
        ? activePresetId
        : presets[0]?.id) || '';
    if (initial) {
      // 始终按当前预设写回点位/颜色/显隐，避免仅依赖 elements 出现默认网格/列表排布
      applyPresetById(initial);
    }
    presetSelect.addEventListener('change', () => {
      applyPresetById(presetSelect.value);
    });
  } else {
    presetHost?.classList.add('hidden');
    scheduleGraphResizeAndFit(cy);
  }
}
