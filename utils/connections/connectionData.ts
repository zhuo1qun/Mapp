import type { Connection, Project } from '../../types';

export type ConnectionDirection = 'forward' | 'backward' | 'both' | 'none';

/** 连线权重：未设置或非法时按 1（兼容旧项目数据）。 */
export const DEFAULT_CONNECTION_WEIGHT = 1;

/** 便签视觉权重：未设置或非法时按 1（兼容旧项目数据）。 */
export const DEFAULT_NOTE_WEIGHT = 1;

export function clampNoteWeight(raw: unknown): number {
  const weight = Number(raw);
  if (!Number.isFinite(weight) || weight <= 0) return DEFAULT_NOTE_WEIGHT;
  return Math.round(Math.max(0.1, Math.min(10, weight)) * 10) / 10;
}

export function clampConnectionWeight(raw: unknown): number {
  const weight = Number(raw);
  if (!Number.isFinite(weight) || weight <= 0) return DEFAULT_CONNECTION_WEIGHT;
  return Math.round(Math.max(0.1, Math.min(10, weight)) * 10) / 10;
}

/** 由旧的 arrow / fromArrow / toArrow 字段得出连线方向。 */
export function connectionDirection(connection: Connection): ConnectionDirection {
  if (connection.arrow === 'none') return 'none';
  const fromArrow: 'arrow' | 'none' =
    connection.fromArrow != null
      ? connection.fromArrow
      : connection.arrow === 'reverse'
        ? 'arrow'
        : 'none';
  const toArrow: 'arrow' | 'none' =
    connection.toArrow != null
      ? connection.toArrow
      : connection.arrow === 'forward'
        ? 'arrow'
        : 'none';
  if (fromArrow === 'arrow' && toArrow === 'arrow') return 'both';
  if (toArrow === 'arrow') return 'forward';
  if (fromArrow === 'arrow') return 'backward';
  return 'none';
}

export function reverseConnectionEndpoints(connection: Connection): Connection {
  const next: Connection = {
    ...connection,
    fromNoteId: connection.toNoteId,
    toNoteId: connection.fromNoteId,
    fromSide: connection.toSide,
    toSide: connection.fromSide,
    fromArrow: connection.toArrow,
    toArrow: connection.fromArrow
  };
  if (next.fromArrow != null || next.toArrow != null) {
    delete next.arrow;
  } else if (connection.arrow === 'reverse') {
    next.arrow = 'forward';
  } else if (connection.arrow === 'forward') {
    next.arrow = 'reverse';
  }
  return next;
}

/** 打开项目时清理失效端点，并规范化历史反向箭头。 */
export function normalizeProjectConnections(project: Project): { project: Project; mutated: boolean } {
  const noteIds = new Set(project.notes.map((note) => note.id));
  let mutated = false;
  const connections: Connection[] = [];

  for (const connection of project.connections ?? []) {
    if (!noteIds.has(connection.fromNoteId) || !noteIds.has(connection.toNoteId)) {
      mutated = true;
      continue;
    }
    let next = connection;
    if (
      connection.labelAnchorNoteId != null &&
      connection.labelAnchorNoteId !== connection.fromNoteId &&
      connection.labelAnchorNoteId !== connection.toNoteId
    ) {
      next = { ...next };
      delete next.labelAnchorNoteId;
      mutated = true;
    }
    if (connectionDirection(next) === 'backward') {
      next = reverseConnectionEndpoints(next);
      mutated = true;
    }
    connections.push(next);
  }

  return mutated ? { project: { ...project, connections }, mutated: true } : { project, mutated: false };
}
