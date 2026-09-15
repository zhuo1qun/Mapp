import { useCallback, useEffect, useRef, type RefObject } from 'react';

export function useBoardPointerCapture(containerRef: RefObject<HTMLElement>) {
  const capturedPointerIdsRef = useRef(new Set<number>());

  const capturePointer = useCallback(
    (pointerId: number) => {
      const element = containerRef.current;
      if (!element) return false;
      try {
        element.setPointerCapture(pointerId);
        capturedPointerIdsRef.current.add(pointerId);
        return true;
      } catch {
        return false;
      }
    },
    [containerRef]
  );

  const releasePointer = useCallback(
    (pointerId: number) => {
      const element = containerRef.current;
      capturedPointerIdsRef.current.delete(pointerId);
      if (!element) return;
      try {
        if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId);
      } catch {
        // The browser may release capture before pointercancel reaches React.
      }
    },
    [containerRef]
  );

  const releaseAllPointers = useCallback(() => {
    [...capturedPointerIdsRef.current].forEach(releasePointer);
  }, [releasePointer]);

  useEffect(() => releaseAllPointers, [releaseAllPointers]);

  return { capturePointer, releasePointer, releaseAllPointers };
}
