import React, { useRef } from 'react';
import { ArrowLeft, ArrowRight, RotateCcw, X } from 'lucide-react';
import type { NormPoint } from '../../types';
import type { MapChromeAppearance } from '../../utils/map/mapChromeStyle';
import { ChromePresence } from '../ui/ChromeSheetPresence';
import { CHROME_DIALOG_SURFACE_SHELL_CLASS } from '../ui/ChromeDialogSurface';
import { LassoStickerEditor } from './LassoStickerEditor';

interface MediaDetailWindowProps {
  images: string[];
  previewIndex: number;
  open: boolean;
  onClose: () => void;
  onChangeIndex: (index: number) => void;
  themeColor?: string;
  cropEnabled?: boolean;
  onCropEnabledChange?: (enabled: boolean) => void;
  onStartLasso?: () => void;
  cropBusy?: boolean;
  lassoImageSrc?: string | null;
  onBackFromLasso?: () => void;
  onConfirmLasso?: (points: NormPoint[]) => void | Promise<void>;
  presentation?: 'modal' | 'canvas-window';
  panelChromeStyle?: React.CSSProperties;
  chromeAppearance?: MapChromeAppearance;
}

/** 图片预览与套索共用的响应式窗口：窄屏全屏、常规宽屏居中、Table 宽屏并列。 */
export const MediaDetailWindow: React.FC<MediaDetailWindowProps> = ({
  images,
  previewIndex,
  open,
  onClose,
  onChangeIndex,
  themeColor = '#111827',
  cropEnabled = false,
  onCropEnabledChange,
  onStartLasso,
  cropBusy = false,
  lassoImageSrc,
  onBackFromLasso,
  onConfirmLasso,
  presentation = 'modal',
  panelChromeStyle,
  chromeAppearance = 'light'
}) => {
  const isCanvasWindow = presentation === 'canvas-window';
  const retainedLassoSourceRef = useRef<string | null>(null);
  if (open) retainedLassoSourceRef.current = lassoImageSrc ?? null;
  const displayedLassoSource = open ? lassoImageSrc : retainedLassoSourceRef.current;
  const isLassoMode = !!displayedLassoSource;
  const previewImage = images[previewIndex];
  const canShowImage =
    !!previewImage &&
    (previewImage.startsWith('data:image/') ||
      previewImage.startsWith('blob:') ||
      previewImage.startsWith('http://') ||
      previewImage.startsWith('https://'));
  const showCropControls = typeof onCropEnabledChange === 'function';

  return (
    <ChromePresence open={open} kind="dialog">
      {(phase) => {
        const surface = (
          <section
            data-table-canvas-window={isCanvasWindow ? 'media-detail' : undefined}
            role="dialog"
            aria-modal={isCanvasWindow ? undefined : true}
            aria-label={isLassoMode ? '套索裁剪' : '媒体详情'}
            className={`note-editor-media-detail map-chrome-content-${chromeAppearance} ${CHROME_DIALOG_SURFACE_SHELL_CLASS} flex h-[min(42rem,calc(100dvh-8rem))] min-h-0 w-[min(36rem,calc(100vw-2rem))] flex-col overflow-hidden ${
              isCanvasWindow
                ? `chrome-dialog-${phase} shrink-0`
                : `media-detail-window-surface--modal relative z-10 chrome-responsive-sheet-${phase}`
            }`}
            style={panelChromeStyle}
            onPointerDown={(event) => event.stopPropagation()}
            onPointerMove={(event) => event.stopPropagation()}
            onPointerUp={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onWheel={(event) => event.stopPropagation()}
          >
            <header className="flex min-h-14 shrink-0 items-center gap-2 border-b border-gray-100/80 px-3 py-2.5 sm:min-h-12 sm:px-4">
              {isLassoMode ? (
                <button
                  type="button"
                  aria-label="返回媒体详情"
                  title="返回媒体详情"
                  disabled={cropBusy}
                  onClick={onBackFromLasso}
                  className="chrome-menu-item inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent text-gray-500 disabled:opacity-40"
                >
                  <ArrowLeft size={18} />
                </button>
              ) : null}

              <div className="min-w-0 flex-1">
                <h3 className="truncate text-sm font-semibold text-gray-800">
                  {isLassoMode ? '套索裁剪' : '媒体详情'}
                </h3>
                {isLassoMode ? (
                  <p className="mt-0.5 truncate text-[11px] text-gray-500">
                    沿主体拖出一圈，松手后点完成
                  </p>
                ) : null}
              </div>

              {!isLassoMode && showCropControls ? (
                <div className="flex shrink-0 items-center gap-2">
                  <span className="hidden text-xs font-medium text-gray-500 min-[380px]:inline">
                    套索裁剪
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={cropEnabled}
                    aria-label="套索裁剪"
                    disabled={cropBusy}
                    onClick={() => onCropEnabledChange?.(!cropEnabled)}
                    className={`relative h-5 w-9 shrink-0 cursor-pointer rounded-full border-0 transition-colors disabled:opacity-40 ${
                      cropEnabled ? '' : 'bg-gray-300/70'
                    }`}
                    style={cropEnabled ? { backgroundColor: themeColor } : undefined}
                  >
                    <span
                      className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                        cropEnabled ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                  {cropEnabled && onStartLasso ? (
                    <button
                      type="button"
                      disabled={cropBusy}
                      onClick={onStartLasso}
                      className="chrome-menu-item inline-flex h-8 cursor-pointer items-center gap-1 rounded-lg border-0 bg-transparent px-2 text-[11px] text-gray-600 disabled:opacity-40"
                    >
                      <RotateCcw size={12} />
                      重画
                    </button>
                  ) : null}
                </div>
              ) : null}

              <button
                type="button"
                aria-label="关闭媒体详情"
                title="关闭媒体详情"
                onClick={onClose}
                className="chrome-menu-item inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent text-gray-500"
              >
                <X size={18} />
              </button>
            </header>

            {isLassoMode && displayedLassoSource && onConfirmLasso ? (
              <LassoStickerEditor
                imageSrc={displayedLassoSource}
                themeColor={themeColor}
                onConfirm={onConfirmLasso}
              />
            ) : (
              <>
                <div className="chrome-inset relative flex min-h-[18rem] flex-1 items-center justify-center overflow-hidden p-4">
                  {images.length > 1 && previewIndex > 0 ? (
                    <button
                      type="button"
                      aria-label="上一张"
                      onClick={() => onChangeIndex(previewIndex - 1)}
                      className="chrome-menu-item absolute left-3 z-10 inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-gray-600"
                    >
                      <ArrowLeft size={22} />
                    </button>
                  ) : null}
                  {canShowImage ? (
                    <img
                      src={previewImage}
                      alt="媒体预览"
                      className="max-h-[calc(100dvh-10rem)] max-w-full object-contain drop-shadow-[0_12px_28px_rgba(0,0,0,0.24)] sm:max-h-[calc(90dvh-8rem)]"
                    />
                  ) : (
                    <div className="px-8 py-12 text-sm text-gray-500">图片加载中…</div>
                  )}
                  {images.length > 1 && previewIndex < images.length - 1 ? (
                    <button
                      type="button"
                      aria-label="下一张"
                      onClick={() => onChangeIndex(previewIndex + 1)}
                      className="chrome-menu-item absolute right-3 z-10 inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-gray-600"
                    >
                      <ArrowRight size={22} />
                    </button>
                  ) : null}
                </div>
                {images.length > 1 ? (
                  <footer className="shrink-0 border-t border-gray-100/80 px-4 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-center text-xs text-gray-500 sm:pb-2">
                    {previewIndex + 1} / {images.length}
                  </footer>
                ) : null}
              </>
            )}
          </section>
        );

        if (isCanvasWindow) return surface;
        return (
          <div
            className="fixed top-0 ui-workspace-overlay z-[1000] flex h-[100dvh] items-center justify-center bg-transparent p-0 sm:p-4"
          >
            <button
              type="button"
              aria-label="关闭媒体详情"
              className="absolute inset-0 cursor-default border-0 bg-transparent"
              onClick={onClose}
            />
            {surface}
          </div>
        );
      }}
    </ChromePresence>
  );
};
