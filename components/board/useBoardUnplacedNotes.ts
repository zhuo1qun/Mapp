import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react';
import type { Note, Project } from '../../types';
import { boardNoteDimensions } from '../../utils/board/boardPlacement';
import { clientPoint, clientToBoardPoint } from '../../utils/board/boardCoordinates';
import { isNoteBoardPlaced, isNoteBoardUnplaced, moveNoteToBoardUnplaced, placeNoteOnBoard } from '../../utils/note/notePlacement';
import { useBoardUnplacedNoteDropHandler } from './BoardUnplacedNoteDropHandler';

interface Props {
  notes: Note[];
  displayNotes: Note[];
  project?: Project;
  onUpdateProject?: (project: Project) => void | Promise<void>;
  onUpdateNote: (note: Note) => void;
  containerRef: RefObject<HTMLDivElement>;
  transform: { x: number; y: number; scale: number };
  enabled: boolean;
  selectedNoteIds: Set<string>;
  setSelectedNoteId: Dispatch<SetStateAction<string | null>>;
  setSelectedNoteIds: Dispatch<SetStateAction<Set<string>>>;
  setMultiBatchPanel: Dispatch<SetStateAction<'none' | 'tag' | 'time'>>;
  deleteNotesWithExit: (noteIds: string[]) => void;
  markBoardNotesEntering: (noteIds: string[]) => void;
}

/** Board-side pending tray transfer state. Map has its own placement axis. */
export function useBoardUnplacedNotes({
  notes, displayNotes, project, onUpdateProject, onUpdateNote, containerRef, transform,
  enabled, selectedNoteIds, setSelectedNoteId, setSelectedNoteIds, setMultiBatchPanel, deleteNotesWithExit,
  markBoardNotesEntering
}: Props) {
  const panelRef = useRef<HTMLElement | null>(null);
  const [isDropTarget, setIsDropTarget] = useState(false);
  const [leavingNoteIds, setLeavingNoteIds] = useState<Set<string>>(() => new Set());
  const unplacedNotes = useMemo(() => displayNotes.filter(isNoteBoardUnplaced), [displayNotes]);

  useEffect(() => {
    setLeavingNoteIds((current) => {
      const next = new Set([...current].filter((id) => notes.some((note) => note.id === id && isNoteBoardPlaced(note))));
      return next.size === current.size ? current : next;
    });
  }, [notes]);

  const placeNotes = useCallback((noteIds: string[], point: { x: number; y: number }) => {
    const ids = new Set(noteIds);
    const targets = notes.filter((note) => ids.has(note.id));
    if (!targets.length) return;
    // 数据从待定箱切回 Board 前先挂进入状态；目标节点首次渲染即从拖拽预览平滑接管。
    markBoardNotesEntering(targets.map((note) => note.id));
    const nextNotes = notes.map((note) => {
      const index = targets.findIndex((target) => target.id === note.id);
      if (index === -1) return note;
      const { width, height } = boardNoteDimensions(note);
      const offset = index * 28;
      return placeNoteOnBoard(note, { x: point.x - width / 2 + offset, y: point.y - height / 2 + offset });
    });
    if (onUpdateProject && project) void onUpdateProject({ ...project, notes: nextNotes });
    else nextNotes.filter((note) => ids.has(note.id)).forEach(onUpdateNote);
    setSelectedNoteId(targets[0].id);
    setSelectedNoteIds(new Set(targets.map((note) => note.id)));
  }, [markBoardNotesEntering, notes, onUpdateNote, onUpdateProject, project, setSelectedNoteId, setSelectedNoteIds]);

  const onDropNotes = useCallback((noteIds: string[], pointer: { clientX: number; clientY: number }) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    placeNotes(noteIds, clientToBoardPoint(clientPoint(pointer.clientX, pointer.clientY), rect, transform));
  }, [containerRef, placeNotes, transform]);

  const isOverPanel = useCallback((pointer: { clientX: number; clientY: number }) => {
    const rect = panelRef.current?.getBoundingClientRect();
    return !!rect && pointer.clientX >= rect.left && pointer.clientX <= rect.right && pointer.clientY >= rect.top && pointer.clientY <= rect.bottom;
  }, []);

  useBoardUnplacedNoteDropHandler({ canvasRef: containerRef, enabled, onDropNotes, isIgnoredDropTarget: isOverPanel });

  const moveNotesToUnplaced = useCallback((noteIds: string[]) => {
    const ids = new Set(noteIds);
    const targets = notes.filter((note) => ids.has(note.id));
    if (!targets.length) return;
    setLeavingNoteIds((current) => new Set([...current, ...ids]));
    const nextNotes = notes.map((note) => ids.has(note.id) ? moveNoteToBoardUnplaced(note, Date.now()) : note);
    if (onUpdateProject && project) void onUpdateProject({ ...project, notes: nextNotes });
    else nextNotes.filter((note) => ids.has(note.id)).forEach(onUpdateNote);
    setSelectedNoteId(null);
    setSelectedNoteIds(new Set());
    setMultiBatchPanel('none');
    setIsDropTarget(false);
  }, [notes, onUpdateNote, onUpdateProject, project, setMultiBatchPanel, setSelectedNoteId, setSelectedNoteIds]);

  const onDragPointerMove = useCallback((_note: Note, pointer: { clientX: number; clientY: number }) => {
    setIsDropTarget(isOverPanel(pointer));
  }, [isOverPanel]);
  const onDropToPanel = useCallback((note: Note, pointer: { clientX: number; clientY: number }) => {
    const accepted = isOverPanel(pointer);
    setIsDropTarget(false);
    if (!accepted) return false;
    moveNotesToUnplaced(selectedNoteIds.has(note.id) ? [...selectedNoteIds] : [note.id]);
    return true;
  }, [isOverPanel, moveNotesToUnplaced, selectedNoteIds]);
  const deleteUnplacedNotes = useCallback((noteIds: string[]) => {
    const ids = noteIds.filter((id) => notes.some((note) => note.id === id));
    if (!ids.length) return;
    if (!window.confirm(ids.length === 1 ? '永久删除这个待投放记录吗？' : `永久删除这 ${ids.length} 个待投放记录吗？`)) return;
    deleteNotesWithExit(ids);
  }, [deleteNotesWithExit, notes]);

  return { panelRef, isDropTarget, leavingNoteIds, unplacedNotes, deleteUnplacedNotes, onDragPointerMove, onDropToPanel };
}
