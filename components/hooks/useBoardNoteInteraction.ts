import { useCallback, useRef } from 'react';
import type { Note } from '../../types';

const CLICK_DEFER_MS = 300;

export interface UseBoardNoteInteractionArgs {
  workspaceEditMode: boolean;
  isZoomingRef: React.MutableRefObject<boolean>;
  isShiftPressed: boolean;
  notes: Note[];
  setSelectedNoteId: (id: string | null) => void;
  setSelectedNoteIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setSelectedConnectionId: (id: string | null) => void;
  setSelectedFrameId: (id: string | null) => void;
  onOpenNoteEditor: (note: Note) => void;
}

/**
 * Board 便签 click / double-click：与 pointer 拖动分离。
 * 浏览态单击开编辑器；编辑态单击选中（延迟以让出双击），双击开编辑器。
 */
export function useBoardNoteInteraction({
  workspaceEditMode,
  isZoomingRef,
  isShiftPressed,
  notes,
  setSelectedNoteId,
  setSelectedNoteIds,
  setSelectedConnectionId,
  setSelectedFrameId,
  onOpenNoteEditor
}: UseBoardNoteInteractionArgs) {
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastClickNoteIdRef = useRef<string | null>(null);
  const lastClickTimeRef = useRef(0);

  const clearDeferredClick = useCallback(() => {
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
  }, []);

  const applyEditModeSelection = useCallback(
    (noteId: string, shift: boolean) => {
      if (shift) {
        setSelectedNoteIds((prev) => {
          const next = new Set(prev);
          if (next.has(noteId)) {
            next.delete(noteId);
            if (next.size === 0) setSelectedNoteId(null);
            else setSelectedNoteId(Array.from(next)[0]);
          } else {
            next.add(noteId);
            setSelectedNoteId(noteId);
          }
          return next;
        });
        setSelectedConnectionId(null);
      } else {
        setSelectedNoteId(noteId);
        setSelectedNoteIds(new Set([noteId]));
        setSelectedConnectionId(null);
        setSelectedFrameId(null);
      }
    },
    [
      setSelectedNoteId,
      setSelectedNoteIds,
      setSelectedConnectionId,
      setSelectedFrameId
    ]
  );

  const handleNoteClick = useCallback(
    (e: React.MouseEvent, note: Note) => {
      e.stopPropagation();
      if (isZoomingRef.current) return;

      const latestNote = notes.find((n) => n.id === note.id) || note;

      if (latestNote.noteGroupId && !isShiftPressed && !e.shiftKey) {
        const groupMemberIds = new Set(
          notes.filter((n) => n.noteGroupId === latestNote.noteGroupId).map((n) => n.id)
        );
        setSelectedNoteIds(groupMemberIds);
        setSelectedNoteId(note.id);
        return;
      }

      if (!workspaceEditMode) {
        if (isShiftPressed || e.shiftKey) {
          setSelectedNoteIds((prev) => {
            const next = new Set(prev);
            if (next.has(note.id)) {
              next.delete(note.id);
              if (next.size === 0) setSelectedNoteId(null);
              else setSelectedNoteId(Array.from(next)[0]);
            } else {
              next.add(note.id);
              setSelectedNoteId(note.id);
            }
            return next;
          });
          return;
        }
        onOpenNoteEditor(latestNote);
        return;
      }

      const now = Date.now();
      const shift = isShiftPressed || e.shiftKey;
      clearDeferredClick();
      clickTimerRef.current = setTimeout(() => {
        applyEditModeSelection(note.id, shift);
      }, CLICK_DEFER_MS);
      lastClickNoteIdRef.current = note.id;
      lastClickTimeRef.current = now;
    },
    [
      isZoomingRef,
      notes,
      isShiftPressed,
      workspaceEditMode,
      setSelectedNoteIds,
      setSelectedNoteId,
      onOpenNoteEditor,
      clearDeferredClick,
      applyEditModeSelection
    ]
  );

  const handleNoteDoubleClick = useCallback(
    (e: React.MouseEvent, note: Note) => {
      e.stopPropagation();
      if (isZoomingRef.current) return;
      clearDeferredClick();
      if (!workspaceEditMode) return;
      const latestNote = notes.find((n) => n.id === note.id) || note;
      onOpenNoteEditor(latestNote);
    },
    [isZoomingRef, clearDeferredClick, workspaceEditMode, notes, onOpenNoteEditor]
  );

  return {
    handleNoteClick,
    handleNoteDoubleClick,
    clearDeferredClick
  };
}
