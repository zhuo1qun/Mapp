import React, { forwardRef, type CSSProperties, type ElementType, type ReactNode } from 'react';
import type { Note } from '../../types';
import { noteRendersAsBoardSticker } from '../../utils/persistence/mediaDisplay';
import { noteHasRenderableMapPosition } from '../../utils/layer/unifiedNoteLayer';
import { BoardPaperNoteContent } from './BoardPaperNoteContent';
import { getExpandedNoteLayout } from '../../utils/note/expandedNoteLayout';

type Props = {
  note: Note;
  selected: boolean;
  active?: boolean;
  rootAs?: 'div' | 'button';
  rootProps?: Record<string, unknown>;
  className?: string;
  style?: CSSProperties;
  contentWidth: number;
  isInFrame?: boolean;
  staticInteraction?: boolean;
  paperBackground?: string;
  mediaSrc?: string | null;
  expandedContent?: boolean;
  fallbackMedia?: ReactNode;
};

export function boardNoteMediaSource(note: Note): string | null {
  const first = note.media?.[0];
  const src = first?.kind === 'sketch' ? note.sketch : note.images?.[0] || note.sketch;
  return src || null;
}

/** Board 与暂存框共用的完整对象壳：交互状态、纸片/贴纸结构和投影只在这里定义。 */
export const BoardNoteObject = forwardRef<HTMLElement, Props>(function BoardNoteObject({
  note,
  selected,
  active = selected,
  rootAs = 'div',
  rootProps,
  className = '',
  style,
  contentWidth,
  isInFrame = false,
  staticInteraction = false,
  paperBackground,
  mediaSrc,
  expandedContent,
  fallbackMedia
}, ref) {
  const Root = rootAs as ElementType;
  const isSticker = noteRendersAsBoardSticker(note);
  const src = mediaSrc === undefined ? boardNoteMediaSource(note) : mediaSrc;
  const backgroundColor = paperBackground ?? (
    noteHasRenderableMapPosition(note) ? note.color || '#FFFFFF' : '#FFFDF5'
  );
  const usesExpandedContent = expandedContent ?? note.boardSize === 'expanded';
  const expandedLayout = usesExpandedContent ? getExpandedNoteLayout(note) : null;
  const interactionClass = [
    'board-note-interaction workspace-object-elevation workspace-object-elevation--interactive group',
    active ? 'workspace-object-elevation--active' : '',
    staticInteraction ? 'board-note-interaction--static' : '',
    className
  ].filter(Boolean).join(' ');

  return (
    <Root
      {...rootProps}
      ref={ref}
      data-board-selected={selected ? 'true' : undefined}
      className={interactionClass}
      style={style}
    >
      {isSticker ? (
        <div className={`flex h-full w-full flex-col overflow-visible rounded-sm transition-shadow ${isInFrame ? 'ring-4 ring-[#EEEEEE]' : ''}`}>
          <div className="relative flex h-full w-full items-center justify-center bg-transparent">
            {src ? (
              <img
                src={src}
                referrerPolicy="no-referrer"
                draggable={false}
                className="board-sticker-elevation pointer-events-none h-full w-full object-contain"
                alt=""
              />
            ) : fallbackMedia}
          </div>
        </div>
      ) : (
        <div
          className={`board-note-elevation flex h-full w-full flex-col overflow-hidden rounded-sm transition-shadow ${isInFrame ? 'ring-4 ring-[#EEEEEE]' : ''}`}
          style={{ backgroundColor }}
        >
          <BoardPaperNoteContent
            note={note}
            contentWidth={contentWidth}
            expanded={usesExpandedContent}
            detailLineCount={expandedLayout?.detailLineCount}
          />
        </div>
      )}
    </Root>
  );
});
