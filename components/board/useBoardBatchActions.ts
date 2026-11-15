import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { Note, Project } from '../../types';
import { TAG_COLORS } from '../../constants';
import { generateId } from '../../utils';
import {
  appendTagToSelectedNotes,
  assignSelectedNotesToGroup,
  clearGroupsSharedWithSelectedNotes,
  parseBoardBatchTimeRange,
  setSelectedNotesTimeRange
} from '../../utils/board/boardBatchOperations';

type MultiBatchPanel = 'none' | 'tag' | 'time';
type UpdateProject = (projectOrId: Project | string, updates?: Partial<Project>) => void | Promise<void>;

interface UseBoardBatchActionsOptions {
  notes: Note[];
  project?: Project;
  onUpdateNote: (note: Note) => void;
  onUpdateProject?: UpdateProject;
  workspaceEditMode: boolean;
  selectedNoteIds: Set<string>;
  batchTagLabel: string;
  setBatchTagLabel: Dispatch<SetStateAction<string>>;
  batchTagColorIndex: number;
  batchTimeStartStr: string;
  batchTimeEndStr: string;
  setMultiBatchPanel: Dispatch<SetStateAction<MultiBatchPanel>>;
}

/** 批量标签、时间与轻量分组的写回规则；视图只负责面板的展示。 */
export function useBoardBatchActions({
  notes,
  project,
  onUpdateNote,
  onUpdateProject,
  workspaceEditMode,
  selectedNoteIds,
  batchTagLabel,
  setBatchTagLabel,
  batchTagColorIndex,
  batchTimeStartStr,
  batchTimeEndStr,
  setMultiBatchPanel
}: UseBoardBatchActionsOptions) {
  const canGroup = workspaceEditMode && selectedNoteIds.size >= 2;
  const canUngroup =
    workspaceEditMode && notes.some((note) => selectedNoteIds.has(note.id) && note.noteGroupId);

  const applyBatchTags = useCallback(() => {
    const label = batchTagLabel.trim();
    if (!label) return;
    const color = TAG_COLORS[batchTagColorIndex % TAG_COLORS.length];
    if (onUpdateProject && project) {
      const nextNotes = appendTagToSelectedNotes(
        project.notes,
        selectedNoteIds,
        { label, color },
        generateId
      );
      onUpdateProject({ ...project, notes: nextNotes });
    } else {
      appendTagToSelectedNotes(notes, selectedNoteIds, { label, color }, generateId)
        .filter((note) => selectedNoteIds.has(note.id))
        .forEach(onUpdateNote);
    }
    setBatchTagLabel('');
    setMultiBatchPanel('none');
  }, [
    batchTagColorIndex,
    batchTagLabel,
    notes,
    onUpdateNote,
    onUpdateProject,
    project,
    selectedNoteIds,
    setBatchTagLabel,
    setMultiBatchPanel
  ]);

  const dismissBatchTagPanel = useCallback(() => {
    if (batchTagLabel.trim()) {
      applyBatchTags();
      return;
    }
    setMultiBatchPanel('none');
    setBatchTagLabel('');
  }, [applyBatchTags, batchTagLabel, setBatchTagLabel, setMultiBatchPanel]);

  const applyBatchTime = useCallback(() => {
    const timeRange = parseBoardBatchTimeRange(batchTimeStartStr, batchTimeEndStr);
    if (onUpdateProject && project) {
      onUpdateProject({
        ...project,
        notes: setSelectedNotesTimeRange(project.notes, selectedNoteIds, timeRange)
      });
    } else {
      setSelectedNotesTimeRange(notes, selectedNoteIds, timeRange)
        .filter((note) => selectedNoteIds.has(note.id))
        .forEach(onUpdateNote);
    }
    setMultiBatchPanel('none');
  }, [
    batchTimeEndStr,
    batchTimeStartStr,
    notes,
    onUpdateNote,
    onUpdateProject,
    project,
    selectedNoteIds,
    setMultiBatchPanel
  ]);

  const runGroupSelected = useCallback(() => {
    if (!canGroup || !project) return;
    onUpdateProject?.({
      ...project,
      notes: assignSelectedNotesToGroup(notes, selectedNoteIds, generateId())
    });
  }, [canGroup, notes, onUpdateProject, project, selectedNoteIds]);

  const runUngroupSelected = useCallback(() => {
    if (!project) return;
    const updatedNotes = clearGroupsSharedWithSelectedNotes(notes, selectedNoteIds);
    if (!updatedNotes) return;
    onUpdateProject?.({ ...project, notes: updatedNotes });
  }, [notes, onUpdateProject, project, selectedNoteIds]);

  return {
    canGroup,
    canUngroup,
    applyBatchTags,
    dismissBatchTagPanel,
    applyBatchTime,
    runGroupSelected,
    runUngroupSelected
  };
}
