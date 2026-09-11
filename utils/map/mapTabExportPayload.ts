import type { Map as LeafletMap } from 'leaflet';
import { MAP_MAX_ZOOM, MAP_STYLE_OPTIONS } from '../../constants';
import type { Connection, Note, Project } from '../../types';
import { parseNoteContent } from '../../utils';

export interface MapTabExportNote {
  id: string;
  lat: number;
  lng: number;
  emoji: string;
  text: string;
  isFavorite: boolean;
  startYear?: number;
  endYear?: number;
  variant: string;
  images: string[];
  sketch?: string;
  previewTitle: string;
  previewDetailMd: string;
}

export interface MapTabExportPayload {
  version: 1;
  app: 'mapp-map-tab-export';
  projectName: string;
  themeColor: string;
  mapStyleId: string;
  tileUrl: string;
  tileAttribution: string;
  /** 瓦片原生最大级别；卫星图低于 maxZoom，超出后拉伸较低清晰度瓦片 */
  maxNativeZoom?: number;
  maxZoom?: number;
  center: [number, number];
  zoom: number;
  pinSize: number;
  labelSize: number;
  clusterThreshold: number;
  showTextLabels: boolean;
  notes: MapTabExportNote[];
  connections: Pick<Connection, 'id' | 'fromNoteId' | 'toNoteId'>[];
  borderGeoJSON: unknown | null;
  exportedAt: number;
}

async function inlineImageUrl(url: string): Promise<string | null> {
  if (!url || url.startsWith('data:')) return null;
  try {
    const r = await fetch(url);
    const b = await r.blob();
    return await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result as string);
      fr.onerror = reject;
      fr.readAsDataURL(b);
    });
  } catch {
    return null;
  }
}

export async function buildMapTabExportPayload(
  project: Project,
  themeColor: string,
  mapStyleId: string,
  map: LeafletMap,
  opts: {
    pinSize: number;
    labelSize: number;
    clusterThreshold: number;
    showTextLabels: boolean;
    borderGeoJSON: unknown | null | undefined;
  }
): Promise<MapTabExportPayload> {
  const style = MAP_STYLE_OPTIONS.find((s) => s.id === mapStyleId) ?? MAP_STYLE_OPTIONS[0];
  const c = map.getCenter();
  const notesIn = (project.notes || []).filter(
    (n) =>
      n.variant === 'standard' &&
      n.coords &&
      typeof n.coords.lat === 'number' &&
      !Number.isNaN(n.coords.lat) &&
      typeof n.coords.lng === 'number' &&
      !Number.isNaN(n.coords.lng)
  );

  const notes: MapTabExportNote[] = await Promise.all(
    notesIn.map(async (n) => {
      const { title, detail } = parseNoteContent(n.text || '');
      const images: string[] = [];
      for (const src of n.images || []) {
        if (src.startsWith('data:')) {
          images.push(src);
          continue;
        }
        const inlined = await inlineImageUrl(src);
        images.push(inlined ?? src);
      }
      let sketch = n.sketch;
      if (sketch && !sketch.startsWith('data:')) {
        const inlined = await inlineImageUrl(sketch);
        sketch = inlined ?? sketch;
      }
      const previewTitle = (title || 'Untitled Note').replace(/,\s/, '\n');
      return {
        id: n.id,
        lat: n.coords.lat,
        lng: n.coords.lng,
        emoji: n.emoji || '',
        text: n.text || '',
        isFavorite: !!n.isFavorite,
        startYear: n.startYear ?? undefined,
        endYear: n.endYear ?? undefined,
        variant: n.variant || 'standard',
        images,
        sketch,
        previewTitle,
        previewDetailMd: detail || ''
      };
    })
  );

  return {
    version: 1,
    app: 'mapp-map-tab-export',
    projectName: project.name || '项目',
    themeColor,
    mapStyleId,
    tileUrl: style.url,
    tileAttribution: style.attribution,
    maxNativeZoom: style.maxNativeZoom ?? MAP_MAX_ZOOM,
    maxZoom: MAP_MAX_ZOOM,
    center: [c.lat, c.lng],
    zoom: map.getZoom(),
    pinSize: opts.pinSize,
    labelSize: opts.labelSize,
    clusterThreshold: opts.clusterThreshold,
    showTextLabels: opts.showTextLabels,
    notes,
    connections: (project.connections || []).map((x) => ({
      id: x.id,
      fromNoteId: x.fromNoteId,
      toNoteId: x.toNoteId
    })),
    borderGeoJSON: opts.borderGeoJSON ?? null,
    exportedAt: Date.now()
  };
}
