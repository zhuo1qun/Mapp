import { useCallback, useMemo, type Dispatch, type SetStateAction } from 'react';
import type { Note } from '../../types';

type MultiBatchPanel = 'none' | 'tag' | 'time';

/** 选中工具栏的离开、删除与地图定位动作。 */
export function useBoardSelectionToolbarActions({
  selectedNoteIds,
  selectedNotes,
  deleteBoardNotesWithExit,
  setSelectedNoteId,
  setSelectedNoteIds,
  setMultiBatchPanel,
  setBatchTagLabel,
  setBatchTimeStartStr,
  setBatchTimeEndStr,
  setBrowseTagFilterPanelOpen,
  setBrowseTimeFilterPanelOpen,
  onSwitchToMapView
}: {
  selectedNoteIds: Set<string>;
  selectedNotes: Note[];
  deleteBoardNotesWithExit: (noteIds: string[]) => void;
  setSelectedNoteId: Dispatch<SetStateAction<string | null>>;
  setSelectedNoteIds: Dispatch<SetStateAction<Set<string>>>;
  setMultiBatchPanel: Dispatch<SetStateAction<MultiBatchPanel>>;
  setBatchTagLabel: Dispatch<SetStateAction<string>>;
  setBatchTimeStartStr: Dispatch<SetStateAction<string>>;
  setBatchTimeEndStr: Dispatch<SetStateAction<string>>;
  setBrowseTagFilterPanelOpen: Dispatch<SetStateAction<boolean>>;
  setBrowseTimeFilterPanelOpen: Dispatch<SetStateAction<boolean>>;
  onSwitchToMapView?: (coords?: { lat: number; lng: number }) => void;
}) {
  const runBatchDelete = useCallback(() => {
    const idsToDelete = Array.from(selectedNoteIds);
    if (idsToDelete.length === 0) return;
    if (
      idsToDelete.length > 1 &&
      !confirm(`确定删除已选中的 ${idsToDelete.length} 个便签吗？\n此操作无法撤回。`)
    ) {
      return;
    }
    deleteBoardNotesWithExit(idsToDelete);
    setMultiBatchPanel('none');
  }, [deleteBoardNotesWithExit, selectedNoteIds, setMultiBatchPanel]);

  const exitMultiSelectToolbar = useCallback(() => {
    setSelectedNoteIds(new Set());
    setSelectedNoteId(null);
    setMultiBatchPanel('none');
    setBatchTagLabel('');
    setBatchTimeStartStr('');
    setBatchTimeEndStr('');
    setBrowseTagFilterPanelOpen(false);
    setBrowseTimeFilterPanelOpen(false);
  }, [
    setBatchTagLabel,
    setBatchTimeEndStr,
    setBatchTimeStartStr,
    setBrowseTagFilterPanelOpen,
    setBrowseTimeFilterPanelOpen,
    setMultiBatchPanel,
    setSelectedNoteId,
    setSelectedNoteIds
  ]);

  const onLocateOnMap = useMemo(() => {
    if (selectedNotes.length !== 1 || !onSwitchToMapView) return undefined;
    const note = selectedNotes[0];
    if (!note.coords || (note.coords.lat === 0 && note.coords.lng === 0)) return undefined;
    return () => onSwitchToMapView(note.coords);
  }, [onSwitchToMapView, selectedNotes]);

  return { runBatchDelete, exitMultiSelectToolbar, onLocateOnMap };
}
