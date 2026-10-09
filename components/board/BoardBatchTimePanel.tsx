import React, { CSSProperties } from 'react';
import { Clock } from 'lucide-react';
import { ChromeTextField } from '../ui/ChromeTextField';
import { ChromeActionButton } from '../ui/ChromeActionButton';
import { useChromeAppearance } from '../ui/chromeAppearanceContext';

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
  const chromeAppearance = useChromeAppearance();
  const scopeLabel = selectedCount === 1 ? '为当前便签设置起止年' : `为 ${selectedCount} 个便签设置起止年`;

  return (
    <div
      className={`map-chrome-content-${chromeAppearance} flex flex-wrap items-center gap-1.5 whitespace-nowrap rounded-xl border border-gray-100/80 p-2 shadow-lg`}
      style={panelChromeStyle}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <Clock size={14} className="shrink-0 text-gray-400" aria-hidden />
      <span className="sr-only">{scopeLabel}</span>
      <ChromeTextField
        type="number"
        min={1}
        max={9999}
        value={batchTimeStartStr}
        onChange={(e) => onBatchTimeStartStrChange(e.target.value)}
        themeColor={themeColor}
        containerClassName="h-8 w-16 shrink-0 sm:h-8"
        className="px-1.5 text-xs"
        aria-label="起始年（留空清空时间）"
      />
      <span className="text-xs text-gray-400" aria-hidden>–</span>
      <ChromeTextField
        type="number"
        min={1}
        max={9999}
        value={batchTimeEndStr}
        onChange={(e) => onBatchTimeEndStrChange(e.target.value)}
        themeColor={themeColor}
        containerClassName="h-8 w-20 shrink-0 sm:h-8"
        className="px-1.5 text-xs"
        aria-label="结束年"
      />
      <ChromeActionButton
        themeColor={themeColor}
        tone="primary"
        onClick={(e) => {
          e.stopPropagation();
          onApply();
        }}
        onPointerDown={(e) => e.stopPropagation()}
        className="px-2 py-1"
        title={scopeLabel}
      >
        完成
      </ChromeActionButton>
    </div>
  );
};
