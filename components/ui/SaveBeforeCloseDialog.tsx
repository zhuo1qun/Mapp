import React from 'react';
import { createPortal } from 'react-dom';
import { ChromePresence } from './ChromeSheetPresence';
import { ChromeDialogSurface } from './ChromeDialogSurface';
import { DEFAULT_MAP_UI_CHROME_BLUR_PX, DEFAULT_MAP_UI_CHROME_OPACITY, mapChromeSurfaceStyle } from '../../utils/map/mapChromeStyle';

type Props = {
  open: boolean;
  saving?: boolean;
  themeColor: string;
  panelChromeStyle?: React.CSSProperties;
  onSave: () => void | Promise<void>;
  onDiscard: () => void;
  onCancel: () => void;
};

/** 点击编辑器外部时统一询问，明确区分保存、不保存和继续编辑。 */
export function SaveBeforeCloseDialog({ open, saving = false, themeColor, panelChromeStyle, onSave, onDiscard, onCancel }: Props) {
  const surface = panelChromeStyle ?? mapChromeSurfaceStyle(DEFAULT_MAP_UI_CHROME_OPACITY, DEFAULT_MAP_UI_CHROME_BLUR_PX);
  if (typeof document === 'undefined') return null;
  return createPortal(<ChromePresence open={open} kind="dialog">
    {(phase) => <div className={`fixed inset-0 z-[var(--z-blocking-dialog)] flex items-center justify-center p-4 chrome-dialog-backdrop-${phase}`} role="dialog" aria-modal="true" aria-labelledby="save-before-close-title">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="继续编辑" onClick={() => !saving && onCancel()} />
      <ChromeDialogSurface className={`max-w-sm p-5 text-sm chrome-dialog-${phase}`} style={surface}>
        <h2 id="save-before-close-title" className="mb-2 text-base font-bold text-gray-900">保存这次修改吗？</h2>
        <p className="mb-4 leading-relaxed text-gray-600">你点击了编辑器外部。可以保存后关闭，也可以不保存本次修改。</p>
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" disabled={saving} onClick={onCancel} className="rounded-xl px-4 py-2 font-semibold text-gray-500 hover:bg-gray-100 disabled:opacity-50">继续编辑</button>
          <button type="button" disabled={saving} onClick={onDiscard} className="rounded-xl px-4 py-2 font-semibold text-red-500 hover:bg-red-50 disabled:opacity-50">不保存</button>
          <button type="button" disabled={saving} onClick={() => void onSave()} className="rounded-xl px-4 py-2 font-semibold text-theme-chrome-fg shadow-sm disabled:opacity-50" style={{ backgroundColor: themeColor }}>{saving ? '保存中…' : '保存并关闭'}</button>
        </div>
      </ChromeDialogSurface>
    </div>}
  </ChromePresence>, document.body);
}
