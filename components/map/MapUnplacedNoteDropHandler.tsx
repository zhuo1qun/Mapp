import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import type { Coordinates } from '../../types';

const UNPLACED_NOTE_MIME = 'application/x-mapp-unplaced-note';
const UNPLACED_DROP_ACCEPTED_EVENT = 'mapp:unplaced-note-drop-accepted';
const UNPLACED_POINTER_DROP_EVENT = 'mapp:unplaced-note-pointer-drop';

/** 将桌面端「待定位箱」中的卡片拖入 Leaflet 画布时换算为经纬度。 */
export function MapUnplacedNoteDropHandler({
  enabled,
  onDropNotes
}: {
  enabled: boolean;
  onDropNotes: (noteIds: string[], coords: Coordinates) => void;
}) {
  const map = useMap();

  useEffect(() => {
    if (!enabled) return;
    const container = map.getContainer();
    const onDragOver = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes(UNPLACED_NOTE_MIME)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
    };
    const onDrop = (event: DragEvent) => {
      const rawNoteIds = event.dataTransfer?.getData(UNPLACED_NOTE_MIME);
      if (!rawNoteIds) return;
      let noteIds: string[] = [];
      try {
        const parsed: unknown = JSON.parse(rawNoteIds);
        noteIds = Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string' && !!id) : [];
      } catch {
        noteIds = [rawNoteIds]; // 兼容早期单条拖拽数据。
      }
      if (noteIds.length === 0) return;
      event.preventDefault();
      const rect = container.getBoundingClientRect();
      const point = [event.clientX - rect.left, event.clientY - rect.top] as [number, number];
      const latlng = map.containerPointToLatLng(point);
      onDropNotes(noteIds, { lat: latlng.lat, lng: latlng.lng });
      window.dispatchEvent(
        new CustomEvent(UNPLACED_DROP_ACCEPTED_EVENT, {
          detail: { placementDragMime: UNPLACED_NOTE_MIME, noteIds }
        })
      );
    };
    const onPointerDrop = (event: Event) => {
      const detail = (event as CustomEvent<{ placementDragMime?: string; noteIds?: string[]; clientX?: number; clientY?: number }>).detail;
      if (detail?.placementDragMime !== UNPLACED_NOTE_MIME || !Array.isArray(detail.noteIds)) return;
      const clientX = Number(detail.clientX);
      const clientY = Number(detail.clientY);
      const rect = container.getBoundingClientRect();
      if (!Number.isFinite(clientX) || !Number.isFinite(clientY) || clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return;
      const noteIds = detail.noteIds.filter((id): id is string => typeof id === 'string' && !!id);
      if (!noteIds.length) return;
      const latlng = map.containerPointToLatLng([clientX - rect.left, clientY - rect.top]);
      onDropNotes(noteIds, { lat: latlng.lat, lng: latlng.lng });
      window.dispatchEvent(new CustomEvent(UNPLACED_DROP_ACCEPTED_EVENT, { detail: { placementDragMime: UNPLACED_NOTE_MIME, noteIds } }));
    };
    container.addEventListener('dragover', onDragOver);
    container.addEventListener('drop', onDrop);
    window.addEventListener(UNPLACED_POINTER_DROP_EVENT, onPointerDrop);
    return () => {
      container.removeEventListener('dragover', onDragOver);
      container.removeEventListener('drop', onDrop);
      window.removeEventListener(UNPLACED_POINTER_DROP_EVENT, onPointerDrop);
    };
  }, [enabled, map, onDropNotes]);

  return null;
}
