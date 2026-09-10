import type { Connection, Note, Project } from '../../types';
import { clampConnectionWeight, clampNoteWeight } from '../graph/graphData';
import { parseNoteContent } from '../../utils';
import { downloadTextFile } from '../builtinExamples/projectFromExport';

export const MAPP_VIZ_FORMAT = 'mapp-viz-v1' as const;

export type MappVizArrow = 'arrow' | 'none';

export interface MappVizArticle {
  title: string;
  detail: string;
  year?: number;
  endYear?: number;
  tags?: string[];
}

export interface MappVizNode {
  id: string;
  label: string;
  label2?: string;
  x: number;
  y: number;
  lat?: number;
  lng?: number;
  cluster?: string;
  clusterName?: string;
  size?: number;
  weight?: number;
  emoji?: string;
  favorite?: boolean;
  article?: MappVizArticle;
}

export interface MappVizLink {
  id: string;
  source: string;
  target: string;
  weight: number;
  label?: string;
  fromArrow: MappVizArrow;
  toArrow: MappVizArrow;
  labelAnchor?: string;
}

export interface MappVizCluster {
  cid: string;
  label: string;
}

export interface MappVizJson {
  version: 1;
  app: 'mapp';
  format: typeof MAPP_VIZ_FORMAT;
  exportedAt: number;
  project: {
    id: string;
    name: string;
    themeColor?: string;
  };
  nodes: MappVizNode[];
  links: MappVizLink[];
  clusters?: MappVizCluster[];
}

/** Normalize endpoint arrows for interchange (ignore board-only sides). */
export function connectionEndpointArrows(c: Connection): {
  fromArrow: MappVizArrow;
  toArrow: MappVizArrow;
} {
  const fromArrow: MappVizArrow =
    c.fromArrow != null ? (c.fromArrow === 'arrow' ? 'arrow' : 'none') : c.arrow === 'reverse' ? 'arrow' : 'none';
  const toArrow: MappVizArrow =
    c.toArrow != null ? (c.toArrow === 'arrow' ? 'arrow' : 'none') : c.arrow === 'forward' ? 'arrow' : 'none';
  return { fromArrow, toArrow };
}

function noteCluster(note: Note): { cluster?: string; clusterName?: string } {
  const tag = note.tags?.[0];
  if (tag?.label) {
    return { cluster: tag.label, clusterName: tag.label };
  }
  const name = note.groupNames?.[0] || note.groupName;
  if (name) {
    return { cluster: name, clusterName: name };
  }
  return {};
}

function boardSlot(index: number): { x: number; y: number } {
  const col = index % 6;
  const row = Math.floor(index / 6);
  return { x: 100 + col * 306, y: 100 + row * 306 };
}

function noteLabel(note: Note): string {
  const { title } = parseNoteContent(note.text || '');
  const head = (title || '').split(/[,，]/, 1)[0]?.trim() || '';
  return head || '便签';
}

function hasGeo(note: Note): note is Note & { coords: { lat: number; lng: number } } {
  const c = note.coords;
  return (
    !!c &&
    typeof c.lat === 'number' &&
    typeof c.lng === 'number' &&
    !Number.isNaN(c.lat) &&
    !Number.isNaN(c.lng) &&
    !(c.lat === 0 && c.lng === 0)
  );
}

/**
 * Build Bibliometrics-oriented interchange JSON (`mapp-viz-v1`).
 * Carries nodes + directed links (fromArrow/toArrow + label). No images.
 */
export function buildMappVizJson(project: Project): MappVizJson {
  const notes = project.notes || [];
  const noteIds = new Set(notes.map((n) => n.id));

  const nodes: MappVizNode[] = notes.map((note, index) => {
    const { title, detail } = parseNoteContent(note.text || '');
    const { cluster, clusterName } = noteCluster(note);
    const hasBoard =
      typeof note.boardX === 'number' &&
      !Number.isNaN(note.boardX) &&
      typeof note.boardY === 'number' &&
      !Number.isNaN(note.boardY);
    const pos = hasBoard ? { x: note.boardX, y: note.boardY } : boardSlot(index);

    const article: MappVizArticle = {
      title: (title || '').trim() || noteLabel(note),
      detail: detail || ''
    };
    if (note.startYear != null) article.year = note.startYear;
    if (note.endYear != null) article.endYear = note.endYear;
    if (note.tags?.length) article.tags = note.tags.map((t) => t.label).filter(Boolean);

    const node: MappVizNode = {
      id: note.id,
      label: noteLabel(note),
      x: pos.x,
      y: pos.y,
      size: note.isFavorite ? 1.2 : 1,
      weight: clampNoteWeight(note.weight ?? (note.isFavorite ? 1.2 : 1)),
      article
    };

    if (note.startYear != null) node.label2 = String(note.startYear);
    if (cluster) node.cluster = cluster;
    if (clusterName) node.clusterName = clusterName;
    if (note.emoji) node.emoji = note.emoji;
    if (note.isFavorite) node.favorite = true;
    if (hasGeo(note)) {
      node.lat = note.coords.lat;
      node.lng = note.coords.lng;
    }

    return node;
  });

  const links: MappVizLink[] = [];
  for (const c of project.connections || []) {
    if (!noteIds.has(c.fromNoteId) || !noteIds.has(c.toNoteId)) continue;
    const { fromArrow, toArrow } = connectionEndpointArrows(c);
    const link: MappVizLink = {
      id: c.id,
      source: c.fromNoteId,
      target: c.toNoteId,
      weight: clampConnectionWeight(c.weight),
      fromArrow,
      toArrow
    };
    const label = (c.label || '').trim();
    if (label) link.label = label;
    if (
      c.labelAnchorNoteId &&
      (c.labelAnchorNoteId === c.fromNoteId || c.labelAnchorNoteId === c.toNoteId)
    ) {
      link.labelAnchor = c.labelAnchorNoteId;
    }
    links.push(link);
  }

  const clusterMap = new Map<string, string>();
  for (const n of nodes) {
    if (n.cluster) {
      clusterMap.set(n.cluster, n.clusterName || n.cluster);
    }
  }
  const clusters: MappVizCluster[] | undefined =
    clusterMap.size > 0
      ? Array.from(clusterMap.entries()).map(([cid, label]) => ({ cid, label }))
      : undefined;

  const payload: MappVizJson = {
    version: 1,
    app: 'mapp',
    format: MAPP_VIZ_FORMAT,
    exportedAt: Date.now(),
    project: {
      id: project.id,
      name: project.name || '项目'
    },
    nodes,
    links
  };

  if (project.themeColor) payload.project.themeColor = project.themeColor;
  if (clusters) payload.clusters = clusters;

  return payload;
}

export function downloadMappVizJson(project: Project, fileNameBase?: string): MappVizJson {
  const payload = buildMappVizJson(project);
  const safe = (fileNameBase || project.name || 'project').replace(/[/\\?%*:|"<>]/g, '_');
  downloadTextFile(
    `${safe}.viz.json`,
    JSON.stringify(payload, null, 2),
    'application/json'
  );
  return payload;
}
