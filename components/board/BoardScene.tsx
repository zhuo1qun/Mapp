import type { ReactNode } from 'react';
import type { BoardTransform } from '../../utils/board/boardCoordinates';

interface BoardSceneProps {
  transform: BoardTransform;
  children: ReactNode;
}

/** The transformed Board world; UI chrome stays outside this stacking context. */
export function BoardScene({ transform, children }: BoardSceneProps) {
  return (
    <div
      className="absolute top-0 left-0 w-full h-full origin-top-left pointer-events-none"
      style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})` }}
    >
      {children}
    </div>
  );
}
