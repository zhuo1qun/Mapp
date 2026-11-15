import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type L from 'leaflet';
import type { Connection, Note } from '../../types';

type Options = {
  isUIVisible: boolean;
  showTextLabels: boolean;
  connections: Connection[];
  selectedNoteId: string | null;
  selectedNoteIds: Set<string>;
  preSelectedNotes: Note[] | null;
  ignoreNextMarkerClickRef: MutableRefObject<boolean>;
  isMarkerDraggingRef: MutableRefObject<boolean>;
  selectionTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  closePanelsForPreview: () => void;
  sortNotes: (notes: Note[]) => Note[];
  setSelectedNoteId: Dispatch<SetStateAction<string | null>>;
  setSelectedNoteIds: Dispatch<SetStateAction<Set<string>>>;
  setPreSelectedNotes: Dispatch<SetStateAction<Note[] | null>>;
  setConnectionHighlightNoteIds: Dispatch<SetStateAction<string[] | null>>;
};

function stopMarkerEvent(event?: L.LeafletMouseEvent) {
  event?.originalEvent?.stopPropagation();
  event?.originalEvent?.stopImmediatePropagation();
}

function connectedNoteIds(noteIds: Iterable<string>, connections: Connection[]) {
  const relatedIds = new Set<string>();
  for (const id of noteIds) {
    relatedIds.add(id);
    connections.forEach((connection) => {
      if (connection.fromNoteId === id || connection.toNoteId === id) {
        relatedIds.add(connection.fromNoteId);
        relatedIds.add(connection.toNoteId);
      }
    });
  }
  return Array.from(relatedIds);
}

/** Keeps marker click and cluster expansion rules out of the map rendering shell. */
export function useMapMarkerSelection({
  isUIVisible,
  showTextLabels,
  connections,
  selectedNoteId,
  selectedNoteIds,
  preSelectedNotes,
  ignoreNextMarkerClickRef,
  isMarkerDraggingRef,
  selectionTimerRef,
  closePanelsForPreview,
  sortNotes,
  setSelectedNoteId,
  setSelectedNoteIds,
  setPreSelectedNotes,
  setConnectionHighlightNoteIds
}: Options) {
  const clearSelectionTimer = useCallback(() => {
    if (!selectionTimerRef.current) return;
    clearTimeout(selectionTimerRef.current);
    selectionTimerRef.current = null;
  }, [selectionTimerRef]);

  const handleMarkerClick = useCallback(
    (note: Note, event?: L.LeafletMouseEvent) => {
      if (ignoreNextMarkerClickRef.current || isMarkerDraggingRef.current) return;
      stopMarkerEvent(event);

      if (!isUIVisible) {
        clearSelectionTimer();
        setPreSelectedNotes(null);
        if (selectedNoteId === note.id) {
          setSelectedNoteId(null);
          setConnectionHighlightNoteIds(null);
          return;
        }

        closePanelsForPreview();
        setSelectedNoteId(null);
        setConnectionHighlightNoteIds(showTextLabels ? null : connectedNoteIds([note.id], connections));
        selectionTimerRef.current = setTimeout(() => {
          setSelectedNoteId(note.id);
          selectionTimerRef.current = null;
        }, 50);
        return;
      }

      const additive = !!event?.originalEvent?.shiftKey;
      if (
        !additive &&
        selectedNoteId === note.id &&
        selectedNoteIds.size === 1 &&
        selectedNoteIds.has(note.id) &&
        preSelectedNotes == null
      ) {
        return;
      }

      if (!additive) closePanelsForPreview();
      setPreSelectedNotes(null);
      const nextSelectedIds = new Set(selectedNoteIds);
      if (additive) {
        if (nextSelectedIds.has(note.id)) nextSelectedIds.delete(note.id);
        else nextSelectedIds.add(note.id);
      } else {
        nextSelectedIds.clear();
        nextSelectedIds.add(note.id);
      }
      setSelectedNoteIds(nextSelectedIds);
      setSelectedNoteId(
        nextSelectedIds.size === 0
          ? null
          : nextSelectedIds.has(note.id)
            ? note.id
            : Array.from(nextSelectedIds)[0]
      );
      setConnectionHighlightNoteIds(
        showTextLabels ? null : connectedNoteIds(nextSelectedIds, connections)
      );
    },
    [
      clearSelectionTimer,
      closePanelsForPreview,
      connections,
      ignoreNextMarkerClickRef,
      isMarkerDraggingRef,
      isUIVisible,
      preSelectedNotes,
      selectedNoteId,
      selectedNoteIds,
      selectionTimerRef,
      setConnectionHighlightNoteIds,
      setPreSelectedNotes,
      setSelectedNoteId,
      setSelectedNoteIds,
      showTextLabels
    ]
  );

  const handleClusterClick = useCallback(
    (clusterNotes: Note[], event?: L.LeafletMouseEvent) => {
      stopMarkerEvent(event);
      const sortedClusterNotes = sortNotes(clusterNotes);
      if (!isUIVisible) clearSelectionTimer();
      setSelectedNoteId(null);
      setSelectedNoteIds(new Set());
      setPreSelectedNotes(sortedClusterNotes);
    },
    [clearSelectionTimer, isUIVisible, setPreSelectedNotes, setSelectedNoteId, setSelectedNoteIds, sortNotes]
  );

  return { handleMarkerClick, handleClusterClick };
}
