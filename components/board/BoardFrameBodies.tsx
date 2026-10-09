import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import type { Frame } from '../../types';
import { resolveBoardFrameLayout } from '../../utils/board/boardFrameLayout';
import { BoardFrameControls, type BoardFrameResizeCorner } from './BoardFrameControls';

type Props = {
  frames: Frame[];
  visible: boolean;
  filterFrameIds: Set<string>;
  selectedFrameId: string | null;
  draggingFrameId: string | null;
  draggingPreview: { x: number; y: number } | null;
  resizingFrameId?: string;
  resizingPreview: { x: number; y: number; width: number; height: number } | null;
  workspaceEditMode: boolean;
  canvasScale: number;
  themeColor: string;
  chromeStyle: CSSProperties;
  frameTint: (color: string, alpha: number) => string;
  onSelect: (frameId: string) => void;
  onDragStart: (event: ReactPointerEvent<HTMLDivElement>, frame: Frame) => void;
  onResizeStart: (
    event: ReactPointerEvent<HTMLDivElement>,
    frame: Frame,
    corner: BoardFrameResizeCorner
  ) => void;
};

/** Frame 的背景与命中区；标题单独置于上层，保证缩放时始终可读。 */
export function BoardFrameBodies({
  frames,
  visible,
  filterFrameIds,
  selectedFrameId,
  draggingFrameId,
  draggingPreview,
  resizingFrameId,
  resizingPreview,
  workspaceEditMode,
  canvasScale,
  themeColor,
  chromeStyle,
  frameTint,
  onSelect,
  onDragStart,
  onResizeStart
}: Props) {
  if (!visible) return null;

  return (
    <>
      {frames.map((frame) => {
        if (filterFrameIds.size > 0 && !filterFrameIds.has(frame.id)) return null;
        const display = resolveBoardFrameLayout(frame, {
          draggingFrameId,
          draggingPreview,
          resizingFrameId,
          resizingPreview
        });
        const selected = selectedFrameId === frame.id;
        return (
          <div
            key={frame.id}
            data-board-export-frame=""
            className="absolute overflow-visible"
            style={{
              left: `${display.x}px`,
              top: `${display.y}px`,
              width: `${display.width}px`,
              height: `${display.height}px`,
              zIndex: selected ? 1000 : 10,
              pointerEvents: 'none'
            }}
          >
            <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[12px]">
              <div className="absolute inset-0" style={chromeStyle} />
              <div
                className="absolute inset-0"
                style={{ backgroundColor: selected ? 'rgba(255, 221, 0, 0.22)' : frameTint(frame.color, 0.22) }}
              />
              <div
                className="absolute inset-0 rounded-[12px]"
                style={{ boxShadow: selected ? `inset 0 0 0 2px ${themeColor}` : 'inset 0 0 0 2px rgba(156, 163, 175, 0.35)' }}
              />
            </div>
            <div className="absolute pointer-events-auto" style={{ left: 10, top: 10, right: 10, bottom: 10 }} />
            <BoardFrameControls
              frameId={frame.id}
              isDragging={draggingFrameId === frame.id}
              showResizeHandles={workspaceEditMode && selected}
              scale={canvasScale}
              themeColor={themeColor}
              chromeStyle={chromeStyle}
              onSelect={onSelect}
              onDragStart={(event) => onDragStart(event, frame)}
              onResizeStart={(event, corner) => onResizeStart(event, frame, corner)}
            />
          </div>
        );
      })}
    </>
  );
}
