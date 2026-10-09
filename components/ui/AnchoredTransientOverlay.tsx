import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type Placement = 'above' | 'below';
type Align = 'start' | 'end' | 'center';

type Props = {
  anchorElement: HTMLElement | null | undefined;
  preferredPlacement?: Placement;
  align?: Align;
  gap?: number;
  zIndex?: number;
  /** 让所属窗口能把 portal 出去的浮层视作自身的一部分。 */
  scope?: string;
  className?: string;
  children: React.ReactNode;
};

const VIEWPORT_PADDING = 8;

/**
 * 面向对象的临时工具栏/菜单的共同承载层。
 * 它永远挂到 body，因而不会被滚动容器、圆角或 overflow 裁切；同时会在锚点附近自动翻面。
 */
export function AnchoredTransientOverlay({
  anchorElement,
  preferredPlacement = 'above',
  align = 'end',
  gap = 8,
  zIndex = 8000,
  scope,
  className = '',
  children
}: Props) {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<React.CSSProperties>({
    visibility: 'hidden',
    pointerEvents: 'none'
  });

  const reposition = useCallback(() => {
    const anchor = anchorElement;
    const overlay = overlayRef.current;
    if (!anchor || !overlay) return;

    const anchorRect = anchor.getBoundingClientRect();
    const overlayRect = overlay.getBoundingClientRect();
    const width = overlayRect.width;
    const height = overlayRect.height;
    if (!width || !height) return;

    let placement = preferredPlacement;
    const aboveTop = anchorRect.top - gap - height;
    const belowTop = anchorRect.bottom + gap;
    if (placement === 'above' && aboveTop < VIEWPORT_PADDING && belowTop + height <= window.innerHeight - VIEWPORT_PADDING) {
      placement = 'below';
    } else if (placement === 'below' && belowTop + height > window.innerHeight - VIEWPORT_PADDING && aboveTop >= VIEWPORT_PADDING) {
      placement = 'above';
    }

    let left =
      align === 'start'
        ? anchorRect.left
        : align === 'center'
          ? anchorRect.left + anchorRect.width / 2 - width / 2
          : anchorRect.right - width;
    left = Math.max(VIEWPORT_PADDING, Math.min(left, window.innerWidth - width - VIEWPORT_PADDING));
    const top = Math.max(
      VIEWPORT_PADDING,
      Math.min(
        placement === 'above' ? aboveTop : belowTop,
        window.innerHeight - height - VIEWPORT_PADDING
      )
    );
    setPosition({ top, left, visibility: 'visible', pointerEvents: 'auto' });
  }, [align, anchorElement, gap, preferredPlacement]);

  useLayoutEffect(() => {
    setPosition({ visibility: 'hidden', pointerEvents: 'none' });
    reposition();
  }, [reposition, children]);

  useEffect(() => {
    if (!anchorElement) return;
    const update = () => reposition();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    const observer = new ResizeObserver(update);
    observer.observe(anchorElement);
    if (overlayRef.current) observer.observe(overlayRef.current);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      observer.disconnect();
    };
  }, [anchorElement, reposition]);

  if (!anchorElement || typeof document === 'undefined') return null;
  return createPortal(
    <div
      ref={overlayRef}
      data-transient-overlay=""
      data-transient-scope={scope}
      className={`fixed workspace-transient-elevation ${className}`.trim()}
      style={{ ...position, zIndex }}
    >
      {children}
    </div>,
    document.body
  );
}
