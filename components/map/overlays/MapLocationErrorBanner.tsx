import React from 'react';
import { Loader2, MapPin, X } from 'lucide-react';
import { THEME_COLOR } from '../../../constants';
import type { MapChromeAppearance } from '../../../utils/map/mapChromeStyle';
import { ChromeWindow } from '../../ui/ChromeWindow';
import { useChromeAppearance } from '../../ui/chromeAppearanceContext';

type Props = {
  locationError: string | null;
  isLocating: boolean;
  themeColor?: string;
  chromeSurfaceStyle?: React.CSSProperties;
  chromeAppearance?: MapChromeAppearance;
  onRetry: () => void;
  onClose: () => void;
};

export const MapLocationErrorBanner: React.FC<Props> = ({
  locationError,
  isLocating,
  themeColor = THEME_COLOR,
  chromeSurfaceStyle,
  chromeAppearance: chromeAppearanceProp,
  onRetry,
  onClose
}) => {
  const chromeAppearance = useChromeAppearance(chromeAppearanceProp);
  const open = !!locationError;
  const isPermission = !!locationError && /权限/.test(locationError);

  return (
    <ChromeWindow
      open={open}
      onClose={onClose}
      backdropLabel="关闭位置错误提示"
      placement="center"
      surface="window"
      appearance={chromeAppearance}
      compactBehavior="none"
      role="dialog"
      aria-modal="true"
      aria-label={isPermission ? '需要位置权限' : '暂时无法获取位置'}
      className="w-[min(100vw-2rem,22rem)] overflow-hidden"
      style={chromeSurfaceStyle}
    >
      <div className="flex items-start gap-3 px-4 pt-4 pb-2">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600">
          <MapPin size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-gray-900">
            {isPermission ? '需要位置权限' : '暂时无法获取位置'}
          </p>
          <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-gray-500">
            {locationError}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
          aria-label="关闭"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex items-center justify-end gap-2 px-4 pb-4 pt-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100"
        >
          关闭
        </button>
        <button
          type="button"
          onClick={onRetry}
          disabled={isLocating}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-theme-chrome-fg shadow-sm transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          style={{ backgroundColor: themeColor }}
        >
          {isLocating ? <Loader2 size={12} className="animate-spin" /> : null}
          {isPermission ? '再次启用' : '重试'}
        </button>
      </div>
    </ChromeWindow>
  );
};
