import React, { useEffect, useMemo, useRef } from 'react';
import { Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { Note } from '../../../types';
import { buildMapNoteIconModel } from '../../../utils/map/createMapNoteIcon';
import {
  isDisplayableImageSrc,
  noteRendersAsBoardSticker
} from '../../../utils/persistence/mediaDisplay';

function createNoteIcon(
  note: Note,
  themeColor: string,
  count: number | undefined,
  _showTextLabels: boolean | undefined,
  pinSize: number | undefined,
  motion: 'enter' | 'settle' | 'exit' | undefined
): L.DivIcon {
  const model = buildMapNoteIconModel(note, {
    themeColor,
    clusterCount: count,
    pinSize,
    motion
  });
  return L.divIcon({
    className: 'custom-icon',
    html: model.html,
    iconSize: model.size,
    iconAnchor: model.anchor,
    popupAnchor: [0, -model.size[1]]
  });
}

interface NoteMarkerProps {
  note: Note;
  position: [number, number];
  clusterCount?: number;
  showTextLabels?: boolean;
  pinSize?: number;
  themeColor: string;
  zIndexOffset?: number;
  onClick: (e: L.LeafletMouseEvent) => void;
  onMouseEnter?: (e: L.LeafletMouseEvent) => void;
  onMouseLeave?: (e: L.LeafletMouseEvent) => void;
  draggable?: boolean;
  onDragEnd?: (e: L.DragEndEvent) => void;
  // 拖拽过程中更新坐标（用于避免回弹）
  onDrag?: (e: any) => void;
  /** 新建 / 删除时的锚点动效，外层动画不干扰图钉自身的旋转。 */
  motion?: 'enter' | 'settle' | 'exit';
  interactive?: boolean;
  /** 浏览态的已选图钉：长按后切入编辑并由同一次手势继续拖动。 */
  longPressDragEnabled?: boolean;
  onLongPressDragStart?: () => void;
  onLongPressDrag?: (latLng: L.LatLng) => void;
  onLongPressDragEnd?: (latLng: L.LatLng) => void;
}

export const NoteMarker = React.memo<NoteMarkerProps>(function NoteMarker({
  note,
  position,
  clusterCount,
  showTextLabels,
  pinSize,
  themeColor,
  zIndexOffset = 0,
  onClick,
  onMouseEnter,
  onMouseLeave,
  draggable = false,
  onDragEnd,
  onDrag,
  motion,
  interactive = true,
  longPressDragEnabled = false,
  onLongPressDragStart,
  onLongPressDrag,
  onLongPressDragEnd
}) {
  const map = useMap();
  const markerRef = useRef<L.Marker | null>(null);
  const suppressNextClickRef = useRef(false);
  const longPressDragRef = useRef({
    enabled: longPressDragEnabled,
    onStart: onLongPressDragStart,
    onDrag: onLongPressDrag,
    onEnd: onLongPressDragEnd
  });
  longPressDragRef.current = {
    enabled: longPressDragEnabled,
    onStart: onLongPressDragStart,
    onDrag: onLongPressDrag,
    onEnd: onLongPressDragEnd
  };
  const photoKey =
    (note.images?.[0] && isDisplayableImageSrc(note.images[0]) && note.images[0].slice(0, 48)) ||
    (note.sketch && isDisplayableImageSrc(note.sketch) && note.sketch.slice(0, 48)) ||
    '';
  const asSticker = noteRendersAsBoardSticker(note);
  const icon = useMemo(
    () => createNoteIcon(note, themeColor, clusterCount, showTextLabels, pinSize, motion),
    [
      note.id,
      note.text,
      note.images?.[0],
      note.sketch,
      note.emoji,
      note.isFavorite,
      note.media?.length,
      note.imageRefs?.length,
      photoKey,
      asSticker,
      themeColor,
      clusterCount,
      showTextLabels,
      pinSize,
      motion
    ]
  );

  const eventHandlers: {
    click: (e: L.LeafletMouseEvent) => void;
    mouseover?: (e: L.LeafletMouseEvent) => void;
    mouseout?: (e: L.LeafletMouseEvent) => void;
    dragend?: (e: L.DragEndEvent) => void;
    drag?: (e: any) => void;
  } = {
    click: (event) => {
      if (suppressNextClickRef.current) {
        suppressNextClickRef.current = false;
        event.originalEvent?.stopPropagation();
        event.originalEvent?.stopImmediatePropagation();
        return;
      }
      onClick(event);
    }
  };
  if (onMouseEnter) eventHandlers.mouseover = onMouseEnter;
  if (onMouseLeave) eventHandlers.mouseout = onMouseLeave;
  if (onDragEnd) eventHandlers.dragend = onDragEnd;
  if (onDrag) eventHandlers.drag = onDrag;

  useEffect(() => {
    const marker = markerRef.current;
    const element = marker?.getElement();
    if (!marker || !element) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let activePointerId: number | null = null;
    let startPoint: { x: number; y: number } | null = null;
    let promoted = false;
    let lastLatLng: L.LatLng | null = null;
    let restoreMapDragging = false;

    const clearTimer = () => {
      if (!timer) return;
      clearTimeout(timer);
      timer = null;
    };

    const latLngAt = (clientX: number, clientY: number) => {
      const rect = map.getContainer().getBoundingClientRect();
      return map.containerPointToLatLng([clientX - rect.left, clientY - rect.top]);
    };

    const reset = () => {
      clearTimer();
      if (restoreMapDragging) map.dragging.enable();
      restoreMapDragging = false;
      activePointerId = null;
      startPoint = null;
      promoted = false;
      lastLatLng = null;
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (!longPressDragRef.current.enabled || !event.isPrimary || event.button !== 0) return;
      clearTimer();
      activePointerId = event.pointerId;
      startPoint = { x: event.clientX, y: event.clientY };
      promoted = false;
      lastLatLng = null;
      timer = setTimeout(() => {
        timer = null;
        if (activePointerId !== event.pointerId || !startPoint) return;
        promoted = true;
        suppressNextClickRef.current = true;
        restoreMapDragging = map.dragging.enabled();
        if (restoreMapDragging) map.dragging.disable();
        try {
          element.setPointerCapture(event.pointerId);
        } catch {
          /* pointer may already have ended */
        }
        navigator.vibrate?.(50);
        longPressDragRef.current.onStart?.();
      }, 420);
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (activePointerId !== event.pointerId || !startPoint) return;
      const dx = event.clientX - startPoint.x;
      const dy = event.clientY - startPoint.y;
      if (!promoted) {
        if (Math.hypot(dx, dy) > 10) reset();
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      lastLatLng = latLngAt(event.clientX, event.clientY);
      // 先直接移动 Leaflet 实例，再让 React 的乐观坐标接管，避免手指下落后一帧。
      marker.setLatLng(lastLatLng);
      longPressDragRef.current.onDrag?.(lastLatLng);
    };

    const finishPointer = (event: PointerEvent) => {
      if (activePointerId !== event.pointerId) return;
      clearTimer();
      if (promoted) {
        event.preventDefault();
        event.stopPropagation();
        // 只长按、未移动时保持原坐标；不能把手指按在图钉图形内的位置误当成新锚点。
        const finalLatLng = lastLatLng ?? marker.getLatLng();
        longPressDragRef.current.onEnd?.(finalLatLng);
        try {
          element.releasePointerCapture(event.pointerId);
        } catch {
          /* capture may already be released */
        }
      }
      reset();
    };

    const handlePointerUp = (event: PointerEvent) => finishPointer(event);
    const handlePointerCancel = (event: PointerEvent) => finishPointer(event);
    const handleContextMenu = (event: MouseEvent) => {
      if (longPressDragRef.current.enabled) event.preventDefault();
    };

    element.addEventListener('pointerdown', handlePointerDown);
    element.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('pointermove', handlePointerMove, { passive: false });
    document.addEventListener('pointerup', handlePointerUp, { passive: false });
    document.addEventListener('pointercancel', handlePointerCancel, { passive: false });

    return () => {
      reset();
      element.removeEventListener('pointerdown', handlePointerDown);
      element.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
      document.removeEventListener('pointercancel', handlePointerCancel);
    };
  }, [icon, map]);

  return (
    <Marker
      ref={markerRef}
      position={position}
      icon={icon}
      zIndexOffset={zIndexOffset}
      draggable={draggable}
      interactive={interactive}
      eventHandlers={eventHandlers}
    />
  );
});
