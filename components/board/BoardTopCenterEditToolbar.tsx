import React from 'react';
import { StickyNote } from 'lucide-react';
import { ChromeIconButton } from '../ui/ChromeIconButton';

type Props = {
  isEditMode: boolean;
  isSelectingNotePosition: boolean;
  isDrawingFrame: boolean;
  isBoxSelecting: boolean;
  chromeSurfaceStyle?: React.CSSProperties;
  chromeHoverBackground?: string;
  themeColor: string;
  onToggleSelectNotePosition: () => void;
  /** 暂时隐藏图片入口（功能有 bug）；保留可选 prop 以免改动调用方 */
  onAddImage?: () => void;
  onEnableDrawFrame: () => void;
  onToggleBoxSelect: () => void;
  onClearSelectingNotePosition: () => void;
};

export const BoardTopCenterEditToolbar: React.FC<Props> = ({
  isEditMode,
  isSelectingNotePosition,
  isDrawingFrame,
  isBoxSelecting,
  chromeSurfaceStyle,
  chromeHoverBackground,
  themeColor,
  onToggleSelectNotePosition,
  onEnableDrawFrame,
  onToggleBoxSelect,
  onClearSelectingNotePosition
}) => {
  if (!isEditMode) return null;

  return (
    <div
      data-allow-context-menu
      className="fixed top-2 sm:top-4 ui-workspace-center-x z-[500] -translate-x-1/2 pointer-events-auto animate-in fade-in flex items-center gap-1.5 sm:gap-2"
      style={{ height: 40, alignItems: 'center' }}
      onPointerDown={(e) => {
        e.stopPropagation();
        onClearSelectingNotePosition();
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClearSelectingNotePosition();
      }}
    >
      <div
        className="flex gap-1.5 sm:gap-2 items-center p-0.5 sm:p-1"
        style={{ height: '40px' }}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <ChromeIconButton
          chromeSurfaceStyle={chromeSurfaceStyle}
          chromeHoverBackground={chromeHoverBackground}
          themeColor={themeColor}
          active={isSelectingNotePosition}
          activeVariant="theme"
          nonChromeIdleHover="imperative-gray100"
          onClick={onToggleSelectNotePosition}
          tooltip={isSelectingNotePosition ? '取消放置' : '便签'}
        >
          <StickyNote size={18} className="sm:w-5 sm:h-5" />
        </ChromeIconButton>
        {/* 图片按钮暂时隐藏：入口功能有 bug */}
        <ChromeIconButton
          chromeSurfaceStyle={chromeSurfaceStyle}
          chromeHoverBackground={chromeHoverBackground}
          themeColor={themeColor}
          active={isDrawingFrame}
          activeVariant="theme"
          nonChromeIdleHover="imperative-gray100"
          onClick={onEnableDrawFrame}
          tooltip="簇"
        >
          <svg
            width="18"
            height="18"
            className="sm:w-5 sm:h-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="5" y1="2" x2="5" y2="22" />
            <line x1="19" y1="2" x2="19" y2="22" />
            <line x1="3" y1="5" x2="21" y2="5" />
            <line x1="3" y1="19" x2="21" y2="19" />
          </svg>
        </ChromeIconButton>
        <ChromeIconButton
          chromeSurfaceStyle={chromeSurfaceStyle}
          chromeHoverBackground={chromeHoverBackground}
          themeColor={themeColor}
          active={isBoxSelecting}
          activeVariant="theme"
          nonChromeIdleHover="imperative-gray100"
          onClick={onToggleBoxSelect}
          tooltip="框选"
        >
          <svg
            width="18"
            height="18"
            className="sm:w-5 sm:h-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="5 5"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          </svg>
        </ChromeIconButton>
      </div>
    </div>
  );
};
