import React from 'react';
import { X } from 'lucide-react';
import {
  listExternalMapApps,
  openExternalMapApp,
  type ExternalMapAppId
} from '../../../utils/map/openExternalNavigation';
import type { MapChromeAppearance } from '../../../utils/map/mapChromeStyle';
import { useChromeAppearance } from '../../ui/chromeAppearanceContext';
import { ChromeWindow } from '../../ui/ChromeWindow';
import { ChromeActionButton } from '../../ui/ChromeActionButton';

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
  chromeAppearance: chromeAppearanceProp
}) => {
  const chromeAppearance = useChromeAppearance(chromeAppearanceProp);
  const apps = listExternalMapApps();

  const pick = (id: ExternalMapAppId) => {
    openExternalMapApp(id, lat, lng, { label });
    onClose();
  };

  return (
    <ChromeWindow
      open={open}
      onClose={onClose}
      backdropLabel="关闭地图应用选择"
      placement="center"
      surface="window"
      appearance={chromeAppearance}
      compactBehavior="sheet"
      role="dialog"
      aria-modal="true"
      aria-label="选择地图应用"
      className={`w-full sm:max-w-sm ${panelChromeStyle ? '' : 'bg-white'}`}
      style={panelChromeStyle}
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
          <ChromeActionButton
            tone="primary"
            themeColor={themeColor}
            onClick={onClose}
            className="w-full rounded-xl py-2.5 text-sm"
          >
            取消
          </ChromeActionButton>
        </div>
    </ChromeWindow>
  );
};
