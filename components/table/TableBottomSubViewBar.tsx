import React from 'react';
import { CircleDot, Link2 } from 'lucide-react';

type Props = {
  panelChromeStyle?: React.CSSProperties;
  themeColor: string;
  subView: 'points' | 'edges';
  onChangeSubView: (view: 'points' | 'edges') => void;
};

export const TableBottomSubViewBar: React.FC<Props> = ({
  panelChromeStyle,
  themeColor,
  subView,
  onChangeSubView
}) => {
  return (
    <div
      data-allow-context-menu
      className={`fixed bottom-20 ui-workspace-center-x ui-workspace-secondary-bottom-bar -translate-x-1/2 z-[45] max-w-[min(100vw-1rem,28rem)] p-1.5 rounded-2xl shadow-xl border flex flex-nowrap justify-center gap-1 pointer-events-auto ${
        panelChromeStyle ? 'border-gray-100/80' : 'border-white/50 map-chrome-surface-fallback'
      }`}
      style={panelChromeStyle}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        title="节点表（便签）"
        onClick={() => onChangeSubView('points')}
        className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-all font-bold text-sm ${
          subView === 'points' ? 'text-theme-chrome-fg shadow-md scale-105' : 'text-gray-500 hover:bg-gray-100'
        }`}
        style={subView === 'points' ? { backgroundColor: themeColor } : undefined}
      >
        <CircleDot size={18} />
        节点表
      </button>
      <button
        type="button"
        title="关联表（边）"
        onClick={() => onChangeSubView('edges')}
        className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-all font-bold text-sm ${
          subView === 'edges' ? 'text-theme-chrome-fg shadow-md scale-105' : 'text-gray-500 hover:bg-gray-100'
        }`}
        style={subView === 'edges' ? { backgroundColor: themeColor } : undefined}
      >
        <Link2 size={18} />
        关联表
      </button>
    </div>
  );
};

