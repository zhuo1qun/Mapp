import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import {
  listExternalMapApps,
  openExternalMapApp,
  type ExternalMapAppId
} from '../../../utils/map/openExternalNavigation';
import { MODAL_BACKDROP_MASK_STYLE, type MapChromeAppearance } from '../../../utils/map/mapChromeStyle';
import { ChromePresence } from '../../ui/ChromeSheetPresence';

type Props = {
  open: boolean;
  lat: number;
  lng: number;
  label?: string;
  onClose: () => void;
  themeColor?: string;
  /** 与触发它的详情卡/编辑器共用同一层玻璃材质。 */
  panelChromeStyle?: React.CSSProperties;
  chromeAppearance?: MapChromeAppearance;
};

/**
 * 选择用地图 App 打开导航（移动端接近系统「用何应用打开」；
 * Android 选「系统地图」即弹出系统选择器）。
 */
export const ExternalNavigationSheet: React.FC<Props> = ({
  open,
  lat,
  lng,
  label,
  onClose,
  themeColor = '#3b82f6',
  panelChromeStyle,
  chromeAppearance = 'light'
}) => {
  if (typeof document === 'undefined') return null;

  const apps = listExternalMapApps();

  const pick = (id: ExternalMapAppId) => {
    openExternalMapApp(id, lat, lng, { label });
    onClose();
  };

  return createPortal(
    <ChromePresence open={open} kind="sheet">
      {(phase) => (
        <div
          className={`fixed inset-0 z-[10050] flex items-end sm:items-center justify-center p-0 sm:p-4 chrome-dialog-backdrop-${phase}`}
          style={MODAL_BACKDROP_MASK_STYLE}
          role="dialog"
          aria-modal="true"
          aria-label="选择地图应用"
        >
      <button
        type="button"
        className="absolute inset-0 border-0 cursor-default"
        aria-label="关闭"
        onClick={onClose}
      />
      <div
        className={`map-chrome-content-${chromeAppearance} relative w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl shadow-2xl border border-gray-100/80 overflow-hidden chrome-responsive-sheet-${phase} ${
          panelChromeStyle ? '' : 'bg-white'
        }`}
        style={panelChromeStyle}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <div>
            <div className="text-base font-bold text-gray-900">导航到此点</div>
            <div className="text-[11px] text-gray-400 mt-0.5">将在新窗口打开网页导航</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 border-0"
            aria-label="关闭"
          >
            <X size={18} />
          </button>
        </div>
        <ul className="px-2 pb-2">
          {apps.map((app) => (
            <li key={app.id}>
              <button
                type="button"
                onClick={() => pick(app.id)}
                className={`w-full text-left px-3 py-3 rounded-xl border-0 flex flex-col gap-0.5 transition-colors ${
                  chromeAppearance === 'dark' ? 'hover:bg-white/10' : 'hover:bg-gray-50'
                }`}
              >
                <span className="text-sm font-semibold text-gray-800">{app.label}</span>
                {app.hint ? (
                  <span className="text-[11px] text-gray-400 leading-snug">{app.hint}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
        <div className="px-4 pb-4 pt-1 safe-area-pb">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 rounded-xl text-sm font-bold text-theme-chrome-fg border-0"
            style={{ backgroundColor: themeColor }}
          >
            取消
          </button>
        </div>
      </div>
        </div>
      )}
    </ChromePresence>,
    document.body
  );
};
