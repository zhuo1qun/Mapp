import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Upload } from 'lucide-react';
import type { MapChromeAppearance } from '../../utils/map/mapChromeStyle';
import {
  DEFAULT_MAP_UI_CHROME_BLUR_PX,
  DEFAULT_MAP_UI_CHROME_OPACITY,
  mapChromeContentStyle,
  mapChromeModalBackdropStyle
} from '../../utils/map/mapChromeStyle';
import { getThemeChromeForegroundHex } from '../../utils/theme/themeChrome';
import { isFileDragLeavingViewport } from '../../utils/ui/fileDrag';
import { ChromePresence } from './ChromeSheetPresence';
import { useChromeAppearance } from './chromeAppearanceContext';

type ChromeDropOverlayProps = {
  open: boolean;
  title: string;
  description?: string;
  themeColor: string;
  appearance?: MapChromeAppearance;
  chromeOpacity?: number;
  chromeBlurPx?: number;
  /** 点空白 / Esc / 拖出窗口未放下时关闭。 */
  onDismiss?: () => void;
};

/**
 * 文件拖入期间的统一提示层。保持 pointer-events:none，避免 portal 层截获
 * dragover / drop；实际导入仍由各工作区既有的 drop handler 处理。
 * 拖出窗口、松开拖拽、Esc，以及卡住后点空白，走 onDismiss。
 */
export function ChromeDropOverlay({
  open,
  title,
  description,
  themeColor,
  appearance: appearanceProp,
  chromeOpacity = DEFAULT_MAP_UI_CHROME_OPACITY,
  chromeBlurPx = DEFAULT_MAP_UI_CHROME_BLUR_PX,
  onDismiss
}: ChromeDropOverlayProps) {
  const appearance = useChromeAppearance(appearanceProp);

  useEffect(() => {
    if (!open || !onDismiss) return;

    const dismissIfLeftWindow = (event: DragEvent) => {
      if (isFileDragLeavingViewport(event.clientX, event.clientY)) onDismiss();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss();
    };
    // OS 文件拖拽进行中通常不会产生 pointerdown；卡住后点一下即可关掉。
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      onDismiss();
      event.preventDefault();
      event.stopPropagation();
    };

    document.addEventListener('dragleave', dismissIfLeftWindow);
    window.addEventListener('dragend', onDismiss);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      document.removeEventListener('dragleave', dismissIfLeftWindow);
      window.removeEventListener('dragend', onDismiss);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [onDismiss, open]);

  if (typeof document === 'undefined') return null;

  const surfaceStyle = mapChromeContentStyle(chromeOpacity, chromeBlurPx, appearance);
  const backdropStyle = mapChromeModalBackdropStyle(chromeOpacity, chromeBlurPx);
  const iconColor = getThemeChromeForegroundHex(themeColor);

  return createPortal(
    <ChromePresence open={open} kind="dialog">
      {(phase) => (
        <div
          className={`chrome-drop-overlay chrome-drop-overlay-${phase}`}
          style={backdropStyle}
          role="status"
          aria-live="polite"
        >
          <div
            className={`map-chrome-content-${appearance} chrome-drop-overlay-card rounded-2xl border shadow-xl`}
            style={surfaceStyle}
          >
            <div
              className="chrome-drop-overlay-icon"
              style={{ backgroundColor: themeColor, color: iconColor }}
              aria-hidden
            >
              <Upload size={26} strokeWidth={2.25} />
            </div>
            <div className="min-w-0 text-center">
              <p className="text-base font-semibold text-gray-900 sm:text-lg">{title}</p>
              {description ? <p className="mt-1 text-sm text-gray-500">{description}</p> : null}
            </div>
          </div>
        </div>
      )}
    </ChromePresence>,
    document.body
  );
}
