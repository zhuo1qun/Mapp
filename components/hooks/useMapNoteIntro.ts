import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Coordinates, Note } from '../../types';
import { generateId } from '../../utils';

const MAP_NOTE_GROW_MS = 320;
const MAP_NOTE_SETTLE_MS = 240;

type UseMapNoteIntroOptions = {
  onToggleEditor: (isOpen: boolean) => void;
  onStageNote: (noteId: string) => void;
};

/**
 * 地图中新建便签的短暂入场阶段：临时图钉、长按预览与编辑器开启时机。
 * 持久化、删除及地图选择结果仍由 MapView 持有，避免把数据写入责任混进动画状态。
 */
export function useMapNoteIntro({ onToggleEditor, onStageNote }: UseMapNoteIntroOptions) {
  const [editingNote, setEditingNote] = useState<Partial<Note> | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editorAutoOpenCamera, setEditorAutoOpenCamera] = useState(false);
  const [introNote, setIntroNote] = useState<Partial<Note> | null>(null);
  const [introNoteMotion, setIntroNoteMotion] = useState<'enter' | 'settle' | 'exit'>();
  const introTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const introStartedAtRef = useRef(0);
  const longPressPreviewNoteRef = useRef<Partial<Note> | null>(null);

  const clearIntroTimer = useCallback(() => {
    if (introTimerRef.current) clearTimeout(introTimerRef.current);
    introTimerRef.current = null;
  }, []);

  useEffect(() => {
    if (!isEditorOpen) setEditorAutoOpenCamera(false);
  }, [isEditorOpen]);

  useEffect(
    () => () => {
      clearIntroTimer();
      longPressPreviewNoteRef.current = null;
    },
    [clearIntroTimer]
  );

  const noteMotionById = useMemo<Readonly<Record<string, 'enter' | 'settle' | 'exit'>> | undefined>(
    () =>
      introNote?.id && introNoteMotion
        ? {
            [introNote.id]: introNoteMotion
          }
        : undefined,
    [introNote?.id, introNoteMotion]
  );

  const beginNewNoteIntro = useCallback(
    (note: Partial<Note>) => {
      clearIntroTimer();
      setEditingNote(note);
      setIntroNote(note);
      setIntroNoteMotion('enter');
      introStartedAtRef.current = Date.now();
    },
    [clearIntroTimer]
  );

  const openNewNoteEditorAfterIntro = useCallback(
    (note: Partial<Note>, elapsedMs = 0) => {
      const remainingGrowMs = Math.max(0, MAP_NOTE_GROW_MS - elapsedMs);
      clearIntroTimer();
      introTimerRef.current = setTimeout(() => {
        setIntroNoteMotion('settle');
        introTimerRef.current = setTimeout(() => {
          introTimerRef.current = null;
          setIsEditorOpen(true);
          onToggleEditor(true);
        }, MAP_NOTE_SETTLE_MS);
      }, remainingGrowMs);
    },
    [clearIntroTimer, onToggleEditor]
  );

  const createNewMapNote = useCallback(
    (coords: Coordinates, overrides?: Partial<Note>): Partial<Note> => ({
      id: generateId(),
      createdAt: Date.now(),
      coords,
      fontSize: 3,
      emoji: '',
      text: '',
      images: [],
      tags: [],
      variant: 'standard',
      isFavorite: false,
      color: '#FFFFFF',
      // Mapping 创建的对象尚未进入 Board；0,0 只是兼容旧数据结构的内部哨兵。
      boardX: 0,
      boardY: 0,
      isInitialPosition: true,
      unplacedOrder: Date.now(),
      ...overrides
    }),
    []
  );

  const stageNewMapNote = useCallback(
    (coords: Coordinates, overrides?: Partial<Note>): Partial<Note> => {
      const note = createNewMapNote(coords, overrides);
      onStageNote(note.id!);
      beginNewNoteIntro(note);
      return note;
    },
    [beginNewNoteIntro, createNewMapNote, onStageNote]
  );

  const stageLongPressNote = useCallback(
    (coords: Coordinates) => {
      const note = stageNewMapNote(coords);
      longPressPreviewNoteRef.current = note;
    },
    [stageNewMapNote]
  );

  const finishLongPressNote = useCallback(() => {
    const note = longPressPreviewNoteRef.current;
    if (!note) return;
    longPressPreviewNoteRef.current = null;
    openNewNoteEditorAfterIntro(note, Date.now() - introStartedAtRef.current);
  }, [openNewNoteEditorAfterIntro]);

  /** 返回要执行离场的临时点 id；视觉离场留给地图图层统一处理。 */
  const cancelLongPressNote = useCallback((): string | null => {
    const noteId = longPressPreviewNoteRef.current?.id ?? null;
    longPressPreviewNoteRef.current = null;
    clearIntroTimer();
    setEditingNote(null);
    return noteId;
  }, [clearIntroTimer]);

  return {
    editingNote,
    setEditingNote,
    isEditorOpen,
    setIsEditorOpen,
    editorAutoOpenCamera,
    setEditorAutoOpenCamera,
    introNote,
    setIntroNote,
    noteMotionById,
    stageNewMapNote,
    openNewNoteEditorAfterIntro,
    stageLongPressNote,
    finishLongPressNote,
    cancelLongPressNote
  };
}
