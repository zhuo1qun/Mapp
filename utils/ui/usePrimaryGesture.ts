import { useCallback, useRef } from 'react';

type GestureHandlers = {
  onPointerDown: (event: React.PointerEvent) => void;
  onClick: (event: React.MouseEvent) => void;
};

/**
 * 手机上把「需要用户手势」的动作提前到 pointerdown（touch/pen），
 * 避免 click 到来时 Safari 已丢掉 user activation（定位 / 相机权限常见）。
 * 鼠标仍走 click，避免按下拖出按钮时误触发。
 */
export function usePrimaryGesture(handler: () => void): GestureHandlers {
  const touchHandledRef = useRef(false);
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  const onPointerDown = useCallback((event: React.PointerEvent) => {
    if (event.button !== 0) return;
    if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
    touchHandledRef.current = true;
    handlerRef.current();
  }, []);

  const onClick = useCallback((event: React.MouseEvent) => {
    if (touchHandledRef.current) {
      touchHandledRef.current = false;
      event.preventDefault();
      return;
    }
    handlerRef.current();
  }, []);

  return { onPointerDown, onClick };
}
