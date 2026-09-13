import React, { useRef, useEffect } from 'react';
import { useMap } from 'react-leaflet';
import { Coordinates } from '../../types';

interface MapLongPressHandlerProps {
  /** 达到长按阈值：仅展示预览，尚未提交新便签。 */
  onLongPress: (coords: Coordinates) => void;
  /** 松手后提交预览，让父级完成收稳并打开编辑器。 */
  onLongPressRelease?: () => void;
  /** 手势取消时撤销尚未提交的预览。 */
  onLongPressCancel?: () => void;
  isPreviewMode?: boolean;
}

export const MapLongPressHandler: React.FC<MapLongPressHandlerProps> = ({
  onLongPress,
  onLongPressRelease,
  onLongPressCancel,
  isPreviewMode = false
}) => {
  const map = useMap();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPosRef = useRef<{ x: number, y: number } | null>(null);
  const touchCountRef = useRef<number>(0);
  const longPressTriggeredRef = useRef(false);

  // Check if target element is a UI element or marker
  const isUIElement = (target: EventTarget | null): boolean => {
    if (!target || !(target instanceof Element)) return false;

    const element = target as HTMLElement;

    // Current-location indicator is visual-only; allow long-press through it
    if (element.classList.contains('user-location-marker') ||
        element.closest('.user-location-marker')) {
      return false;
    }

    // Check if it's a Leaflet marker element
    if (element.classList.contains('leaflet-marker-icon') ||
        element.closest('.leaflet-marker-icon') ||
        element.classList.contains('custom-icon') ||
        element.closest('.custom-icon')) {
      return true;
    }

    // Check if it's an interactive element (button, input, select, textarea, etc.)
    const interactiveTags = ['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'A'];
    if (interactiveTags.includes(element.tagName)) {
      return true;
    }

    // Check if it's inside a UI container (by checking z-index or specific class names)
    let current: HTMLElement | null = element;
    while (current) {
      // Check if it has pointer-events-auto class (UI elements usually have this)
      if (current.classList.contains('pointer-events-auto')) {
        return true;
      }

      // Check if it's inside a high z-index container (UI elements are usually in z-[400] or z-[500] containers)
      const zIndex = window.getComputedStyle(current).zIndex;
      if (zIndex && (zIndex === '400' || zIndex === '500' || parseInt(zIndex) >= 400)) {
        return true;
      }

      // Check if it's inside a specific container
      if (current.id === 'map-view-container' && current !== element) {
        // If we've reached map-view-container, we're not in the UI layer
        break;
      }

      current = current.parentElement;
    }

    return false;
  };

  useEffect(() => {
    const container = map.getContainer();

    // Global handler to clear state when pointer is released anywhere
    // This ensures state is cleared even if events are stopped on UI elements
    const handleGlobalEnd = (e: Event) => {
      if (longPressTriggeredRef.current) {
        longPressTriggeredRef.current = false;
        startPosRef.current = null;
        onLongPressRelease?.();
        return;
      }
      if (timerRef.current || startPosRef.current) {
        // Check if pointer is over a UI element
        let clientX = 0;
        let clientY = 0;
        if (e instanceof MouseEvent) {
          clientX = e.clientX;
          clientY = e.clientY;
        } else if (e instanceof TouchEvent && e.changedTouches.length > 0) {
          clientX = e.changedTouches[0].clientX;
          clientY = e.changedTouches[0].clientY;
        }

        const elementAtPoint = document.elementFromPoint(clientX, clientY);
        if (elementAtPoint && isUIElement(elementAtPoint)) {
          // Pointer is over UI element, clear state
          if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
          }
          startPosRef.current = null;
        }
      }
    };

    const handleStart = (e: TouchEvent | MouseEvent) => {
      if (isPreviewMode) return;
      if (e instanceof MouseEvent && e.button !== 0) return;

      // Check if clicked on UI element
      if (isUIElement(e.target)) {
        return;
      }

      // Clear any existing timer
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      // If multi-touch (pinch zoom), don't start long press timer
      if ('touches' in e) {
        touchCountRef.current = e.touches.length;
        if (e.touches.length > 1) {
          startPosRef.current = null;
          return;
        }
      } else {
        touchCountRef.current = 1;
      }

      const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
      startPosRef.current = { x: clientX, y: clientY };

      timerRef.current = setTimeout(() => {
        // Check touch count again to prevent multi-touch during wait
        if (touchCountRef.current > 1) {
          timerRef.current = null;
          startPosRef.current = null;
          return;
        }

        // Check again if on UI element (prevent mouse moving to UI element during wait)
        if (document.elementFromPoint(clientX, clientY) && isUIElement(document.elementFromPoint(clientX, clientY))) {
          timerRef.current = null;
          startPosRef.current = null;
          return;
        }

        const rect = container.getBoundingClientRect();
        const relativeX = clientX - rect.left;
        const relativeY = clientY - rect.top;
        try {
          const latlng = map.containerPointToLatLng([relativeX, relativeY]);
          if (navigator.vibrate) navigator.vibrate(50);
          onLongPress(latlng);
          longPressTriggeredRef.current = true;
        } catch (error) {
          console.warn('MapLongPressHandler: Failed to handle long press:', error);
        }
        timerRef.current = null;
      }, 600);
    };

    const handleMove = (e: TouchEvent | MouseEvent) => {
       if ('touches' in e && longPressTriggeredRef.current && e.touches.length > 1) {
         longPressTriggeredRef.current = false;
         startPosRef.current = null;
         onLongPressCancel?.();
         return;
       }
       if (!startPosRef.current || !timerRef.current) return;

       // Update touch count
       if ('touches' in e) {
         touchCountRef.current = e.touches.length;
       }

       // If becomes multi-touch (pinch zoom), cancel long press timer
       if ('touches' in e && e.touches.length > 1) {
         clearTimeout(timerRef.current);
         timerRef.current = null;
         startPosRef.current = null;
         return;
       }

       const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
       const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;

       // Check if moved to UI element - check both target and current pointer position
       const elementAtPoint = document.elementFromPoint(clientX, clientY);
       if (isUIElement(e.target) || (elementAtPoint && isUIElement(elementAtPoint))) {
         clearTimeout(timerRef.current);
         timerRef.current = null;
         startPosRef.current = null;
         return;
       }

       // Also check if pointer is over any element with pointer-events-auto or high z-index
       if (elementAtPoint) {
         let current: HTMLElement | null = elementAtPoint as HTMLElement;
         while (current && current !== container) {
           const zIndex = window.getComputedStyle(current).zIndex;
           if (current.classList.contains('pointer-events-auto') ||
               (zIndex && parseInt(zIndex) >= 400)) {
             clearTimeout(timerRef.current);
             timerRef.current = null;
             startPosRef.current = null;
             return;
           }
           current = current.parentElement;
         }
       }

       const dx = clientX - startPosRef.current.x;
       const dy = clientY - startPosRef.current.y;
       const dist = Math.sqrt(dx*dx + dy*dy);
       if (dist > 10) {
         clearTimeout(timerRef.current);
         timerRef.current = null;
         startPosRef.current = null;
       }
    };

    const handleEnd = (e?: TouchEvent | MouseEvent) => {
       // Update touch count
       if (e && 'touches' in e) {
         touchCountRef.current = e.touches.length;
       } else {
         touchCountRef.current = 0;
       }

       // Always clear timer and position on end, regardless of target
       // This ensures that if user started on map but ended on UI, we clear state
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      if (longPressTriggeredRef.current) {
        longPressTriggeredRef.current = false;
        startPosRef.current = null;
        onLongPressRelease?.();
        return;
      }

       // If clicked on UI element, clear immediately and return
       if (e && isUIElement(e.target)) {
         startPosRef.current = null;
         return;
       }

       // Also check current pointer position in case it moved to UI element
       if (e) {
         const clientX = 'touches' in e ? (e.touches.length > 0 ? e.touches[0].clientX : 0) : (e as MouseEvent).clientX;
         const clientY = 'touches' in e ? (e.touches.length > 0 ? e.touches[0].clientY : 0) : (e as MouseEvent).clientY;
         const elementAtPoint = document.elementFromPoint(clientX, clientY);
         if (elementAtPoint && isUIElement(elementAtPoint)) {
           startPosRef.current = null;
           return;
         }
       }

       // For non-marker clicks, also check if we moved significantly
       // If we moved, it was a drag, not a click, so don't trigger long press
       if (e && startPosRef.current) {
         const clientX = 'touches' in e ? (e.touches.length > 0 ? e.touches[0].clientX : 0) : (e as MouseEvent).clientX;
         const clientY = 'touches' in e ? (e.touches.length > 0 ? e.touches[0].clientY : 0) : (e as MouseEvent).clientY;
         const dx = clientX - startPosRef.current.x;
         const dy = clientY - startPosRef.current.y;
         const dist = Math.sqrt(dx*dx + dy*dy);

         if (dist > 10) {
           // Moved significantly, it was a drag
           if (timerRef.current) {
             clearTimeout(timerRef.current);
             timerRef.current = null;
           }
           startPosRef.current = null;
           return;
         }
       }

       if (timerRef.current) {
         clearTimeout(timerRef.current);
         timerRef.current = null;
       }
       startPosRef.current = null;
    };

    const handleCancel = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      startPosRef.current = null;
      if (longPressTriggeredRef.current) onLongPressCancel?.();
      longPressTriggeredRef.current = false;
      touchCountRef.current = 0;
    };

    container.addEventListener('touchstart', handleStart, { passive: true });
    container.addEventListener('mousedown', handleStart);
    container.addEventListener('touchmove', handleMove, { passive: true });
    container.addEventListener('mousemove', handleMove);
    container.addEventListener('touchend', (e) => handleEnd(e));
    container.addEventListener('mouseup', handleEnd);
    container.addEventListener('touchcancel', handleCancel);

    // Add global listeners to catch events even if stopped on UI elements
    // Use capture phase to catch events before they're stopped
    document.addEventListener('mouseup', handleGlobalEnd, true);
    document.addEventListener('touchend', handleGlobalEnd, true);
    document.addEventListener('pointerup', handleGlobalEnd, true);

    return () => {
      container.removeEventListener('touchstart', handleStart);
      container.removeEventListener('mousedown', handleStart);
      container.removeEventListener('touchmove', handleMove);
      container.removeEventListener('mousemove', handleMove);
      container.removeEventListener('touchend', handleEnd);
      container.removeEventListener('mouseup', handleEnd);
      container.removeEventListener('touchcancel', handleCancel);
      document.removeEventListener('mouseup', handleGlobalEnd, true);
      document.removeEventListener('touchend', handleGlobalEnd, true);
      document.removeEventListener('pointerup', handleGlobalEnd, true);
    };
  }, [map, onLongPress, onLongPressCancel, onLongPressRelease]);

  return null;
};
