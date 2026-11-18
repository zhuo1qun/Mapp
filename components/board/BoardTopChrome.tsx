import type { PointerEventHandler, ReactNode, RefObject } from 'react';

interface BoardTopChromeProps {
  visible: boolean;
  leftToolbarRef: RefObject<HTMLDivElement>;
  onLeftPointerDown: PointerEventHandler<HTMLDivElement>;
  left: ReactNode;
  right: ReactNode;
  center: ReactNode;
}

/** Stable top-level layering for Board controls, independent of canvas scene content. */
export function BoardTopChrome({
  visible,
  leftToolbarRef,
  onLeftPointerDown,
  left,
  right,
  center
}: BoardTopChromeProps) {
  if (!visible) return null;

  return (
    <>
      <div
        ref={leftToolbarRef}
        data-allow-context-menu
        className="fixed ui-workspace-safe-top ui-workspace-left z-[500] pointer-events-auto flex h-10 sm:h-12 items-center gap-1.5 sm:gap-2"
        onPointerDown={onLeftPointerDown}
      >
        {left}
      </div>
      {right}
      {center}
    </>
  );
}
