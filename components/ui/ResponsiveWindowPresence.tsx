import React from 'react';
import {
  ChromePresence,
  type ChromePresenceKind,
  type ChromePresencePhase
} from './ChromeSheetPresence';
import { CompactWindowBackdrop } from './CompactWindowBackdrop';

type ResponsiveWindowPresenceProps = {
  open: boolean;
  onClose: () => void;
  backdropLabel: string;
  /** 宽屏锚定菜单与窄屏 Sheet 可选用不同的存在期节奏。 */
  kind?: ChromePresenceKind;
  children: (phase: ChromePresencePhase) => React.ReactNode;
};

/**
 * 工作窗口的共同外壳。
 * 内容和锚点仍由各业务组件负责；此处只统一存在期与“仅窄屏遮罩”的响应式规则。
 */
export const ResponsiveWindowPresence: React.FC<ResponsiveWindowPresenceProps> = ({
  open,
  onClose,
  backdropLabel,
  kind = 'sheet',
  children
}) => (
  <ChromePresence open={open} kind={kind}>
    {(phase) => (
      <>
        <CompactWindowBackdrop phase={phase} onDismiss={onClose} ariaLabel={backdropLabel} />
        {children(phase)}
      </>
    )}
  </ChromePresence>
);
