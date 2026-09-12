import React from 'react';
import { DEFAULT_MAP_UI_CHROME_BLUR_PX, DEFAULT_MAP_UI_CHROME_OPACITY, mapChromeSurfaceStyle } from '../../utils/map/mapChromeStyle';
import { ChromeDialogSurface } from './ChromeDialogSurface';

export type DeleteConfirmVariant = 'note' | 'connection' | 'notes-batch';

export interface DeleteConfirmDialogProps {
  open: boolean;
  variant: DeleteConfirmVariant;
  /** 单条便签删除时的标题预览 */
  titleHint?: string;
  /** 批量删除便签数量 */
  batchCount?: number;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  confirming?: boolean;
  themeColor: string;
  panelChromeStyle?: React.CSSProperties;
}

/**
 * 表格 / 编辑器 / 看板共用的删除确认弹窗（无法撤回提示一致）
 */
export const DeleteConfirmDialog: React.FC<DeleteConfirmDialogProps> = ({
  open,
  variant,
  titleHint,
  batchCount,
  onConfirm,
  onCancel,
  confirming = false,
  themeColor,
  panelChromeStyle
}) => {
  if (!open) return null;

  const cardChrome =
    panelChromeStyle ??
    mapChromeSurfaceStyle(DEFAULT_MAP_UI_CHROME_OPACITY, DEFAULT_MAP_UI_CHROME_BLUR_PX);

  return (
    <div
      className="fixed inset-0 z-[var(--z-blocking-dialog)] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-confirm-dialog-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="关闭"
        onClick={() => !confirming && onCancel()}
      />
      <ChromeDialogSurface
        className="max-w-sm p-5 text-sm"
        style={cardChrome}
      >
        <h2 id="delete-confirm-dialog-title" className="font-bold text-gray-900 mb-2 text-base">
          确认删除
        </h2>
        <p className="text-gray-600 mb-4 leading-relaxed">
          {variant === 'connection' ? (
            <>
              确定要删除这条关联吗？
              <span className="text-red-600 font-semibold"> 此操作无法撤回</span>。
            </>
          ) : variant === 'notes-batch' ? (
            <>
              确定要删除已选中的 {batchCount ?? 0} 个便签吗？
              <span className="text-red-600 font-semibold"> 此操作无法撤回</span>
              ，相关连线也会被移除。
            </>
          ) : (
            <>
              确定要删除便签「{titleHint || '无标题'}」吗？
              <span className="text-red-600 font-semibold"> 此操作无法撤回</span>
              ，相关连线也会被移除。
            </>
          )}
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            disabled={confirming}
            onClick={onCancel}
            className="px-4 py-2 rounded-xl font-semibold text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            disabled={confirming}
            onClick={() => void onConfirm()}
            className="px-4 py-2 rounded-xl font-semibold text-theme-chrome-fg shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: themeColor }}
          >
            {confirming ? '处理中…' : '删除'}
          </button>
        </div>
      </ChromeDialogSurface>
    </div>
  );
};
