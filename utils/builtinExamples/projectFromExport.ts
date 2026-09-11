import type { Note, Project } from '../../types';
import { generateId } from '../../utils';
import { sanitizeProjectKind } from '../projectKind';

/**
 * 将「应用导出的 JSON」里的 project 转为可 `saveProject` 的新项目（重新分配 id，避免与本地冲突）。
 * 逻辑与 ProjectManager 中「新建项目导入」分支一致。
 */
export function buildFreshProjectFromExportedProject(
  importedProject: Project,
  displayName: string
): Project {
  const newProjectId = generateId();
  const newProject: Project = {
    ...importedProject,
    id: newProjectId,
    name: displayName,
    // 导入始终是用户自己的新项目，不应继续被识别为内置示例。
    builtinExampleId: undefined,
    type: 'map',
    // 保留合法 projectKind；无效/缺失 → undefined，首次打开时询问
    projectKind: sanitizeProjectKind(importedProject.projectKind),
    createdAt: Date.now(),
    notes: importedProject.notes || [],
    frames: importedProject.frames || [],
    connections: importedProject.connections || []
  };

  const noteIdMap = new Map<string, string>();
  const frameIdMap = new Map<string, string>();

  const regeneratedNotes = (newProject.notes || []).map((note) => {
    const raw = (note as Note & { variant?: string }).variant || 'standard';
    const variant: 'standard' | 'image' = raw === 'image' ? 'image' : 'standard';
    const newId = generateId();
    noteIdMap.set(note.id, newId);
    return { ...note, id: newId, variant };
  });

  const regeneratedFrames = (newProject.frames || []).map((frame) => {
    const newId = generateId();
    frameIdMap.set(frame.id, newId);
    return { ...frame, id: newId };
  });

  regeneratedNotes.forEach((note) => {
    if (note.groupId && frameIdMap.has(note.groupId)) {
      note.groupId = frameIdMap.get(note.groupId)!;
    }
    if (note.groupIds?.length) {
      note.groupIds = note.groupIds.map((gid) =>
        frameIdMap.has(gid) ? frameIdMap.get(gid)! : gid
      );
    }
  });

  const regeneratedConnections = (newProject.connections || []).map((conn) => ({
    ...conn,
    id: generateId(),
    fromNoteId: noteIdMap.get(conn.fromNoteId) ?? conn.fromNoteId,
    toNoteId: noteIdMap.get(conn.toNoteId) ?? conn.toNoteId
  }));

  return {
    ...newProject,
    notes: regeneratedNotes,
    frames: regeneratedFrames,
    connections: regeneratedConnections
  };
}

export function parseExportPayload(text: string): { project: Project } {
  const data = JSON.parse(text) as { project?: Project };
  if (!data?.project || typeof data.project.name !== 'string') {
    throw new Error('无效格式：需要包含 project.name');
  }
  return { project: data.project };
}

export function downloadTextFile(filename: string, text: string, mime = 'application/json'): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}
