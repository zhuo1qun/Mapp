import {
  applyGraphHighlightLabelScreenSize,
  DEFAULT_GRAPH_STYLESHEET_SIZING
} from './utils/graph/graphData';
import { wireStandaloneHighlightChromeLabels } from './utils/graph/graphHighlightChromeLabels';
import { wireStandaloneGraphChrome } from './utils/graph/graphStandaloneChrome';
import {
  attachBoardlikeWheelZoom,
  attachGraphResizeObserver,
  applyGraphDualLayerNodeVisibility,
  applyGraphLayerNodeVisibility,
  applyGraphNodeStackZIndex,
  decodeGraphPayloadFromBase64,
  wireStandaloneGraphInteractions
} from './utils/graph/graphRuntimeCore';
import {
  DEFAULT_MAP_UI_CHROME_BLUR_PX,
  DEFAULT_MAP_UI_CHROME_OPACITY
} from './utils/map/mapChromeStyle';

declare global {
  interface Window {
    __KM_GRAPH__?: { b64: string; safeName: string };
    cytoscape?: (opts: Record<string, unknown>) => import('cytoscape').Core;
    cytoscapeFcose?: unknown;
    marked?: { parse: (md: string) => string };
  }
}

function main(): void {
  const boot = window.__KM_GRAPH__;
  const Cy = window.cytoscape;
  if (!boot || !Cy) return;

  try {
    (Cy as { use: (ext: unknown) => void }).use(window.cytoscapeFcose);
  } catch (e) {
    console.warn(e);
  }

  const payload = decodeGraphPayloadFromBase64(boot.b64);
  const container = document.getElementById('cy');
  const stage = document.getElementById('graph-stage');
  const chromeLayer = document.getElementById('graph-chrome-labels');
  if (!container) return;

  const cy = Cy({
    container,
    elements: payload.elements,
    style: payload.stylesheet,
    minZoom: 0.15,
    maxZoom: 4,
    wheelSensitivity: 0
  });
  attachBoardlikeWheelZoom(cy);

  // 保留导出时的 x,y：不重跑布局；显隐与 App 一致（标签层 + 簇层）
  if (payload.graphFrameLayers != null) {
    applyGraphDualLayerNodeVisibility(
      cy,
      payload.graphLayers?.hidden ?? [],
      payload.graphFrameLayers.hidden ?? [],
      payload.graphLayers?.tagVisibilityLogic ?? 'or',
      payload.graphEmojiLayers?.hidden ?? []
    );
  } else if (payload.graphLayers?.hidden?.length) {
    applyGraphLayerNodeVisibility(
      cy,
      payload.graphLayers.hidden,
      payload.graphLayerGroupStandard ?? 'tag'
    );
  } else {
    applyGraphNodeStackZIndex(cy);
  }

  const chromeOpacity = payload.chrome?.opacity ?? DEFAULT_MAP_UI_CHROME_OPACITY;
  const chromeBlurPx = payload.chrome?.blurPx ?? DEFAULT_MAP_UI_CHROME_BLUR_PX;
  const nodeSize = payload.nodeSize ?? DEFAULT_GRAPH_STYLESHEET_SIZING.nodeSize;

  applyGraphHighlightLabelScreenSize(cy, { nodeSize }, { opacity: chromeOpacity, blurPx: chromeBlurPx });

  attachGraphResizeObserver(cy, container);

  let refreshChromeLabels: (() => void) | null = null;
  const chromeLabelOpts = {
    themeColor: payload.themeColor,
    nodeSize,
    chromeOpacity,
    chromeBlurPx,
    host: stage as HTMLElement | null,
    labelFontPx: payload.labelFontPx ?? DEFAULT_GRAPH_STYLESHEET_SIZING.labelFontPx
  };
  if (chromeLayer) {
    refreshChromeLabels = wireStandaloneHighlightChromeLabels(cy, chromeLayer, chromeLabelOpts);
  }

  wireStandaloneGraphInteractions(
    cy,
    payload,
    payload.themeColor,
    window.marked ?? null,
    () => refreshChromeLabels?.()
  );

  // 预设应用与 fit 在 chrome 内完成（有预设时按 active 点位布局，避免先 fit 成默认排布）
  wireStandaloneGraphChrome(cy, payload, {
    onRefreshChromeLabels: () => refreshChromeLabels?.(),
    chromeLabelOpts
  });

  // 视口变化时校正高亮边标签屏上字号
  let labelSizeRaf: number | null = null;
  cy.on('viewport', () => {
    if (labelSizeRaf != null) return;
    labelSizeRaf = requestAnimationFrame(() => {
      labelSizeRaf = null;
      if (cy.destroyed?.()) return;
      applyGraphHighlightLabelScreenSize(
        cy,
        { nodeSize: chromeLabelOpts.nodeSize, labelFontPx: chromeLabelOpts.labelFontPx },
        { opacity: chromeLabelOpts.chromeOpacity, blurPx: chromeLabelOpts.chromeBlurPx }
      );
    });
  });
}

main();
