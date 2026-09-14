import React from 'react';
import type { ChromePresencePhase } from './ChromeSheetPresence';

type CompactWindowBackdropProps = {
  phase: ChromePresencePhase;
  onDismiss: () => void;
  ariaLabel: string;
};

/** 窄屏工作窗口共用遮罩；宽屏锚定窗口保持无整屏遮罩。 */
export const CompactWindowBackdrop: React.FC<CompactWindowBackdropProps> = ({
  phase,
  onDismiss,
  ariaLabel
}) => (
  <button
    type="button"
    className={`fixed inset-0 z-[var(--z-map-sheet-backdrop)] bg-black/15 backdrop-blur-[2px] sm:hidden chrome-dialog-backdrop-${phase}`}
    aria-label={ariaLabel}
    onClick={onDismiss}
  />
);
