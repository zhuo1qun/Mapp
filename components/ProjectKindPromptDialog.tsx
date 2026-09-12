import React from 'react';
import type { ProjectKind } from '../types';
import { MODAL_BACKDROP_MASK_STYLE } from '../utils/map/mapChromeStyle';
import { ChromeDialogSurface } from './ui/ChromeDialogSurface';

type Props = {
  projectName: string;
  themeColor: string;
  chromeSurfaceStyle?: React.CSSProperties;
  onConfirm: (kind: ProjectKind) => void;
  onCancel: () => void;
};

/**
 * 旧项目未分型时：打开/导入后询问归为 Mapping 或 Graph。
 */
export const ProjectKindPromptDialog: React.FC<Props> = ({
  projectName,
  themeColor,
  chromeSurfaceStyle,
  onConfirm,
  onCancel
}) => {
  return (
    <div
      className="fixed inset-0 z-[4000] flex items-center justify-center p-4"
      style={MODAL_BACKDROP_MASK_STYLE}
      onClick={onCancel}
      role="presentation"
    >
      <ChromeDialogSurface
        role="dialog"
        aria-labelledby="project-kind-prompt-title"
        className="max-w-md p-6 animate-in zoom-in-95"
        style={chromeSurfaceStyle ?? { backgroundColor: '#fff' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="project-kind-prompt-title" className="text-xl font-black text-gray-800 mb-2">
          选择项目类型
        </h2>
        <p className="text-sm text-gray-600 mb-1">
          「{projectName}」是旧版项目，尚未区分工作流类型。
        </p>
        <p className="text-sm text-gray-500 mb-6">
          Mapping：地图与看板；Graph：关系图谱与看板。选定后可在对应视图间切换。
        </p>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            className="w-full rounded-xl px-4 py-3 text-left font-bold text-theme-chrome-fg shadow-md transition-opacity hover:opacity-90"
            style={{ backgroundColor: themeColor }}
            onClick={() => onConfirm('mapping')}
          >
            <div className="text-sm">作为 Mapping 项目</div>
            <div className="mt-0.5 text-xs font-medium opacity-80">地图 · 看板 · 表格</div>
          </button>
          <button
            type="button"
            className="w-full rounded-xl border border-gray-200 bg-white/90 px-4 py-3 text-left font-bold text-gray-800 transition-colors hover:bg-gray-50"
            onClick={() => onConfirm('graph')}
          >
            <div className="text-sm">作为 Graph 项目</div>
            <div className="mt-0.5 text-xs font-medium text-gray-500">图谱 · 看板 · 表格</div>
          </button>
        </div>

        <button
          type="button"
          className="mt-4 w-full py-2.5 text-sm font-bold text-gray-500 hover:bg-gray-100 rounded-xl"
          onClick={onCancel}
        >
          取消
        </button>
      </ChromeDialogSurface>
    </div>
  );
};
