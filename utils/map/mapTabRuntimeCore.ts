import type { MapTabExportNote, MapTabExportPayload } from './mapTabExportPayload';
import {
  DEFAULT_MAP_UI_CHROME_BLUR_PX,
  DEFAULT_MAP_UI_CHROME_OPACITY,
  mapChromeTextLabelInlineCss
} from './mapChromeStyle';

export function decodeMapTabPayloadFromBase64(b64: string): MapTabExportPayload {
  const json = decodeURIComponent(escape(atob(b64)));
  return JSON.parse(json) as MapTabExportPayload;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** marked 输出的链接：新窗口打开，并去掉可能重复的 target/rel */
function withExternalMarkdownLinks(html: string): string {
  return html.replace(/<a\b([^>]*)>/gi, (_full, attrs: string) => {
    let next = String(attrs)
      .replace(/\s*target\s*=\s*(["']).*?\1/gi, '')
      .replace(/\s*rel\s*=\s*(["']).*?\1/gi, '');
    return `<a${next} target="_blank" rel="noopener noreferrer">`;
  });
}

function getLabelText(rawText: string): string {
  if (!rawText) return '';
  const separators = ['\n', ', '];
  let endIndex = rawText.length;
  for (const sep of separators) {
    const idx = rawText.indexOf(sep);
    if (idx !== -1) endIndex = Math.min(endIndex, idx);
  }
  const firstChunk = rawText.slice(0, endIndex).trim();
  if (!firstChunk) return '';
  return firstChunk.replace(/^#{1,6}\s+/, '').trim();
}

function getTimeText(note: MapTabExportNote): string {
  if (note.startYear == null) return '';
  if (note.endYear != null && note.endYear !== note.startYear) {
    return `${note.startYear}–${note.endYear}`;
  }
  return String(note.startYear);
}

/** 与 TextLabelsLayer 一致：hover 高于选中，均高于普通 label */
function textLabelZIndexOffset(
  hoveredNoteId: string | null,
  selectedNoteId: string | null,
  noteId: string,
  isFavorite: boolean
): number {
  if (hoveredNoteId && hoveredNoteId === noteId) return 8000;
  if (selectedNoteId && selectedNoteId === noteId) return 5000;
  return isFavorite ? 300 : 50;
}

function sortNotes(notes: MapTabExportNote[]): MapTabExportNote[] {
  return [...notes].sort((a, b) => {
    const favA = a.isFavorite ? 1 : 0;
    const favB = b.isFavorite ? 1 : 0;
    if (favA !== favB) return favB - favA;
    if (Math.abs(a.lat - b.lat) > 0.0001) return a.lat - b.lat;
    return a.lng - b.lng;
  });
}

interface ClusterResult {
  notes: MapTabExportNote[];
  position: [number, number];
}

function calculatePinDistance(
  map: { latLngToContainerPoint: (ll: [number, number]) => { x: number; y: number; distanceTo: (p: { x: number; y: number }) => number } },
  n1: MapTabExportNote,
  n2: MapTabExportNote
): number | null {
  try {
    const p1 = map.latLngToContainerPoint([n1.lat, n1.lng]);
    const p2 = map.latLngToContainerPoint([n2.lat, n2.lng]);
    if (!p1 || !p2 || [p1.x, p1.y, p2.x, p2.y].some((x) => Number.isNaN(x))) return null;
    return p1.distanceTo(p2);
  } catch {
    return null;
  }
}

function detectClusters(
  notes: MapTabExportNote[],
  map: LMapLike,
  threshold: number,
  forceSingleNoteIds: Set<string>
): ClusterResult[] {
  if (!map || notes.length === 0) return [];
  const sortedNotes = sortNotes(notes);
  const clusters: ClusterResult[] = [];
  const processed = new Set<string>();

  sortedNotes.forEach((note) => {
    if (processed.has(note.id)) return;
    const cluster: MapTabExportNote[] = [note];
    processed.add(note.id);
    if (!forceSingleNoteIds.has(note.id)) {
      sortedNotes.forEach((other) => {
        if (processed.has(other.id) || forceSingleNoteIds.has(other.id)) return;
        const d = calculatePinDistance(map, note, other);
        if (d !== null && d < threshold) {
          cluster.push(other);
          processed.add(other.id);
        }
      });
    }
    const clusterNotes = sortNotes(cluster);
    const bottom = clusterNotes[0];
    clusters.push({ notes: clusterNotes, position: [bottom.lat, bottom.lng] });
  });
  return clusters;
}

type LMapLike = {
  latLngToContainerPoint: (ll: [number, number]) => { x: number; y: number; distanceTo: (p: { x: number; y: number }) => number };
  getContainer: () => HTMLElement;
  on: (ev: string, fn: () => void) => void;
  remove: () => void;
};

function mapPinSize(sliderValue: number): number {
  return ((sliderValue - 0.5) * (1.2 - 0.2)) / (2.0 - 0.5) + 0.2;
}

function pinIconHtml(
  note: MapTabExportNote,
  themeColor: string,
  clusterCount: number | undefined,
  pinSize: number
): { html: string; size: number; anchor: [number, number] } {
  const isFavorite = note.isFavorite === true;
  const mapped = mapPinSize(pinSize);
  const scale = (isFavorite ? 2 : 1) * mapped;
  const baseSize = 40;
  const size = baseSize * scale;
  const borderWidth = 3;
  const badgeSize = 20 * scale;
  const badgeOffset = 8 * scale;
  const countBadge =
    clusterCount && clusterCount > 1
      ? `<div style="position:absolute;top:-${badgeOffset}px;right:-${badgeOffset}px;width:${badgeSize}px;height:${badgeSize}px;background:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 4px rgba(0,0,0,0.2);z-index:10;border:2px solid ${themeColor};"><span style="color:#000;font-size:${12 * scale}px;font-weight:bold;line-height:1;">${clusterCount}</span></div>`
      : '';

  let content = '';
  if (note.images && note.images.length > 0) {
    const src = escapeHtml(note.images[0]);
    content = `<div style="position:absolute;inset:-25%;overflow:hidden;transform:rotate(45deg);transform-origin:center;"><img src="${src}" style="width:100%;height:100%;object-fit:cover;transform:scale(1.5);transform-origin:center;" alt="" /></div>`;
  } else if (note.sketch) {
    const src = escapeHtml(note.sketch);
    content = `<div style="position:absolute;inset:-25%;overflow:hidden;transform:rotate(45deg);transform-origin:center;"><img src="${src}" style="width:100%;height:100%;object-fit:cover;transform:scale(1.5);transform-origin:center;" alt="" /></div>`;
  } else if (note.emoji) {
    const emojiSize = 20 * scale;
    content = `<span style="transform:rotate(45deg);font-size:${emojiSize}px;line-height:1;z-index:1;position:relative;">${escapeHtml(note.emoji)}</span>`;
  }

  const html = `<div style="position:relative;background-color:${themeColor};width:${size}px;height:${size}px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;box-shadow:0 4px 6px -1px rgba(0,0,0,0.2);border:${borderWidth}px solid ${themeColor};overflow:hidden;">${content}</div>${countBadge}`;

  return { html, size, anchor: [size / 2, size] };
}

type MarkedLike = { parse: (md: string) => string } | null;

/** 独立页：Tab 模式地图（全局 L、可选 marked） */
export function runMapTabStandalone(L: any, marked: MarkedLike, payload: MapTabExportPayload): void {
  const el = document.getElementById('map');
  if (!el) return;

  const noteById = new Map(payload.notes.map((n) => [n.id, n]));
  const state = {
    selectedNoteId: null as string | null,
    hoveredNoteId: null as string | null,
    preSelected: null as MapTabExportNote[] | null,
    previewImgIdx: 0
  };

  const map = L.map('map', { zoomControl: false, scrollWheelZoom: true }).setView(payload.center, payload.zoom);
  L.tileLayer(payload.tileUrl, {
    attribution: payload.tileAttribution || '',
    maxZoom: payload.maxZoom ?? 19,
    maxNativeZoom: payload.maxNativeZoom ?? payload.maxZoom ?? 19,
    subdomains: 'abcd'
  }).addTo(map);

  if (payload.borderGeoJSON) {
    L.geoJSON(payload.borderGeoJSON as object, {
      style: {
        color: payload.themeColor,
        weight: 3,
        opacity: 0.8,
        fill: false,
        fillOpacity: 0,
        dashArray: '5, 10'
      }
    }).addTo(map);
  }

  const markerLayer = L.layerGroup().addTo(map);
  const labelLayer = L.layerGroup().addTo(map);
  const lineLayer = L.layerGroup().addTo(map);

  const previewEl = document.getElementById('km-map-tab-preview');

  function forceSingleIds(): Set<string> {
    if (!state.selectedNoteId || payload.showTextLabels) return new Set();
    const ids = new Set<string>([state.selectedNoteId]);
    for (const c of payload.connections) {
      if (c.fromNoteId === state.selectedNoteId || c.toNoteId === state.selectedNoteId) {
        ids.add(c.fromNoteId);
        ids.add(c.toNoteId);
      }
    }
    return ids;
  }

  function connectionHighlightIds(): Set<string> | null {
    if (!state.selectedNoteId) return null;
    if (payload.showTextLabels) return null;
    const ids = new Set<string>([state.selectedNoteId]);
    for (const c of payload.connections) {
      if (c.fromNoteId === state.selectedNoteId || c.toNoteId === state.selectedNoteId) {
        ids.add(c.fromNoteId);
        ids.add(c.toNoteId);
      }
    }
    return ids;
  }

  function updatePreview(): void {
    if (!previewEl) return;
    const hid = state.hoveredNoteId;
    const sid = state.selectedNoteId;
    const note = (hid && noteById.get(hid)) || (sid && noteById.get(sid)) || null;
    if (!note) {
      previewEl.classList.add('hidden');
      previewEl.innerHTML = '';
      return;
    }
    if (state.previewImgIdx < 0) state.previewImgIdx = 0;
    const imgs = [...(note.images || [])];
    if (note.sketch) imgs.push(note.sketch);
    if (state.previewImgIdx >= imgs.length) state.previewImgIdx = 0;

    const timeRange =
      note.startYear != null
        ? note.endYear != null && note.endYear !== note.startYear
          ? `${note.startYear}–${note.endYear}`
          : String(note.startYear)
        : '';

    let detailHtml = '';
    if (note.previewDetailMd.trim()) {
      try {
        detailHtml =
          marked?.parse(note.previewDetailMd) ?? escapeHtml(note.previewDetailMd).replace(/\n/g, '<br/>');
      } catch {
        detailHtml = escapeHtml(note.previewDetailMd).replace(/\n/g, '<br/>');
      }
      detailHtml = withExternalMarkdownLinks(String(detailHtml));
    }

    const imgSection =
      imgs.length > 0
        ? `<div class="relative flex items-center justify-center shrink-0 px-4 py-3 bg-transparent">
            <img src="${escapeHtml(imgs[state.previewImgIdx])}" class="w-full max-h-64 object-contain" style="filter:drop-shadow(0 8px 18px rgba(15,23,42,0.28))" alt="" />
            ${
              imgs.length > 1
                ? `<button type="button" class="km-prev absolute left-2 p-1.5 bg-black/30 text-white rounded-full">‹</button>
                   <button type="button" class="km-next absolute right-2 p-1.5 bg-black/30 text-white rounded-full">›</button>`
                : ''
            }
          </div>`
        : '';

    previewEl.classList.remove('hidden');
    previewEl.innerHTML = `
      <div data-allow-context-menu class="fixed top-4 left-4 z-[1000] w-72 sm:w-80 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden pointer-events-auto flex flex-col" style="max-height:calc(100vh - 2rem)">
        <div class="p-4 pb-2 flex items-start justify-between gap-3 border-b border-gray-100 shrink-0">
          <div class="flex items-start gap-3 flex-1 min-w-0">
            ${note.emoji ? `<span class="text-2xl mt-0.5 shrink-0">${escapeHtml(note.emoji)}</span>` : ''}
            <div class="min-w-0 flex-1">
              <h3 class="text-lg font-bold text-gray-900 leading-tight whitespace-pre-line break-words">${escapeHtml(note.previewTitle)}</h3>
              ${timeRange ? `<div class="mt-1 text-xs text-gray-500 font-medium truncate">${escapeHtml(timeRange)}</div>` : ''}
            </div>
          </div>
        </div>
        <div class="flex-1 overflow-y-auto text-sm">
          ${
            detailHtml
              ? `<div class="px-4 py-3 text-gray-800 text-sm leading-snug break-words border-b border-gray-50 bg-gray-50/30 mapping-preview-markdown">${detailHtml}</div>`
              : ''
          }
          ${imgSection}
        </div>
      </div>`;

    const prev = previewEl.querySelector('.km-prev');
    const next = previewEl.querySelector('.km-next');
    prev?.addEventListener('click', (e) => {
      e.stopPropagation();
      state.previewImgIdx = (state.previewImgIdx - 1 + imgs.length) % imgs.length;
      updatePreview();
    });
    next?.addEventListener('click', (e) => {
      e.stopPropagation();
      state.previewImgIdx = (state.previewImgIdx + 1) % imgs.length;
      updatePreview();
    });
  }

  function drawLines(): void {
    lineLayer.clearLayers();
    if (!state.selectedNoteId) return;
    const sel = noteById.get(state.selectedNoteId);
    if (!sel) return;
    for (const c of payload.connections) {
      if (c.fromNoteId !== state.selectedNoteId && c.toNoteId !== state.selectedNoteId) continue;
      const a = noteById.get(c.fromNoteId);
      const b = noteById.get(c.toNoteId);
      if (!a || !b) continue;
      L.polyline(
        [
          [a.lat, a.lng],
          [b.lat, b.lng]
        ],
        { color: payload.themeColor, weight: 2, opacity: 0.85 }
      ).addTo(lineLayer);
    }
  }

  let lastClusters: ClusterResult[] = [];

  function rebuildMarkers(): void {
    markerLayer.clearLayers();
    lastClusters = detectClusters(payload.notes, map, payload.clusterThreshold, forceSingleIds());
    lastClusters.forEach((cl) => {
      if (cl.notes.length === 1) {
        const note = cl.notes[0];
        const { html, size, anchor } = pinIconHtml(note, payload.themeColor, undefined, payload.pinSize);
        const m = L.marker(cl.position, {
          icon: L.divIcon({ className: 'custom-icon', html, iconSize: [size, size], iconAnchor: anchor })
        });
        m.on('mouseover', () => {
          state.hoveredNoteId = note.id;
          state.previewImgIdx = 0;
          redrawLabelsAndLines();
        });
        m.on('mouseout', () => {
          state.hoveredNoteId = null;
          redrawLabelsAndLines();
        });
        m.on('click', (e: { originalEvent?: Event }) => {
          e.originalEvent?.stopPropagation?.();
          state.preSelected = null;
          if (state.selectedNoteId === note.id) {
            state.selectedNoteId = null;
          } else {
            state.selectedNoteId = note.id;
          }
          state.previewImgIdx = 0;
          rebuildMarkers();
          redrawLabelsAndLines();
        });
        m.addTo(markerLayer);
      } else {
        const note = cl.notes[0];
        const { html, size, anchor } = pinIconHtml(note, payload.themeColor, cl.notes.length, payload.pinSize);
        const m = L.marker(cl.position, {
          icon: L.divIcon({ className: 'custom-icon', html, iconSize: [size, size], iconAnchor: anchor })
        });
        m.on('click', (e: { originalEvent?: Event }) => {
          e.originalEvent?.stopPropagation?.();
          state.selectedNoteId = null;
          state.preSelected = sortNotes(cl.notes);
          rebuildMarkers();
          redrawLabelsAndLines();
        });
        m.addTo(markerLayer);
      }
    });
  }

  function redrawLabelsAndLines(): void {
    labelLayer.clearLayers();
    const clusters = lastClusters;
    const highlightSet = connectionHighlightIds();

    const visibleIndividual = new Set<string>();
    clusters.forEach((cl) => {
      if (cl.notes.length === 1) visibleIndividual.add(cl.notes[0].id);
    });

    const clusterLabelMeta: Array<{
      position: [number, number];
      text: string;
      timeText: string;
      isFavorite: boolean;
    }> = [];

    clusters.forEach((cl) => {
      if (cl.notes.length > 1) {
        const rep =
          cl.notes.find((n) => n.variant === 'standard' && (getLabelText(n.text) || n.text?.trim())) || cl.notes[0];
        const text =
          getLabelText(rep.text || '') || rep.emoji || (rep.variant === 'image' ? '照片' : '点位');
        clusterLabelMeta.push({
          position: cl.position,
          text,
          timeText: getTimeText(rep),
          isFavorite: rep.isFavorite === true
        });
      }
    });

    const themeColor = payload.themeColor;
    const labelSize = payload.labelSize;
    const chromeCss = mapChromeTextLabelInlineCss(
      (payload as { mapUiChromeOpacity?: number }).mapUiChromeOpacity ?? DEFAULT_MAP_UI_CHROME_OPACITY,
      (payload as { mapUiChromeBlurPx?: number }).mapUiChromeBlurPx ?? DEFAULT_MAP_UI_CHROME_BLUR_PX,
      themeColor
    );

    const addNoteLabel = (note: MapTabExportNote) => {
      const text = getLabelText(note.text || '');
      if (!text) return;
      const timeText = getTimeText(note);
      const isFavorite = note.isFavorite === true;
      const scale = isFavorite ? 1.5 : 1;
      const fs = 10 * labelSize * scale;
      const paddingY = Math.max(4, Math.round(2 * scale + 2));
      const paddingX = paddingY;
      const timeFontSize = Math.max(8, Math.floor(fs * 0.75));
      const labelHeight = paddingY * 2 + fs + timeFontSize + 6;
      const html = `<div style="${chromeCss};color:${isFavorite ? themeColor : '#000'};padding:${paddingY}px ${paddingX}px;font-size:${fs}px;font-weight:${isFavorite ? 'bold' : '500'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none;display:flex;align-items:flex-start;width:fit-content;">
          <div style="display:flex;flex-direction:column;gap:2px;">
            <span style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(text)}</span>
            ${timeText ? `<span style="font-size:${timeFontSize}px;font-weight:500;color:${isFavorite ? themeColor : '#6b7280'};white-space:nowrap;">${escapeHtml(timeText)}</span>` : ''}
          </div>
        </div>`;
      L.marker([note.lat, note.lng], {
        icon: L.divIcon({
          className: 'custom-text-label',
          html,
          iconSize: [0, labelHeight],
          iconAnchor: [0, labelHeight + (isFavorite ? 10 : 5)]
        }),
        interactive: false,
        zIndexOffset: textLabelZIndexOffset(state.hoveredNoteId, state.selectedNoteId, note.id, isFavorite)
      }).addTo(labelLayer);
    };

    if (state.preSelected && state.preSelected.length > 0) {
      const pos = state.preSelected[0];
      const fontSize = 10 * labelSize;
      const timeFontSize = Math.max(8, Math.floor(fontSize * 0.75));
      const itemHeight = fontSize + timeFontSize + 16;
      const totalHeight = state.preSelected.length * itemHeight;
      const itemsHtml = state.preSelected
        .map((note) => {
          const text =
            getLabelText(note.text || '') || note.emoji || (note.variant === 'image' ? '照片' : '点位');
          const timeText = getTimeText(note);
          const isFav = note.isFavorite === true;
          const rowZ = state.selectedNoteId === note.id ? 2 : 0;
          return `<div data-note-id="${note.id}" class="pre-selected-label-item" style="position:relative;z-index:${rowZ};${chromeCss};color:${isFav ? themeColor : '#000'};padding:4px;display:flex;align-items:flex-start;gap:6px;font-size:${fontSize}px;font-weight:${isFav ? 'bold' : '500'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;pointer-events:auto;margin-bottom:4px;width:fit-content;">
            <div style="display:flex;flex-direction:column;gap:2px;pointer-events:none;">
              <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(text)}</span>
              ${timeText ? `<span style="font-size:${timeFontSize}px;font-weight:500;color:${isFav ? themeColor : '#6b7280'};white-space:nowrap;">${escapeHtml(timeText)}</span>` : ''}
            </div>
          </div>`;
        })
        .join('');
      const div = `<div class="pre-selected-labels-container" style="display:flex;flex-direction:column;gap:4px;align-items:flex-start;">${itemsHtml}</div>`;
      const mk = L.marker([pos.lat, pos.lng], {
        icon: L.divIcon({
          className: 'pre-selected-labels-container',
          html: div,
          iconSize: [0, totalHeight],
          iconAnchor: [0, totalHeight / 2]
        }),
        zIndexOffset: 1000
      });
      mk.on('mousedown', (e: { originalEvent: MouseEvent }) => {
        e.originalEvent.stopPropagation();
        const t = e.originalEvent.target as HTMLElement;
        const item = t.closest?.('.pre-selected-label-item') as HTMLElement | null;
        const id = item?.getAttribute('data-note-id');
        if (id) {
          state.preSelected = null;
          state.selectedNoteId = id;
          state.previewImgIdx = 0;
          rebuildMarkers();
          redrawLabelsAndLines();
        }
      });
      mk.addTo(labelLayer);
    }

    // 与主应用 TextLabelsLayer 一致：簇的「代表 label」仅在开启全局文字标签时显示；
    // 默认 tab 模式只应在点击簇（preSelected）或 hover/选中单点时再出 label，避免 idle 时误显一条。
    const showClusterLabels =
      payload.showTextLabels &&
      !highlightSet &&
      !state.selectedNoteId &&
      !state.hoveredNoteId &&
      !state.preSelected;

    if (showClusterLabels) {
      clusterLabelMeta.forEach((meta) => {
        const isFavorite = meta.isFavorite;
        const scale = isFavorite ? 1.5 : 1;
        const fontSize = 10 * labelSize * scale;
        const paddingX = Math.max(4, Math.round(8 * scale * 0.5 + 2));
        const paddingY = Math.max(4, Math.round(2 * scale + 2));
        const timeFontSize = Math.max(8, Math.floor(fontSize * 0.75));
        const labelHeight = paddingY * 2 + fontSize + timeFontSize + 6;
        const html = `<div style="${chromeCss};color:${isFavorite ? themeColor : '#000'};padding:${paddingY}px ${paddingX}px;font-size:${fontSize}px;font-weight:${isFavorite ? 'bold' : '500'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none;display:inline-block;width:fit-content;">
          <div style="display:flex;flex-direction:column;gap:2px;">
            <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(meta.text)}</div>
            ${meta.timeText ? `<div style="font-size:${timeFontSize}px;font-weight:500;color:${isFavorite ? themeColor : '#6b7280'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(meta.timeText)}</div>` : ''}
          </div>
        </div>`;
        L.marker(meta.position, {
          icon: L.divIcon({
            className: 'custom-text-label',
            html,
            iconSize: [0, labelHeight],
            iconAnchor: [0, labelHeight + (isFavorite ? 10 : 5)]
          }),
          interactive: false,
          zIndexOffset: isFavorite ? 300 : 50
        }).addTo(labelLayer);
      });
    }

    if (!state.preSelected) {
      const chSet = connectionHighlightIds();
      if (chSet) {
        for (const note of payload.notes) {
          if (!chSet.has(note.id) || !note.text?.trim()) continue;
          addNoteLabel(note);
        }
      } else {
        for (const note of payload.notes) {
          if (note.variant !== 'standard' || !note.text?.trim()) continue;
          const show =
            (state.selectedNoteId === note.id) ||
            (state.hoveredNoteId === note.id) ||
            (payload.showTextLabels && visibleIndividual.has(note.id));
          if (!show) continue;
          addNoteLabel(note);
        }
      }
    }

    drawLines();
    updatePreview();
  }

  function fullRefresh(): void {
    rebuildMarkers();
    redrawLabelsAndLines();
  }

  map.on('click', () => {
    state.selectedNoteId = null;
    state.hoveredNoteId = null;
    state.preSelected = null;
    fullRefresh();
  });

  map.on('moveend', fullRefresh);
  map.on('zoomend', fullRefresh);

  window.addEventListener('load', () => {
    map.invalidateSize();
  });
  setTimeout(() => map.invalidateSize(), 100);

  fullRefresh();
}
