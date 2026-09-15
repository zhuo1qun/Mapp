export interface BoardPoint {
  x: number;
  y: number;
}

export interface BoardTransform {
  x: number;
  y: number;
  scale: number;
}

export function clientPoint(clientX: number, clientY: number): BoardPoint {
  return { x: clientX, y: clientY };
}

export function clientToViewPoint(
  point: BoardPoint,
  bounds: Pick<DOMRect, 'left' | 'top'>
): BoardPoint {
  return { x: point.x - bounds.left, y: point.y - bounds.top };
}

export function viewToBoardPoint(point: BoardPoint, transform: BoardTransform): BoardPoint {
  return {
    x: (point.x - transform.x) / transform.scale,
    y: (point.y - transform.y) / transform.scale
  };
}

export function clientToBoardPoint(
  point: BoardPoint,
  bounds: Pick<DOMRect, 'left' | 'top'>,
  transform: BoardTransform
): BoardPoint {
  return viewToBoardPoint(clientToViewPoint(point, bounds), transform);
}

export function distanceBetween(a: BoardPoint, b: BoardPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function transformAroundViewPoint(
  transform: BoardTransform,
  viewPoint: BoardPoint,
  nextScale: number
): BoardTransform {
  const boardPoint = viewToBoardPoint(viewPoint, transform);
  return {
    x: viewPoint.x - boardPoint.x * nextScale,
    y: viewPoint.y - boardPoint.y * nextScale,
    scale: nextScale
  };
}
