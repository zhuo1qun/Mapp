import type { Connection, Frame, Note, Project } from '../../types';
import { generateId } from '../../utils';

export type ProjectImportDependencies = {
  createId?: () => string;
  now?: () => number;
};

export type RegeneratedProjectContent = {
  notes: Note[];
  frames: Frame[];
  connections: Connection[];
  noteCounts: {
    standard: number;
    image: number;
    total: number;
  };
};

export type MergedProjectImport = RegeneratedProjectContent & {
  project: Project;
  duplicateCount: number;
};

/** 旧项目的 compact 便签在导入时回退为标准文本便签。 */
function normalizeImportedNoteVariant(note: Note): Note['variant'] {
  return note.variant === 'image' ? 'image' : 'standard';
}

/** 与项目数据检查沿用同一套“同文本、同位置”判断，兼容旧的缺失坐标记录。 */
export function areProjectNotesDuplicates(note1: Note, note2: Note): boolean {
  if (note1.text !== note2.text) return false;
  const latDiff = Math.abs(note1.coords?.lat - note2.coords?.lat);
  const lngDiff = Math.abs(note1.coords?.lng - note2.coords?.lng);
  return latDiff < 0.0001 && lngDiff < 0.0001;
}

/** 创建新项目时的外壳；内容 ID 会在下一步统一重建。 */
export function createImportedProjectShell(
  importedProject: Project,
  dependencies: ProjectImportDependencies = {}
): Project {
  const createId = dependencies.createId ?? generateId;
  const now = dependencies.now ?? Date.now;

  return {
    id: createId(),
    name: `${importedProject.name} (Imported)`,
    type: 'map',
    projectKind: 'mapping',
    createdAt: now(),
    notes: importedProject.notes || [],
    frames: importedProject.frames || [],
    connections: importedProject.connections || [],
    themeColor: importedProject.themeColor,
    backgroundOpacity: importedProject.backgroundOpacity
  };
}

/**
 * 导入内容统一重新编号，保持便签—分组—连线之间的引用一致。
 * 这是纯数据转换，不涉及 IndexedDB、React state 或用户提示。
 */
export function regenerateImportedProjectContent(
  project: Project,
  dependencies: Pick<ProjectImportDependencies, 'createId'> = {}
): RegeneratedProjectContent {
  const createId = dependencies.createId ?? generateId;
  const noteIdMap = new Map<string, string>();
  const frameIdMap = new Map<string, string>();

  const notes = (project.notes || []).map((note) => {
    const id = createId();
    noteIdMap.set(note.id, id);
    return {
      ...note,
      id,
      variant: normalizeImportedNoteVariant(note)
    };
  });

  const frames = (project.frames || []).map((frame) => {
    const id = createId();
    frameIdMap.set(frame.id, id);
    return { ...frame, id };
  });

  notes.forEach((note) => {
    if (note.groupId && frameIdMap.has(note.groupId)) {
      note.groupId = frameIdMap.get(note.groupId)!;
    }
    if (note.groupIds?.length) {
      note.groupIds = note.groupIds.map((groupId) => frameIdMap.get(groupId) ?? groupId);
    }
  });

  const connections = (project.connections || []).map((connection) => ({
    ...connection,
    id: createId(),
    fromNoteId: noteIdMap.get(connection.fromNoteId) ?? connection.fromNoteId,
    toNoteId: noteIdMap.get(connection.toNoteId) ?? connection.toNoteId
  }));

  return {
    notes,
    frames,
    connections,
    noteCounts: {
      standard: notes.filter((note) => note.variant === 'standard').length,
      image: notes.filter((note) => note.variant === 'image').length,
      total: notes.length
    }
  };
}

/** 将导入内容合并入现有项目，并保持旧的重复便签与连线过滤规则。 */
export function mergeImportedProject(
  activeProject: Project,
  importedProject: Project,
  dependencies: Pick<ProjectImportDependencies, 'createId'> = {}
): MergedProjectImport {
  const regenerated = regenerateImportedProjectContent(importedProject, dependencies);
  const uniqueImportedNotes = regenerated.notes.filter((importedNote) =>
    !activeProject.notes.some((existingNote) => areProjectNotesDuplicates(importedNote, existingNote))
  );
  const mergedNotes = [...activeProject.notes, ...uniqueImportedNotes];
  const connections = regenerated.connections.filter(
    (connection) =>
      mergedNotes.some((note) => note.id === connection.fromNoteId) &&
      mergedNotes.some((note) => note.id === connection.toNoteId)
  );

  return {
    ...regenerated,
    connections,
    duplicateCount: regenerated.notes.length - uniqueImportedNotes.length,
    project: {
      ...activeProject,
      notes: mergedNotes,
      frames: [...(activeProject.frames || []), ...regenerated.frames],
      connections: [...(activeProject.connections || []), ...connections]
    }
  };
}
