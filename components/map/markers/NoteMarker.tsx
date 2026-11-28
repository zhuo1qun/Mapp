import React, { useEffect, useMemo, useRef } from 'react';
import { Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { Note } from '../../../types';
import { buildMapNoteIconModel } from '../../../utils/map/createMapNoteIcon';
import {
  noteOrderedDisplayMediaSources,
  noteRendersAsMapMediaPin
} from '../../../utils/persistence/mediaDisplay';

function createNoteIcon(
  note: Note,
  themeColor: string,
  count: number | undefined,
  _showTextLabels: boolean | undefined,
  pinSize: number | undefined,
  imageSize: number | undefined,
  showMedia: boolean | undefined,
  motion: 'enter' | 'settle' | 'exit' | undefined
): L.DivIcon {
  const model = buildMapNoteIconModel(note, {
    themeColor,
    clusterCount: count,
    pinSize,
    imageSize,
    showMedia,
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
  imageSize?: number;
  showMedia?: boolean;
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
  selected?: boolean;
  /** 浏览态的已选图钉：长按后切入编辑并由同一次手势继续拖动。 */
  longPressDragEnabled?: boolean;
  onLongPressDragStart?: () => void;
  onLongPressDrag?: (latLng: L.LatLng, pointer: { clientX: number; clientY: number }) => void;
  onLongPressDragEnd?: (latLng: L.LatLng, pointer: { clientX: number; clientY: number }) => void;
  /** 聚合重排路径：marker 已位于终点，用独立 translate 从旧像素位置飞向终点。 */
  clusterPathFrom?: [number, number];
  /** 聚合路径中的成员幽灵，到达终点时淡出，由真实聚合/点位接管。 */
  clusterPathGhost?: boolean;
  /** 新布局目标在路径后段显现，避免先瞬移到终点再播放成员路径。 */
  clusterPathReveal?: boolean;
}

export const NoteMarker = React.memo<NoteMarkerProps>(function NoteMarker({
  note,
  position,
  clusterCount,
  showTextLabels,
  pinSize,
  imageSize,
  showMedia = true,
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
  selected = false,
  longPressDragEnabled = false,
  onLongPressDragStart,
  onLongPressDrag,
  onLongPressDragEnd,
  clusterPathFrom,
  clusterPathGhost = false,
  clusterPathReveal = false
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
  const photoKey = noteOrderedDisplayMediaSources(note)[0]?.slice(0, 48) || '';
  const mediaOrderKey = note.media?.map((item) => item.id).join('|') || '';
  const asSticker = showMedia && noteRendersAsMapMediaPin(note);
  const icon = useMemo(
    () => createNoteIcon(note, themeColor, clusterCount, showTextLabels, pinSize, imageSize, showMedia, motion),
    [
      note.id,
      note.text,
      note.images?.[0],
      note.sketch,
      note.emoji,
      note.isFavorite,
      mediaOrderKey,
      note.imageRefs?.length,
      photoKey,
      asSticker,
      themeColor,
      clusterCount,
      showTextLabels,
      pinSize,
      imageSize,
      showMedia,
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
    const element = markerRef.current?.getElement();
    if (!element) return;
    element.classList.toggle('mapp-map-pin-selected', selected);
    element.setAttribute('aria-selected', selected ? 'true' : 'false');
  }, [icon, selected]);

  useEffect(() => {
    const element = markerRef.current?.getElement();
    if (!element || (!clusterPathFrom && !clusterPathReveal)) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    const duration = 300;
    let animation: Animation | null = null;
    if (clusterPathFrom) {
      const target = map.latLngToLayerPoint(position);
      let sourceLng = clusterPathFrom[1];
      while (sourceLng - position[1] > 180) sourceLng -= 360;
      while (sourceLng - position[1] < -180) sourceLng += 360;
      const source = map.latLngToLayerPoint([clusterPathFrom[0], sourceLng]);
      const dx = source.x - target.x;
      const dy = source.y - target.y;
      animation = element.animate(
        clusterPathGhost
          ? [
              { translate: `${dx}px ${dy}px`, opacity: 0.92, offset: 0 },
              { translate: `${dx * 0.18}px ${dy * 0.18}px`, opacity: 0.82, offset: 0.72 },
              { translate: '0px 0px', opacity: 0, offset: 1 }
            ]
          : [
              { translate: `${dx}px ${dy}px`, opacity: 0.88 },
              { translate: '0px 0px', opacity: 1 }
            ],
        { duration, easing: 'cubic-bezier(0.2, 0.72, 0.24, 1)', fill: 'both' }
      );
    } else if (clusterPathReveal) {
      animation = element.animate(
        [
          { opacity: 0, offset: 0 },
          { opacity: 0, offset: 0.58 },
          { opacity: 1, offset: 1 }
        ],
        { duration, easing: 'ease-out', fill: 'both' }
      );
    }
    return () => animation?.cancel();
  }, [
    clusterPathFrom?.[0],
    clusterPathFrom?.[1],
    clusterPathGhost,
    clusterPathReveal,
    map,
    position[0],
    position[1]
  ]);

  useEffect(() => {
    const marker = markerRef.current;
    const element = marker?.getElement();
    if (!marker || !element) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let activePointerId: number | null = null;
    let startPoint: { x: number; y: number } | null = null;
    let promoted = false;
    let lastLatLng: L.LatLng | null = null;
    let lastPointer: { clientX: number; clientY: number } | null = null;
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
      lastPointer = null;
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (!longPressDragRef.current.enabled || !event.isPrimary || event.button !== 0) return;
      clearTimer();
      activePointerId = event.pointerId;
      startPoint = { x: event.clientX, y: event.clientY };
      promoted = false;
      lastLatLng = null;
      lastPointer = { clientX: event.clientX, clientY: event.clientY };
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
      lastPointer = { clientX: event.clientX, clientY: event.clientY };
      lastLatLng = latLngAt(event.clientX, event.clientY);
      // 先直接移动 Leaflet 实例，再让 React 的乐观坐标接管，避免手指下落后一帧。
      marker.setLatLng(lastLatLng);
      longPressDragRef.current.onDrag?.(lastLatLng, { clientX: event.clientX, clientY: event.clientY });
    };

    const finishPointer = (event: PointerEvent) => {
      if (activePointerId !== event.pointerId) return;
      clearTimer();
      if (promoted) {
        event.preventDefault();
        event.stopPropagation();
        // 只长按、未移动时保持原坐标；不能把手指按在图钉图形内的位置误当成新锚点。
        const finalLatLng = lastLatLng ?? marker.getLatLng();
        // iOS 在 setPointerCapture 后偶尔以 pointercancel 结束手势，此时事件坐标可能
        // 回到 (0, 0) 或脱离最后触点。沿用最后一次有效 pointermove，才能稳定命中暂存箱。
        const finalPointer = lastPointer ?? { clientX: event.clientX, clientY: event.clientY };
        longPressDragRef.current.onEnd?.(finalLatLng, finalPointer);
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
