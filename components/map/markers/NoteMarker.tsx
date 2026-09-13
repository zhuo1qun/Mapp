import React, { useMemo } from 'react';
import { Marker } from 'react-leaflet';
import L from 'leaflet';
import type { Note } from '../../../types';

function mapPinSize(sliderValue: number): number {
  return (sliderValue - 0.5) * (1.2 - 0.2) / (2.0 - 0.5) + 0.2;
}

function createNoteIcon(
  note: Note,
  themeColor: string,
  count: number | undefined,
  showTextLabels: boolean | undefined,
  pinSize: number | undefined,
  motion: 'enter' | 'settle' | 'exit' | undefined
): L.DivIcon {
  const isFavorite = note.isFavorite === true;
  const mappedPinSize = pinSize ? mapPinSize(pinSize) : 1.0;
  const scale = (isFavorite ? 2 : 1) * mappedPinSize;
  const baseSize = 40;
  const size = baseSize * scale;
  const borderWidth = 3;
  const badgeSize = 20 * scale;
  const badgeOffset = 8 * scale;
  const countBadge = count && count > 1 ? `
    <div style="
      position: absolute; top: -${badgeOffset}px; right: -${badgeOffset}px;
      width: ${badgeSize}px; height: ${badgeSize}px;
      background-color: white; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2); z-index: 10;
      border: 2px solid ${themeColor};
    ">
      <span style="color: black; font-size: ${12 * scale}px; font-weight: bold; line-height: 1;">${count}</span>
    </div>
  ` : '';

  let content = '';
  const backgroundColor = themeColor;

  if (note.images && note.images.length > 0) {
    content = `<div style="position: absolute; inset: -25%; overflow: hidden; transform: rotate(45deg); transform-origin: center;">
      <img src="${note.images[0]}" style="width: 100%; height: 100%; object-fit: cover; transform: scale(1.5); transform-origin: center;" />
    </div>`;
  } else if (note.sketch) {
    content = `<div style="position: absolute; inset: -25%; overflow: hidden; transform: rotate(45deg); transform-origin: center;">
      <img src="${note.sketch}" style="width: 100%; height: 100%; object-fit: cover; transform: scale(1.5); transform-origin: center;" />
    </div>`;
  } else if (note.emoji) {
    const emojiSize = 20 * scale;
    content = `<span style="transform: rotate(45deg); font-size: ${emojiSize}px; line-height: 1; z-index: 1; position: relative;">${note.emoji}</span>`;
  }

  return L.divIcon({
    className: 'custom-icon',
    html: `<div class="mapp-map-pin-motion${motion ? ` mapp-map-pin-motion--${motion}` : ''}" style="
      width:${size}px;height:${size}px;transform-origin:${size / 2}px ${size}px;
    "><div style="
      position: relative; background-color: ${backgroundColor};
      width: ${size}px; height: ${size}px;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg) ${isFavorite ? 'scale(1)' : ''};
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2);
      border: ${borderWidth}px solid ${themeColor};
      overflow: hidden;
    ">${content}</div>${countBadge}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size]
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
  interactive = true
}) {
  const icon = useMemo(
    () => createNoteIcon(note, themeColor, clusterCount, showTextLabels, pinSize, motion),
    [
      note.id,
      note.images?.[0],
      note.sketch,
      note.emoji,
      note.isFavorite,
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
  } = { click: onClick };
  if (onMouseEnter) eventHandlers.mouseover = onMouseEnter;
  if (onMouseLeave) eventHandlers.mouseout = onMouseLeave;
  if (onDragEnd) eventHandlers.dragend = onDragEnd;
  if (onDrag) eventHandlers.drag = onDrag;

  return (
    <Marker
      position={position}
      icon={icon}
      zIndexOffset={zIndexOffset}
      draggable={draggable}
      interactive={interactive}
      eventHandlers={eventHandlers}
    />
  );
});
