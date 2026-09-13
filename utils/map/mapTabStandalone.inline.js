(() => {
  // utils/theme/themeChrome.ts
  var LAB_EPS = 216 / 24389;
  var LAB_KAPPA = 24389 / 27;
  function parseHexToRgb(hex) {
    const h = hex.trim();
    const m6 = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(h);
    if (m6) {
      return {
        r: parseInt(m6[1], 16),
        g: parseInt(m6[2], 16),
        b: parseInt(m6[3], 16)
      };
    }
    const m3 = /^#?([a-f\d])([a-f\d])([a-f\d])$/i.exec(h);
    if (m3) {
      return {
        r: parseInt(m3[1] + m3[1], 16),
        g: parseInt(m3[2] + m3[2], 16),
        b: parseInt(m3[3] + m3[3], 16)
      };
    }
    return null;
  }

  // utils/map/mapChromeStyle.ts
  var DEFAULT_MAP_UI_CHROME_OPACITY = 0.9;
  var DEFAULT_MAP_UI_CHROME_BLUR_PX = 8;
  function mapChromeModalBackdropStyle(opacity, blurPx) {
    const o = Math.min(1, Math.max(0, opacity));
    const b = Math.min(48, Math.max(0, blurPx));
    const style = {
      // 透明面板对应更轻的背景压暗；满不透明面板也只到 20%，保持地图/画布仍可辨认。
      backgroundColor: `rgba(0, 0, 0, ${0.04 + o * 0.16})`
    };
    if (b > 0) {
      const f = `blur(${b}px)`;
      style.backdropFilter = f;
      style.WebkitBackdropFilter = f;
    }
    return style;
  }
  var MODAL_BACKDROP_MASK_STYLE = mapChromeModalBackdropStyle(
    DEFAULT_MAP_UI_CHROME_OPACITY,
    DEFAULT_MAP_UI_CHROME_BLUR_PX
  );
  var MAP_CHROME_SURFACE_BORDER_CLASS = "border border-gray-100/80";
  var MAP_CHROME_SURFACE_SHELL_CLASS = `rounded-lg shadow-lg ${MAP_CHROME_SURFACE_BORDER_CLASS}`;
  function mapChromeSurfaceInlineCss(opacity, blurPx) {
    const o = Math.min(1, Math.max(0, opacity));
    const b = Math.min(48, Math.max(0, blurPx));
    const parts = [
      `background-color:rgba(255,255,255,${o})`,
      "border:1px solid rgba(243,244,246,0.8)",
      "border-radius:0.5rem",
      "box-shadow:0 10px 15px -3px rgba(0,0,0,0.1),0 4px 6px -4px rgba(0,0,0,0.1)"
    ];
    if (b > 0) {
      parts.push(`backdrop-filter:blur(${b}px)`, `-webkit-backdrop-filter:blur(${b}px)`);
    }
    return parts.join(";");
  }
  function mapChromeTextLabelInlineCss(opacity, blurPx, themeColor) {
    const themeRgb = parseHexToRgb(themeColor);
    if (!themeRgb) return mapChromeSurfaceInlineCss(opacity, blurPx);
    const o = Math.min(1, Math.max(0, opacity));
    const tint = 0.13;
    const background = [themeRgb.r, themeRgb.g, themeRgb.b].map((channel) => Math.round(255 + (channel - 255) * tint)).join(",");
    const borderOpacity = Math.min(0.72, o * 0.75);
    return [
      mapChromeSurfaceInlineCss(o, blurPx),
      `background-color:rgba(${background},${o})`,
      `border-color:rgba(${themeRgb.r},${themeRgb.g},${themeRgb.b},${borderOpacity})`
    ].join(";");
  }

  // utils/map/mapTabRuntimeCore.ts
  function decodeMapTabPayloadFromBase64(b64) {
    const json = decodeURIComponent(escape(atob(b64)));
    return JSON.parse(json);
  }
  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function withExternalMarkdownLinks(html) {
    return html.replace(/<a\b([^>]*)>/gi, (_full, attrs) => {
      let next = String(attrs).replace(/\s*target\s*=\s*(["']).*?\1/gi, "").replace(/\s*rel\s*=\s*(["']).*?\1/gi, "");
      return `<a${next} target="_blank" rel="noopener noreferrer">`;
    });
  }
  function getLabelText(rawText) {
    if (!rawText) return "";
    const separators = ["\n", ", "];
    let endIndex = rawText.length;
    for (const sep of separators) {
      const idx = rawText.indexOf(sep);
      if (idx !== -1) endIndex = Math.min(endIndex, idx);
    }
    const firstChunk = rawText.slice(0, endIndex).trim();
    if (!firstChunk) return "";
    return firstChunk.replace(/^#{1,6}\s+/, "").trim();
  }
  function getTimeText(note) {
    if (note.startYear == null) return "";
    if (note.endYear != null && note.endYear !== note.startYear) {
      return `${note.startYear}\u2013${note.endYear}`;
    }
    return String(note.startYear);
  }
  function textLabelZIndexOffset(hoveredNoteId, selectedNoteId, noteId, isFavorite) {
    if (hoveredNoteId && hoveredNoteId === noteId) return 8e3;
    if (selectedNoteId && selectedNoteId === noteId) return 5e3;
    return isFavorite ? 300 : 50;
  }
  function sortNotes(notes) {
    return [...notes].sort((a, b) => {
      const favA = a.isFavorite ? 1 : 0;
      const favB = b.isFavorite ? 1 : 0;
      if (favA !== favB) return favB - favA;
      if (Math.abs(a.lat - b.lat) > 1e-4) return a.lat - b.lat;
      return a.lng - b.lng;
    });
  }
  function calculatePinDistance(map, n1, n2) {
    try {
      const p1 = map.latLngToContainerPoint([n1.lat, n1.lng]);
      const p2 = map.latLngToContainerPoint([n2.lat, n2.lng]);
      if (!p1 || !p2 || [p1.x, p1.y, p2.x, p2.y].some((x) => Number.isNaN(x))) return null;
      return p1.distanceTo(p2);
    } catch {
      return null;
    }
  }
  function detectClusters(notes, map, threshold, forceSingleNoteIds) {
    if (!map || notes.length === 0) return [];
    const sortedNotes = sortNotes(notes);
    const clusters = [];
    const processed = /* @__PURE__ */ new Set();
    sortedNotes.forEach((note) => {
      if (processed.has(note.id)) return;
      const cluster = [note];
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
  function mapPinSize(sliderValue) {
    return (sliderValue - 0.5) * (1.2 - 0.2) / (2 - 0.5) + 0.2;
  }
  function pinIconHtml(note, themeColor, clusterCount, pinSize) {
    const isFavorite = note.isFavorite === true;
    const mapped = mapPinSize(pinSize);
    const scale = (isFavorite ? 2 : 1) * mapped;
    const baseSize = 40;
    const size = baseSize * scale;
    const borderWidth = 3;
    const badgeSize = 20 * scale;
    const badgeOffset = 8 * scale;
    const countBadge = clusterCount && clusterCount > 1 ? `<div style="position:absolute;top:-${badgeOffset}px;right:-${badgeOffset}px;width:${badgeSize}px;height:${badgeSize}px;background:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 4px rgba(0,0,0,0.2);z-index:10;border:2px solid ${themeColor};"><span style="color:#000;font-size:${12 * scale}px;font-weight:bold;line-height:1;">${clusterCount}</span></div>` : "";
    let content = "";
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
  function runMapTabStandalone(L, marked, payload) {
    const el = document.getElementById("map");
    if (!el) return;
    const noteById = new Map(payload.notes.map((n) => [n.id, n]));
    const state = {
      selectedNoteId: null,
      hoveredNoteId: null,
      preSelected: null,
      previewImgIdx: 0
    };
    const map = L.map("map", { zoomControl: false, scrollWheelZoom: true }).setView(payload.center, payload.zoom);
    L.tileLayer(payload.tileUrl, {
      attribution: payload.tileAttribution || "",
      maxZoom: payload.maxZoom ?? 19,
      maxNativeZoom: payload.maxNativeZoom ?? payload.maxZoom ?? 19,
      subdomains: "abcd"
    }).addTo(map);
    if (payload.borderGeoJSON) {
      L.geoJSON(payload.borderGeoJSON, {
        style: {
          color: payload.themeColor,
          weight: 3,
          opacity: 0.8,
          fillColor: payload.themeColor,
          fillOpacity: 0.1,
          dashArray: "5, 10"
        }
      }).addTo(map);
    }
    const markerLayer = L.layerGroup().addTo(map);
    const labelLayer = L.layerGroup().addTo(map);
    const lineLayer = L.layerGroup().addTo(map);
    const previewEl = document.getElementById("km-map-tab-preview");
    function forceSingleIds() {
      if (!state.selectedNoteId || payload.showTextLabels) return /* @__PURE__ */ new Set();
      const ids = /* @__PURE__ */ new Set([state.selectedNoteId]);
      for (const c of payload.connections) {
        if (c.fromNoteId === state.selectedNoteId || c.toNoteId === state.selectedNoteId) {
          ids.add(c.fromNoteId);
          ids.add(c.toNoteId);
        }
      }
      return ids;
    }
    function connectionHighlightIds() {
      if (!state.selectedNoteId) return null;
      if (payload.showTextLabels) return null;
      const ids = /* @__PURE__ */ new Set([state.selectedNoteId]);
      for (const c of payload.connections) {
        if (c.fromNoteId === state.selectedNoteId || c.toNoteId === state.selectedNoteId) {
          ids.add(c.fromNoteId);
          ids.add(c.toNoteId);
        }
      }
      return ids;
    }
    function updatePreview() {
      if (!previewEl) return;
      const hid = state.hoveredNoteId;
      const sid = state.selectedNoteId;
      const note = hid && noteById.get(hid) || sid && noteById.get(sid) || null;
      if (!note) {
        previewEl.classList.add("hidden");
        previewEl.innerHTML = "";
        return;
      }
      if (state.previewImgIdx < 0) state.previewImgIdx = 0;
      const imgs = [...note.images || []];
      if (note.sketch) imgs.push(note.sketch);
      if (state.previewImgIdx >= imgs.length) state.previewImgIdx = 0;
      const timeRange = note.startYear != null ? note.endYear != null && note.endYear !== note.startYear ? `${note.startYear}\u2013${note.endYear}` : String(note.startYear) : "";
      let detailHtml = "";
      if (note.previewDetailMd.trim()) {
        try {
          detailHtml = marked?.parse(note.previewDetailMd) ?? escapeHtml(note.previewDetailMd).replace(/\n/g, "<br/>");
        } catch {
          detailHtml = escapeHtml(note.previewDetailMd).replace(/\n/g, "<br/>");
        }
        detailHtml = withExternalMarkdownLinks(String(detailHtml));
      }
      const imgSection = imgs.length > 0 ? `<div class="relative flex items-center justify-center shrink-0 px-4 py-3 bg-transparent">
            <img src="${escapeHtml(imgs[state.previewImgIdx])}" class="w-full max-h-64 object-contain" style="filter:drop-shadow(0 8px 18px rgba(15,23,42,0.28))" alt="" />
            ${imgs.length > 1 ? `<button type="button" class="km-prev absolute left-2 p-1.5 bg-black/30 text-white rounded-full">\u2039</button>
                   <button type="button" class="km-next absolute right-2 p-1.5 bg-black/30 text-white rounded-full">\u203A</button>` : ""}
          </div>` : "";
      previewEl.classList.remove("hidden");
      previewEl.innerHTML = `
      <div data-allow-context-menu class="fixed top-4 left-4 z-[1000] w-72 sm:w-80 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden pointer-events-auto flex flex-col" style="max-height:calc(100vh - 2rem)">
        <div class="p-4 pb-2 flex items-start justify-between gap-3 border-b border-gray-100 shrink-0">
          <div class="flex items-start gap-3 flex-1 min-w-0">
            ${note.emoji ? `<span class="text-2xl mt-0.5 shrink-0">${escapeHtml(note.emoji)}</span>` : ""}
            <div class="min-w-0 flex-1">
              <h3 class="text-lg font-bold text-gray-900 leading-tight whitespace-pre-line break-words">${escapeHtml(note.previewTitle)}</h3>
              ${timeRange ? `<div class="mt-1 text-xs text-gray-500 font-medium truncate">${escapeHtml(timeRange)}</div>` : ""}
            </div>
          </div>
        </div>
        <div class="flex-1 overflow-y-auto text-sm">
          ${detailHtml ? `<div class="px-4 py-3 text-gray-800 text-sm leading-snug break-words border-b border-gray-50 bg-gray-50/30 mapping-preview-markdown">${detailHtml}</div>` : ""}
          ${imgSection}
        </div>
      </div>`;
      const prev = previewEl.querySelector(".km-prev");
      const next = previewEl.querySelector(".km-next");
      prev?.addEventListener("click", (e) => {
        e.stopPropagation();
        state.previewImgIdx = (state.previewImgIdx - 1 + imgs.length) % imgs.length;
        updatePreview();
      });
      next?.addEventListener("click", (e) => {
        e.stopPropagation();
        state.previewImgIdx = (state.previewImgIdx + 1) % imgs.length;
        updatePreview();
      });
    }
    function drawLines() {
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
    let lastClusters = [];
    function rebuildMarkers() {
      markerLayer.clearLayers();
      lastClusters = detectClusters(payload.notes, map, payload.clusterThreshold, forceSingleIds());
      lastClusters.forEach((cl) => {
        if (cl.notes.length === 1) {
          const note = cl.notes[0];
          const { html, size, anchor } = pinIconHtml(note, payload.themeColor, void 0, payload.pinSize);
          const m = L.marker(cl.position, {
            icon: L.divIcon({ className: "custom-icon", html, iconSize: [size, size], iconAnchor: anchor })
          });
          m.on("mouseover", () => {
            state.hoveredNoteId = note.id;
            state.previewImgIdx = 0;
            redrawLabelsAndLines();
          });
          m.on("mouseout", () => {
            state.hoveredNoteId = null;
            redrawLabelsAndLines();
          });
          m.on("click", (e) => {
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
            icon: L.divIcon({ className: "custom-icon", html, iconSize: [size, size], iconAnchor: anchor })
          });
          m.on("click", (e) => {
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
    function redrawLabelsAndLines() {
      labelLayer.clearLayers();
      const clusters = lastClusters;
      const highlightSet = connectionHighlightIds();
      const visibleIndividual = /* @__PURE__ */ new Set();
      clusters.forEach((cl) => {
        if (cl.notes.length === 1) visibleIndividual.add(cl.notes[0].id);
      });
      const clusterLabelMeta = [];
      clusters.forEach((cl) => {
        if (cl.notes.length > 1) {
          const rep = cl.notes.find((n) => n.variant === "standard" && (getLabelText(n.text) || n.text?.trim())) || cl.notes[0];
          const text = getLabelText(rep.text || "") || rep.emoji || (rep.variant === "image" ? "\u7167\u7247" : "\u70B9\u4F4D");
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
        payload.mapUiChromeOpacity ?? DEFAULT_MAP_UI_CHROME_OPACITY,
        payload.mapUiChromeBlurPx ?? DEFAULT_MAP_UI_CHROME_BLUR_PX,
        themeColor
      );
      const addNoteLabel = (note) => {
        const text = getLabelText(note.text || "");
        if (!text) return;
        const timeText = getTimeText(note);
        const isFavorite = note.isFavorite === true;
        const scale = isFavorite ? 1.5 : 1;
        const fs = 10 * labelSize * scale;
        const paddingY = Math.max(4, Math.round(2 * scale + 2));
        const paddingX = paddingY;
        const timeFontSize = Math.max(8, Math.floor(fs * 0.75));
        const labelHeight = paddingY * 2 + fs + timeFontSize + 6;
        const html = `<div style="${chromeCss};color:${isFavorite ? themeColor : "#000"};padding:${paddingY}px ${paddingX}px;font-size:${fs}px;font-weight:${isFavorite ? "bold" : "500"};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none;display:flex;align-items:flex-start;width:fit-content;">
          <div style="display:flex;flex-direction:column;gap:2px;">
            <span style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(text)}</span>
            ${timeText ? `<span style="font-size:${timeFontSize}px;font-weight:500;color:${isFavorite ? themeColor : "#6b7280"};white-space:nowrap;">${escapeHtml(timeText)}</span>` : ""}
          </div>
        </div>`;
        L.marker([note.lat, note.lng], {
          icon: L.divIcon({
            className: "custom-text-label",
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
        const itemsHtml = state.preSelected.map((note) => {
          const text = getLabelText(note.text || "") || note.emoji || (note.variant === "image" ? "\u7167\u7247" : "\u70B9\u4F4D");
          const timeText = getTimeText(note);
          const isFav = note.isFavorite === true;
          const rowZ = state.selectedNoteId === note.id ? 2 : 0;
          return `<div data-note-id="${note.id}" class="pre-selected-label-item" style="position:relative;z-index:${rowZ};${chromeCss};color:${isFav ? themeColor : "#000"};padding:4px;display:flex;align-items:flex-start;gap:6px;font-size:${fontSize}px;font-weight:${isFav ? "bold" : "500"};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;pointer-events:auto;margin-bottom:4px;width:fit-content;">
            <div style="display:flex;flex-direction:column;gap:2px;pointer-events:none;">
              <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(text)}</span>
              ${timeText ? `<span style="font-size:${timeFontSize}px;font-weight:500;color:${isFav ? themeColor : "#6b7280"};white-space:nowrap;">${escapeHtml(timeText)}</span>` : ""}
            </div>
          </div>`;
        }).join("");
        const div = `<div class="pre-selected-labels-container" style="display:flex;flex-direction:column;gap:4px;align-items:flex-start;">${itemsHtml}</div>`;
        const mk = L.marker([pos.lat, pos.lng], {
          icon: L.divIcon({
            className: "pre-selected-labels-container",
            html: div,
            iconSize: [0, totalHeight],
            iconAnchor: [0, totalHeight / 2]
          }),
          zIndexOffset: 1e3
        });
        mk.on("mousedown", (e) => {
          e.originalEvent.stopPropagation();
          const t = e.originalEvent.target;
          const item = t.closest?.(".pre-selected-label-item");
          const id = item?.getAttribute("data-note-id");
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
      const showClusterLabels = payload.showTextLabels && !highlightSet && !state.selectedNoteId && !state.hoveredNoteId && !state.preSelected;
      if (showClusterLabels) {
        clusterLabelMeta.forEach((meta) => {
          const isFavorite = meta.isFavorite;
          const scale = isFavorite ? 1.5 : 1;
          const fontSize = 10 * labelSize * scale;
          const paddingX = Math.max(4, Math.round(8 * scale * 0.5 + 2));
          const paddingY = Math.max(4, Math.round(2 * scale + 2));
          const timeFontSize = Math.max(8, Math.floor(fontSize * 0.75));
          const labelHeight = paddingY * 2 + fontSize + timeFontSize + 6;
          const html = `<div style="${chromeCss};color:${isFavorite ? themeColor : "#000"};padding:${paddingY}px ${paddingX}px;font-size:${fontSize}px;font-weight:${isFavorite ? "bold" : "500"};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none;display:inline-block;width:fit-content;">
          <div style="display:flex;flex-direction:column;gap:2px;">
            <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(meta.text)}</div>
            ${meta.timeText ? `<div style="font-size:${timeFontSize}px;font-weight:500;color:${isFavorite ? themeColor : "#6b7280"};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(meta.timeText)}</div>` : ""}
          </div>
        </div>`;
          L.marker(meta.position, {
            icon: L.divIcon({
              className: "custom-text-label",
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
            if (note.variant !== "standard" || !note.text?.trim()) continue;
            const show = state.selectedNoteId === note.id || state.hoveredNoteId === note.id || payload.showTextLabels && visibleIndividual.has(note.id);
            if (!show) continue;
            addNoteLabel(note);
          }
        }
      }
      drawLines();
      updatePreview();
    }
    function fullRefresh() {
      rebuildMarkers();
      redrawLabelsAndLines();
    }
    map.on("click", () => {
      state.selectedNoteId = null;
      state.hoveredNoteId = null;
      state.preSelected = null;
      fullRefresh();
    });
    map.on("moveend", fullRefresh);
    map.on("zoomend", fullRefresh);
    window.addEventListener("load", () => {
      map.invalidateSize();
    });
    setTimeout(() => map.invalidateSize(), 100);
    fullRefresh();
  }

  // map-tab-standalone-entry.ts
  function main() {
    const b64 = window.__KM_MAP_TAB__?.b64;
    const L = window.L;
    if (!b64 || !L) return;
    const payload = decodeMapTabPayloadFromBase64(b64);
    runMapTabStandalone(L, window.marked ?? null, payload);
  }
  main();
})();
