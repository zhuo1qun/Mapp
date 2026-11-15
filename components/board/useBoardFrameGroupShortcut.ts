import { useEffect, type Dispatch, type SetStateAction } from 'react';
import type { Note, Project } from '../../types';
import { generateId } from '../../utils';
import {
  assignSelectedNotesToGroup,
  clearGroupsSharedWithSelectedNotes
} from '../../utils/board/boardBatchOperations';

type UpdateProject = (projectOrId: Project | string, updates?: Partial<Project>) => void | Promise<void>;

/** Cmd/Ctrl+G 成组，Cmd/Ctrl+Shift+G 解散所选卡片所在的组。 */
export function useBoardFrameGroupShortcut({
  notes,
  project,
  onUpdateProject,
  selectedNoteIds,
  setSelectedNoteIds
}: {
  notes: Note[];
  project?: Project;
  onUpdateProject?: UpdateProject;
  selectedNoteIds: Set<string>;
  setSelectedNoteIds: Dispatch<SetStateAction<Set<string>>>;
}) {
  useEffect(() => {
    const handleGroupShortcut = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || (event.key !== 'g' && event.key !== 'G')) return;

      if (!event.shiftKey) {
        if (selectedNoteIds.size < 2) return;
        event.preventDefault();
        onUpdateProject?.({
          ...project,
          notes: assignSelectedNotesToGroup(notes, selectedNoteIds, generateId())
        });
        return;
      }

      const updatedNotes = clearGroupsSharedWithSelectedNotes(notes, selectedNoteIds);
      if (!updatedNotes) return;
      event.preventDefault();
      onUpdateProject?.({ ...project, notes: updatedNotes });
      setSelectedNoteIds(new Set());
    };

    window.addEventListener('keydown', handleGroupShortcut);
    return () => window.removeEventListener('keydown', handleGroupShortcut);
  }, [notes, onUpdateProject, project, selectedNoteIds, setSelectedNoteIds]);
}
