import React, { useEffect, useState } from 'react';

export type ChromePresencePhase = 'entering' | 'exiting';
export type ChromePresenceKind = 'menu' | 'sheet' | 'dialog';

export type ChromeSheetPhase = ChromePresencePhase;

type ChromeSheetPresenceProps = {
  open: boolean;
  children: (phase: ChromePresencePhase) => React.ReactNode;
};

type ChromePresenceProps = {
  open: boolean;
  /**
   * 菜单、底部操作与居中窗口共用同一套「保留到退出结束」的存在期，
   * 仅保留各自合理的位移方向与时长。
   */
  kind?: ChromePresenceKind;
  children: (phase: ChromePresencePhase) => React.ReactNode;
};

const PRESENCE_DURATION_MS: Record<ChromePresenceKind, number> = {
  menu: 180,
  sheet: 220,
  dialog: 220
};

export const ChromePresence: React.FC<ChromePresenceProps> = ({
  open,
  kind = 'dialog',
  children
}) => {
  const [present, setPresent] = useState(open);

  useEffect(() => {
    if (open) {
      setPresent(true);
      return;
    }
    const timer = window.setTimeout(() => setPresent(false), PRESENCE_DURATION_MS[kind]);
    return () => window.clearTimeout(timer);
  }, [kind, open]);

  if (!present) return null;
  return <>{children(open ? 'entering' : 'exiting')}</>;
};

/**
 * 让 sheet 在关闭后保留到退出动画结束，避免条件渲染直接截断动画。
 * 动画时长与 index.css 中的 chrome-sheet-* keyframes 保持一致。
 */
export const ChromeSheetPresence: React.FC<ChromeSheetPresenceProps> = ({ open, children }) => {
  return <ChromePresence open={open} kind="sheet">{children}</ChromePresence>;
};
