import React, { useRef, useState } from 'react';
import { ImageIcon, Layers3, MoreHorizontal, SquarePen } from 'lucide-react';
import { ChromePresence } from '../ui/ChromeSheetPresence';

export type TableWindowTarget = 'layers' | 'editor' | 'more' | 'detail';

interface TableWindowNavigatorProps {
  visible: boolean;
  detailVisible?: boolean;
  position: number;
  themeColor: string;
  panelChromeStyle?: React.CSSProperties;
  onPreview: (position: number) => void;
  onCommit: (target: TableWindowTarget) => void;
}

type DragState = {
  pointerId: number;
  startX: number;
  startPosition: number;
  moved: boolean;
};

const clampPosition = (value: number, maxPosition: number) =>
  Math.max(0, Math.min(maxPosition, value));

const targetFromPosition = (position: number, maxPosition: number): TableWindowTarget => {
  const index = Math.round(clampPosition(position, maxPosition));
  return index === 0 ? 'layers' : index === 1 ? 'editor' : index === 2 ? 'more' : 'detail';
};

export const TableWindowNavigator: React.FC<TableWindowNavigatorProps> = ({
  visible,
  detailVisible = false,
  position,
  themeColor,
  panelChromeStyle,
  onPreview,
  onCommit
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const segmentCount = detailVisible ? 4 : 3;
  const maxPosition = segmentCount - 1;
  const safePosition = clampPosition(position, maxPosition);
  const activeIndex = Math.round(safePosition);

  const finishDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setIsDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    const stepWidth = (rect.width - 8) / segmentCount;
    if (drag.moved) {
      const finalPosition = clampPosition(
        drag.startPosition + (event.clientX - drag.startX) / stepWidth,
        maxPosition
      );
      onPreview(finalPosition);
      onCommit(targetFromPosition(finalPosition, maxPosition));
      return;
    }
    const clickedIndex = Math.max(
      0,
      Math.min(maxPosition, Math.floor(((event.clientX - rect.left) / rect.width) * segmentCount))
    );
    onCommit(targetFromPosition(clickedIndex, maxPosition));
  };

  return (
    <ChromePresence open={visible} kind="menu">
      {(phase) => (
        <div
          data-allow-context-menu
          className={`fixed top-2 sm:top-4 ui-workspace-center-x -translate-x-1/2 z-[500] pointer-events-auto chrome-menu-${phase}`}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div
            ref={trackRef}
            className={`relative flex h-10 touch-none select-none items-stretch rounded-full border p-1 shadow-xl transition-[width] duration-200 ease-out ${
              detailVisible ? 'w-64' : 'w-52'
            } ${
              panelChromeStyle ? 'border-gray-100/80' : 'border-white/50 map-chrome-surface-fallback'
            }`}
            style={panelChromeStyle}
            role="slider"
            aria-label="Table 窗口位置"
            aria-valuemin={0}
            aria-valuemax={maxPosition}
            aria-valuenow={activeIndex}
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'ArrowLeft' || event.key === 'Home') {
                event.preventDefault();
                onCommit(event.key === 'Home' ? 'layers' : targetFromPosition(activeIndex - 1, maxPosition));
              } else if (event.key === 'ArrowRight' || event.key === 'End') {
                event.preventDefault();
                onCommit(
                  event.key === 'End'
                    ? detailVisible ? 'detail' : 'more'
                    : targetFromPosition(activeIndex + 1, maxPosition)
                );
              }
            }}
            onPointerDown={(event) => {
              event.stopPropagation();
              if (event.button !== 0) return;
              dragRef.current = {
                pointerId: event.pointerId,
                startX: event.clientX,
                startPosition: safePosition,
                moved: false
              };
              setIsDragging(true);
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              const drag = dragRef.current;
              const rect = trackRef.current?.getBoundingClientRect();
              if (!drag || drag.pointerId !== event.pointerId || !rect) return;
              const deltaX = event.clientX - drag.startX;
              if (!drag.moved && Math.abs(deltaX) < 3) return;
              drag.moved = true;
              onPreview(clampPosition(
                drag.startPosition + deltaX / ((rect.width - 8) / segmentCount),
                maxPosition
              ));
            }}
            onPointerUp={finishDrag}
            onPointerCancel={finishDrag}
          >
            <span
              aria-hidden
              className={`absolute bottom-1 left-1 top-1 rounded-full shadow-sm ${
                isDragging ? '' : 'transition-transform duration-200 ease-out'
              }`}
              style={{
                backgroundColor: themeColor,
                width: `calc((100% - 0.5rem) / ${segmentCount})`,
                transform: `translate3d(${safePosition * 100}%, 0, 0)`
              }}
            />
            <span
              className={`relative z-10 flex flex-1 items-center justify-center gap-1 text-[11px] font-semibold transition-colors ${
                activeIndex === 0 ? 'text-theme-chrome-fg' : 'text-gray-500'
              }`}
            >
              <Layers3 size={14} />
              筛选
            </span>
            <span
              className={`relative z-10 flex flex-1 items-center justify-center gap-1 text-[11px] font-semibold transition-colors ${
                activeIndex === 1 ? 'text-theme-chrome-fg' : 'text-gray-500'
              }`}
            >
              <SquarePen size={14} />
              编辑
            </span>
            <span
              className={`relative z-10 flex flex-1 items-center justify-center gap-1 text-[11px] font-semibold transition-colors ${
                activeIndex === 2 ? 'text-theme-chrome-fg' : 'text-gray-500'
              }`}
            >
              <MoreHorizontal size={14} />
              更多
            </span>
            {detailVisible ? (
              <span
                className={`relative z-10 flex flex-1 items-center justify-center gap-1 text-[11px] font-semibold transition-colors ${
                  activeIndex === 3 ? 'text-theme-chrome-fg' : 'text-gray-500'
                }`}
              >
                <ImageIcon size={14} />
                详情
              </span>
            ) : null}
          </div>
        </div>
      )}
    </ChromePresence>
  );
};
