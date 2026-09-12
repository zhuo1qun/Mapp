import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const GAP_PX = 6;
const VIEW_PAD_PX = 10;
const LONG_PRESS_MS = 480;
const TOUCH_HOLD_MS = 1600;
/** 高于地图 modal，但低于阻断性确认框；与 index.css 的 --z-map-tooltip 对应。 */
export const PORTAL_TOOLTIP_Z = 7000;

export type PortalTooltipTone = 'neutral' | 'warning';

const TONE_TOOLTIP_CLASS: Record<PortalTooltipTone, string> = {
  neutral:
    'rounded-md bg-gray-900/92 px-2.5 py-1.5 text-left text-xs leading-snug text-gray-100 shadow-md break-words',
  warning:
    'rounded-md border border-amber-600/40 bg-amber-950/93 px-2.5 py-1.5 text-left text-xs leading-snug text-amber-50 shadow-md break-words'
};

type PortalTooltipProps = {
  content: React.ReactNode;
  tone?: PortalTooltipTone;
  /**
   * 短标签：内容宽度自适应、尽量单行（工具栏按钮名）。
   * 长说明（HelpHint）保持默认换行宽盒。
   */
  compact?: boolean;
  /** 单个可聚焦元素（如 button），悬停 / 聚焦 / 移动端长按显示 content */
  children: React.ReactElement;
};

/**
 * 挂到 document.body + fixed 定位；子元素合并 onFocus/onBlur。
 * 桌面：悬停；移动端：长按约 480ms。
 */
export const PortalTooltip: React.FC<PortalTooltipProps> = ({
  content,
  tone = 'neutral',
  compact = false,
  children
}) => {
  const wrapRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const touchHideTimerRef = useRef<number | null>(null);
  const longPressOpenedRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [tipStyle, setTipStyle] = useState<React.CSSProperties>({
    position: 'fixed',
    zIndex: PORTAL_TOOLTIP_Z,
    visibility: 'hidden',
    opacity: 0,
    pointerEvents: 'none'
  });

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current != null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const clearTouchHideTimer = useCallback(() => {
    if (touchHideTimerRef.current != null) {
      window.clearTimeout(touchHideTimerRef.current);
      touchHideTimerRef.current = null;
    }
  }, []);

  const show = useCallback(() => {
    clearTouchHideTimer();
    setOpen(true);
  }, [clearTouchHideTimer]);

  const hide = useCallback(() => {
    clearLongPressTimer();
    clearTouchHideTimer();
    longPressOpenedRef.current = false;
    setOpen(false);
  }, [clearLongPressTimer, clearTouchHideTimer]);

  const reposition = useCallback(() => {
    const wrap = wrapRef.current;
    const tip = tipRef.current;
    if (!wrap || !tip) return;

    const wr = wrap.getBoundingClientRect();
    const maxW = Math.min(compact ? 12 * 16 : 17 * 16, window.innerWidth - VIEW_PAD_PX * 2);
    const tipW = tip.offsetWidth || (compact ? 64 : maxW);
    let left = wr.left + wr.width / 2 - tipW / 2;
    left = Math.max(VIEW_PAD_PX, Math.min(left, window.innerWidth - tipW - VIEW_PAD_PX));
    let top = wr.bottom + GAP_PX;

    const tr = tip.getBoundingClientRect();
    const h = tr.height > 0 ? tr.height : compact ? 28 : 80;
    if (top + h > window.innerHeight - VIEW_PAD_PX) {
      top = wr.top - h - GAP_PX;
    }
    top = Math.max(VIEW_PAD_PX, top);

    setTipStyle({
      position: 'fixed',
      top,
      left,
      width: compact ? 'max-content' : maxW,
      maxWidth: maxW,
      whiteSpace: compact ? 'nowrap' : undefined,
      zIndex: PORTAL_TOOLTIP_Z,
      visibility: 'visible',
      opacity: 1,
      pointerEvents: 'none',
      transition: 'opacity 150ms ease-out'
    });
  }, [compact]);

  useLayoutEffect(() => {
    if (!open) {
      setTipStyle((s) => ({
        ...s,
        visibility: 'hidden',
        opacity: 0
      }));
      return;
    }
    reposition();
  }, [open, content, reposition]);

  useEffect(() => {
    if (!open) return;
    const onReposition = () => reposition();
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [open, reposition]);

  useEffect(
    () => () => {
      clearLongPressTimer();
      clearTouchHideTimer();
    },
    [clearLongPressTimer, clearTouchHideTimer]
  );

  const childProps = children.props as {
    onFocus?: React.FocusEventHandler;
    onBlur?: React.FocusEventHandler;
    onClick?: React.MouseEventHandler;
  };

  const trigger = React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
    onFocus: (e: React.FocusEvent) => {
      show();
      childProps.onFocus?.(e);
    },
    onBlur: (e: React.FocusEvent) => {
      if (!wrapRef.current?.contains(e.relatedTarget as Node | null)) hide();
      childProps.onBlur?.(e);
    },
    onClick: (e: React.MouseEvent) => {
      // 长按唤出提示后，避免误触点击
      if (longPressOpenedRef.current) {
        e.preventDefault();
        e.stopPropagation();
        longPressOpenedRef.current = false;
        return;
      }
      childProps.onClick?.(e);
    }
  });

  const portal =
    open &&
    typeof document !== 'undefined' &&
    createPortal(
      <span
        ref={tipRef}
        role="tooltip"
        className={TONE_TOOLTIP_CLASS[tone]}
        style={tipStyle}
      >
        {content}
      </span>,
      document.body
    );

  return (
    <>
      <span
        ref={wrapRef}
        className="inline-flex shrink-0 items-center align-middle"
        onMouseEnter={show}
        onMouseLeave={hide}
        onPointerDown={(e) => {
          if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
          clearLongPressTimer();
          clearTouchHideTimer();
          longPressOpenedRef.current = false;
          longPressTimerRef.current = window.setTimeout(() => {
            longPressTimerRef.current = null;
            longPressOpenedRef.current = true;
            show();
            clearTouchHideTimer();
            touchHideTimerRef.current = window.setTimeout(() => {
              hide();
            }, TOUCH_HOLD_MS);
          }, LONG_PRESS_MS);
        }}
        onPointerUp={clearLongPressTimer}
        onPointerCancel={() => {
          clearLongPressTimer();
          if (!longPressOpenedRef.current) hide();
        }}
        onContextMenu={(e) => {
          // 长按系统菜单与提示冲突时优先提示
          if (longPressOpenedRef.current || longPressTimerRef.current != null) {
            e.preventDefault();
          }
        }}
      >
        {trigger}
      </span>
      {portal}
    </>
  );
};
