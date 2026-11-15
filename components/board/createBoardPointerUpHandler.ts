import type { Dispatch, MutableRefObject, PointerEvent as ReactPointerEvent, RefObject, SetStateAction } from 'react';
import type { Frame, Note } from '../../types';
import type { BoardInteractionState } from '../hooks/useBoardInteractionMachine';
import type { BoardPoint, BoardTransform } from '../../utils/board/boardCoordinates';
import { clientPoint, clientToBoardPoint } from '../../utils/board/boardCoordinates';
import { applySelectionScaleToNotes, type SelectionNotePose } from '../../utils/board/boardSelectionScale';
import { generateId } from '../../utils';

type ImagePreview = { id: string; x: number; y: number; width: number; height: number };
type FramePreview = { x: number; y: number; width: number; height: number };
type NotePositionPreview = { boardX: number; boardY: number };

export function createBoardPointerUpHandler(options: {
  containerRef: RefObject<HTMLElement>;
  dragRectRef: MutableRefObject<DOMRect | null>;
  transform: BoardTransform;
  transformRef: MutableRefObject<BoardTransform>;
  interactionRef: MutableRefObject<BoardInteractionState>;
  boardLongPressTriggeredRef: MutableRefObject<boolean>;
  clearBoardLongPress: () => void;
  commitBoardLongPressPreview: () => void;
  resetInteraction: (pointerId?: number) => unknown;
  releasePointer: (pointerId: number) => void;
  selectionScalePreview: Map<string, NotePositionPreview> | null;
  selectionScaleStartPosesRef: MutableRefObject<Map<string, SelectionNotePose> | null>;
  selectionScaleSettleExpectedRef: MutableRefObject<Map<string, NotePositionPreview> | null>;
  selectionScaleSettleTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  clearSelectionScalePreview: () => void;
  notes: Note[];
  frames: Frame[];
  applyProjectNotes: (notes: Note[]) => void;
  localResizingFrameSize: FramePreview | null;
  setLocalResizingFrameSize: Dispatch<SetStateAction<FramePreview | null>>;
  localResizingImageSize: ImagePreview | null;
  setLocalResizingImageSize: Dispatch<SetStateAction<ImagePreview | null>>;
  localDraggingFramePos: BoardPoint | null;
  setLocalDraggingFramePos: Dispatch<SetStateAction<BoardPoint | null>>;
  isWaitingForSyncRef: MutableRefObject<boolean>;
  imageResizeSettleTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  onUpdateFrames?: (frames: Frame[]) => void;
  onUpdateNote: (note: Note) => void;
  drawingFrameEnd: BoardPoint | null;
  selectedNoteIds: Set<string>;
  isDrawingFrame: boolean;
  setIsDrawingFrame: Dispatch<SetStateAction<boolean>>;
  setBoxSelectStart: Dispatch<SetStateAction<BoardPoint | null>>;
  setBoxSelectEnd: Dispatch<SetStateAction<BoardPoint | null>>;
  setDrawingFrameStart: Dispatch<SetStateAction<BoardPoint | null>>;
  setDrawingFrameEnd: Dispatch<SetStateAction<BoardPoint | null>>;
  setSelectedFrameId: Dispatch<SetStateAction<string | null>>;
  setEditingFrameId: Dispatch<SetStateAction<string | null>>;
  setEditingFrameTitle: Dispatch<SetStateAction<string>>;
  movementFromOrigin: (pointerId: number, point: BoardPoint) => number;
  onTransformChange?: (x: number, y: number, scale: number) => void;
  isMultiSelectDragging: boolean;
  isZooming: boolean;
  isSelectingNotePosition: boolean;
  createNoteAtPosition: (x: number, y: number) => void;
  editingFrameId: string | null;
  selectedFrameId: string | null;
  selectedNoteId: string | null;
  selectedConnectionId: string | null;
  isShiftPressed: boolean;
  setSelectedNoteId: Dispatch<SetStateAction<string | null>>;
  setSelectedNoteIds: Dispatch<SetStateAction<Set<string>>>;
  setSelectedConnectionId: Dispatch<SetStateAction<string | null>>;
  workspaceEditMode: boolean;
  filterFrameIds: Set<string>;
  boardFilterTagLabels: Set<string>;
  boardFilterIncludeUntagged: boolean;
  boardFilterTimeRange: { min: number; max: number } | null;
  setFilterFrameIds: Dispatch<SetStateAction<Set<string>>>;
  setBoardFilterTagLabels: Dispatch<SetStateAction<Set<string>>>;
  setBoardFilterIncludeUntagged: Dispatch<SetStateAction<boolean>>;
  setBoardFilterTimeRange: Dispatch<SetStateAction<{ min: number; max: number } | null>>;
}) {
  return (event: ReactPointerEvent) => {
    const pointerClient = clientPoint(event.clientX, event.clientY);
    const activeInteraction = options.interactionRef.current;
    if (activeInteraction.kind !== 'idle' && activeInteraction.pointerId !== event.pointerId) return;

    const didCreateFromLongPress = options.boardLongPressTriggeredRef.current;
    options.clearBoardLongPress();
    if (didCreateFromLongPress) {
      options.boardLongPressTriggeredRef.current = false;
      options.commitBoardLongPressPreview();
      options.resetInteraction(event.pointerId);
      options.dragRectRef.current = null;
      options.releasePointer(event.pointerId);
      return;
    }

    if (activeInteraction.kind === 'scaling-selection') {
      const preview = options.selectionScalePreview;
      const startPoses = options.selectionScaleStartPosesRef.current;
      if (preview && startPoses && preview.size > 0) {
        const { notes: updated, changed } = applySelectionScaleToNotes(options.notes, preview, options.frames);
        if (changed) {
          options.selectionScaleSettleExpectedRef.current = new Map(preview);
          if (options.selectionScaleSettleTimerRef.current) {
            clearTimeout(options.selectionScaleSettleTimerRef.current);
          }
          options.selectionScaleSettleTimerRef.current = setTimeout(() => {
            options.selectionScaleSettleTimerRef.current = null;
            options.clearSelectionScalePreview();
          }, 500);
          options.applyProjectNotes(updated);
        } else {
          options.clearSelectionScalePreview();
        }
      } else {
        options.clearSelectionScalePreview();
      }
      options.resetInteraction(event.pointerId);
      options.dragRectRef.current = null;
      options.releasePointer(event.pointerId);
      return;
    }

    if (activeInteraction.kind === 'resizing-frame') {
      if (options.localResizingFrameSize) {
        options.isWaitingForSyncRef.current = true;
        setTimeout(() => {
          if (!options.isWaitingForSyncRef.current) return;
          options.setLocalResizingFrameSize(null);
          options.setLocalDraggingFramePos(null);
          options.isWaitingForSyncRef.current = false;
        }, 500);
        options.onUpdateFrames?.(
          options.frames.map((frame) =>
            frame.id === activeInteraction.id ? { ...frame, ...options.localResizingFrameSize } : frame
          )
        );
      }
      options.resetInteraction(event.pointerId);
      options.dragRectRef.current = null;
      options.releasePointer(event.pointerId);
      return;
    }

    if (activeInteraction.kind === 'resizing-image') {
      if (options.localResizingImageSize) {
        const note = options.notes.find((candidate) => candidate.id === options.localResizingImageSize?.id);
        if (note) {
          options.onUpdateNote({
            ...note,
            boardX: options.localResizingImageSize.x,
            boardY: options.localResizingImageSize.y,
            imageWidth: options.localResizingImageSize.width,
            imageHeight: options.localResizingImageSize.height
          });
        }
        if (options.imageResizeSettleTimerRef.current) {
          clearTimeout(options.imageResizeSettleTimerRef.current);
        }
        options.imageResizeSettleTimerRef.current = setTimeout(() => {
          options.setLocalResizingImageSize(null);
          options.imageResizeSettleTimerRef.current = null;
        }, 500);
      } else {
        options.setLocalResizingImageSize(null);
      }
      options.resetInteraction(event.pointerId);
      options.dragRectRef.current = null;
      options.releasePointer(event.pointerId);
      return;
    }

    if (activeInteraction.kind === 'dragging-frame') {
      if (options.localDraggingFramePos) {
        options.isWaitingForSyncRef.current = true;
        setTimeout(() => {
          if (!options.isWaitingForSyncRef.current) return;
          options.setLocalResizingFrameSize(null);
          options.setLocalDraggingFramePos(null);
          options.isWaitingForSyncRef.current = false;
        }, 500);
        options.onUpdateFrames?.(
          options.frames.map((frame) =>
            frame.id === activeInteraction.id
              ? { ...frame, x: options.localDraggingFramePos.x, y: options.localDraggingFramePos.y }
              : frame
          )
        );
      }
      options.resetInteraction(event.pointerId);
      options.dragRectRef.current = null;
      options.releasePointer(event.pointerId);
      return;
    }

    if (activeInteraction.kind === 'box-selecting') {
      options.setBoxSelectStart(null);
      options.setBoxSelectEnd(null);
      options.resetInteraction(event.pointerId);
      options.dragRectRef.current = null;
      options.releasePointer(event.pointerId);
      return;
    }

    if (activeInteraction.kind === 'drawing-frame') {
      const end = options.drawingFrameEnd ?? activeInteraction.originBoard;
      const newFrame: Frame = {
        id: generateId(),
        title: 'Frame',
        x: Math.min(activeInteraction.originBoard.x, end.x),
        y: Math.min(activeInteraction.originBoard.y, end.y),
        width: Math.max(Math.abs(end.x - activeInteraction.originBoard.x), 100),
        height: Math.max(Math.abs(end.y - activeInteraction.originBoard.y), 100),
        color: 'rgba(255, 255, 255, 0.5)'
      };
      options.onUpdateFrames?.([...options.frames, newFrame]);
      options.selectedNoteIds.forEach((noteId) => {
        const note = options.notes.find((candidate) => candidate.id === noteId);
        if (!note) return;
        options.onUpdateNote({
          ...note,
          groupIds: [newFrame.id],
          groupNames: [newFrame.title],
          groupId: newFrame.id,
          groupName: newFrame.title
        });
      });
      options.resetInteraction(event.pointerId);
      options.setIsDrawingFrame(false);
      options.setDrawingFrameStart(null);
      options.setDrawingFrameEnd(null);
      options.setSelectedFrameId(newFrame.id);
      options.setEditingFrameId(newFrame.id);
      options.setEditingFrameTitle('Frame');
      options.dragRectRef.current = null;
      options.releasePointer(event.pointerId);
      return;
    }

    const target = event.target as HTMLElement;
    if (target) {
      if (['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'A'].includes(target.tagName)) {
        options.dragRectRef.current = null;
        return;
      }
      let current: HTMLElement | null = target;
      while (current) {
        const zIndex = window.getComputedStyle(current).zIndex;
        if (zIndex && (zIndex === '500' || parseInt(zIndex) >= 500)) {
          options.dragRectRef.current = null;
          return;
        }
        if (current.classList.contains('pointer-events-auto') && (current.classList.contains('fixed') || current.classList.contains('absolute'))) {
          options.dragRectRef.current = null;
          return;
        }
        current = current.parentElement;
      }
    }

    const hasMoved =
      options.interactionRef.current.kind === 'panning' &&
      options.movementFromOrigin(event.pointerId, pointerClient) > 5;
    if (options.interactionRef.current.kind === 'panning') {
      options.resetInteraction(event.pointerId);
      options.releasePointer(event.pointerId);
      if (options.onTransformChange) {
        const currentTransform = options.transformRef.current;
        options.onTransformChange(currentTransform.x, currentTransform.y, currentTransform.scale);
      }
    }

    if (hasMoved && !options.isMultiSelectDragging) {
      options.dragRectRef.current = null;
      return;
    }

    if (!hasMoved && !options.isZooming) {
      if (options.isSelectingNotePosition && (options.containerRef.current || options.dragRectRef.current)) {
        const rect = options.dragRectRef.current ?? options.containerRef.current?.getBoundingClientRect();
        if (rect) {
          const boardPoint = clientToBoardPoint(pointerClient, rect, options.transform);
          options.createNoteAtPosition(boardPoint.x, boardPoint.y);
        }
        options.dragRectRef.current = null;
        options.releasePointer(event.pointerId);
        return;
      }

      if (options.isDrawingFrame) {
        options.setIsDrawingFrame(false);
        options.setBoxSelectStart(null);
        options.setBoxSelectEnd(null);
        options.setDrawingFrameStart(null);
        options.setDrawingFrameEnd(null);
        options.dragRectRef.current = null;
        return;
      }

      if (options.editingFrameId) {
        options.setEditingFrameId(null);
        options.dragRectRef.current = null;
        return;
      }

      if (
        options.selectedFrameId ||
        options.selectedNoteId ||
        options.selectedConnectionId ||
        (options.selectedNoteIds.size > 0 && !options.isShiftPressed && !event.shiftKey && !hasMoved && !options.isMultiSelectDragging)
      ) {
        options.setSelectedFrameId(null);
        options.setSelectedNoteId(null);
        if (!options.isShiftPressed && !event.shiftKey && !hasMoved && !options.isMultiSelectDragging) {
          options.setSelectedNoteIds(new Set());
        }
        options.setSelectedConnectionId(null);
        options.dragRectRef.current = null;
        return;
      }

      if (
        !options.workspaceEditMode &&
        (options.filterFrameIds.size > 0 ||
          options.boardFilterTagLabels.size > 0 ||
          options.boardFilterIncludeUntagged ||
          options.boardFilterTimeRange != null)
      ) {
        options.setFilterFrameIds(new Set());
        options.setBoardFilterTagLabels(new Set());
        options.setBoardFilterIncludeUntagged(false);
        options.setBoardFilterTimeRange(null);
        options.dragRectRef.current = null;
        return;
      }
    }

    if (options.isDrawingFrame) {
      options.dragRectRef.current = null;
      return;
    }

    options.dragRectRef.current = null;
  };
}
