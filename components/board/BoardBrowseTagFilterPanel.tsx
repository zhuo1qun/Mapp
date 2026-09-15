import React, { CSSProperties, RefObject } from 'react';
import { Tag as TagIcon } from 'lucide-react';
import { ChromeWindow } from '../ui/ChromeWindow';
import { useFixedAnchorPosition } from '../ui/useFixedAnchorPosition';
import { useCompactViewport } from '../../utils/ui/useCompactViewport';

function browseTagFilterCheckboxCls(checked: boolean) {
  return `w-4 h-4 rounded border-2 cursor-pointer appearance-none shrink-0 ${
    checked ? '' : 'bg-transparent'
  }`;
}

export type BoardBrowseTagFilterPanelProps = {
  open: boolean;
  /** 与原先 portal 显示条件一致 */
  isEditMode: boolean;
  selectedCount: number;
  anchorRef: RefObject<HTMLButtonElement | null>;
  /** 锚点随缩放/拖拽变化时须变，见 BoardView 内 useMemo */
  layoutRevision: unknown;
  themeColor: string;
  panelChromeStyle?: CSSProperties;
  labelsInSelection: string[];
  selectionHasUntagged: boolean;
  pendingDefault: boolean;
  onPendingDefaultChange: (v: boolean) => void;
  pendingUntagged: boolean;
  onPendingUntaggedChange: (v: boolean) => void;
  pendingLabels: Set<string>;
  onPendingLabelsChange: React.Dispatch<React.SetStateAction<Set<string>>>;
  canApply: boolean;
  onCancel: () => void;
  onApply: () => void;
};

export const BoardBrowseTagFilterPanel: React.FC<BoardBrowseTagFilterPanelProps> = ({
  open,
  isEditMode,
  selectedCount,
  anchorRef,
  layoutRevision,
  themeColor,
  panelChromeStyle,
  labelsInSelection,
  selectionHasUntagged,
  pendingDefault,
  onPendingDefaultChange,
  pendingUntagged,
  onPendingUntaggedChange,
  pendingLabels,
  onPendingLabelsChange,
  canApply,
  onCancel,
  onApply
}) => {
  const compact = useCompactViewport();
  const visible = open && !isEditMode && selectedCount > 1;
  const position = useFixedAnchorPosition(
    visible && !compact,
    anchorRef,
    { panelWidth: 224, panelHeight: 360 },
    layoutRevision
  );

  const body = (
    <>
      <div className="flex items-center gap-2 px-3 py-2 text-xs font-bold uppercase tracking-wide text-gray-500">
        <TagIcon size={14} className="shrink-0 text-gray-500" />
        按标签筛选
      </div>
      <div className="mb-1 h-px bg-gray-100" />
      <div className="max-h-64 overflow-y-auto px-1">
        <label className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 hover:bg-gray-50">
          <span className="text-sm text-gray-700">默认（不进行标签筛选）</span>
          <input
            type="checkbox"
            checked={pendingDefault}
            onChange={(ev) => {
              ev.stopPropagation();
              const on = ev.target.checked;
              onPendingDefaultChange(on);
              if (on) {
                onPendingLabelsChange(new Set());
                onPendingUntaggedChange(false);
              }
            }}
            onPointerDown={(ev) => ev.stopPropagation()}
            onClick={(ev) => ev.stopPropagation()}
            className={browseTagFilterCheckboxCls(pendingDefault)}
            style={{
              backgroundColor: pendingDefault ? themeColor : 'transparent',
              borderColor: themeColor
            }}
          />
        </label>
        {selectionHasUntagged && (
          <label className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 hover:bg-gray-50">
            <span className="text-sm text-gray-700">无标签</span>
            <input
              type="checkbox"
              checked={pendingUntagged}
              onChange={(ev) => {
                ev.stopPropagation();
                const on = ev.target.checked;
                onPendingUntaggedChange(on);
                if (on) onPendingDefaultChange(false);
              }}
              onPointerDown={(ev) => ev.stopPropagation()}
              onClick={(ev) => ev.stopPropagation()}
              className={browseTagFilterCheckboxCls(pendingUntagged)}
              style={{
                backgroundColor: pendingUntagged ? themeColor : 'transparent',
                borderColor: themeColor
              }}
            />
          </label>
        )}
        {labelsInSelection.map((label) => (
          <label
            key={label}
            className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 hover:bg-gray-50"
          >
            <span className="min-w-0 flex-1 truncate text-sm text-gray-700" title={label}>
              {label}
            </span>
            <input
              type="checkbox"
              checked={pendingLabels.has(label)}
              onChange={(ev) => {
                ev.stopPropagation();
                const on = !pendingLabels.has(label);
                onPendingLabelsChange((prev) => {
                  const n = new Set(prev);
                  if (n.has(label)) n.delete(label);
                  else n.add(label);
                  return n;
                });
                if (on) onPendingDefaultChange(false);
              }}
              onPointerDown={(ev) => ev.stopPropagation()}
              onClick={(ev) => ev.stopPropagation()}
              className={browseTagFilterCheckboxCls(pendingLabels.has(label))}
              style={{
                backgroundColor: pendingLabels.has(label) ? themeColor : 'transparent',
                borderColor: themeColor
              }}
            />
          </label>
        ))}
      </div>
      <div className="my-2 h-px bg-gray-100" />
      <div className="flex items-center justify-end gap-2 px-3">
        <button
          type="button"
          onClick={(ev) => {
            ev.stopPropagation();
            onCancel();
          }}
          onPointerDown={(ev) => ev.stopPropagation()}
          className="cursor-pointer rounded-lg border-0 px-2.5 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
        >
          取消
        </button>
        <button
          type="button"
          disabled={!canApply}
          onClick={(ev) => {
            ev.stopPropagation();
            onApply();
          }}
          onPointerDown={(ev) => ev.stopPropagation()}
          className="text-theme-chrome-fg cursor-pointer rounded-lg border-0 px-2.5 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-40"
          style={{ backgroundColor: themeColor }}
        >
          确定
        </button>
      </div>
    </>
  );

  const cardClass = `w-56 overflow-hidden rounded-xl border border-gray-100/80 py-2 shadow-xl ${
    panelChromeStyle ? '' : 'bg-white'
  }`;

  return (
    <ChromeWindow
      surface="window"
      open={visible}
      onClose={onCancel}
      backdropLabel="关闭筛选"
      top={position?.top ?? null}
      left={position?.left ?? null}
      className={cardClass}
      style={panelChromeStyle}
      dismissIgnoreRefs={[anchorRef]}
      data-browse-tag-filter-panel=""
    >
      {body}
    </ChromeWindow>
  );
};
