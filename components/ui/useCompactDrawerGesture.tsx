import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';

const COMPLETE_PROGRESS = 0.42;
const FLING_VELOCITY = 0.65;
const DISMISS_PROGRESS = 0.24;
const COLLAPSE_PROGRESS = 0.18;
const DIRECT_DISMISS_PROGRESS = 0.56;
const DIRECT_DISMISS_VELOCITY = 0.9;
const EXPANDED_TOP_PX = 48;

type DrawerDrag = {
  startY: number;
  lastY: number;
  lastTime: number;
  top: number;
  height: number;
  left: number;
  right: number;
  bottom: number;
};

type DrawerGeometry = Pick<DrawerDrag, 'top' | 'height' | 'left' | 'right' | 'bottom'>;

/**
 * 窄屏抽屉统一的上拉展开 / 下拉关闭手势。
 *
 * 42% 的行程或约 650px/s 的上滑会完成展开；其余情况回弹。这是移动端 sheet
 * 常见的偏保守阈值，能避免在内容区滚动/轻扫时意外切换状态。下拉关闭的阈值
 * 更低（24%），符合抽屉作为临时窗口的常见退出预期。
 */
export function useCompactDrawerGesture<T extends HTMLElement>(
  surfaceRef: RefObject<T | null>,
  enabled: boolean,
  onExpand?: () => void,
  onDismiss?: () => void
) {
  const dragRef = useRef<DrawerDrag | null>(null);
  const expandTimerRef = useRef<number | null>(null);
  const dismissTimerRef = useRef<number | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [collapsedGeometry, setCollapsedGeometry] = useState<DrawerGeometry | null>(null);
  const wasEnabledRef = useRef(enabled);

  const resetDrag = useCallback(() => {
    dragRef.current = null;
    setDragging(false);
    setDragOffset(0);
  }, []);

  const completeExpand = useCallback(() => {
    resetDrag();
    setExpanded(true);
    if (!onExpand) return;
    if (expandTimerRef.current != null) window.clearTimeout(expandTimerRef.current);
    // 先完成抽屉的形变，再让详情切换到编辑器，避免内容先变、外壳后追。
    expandTimerRef.current = window.setTimeout(() => {
      expandTimerRef.current = null;
      onExpand();
    }, 180);
  }, [onExpand, resetDrag]);

  const completeDismiss = useCallback(() => {
    resetDrag();
    if (!onDismiss) return;
    setDismissing(true);
    if (dismissTimerRef.current != null) window.clearTimeout(dismissTimerRef.current);
    dismissTimerRef.current = window.setTimeout(() => {
      dismissTimerRef.current = null;
      onDismiss();
    }, 180);
  }, [onDismiss, resetDrag]);

  const collapseToInitial = useCallback(() => {
    resetDrag();
    setExpanded(false);
  }, [resetDrag]);

  // 关闭时保留最终状态，供退出动画完整离场；仅在下次真正重新打开时才复位到半屏。
  useLayoutEffect(() => {
    const wasEnabled = wasEnabledRef.current;
    wasEnabledRef.current = enabled;
    if (!enabled) {
      resetDrag();
      return;
    }
    if (!wasEnabled) {
      resetDrag();
      setExpanded(false);
      setDismissing(false);
      setCollapsedGeometry(null);
    }
  }, [enabled, resetDrag]);

  useEffect(() => {
    return () => {
      if (expandTimerRef.current != null) window.clearTimeout(expandTimerRef.current);
      if (dismissTimerRef.current != null) window.clearTimeout(dismissTimerRef.current);
    };
  }, []);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!enabled || dismissing || event.button !== 0) return;
    const surface = surfaceRef.current;
    if (!surface) return;
    const rect = surface.getBoundingClientRect();
    if (!expanded && rect.top <= 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const now = performance.now();
    const nextDrag = {
      startY: event.clientY,
      lastY: event.clientY,
      lastTime: now,
      top: rect.top,
      height: rect.height,
      left: rect.left,
      right: Math.max(0, window.innerWidth - rect.right),
      bottom: Math.max(0, window.innerHeight - rect.bottom)
    };
    dragRef.current = nextDrag;
    if (!expanded) {
      // 记录初始半屏几何：从最大展开回退时仍可与这组确定数值直接插值。
      setCollapsedGeometry(nextDrag);
    }
    setDragging(true);
  }, [dismissing, enabled, expanded, surfaceRef]);

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    event.preventDefault();
    const now = performance.now();
    drag.lastY = event.clientY;
    drag.lastTime = now;
    const expansionTravel = Math.max(1, drag.top - EXPANDED_TOP_PX);
    const upward = Math.min(expansionTravel, Math.max(0, drag.startY - event.clientY));
    const downward = Math.min(drag.height, Math.max(0, event.clientY - drag.startY));
    setDragOffset(upward > 0 ? -upward : downward);
  }, []);

  const finish = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const elapsed = Math.max(1, performance.now() - drag.lastTime);
    const upwardVelocity = Math.max(0, (drag.lastY - event.clientY) / elapsed);
    const downwardVelocity = Math.max(0, (event.clientY - drag.lastY) / elapsed);
    const upwardProgress = Math.min(
      1,
      Math.max(0, drag.startY - event.clientY) / Math.max(1, drag.top - EXPANDED_TOP_PX)
    );
    const downwardProgress = Math.min(1, Math.max(0, event.clientY - drag.startY) / Math.max(1, drag.height));
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (expanded) {
      // 全屏下拉分两级：有意识地拉下一段先回到半屏；拉过半屏或快速甩下才直接关闭。
      if (downwardProgress >= DIRECT_DISMISS_PROGRESS || downwardVelocity >= DIRECT_DISMISS_VELOCITY) {
        completeDismiss();
      } else if (downwardProgress >= COLLAPSE_PROGRESS || downwardVelocity >= FLING_VELOCITY) {
        collapseToInitial();
      } else {
        resetDrag();
      }
    } else if (upwardProgress >= COMPLETE_PROGRESS || upwardVelocity >= FLING_VELOCITY) {
      completeExpand();
    } else if (downwardProgress >= DISMISS_PROGRESS || downwardVelocity >= FLING_VELOCITY) {
      completeDismiss();
    } else {
      resetDrag();
    }
  }, [collapseToInitial, completeDismiss, completeExpand, expanded, resetDrag]);

  const cancel = useCallback(() => resetDrag(), [resetDrag]);
  const drag = dragRef.current;
  const upwardDistance = Math.max(0, -dragOffset);
  const downwardDistance = Math.max(0, dragOffset);
  const progress = drag
    ? Math.min(1, upwardDistance / Math.max(1, drag.top - EXPANDED_TOP_PX))
    : 0;
  // 部分占屏更透；随上拉全屏逐步恢复到完整材质。下拉关闭保持当前基准，避免视觉闪变。
  const opacityFactor = expanded ? 1 : 0.7 + progress * 0.3;

  const windowGeometryStyle = drag && dragging
    ? ({
        '--chrome-drawer-top': `${Math.max(0, drag.top - upwardDistance)}px`,
        '--chrome-drawer-left': `${Math.max(0, drag.left * (1 - progress))}px`,
        '--chrome-drawer-right': `${Math.max(0, drag.right * (1 - progress))}px`,
        '--chrome-drawer-bottom': `${Math.max(0, drag.bottom * (1 - progress))}px`,
        '--chrome-drawer-max-height': 'none',
        '--chrome-drawer-translate-y': `${downwardDistance}px`,
        '--chrome-drawer-opacity-factor': String(opacityFactor)
      } as CSSProperties)
    : !expanded && collapsedGeometry
      ? ({
          '--chrome-drawer-top': `${collapsedGeometry.top}px`,
          '--chrome-drawer-left': `${collapsedGeometry.left}px`,
          '--chrome-drawer-right': `${collapsedGeometry.right}px`,
          '--chrome-drawer-bottom': `${collapsedGeometry.bottom}px`,
          '--chrome-drawer-height': `${collapsedGeometry.height}px`,
          '--chrome-drawer-max-height': `${collapsedGeometry.height}px`
        } as CSSProperties)
      : undefined;

  return {
    dragging,
    expanded,
    dismissing,
    dragDistance: upwardDistance,
    dragStartHeight: drag?.height ?? 0,
    opacityFactor,
    windowGeometryStyle,
    handleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finish,
      onPointerCancel: cancel
    }
  };
}

export function CompactDrawerHandle({
  enabled,
  handleProps
}: {
  enabled: boolean;
  handleProps: ReturnType<typeof useCompactDrawerGesture>['handleProps'];
}) {
  if (!enabled) return null;
  return (
    <div
      aria-hidden="true"
      className="chrome-compact-drawer-handle"
      {...handleProps}
    >
      <span />
    </div>
  );
}
