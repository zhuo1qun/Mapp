import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Note } from '../../../types';
import { noteRendersAsBoardSticker } from '../../../utils/persistence/mediaDisplay';
import { BoardMultiSelectToolbar } from '../../board/BoardMultiSelectToolbar';
import { BoardPaperNoteContent } from '../../note/BoardPaperNoteContent';
import { BoardNoteObject, boardNoteMediaSource } from '../../note/BoardNoteObject';

type Props = {
  open: boolean;
  notes: Note[];
  themeColor: string;
  chromeSurfaceStyle: React.CSSProperties;
  /** 地图图钉拖拽用它判断是否正悬停在待定位箱上。 */
  panelRef?: React.RefObject<HTMLElement | null>;
  /** 不依赖原生 HTML 拖拽，供 Leaflet 图钉拖动时提供接收态反馈。 */
  isDropTarget?: boolean;
  /** 多选图钉移入时显示本次会被暂存的数量。 */
  dropCount?: number;
  /** 每个视图拥有自己的落点画布，避免跨视图拖拽被误接收。 */
  placementDragMime: string;
  /** Board 拖拽预览按当前画布倍率显示；地图不传，沿用待定箱本身尺寸。 */
  boardDragPreviewScale?: number;
  onDeleteSelected?: (noteIds: string[]) => void;
  onDropFiles?: (files: FileList) => void;
  isDark?: boolean;
};

type DepartingCard = {
  id: string;
  note: Note;
  rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>;
  isSticker: boolean;
};

const UNPLACED_DROP_ACCEPTED_EVENT = 'mapp:unplaced-note-drop-accepted';
const UNPLACED_POINTER_DROP_EVENT = 'mapp:unplaced-note-pointer-drop';

type PointerCardDrag = { note: Note; noteIds: string[]; pointerId: number; startX: number; startY: number; clientX: number; clientY: number; active: boolean };

function mediaSource(note: Note): string | null {
  const src = boardNoteMediaSource(note);
  return src && /^(data:|blob:|https?:)/.test(src) ? src : null;
}

/**
 * 待定位箱不是 Board 画布：图片没有纸张边框，因此允许比普通方形便签略大。
 */
function trayCardSize(note: Note, isSticker: boolean): { width: number; height: number } {
  if (!isSticker) return { width: 144, height: 144 };
  const sourceWidth = Math.max(1, note.imageWidth || 256);
  const sourceHeight = Math.max(1, note.imageHeight || 256);
  const ratio = Math.max(sourceWidth / sourceHeight, sourceHeight / sourceWidth);
  // 1:1 约为 152px；2:1 达到 176px，仍能落在桌面窄箱的可用宽度内。
  const targetLongest = Math.min(176, Math.round(152 + (ratio - 1) * 32));
  const scale = targetLongest / Math.max(sourceWidth, sourceHeight);
  return {
    width: Math.max(72, Math.round(sourceWidth * scale)),
    height: Math.max(72, Math.round(sourceHeight * scale))
  };
}

/**
 * 编辑地图时集中处理尚未具有有效经纬度的历史便签。
 * 这里有意只呈现 Board 同款卡片：点选即进入「下一次点地图落位」状态，
 * 桌面端仍可直接把卡片拖到地图上。
 */
export function UnplacedNotesSidebar({
  open,
  notes,
  themeColor,
  chromeSurfaceStyle,
  panelRef,
  isDropTarget = false,
  dropCount = 0,
  placementDragMime,
  boardDragPreviewScale,
  onDeleteSelected,
  onDropFiles,
  isDark = false
}: Props) {
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(() => new Set());
  const [lastSelectedNoteId, setLastSelectedNoteId] = useState<string | null>(null);
  const [draggedNoteIds, setDraggedNoteIds] = useState<Set<string>>(() => new Set());
  const [settlingDraggedNoteIds, setSettlingDraggedNoteIds] = useState<Set<string>>(() => new Set());
  const [isFileDropTarget, setIsFileDropTarget] = useState(false);
  const skipDepartureForDraggedIdsRef = useRef(new Set<string>());
  const dragReleaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 箱外点击收成一叠；箱内不再用空白点击切换，避免抢占滚动与拖动手势。 */
  const [isExpanded, setIsExpanded] = useState(true);
  const [isMounted, setIsMounted] = useState(open);
  const [isVisible, setIsVisible] = useState(false);
  const unusedToolbarRef = useRef<HTMLButtonElement | null>(null);
  const cardRefs = useRef(new Map<string, HTMLDivElement>());
  const cardRectsRef = useRef(new Map<string, DOMRect>());
  const priorCardRectsRef = useRef(new Map<string, DOMRect>());
  const previousNotesRef = useRef<Note[]>([]);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const panelTransitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [departingCards, setDepartingCards] = useState<DepartingCard[]>([]);
  const pointerCardDragRef = useRef<PointerCardDrag | null>(null);
  const [pointerCardDrag, setPointerCardDrag] = useState<PointerCardDrag | null>(null);
  const suppressCardClickRef = useRef<string | null>(null);
  /** 最新加入的记录始终排在最前；叠起时它也是唯一可直接拖动的对象。 */
  const orderedNotes = useMemo(
    () =>
      notes
        .map((note, sourceIndex) => ({ note, sourceIndex }))
        .sort(
          (a, b) =>
            (b.note.unplacedOrder ?? b.note.createdAt ?? 0) -
              (a.note.unplacedOrder ?? a.note.createdAt ?? 0) ||
            b.sourceIndex - a.sourceIndex
        )
        .map(({ note }) => note),
    [notes]
  );
  const visibleOrderedNotes = useMemo(
    () => orderedNotes.filter((note) => !settlingDraggedNoteIds.has(note.id)),
    [orderedNotes, settlingDraggedNoteIds]
  );
  const selectedIds = useMemo(
    () => visibleOrderedNotes.map((note) => note.id).filter((id) => selectedNoteIds.has(id)),
    [visibleOrderedNotes, selectedNoteIds]
  );
  const cardLayoutKey = visibleOrderedNotes.map((note) => note.id).join('|');
  const receivingDrop = isDropTarget || isFileDropTarget;

  useEffect(() => {
    if (!open) setIsFileDropTarget(false);
  }, [open]);

  useEffect(() => {
    if (panelTransitionTimerRef.current) {
      clearTimeout(panelTransitionTimerRef.current);
      panelTransitionTimerRef.current = null;
    }
    if (open) {
      setIsMounted(true);
      // 两帧：先让离屏初态真正绘制，再切到在场态；否则 React 批处理会吞掉过渡。
      setIsVisible(false);
      let enterFrame: number | null = requestAnimationFrame(() => {
        enterFrame = requestAnimationFrame(() => setIsVisible(true));
      });
      return () => {
        if (enterFrame !== null) cancelAnimationFrame(enterFrame);
      };
    }
    setIsVisible(false);
    panelTransitionTimerRef.current = setTimeout(() => {
      setIsMounted(false);
      panelTransitionTimerRef.current = null;
    }, 220);
    return () => {
      if (panelTransitionTimerRef.current) clearTimeout(panelTransitionTimerRef.current);
    };
  }, [open]);

  /**
   * 卡片的叠放位置属于外层；动效只施加在内层，避免 WAAPI 覆盖叠放用的 transform。
   * 这样新卡落到顶层、其余卡片错位下沉，以及顶卡被取走后露出的下一张，都是同一段连续运动。
   */
  useLayoutEffect(() => {
    if (!isVisible || typeof window === 'undefined') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const previous = cardRectsRef.current;
    const next = new Map<string, DOMRect>();
    const orderedIds = visibleOrderedNotes.map((note) => note.id);

    orderedIds.forEach((id, index) => {
      const card = cardRefs.current.get(id);
      if (!card) return;
      const motionLayer = card.querySelector<HTMLElement>('[data-unplaced-card-motion]');
      if (!motionLayer) return;
      const rect = card.getBoundingClientRect();
      next.set(id, rect);
      const prior = previous.get(id);
      if (!prior) {
        const isTopCard = index === 0;
        motionLayer.animate(
          [
            {
              opacity: 0,
              translate: isTopCard ? '-14px -24px' : '0px 10px',
              scale: isTopCard ? '0.92' : '0.96'
            },
            { opacity: 1, translate: '0px 0px', scale: '1' }
          ],
          {
            duration: 250,
            delay: Math.min(index, 7) * 24,
            easing: 'cubic-bezier(0.22, 1, 0.36, 1)'
          }
        );
        return;
      }
      const dx = prior.left - rect.left;
      const dy = prior.top - rect.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      motionLayer.animate(
        [
          { translate: `${dx}px ${dy}px`, scale: '0.98' },
          { translate: '0px 0px', scale: '1' }
        ],
        { duration: 280, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
      );
    });
    // 留下变化前的快照给随后卸载的卡片做“取下”退场副本。
    priorCardRectsRef.current = previous;
    cardRectsRef.current = next;
  }, [cardLayoutKey, isExpanded, isVisible, visibleOrderedNotes]);

  /** 已从箱中拖走的顶卡保留一个短暂的视觉副本，形成“取下”而非直接消失的反馈。 */
  useLayoutEffect(() => {
    if (!isVisible) {
      previousNotesRef.current = visibleOrderedNotes;
      return;
    }
    const nextIds = new Set(visibleOrderedNotes.map((note) => note.id));
    const removed = previousNotesRef.current.flatMap((note) => {
      if (nextIds.has(note.id)) return [];
      // 原生拖拽预览本身就是这一段移动动画；成功投放后不再叠一层退场副本。
      if (skipDepartureForDraggedIdsRef.current.delete(note.id)) return [];
      const rect = priorCardRectsRef.current.get(note.id) ?? cardRectsRef.current.get(note.id);
      return rect
        ? [{ id: note.id, note, rect, isSticker: noteRendersAsBoardSticker(note) }]
        : [];
    });
    if (removed.length) {
      setDepartingCards((current) => [
        ...current.filter((card) => !removed.some((removedCard) => removedCard.id === card.id)),
        ...removed
      ]);
    }
    previousNotesRef.current = visibleOrderedNotes;
  }, [cardLayoutKey, isVisible, visibleOrderedNotes]);

  useEffect(() => () => {
    if (dragReleaseTimerRef.current) clearTimeout(dragReleaseTimerRef.current);
  }, []);

  useEffect(() => {
    setSelectedNoteIds((current) => {
      const available = new Set(notes.map((note) => note.id));
      const next = new Set([...current].filter((id) => available.has(id)));
      return next.size === current.size ? current : next;
    });
    setLastSelectedNoteId((current) =>
      current && notes.some((note) => note.id === current) ? current : null
    );
  }, [notes]);

  /** 落点接收后源卡立即隐去，避免 native dragend 先把它恢复一帧。 */
  useEffect(() => {
    const handleDropAccepted = (event: Event) => {
      const detail = (event as CustomEvent<{ placementDragMime?: string; noteIds?: unknown }>).detail;
      if (detail?.placementDragMime !== placementDragMime || !Array.isArray(detail.noteIds)) return;
      const ids = detail.noteIds.filter((id): id is string => typeof id === 'string');
      if (ids.length) setSettlingDraggedNoteIds((current) => new Set([...current, ...ids]));
    };
    window.addEventListener(UNPLACED_DROP_ACCEPTED_EVENT, handleDropAccepted);
    return () => window.removeEventListener(UNPLACED_DROP_ACCEPTED_EVENT, handleDropAccepted);
  }, [placementDragMime]);

  useEffect(() => {
    setSettlingDraggedNoteIds((current) => {
      const available = new Set(notes.map((note) => note.id));
      const next = new Set([...current].filter((id) => available.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [notes]);

  /** 仅箱外点击会收起；箱内任何按压都保留给滚动、选择和拖拽。 */
  useEffect(() => {
    if (!isExpanded || !panelRef) return;
    const collapseOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && panelRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest('[data-transient-scope="unplaced-notes"]')) return;
      setIsExpanded(false);
      setSelectedNoteIds(new Set());
      setLastSelectedNoteId(null);
    };
    document.addEventListener('pointerdown', collapseOnOutsidePointer, true);
    return () => document.removeEventListener('pointerdown', collapseOnOutsidePointer, true);
  }, [isExpanded, panelRef]);

  const selectNote = (noteId: string, additive: boolean) => {
    const next = additive ? new Set(selectedNoteIds) : new Set<string>();
    if (additive && next.has(noteId)) next.delete(noteId);
    else next.add(noteId);
    setSelectedNoteIds(next);
    setLastSelectedNoteId(
      next.has(noteId) ? noteId : Array.from(next).at(-1) ?? null
    );
  };

  const clearSelection = () => {
    setSelectedNoteIds(new Set());
    setLastSelectedNoteId(null);
  };

  const setBoardSizedDragPreview = (
    event: React.DragEvent<HTMLButtonElement>,
    note: Note,
    isSticker: boolean
  ): { width: number; height: number } | undefined => {
    if (!boardDragPreviewScale || !Number.isFinite(boardDragPreviewScale) || typeof document === 'undefined') {
      return undefined;
    }
    const baseWidth = isSticker ? Math.max(1, note.imageWidth || 256) : 256;
    const baseHeight = isSticker ? Math.max(1, note.imageHeight || 256) : 256;
    const width = Math.round(baseWidth * boardDragPreviewScale);
    const height = Math.round(baseHeight * boardDragPreviewScale);
    const preview = document.createElement('div');
    const cardClone = event.currentTarget.cloneNode(true) as HTMLElement;
    preview.style.cssText = `position:fixed;left:-10000px;top:-10000px;width:${width}px;height:${height}px;pointer-events:none;overflow:visible;`;
    cardClone.style.width = `${baseWidth}px`;
    cardClone.style.height = `${baseHeight}px`;
    cardClone.style.maxWidth = 'none';
    cardClone.style.transform = `scale(${boardDragPreviewScale})`;
    cardClone.style.transformOrigin = 'top left';
    preview.appendChild(cardClone);
    document.body.appendChild(preview);
    event.dataTransfer.setDragImage(preview, width / 2, height / 2);
    requestAnimationFrame(() => preview.remove());
    return { width, height };
  };

  const toolbarNoteIds = isExpanded ? selectedIds : [];
  const stackNotes = visibleOrderedNotes.slice(0, 4);
  const renderedNotes = isExpanded ? visibleOrderedNotes : stackNotes;
  /**
   * 收起态不再用固定正方形占位。按当前可见的叠放卡片反算边界，
   * 让左上角作为叠放原点只服务于层次关系，而不会留下大块空白。
   */
  const collapsedTraySize = useMemo(() => {
    const stackOffset = 6;
    const padding = 16 * 2;
    const minimum = 112;
    let contentWidth = 0;
    let contentHeight = 0;

    stackNotes.forEach((note, index) => {
      const size = trayCardSize(note, noteRendersAsBoardSticker(note));
      contentWidth = Math.max(contentWidth, size.width + index * stackOffset);
      contentHeight = Math.max(contentHeight, size.height + index * stackOffset);
    });

    return {
      width: Math.max(minimum, Math.ceil(contentWidth + padding)),
      height: Math.max(minimum, Math.ceil(contentHeight + padding))
    };
  }, [stackNotes]);
  const panelStyle = {
    ...chromeSurfaceStyle,
    '--unplaced-collapsed-width': `${collapsedTraySize.width}px`,
    '--unplaced-collapsed-height': `${collapsedTraySize.height}px`,
    ...(receivingDrop ? { '--unplaced-drop-color': themeColor } : null)
  } as React.CSSProperties;

  if (!isMounted) return null;

  return (
    <aside
      ref={panelRef}
      data-unplaced-notes-sidebar
      className={`fixed z-[450] overflow-hidden border border-gray-200/90 backdrop-blur-md transition-[width,height,transform,opacity,box-shadow,background-color] duration-[220ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
        isExpanded
          ? 'bottom-[max(1rem,calc(env(safe-area-inset-bottom,0px)+1rem))] left-4 right-4 h-[min(12rem,38dvh)] max-h-none rounded-2xl shadow-[0_-4px_24px_rgba(0,0,0,0.06)] lg:inset-auto lg:bottom-4 lg:right-4 lg:top-20 lg:h-auto lg:w-52 lg:rounded-2xl lg:shadow-[-4px_4px_24px_rgba(0,0,0,0.08)]'
          : 'bottom-[max(1rem,calc(env(safe-area-inset-bottom,0px)+1rem))] left-4 h-[var(--unplaced-collapsed-height)] w-[min(var(--unplaced-collapsed-width),calc(100vw-2rem))] rounded-2xl shadow-[-4px_4px_24px_rgba(0,0,0,0.08)] lg:bottom-4 lg:left-auto lg:right-4 lg:h-[13rem] lg:w-52'
      } ${
        isVisible
          ? 'pointer-events-auto translate-y-0 opacity-100 lg:translate-x-0'
          : 'pointer-events-none translate-y-full opacity-0 lg:translate-x-[calc(100%+1rem)] lg:translate-y-0'
      } ${
        receivingDrop ? 'unplaced-notes-panel--drop-target bg-white/20' : ''
      }`}
      style={panelStyle}
      aria-label="待定位箱"
      aria-expanded={isExpanded}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerMove={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
      onPointerCancel={(event) => event.stopPropagation()}
    >
      {isDropTarget && dropCount > 0 ? (
        <div
          className="pointer-events-none absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-full px-3 py-1 text-xs font-bold text-white shadow-md"
          style={{ backgroundColor: themeColor }}
        >
          暂存 {dropCount} 项
        </div>
      ) : null}
      <div
        className={`h-full p-4 ${
          isExpanded
            ? 'overflow-x-auto overflow-y-hidden snap-x snap-mandatory lg:overflow-x-hidden lg:overflow-y-auto lg:snap-none'
            : 'overflow-hidden'
        }`}
        onDragOver={(event) => {
          if (!onDropFiles || !event.dataTransfer.files.length) return;
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = 'copy';
          setIsFileDropTarget(true);
        }}
        onDragEnter={(event) => {
          if (!onDropFiles || !event.dataTransfer.files.length) return;
          event.preventDefault();
          event.stopPropagation();
          setIsFileDropTarget(true);
        }}
        onDragLeave={(event) => {
          const nextTarget = event.relatedTarget;
          if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
          setIsFileDropTarget(false);
        }}
        onDrop={(event) => {
          const files = event.dataTransfer.files;
          setIsFileDropTarget(false);
          if (!onDropFiles || !files.length) return;
          event.preventDefault();
          event.stopPropagation();
          onDropFiles(files);
        }}
      >
        <div
          ref={contentRef}
          className={
            isExpanded
              ? 'relative grid h-full grid-flow-col auto-cols-max grid-rows-1 content-start justify-start gap-3 lg:h-auto lg:grid-flow-row lg:grid-cols-1 lg:grid-rows-none lg:justify-items-center'
              : 'relative h-full w-full'
          }
        >
          {renderedNotes.map((note, index) => {
            const selected = selectedNoteIds.has(note.id);
            const isTopStackCard = !isExpanded && index === 0;
            const canInteractWithCard = isExpanded || isTopStackCard;
            const isSticker = noteRendersAsBoardSticker(note);
            const src = mediaSource(note);
            const cardSize = trayCardSize(note, isSticker);
            // 待定箱保留 Board 的 256px 纸质便签作为真实内部尺寸，再整体缩放。
            // 这样字号、内边距、图标和标签会和 Board 成比例，而非只缩小外盒。
            const displayScale = isExpanded ? 0.78 : 1;
            const displayCardSize = {
              width: Math.max(1, Math.round(cardSize.width * displayScale)),
              height: Math.max(1, Math.round(cardSize.height * displayScale))
            };
            const paperScale = isSticker ? 1 : displayCardSize.width / 256;
            const cardStyle: React.CSSProperties = {
              borderColor: 'transparent',
              // Board 的图片是独立贴纸，而不是被白色卡片包住。
              ...(isSticker ? null : { backgroundColor: '#FFFDF5' }),
              ...(isSticker ? displayCardSize : {
                width: 256,
                height: 256,
                transform: `scale(${paperScale})`,
                transformOrigin: 'top left'
              })
            };
            const stackCardShellStyle: React.CSSProperties | undefined = !isExpanded
              ? {
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: displayCardSize.width,
                  height: displayCardSize.height,
                  transform: `translate(${index * 6}px, ${index * 6}px)`,
                  zIndex: stackNotes.length - index,
                  pointerEvents: canInteractWithCard ? 'auto' : 'none'
                }
              : undefined;
            return (
              <div
                key={note.id}
                ref={(element) => {
                  if (element) cardRefs.current.set(note.id, element);
                  else cardRefs.current.delete(note.id);
                }}
                className={`unplaced-note-card relative w-fit max-w-full snap-start transition-transform duration-200 ${
                  draggedNoteIds.has(note.id) ? 'unplaced-note-card--dragging' : ''
                }`}
                style={{ width: displayCardSize.width, height: displayCardSize.height, ...stackCardShellStyle }}
              >
                <div data-unplaced-card-motion className="h-full w-full">
                  <BoardNoteObject
                    note={note}
                    selected={selected}
                    contentWidth={208}
                    rootAs="button"
                    paperBackground="#FFFDF5"
                    mediaSrc={src}
                    expandedContent={false}
                    fallbackMedia={<span className="text-5xl">{note.emoji || '🖼️'}</span>}
                    className="relative box-border touch-none border-[3px] text-left focus-visible:outline-none"
                    style={cardStyle}
                    rootProps={{
                      type: 'button',
                      draggable: canInteractWithCard,
                      'aria-pressed': selected,
                      onDragStart: (event: React.DragEvent<HTMLButtonElement>) => {
                        if (!canInteractWithCard) {
                          event.preventDefault();
                          return;
                        }
                        event.dataTransfer.effectAllowed = 'move';
                        const draggedIds = selected ? selectedIds : [note.id];
                        setBoardSizedDragPreview(event, note, isSticker);
                        draggedIds.forEach((id) => skipDepartureForDraggedIdsRef.current.add(id));
                        setDraggedNoteIds(new Set(draggedIds));
                        event.dataTransfer.setData(placementDragMime, JSON.stringify(draggedIds));
                        event.dataTransfer.setData('text/plain', draggedIds.join(','));
                      },
                      onDragEnd: () => {
                        setDraggedNoteIds(new Set());
                        if (dragReleaseTimerRef.current) clearTimeout(dragReleaseTimerRef.current);
                        dragReleaseTimerRef.current = setTimeout(() => {
                          skipDepartureForDraggedIdsRef.current.clear();
                          dragReleaseTimerRef.current = null;
                        }, 500);
                      },
                      onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
                        if (!canInteractWithCard || event.pointerType === 'mouse') return;
                        // 触屏使用即时 pointer 拖动，关闭浏览器需要长按才启动的原生 drag。
                        event.currentTarget.draggable = false;
                        const noteIds = selected ? selectedIds : [note.id];
                        const drag = { note, noteIds, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, clientX: event.clientX, clientY: event.clientY, active: false };
                        pointerCardDragRef.current = drag;
                        event.currentTarget.setPointerCapture(event.pointerId);
                      },
                      onPointerMove: (event: React.PointerEvent<HTMLButtonElement>) => {
                        const current = pointerCardDragRef.current;
                        if (!current || current.pointerId !== event.pointerId) return;
                        const active = current.active || Math.hypot(event.clientX - current.startX, event.clientY - current.startY) >= 6;
                        const next = { ...current, clientX: event.clientX, clientY: event.clientY, active };
                        pointerCardDragRef.current = next;
                        if (active) {
                          event.preventDefault();
                          suppressCardClickRef.current = note.id;
                          setPointerCardDrag(next);
                          setDraggedNoteIds(new Set(next.noteIds));
                        }
                      },
                      onPointerUp: (event: React.PointerEvent<HTMLButtonElement>) => {
                        const current = pointerCardDragRef.current;
                        if (!current || current.pointerId !== event.pointerId) return;
                        if (current.active) {
                          window.dispatchEvent(new CustomEvent(UNPLACED_POINTER_DROP_EVENT, { detail: { placementDragMime, noteIds: current.noteIds, clientX: event.clientX, clientY: event.clientY } }));
                        }
                        pointerCardDragRef.current = null;
                        setPointerCardDrag(null);
                        setDraggedNoteIds(new Set());
                        event.currentTarget.draggable = canInteractWithCard;
                      },
                      onPointerCancel: (event: React.PointerEvent<HTMLButtonElement>) => {
                        pointerCardDragRef.current = null;
                        setPointerCardDrag(null);
                        setDraggedNoteIds(new Set());
                        event.currentTarget.draggable = canInteractWithCard;
                      },
                      onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
                        if (suppressCardClickRef.current === note.id) {
                          suppressCardClickRef.current = null;
                          return;
                        }
                        if (!isExpanded) {
                          setIsExpanded(true);
                          clearSelection();
                          return;
                        }
                        selectNote(note.id, event.shiftKey);
                      }
                    }}
                  />
                </div>
                {isExpanded && lastSelectedNoteId === note.id && toolbarNoteIds.length > 0 ? (
                  <BoardMultiSelectToolbar
                    themeColor={themeColor}
                    panelChromeStyle={chromeSurfaceStyle}
                    inverseCanvasScale={1}
                    isDark={isDark}
                    isEditMode
                    selectionCount={toolbarNoteIds.length}
                    multiBatchPanel="none"
                    showBatchActions={false}
                    showDelete={!!onDeleteSelected}
                    placeBelow={index === 0}
                    portal
                    portalAnchorElement={cardRefs.current.get(note.id)}
                    portalScope="unplaced-notes"
                    onExitMultiSelectToolbar={clearSelection}
                    onRunBatchDelete={() => {
                      onDeleteSelected?.(toolbarNoteIds);
                      clearSelection();
                    }}
                    onToggleBatchTagPanel={() => {}}
                    onToggleBatchTimePanel={() => {}}
                    browseTagFilterPanelOpen={false}
                    browseTimeFilterPanelOpen={false}
                    boardBrowseTagFilterButtonRef={unusedToolbarRef}
                    boardBrowseTimeFilterButtonRef={unusedToolbarRef}
                    onEnterEditModeFromBrowse={() => {}}
                    onOpenBrowseTagFilterPanel={() => {}}
                    onOpenBrowseTimeFilterPanel={() => {}}
                    editPanelNode={null}
                  />
                ) : null}
              </div>
            );
          })}
          {departingCards.map(({ id, note, rect, isSticker }) => {
            const contentRect = contentRef.current?.getBoundingClientRect();
            if (!contentRect) return null;
            const src = mediaSource(note);
            return (
              <div
                key={`departing-${id}`}
                className="unplaced-note-card unplaced-note-card--departing pointer-events-none absolute z-30"
                style={{
                  left: rect.left - contentRect.left,
                  top: rect.top - contentRect.top,
                  width: rect.width,
                  height: rect.height
                }}
                onAnimationEnd={() => {
                  setDepartingCards((current) => current.filter((card) => card.id !== id));
                }}
              >
                <div className="h-full w-full overflow-hidden">
                  {isSticker ? (
                    src ? <img src={src} alt="" className="board-sticker-elevation h-full w-full object-contain" /> : null
                  ) : (
                    <div
                      className="origin-top-left bg-[#FFFDF5] board-note-elevation"
                      style={{ width: 256, height: 256, transform: `scale(${rect.width / 256})` }}
                    >
                      <BoardPaperNoteContent note={note} contentWidth={208} />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {pointerCardDrag?.active && typeof document !== 'undefined' ? createPortal(
        <div className="pointer-events-none fixed z-[2000] h-36 w-36 -translate-x-1/2 -translate-y-1/2 opacity-90 drop-shadow-2xl" style={{ left: pointerCardDrag.clientX, top: pointerCardDrag.clientY }}>
          <BoardNoteObject note={pointerCardDrag.note} selected contentWidth={116} rootAs="div" paperBackground="#FFFDF5" mediaSrc={mediaSource(pointerCardDrag.note)} expandedContent={false} className="h-full w-full border-[3px]" style={{ width: 144, height: 144, backgroundColor: '#FFFDF5' }} />
        </div>,
        document.body
      ) : null}
    </aside>
  );
}
