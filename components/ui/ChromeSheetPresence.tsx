import React, { useEffect, useState } from 'react';

export type ChromeSheetPhase = 'entering' | 'exiting';

type ChromeSheetPresenceProps = {
  open: boolean;
  children: (phase: ChromeSheetPhase) => React.ReactNode;
};

/**
 * 让 sheet 在关闭后保留到退出动画结束，避免条件渲染直接截断动画。
 * 动画时长与 index.css 中的 chrome-sheet-* keyframes 保持一致。
 */
export const ChromeSheetPresence: React.FC<ChromeSheetPresenceProps> = ({ open, children }) => {
  const [present, setPresent] = useState(open);

  useEffect(() => {
    if (open) {
      setPresent(true);
      return;
    }
    const timer = window.setTimeout(() => setPresent(false), 180);
    return () => window.clearTimeout(timer);
  }, [open]);

  if (!present) return null;
  return <>{children(open ? 'entering' : 'exiting')}</>;
};
