import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Frame, Note } from '../../types';
import { applyBoardDragOffsetToNotes, noteWithBoardDragCommit } from '../../utils/board/boardNoteDrag';

const BROWSE_CANCEL_MOVE_PX = 20;
const BROWSE_OPEN_EDITOR_MAX_MOVE_PX = 15;
const EDIT_DRAG_COMMIT_MOVE_PX = 15;
const SETTLE_FALLBACK_MS = 500;
const LONG_PRESS_MS = 420;
const LONG_PRESS_CANCEL_MOVE_PX = 10;

type PendingSettle =
  | { kind: 'single'; id: string; boardX: number; boardY: number }
  | { kind: 'multi'; expected: Map<string, { boardX: number; boardY: number }> };

function noteMatches(n: Note | undefined, boardX: number, boardY: number): boolean {
  return !!n && n.boardX === boardX && n.boardY === boardY;
}

export interface UseBoardNoteDragArgs {
  workspaceEditMode: boolean;
  /** 与画布 pinch 共用，避免 hook 声明顺序被 isZooming state 卡住 */
  isZoomingRef: React.MutableRefObject<boolean>;
  transformScale: number;
  /** 项目态 notes（写回用，勿传 displayNotes） */
  notes: Note[];
  frames: Frame[];
  selectedNoteIds: Set<string>;
  isSelectingNotePosition: boolean;
  isShiftPressed: boolean;
  setIsSelectingNotePosition: (v: boolean) => void;
  onUpdateNote: (note: Note) => void;
  /** 多选拖结束批量写回 */
  commitProjectNotes: (nextNotes: Note[]) => void;
  stopAnimations: () => void;
  cacheDragRect?: () => void;
  onBrowseOpenEditor: (note: Note) => void;
  /** 浏览态长按：切入编辑模式，但保留当前画布视图。 */
  onBrowseLongPressStartEdit: (note: Note) => void;
}

/**
 * Board 便签拖动：编辑态单选/多选位移 + Frame 归属写回；
 * 浏览态只做按下跟踪，短按打开编辑器（与 click 路径配合）。
 *
 * 松手后保留 dragOffset 直到 notes 写回生效（useLayoutEffect），避免「回弹再跳到目标」。
 */
export function useBoardNoteDrag({
  workspaceEditMode,
  isZoomingRef,
  transformScale,
  notes,
  frames,
  selectedNoteIds,
  isSelectingNotePosition,
  isShiftPressed,
  setIsSelectingNotePosition,
  onUpdateNote,
  commitProjectNotes,
  stopAnimations,
  cacheDragRect,
  onBrowseOpenEditor,
  onBrowseLongPressStartEdit
}: UseBoardNoteDragArgs) {
  const [draggingNoteId, setDraggingNoteId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isMultiSelectDragging, setIsMultiSelectDragging] = useState(false);
  const [multiSelectDragOffset, setMultiSelectDragOffset] = useState({ x: 0, y: 0 });

  const dragPointerPosRef = useRef<{ x: number; y: number } | null>(null);
  const notePressStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const currentNotePressIdRef = useRef<string | null>(null);
  const pendingSettleRef = useRef<PendingSettle | null>(null);
  const settleFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressNoteIdRef = useRef<string | null>(null);
  const longPressPointerIdRef = useRef<number | null>(null);
  const longPressElementRef = useRef<HTMLElement | null>(null);
  const promotedTouchDragNoteIdRef = useRef<string | null>(null);
  const suppressNextClickNoteIdRef = useRef<string | null>(null);

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressNoteIdRef.current = null;
    longPressPointerIdRef.current = null;
    longPressElementRef.current = null;
  }, []);

  const clearNotePressTracking = useCallback(() => {
    currentNotePressIdRef.current = null;
    notePressStartPosRef.current = null;
    dragPointerPosRef.current = null;
  }, []);

  const resetDragVisual = useCallback(() => {
    setDraggingNoteId(null);
    setDragOffset({ x: 0, y: 0 });
    setIsMultiSelectDragging(false);
    setMultiSelectDragOffset({ x: 0, y: 0 });
    dragPointerPosRef.current = null;
  }, []);

  const cancelBrowseLongPress = useCallback(() => {
    clearLongPressTimer();
    if (promotedTouchDragNoteIdRef.current) {
      promotedTouchDragNoteIdRef.current = null;
      resetDragVisual();
    }
  }, [clearLongPressTimer, resetDragVisual]);

  useEffect(() => cancelBrowseLongPress, [cancelBrowseLongPress]);

  const clearSettleFallback = useCallback(() => {
    if (settleFallbackTimerRef.current) {
      clearTimeout(settleFallbackTimerRef.current);
      settleFallbackTimerRef.current = null;
    }
  }, []);

  const armSettleFallback = useCallback(() => {
    clearSettleFallback();
    settleFallbackTimerRef.current = setTimeout(() => {
      pendingSettleRef.current = null;
      resetDragVisual();
      settleFallbackTimerRef.current = null;
    }, SETTLE_FALLBACK_MS);
  }, [clearSettleFallback, resetDragVisual]);

  const pendingMatched = useCallback(
    (list: Note[], pending: PendingSettle): boolean => {
      if (pending.kind === 'single') {
        return noteMatches(
          list.find((n) => n.id === pending.id),
          pending.boardX,
          pending.boardY
        );
      }
      for (const [id, pos] of pending.expected) {
        if (!noteMatches(list.find((n) => n.id === id), pos.boardX, pos.boardY)) {
          return false;
        }
      }
      return true;
    },
    []
  );

  // notes 写回后、绘制前清掉偏移，避免回弹或双重偏移闪一帧
  useLayoutEffect(() => {
    const pending = pendingSettleRef.current;
    if (!pending) return;
    if (!pendingMatched(notes, pending)) return;
    pendingSettleRef.current = null;
    clearSettleFallback();
    resetDragVisual();
  }, [notes, pendingMatched, clearSettleFallback, resetDragVisual]);

  const handleNotePointerDown = useCallback(
    (e: React.PointerEvent, noteId: string, note: Note) => {
      stopAnimations();
      cacheDragRect?.();

      if (isZoomingRef.current) return;

      // 新拖动开始时丢弃未 settle 的状态
      pendingSettleRef.current = null;
      clearSettleFallback();

      if (isSelectingNotePosition) {
        setIsSelectingNotePosition(false);
        e.stopPropagation();
        return;
      }

      if (!workspaceEditMode) {
        e.preventDefault();
        e.stopPropagation();
        clearLongPressTimer();
        promotedTouchDragNoteIdRef.current = null;
        currentNotePressIdRef.current = noteId;
        dragPointerPosRef.current = { x: e.clientX, y: e.clientY };
        notePressStartPosRef.current = { x: e.clientX, y: e.clientY };

        // 长按统一支持触屏、鼠标和模拟器；普通单击仍维持原有打开卡片行为。
        if (e.isPrimary && e.button === 0) {
          const element = e.currentTarget as HTMLElement;
          const pointerId = e.pointerId;
          longPressNoteIdRef.current = noteId;
          longPressPointerIdRef.current = pointerId;
          longPressElementRef.current = element;
          longPressTimerRef.current = setTimeout(() => {
            if (longPressNoteIdRef.current !== noteId || isZoomingRef.current) return;
            longPressTimerRef.current = null;
            longPressNoteIdRef.current = null;
            promotedTouchDragNoteIdRef.current = noteId;
            suppressNextClickNoteIdRef.current = noteId;
            setDraggingNoteId(noteId);
            setDragOffset({ x: 0, y: 0 });
            try {
              longPressElementRef.current?.setPointerCapture(longPressPointerIdRef.current ?? pointerId);
            } catch {
              /* pointer may already have ended */
            }
            onBrowseLongPressStartEdit(note);
          }, LONG_PRESS_MS);
        }
        return;
      }

      e.stopPropagation();
      e.preventDefault();

      if (selectedNoteIds.has(noteId) && selectedNoteIds.size > 1) {
        setIsMultiSelectDragging(true);
        setMultiSelectDragOffset({ x: 0, y: 0 });
        setDraggingNoteId(null);
        setDragOffset({ x: 0, y: 0 });
      } else {
        setIsMultiSelectDragging(false);
        setMultiSelectDragOffset({ x: 0, y: 0 });
        setDraggingNoteId(noteId);
        setDragOffset({ x: 0, y: 0 });
      }
      dragPointerPosRef.current = { x: e.clientX, y: e.clientY };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [
      stopAnimations,
      cacheDragRect,
      isZoomingRef,
      isSelectingNotePosition,
      setIsSelectingNotePosition,
      workspaceEditMode,
      selectedNoteIds,
      clearSettleFallback,
      clearLongPressTimer,
      onBrowseLongPressStartEdit
    ]
  );

  const handleNotePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (isZoomingRef.current) return;
      // settle 等待中不再累加偏移
      if (pendingSettleRef.current) return;

      const isPromotedTouchDrag = promotedTouchDragNoteIdRef.current !== null;
      const isEditingDrag = workspaceEditMode || isPromotedTouchDrag;

      if (!isEditingDrag) {
        if (dragPointerPosRef.current && notePressStartPosRef.current) {
          const dx = e.clientX - notePressStartPosRef.current.x;
          const dy = e.clientY - notePressStartPosRef.current.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > BROWSE_CANCEL_MOVE_PX) {
            clearLongPressTimer();
            clearNotePressTracking();
          } else {
            if (dist > LONG_PRESS_CANCEL_MOVE_PX) clearLongPressTimer();
            dragPointerPosRef.current = { x: e.clientX, y: e.clientY };
          }
        }
        return;
      }

      if (!dragPointerPosRef.current) return;

      const dx = e.clientX - dragPointerPosRef.current.x;
      const dy = e.clientY - dragPointerPosRef.current.y;
      const worldDx = dx / transformScale;
      const worldDy = dy / transformScale;
      dragPointerPosRef.current = { x: e.clientX, y: e.clientY };

      if (isMultiSelectDragging) {
        e.stopPropagation();
        e.preventDefault();
        setMultiSelectDragOffset((prev) => ({ x: prev.x + worldDx, y: prev.y + worldDy }));
        return;
      }

      if (!draggingNoteId) return;
      e.stopPropagation();
      e.preventDefault();
      setDragOffset((prev) => ({ x: prev.x + worldDx, y: prev.y + worldDy }));
    },
    [
      isZoomingRef,
      workspaceEditMode,
      transformScale,
      isMultiSelectDragging,
      draggingNoteId,
      clearNotePressTracking,
      clearLongPressTimer
    ]
  );

  const handleNotePointerUp = useCallback(
    (e: React.PointerEvent, note: Note) => {
      clearLongPressTimer();
      const isPromotedTouchDrag = promotedTouchDragNoteIdRef.current === note.id;
      const isEditingDrag = workspaceEditMode || isPromotedTouchDrag;

      if (isMultiSelectDragging && !isZoomingRef.current && isEditingDrag) {
        e.stopPropagation();
        try {
          (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        } catch {
          /* already released */
        }

        dragPointerPosRef.current = null;
        clearNotePressTracking();

        if (multiSelectDragOffset.x === 0 && multiSelectDragOffset.y === 0) {
          resetDragVisual();
          return;
        }

        const { notes: updated, changed } = applyBoardDragOffsetToNotes(
          notes,
          selectedNoteIds,
          multiSelectDragOffset,
          frames
        );
        if (!changed) {
          resetDragVisual();
          return;
        }

        const expected = new Map<string, { boardX: number; boardY: number }>();
        for (const id of selectedNoteIds) {
          const u = updated.find((n) => n.id === id);
          if (u) expected.set(id, { boardX: u.boardX, boardY: u.boardY });
        }
        pendingSettleRef.current = { kind: 'multi', expected };
        commitProjectNotes(updated);
        armSettleFallback();
        promotedTouchDragNoteIdRef.current = null;
        // 保留 multiSelectDragOffset / isMultiSelectDragging 直到 notes 对齐
        return;
      }

      let movedDistance = 0;
      if (notePressStartPosRef.current) {
        const dx = e.clientX - notePressStartPosRef.current.x;
        const dy = e.clientY - notePressStartPosRef.current.y;
        movedDistance = Math.sqrt(dx * dx + dy * dy);
      }
      const hasMoved = dragOffset.x !== 0 || dragOffset.y !== 0;
      const hasMovedEnough = movedDistance > EDIT_DRAG_COMMIT_MOVE_PX;

      if (draggingNoteId === note.id && !isZoomingRef.current && isEditingDrag) {
        if (hasMoved || hasMovedEnough) {
          e.stopPropagation();
          try {
            (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
          } catch {
            /* already released */
          }

          dragPointerPosRef.current = null;
          clearNotePressTracking();

          if (dragOffset.x === 0 && dragOffset.y === 0) {
            resetDragVisual();
            return;
          }

          const sourceNote = notes.find((n) => n.id === note.id) || note;
          const committed = noteWithBoardDragCommit(
            sourceNote,
            sourceNote.boardX + dragOffset.x,
            sourceNote.boardY + dragOffset.y,
            frames
          );
          pendingSettleRef.current = {
            kind: 'single',
            id: committed.id,
            boardX: committed.boardX,
            boardY: committed.boardY
          };
          onUpdateNote(committed);
          armSettleFallback();
          promotedTouchDragNoteIdRef.current = null;
          // 保留 draggingNoteId + dragOffset 直到 notes 对齐
          return;
        }
        resetDragVisual();
      }

      if (!isEditingDrag) {
        const wasOnSameNote = currentNotePressIdRef.current === note.id;
        const isShortClick =
          wasOnSameNote &&
          movedDistance < BROWSE_OPEN_EDITOR_MAX_MOVE_PX &&
          !e.shiftKey &&
          !isShiftPressed;

        if (isShortClick) {
          e.stopPropagation();
          e.preventDefault();
          const latestNote = notes.find((n) => n.id === note.id) || note;
          onBrowseOpenEditor(latestNote);
          clearNotePressTracking();
          return;
        }
      }

      if (isPromotedTouchDrag) {
        promotedTouchDragNoteIdRef.current = null;
      }
      clearNotePressTracking();
    },
    [
      isMultiSelectDragging,
      isZoomingRef,
      workspaceEditMode,
      multiSelectDragOffset,
      notes,
      selectedNoteIds,
      frames,
      commitProjectNotes,
      dragOffset,
      draggingNoteId,
      onUpdateNote,
      resetDragVisual,
      clearNotePressTracking,
      isShiftPressed,
      onBrowseOpenEditor,
      armSettleFallback,
      clearLongPressTimer
    ]
  );

  const handleNotePointerCancel = useCallback(() => {
    cancelBrowseLongPress();
    clearNotePressTracking();
  }, [cancelBrowseLongPress, clearNotePressTracking]);

  return {
    draggingNoteId,
    dragOffset,
    isMultiSelectDragging,
    multiSelectDragOffset,
    handleNotePointerDown,
    handleNotePointerMove,
    handleNotePointerUp,
    handleNotePointerCancel,
    cancelBrowseLongPress,
    consumeSuppressedNoteClick: (noteId: string) => {
      if (suppressNextClickNoteIdRef.current !== noteId) return false;
      suppressNextClickNoteIdRef.current = null;
      return true;
    },
    clearNotePressTracking,
    currentNotePressIdRef
  };
}
