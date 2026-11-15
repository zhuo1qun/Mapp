import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import type { Frame, Note } from '../../types';
import { BoardNoteObject } from '../note/BoardNoteObject';
import { noteRendersAsBoardSticker } from '../../utils/persistence/mediaDisplay';
import { findFrameContainingNoteCenter } from '../../utils/frame/boardFrameMembership';
import { resolveBoardNoteRenderPose } from '../../utils/board/boardNoteRenderPose';
import { isNoteBoardPlaced } from '../../utils/note/notePlacement';
import { sortNotesByBoardLayer } from '../../utils/board/boardLayerOrder';

type BoardPoint = { x: number; y: number };
type ImagePreview = { id: string; x: number; y: number; width: number; height: number } | null;

interface BoardNoteLayerProps {
  notes: Note[];
  frames: Frame[];
  leavingNoteIds: Set<string>;
  isNoteVisible: (note: Note) => boolean;
  showImages: boolean;
  showNotes: boolean;
  workspaceEditMode: boolean;
  standardSizeScale: number;
  selectedNoteId: string | null;
  selectedNoteIds: Set<string>;
  draggingNoteId: string | null;
  dragOffset: BoardPoint | null;
  isMultiSelectDragging: boolean;
  multiSelectDragOffset: BoardPoint | null;
  imageResizePreview: ImagePreview;
  selectionScalePreview: Map<string, { boardX: number; boardY: number }> | null;
  introNoteId: string | null;
  introNoteMotion: 'enter' | 'exit';
  enteringNoteIds: Set<string>;
  deletingNoteIds: Set<string>;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>, id: string, note: Note) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLDivElement>, note: Note) => void;
  onPointerCancel: () => void;
  consumeSuppressedClick: (noteId: string) => boolean;
  onClick: (event: ReactMouseEvent, note: Note) => void;
  onDoubleClick: (event: ReactMouseEvent, note: Note) => void;
}

export function BoardNoteLayer({
  notes,
  frames,
  leavingNoteIds,
  isNoteVisible,
  showImages,
  showNotes,
  workspaceEditMode,
  standardSizeScale,
  selectedNoteId,
  selectedNoteIds,
  draggingNoteId,
  dragOffset,
  isMultiSelectDragging,
  multiSelectDragOffset,
  imageResizePreview,
  selectionScalePreview,
  introNoteId,
  introNoteMotion,
  enteringNoteIds,
  deletingNoteIds,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  consumeSuppressedClick,
  onClick,
  onDoubleClick
}: BoardNoteLayerProps) {
  return (
    <>
      {sortNotesByBoardLayer(notes)
        .filter(isNoteBoardPlaced)
        .filter((note) => !leavingNoteIds.has(note.id))
        .filter(isNoteVisible)
        .map((note) => {
          const isImage = noteRendersAsBoardSticker(note);
          if ((isImage && !showImages) || (!isImage && !showNotes)) return null;

          const isDragging = draggingNoteId === note.id;
          const isInMultiSelect = selectedNoteIds.has(note.id);
          const motionClass =
            introNoteId === note.id && introNoteMotion === 'exit'
              ? 'board-note-motion--exit'
              : deletingNoteIds.has(note.id)
                ? 'board-note-motion--exit'
                : enteringNoteIds.has(note.id)
                  ? 'board-note-motion--enter'
                  : '';
          const resizePreview = imageResizePreview?.id === note.id ? imageResizePreview : null;
          const pose = resolveBoardNoteRenderPose(note, {
            imageResizePreview: resizePreview,
            selectionScalePreview: selectionScalePreview?.get(note.id),
            isDragging,
            dragOffset,
            isMultiSelectDragging,
            isInMultiSelect,
            multiSelectDragOffset
          });
          const isInFrame = Boolean(findFrameContainingNoteCenter(note, note.boardX, note.boardY, frames));
          const selected = selectedNoteId === note.id || isInMultiSelect;
          // 临时浮到最高层只由“已选中”决定；单纯 pressdown / dragging 不再改层级。
          const zIndex = selected ? 1000 : 50;
          const commonProps = {
            'data-is-note': 'true',
            onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => onPointerDown(event, note.id, note),
            onPointerMove,
            onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => {
              // A multi-card drag owns its release. Keep the canvas controller from
              // interpreting the same bubbling event as an empty-canvas pointer-up.
              if (isMultiSelectDragging) event.stopPropagation();
              onPointerUp(event, note);
            },
            onPointerCancel,
            onClick: (event: ReactMouseEvent) => {
              if (consumeSuppressedClick(note.id)) {
                event.preventDefault();
                event.stopPropagation();
                return;
              }
              onClick(event, note);
            },
            onDoubleClick: (event: ReactMouseEvent) => onDoubleClick(event, note)
          };

          return (
            <BoardNoteObject
              key={note.id}
              note={note}
              selected={selected}
              active={isDragging || selected}
              isInFrame={isInFrame}
              staticInteraction={!!resizePreview || isDragging || (isMultiSelectDragging && isInMultiSelect)}
              contentWidth={pose.width - 48}
              className={`pointer-events-auto ${motionClass} ${workspaceEditMode ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
              style={{
                position: 'absolute', left: pose.x, top: pose.y, zIndex,
                width: pose.width, height: pose.height,
                transform: `scale(${standardSizeScale})`, transformOrigin: 'center'
              }}
              rootProps={commonProps}
            />
          );
        })}
    </>
  );
}
