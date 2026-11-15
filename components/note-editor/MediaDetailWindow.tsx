import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, RotateCcw, X } from 'lucide-react';
import type { NormPoint } from '../../types';
import type { MapChromeAppearance } from '../../utils/map/mapChromeStyle';
import { useChromeAppearance } from '../ui/chromeAppearanceContext';
import { ChromePresence } from '../ui/ChromeSheetPresence';
import { CHROME_DIALOG_SURFACE_SHELL_CLASS } from '../ui/ChromeDialogSurface';
import { ChromeToggle } from '../ui/ChromeToggle';
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
  chromeAppearance: chromeAppearanceProp
}) => {
  const chromeAppearance = useChromeAppearance(chromeAppearanceProp);
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
  const [mediaAspect, setMediaAspect] = useState(1);
  const [viewport, setViewport] = useState(() => ({
    width: typeof window === 'undefined' ? 1024 : window.innerWidth,
    height: typeof window === 'undefined' ? 768 : window.innerHeight
  }));

  useEffect(() => {
    setMediaAspect(1);
  }, [previewImage]);

  useEffect(() => {
    const updateViewport = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  const mediaDetailSize = useMemo(() => {
    if (isLassoMode) return undefined;
    const headerAndFooterHeight = images.length > 1 ? 88 : 56;
    const maxHeight = Math.max(260, Math.min(672, viewport.height - 128));
    const maxWidth = Math.max(240, Math.min(576, viewport.width - 32));
    const imageMaxHeight = Math.max(180, maxHeight - headerAndFooterHeight);
    const width = Math.min(maxWidth, Math.max(240, Math.round(imageMaxHeight * mediaAspect)));
    const height = Math.min(maxHeight, Math.max(260, Math.round(width / mediaAspect) + headerAndFooterHeight));
    return { width, height };
  }, [images.length, isLassoMode, mediaAspect, viewport.height, viewport.width]);

  return (
    <ChromePresence open={open} kind="dialog">
      {(phase) => {
        const surface = (
          <section
            data-table-canvas-window={isCanvasWindow ? 'media-detail' : undefined}
            data-workspace-link-target={isCanvasWindow ? 'media-detail' : undefined}
            role="dialog"
            aria-modal={isCanvasWindow ? undefined : true}
            aria-label={isLassoMode ? '套索裁剪' : '媒体详情'}
            className={`note-editor-media-detail ${isCanvasWindow ? 'note-editor-aux-panel' : ''} map-chrome-content-${chromeAppearance} ${CHROME_DIALOG_SURFACE_SHELL_CLASS} flex min-h-0 flex-col overflow-hidden ${
              isCanvasWindow
                ? `chrome-dialog-${phase} shrink-0 ${isLassoMode ? 'h-[min(42rem,calc(100dvh-8rem))] w-[min(36rem,calc(100vw-2rem))]' : 'transition-[width,height] duration-200 ease-out'}`
                : `media-detail-window-surface--modal relative z-10 chrome-responsive-sheet-${phase} ${isLassoMode ? 'h-[min(42rem,calc(100dvh-8rem))] w-[min(36rem,calc(100vw-2rem))]' : 'transition-[width,height] duration-200 ease-out'}`
            }`}
            style={{ ...panelChromeStyle, ...mediaDetailSize }}
            onPointerDown={(event) => event.stopPropagation()}
            onPointerMove={(event) => event.stopPropagation()}
            onPointerUp={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onWheel={(event) => event.stopPropagation()}
          >
            <header
              data-workspace-link-anchor={isCanvasWindow ? 'media-detail-title' : undefined}
              className="flex min-h-10 shrink-0 items-center gap-2 px-4 pb-1 pt-2"
            >
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
                <h3 className="truncate text-[11px] font-medium uppercase tracking-wide text-gray-400">
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
                  <ChromeToggle
                    checked={cropEnabled}
                    onCheckedChange={(next) => onCropEnabledChange?.(next)}
                    themeColor={themeColor}
                    label="套索裁剪"
                    disabled={cropBusy}
                  />
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
                <div className="relative flex min-h-[18rem] flex-1 items-center justify-center overflow-hidden p-4">
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
                      onLoad={(event) => {
                        const { naturalWidth, naturalHeight } = event.currentTarget;
                        if (naturalWidth > 0 && naturalHeight > 0) {
                          setMediaAspect(naturalWidth / naturalHeight);
                        }
                      }}
                      className="max-h-full max-w-full object-contain drop-shadow-[0_12px_28px_rgba(0,0,0,0.24)]"
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
                  <footer className="mx-3 mb-2 shrink-0 px-4 py-1 text-center text-[11px] text-gray-400">
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
            className="note-editor-transient-layer fixed top-0 ui-workspace-overlay flex h-[100dvh] items-center justify-center bg-transparent p-0 sm:p-4"
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
