import React, { CSSProperties, RefObject } from 'react';
import { Clock, Tag as TagIcon, Trash2, Undo2, Pencil, Group, Ungroup, MapPin } from 'lucide-react';
import { AnchoredTransientOverlay } from '../ui/AnchoredTransientOverlay';

type MultiBatchPanel = 'none' | 'tag' | 'time';

export type BoardMultiSelectToolbarProps = {
  themeColor: string;
  panelChromeStyle?: CSSProperties;
  inverseCanvasScale: number;
  isEditMode: boolean;
  multiBatchPanel: MultiBatchPanel;

  onExitMultiSelectToolbar: () => void;
  onToggleBatchTagPanel: () => void;
  onToggleBatchTimePanel: () => void;
  onRunBatchDelete: () => void;
  /** 1 = 单选（与多选同一套工具栏，文案/追踪入口不同）。 */
  selectionCount: number;
  onLocateOnMap?: () => void;

  canGroup?: boolean;
  canUngroup?: boolean;
  onRunGroup?: () => void;
  onRunUngroup?: () => void;

  browseTagFilterPanelOpen: boolean;
  browseTimeFilterPanelOpen: boolean;
  boardBrowseTagFilterButtonRef: RefObject<HTMLButtonElement | null>;
  boardBrowseTimeFilterButtonRef: RefObject<HTMLButtonElement | null>;
  onEnterEditModeFromBrowse: () => void;
  onOpenBrowseTagFilterPanel: () => void;
  onOpenBrowseTimeFilterPanel: () => void;
  onStopToolbarEvent?: (e: React.SyntheticEvent) => void;
  editPanelNode: React.ReactNode;
  /** 贴在包围盒下方（靠近画布顶时避免工具栏被裁切）。 */
  placeBelow?: boolean;
  /** 待定箱复用同一工具栏，但不显示与画布无关的批量编辑项。 */
  showBatchActions?: boolean;
  showDelete?: boolean;
  position?: 'above' | 'below' | 'inside-top';
  isDark?: boolean;
  /** 对于位于滚动窗口中的对象，将工具栏 portal 到顶层以避免 overflow 裁切。 */
  portal?: boolean;
  portalAnchorElement?: HTMLElement | null;
  portalScope?: string;
  /** 编辑器打开时仍需位于其窗口之上的文本/对象工具栏。 */
  portalZIndex?: number;
};

export const BoardMultiSelectToolbar: React.FC<BoardMultiSelectToolbarProps> = (props) => {
  const {
    themeColor,
    panelChromeStyle,
    inverseCanvasScale,
    isEditMode,
    multiBatchPanel,
    onExitMultiSelectToolbar,
    onToggleBatchTagPanel,
    onToggleBatchTimePanel,
    onRunBatchDelete,
    selectionCount,
    onLocateOnMap,
    canGroup,
    canUngroup,
    onRunGroup,
    onRunUngroup,
    browseTagFilterPanelOpen,
    browseTimeFilterPanelOpen,
    boardBrowseTagFilterButtonRef,
    boardBrowseTimeFilterButtonRef,
    onEnterEditModeFromBrowse,
    onOpenBrowseTagFilterPanel,
    onOpenBrowseTimeFilterPanel,
    editPanelNode,
    placeBelow = false,
    showBatchActions = true,
    showDelete = true,
    position,
    isDark = false,
    portal = false,
    portalAnchorElement,
    portalScope,
    portalZIndex = 8000
  } = props;

  const stopToolbarEvent = (e: React.SyntheticEvent) => {
    e.stopPropagation();
    e.preventDefault();
    props.onStopToolbarEvent?.(e);
  };

  const isMulti = selectionCount > 1;
  const iconButtonClass = `cursor-pointer border-0 p-2 rounded-lg transition-colors ${
    isDark ? 'text-gray-100 hover:bg-white/10' : 'text-gray-600 hover:bg-gray-100'
  }`;
  const activeButtonClass = `cursor-pointer border-0 p-2 rounded-lg transition-colors ${
    isDark ? 'bg-white/15 text-white' : 'bg-gray-100 text-gray-900'
  }`;
  const toolbarPosition =
    position === 'inside-top'
      ? { top: '8px' }
      : position === 'below' || placeBelow
        ? { top: 'calc(100% + 8px)' }
        : { bottom: 'calc(100% + 8px)' };
  const toolbarOrigin =
    position === 'inside-top' || position === 'below' || placeBelow ? 'top right' : 'bottom right';
  const locateButtons =
    onLocateOnMap ? (
      <>
        {onLocateOnMap ? (
          <button
            type="button"
            onClick={(e) => {
              stopToolbarEvent(e);
              onLocateOnMap();
            }}
            onPointerDown={stopToolbarEvent}
            className={iconButtonClass}
            title="定位到地图"
          >
            <MapPin size={16} />
          </button>
        ) : null}
      </>
    ) : null;

  const toolbarContents = (
    <>
      <div
        className={`flex shrink-0 items-center gap-0.5 rounded-xl border p-1 shadow-lg ${
          isDark ? 'border-white/15 bg-slate-900/90' : 'border-gray-100/80 bg-white/95'
        }`}
        style={panelChromeStyle}
      >
        {isEditMode ? (
          <>
            <button
              type="button"
              onClick={(e) => {
                stopToolbarEvent(e);
                onExitMultiSelectToolbar();
              }}
              onPointerDown={stopToolbarEvent}
              className={iconButtonClass}
              title={isMulti ? '退出多选' : '取消选中'}
            >
              <Undo2 size={16} />
            </button>
            {showBatchActions ? <button
              type="button"
              onClick={(e) => {
                stopToolbarEvent(e);
                onToggleBatchTagPanel();
              }}
              onPointerDown={stopToolbarEvent}
              className={`${multiBatchPanel === 'tag' ? activeButtonClass : iconButtonClass}`}
              style={multiBatchPanel === 'tag' ? { boxShadow: `inset 0 0 0 1px ${themeColor}` } : undefined}
              title={isMulti ? '批量添加标签' : '添加标签'}
            >
              <TagIcon size={16} />
            </button> : null}
            {showBatchActions ? <button
              type="button"
              onClick={(e) => {
                stopToolbarEvent(e);
                onToggleBatchTimePanel();
              }}
              onPointerDown={stopToolbarEvent}
              className={`${multiBatchPanel === 'time' ? activeButtonClass : iconButtonClass}`}
              style={multiBatchPanel === 'time' ? { boxShadow: `inset 0 0 0 1px ${themeColor}` } : undefined}
              title={isMulti ? '批量修改起止时间' : '修改起止时间'}
            >
              <Clock size={16} />
            </button> : null}
            {locateButtons}
            {canGroup && (
              <button type="button" onClick={(e) => { stopToolbarEvent(e); onRunGroup?.(); }} onPointerDown={stopToolbarEvent} className={iconButtonClass} title="成组 (⌘G)"><Group size={16} /></button>
            )}
            {canUngroup && (
              <button type="button" onClick={(e) => { stopToolbarEvent(e); onRunUngroup?.(); }} onPointerDown={stopToolbarEvent} className={iconButtonClass} title="取消编组 (⌘⇧G)"><Ungroup size={16} /></button>
            )}
            {showDelete ? <button
              type="button"
              onClick={(e) => { stopToolbarEvent(e); onRunBatchDelete(); }}
              onPointerDown={stopToolbarEvent}
              className={`cursor-pointer border-0 p-2 rounded-lg transition-colors ${isDark ? 'text-red-300 hover:bg-red-500/15' : 'text-red-600 hover:bg-red-50'}`}
              title={isMulti ? '批量删除' : '删除'}
            ><Trash2 size={16} /></button> : null}
          </>
        ) : (
          <>
            <button type="button" onClick={(e) => { stopToolbarEvent(e); onExitMultiSelectToolbar(); }} onPointerDown={stopToolbarEvent} className={iconButtonClass} title={isMulti ? '退出多选' : '取消选中'}><Undo2 size={16} /></button>
            <button ref={boardBrowseTagFilterButtonRef} type="button" onClick={(e) => { stopToolbarEvent(e); onOpenBrowseTagFilterPanel(); }} onPointerDown={stopToolbarEvent} className={browseTagFilterPanelOpen ? activeButtonClass : iconButtonClass} style={browseTagFilterPanelOpen ? { boxShadow: `inset 0 0 0 1px ${themeColor}` } : undefined} title="按标签筛选"><TagIcon size={16} /></button>
            <button ref={boardBrowseTimeFilterButtonRef} type="button" onClick={(e) => { stopToolbarEvent(e); onOpenBrowseTimeFilterPanel(); }} onPointerDown={stopToolbarEvent} className={browseTimeFilterPanelOpen ? activeButtonClass : iconButtonClass} style={browseTimeFilterPanelOpen ? { boxShadow: `inset 0 0 0 1px ${themeColor}` } : undefined} title="按起止年筛选"><Clock size={16} /></button>
            {locateButtons}
            <button type="button" onClick={(e) => { stopToolbarEvent(e); onEnterEditModeFromBrowse(); }} onPointerDown={stopToolbarEvent} className={iconButtonClass} title="进入编辑模式"><Pencil size={16} /></button>
          </>
        )}
      </div>
      {editPanelNode}
    </>
  );

  if (portal && portalAnchorElement && position !== 'inside-top') {
    return (
      <AnchoredTransientOverlay
        anchorElement={portalAnchorElement}
        preferredPlacement={position === 'below' || placeBelow ? 'below' : 'above'}
        align="end"
        zIndex={portalZIndex}
        scope={portalScope}
      >
        <div data-board-batch-toolbar-root className="flex flex-col items-end gap-1.5">
          {toolbarContents}
        </div>
      </AnchoredTransientOverlay>
    );
  }

  return (
    <div
      data-board-batch-toolbar-root
      className="absolute right-2 z-[2101] flex flex-col items-end gap-1.5"
      style={{
        ...toolbarPosition,
        transform: `scale(${inverseCanvasScale})`,
        transformOrigin: toolbarOrigin,
        pointerEvents: 'auto'
      }}
    >
      {toolbarContents}
    </div>
  );
};
