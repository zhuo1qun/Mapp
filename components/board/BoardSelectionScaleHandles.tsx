import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import type { SelectionScaleCorner } from '../../utils/board/boardSelectionScale';

const CORNERS: Array<{
  corner: SelectionScaleCorner;
  className: string;
  left: string;
  top: string;
}> = [
  { corner: 'tl', className: 'cursor-nwse-resize', left: '0%', top: '0%' },
  { corner: 'tr', className: 'cursor-nesw-resize', left: '100%', top: '0%' },
  { corner: 'bl', className: 'cursor-nesw-resize', left: '0%', top: '100%' },
  { corner: 'br', className: 'cursor-nwse-resize', left: '100%', top: '100%' }
];

type BoardSelectionScaleHandlesProps = {
  themeColor: string;
  /** 画布缩放，手柄屏幕尺寸大致恒定 */
  canvasScale: number;
  /** 悬停提示：多选聚散 / 图片缩放等 */
  handleTitle?: string;
  onResizeStart: (
    event: ReactPointerEvent<HTMLDivElement>,
    corner: SelectionScaleCorner
  ) => void;
};

export function BoardSelectionScaleHandles({
  themeColor,
  canvasScale,
  handleTitle,
  onResizeStart
}: BoardSelectionScaleHandlesProps) {
  const inv = 1 / Math.max(0.05, canvasScale);
  const handleStyle: CSSProperties = {
    width: 14,
    height: 14,
    marginLeft: -7,
    marginTop: -7,
    backgroundColor: themeColor,
    border: '2px solid #fff',
    borderRadius: 3,
    boxShadow: '0 1px 4px rgba(15,23,42,0.28)',
    transform: `scale(${inv})`,
    transformOrigin: 'center center',
    touchAction: 'none'
  };

  return (
    <>
      {CORNERS.map(({ corner, className, left, top }) => (
        <div
          key={corner}
          data-mapp-selection-scale-handle={corner}
          title={handleTitle}
          className={`absolute z-[60] pointer-events-auto ${className}`}
          style={{ ...handleStyle, left, top }}
          onPointerDown={(event) => {
            event.stopPropagation();
            event.preventDefault();
            onResizeStart(event, corner);
          }}
        />
      ))}
    </>
  );
}
