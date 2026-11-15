import type { Dispatch, MutableRefObject, PointerEvent as ReactPointerEvent, RefObject, SetStateAction } from 'react';
import type { Note } from '../../types';
import type { BoardInteractionState } from '../hooks/useBoardInteractionMachine';
import type { BoardPoint, BoardTransform } from '../../utils/board/boardCoordinates';
import type { SelectionNotePose } from '../../utils/board/boardSelectionScale';
import { clientPoint, clientToBoardPoint, distanceBetween } from '../../utils/board/boardCoordinates';
import { resizeBoardImageFromPointer, type ImageResizeRect } from '../../utils/board/boardImageResize';
import { scaledSelectionPositions, selectionScaleAxesFromPointer } from '../../utils/board/boardSelectionScale';
import { selectNotesIntersectingBoardRect } from '../../utils/board/boardSelectionBounds';

type ImagePreview = ImageResizeRect & { id: string };

export function createBoardPointerMoveHandler(options: {
  containerRef: RefObject<HTMLElement>;
  dragRectRef: MutableRefObject<DOMRect | null>;
  transform: BoardTransform;
  transformRef: MutableRefObject<BoardTransform>;
  interactionRef: MutableRefObject<BoardInteractionState>;
  longPressStartRef: MutableRefObject<{ clientX: number; clientY: number } | null>;
  clearLongPress: () => void;
  isSelectingNotePosition: boolean;
  setNotePositionPreview: Dispatch<SetStateAction<BoardPoint | null>>;
  isShiftPressed: boolean;
  notes: Note[];
  selectedNoteIds: Set<string>;
  boxSelectStart: BoardPoint | null;
  setBoxSelectEnd: Dispatch<SetStateAction<BoardPoint | null>>;
  setDrawingFrameEnd: Dispatch<SetStateAction<BoardPoint | null>>;
  setSelectedNoteIds: Dispatch<SetStateAction<Set<string>>>;
  setLocalDraggingFramePos: Dispatch<SetStateAction<BoardPoint | null>>;
  setLocalResizingFrameSize: Dispatch<SetStateAction<ImageResizeRect | null>>;
  setLocalResizingImageSize: Dispatch<SetStateAction<ImagePreview | null>>;
  selectionScaleStartPosesRef: MutableRefObject<Map<string, SelectionNotePose> | null>;
  setSelectionScalePreview: Dispatch<SetStateAction<Map<string, { boardX: number; boardY: number }> | null>>;
  isZoomingRef: MutableRefObject<boolean>;
  updatePanning: (pointerId: number, point: BoardPoint) => BoardPoint | null;
  setTransform: Dispatch<SetStateAction<BoardTransform>>;
}) {
  return (event: ReactPointerEvent) => {
    const pointerClient = clientPoint(event.clientX, event.clientY);
    const longPressStart = options.longPressStartRef.current;
    if (longPressStart && distanceBetween(pointerClient, clientPoint(longPressStart.clientX, longPressStart.clientY)) > 10) {
      options.clearLongPress();
    }
    const rect = options.dragRectRef.current || options.containerRef.current?.getBoundingClientRect();
    if (options.isSelectingNotePosition && rect) {
      options.setNotePositionPreview(clientToBoardPoint(pointerClient, rect, options.transform));
    }
    const active = options.interactionRef.current;
    if (active.kind === 'idle' || active.pointerId !== event.pointerId || !rect) return;
    const point = clientToBoardPoint(pointerClient, rect, options.transform);

    switch (active.kind) {
      case 'dragging-frame':
        options.setLocalDraggingFramePos({ x: point.x - active.offset.x, y: point.y - active.offset.y });
        return;
      case 'resizing-image': {
        const next = resizeBoardImageFromPointer({
          startX: active.startBoardX, startY: active.startBoardY, startWidth: active.startWidth,
          startHeight: active.startHeight, corner: active.corner, pointerX: point.x, pointerY: point.y,
          lockAspect: !(event.shiftKey || options.isShiftPressed)
        });
        if (options.notes.some((note) => note.id === active.id)) options.setLocalResizingImageSize({ id: active.id, ...next });
        return;
      }
      case 'resizing-frame':
        options.setLocalResizingFrameSize({
          x: Math.min(active.fixedX, point.x), y: Math.min(active.fixedY, point.y),
          width: Math.max(100, Math.abs(active.fixedX - point.x)), height: Math.max(100, Math.abs(active.fixedY - point.y))
        });
        return;
      case 'scaling-selection': {
        const poses = options.selectionScaleStartPosesRef.current;
        if (!poses) return;
        const fixed = { x: active.fixedX, y: active.fixedY };
        options.setSelectionScalePreview(scaledSelectionPositions(poses, fixed, selectionScaleAxesFromPointer(fixed, { x: active.startMovingX, y: active.startMovingY }, point)));
        return;
      }
      case 'drawing-frame':
        options.setDrawingFrameEnd(point);
        return;
      case 'box-selecting':
        if (!options.boxSelectStart) return;
        options.setBoxSelectEnd(point);
        options.setSelectedNoteIds(selectNotesIntersectingBoardRect(options.notes, options.boxSelectStart, point, options.selectedNoteIds, options.isShiftPressed || event.shiftKey));
        return;
      case 'panning': {
        if (options.isZoomingRef.current) return;
        event.preventDefault();
        const delta = options.updatePanning(event.pointerId, pointerClient);
        if (!delta) return;
        options.setTransform((previous) => {
          const next = { ...previous, x: previous.x + delta.x, y: previous.y + delta.y };
          options.transformRef.current = next;
          return next;
        });
      }
    }
  };
}
