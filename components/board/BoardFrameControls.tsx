import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';

export type BoardFrameResizeCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

interface BoardFrameControlsProps {
  frameId: string;
  isDragging: boolean;
  showResizeHandles: boolean;
  scale: number;
  themeColor: string;
  chromeStyle?: CSSProperties;
  onSelect: (frameId: string) => void;
  onDragStart: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onResizeStart: (
    event: ReactPointerEvent<HTMLDivElement>,
    corner: BoardFrameResizeCorner
  ) => void;
}

const FRAME_EDGES: Array<{ style: CSSProperties }> = [
  { style: { left: 0, top: 0, right: 0, height: 10 } },
  { style: { left: 0, bottom: 0, right: 0, height: 10 } },
  { style: { left: 0, top: 10, bottom: 10, width: 10 } },
  { style: { right: 0, top: 10, bottom: 10, width: 10 } }
];

const FRAME_CORNERS: Array<{
  corner: BoardFrameResizeCorner;
  className: string;
  position: CSSProperties;
  transformOrigin: CSSProperties['transformOrigin'];
}> = [
  {
    corner: 'top-left',
    className: 'cursor-nwse-resize',
    position: { left: -6, top: -6 },
    transformOrigin: 'top left'
  },
  {
    corner: 'top-right',
    className: 'cursor-nesw-resize',
    position: { right: -6, top: -6 },
    transformOrigin: 'top right'
  },
  {
    corner: 'bottom-left',
    className: 'cursor-nesw-resize',
    position: { left: -6, bottom: -6 },
    transformOrigin: 'bottom left'
  },
  {
    corner: 'bottom-right',
    className: 'cursor-nwse-resize',
    position: { right: -6, bottom: -6 },
    transformOrigin: 'bottom right'
  }
];

export function BoardFrameControls({
  frameId,
  isDragging,
  showResizeHandles,
  scale,
  themeColor,
  chromeStyle,
  onSelect,
  onDragStart,
  onResizeStart
}: BoardFrameControlsProps) {
  return (
    <>
      {FRAME_EDGES.map(({ style }, index) => (
        <div
          key={`edge-${index}`}
          data-mapp-export-ui=""
          className="absolute pointer-events-auto"
          style={{ ...style, cursor: isDragging ? 'grabbing' : 'grab' }}
          onClick={(event) => {
            event.stopPropagation();
            onSelect(frameId);
          }}
          onPointerDown={onDragStart}
        />
      ))}

      {showResizeHandles &&
        FRAME_CORNERS.map(({ corner, className, position, transformOrigin }) => (
          <div
            key={corner}
            data-mapp-export-ui=""
            className={`absolute pointer-events-auto ${className}`}
            style={{
              ...position,
              width: 12,
              height: 12,
              ...chromeStyle,
              border: `2px solid ${themeColor}`,
              borderRadius: 2,
              transform: `scale(${1 / scale})`,
              transformOrigin,
              zIndex: 2000
            }}
            onPointerDown={(event) => onResizeStart(event, corner)}
          />
        ))}
    </>
  );
}
