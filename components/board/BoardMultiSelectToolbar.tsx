import React, { CSSProperties, RefObject } from 'react';
import { Clock, Tag as TagIcon, Trash2, Undo2, Pencil, Group, Ungroup, MapPin, GitBranch } from 'lucide-react';

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
  onLocateOnGraph?: () => void;

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
    onLocateOnGraph,
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
    placeBelow = false
  } = props;

  const stopToolbarEvent = (e: React.SyntheticEvent) => {
    e.stopPropagation();
    e.preventDefault();
    props.onStopToolbarEvent?.(e);
  };

  const isMulti = selectionCount > 1;
  const locateButtons =
    onLocateOnMap || onLocateOnGraph ? (
      <>
        {onLocateOnMap ? (
          <button
            type="button"
            onClick={(e) => {
              stopToolbarEvent(e);
              onLocateOnMap();
            }}
            onPointerDown={stopToolbarEvent}
            className="cursor-pointer border-0 p-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
            title="定位到地图"
          >
            <MapPin size={16} />
          </button>
        ) : null}
        {onLocateOnGraph ? (
          <button
            type="button"
            onClick={(e) => {
              stopToolbarEvent(e);
              onLocateOnGraph();
            }}
            onPointerDown={stopToolbarEvent}
            className="cursor-pointer border-0 p-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
            title="定位到图谱"
          >
            <GitBranch size={16} />
          </button>
        ) : null}
      </>
    ) : null;

  return (
    <div
      data-board-batch-toolbar-root
      className="absolute right-2 z-[2101] flex flex-col items-end gap-1.5"
      style={{
        ...(placeBelow
          ? { top: 'calc(100% + 8px)' }
          : { bottom: 'calc(100% + 8px)' }),
        transform: `scale(${inverseCanvasScale})`,
        transformOrigin: placeBelow ? 'top right' : 'bottom right',
        pointerEvents: 'auto'
      }}
    >
      <div
        className="flex shrink-0 items-center gap-0.5 rounded-xl border border-gray-100/80 bg-white/95 p-1 shadow-lg"
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
              className="cursor-pointer border-0 p-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
              title={isMulti ? '退出多选' : '取消选中'}
            >
              <Undo2 size={16} />
            </button>
            <button
              type="button"
              onClick={(e) => {
                stopToolbarEvent(e);
                onToggleBatchTagPanel();
              }}
              onPointerDown={stopToolbarEvent}
              className={`cursor-pointer border-0 p-2 rounded-lg transition-colors ${
                multiBatchPanel === 'tag'
                  ? 'bg-gray-100 text-gray-900'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
              style={multiBatchPanel === 'tag' ? { boxShadow: `inset 0 0 0 1px ${themeColor}` } : undefined}
              title={isMulti ? '批量添加标签' : '添加标签'}
            >
              <TagIcon size={16} />
            </button>
            <button
              type="button"
              onClick={(e) => {
                stopToolbarEvent(e);
                onToggleBatchTimePanel();
              }}
              onPointerDown={stopToolbarEvent}
              className={`cursor-pointer border-0 p-2 rounded-lg transition-colors ${
                multiBatchPanel === 'time'
                  ? 'bg-gray-100 text-gray-900'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
              style={multiBatchPanel === 'time' ? { boxShadow: `inset 0 0 0 1px ${themeColor}` } : undefined}
              title={isMulti ? '批量修改起止时间' : '修改起止时间'}
            >
              <Clock size={16} />
            </button>
            {locateButtons}
            {canGroup && (
              <button
                type="button"
                onClick={(e) => { stopToolbarEvent(e); onRunGroup?.(); }}
                onPointerDown={stopToolbarEvent}
                className="cursor-pointer border-0 p-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
                title="成组 (⌘G)"
              >
                <Group size={16} />
              </button>
            )}
            {canUngroup && (
              <button
                type="button"
                onClick={(e) => { stopToolbarEvent(e); onRunUngroup?.(); }}
                onPointerDown={stopToolbarEvent}
                className="cursor-pointer border-0 p-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
                title="取消编组 (⌘⇧G)"
              >
                <Ungroup size={16} />
              </button>
            )}
            <button
              type="button"
              onClick={(e) => {
                stopToolbarEvent(e);
                onRunBatchDelete();
              }}
              onPointerDown={stopToolbarEvent}
              className="cursor-pointer border-0 p-2 rounded-lg text-red-600 hover:bg-red-50 transition-colors"
              title={isMulti ? '批量删除' : '删除'}
            >
              <Trash2 size={16} />
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={(e) => {
                stopToolbarEvent(e);
                onExitMultiSelectToolbar();
              }}
              onPointerDown={stopToolbarEvent}
              className="cursor-pointer border-0 p-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
              title={isMulti ? '退出多选' : '取消选中'}
            >
              <Undo2 size={16} />
            </button>
            <button
              ref={boardBrowseTagFilterButtonRef}
              type="button"
              onClick={(e) => {
                stopToolbarEvent(e);
                onOpenBrowseTagFilterPanel();
              }}
              onPointerDown={stopToolbarEvent}
              className={`cursor-pointer border-0 p-2 rounded-lg transition-colors ${
                browseTagFilterPanelOpen ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-100'
              }`}
              style={browseTagFilterPanelOpen ? { boxShadow: `inset 0 0 0 1px ${themeColor}` } : undefined}
              title="按标签筛选"
            >
              <TagIcon size={16} />
            </button>
            <button
              ref={boardBrowseTimeFilterButtonRef}
              type="button"
              onClick={(e) => {
                stopToolbarEvent(e);
                onOpenBrowseTimeFilterPanel();
              }}
              onPointerDown={stopToolbarEvent}
              className={`cursor-pointer border-0 p-2 rounded-lg transition-colors ${
                browseTimeFilterPanelOpen ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-100'
              }`}
              style={browseTimeFilterPanelOpen ? { boxShadow: `inset 0 0 0 1px ${themeColor}` } : undefined}
              title="按起止年筛选"
            >
              <Clock size={16} />
            </button>
            {locateButtons}
            <button
              type="button"
              onClick={(e) => {
                stopToolbarEvent(e);
                onEnterEditModeFromBrowse();
              }}
              onPointerDown={stopToolbarEvent}
              className="cursor-pointer border-0 p-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
              title="进入编辑模式"
            >
              <Pencil size={16} />
            </button>
          </>
        )}
      </div>

      {editPanelNode}
    </div>
  );
};

