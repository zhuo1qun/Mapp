import React, { forwardRef, useCallback, useImperativeHandle, useRef, type CSSProperties, type ElementType, type ReactNode } from 'react';
import type { Note } from '../../types';
import { noteOrderedDisplayMediaSources, noteRendersAsBoardSticker } from '../../utils/persistence/mediaDisplay';
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
  overlay?: ReactNode;
};

export function boardNoteMediaSource(note: Note): string | null {
  return noteOrderedDisplayMediaSources(note)[0] || null;
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
  fallbackMedia,
  overlay
}, ref) {
  const rootRef = useRef<HTMLElement | null>(null);
  const stickerImageRef = useRef<HTMLImageElement | null>(null);
  const alphaMapRef = useRef<{ data: Uint8ClampedArray; width: number; height: number } | null>(null);
  useImperativeHandle(ref, () => rootRef.current as HTMLElement);
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

  const refreshAlphaMap = useCallback(() => {
    const image = stickerImageRef.current;
    if (!image || !image.naturalWidth || !image.naturalHeight) return;
    const scale = Math.min(1, 256 / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return;
    try {
      context.drawImage(image, 0, 0, width, height);
      alphaMapRef.current = { data: context.getImageData(0, 0, width, height).data, width, height };
    } catch {
      // 跨域远程图无法读取像素时保留矩形命中，不影响对象基本操作。
      alphaMapRef.current = null;
    }
  }, []);

  const isTransparentPoint = useCallback((clientX: number, clientY: number) => {
    const root = rootRef.current;
    const image = stickerImageRef.current;
    const alphaMap = alphaMapRef.current;
    if (!root || !image || !alphaMap) return false;
    const rect = root.getBoundingClientRect();
    const sourceAspect = image.naturalWidth / image.naturalHeight;
    const boxAspect = rect.width / rect.height;
    const drawWidth = sourceAspect > boxAspect ? rect.width : rect.height * sourceAspect;
    const drawHeight = sourceAspect > boxAspect ? rect.width / sourceAspect : rect.height;
    const left = rect.left + (rect.width - drawWidth) / 2;
    const top = rect.top + (rect.height - drawHeight) / 2;
    const nx = (clientX - left) / drawWidth;
    const ny = (clientY - top) / drawHeight;
    if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return true;
    const x = Math.min(alphaMap.width - 1, Math.max(0, Math.floor(nx * alphaMap.width)));
    const y = Math.min(alphaMap.height - 1, Math.max(0, Math.floor(ny * alphaMap.height)));
    return alphaMap.data[(y * alphaMap.width + x) * 4 + 3] <= 12;
  }, []);

  const forwardThroughTransparentPixel = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (!isSticker || !isTransparentPoint(event.clientX, event.clientY)) return;
    const root = rootRef.current;
    if (!root) return;
    event.preventDefault();
    event.stopPropagation();
    const previous = root.style.pointerEvents;
    root.style.pointerEvents = 'none';
    const underneath = document.elementFromPoint(event.clientX, event.clientY);
    root.style.pointerEvents = previous;
    if (!underneath || root.contains(underneath)) return;
    const native = event.nativeEvent;
    underneath.dispatchEvent(new PointerEvent(native.type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: native.pointerId,
      pointerType: native.pointerType,
      isPrimary: native.isPrimary,
      clientX: native.clientX,
      clientY: native.clientY,
      screenX: native.screenX,
      screenY: native.screenY,
      button: native.button,
      buttons: native.buttons,
      ctrlKey: native.ctrlKey,
      shiftKey: native.shiftKey,
      altKey: native.altKey,
      metaKey: native.metaKey,
      pressure: native.pressure
    }));
  }, [isSticker, isTransparentPoint]);

  return (
    <Root
      {...rootProps}
      ref={rootRef}
      data-board-selected={selected ? 'true' : undefined}
      className={interactionClass}
      style={style}
      onPointerDownCapture={forwardThroughTransparentPixel}
    >
      {isSticker ? (
        <div className={`flex h-full w-full flex-col overflow-visible rounded-sm transition-shadow ${isInFrame ? 'ring-4 ring-[#EEEEEE]' : ''}`}>
          <div className="relative flex h-full w-full items-center justify-center bg-transparent">
            {src ? (
              <img
                ref={stickerImageRef}
                src={src}
                referrerPolicy="no-referrer"
                draggable={false}
                className="board-sticker-elevation pointer-events-none h-full w-full object-contain"
                alt=""
                onLoad={refreshAlphaMap}
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
      {overlay}
    </Root>
  );
});
