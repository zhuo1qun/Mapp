import React from 'react';

type AnchoredWorkspaceWindowProps = React.HTMLAttributes<HTMLDivElement> & {
  panelRef?: React.Ref<HTMLDivElement>;
};

/**
 * 锚定在工具栏附近的工作窗口表面。
 * 统一注册为瞬时窗口，并隔离其内部操作不触发工作区外点击关闭。
 */
export const AnchoredWorkspaceWindow: React.FC<AnchoredWorkspaceWindowProps> = ({
  panelRef,
  onPointerDown,
  onTouchStart,
  onClick,
  children,
  ...props
}) => (
  <div
    ref={panelRef}
    data-allow-context-menu
    data-workspace-transient
    {...props}
    onPointerDown={(event) => {
      event.stopPropagation();
      onPointerDown?.(event);
    }}
    onTouchStart={(event) => {
      event.stopPropagation();
      onTouchStart?.(event);
    }}
    onClick={(event) => {
      event.stopPropagation();
      onClick?.(event);
    }}
  >
    {children}
  </div>
);
