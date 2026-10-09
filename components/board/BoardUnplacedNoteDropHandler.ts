import { useEffect } from 'react';
import type { RefObject } from 'react';

const UNPLACED_BOARD_NOTE_MIME = 'application/x-mapp-unplaced-board-note';
const UNPLACED_DROP_ACCEPTED_EVENT = 'mapp:unplaced-note-drop-accepted';

/**
 * 与地图的待定位落点一致：专用原生事件只接收待定箱卡片，
 * 不让 Board 的通用文件导入拖放参与这一次落点。
 */
export function useBoardUnplacedNoteDropHandler({
  canvasRef,
  enabled,
  onDropNotes,
  isIgnoredDropTarget
}: {
  canvasRef: RefObject<HTMLElement | null>;
  enabled: boolean;
  onDropNotes: (noteIds: string[], pointer: { clientX: number; clientY: number }) => void;
  /** 待定窗口本身不是画布落点，即使浏览器把 drag 事件重定向到画布也要排除。 */
  isIgnoredDropTarget?: (pointer: { clientX: number; clientY: number }) => boolean;
}) {
  useEffect(() => {
    if (!enabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const acceptsUnplacedNote = (event: DragEvent) =>
      !!event.dataTransfer?.types.includes(UNPLACED_BOARD_NOTE_MIME);
    const isWithinTray = (target: EventTarget | null) =>
      target instanceof Element && !!target.closest('[data-unplaced-notes-sidebar]');
    const isIgnored = (event: DragEvent) =>
      isWithinTray(event.target) ||
      isIgnoredDropTarget?.({ clientX: event.clientX, clientY: event.clientY }) === true;

    const onDragOver = (event: DragEvent) => {
      if (!acceptsUnplacedNote(event)) return;
      event.preventDefault();
      event.dataTransfer!.dropEffect = isIgnored(event) ? 'none' : 'move';
    };

    const onDrop = (event: DragEvent) => {
      if (!acceptsUnplacedNote(event)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (isIgnored(event)) return;
      const rawNoteIds = event.dataTransfer?.getData(UNPLACED_BOARD_NOTE_MIME);
      if (!rawNoteIds) return;
      let noteIds: string[] = [];
      try {
        const parsed: unknown = JSON.parse(rawNoteIds);
        noteIds = Array.isArray(parsed)
          ? parsed.filter((id): id is string => typeof id === 'string' && !!id)
          : [];
      } catch {
        return;
      }
      if (!noteIds.length) return;
      onDropNotes(noteIds, { clientX: event.clientX, clientY: event.clientY });
      window.dispatchEvent(
        new CustomEvent(UNPLACED_DROP_ACCEPTED_EVENT, {
          detail: { placementDragMime: UNPLACED_BOARD_NOTE_MIME, noteIds }
        })
      );
    };

    // capture 阶段先接手，阻止 React 的文件导入 onDrop 与本次落点竞争。
    canvas.addEventListener('dragover', onDragOver, true);
    canvas.addEventListener('drop', onDrop, true);
    return () => {
      canvas.removeEventListener('dragover', onDragOver, true);
      canvas.removeEventListener('drop', onDrop, true);
    };
  }, [canvasRef, enabled, isIgnoredDropTarget, onDropNotes]);
}
