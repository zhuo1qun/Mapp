import type { CSSProperties } from 'react';
import type { BoardPoint } from '../../utils/board/boardCoordinates';

type Props = {
  themeColor: string;
  frameChromeStyle: CSSProperties;
  isSelectingNotePosition: boolean;
  notePositionPreview: BoardPoint | null;
  boxSelectStart: BoardPoint | null;
  boxSelectEnd: BoardPoint | null;
  isDrawingFrame: boolean;
  drawingFrameStart: BoardPoint | null;
  drawingFrameEnd: BoardPoint | null;
};

/** 画布操作中的纯视觉反馈，不承载任何手势或状态变更。 */
export function BoardCanvasFeedback({
  themeColor,
  frameChromeStyle,
  isSelectingNotePosition,
  notePositionPreview,
  boxSelectStart,
  boxSelectEnd,
  isDrawingFrame,
  drawingFrameStart,
  drawingFrameEnd
}: Props) {
  return (
    <>
      {isSelectingNotePosition && notePositionPreview ? (
        <div
          className="absolute z-[3000] pointer-events-none"
          style={{
            left: `${notePositionPreview.x - 128}px`,
            top: `${notePositionPreview.y - 128}px`,
            width: '256px',
            height: '256px',
            border: `4px solid ${themeColor}`,
            borderRadius: '4px',
            boxShadow: `0 0 0 1px ${themeColor}4D`
          }}
        />
      ) : null}

      {boxSelectStart && boxSelectEnd ? (
        <div
          className="absolute z-[3000] pointer-events-none"
          style={{
            left: `${Math.min(boxSelectStart.x, boxSelectEnd.x)}px`,
            top: `${Math.min(boxSelectStart.y, boxSelectEnd.y)}px`,
            width: `${Math.abs(boxSelectEnd.x - boxSelectStart.x)}px`,
            height: `${Math.abs(boxSelectEnd.y - boxSelectStart.y)}px`,
            backgroundColor: `${themeColor}20`,
            border: `2px solid ${themeColor}`,
            borderRadius: '4px'
          }}
        />
      ) : null}

      {isDrawingFrame && drawingFrameStart && drawingFrameEnd ? (
        <div
          className="absolute overflow-hidden pointer-events-none"
          style={{
            left: `${Math.min(drawingFrameStart.x, drawingFrameEnd.x)}px`,
            top: `${Math.min(drawingFrameStart.y, drawingFrameEnd.y)}px`,
            width: `${Math.abs(drawingFrameEnd.x - drawingFrameStart.x)}px`,
            height: `${Math.abs(drawingFrameEnd.y - drawingFrameStart.y)}px`,
            borderRadius: '12px',
            zIndex: 10,
            border: '2px dashed rgba(156, 163, 175, 0.8)',
            ...frameChromeStyle
          }}
        />
      ) : null}
    </>
  );
}
