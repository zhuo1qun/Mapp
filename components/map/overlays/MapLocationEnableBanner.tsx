import React from 'react';
import { Loader2, MapPin, ShieldAlert, X } from 'lucide-react';
import { THEME_COLOR } from '../../../constants';
import type { MapChromeAppearance } from '../../../utils/map/mapChromeStyle';
import { ChromeWindow } from '../../ui/ChromeWindow';
import { useChromeAppearance } from '../../ui/chromeAppearanceContext';

type Props = {
  /** 尚未授权且未拒绝时展示，引导用户用一次真实 click 唤起系统权限 */
  visible: boolean;
  isRequesting: boolean;
  /** 局域网 HTTP 等非安全上下文：浏览器会静默拒绝定位 */
  insecureContext?: boolean;
  themeColor?: string;
  chromeSurfaceStyle?: React.CSSProperties;
  chromeAppearance?: MapChromeAppearance;
  onEnable: () => void;
  onDismiss: () => void;
};

/**
 * 冷启动「启用位置」门闸：ChromeWindow 对话框，须由用户点击唤起系统权限。
 */
export const MapLocationEnableBanner: React.FC<Props> = ({
  visible,
  isRequesting,
  insecureContext = false,
  themeColor = THEME_COLOR,
  chromeSurfaceStyle,
  chromeAppearance: chromeAppearanceProp,
  onEnable,
  onDismiss
}) => {
  const chromeAppearance = useChromeAppearance(chromeAppearanceProp);
  const host = typeof window !== 'undefined' ? window.location.host : '';

  return (
    <ChromeWindow
      open={visible}
      onClose={onDismiss}
      backdropLabel={insecureContext ? '关闭位置提示' : '关闭启用位置'}
      placement="center"
      surface="window"
      appearance={chromeAppearance}
      compactBehavior="none"
      role="dialog"
      aria-modal="true"
      aria-label={insecureContext ? '无法申请位置权限' : '启用位置服务'}
      className="w-[min(100vw-2rem,22rem)] overflow-hidden"
      style={chromeSurfaceStyle}
    >
      <div className="flex items-start gap-3 px-4 pt-4 pb-2">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600">
          {insecureContext ? <ShieldAlert size={18} /> : <MapPin size={18} />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-gray-900">
            {insecureContext ? '无法申请位置权限' : '启用位置服务'}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-gray-500">
            {insecureContext ? (
              <>
                当前是 HTTP 局域网地址（{host || '非 localhost'}）。手机浏览器会静默拒绝定位，不会弹出权限框。请改用{' '}
                <span className="font-semibold text-gray-700">https://{host || '电脑IP:3000'}</span>{' '}
                打开，首次需在系统里信任证书。
              </>
            ) : (
              '点击下方按钮，允许浏览器访问位置后，即可定位与在当前位置添加。'
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
          aria-label="关闭"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex items-center justify-end gap-2 px-4 pb-4 pt-2">
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100"
        >
          {insecureContext ? '知道了' : '稍后'}
        </button>
        {!insecureContext ? (
          <button
            type="button"
            onClick={onEnable}
            disabled={isRequesting}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-theme-chrome-fg shadow-sm transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            style={{ backgroundColor: themeColor }}
          >
            {isRequesting ? <Loader2 size={12} className="animate-spin" /> : null}
            {isRequesting ? '请求中…' : '启用位置'}
          </button>
        ) : null}
      </div>
    </ChromeWindow>
  );
};
