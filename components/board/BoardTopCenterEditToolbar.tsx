import React from 'react';
import { Pencil, StickyNote } from 'lucide-react';
import { ChromeIconButton } from '../ui/ChromeIconButton';

type Props = {
  isEditMode: boolean;
  isSelectingNotePosition: boolean;
  isDrawingFrame: boolean;
  isBoxSelecting: boolean;
  chromeSurfaceStyle?: React.CSSProperties;
  chromeHoverBackground?: string;
  themeColor: string;
  onEnterEditMode: () => void;
  onExitEditMode: () => void;
  onToggleSelectNotePosition: () => void;
  /** 暂时隐藏图片入口（功能有 bug）；保留可选 prop 以免改动调用方 */
  onAddImage?: () => void;
  onEnableDrawFrame: () => void;
  onToggleBoxSelect: () => void;
  onClearSelectingNotePosition: () => void;
};

const FrameToolIcon = ({ className = '' }: { className?: string }) => (
  <svg
    width="18"
    height="18"
    className={className}
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
);

const BoxSelectToolIcon = ({ className = '' }: { className?: string }) => (
  <svg
    width="18"
    height="18"
    className={className}
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
);

export const BoardTopCenterEditToolbar: React.FC<Props> = ({
  isEditMode,
  isSelectingNotePosition,
  isDrawingFrame,
  isBoxSelecting,
  chromeSurfaceStyle,
  chromeHoverBackground,
  themeColor,
  onEnterEditMode,
  onExitEditMode,
  onToggleSelectNotePosition,
  onEnableDrawFrame,
  onToggleBoxSelect,
  onClearSelectingNotePosition
}) => {
  // 窄屏时工具随编辑模式常驻：不受画布、编辑器或外点事件影响。
  const isCompactMenuOpen = isEditMode;
  const toggleCompactEditMode = () => {
    if (!isEditMode) {
      onEnterEditMode();
      return;
    }
    onExitEditMode();
  };

  return (
    <>
      {/* 宽屏保留顶部中间的三项编辑工具。 */}
      {isEditMode ? <div
        data-allow-context-menu
        data-mapp-chrome-ui=""
        className="fixed top-2 sm:top-4 ui-workspace-center-x z-[500] hidden -translate-x-1/2 animate-in fade-in items-center gap-1.5 sm:gap-2 pointer-events-auto sm:flex"
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
            <FrameToolIcon className="sm:h-5 sm:w-5" />
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
            <BoxSelectToolIcon className="sm:h-5 sm:w-5" />
          </ChromeIconButton>
        </div>
      </div> : null}

      {/* 窄屏与 Mapping 相同：左下角主按钮展开 90° / 45° / 0° 三项工具。 */}
      <div
        data-allow-context-menu
        data-mapp-chrome-ui=""
        className="ui-board-compact-edit-control fixed ui-workspace-left z-[500] h-14 w-14 pointer-events-auto sm:hidden"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <ChromeIconButton
          className="relative z-10 !h-14 !w-14 !rounded-2xl"
          chromeSurfaceStyle={chromeSurfaceStyle}
          chromeHoverBackground={chromeHoverBackground}
          themeColor={themeColor}
          active={isCompactMenuOpen}
          activeVariant="theme"
          nonChromeIdleHover="imperative-gray100"
          onClick={toggleCompactEditMode}
          tooltip={isEditMode ? '完成编辑' : '编辑'}
          aria-expanded={isCompactMenuOpen}
          aria-controls="board-edit-radial-menu"
        >
          <Pencil size={24} className={`transition-transform duration-200 ${isCompactMenuOpen ? 'rotate-45' : ''}`} />
        </ChromeIconButton>

        <div
          id="board-edit-radial-menu"
          className="pointer-events-none absolute left-2 top-2 z-0 h-10 w-10"
          aria-hidden={!isCompactMenuOpen}
        >
          <div
            className="absolute inset-0"
            style={{
              transform: isCompactMenuOpen ? 'translate3d(0, -78px, 0) scale(1)' : 'scale(0.66)',
              opacity: isCompactMenuOpen ? 1 : 0,
              transition: `transform 220ms cubic-bezier(0.22, 1, 0.36, 1) ${isCompactMenuOpen ? '0ms' : '45ms'}, opacity 150ms ease ${isCompactMenuOpen ? '0ms' : '45ms'}`
            }}
          >
            <ChromeIconButton
              className="ui-board-edit-radial-action pointer-events-auto"
              chromeSurfaceStyle={chromeSurfaceStyle}
              chromeHoverBackground={chromeHoverBackground}
              themeColor={themeColor}
              active={isSelectingNotePosition}
              activeVariant="theme"
              nonChromeIdleHover="imperative-gray100"
              disabled={!isCompactMenuOpen}
              tabIndex={isCompactMenuOpen ? 0 : -1}
              onPointerDown={onClearSelectingNotePosition}
              onClick={() => {
                onToggleSelectNotePosition();
              }}
              tooltip={isSelectingNotePosition ? '取消放置' : '便签'}
            >
              <StickyNote size={18} />
            </ChromeIconButton>
          </div>

          <div
            className="absolute inset-0"
            style={{
              transform: isCompactMenuOpen ? 'translate3d(55px, -55px, 0) scale(1)' : 'scale(0.66)',
              opacity: isCompactMenuOpen ? 1 : 0,
              transition: `transform 220ms cubic-bezier(0.22, 1, 0.36, 1) ${isCompactMenuOpen ? '35ms' : '0ms'}, opacity 150ms ease ${isCompactMenuOpen ? '35ms' : '0ms'}`
            }}
          >
            <ChromeIconButton
              className="ui-board-edit-radial-action pointer-events-auto"
              chromeSurfaceStyle={chromeSurfaceStyle}
              chromeHoverBackground={chromeHoverBackground}
              themeColor={themeColor}
              active={isDrawingFrame}
              activeVariant="theme"
              nonChromeIdleHover="imperative-gray100"
              disabled={!isCompactMenuOpen}
              tabIndex={isCompactMenuOpen ? 0 : -1}
              onPointerDown={onClearSelectingNotePosition}
              onClick={() => {
                onEnableDrawFrame();
              }}
              tooltip="簇"
            >
              <FrameToolIcon />
            </ChromeIconButton>
          </div>

          <div
            className="absolute inset-0"
            style={{
              transform: isCompactMenuOpen ? 'translate3d(78px, 0, 0) scale(1)' : 'scale(0.66)',
              opacity: isCompactMenuOpen ? 1 : 0,
              transition: `transform 220ms cubic-bezier(0.22, 1, 0.36, 1) ${isCompactMenuOpen ? '70ms' : '0ms'}, opacity 150ms ease ${isCompactMenuOpen ? '70ms' : '0ms'}`
            }}
          >
            <ChromeIconButton
              className="ui-board-edit-radial-action pointer-events-auto"
              chromeSurfaceStyle={chromeSurfaceStyle}
              chromeHoverBackground={chromeHoverBackground}
              themeColor={themeColor}
              active={isBoxSelecting}
              activeVariant="theme"
              nonChromeIdleHover="imperative-gray100"
              disabled={!isCompactMenuOpen}
              tabIndex={isCompactMenuOpen ? 0 : -1}
              onPointerDown={onClearSelectingNotePosition}
              onClick={() => {
                onToggleBoxSelect();
              }}
              tooltip="框选"
            >
              <BoxSelectToolIcon />
            </ChromeIconButton>
          </div>
        </div>
      </div>
    </>
  );
};
