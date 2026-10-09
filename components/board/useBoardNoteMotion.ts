import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { Note } from '../../types';

const BOARD_NOTE_INTRO_MS = 280;
const BOARD_NOTE_EXIT_MS = 220;

interface UseBoardNoteMotionProps {
  notes: Note[];
  displayNotes: Note[];
  onAddNote?: (note: Note) => void;
  onDeleteNote?: (noteId: string) => void;
  onDeleteNotesBatch?: (noteIds: string[]) => void;
  onToggleEditor: (isOpen: boolean) => void;
  onBeginIntro?: () => void;
  setSelectedNoteId: Dispatch<SetStateAction<string | null>>;
  setSelectedNoteIds: Dispatch<SetStateAction<Set<string>>>;
}

/**
 * Owns the short-lived card states around creation, deletion and editor entry.
 * Persisted note data remains in BoardView; this hook only coordinates the UI
 * overlap that prevents cards from flashing while the editor opens or closes.
 */
export function useBoardNoteMotion({
  notes,
  displayNotes,
  onAddNote,
  onDeleteNote,
  onDeleteNotesBatch,
  onToggleEditor,
  onBeginIntro,
  setSelectedNoteId,
  setSelectedNoteIds
}: UseBoardNoteMotionProps) {
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [introNote, setIntroNote] = useState<Note | null>(null);
  const [isIntroPending, setIsIntroPending] = useState(false);
  const [introNoteMotion, setIntroNoteMotion] = useState<'enter' | 'exit'>('enter');
  const [enteringNoteIds, setEnteringNoteIds] = useState<Set<string>>(() => new Set());
  const [deletingNoteIds, setDeletingNoteIds] = useState<Set<string>>(() => new Set());
  const introTimerRef = useRef<number | null>(null);
  const introStartedAtRef = useRef(0);
  const noteMotionTimersRef = useRef<Set<number>>(new Set());
  const deletingNoteIdsRef = useRef<Set<string>>(new Set());

  const boardDisplayNotes = useMemo(() => {
    if (!introNote) return displayNotes;
    return [...displayNotes.filter((note) => note.id !== introNote.id), introNote];
  }, [displayNotes, introNote]);

  const markBoardNoteEntering = useCallback((noteId: string) => {
    setEnteringNoteIds((current) => new Set(current).add(noteId));
    const timer = window.setTimeout(() => {
      noteMotionTimersRef.current.delete(timer);
      setEnteringNoteIds((current) => {
        if (!current.has(noteId)) return current;
        const next = new Set(current);
        next.delete(noteId);
        return next;
      });
    }, BOARD_NOTE_INTRO_MS);
    noteMotionTimersRef.current.add(timer);
  }, []);

  const addBoardNoteWithEnter = useCallback((note: Note) => {
    markBoardNoteEntering(note.id);
    onAddNote?.(note);
  }, [markBoardNoteEntering, onAddNote]);

  const beginNewBoardNoteIntro = useCallback((note: Note) => {
    if (introTimerRef.current !== null) window.clearTimeout(introTimerRef.current);
    onBeginIntro?.();
    setIntroNote(note);
    setIsIntroPending(true);
    setIntroNoteMotion('enter');
    markBoardNoteEntering(note.id);
    setEditingNote(note);
    introStartedAtRef.current = Date.now();
  }, [markBoardNoteEntering, onBeginIntro]);

  const openNewBoardNoteEditorAfterIntro = useCallback((elapsedMs = 0) => {
    if (introTimerRef.current !== null) window.clearTimeout(introTimerRef.current);
    const remainingIntroMs = Math.max(120, BOARD_NOTE_INTRO_MS - elapsedMs);
    introTimerRef.current = window.setTimeout(() => {
      introTimerRef.current = null;
      setIsIntroPending(false);
      onToggleEditor(true);
    }, remainingIntroMs);
  }, [onToggleEditor]);

  const deleteBoardNotesWithExit = useCallback((noteIds: string[]) => {
    const ids = [...new Set(noteIds)].filter((id) => !deletingNoteIdsRef.current.has(id));
    if (ids.length === 0 || (!onDeleteNote && !onDeleteNotesBatch)) return;
    const idsToDelete = ids.filter((id) => id !== introNote?.id || notes.some((note) => note.id === id));
    if (idsToDelete.length === 0) return;

    idsToDelete.forEach((id) => deletingNoteIdsRef.current.add(id));
    setDeletingNoteIds((current) => new Set([...current, ...idsToDelete]));
    setSelectedNoteIds((current) => {
      const next = new Set(current);
      idsToDelete.forEach((id) => next.delete(id));
      return next;
    });
    setSelectedNoteId((current) => (current && idsToDelete.includes(current) ? null : current));

    const timer = window.setTimeout(() => {
      noteMotionTimersRef.current.delete(timer);
      const removeExitState = () => {
        idsToDelete.forEach((id) => deletingNoteIdsRef.current.delete(id));
        setDeletingNoteIds((current) => {
          const next = new Set(current);
          idsToDelete.forEach((id) => next.delete(id));
          return next;
        });
        setIntroNote((current) => (current && idsToDelete.includes(current.id) ? null : current));
      };
      if (idsToDelete.length > 1 && onDeleteNotesBatch) {
        Promise.resolve(onDeleteNotesBatch(idsToDelete)).finally(removeExitState);
      } else {
        Promise.all(idsToDelete.map((id) => Promise.resolve(onDeleteNote?.(id)))).finally(removeExitState);
      }
    }, BOARD_NOTE_EXIT_MS);
    noteMotionTimersRef.current.add(timer);
  }, [introNote?.id, notes, onDeleteNote, onDeleteNotesBatch, setSelectedNoteId, setSelectedNoteIds]);

  useEffect(() => () => {
    if (introTimerRef.current !== null) window.clearTimeout(introTimerRef.current);
    noteMotionTimersRef.current.forEach((timer) => window.clearTimeout(timer));
  }, []);

  return {
    editingNote,
    setEditingNote,
    introNote,
    setIntroNote,
    isIntroPending,
    setIsIntroPending,
    introNoteMotion,
    setIntroNoteMotion,
    enteringNoteIds,
    deletingNoteIds,
    introTimerRef,
    introStartedAtRef,
    boardDisplayNotes,
    addBoardNoteWithEnter,
    beginNewBoardNoteIntro,
    openNewBoardNoteEditorAfterIntro,
    deleteBoardNotesWithExit
  };
}
