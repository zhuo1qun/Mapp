import { useCallback, useEffect, useRef, type Dispatch, type MutableRefObject, type RefObject, type SetStateAction } from 'react';
import type { BoardInteractionState } from '../hooks/useBoardInteractionMachine';
import type { BoardTransform } from '../../utils/board/boardCoordinates';
import {
  clientPoint,
  clientToViewPoint,
  distanceBetween,
  transformAroundViewPoint
} from '../../utils/board/boardCoordinates';

const MIN_BOARD_SCALE = 0.2;
const MAX_BOARD_SCALE = 4;
const TRANSFORM_PERSIST_DELAY_MS = 500;
const ZOOM_CLICK_GUARD_DELAY_MS = 100;
const TRACKPAD_ZOOM_SENSITIVITY = 0.004;

/** 处理画布触摸缩放与触控板导航；不包含卡片或 Frame 的编辑操作。 */
export function useBoardCanvasNavigation({
  containerRef,
  transformRef,
  setTransform,
  isZoomingRef,
  setIsZooming,
  interactionRef,
  resetInteraction,
  releaseAllPointers,
  cancelBrowseLongPress,
  onTransformChange
}: {
  containerRef: RefObject<HTMLElement>;
  transformRef: MutableRefObject<BoardTransform>;
  setTransform: Dispatch<SetStateAction<BoardTransform>>;
  isZoomingRef: MutableRefObject<boolean>;
  setIsZooming: Dispatch<SetStateAction<boolean>>;
  interactionRef: MutableRefObject<BoardInteractionState>;
  resetInteraction: (pointerId?: number) => BoardInteractionState;
  releaseAllPointers: () => void;
  cancelBrowseLongPress: () => void;
  onTransformChange?: (x: number, y: number, scale: number) => void;
}) {
  const transformPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartRef = useRef<{ distance: number; scale: number } | null>(null);

  const scheduleTransformPersist = useCallback((x: number, y: number, scale: number) => {
    if (transformPersistTimerRef.current) clearTimeout(transformPersistTimerRef.current);
    transformPersistTimerRef.current = setTimeout(() => {
      onTransformChange?.(x, y, scale);
    }, TRANSFORM_PERSIST_DELAY_MS);
  }, [onTransformChange]);

  useEffect(() => () => {
    if (transformPersistTimerRef.current) clearTimeout(transformPersistTimerRef.current);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const cancelSingleFingerPan = () => {
      if (interactionRef.current.kind !== 'panning') return;
      resetInteraction();
      releaseAllPointers();
    };
    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 2) return;
      event.preventDefault();
      cancelSingleFingerPan();
      isZoomingRef.current = true;
      setIsZooming(true);
      cancelBrowseLongPress();
      const [first, second] = event.touches;
      touchStartRef.current = {
        distance: distanceBetween(clientPoint(first.clientX, first.clientY), clientPoint(second.clientX, second.clientY)),
        scale: transformRef.current.scale
      };
    };
    const handleTouchMove = (event: TouchEvent) => {
      if (event.touches.length !== 2 || !touchStartRef.current) return;
      event.preventDefault();
      cancelBrowseLongPress();
      const [first, second] = event.touches;
      const distance = distanceBetween(clientPoint(first.clientX, first.clientY), clientPoint(second.clientX, second.clientY));
      const nextScale = Math.min(
        Math.max(MIN_BOARD_SCALE, touchStartRef.current.scale * (distance / touchStartRef.current.distance)),
        MAX_BOARD_SCALE
      );
      const rect = container.getBoundingClientRect();
      const midpoint = clientToViewPoint(
        clientPoint((first.clientX + second.clientX) / 2, (first.clientY + second.clientY) / 2),
        rect
      );
      const next = transformAroundViewPoint(transformRef.current, midpoint, nextScale);
      transformRef.current = next;
      setTransform(next);
    };
    const handleTouchEnd = (event: TouchEvent) => {
      if (event.touches.length >= 2) return;
      if (touchStartRef.current) {
        const transform = transformRef.current;
        scheduleTransformPersist(transform.x, transform.y, transform.scale);
      }
      touchStartRef.current = null;
      setTimeout(() => {
        isZoomingRef.current = false;
        setIsZooming(false);
      }, ZOOM_CLICK_GUARD_DELAY_MS);
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: false });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: false });
    container.addEventListener('touchcancel', handleTouchEnd, { passive: false });
    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [cancelBrowseLongPress, containerRef, interactionRef, isZoomingRef, releaseAllPointers, resetInteraction, scheduleTransformPersist, setIsZooming, setTransform, transformRef]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let pendingPanX = 0;
    let pendingPanY = 0;
    let panFrame: number | null = null;
    const wheelPixels = (event: WheelEvent) => {
      if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return 16;
      if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return container.clientHeight;
      return 1;
    };
    const flushPan = () => {
      panFrame = null;
      if (pendingPanX === 0 && pendingPanY === 0) return;
      const previous = transformRef.current;
      const next = { ...previous, x: previous.x - pendingPanX, y: previous.y - pendingPanY };
      pendingPanX = 0;
      pendingPanY = 0;
      transformRef.current = next;
      setTransform(next);
      scheduleTransformPersist(next.x, next.y, next.scale);
    };
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (!(event.ctrlKey || event.metaKey)) {
        const pixels = wheelPixels(event);
        pendingPanX += event.deltaX * pixels;
        pendingPanY += event.deltaY * pixels;
        if (panFrame == null) panFrame = requestAnimationFrame(flushPan);
        return;
      }
      const rect = container.getBoundingClientRect();
      const viewPoint = clientToViewPoint(clientPoint(event.clientX, event.clientY), rect);
      const scrollDelta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
      const zoomFactor = Math.exp(-scrollDelta * TRACKPAD_ZOOM_SENSITIVITY);
      let persistedTransform: BoardTransform | null = null;
      setTransform((previous) => {
        const nextScale = Math.min(Math.max(MIN_BOARD_SCALE, previous.scale * zoomFactor), MAX_BOARD_SCALE);
        const next = transformAroundViewPoint(previous, viewPoint, nextScale);
        transformRef.current = next;
        persistedTransform = next;
        return next;
      });
      if (persistedTransform) {
        scheduleTransformPersist(persistedTransform.x, persistedTransform.y, persistedTransform.scale);
      }
    };
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheel);
      if (panFrame != null) cancelAnimationFrame(panFrame);
    };
  }, [containerRef, scheduleTransformPersist, setTransform, transformRef]);
}
