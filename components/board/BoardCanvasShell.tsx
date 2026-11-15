import type {
  ChangeEventHandler,
  DragEventHandler,
  MouseEventHandler,
  PointerEventHandler,
  ReactNode,
  RefObject
} from 'react';

interface BoardCanvasShellProps {
  containerRef: RefObject<HTMLDivElement>;
  isDark: boolean;
  isPanning: boolean;
  imageFileInputRef: RefObject<HTMLInputElement>;
  onImageInputChange: ChangeEventHandler<HTMLInputElement>;
  onPointerDown: PointerEventHandler<HTMLDivElement>;
  onPointerMove: PointerEventHandler<HTMLDivElement>;
  onPointerLeave: PointerEventHandler<HTMLDivElement>;
  onPointerUpCapture: PointerEventHandler<HTMLDivElement>;
  onPointerUp: PointerEventHandler<HTMLDivElement>;
  onPointerCancelCapture: PointerEventHandler<HTMLDivElement>;
  onPointerCancel: PointerEventHandler<HTMLDivElement>;
  onLostPointerCapture: PointerEventHandler<HTMLDivElement>;
  onDoubleClick: MouseEventHandler<HTMLDivElement>;
  onDragEnter: DragEventHandler<HTMLDivElement>;
  onDragOver: DragEventHandler<HTMLDivElement>;
  onDrop: DragEventHandler<HTMLDivElement>;
  children: ReactNode;
}

/** Owns the DOM-level canvas contract; scene rendering remains a BoardView concern. */
export function BoardCanvasShell({
  containerRef,
  isDark,
  isPanning,
  imageFileInputRef,
  onImageInputChange,
  onPointerDown,
  onPointerMove,
  onPointerLeave,
  onPointerUpCapture,
  onPointerUp,
  onPointerCancelCapture,
  onPointerCancel,
  onLostPointerCapture,
  onDoubleClick,
  onDragEnter,
  onDragOver,
  onDrop,
  children
}: BoardCanvasShellProps) {
  return (
    <div
      ref={containerRef}
      className={`workspace-canvas workspace-canvas--dots w-full h-full overflow-hidden relative touch-none select-none ${
        isDark ? 'workspace-canvas--dark ' : ''
      }${isPanning ? 'cursor-grabbing' : 'cursor-grab'}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onPointerUpCapture={onPointerUpCapture}
      onPointerUp={onPointerUp}
      onPointerCancelCapture={onPointerCancelCapture}
      onPointerCancel={onPointerCancel}
      onLostPointerCapture={onLostPointerCapture}
      onDoubleClick={onDoubleClick}
      onContextMenu={(event) => event.preventDefault()}
    >
      <input
        type="file"
        accept="image/*"
        ref={imageFileInputRef}
        className="hidden"
        onChange={onImageInputChange}
      />
      {children}
    </div>
  );
}
