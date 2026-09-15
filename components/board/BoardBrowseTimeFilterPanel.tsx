import React, { CSSProperties, RefObject } from 'react';
import { Clock } from 'lucide-react';
import { BoardYearRangeSlider } from '../ui/BoardYearRangeSlider';
import { ChromeWindow } from '../ui/ChromeWindow';
import { useFixedAnchorPosition } from '../ui/useFixedAnchorPosition';
import { useCompactViewport } from '../../utils/ui/useCompactViewport';

export type BoardBrowseTimeFilterPanelProps = {
  open: boolean;
  isEditMode: boolean;
  selectedCount: number;
  anchorRef: RefObject<HTMLButtonElement | null>;
  layoutRevision: unknown;
  themeColor: string;
  panelChromeStyle?: CSSProperties;
  hasTimedNotesInSelection: boolean;
  sliderMinBound: number;
  sliderMaxBound: number;
  pendingMin: number;
  pendingMax: number;
  onPendingMinChange: (v: number) => void;
  onPendingMaxChange: (v: number) => void;
  onCancel: () => void;
  onApply: () => void;
};

export const BoardBrowseTimeFilterPanel: React.FC<BoardBrowseTimeFilterPanelProps> = ({
  open,
  isEditMode,
  selectedCount,
  anchorRef,
  layoutRevision,
  themeColor,
  panelChromeStyle,
  hasTimedNotesInSelection,
  sliderMinBound,
  sliderMaxBound,
  pendingMin,
  pendingMax,
  onPendingMinChange,
  onPendingMaxChange,
  onCancel,
  onApply
}) => {
  const compact = useCompactViewport();
  const visible = open && !isEditMode && selectedCount > 1;
  const position = useFixedAnchorPosition(
    visible && !compact,
    anchorRef,
    { panelWidth: 288, panelHeight: 260 },
    layoutRevision
  );

  const body = (
    <>
      <div className="flex items-center gap-2 px-3 py-2 text-xs font-bold uppercase tracking-wide text-gray-500">
        <Clock size={14} className="shrink-0 text-gray-500" />
        按起止年筛选
      </div>
      <div className="mb-1 h-px bg-gray-100" />
      {hasTimedNotesInSelection ? (
        <>
          <div className="px-3 pt-1">
            <BoardYearRangeSlider
              minBound={sliderMinBound}
              maxBound={sliderMaxBound}
              rangeMin={pendingMin}
              rangeMax={pendingMax}
              themeColor={themeColor}
              onChange={(lo, hi) => {
                onPendingMinChange(lo);
                onPendingMaxChange(hi);
              }}
            />
          </div>
          <div className="flex w-full items-start justify-between gap-3 px-3 pb-1 pt-2">
            <div className="flex min-w-0 flex-col items-start gap-0.5">
              <span className="text-xs text-gray-500">起年</span>
              <input
                type="number"
                min={sliderMinBound}
                max={sliderMaxBound}
                value={pendingMin}
                onChange={(ev) => {
                  const v = parseInt(ev.target.value, 10);
                  if (Number.isNaN(v)) return;
                  const c = Math.max(sliderMinBound, Math.min(sliderMaxBound, v));
                  onPendingMinChange(Math.min(c, pendingMax));
                }}
                className="w-[4.5rem] rounded-lg border border-gray-200 px-1.5 py-1 text-left text-xs outline-none focus:ring-2 focus:ring-offset-0"
                style={{ ['--tw-ring-color' as string]: themeColor }}
              />
            </div>
            <div className="flex min-w-0 flex-col items-end gap-0.5">
              <span className="text-xs text-gray-500">止年</span>
              <input
                type="number"
                min={sliderMinBound}
                max={sliderMaxBound}
                value={pendingMax}
                onChange={(ev) => {
                  const v = parseInt(ev.target.value, 10);
                  if (Number.isNaN(v)) return;
                  const c = Math.max(sliderMinBound, Math.min(sliderMaxBound, v));
                  onPendingMaxChange(Math.max(c, pendingMin));
                }}
                className="w-[4.5rem] rounded-lg border border-gray-200 px-1.5 py-1 text-right text-xs outline-none focus:ring-2 focus:ring-offset-0"
                style={{ ['--tw-ring-color' as string]: themeColor }}
              />
            </div>
          </div>
        </>
      ) : null}
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
          onClick={(ev) => {
            ev.stopPropagation();
            onApply();
          }}
          onPointerDown={(ev) => ev.stopPropagation()}
          className="text-theme-chrome-fg cursor-pointer rounded-lg border-0 px-2.5 py-1.5 text-sm"
          style={{ backgroundColor: themeColor }}
        >
          确定
        </button>
      </div>
    </>
  );

  const cardClass = `w-72 overflow-hidden rounded-xl border border-gray-100/80 py-2 shadow-xl ${
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
      data-browse-time-filter-panel=""
    >
      {body}
    </ChromeWindow>
  );
};
