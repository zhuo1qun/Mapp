import React, { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { mapChromeSurfaceStyle } from '../utils/map/mapChromeStyle';
import { ChromeCapsuleSlider } from './ui/ChromeCapsuleSlider';
import { ChromeMenuItem } from './ui/ChromeMenuItem';
import { ChromeMenuShell } from './ui/ChromeMenuShell';
import { ChromeWindow } from './ui/ChromeWindow';
import { ChromeWindowHeader } from './ui/ChromeWindowHeader';
import { chromePanelFieldClass } from './ui/chromePanelField';
import { useChromeAppearance } from './ui/chromeAppearanceContext';

export type SnapshotExportOptions = {
  includeBackground: boolean;
  includeBorder: boolean;
  includePins: boolean;
};
export type SnapshotExportView = 'map' | 'board' | 'graph';

interface ExportResolutionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (pixelRatio: number, options: SnapshotExportOptions) => void;
  view: SnapshotExportView;
  currentDimensions: { width: number; height: number };
  themeColor: string;
  mapUiChromeOpacity?: number;
  mapUiChromeBlurPx?: number;
}

/** 侧边栏与工作区设置共用的快照导出窗口。 */
export const ExportResolutionDialog: React.FC<ExportResolutionDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  view,
  currentDimensions,
  themeColor,
  mapUiChromeOpacity = 0.9,
  mapUiChromeBlurPx = 8
}) => {
  const chromeAppearance = useChromeAppearance();
  const exportChromeStyle = mapChromeSurfaceStyle(
    mapUiChromeOpacity,
    mapUiChromeBlurPx,
    chromeAppearance
  );
  const [selectedRatio, setSelectedRatio] = useState(2);
  const [exportOptions, setExportOptions] = useState<SnapshotExportOptions>({
    includeBackground: true,
    includeBorder: true,
    includePins: true
  });
  const [showOptions, setShowOptions] = useState(false);

  const ratioLabels: Record<number, string> = {
    1: '1x 标准',
    2: '2x 清晰',
    3: '3x 高清',
    4: '4x 超清'
  };
  const finalWidth = Math.round(currentDimensions.width * selectedRatio);
  const finalHeight = Math.round(currentDimensions.height * selectedRatio);
  const optionDefinitions: ReadonlyArray<{
    id: keyof SnapshotExportOptions;
    label: string;
  }> =
    view === 'map'
      ? [
          { id: 'includeBackground', label: '底图背景' },
          { id: 'includeBorder', label: '边界' },
          { id: 'includePins', label: '标记' }
        ]
      : view === 'board'
        ? [
            { id: 'includeBackground', label: '画布背景' },
            { id: 'includeBorder', label: 'Frame' },
            { id: 'includePins', label: '便签' }
          ]
        : [{ id: 'includeBackground', label: '画布背景' }];
  const selectedOptionsCount = optionDefinitions.filter(({ id }) => exportOptions[id]).length;
  const allOptionsSelected = selectedOptionsCount === optionDefinitions.length;
  const hasRenderableContent =
    view === 'graph' ||
    exportOptions.includeBackground ||
    exportOptions.includeBorder ||
    exportOptions.includePins;
  const optionSummary =
    view === 'graph'
      ? exportOptions.includeBackground
        ? '含画布背景'
        : '透明背景'
      : selectedOptionsCount === 0
        ? '未选择内容'
        : allOptionsSelected
          ? '全部内容'
          : `已选择 ${selectedOptionsCount} 项`;

  const toggleOption = (option: keyof SnapshotExportOptions) => {
    setExportOptions((previous) => ({ ...previous, [option]: !previous[option] }));
  };

  return (
    <ChromeWindow
      open={isOpen}
      onClose={onClose}
      backdropLabel="关闭导出当前视图"
      placement="center"
      compactBehavior="fullscreen"
      presenceKind="dialog"
      role="dialog"
      aria-modal="true"
      aria-label="导出当前视图"
      className="w-[min(20rem,calc(100vw-2rem))] max-w-[320px] p-0"
      style={exportChromeStyle}
    >
      <ChromeWindowHeader title="导出快照" onClose={onClose} />
      <div className="px-3 pb-3 pt-2">
        <div className="mb-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-xs font-medium text-gray-600">导出选项</span>
            <div className="relative min-w-0 flex-1">
              <button
                type="button"
                onClick={() => setShowOptions((open) => !open)}
                className={`${chromePanelFieldClass} w-full outline-none focus-visible:ring-2 focus-visible:ring-gray-300/70`}
              >
                <span className="truncate">
                  {optionSummary}
                </span>
                <ChevronDown
                  size={16}
                  className={`shrink-0 text-gray-500 transition-transform ${showOptions ? 'rotate-180' : ''}`}
                />
              </button>

              {showOptions ? (
                <ChromeMenuShell
                  className="absolute left-0 right-0 top-full z-10 mt-2 animate-in fade-in slide-in-from-top-2"
                  style={exportChromeStyle}
                >
                  {optionDefinitions.map(({ id, label }) => (
                    <ChromeMenuItem
                      key={id}
                      onClick={() => toggleOption(id)}
                      className="flex items-center justify-between"
                    >
                      <span className={exportOptions[id] ? 'font-bold' : 'text-gray-500'}>
                        {label}
                      </span>
                      {exportOptions[id] ? <Check size={14} style={{ color: themeColor }} /> : null}
                    </ChromeMenuItem>
                  ))}
                </ChromeMenuShell>
              ) : null}
            </div>
          </div>

          <div>
            <ChromeCapsuleSlider
              label="分辨率倍数"
              value={selectedRatio}
              min={1}
              max={4}
              step={1}
              onChange={(value) => setSelectedRatio(Math.round(value))}
              formatValue={(value) => ratioLabels[Math.round(value)] ?? `${Math.round(value)}x`}
              aria-label="分辨率倍数"
            />
            <div className="mt-0.5 flex w-full min-w-0 justify-between text-[11px] leading-tight text-gray-400">
              <span>1x</span>
              <span>4x</span>
            </div>
          </div>

          <div className="chrome-inset rounded-lg px-2.5 py-2">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-medium text-gray-600">预计尺寸</span>
              <span className="rounded-md bg-white/70 px-1.5 py-0.5 font-mono text-[10px] text-gray-500">
                {!exportOptions.includeBackground ? 'PNG' : 'JPG'}
              </span>
            </div>
            <p className="font-mono text-xs font-medium text-gray-700">
              {finalWidth} × {finalHeight}{' '}
              <span className="ml-1 text-[10px] font-normal text-gray-400">px</span>
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="chrome-field flex-1 rounded-lg px-3 py-2 text-xs font-medium text-gray-700 transition-colors"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm(selectedRatio, exportOptions);
              onClose();
            }}
            disabled={!hasRenderableContent}
            className="flex-1 rounded-lg px-3 py-2 text-xs font-medium text-theme-chrome-fg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            style={{ backgroundColor: themeColor }}
          >
            开始导出
          </button>
        </div>
      </div>
    </ChromeWindow>
  );
};
