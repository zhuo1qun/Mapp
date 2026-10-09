import type { ReactNode } from 'react';
import { BoardSelectionScaleHandles } from './BoardSelectionScaleHandles';
import type { SelectionScaleCorner } from '../../utils/board/boardSelectionScale';

export type BoardSelectionBounds = { x: number; y: number; width: number; height: number };

type Props = {
  bounds: BoardSelectionBounds;
  themeColor: string;
  canvasScale: number;
  /** 多选时显示与锚点共用主题色的边界线。 */
  showBoundary?: boolean;
  showScaleHandles: boolean;
  scaleHandleTitle: string;
  onScaleStart: (event: React.PointerEvent<HTMLDivElement>, corner: SelectionScaleCorner) => void;
  onElementChange?: (element: HTMLDivElement | null) => void;
  children: ReactNode;
};

/** 选中对象的视觉边界；业务工具栏作为 children 注入，保持数据写回在 Board 编排层。 */
export function BoardSelectionOverlay({
  bounds,
  themeColor,
  canvasScale,
  showBoundary = false,
  showScaleHandles,
  scaleHandleTitle,
  onScaleStart,
  onElementChange,
  children
}: Props) {
  // 覆盖层跟随画布缩放，反向补偿后边线在屏幕上始终是同一粗细。
  const selectionStroke = 1.5 / Math.max(0.05, canvasScale);

  return (
    <div
      ref={onElementChange}
      className="absolute z-[2100]"
      style={{
        left: bounds.x,
        top: bounds.y,
        width: bounds.width,
        height: bounds.height,
        pointerEvents: 'none'
      }}
    >
      {showBoundary ? (
        <div
          aria-hidden="true"
          className="absolute inset-0 rounded-[2px]"
          style={{ boxShadow: `inset 0 0 0 ${selectionStroke}px ${themeColor}` }}
        />
      ) : null}
      {showScaleHandles ? (
        <BoardSelectionScaleHandles
          themeColor={themeColor}
          canvasScale={canvasScale}
          handleTitle={scaleHandleTitle}
          onResizeStart={onScaleStart}
        />
      ) : null}
      {children}
    </div>
  );
}
