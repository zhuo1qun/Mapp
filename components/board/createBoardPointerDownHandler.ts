import type { Dispatch, MutableRefObject, PointerEvent as ReactPointerEvent, RefObject, SetStateAction } from 'react';
import type { BoardInteractionState } from '../hooks/useBoardInteractionMachine';
import type { BoardPoint, BoardTransform } from '../../utils/board/boardCoordinates';
import { clientPoint, clientToBoardPoint } from '../../utils/board/boardCoordinates';

export function createBoardPointerDownHandler(options: {
  containerRef: RefObject<HTMLElement>;
  dragRectRef: MutableRefObject<DOMRect | null>;
  transform: BoardTransform;
  interactionRef: MutableRefObject<BoardInteractionState>;
  stopAnimations: () => void;
  isDrawingFrame: boolean;
  workspaceEditMode: boolean;
  setIsDrawingFrame: Dispatch<SetStateAction<boolean>>;
  beginDrawingFrame: (pointerId: number, originBoard: BoardPoint) => void;
  setDrawingFrameStart: Dispatch<SetStateAction<BoardPoint | null>>;
  setDrawingFrameEnd: Dispatch<SetStateAction<BoardPoint | null>>;
  startBoardLongPress: (event: ReactPointerEvent) => void;
  cancelBrowseLongPress: () => void;
  /** 画布会阻止默认失焦，因此空白按下时显式结束卡片内联编辑。 */
  onBlankPointerDown?: () => void;
  /** Persistent tool state (a): toggled only by the toolbar. */
  isBoxSelectToolActive: () => boolean;
  isShiftPressed: boolean;
  draggingNoteId: string | null;
  isResizingImage: boolean;
  beginBoxSelecting: (pointerId: number, originBoard: BoardPoint) => void;
  setBoxSelectStart: Dispatch<SetStateAction<BoardPoint | null>>;
  setBoxSelectEnd: Dispatch<SetStateAction<BoardPoint | null>>;
  setSelectedNoteIds: Dispatch<SetStateAction<Set<string>>>;
  setSelectedNoteId: Dispatch<SetStateAction<string | null>>;
  beginPanning: (pointerId: number, point: BoardPoint) => void;
  capturePointer: (pointerId: number) => void;
}) {
  return (event: ReactPointerEvent) => {
    event.preventDefault();
    options.stopAnimations();

    options.dragRectRef.current = options.containerRef.current?.getBoundingClientRect() ?? null;
    const pointerClient = clientPoint(event.clientX, event.clientY);

    if (options.isDrawingFrame && options.workspaceEditMode) {
      const rect = options.dragRectRef.current;
      if (!rect) return;
      const boardPoint = clientToBoardPoint(pointerClient, rect, options.transform);
      options.beginDrawingFrame(event.pointerId, boardPoint);
      options.setDrawingFrameStart(boardPoint);
      options.setDrawingFrameEnd(boardPoint);
      options.capturePointer(event.pointerId);
      return;
    }

    if (options.isDrawingFrame) options.setIsDrawingFrame(false);

    const target = event.target as HTMLElement;
    const isNoteClick = target.closest('[data-is-note]') !== null;
    const isBlankCanvasPress =
      !isNoteClick &&
      !target.closest('button, input, select, textarea, a, .pointer-events-auto');
    if (isBlankCanvasPress) options.onBlankPointerDown?.();
    // A new box-select gesture (b) begins only on press while its tool is
    // active (a), or while Shift temporarily requests the same gesture.
    const shouldStartBoxSelectGesture =
      (options.workspaceEditMode && options.isBoxSelectToolActive()) ||
      options.isShiftPressed ||
      event.shiftKey;
    if (
      event.button === 0 &&
      shouldStartBoxSelectGesture &&
      options.interactionRef.current.kind === 'idle' &&
      !options.draggingNoteId &&
      !isNoteClick &&
      !options.isResizingImage
    ) {
      const rect = options.dragRectRef.current;
      if (!rect) return;
      const boardPoint = clientToBoardPoint(pointerClient, rect, options.transform);
      options.beginBoxSelecting(event.pointerId, boardPoint);
      options.setBoxSelectStart(boardPoint);
      options.setBoxSelectEnd(boardPoint);
      if (!options.isShiftPressed && !event.shiftKey) {
        options.setSelectedNoteIds(new Set());
        options.setSelectedNoteId(null);
      }
      options.capturePointer(event.pointerId);
      return;
    }

    if (!isNoteClick) {
      options.startBoardLongPress(event);
      options.cancelBrowseLongPress();
    }

    if (event.button === 0 && !options.draggingNoteId && options.interactionRef.current.kind === 'idle') {
      options.beginPanning(event.pointerId, pointerClient);
      options.capturePointer(event.pointerId);
    }
  };
}
