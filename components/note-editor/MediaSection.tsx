import React, { useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { NoteMediaItem } from '../../types';
import { isDisplayableImageSrc } from '../../utils/persistence/mediaDisplay';

/** 槽位略大于图，给 drop-shadow（跟像素 alpha）留边，避免被横向滚动裁切 */
const THUMB_SLOT =
  'relative w-[5.25rem] h-[5.25rem] flex items-center justify-center flex-shrink-0 overflow-visible';
const THUMB_IMG =
  'max-w-[4.25rem] max-h-[4.25rem] w-auto h-auto object-contain pointer-events-none select-none drop-shadow-[0_6px_14px_rgba(15,23,42,0.32)]';

interface MediaSectionProps {
  mediaItems: NoteMediaItem[];
  displaySrcs: string[];
  onReorder: (next: NoteMediaItem[]) => void;
  onPreview: (index: number) => void;
  onRemove: (index: number) => void;
  onDismissOverlays?: () => void;
  moreActionsSlot?: React.ReactNode;
  mediaLoading?: boolean;
}

/** Media：统一附件列表（图片+涂鸦混排，指针拖拽排序） */
export const MediaSection: React.FC<MediaSectionProps> = ({
  mediaItems,
  displaySrcs,
  onReorder,
  onPreview,
  onRemove,
  onDismissOverlays,
  moreActionsSlot,
  mediaLoading = false
}) => {
  const dismiss = onDismissOverlays ?? (() => {});
  const hasMedia = mediaItems.length > 0;
  const canReorder = mediaItems.length > 1;

  const listRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef(mediaItems);
  itemsRef.current = mediaItems;

  const dragRef = useRef<{
    id: string;
    startX: number;
    pointerId: number;
    activated: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragDx, setDragDx] = useState(0);

  const finishDrag = () => {
    dragRef.current = null;
    setDraggingId(null);
    setDragDx(0);
  };

  /** 按指针 x：统计「非拖拽项」中心点在左侧的个数 → 插入位置 */
  const commitReorderAt = (clientX: number, draggingId: string) => {
    const root = listRef.current;
    if (!root) return;
    const current = itemsRef.current;
    const from = current.findIndex((m) => m.id === draggingId);
    if (from < 0) return;

    const nodes = Array.from(root.querySelectorAll<HTMLElement>('[data-media-id]'));
    let insertAt = 0;
    for (const node of nodes) {
      const id = node.dataset.mediaId;
      if (!id || id === draggingId) continue;
      const rect = node.getBoundingClientRect();
      if (rect.left + rect.width / 2 < clientX) insertAt += 1;
    }

    const dragged = current[from];
    const without = current.filter((m) => m.id !== draggingId);
    const next = [...without.slice(0, insertAt), dragged, ...without.slice(insertAt)];
    const changed = next.some((m, i) => m.id !== current[i]?.id);
    if (changed) onReorder(next);
  };

  const onItemPointerDown = (e: React.PointerEvent, id: string) => {
    if (!canReorder || e.button !== 0) return;
    e.preventDefault();
    dragRef.current = {
      id,
      startX: e.clientX,
      pointerId: e.pointerId,
      activated: false
    };
    suppressClickRef.current = false;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onItemPointerMove = (e: React.PointerEvent, id: string) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== id) return;
    const dx = e.clientX - drag.startX;
    if (!drag.activated) {
      if (Math.abs(dx) < 8) return;
      drag.activated = true;
      suppressClickRef.current = true;
      setDraggingId(id);
    }
    setDragDx(dx);
  };

  const onItemPointerUp = (e: React.PointerEvent, id: string) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== id) return;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(drag.pointerId);
    } catch {
      /* already released */
    }
    if (drag.activated) {
      commitReorderAt(e.clientX, id);
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 50);
    }
    finishDrag();
  };

  const openPreview = (index: number, src: string | undefined) => {
    if (suppressClickRef.current || draggingId) return;
    if (!isDisplayableImageSrc(src)) return;
    dismiss();
    onPreview(index);
  };

  return (
    <section className="flex flex-col shrink-0 border-t border-gray-400/50" aria-label="媒体">
      <div className="px-4 pt-2 pb-1 flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">媒体</span>
        {moreActionsSlot}
      </div>
      {hasMedia ? (
        <div
          ref={listRef}
          className="flex flex-nowrap items-center gap-2 overflow-x-auto px-3 py-4"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}
        >
          {mediaItems.map((item, index) => {
            const src = displaySrcs[index];
            const showImg = isDisplayableImageSrc(src);
            const isDragging = draggingId === item.id;
            return (
              <div
                key={item.id}
                data-media-id={item.id}
                className={`group ${THUMB_SLOT} ${
                  canReorder ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
                } ${isDragging ? 'z-20' : ''}`}
                style={{
                  transform: isDragging ? `translateX(${dragDx}px) scale(1.04)` : undefined,
                  transition: isDragging ? 'none' : undefined,
                  touchAction: canReorder ? 'none' : undefined,
                  opacity: isDragging ? 0.92 : 1
                }}
                onPointerDown={(e) => onItemPointerDown(e, item.id)}
                onPointerMove={(e) => onItemPointerMove(e, item.id)}
                onPointerUp={(e) => onItemPointerUp(e, item.id)}
                onPointerCancel={() => finishDrag()}
                onClick={() => openPreview(index, src)}
              >
                {showImg ? (
                  <img src={src} alt="媒体" draggable={false} className={THUMB_IMG} />
                ) : (
                  <div className="text-[10px] text-gray-400 pointer-events-none">
                    {mediaLoading ? '加载中' : '无法显示'}
                  </div>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    dismiss();
                    onRemove(index);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="absolute top-0.5 right-0.5 z-10 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity border-0 cursor-pointer"
                  title="移除"
                >
                  <X size={12} />
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="px-4 pb-3 pt-1 text-[11px] text-gray-300">暂无附件</div>
      )}
    </section>
  );
};
