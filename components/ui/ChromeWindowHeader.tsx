import React from 'react';
import { X } from 'lucide-react';
import { chromePanelGhostIconButtonClass } from './chromePanelIconButton';

type ChromeWindowHeaderProps = {
  title: React.ReactNode;
  titleId?: string;
  onClose?: () => void;
  closeLabel?: string;
  className?: string;
  trailing?: React.ReactNode;
};

/**
 * 所有常规窗口共用的轻量标题栏。
 * 标题与内容间距统一，关闭按钮也不再由各窗口各自绝对定位。
 */
export const ChromeWindowHeader: React.FC<ChromeWindowHeaderProps> = ({
  title,
  titleId,
  onClose,
  closeLabel = '关闭',
  className = '',
  trailing
}) => (
  <div className={`flex shrink-0 items-center justify-between gap-2 px-3 pt-2.5 ${className}`.trim()}>
    <h2 id={titleId} className="min-w-0 text-xs font-medium text-gray-500">
      {title}
    </h2>
    <div className="flex shrink-0 items-center gap-1">
      {trailing}
      {onClose ? (
        <button type="button" onClick={onClose} className={chromePanelGhostIconButtonClass} aria-label={closeLabel}>
          <X size={16} aria-hidden />
        </button>
      ) : null}
    </div>
  </div>
);
