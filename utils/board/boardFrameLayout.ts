import type { Frame } from '../../types';

type FrameDragPreview = { x: number; y: number } | null;
type FrameResizePreview = { x: number; y: number; width: number; height: number } | null;

/** 统一 Frame 本体与标题在拖拽、缩放预览期间使用的显示几何。 */
export function resolveBoardFrameLayout(
  frame: Frame,
  options: {
    draggingFrameId: string | null;
    draggingPreview: FrameDragPreview;
    resizingFrameId?: string;
    resizingPreview: FrameResizePreview;
  }
) {
  const { draggingFrameId, draggingPreview, resizingFrameId, resizingPreview } = options;
  if (draggingFrameId === frame.id && draggingPreview) {
    return {
      x: draggingPreview.x,
      y: draggingPreview.y,
      width: frame.width,
      height: frame.height
    };
  }
  if (resizingFrameId === frame.id && resizingPreview) {
    return {
      x: resizingPreview.x,
      y: resizingPreview.y,
      width: resizingPreview.width,
      height: resizingPreview.height
    };
  }
  return { x: frame.x, y: frame.y, width: frame.width, height: frame.height };
}
