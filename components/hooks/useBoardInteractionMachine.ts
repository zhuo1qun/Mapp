import { useCallback, useEffect, useRef, useState } from 'react';
import type { BoardPoint } from '../../utils/board/boardCoordinates';

export type BoardInteractionKind =
  | 'idle'
  | 'panning'
  | 'box-selecting'
  | 'drawing-frame'
  | 'dragging-frame'
  | 'resizing-frame'
  | 'resizing-image';

type IdleInteraction = { kind: 'idle' };
type PanningInteraction = {
  kind: 'panning';
  pointerId: number;
  originClient: BoardPoint;
  previousClient: BoardPoint;
};
type BoxSelectingInteraction = {
  kind: 'box-selecting';
  pointerId: number;
  originBoard: BoardPoint;
};
type DrawingFrameInteraction = {
  kind: 'drawing-frame';
  pointerId: number;
  originBoard: BoardPoint;
};
type DraggingFrameInteraction = {
  kind: 'dragging-frame';
  pointerId: number;
  id: string;
  offset: BoardPoint;
};
type ResizingFrameInteraction = {
  kind: 'resizing-frame';
  pointerId: number;
  id: string;
  fixedX: number;
  fixedY: number;
};
type ResizingImageInteraction = {
  kind: 'resizing-image';
  pointerId: number;
  id: string;
  corner: 'tl' | 'tr' | 'bl' | 'br';
  startWidth: number;
  startHeight: number;
  startBoardX: number;
  startBoardY: number;
};

export type BoardInteractionState =
  | IdleInteraction
  | PanningInteraction
  | BoxSelectingInteraction
  | DrawingFrameInteraction
  | DraggingFrameInteraction
  | ResizingFrameInteraction
  | ResizingImageInteraction;

const IDLE: IdleInteraction = { kind: 'idle' };

export function useBoardInteractionMachine() {
  const stateRef = useRef<BoardInteractionState>(IDLE);
  const [state, setState] = useState<BoardInteractionState>(IDLE);

  const transition = useCallback((next: BoardInteractionState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const beginPanning = useCallback(
    (pointerId: number, point: BoardPoint) => {
      transition({ kind: 'panning', pointerId, originClient: point, previousClient: point });
    },
    [transition]
  );

  const beginBoxSelecting = useCallback(
    (pointerId: number, originBoard: BoardPoint) => {
      transition({ kind: 'box-selecting', pointerId, originBoard });
    },
    [transition]
  );

  const beginDrawingFrame = useCallback(
    (pointerId: number, originBoard: BoardPoint) => {
      transition({ kind: 'drawing-frame', pointerId, originBoard });
    },
    [transition]
  );

  const beginDraggingFrame = useCallback(
    (pointerId: number, id: string, offset: BoardPoint) => {
      transition({ kind: 'dragging-frame', pointerId, id, offset });
    },
    [transition]
  );

  const beginResizingFrame = useCallback(
    (pointerId: number, id: string, fixedX: number, fixedY: number) => {
      transition({ kind: 'resizing-frame', pointerId, id, fixedX, fixedY });
    },
    [transition]
  );

  const beginResizingImage = useCallback(
    (
      pointerId: number,
      image: Omit<ResizingImageInteraction, 'kind' | 'pointerId'>
    ) => {
      transition({ kind: 'resizing-image', pointerId, ...image });
    },
    [transition]
  );

  const updatePanning = useCallback((pointerId: number, point: BoardPoint) => {
    const current = stateRef.current;
    if (current.kind !== 'panning' || current.pointerId !== pointerId) return null;
    const delta = {
      x: point.x - current.previousClient.x,
      y: point.y - current.previousClient.y
    };
    current.previousClient = point;
    return delta;
  }, []);

  const movementFromOrigin = useCallback((pointerId: number, point: BoardPoint) => {
    const current = stateRef.current;
    if (current.kind !== 'panning' || current.pointerId !== pointerId) return 0;
    return Math.hypot(point.x - current.originClient.x, point.y - current.originClient.y);
  }, []);

  const reset = useCallback((pointerId?: number) => {
    const current = stateRef.current;
    if ('pointerId' in current && pointerId != null && current.pointerId !== pointerId) return current;
    stateRef.current = IDLE;
    setState(IDLE);
    return current;
  }, []);

  useEffect(() => () => {
    stateRef.current = IDLE;
  }, []);

  return {
    interactionRef: stateRef,
    interactionState: state,
    interactionKind: state.kind,
    beginPanning,
    beginBoxSelecting,
    beginDrawingFrame,
    beginDraggingFrame,
    beginResizingFrame,
    beginResizingImage,
    updatePanning,
    movementFromOrigin,
    resetInteraction: reset
  };
}
