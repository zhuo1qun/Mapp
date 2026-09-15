import React from 'react';
import { Clock, Network } from 'lucide-react';
import type { GraphLayoutMode } from '../../utils/graph/graphRuntimeCore';
import type { GraphViewPreset } from '../../utils/graph/graphPresets';
import { PortalTooltip } from '../ui/PortalTooltip';
import { GraphPresetsMenu } from './GraphPresetsMenu';

type Props = {
  panelChromeStyle?: React.CSSProperties;
  themeColor: string;
  activeGraphLayout: GraphLayoutMode;
  /** 有值时表示预设态：时间线/力导不高亮，预设页签高亮 */
  activeGraphPresetId?: string | null;
  onApplyTimeLayout: () => void;
  onApplyCoseLayout: () => void;
  graphPresets: GraphViewPreset[];
  onSaveGraphPreset: (name: string) => void;
  onUpdateGraphPreset: (id: string) => void;
  onApplyGraphPreset: (id: string) => void;
  onRenameGraphPreset: (id: string, name: string) => void;
  onDeleteGraphPreset: (id: string) => void;
};

export const GraphLayoutModeBar: React.FC<Props> = ({
  panelChromeStyle,
  themeColor,
  activeGraphLayout,
  activeGraphPresetId = null,
  onApplyTimeLayout,
  onApplyCoseLayout,
  graphPresets,
  onSaveGraphPreset,
  onUpdateGraphPreset,
  onApplyGraphPreset,
  onRenameGraphPreset,
  onDeleteGraphPreset
}) => {
  const inPreset = Boolean(activeGraphPresetId);

  const graphLayoutBtnClass = (mode: GraphLayoutMode | 'preset') => {
    const selected =
      mode === 'preset' ? inPreset : !inPreset && activeGraphLayout === mode;
    return `flex items-center justify-center px-3 py-2 rounded-xl transition-all font-bold text-sm ${
      selected ? 'text-theme-chrome-fg shadow-md scale-105' : 'text-gray-500 hover:bg-gray-100'
    }`;
  };

  const items: Array<{
    mode: GraphLayoutMode;
    label: string;
    onClick: () => void;
    icon: React.ReactNode;
  }> = [
    { mode: 'time', label: '时间线', onClick: onApplyTimeLayout, icon: <Clock size={20} /> },
    { mode: 'cose', label: '力导', onClick: onApplyCoseLayout, icon: <Network size={20} /> }
  ];

  return (
    <div
      data-allow-context-menu
      className={`fixed bottom-20 ui-workspace-center-x ui-workspace-secondary-bottom-bar -translate-x-1/2 z-[45] max-w-[min(100vw-1rem,28rem)] p-1.5 rounded-2xl shadow-xl border flex flex-nowrap justify-center gap-1 pointer-events-auto ${
        panelChromeStyle ? 'border-gray-100/80' : 'border-white/50 map-chrome-surface-fallback'
      }`}
      style={panelChromeStyle}
    >
      {items.map((item) => {
        const selected = !inPreset && activeGraphLayout === item.mode;
        return (
          <PortalTooltip key={item.mode} content={item.label} compact>
            <button
              type="button"
              aria-label={item.label}
              onClick={item.onClick}
              className={graphLayoutBtnClass(item.mode)}
              style={selected ? { backgroundColor: themeColor } : undefined}
            >
              {item.icon}
            </button>
          </PortalTooltip>
        );
      })}
      <GraphPresetsMenu
        themeColor={themeColor}
        panelChromeStyle={panelChromeStyle}
        presets={graphPresets}
        activePresetId={activeGraphPresetId}
        onSaveCurrent={onSaveGraphPreset}
        onUpdatePreset={onUpdateGraphPreset}
        onApply={onApplyGraphPreset}
        onRename={onRenameGraphPreset}
        onDelete={onDeleteGraphPreset}
        tabButtonClassName={graphLayoutBtnClass('preset')}
        tabActive={inPreset}
      />
    </div>
  );
};
