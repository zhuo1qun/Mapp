import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type L from 'leaflet';
import type { Coordinates, Note } from '../../types';

type PointerPosition = { clientX: number; clientY: number };

type Options = {
  canModifyNote: (note: Note) => boolean;
  denyEdit: (note: Note) => void;
  onUpdateNote: (note: Note) => void;
  moveMapNotesToUnplaced: (noteIds: string[]) => void;
  draggedNoteIdsFor: (note: Note) => string[];
  updateUnplacedSidebarDropTarget: (note: Note, pointer?: Partial<PointerPosition>) => boolean;
  closeMapChromeExcept: () => void;
  onWorkspaceEditModeChange: (edit: boolean) => void;
  isMarkerDraggingRef: MutableRefObject<boolean>;
  ignoreNextMarkerClickRef: MutableRefObject<boolean>;
  lastMarkerDragPointerRef: MutableRefObject<PointerPosition | null>;
  setNoteCoordOverrides: Dispatch<SetStateAction<Record<string, Coordinates>>>;
  setIsUnplacedSidebarDropTarget: Dispatch<SetStateAction<boolean>>;
  setUnplacedSidebarDropCount: Dispatch<SetStateAction<number>>;
  setPreSelectedNotes: Dispatch<SetStateAction<Note[] | null>>;
  setSelectedNoteIds: Dispatch<SetStateAction<Set<string>>>;
  setSelectedNoteId: Dispatch<SetStateAction<string | null>>;
};

/** Owns only marker drag lifecycle; selection and clustering remain separate. */
export function useMapMarkerDrag({
  canModifyNote,
  denyEdit,
  onUpdateNote,
  moveMapNotesToUnplaced,
  draggedNoteIdsFor,
  updateUnplacedSidebarDropTarget,
  closeMapChromeExcept,
  onWorkspaceEditModeChange,
  isMarkerDraggingRef,
  ignoreNextMarkerClickRef,
  lastMarkerDragPointerRef,
  setNoteCoordOverrides,
  setIsUnplacedSidebarDropTarget,
  setUnplacedSidebarDropCount,
  setPreSelectedNotes,
  setSelectedNoteIds,
  setSelectedNoteId
}: Options) {
  const setCoordinateOverride = useCallback(
    (note: Note, latLng: L.LatLng) => {
      setNoteCoordOverrides((current) => ({
        ...current,
        [note.id]: { lat: latLng.lat, lng: latLng.lng }
      }));
    },
    [setNoteCoordOverrides]
  );

  const suppressNextMarkerClick = useCallback(() => {
    ignoreNextMarkerClickRef.current = true;
    window.setTimeout(() => {
      ignoreNextMarkerClickRef.current = false;
    }, 0);
  }, [ignoreNextMarkerClickRef]);

  const completeMarkerDrag = useCallback(
    (note: Note, latLng: L.LatLng, pointer?: Partial<PointerPosition>) => {
      const isDropTarget = updateUnplacedSidebarDropTarget(note, pointer);
      lastMarkerDragPointerRef.current = null;
      setIsUnplacedSidebarDropTarget(false);
      setUnplacedSidebarDropCount(0);

      if (isDropTarget) {
        isMarkerDraggingRef.current = false;
        suppressNextMarkerClick();
        moveMapNotesToUnplaced(draggedNoteIdsFor(note));
        return;
      }

      setCoordinateOverride(note, latLng);
      isMarkerDraggingRef.current = false;
      suppressNextMarkerClick();
      onUpdateNote({ ...note, coords: { lat: latLng.lat, lng: latLng.lng } });
    },
    [
      draggedNoteIdsFor,
      isMarkerDraggingRef,
      lastMarkerDragPointerRef,
      moveMapNotesToUnplaced,
      onUpdateNote,
      setCoordinateOverride,
      setUnplacedSidebarDropCount,
      setIsUnplacedSidebarDropTarget,
      suppressNextMarkerClick,
      updateUnplacedSidebarDropTarget
    ]
  );

  const handleMarkerDrag = useCallback(
    (note: Note, event: unknown) => {
      const marker = (event as { target?: L.Marker }).target;
      const latLng = marker?.getLatLng?.();
      if (!latLng) return;

      isMarkerDraggingRef.current = true;
      const pointer = (event as { originalEvent?: Partial<PointerPosition> }).originalEvent;
      if (typeof pointer?.clientX === 'number' && typeof pointer.clientY === 'number') {
        lastMarkerDragPointerRef.current = { clientX: pointer.clientX, clientY: pointer.clientY };
      }
      updateUnplacedSidebarDropTarget(note, lastMarkerDragPointerRef.current ?? undefined);
      setCoordinateOverride(note, latLng);
    },
    [
      isMarkerDraggingRef,
      lastMarkerDragPointerRef,
      setCoordinateOverride,
      updateUnplacedSidebarDropTarget
    ]
  );

  const handleMarkerDragEnd = useCallback(
    (note: Note, event: L.DragEndEvent) => {
      if (!canModifyNote(note)) {
        denyEdit(note);
        return;
      }
      const latLng = (event.target as L.Marker).getLatLng();
      if (!latLng) return;
      completeMarkerDrag(note, latLng, lastMarkerDragPointerRef.current ?? undefined);
    },
    [canModifyNote, completeMarkerDrag, denyEdit, lastMarkerDragPointerRef]
  );

  const handleMarkerLongPressDragStart = useCallback(
    (note: Note) => {
      if (!canModifyNote(note)) {
        denyEdit(note);
        return;
      }
      isMarkerDraggingRef.current = true;
      lastMarkerDragPointerRef.current = null;
      setPreSelectedNotes(null);
      setSelectedNoteIds((current) => (current.has(note.id) ? current : new Set([note.id])));
      setSelectedNoteId(note.id);
      closeMapChromeExcept();
      onWorkspaceEditModeChange(true);
    },
    [
      canModifyNote,
      closeMapChromeExcept,
      denyEdit,
      isMarkerDraggingRef,
      lastMarkerDragPointerRef,
      onWorkspaceEditModeChange,
      setPreSelectedNotes,
      setSelectedNoteId,
      setSelectedNoteIds
    ]
  );

  const handleMarkerLongPressDrag = useCallback(
    (note: Note, latLng: L.LatLng, pointer: PointerPosition) => {
      isMarkerDraggingRef.current = true;
      lastMarkerDragPointerRef.current = pointer;
      updateUnplacedSidebarDropTarget(note, pointer);
      setCoordinateOverride(note, latLng);
    },
    [
      isMarkerDraggingRef,
      lastMarkerDragPointerRef,
      setCoordinateOverride,
      updateUnplacedSidebarDropTarget
    ]
  );

  const handleMarkerLongPressDragEnd = useCallback(
    (note: Note, latLng: L.LatLng, pointer: PointerPosition) => {
      if (!canModifyNote(note)) {
        denyEdit(note);
        return;
      }
      completeMarkerDrag(note, latLng, pointer);
    },
    [canModifyNote, completeMarkerDrag, denyEdit]
  );

  return {
    handleMarkerDrag,
    handleMarkerDragEnd,
    handleMarkerLongPressDragStart,
    handleMarkerLongPressDrag,
    handleMarkerLongPressDragEnd
  };
}
