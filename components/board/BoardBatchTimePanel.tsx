import React, { CSSProperties } from 'react';
import { Clock } from 'lucide-react';

export type BoardBatchTimePanelProps = {
  themeColor: string;
  panelChromeStyle?: CSSProperties;
  selectedCount: number;
  batchTimeStartStr: string;
  onBatchTimeStartStrChange: React.Dispatch<React.SetStateAction<string>>;
  batchTimeEndStr: string;
  onBatchTimeEndStrChange: React.Dispatch<React.SetStateAction<string>>;
  onApply: () => void;
};

export const BoardBatchTimePanel: React.FC<BoardBatchTimePanelProps> = ({
  themeColor,
  panelChromeStyle,
  selectedCount,
  batchTimeStartStr,
  onBatchTimeStartStrChange,
  batchTimeEndStr,
  onBatchTimeEndStrChange,
  onApply
}) => {
  return (
    <div
      className="whitespace-nowrap rounded-xl border border-gray-100/80 bg-white p-2.5 shadow-lg"
      style={panelChromeStyle}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="mb-1 flex items-center gap-2 text-xs text-gray-500">
        <Clock size={14} className="shrink-0 text-gray-400" />
        {selectedCount === 1
          ? '设置便签的起止年（留空起年则清空时间）'
          : `统一设置 ${selectedCount} 个便签的起止年（留空起年则清空时间）`}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <input
          type="number"
          min={1}
          max={9999}
          value={batchTimeStartStr}
          onChange={(e) => onBatchTimeStartStrChange(e.target.value)}
          className="w-16 rounded-lg border border-gray-200 px-1.5 py-1 text-xs outline-none focus:ring-2 focus:ring-offset-0"
          style={{ ['--tw-ring-color' as string]: themeColor }}
        />
        <span className="text-gray-400 text-xs">–</span>
        <input
          type="number"
          min={1}
          max={9999}
          value={batchTimeEndStr}
          onChange={(e) => onBatchTimeEndStrChange(e.target.value)}
          className="w-20 rounded-lg border border-gray-200 px-1.5 py-1 text-xs outline-none focus:ring-2 focus:ring-offset-0"
          style={{ ['--tw-ring-color' as string]: themeColor }}
        />
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onApply();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className="cursor-pointer rounded-lg border-0 px-2 py-1 text-xs text-theme-chrome-fg"
          style={{ backgroundColor: themeColor }}
          title="应用（Apply）"
        >
          应用
        </button>
      </div>
    </div>
  );
};

