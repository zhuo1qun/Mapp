import React from 'react';
import type { ChromePresencePhase } from './ChromeSheetPresence';

type CompactWindowBackdropProps = {
  phase: ChromePresencePhase;
  /** 保留兼容；遮罩本身不接收点击，关闭由 ChromeWindow 外点监听负责。 */
  onDismiss?: () => void;
  ariaLabel?: string;
  /** 居中对话框在宽屏也需要遮罩；锚定窗口仍仅窄屏显示。 */
  always?: boolean;
};

/**
 * 工作窗口遮罩只负责压暗与存在期动画。
 * 使用 pointer-events-none，避免盖住顶栏/底栏按钮（定位↔新建、预设页签）。
 * 点空白关闭走 ChromeWindow 的 document 捕获监听。
 */
export const CompactWindowBackdrop: React.FC<CompactWindowBackdropProps> = ({
  phase,
  always = false
}) => (
  <div
    data-compact-window-backdrop
    className={`pointer-events-none fixed inset-0 z-[var(--z-map-sheet-backdrop)] bg-black/15 backdrop-blur-[2px] ${
      always ? '' : 'sm:hidden'
    } chrome-dialog-backdrop-${phase}`}
    aria-hidden
  />
);
