import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, ClipboardPaste, ExternalLink, LassoSelect, Loader2, Upload, Wand2, X } from 'lucide-react';
import type { NormPoint } from '../../types';
import type { MapChromeAppearance } from '../../utils/map/mapChromeStyle';
import { useChromeAppearance } from '../ui/chromeAppearanceContext';
import { ChromePresence } from '../ui/ChromeSheetPresence';
import { CHROME_DIALOG_SURFACE_SHELL_CLASS } from '../ui/ChromeDialogSurface';
import { ChromeToggle } from '../ui/ChromeToggle';
import { LassoStickerEditor } from './LassoStickerEditor';

/** 已显示过缩略图的媒体通常会命中这里，详情窗可在首帧就采用正确比例。 */
const mediaAspectCache = new Map<string, number>();

interface MediaDetailWindowProps {
  images: string[];
  previewIndex: number;
  open: boolean;
  onClose: () => void;
  onChangeIndex: (index: number) => void;
  themeColor?: string;
  hasMask?: boolean;
  maskEnabled?: boolean;
  onMaskEnabledChange?: (enabled: boolean) => void;
  onStartLasso?: () => void;
  cropBusy?: boolean;
  lassoImageSrc?: string | null;
  onBackFromLasso?: () => void;
  onConfirmLasso?: (points: NormPoint[]) => void | Promise<void>;
  onAutoRemoveBackground?: () => void | Promise<void>;
  autoRemoveBusy?: boolean;
  autoRemoveStatus?: string | null;
  remoteAccessUrl?: string | null;
  remoteAccessBusy?: boolean;
  remoteAccessError?: string | null;
  onRecoverRemoteFromClipboard?: () => void | Promise<void>;
  onRecoverRemoteFromFile?: (file: File) => void | Promise<void>;
  onDismissRemoteAccess?: () => void;
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
  hasMask = false,
  maskEnabled = false,
  onMaskEnabledChange,
  onStartLasso,
  cropBusy = false,
  lassoImageSrc,
  onBackFromLasso,
  onConfirmLasso,
  onAutoRemoveBackground,
  autoRemoveBusy = false,
  autoRemoveStatus,
  remoteAccessUrl,
  remoteAccessBusy = false,
  remoteAccessError,
  onRecoverRemoteFromClipboard,
  onRecoverRemoteFromFile,
  onDismissRemoteAccess,
  presentation = 'modal',
  panelChromeStyle,
  chromeAppearance: chromeAppearanceProp
}) => {
  const chromeAppearance = useChromeAppearance(chromeAppearanceProp);
  const isCanvasWindow = presentation === 'canvas-window';
  const localFileInputRef = useRef<HTMLInputElement>(null);
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
  const showMaskControls = typeof onMaskEnabledChange === 'function';
  const [mediaAspect, setMediaAspect] = useState(() =>
    previewImage ? mediaAspectCache.get(previewImage) ?? 1 : 1
  );
  const [isMediaAspectReady, setIsMediaAspectReady] = useState(() =>
    !canShowImage || !!(previewImage && mediaAspectCache.has(previewImage))
  );
  const [viewport, setViewport] = useState(() => ({
    width: typeof window === 'undefined' ? 1024 : window.innerWidth,
    height: typeof window === 'undefined' ? 768 : window.innerHeight
  }));

  useLayoutEffect(() => {
    if (!canShowImage || !previewImage) {
      setMediaAspect(1);
      setIsMediaAspectReady(true);
      return;
    }

    const cached = mediaAspectCache.get(previewImage);
    if (cached) {
      setMediaAspect(cached);
      setIsMediaAspectReady(true);
      return;
    }

    let active = true;
    setIsMediaAspectReady(false);
    const image = new Image();
    const complete = () => {
      if (!active) return;
      const { naturalWidth, naturalHeight } = image;
      if (naturalWidth > 0 && naturalHeight > 0) {
        const aspect = naturalWidth / naturalHeight;
        mediaAspectCache.set(previewImage, aspect);
        setMediaAspect(aspect);
      } else {
        setMediaAspect(1);
      }
      setIsMediaAspectReady(true);
    };
    image.onload = complete;
    image.onerror = complete;
    image.src = previewImage;
    if (image.complete) complete();
    return () => {
      active = false;
    };
  }, [canShowImage, previewImage]);

  useEffect(() => {
    const updateViewport = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  const mediaDetailSize = useMemo(() => {
    if (isLassoMode) return undefined;
    const headerAndFooterHeight = images.length > 1 ? 132 : 100;
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
            className={`note-editor-media-detail ${isCanvasWindow ? 'note-editor-aux-panel relative z-20' : ''} map-chrome-content-${chromeAppearance} ${CHROME_DIALOG_SURFACE_SHELL_CLASS} flex min-h-0 flex-col overflow-hidden ${
              isCanvasWindow
                ? `chrome-dialog-${phase} shrink-0 ${isLassoMode ? 'h-[min(42rem,calc(100dvh-8rem))] w-[min(36rem,calc(100vw-2rem))]' : 'transition-[width,height] duration-200 ease-out'}`
                : `media-detail-window-surface--modal relative z-10 chrome-responsive-sheet-${phase} ${isLassoMode ? 'h-[min(42rem,calc(100dvh-8rem))] w-[min(36rem,calc(100vw-2rem))]' : 'transition-[width,height] duration-200 ease-out'}`
            }`}
            style={{
              ...panelChromeStyle,
              ...mediaDetailSize,
              // 等到首次解出媒体比例再露出详情窗，避免先出现空的大方框、随后才跳变。
              visibility: !isLassoMode && canShowImage && !isMediaAspectReady ? 'hidden' : undefined
            }}
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
                ) : (
                  <p className="mt-0.5 truncate text-[11px] text-gray-500">
                    {autoRemoveStatus || (hasMask
                      ? maskEnabled
                        ? '蒙版已应用，最终呈现处理后的图片'
                        : '当前呈现原图，蒙版仍保留'
                      : '选择一种方式创建蒙版')}
                  </p>
                )}
              </div>

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

            {!isLassoMode && showMaskControls ? (
              <div className="flex shrink-0 flex-wrap items-center gap-1.5 px-3 pb-2">
                {onAutoRemoveBackground ? (
                  <button
                    type="button"
                    disabled={cropBusy || autoRemoveBusy}
                    onClick={() => void onAutoRemoveBackground()}
                    className="chrome-menu-item inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border-0 bg-transparent px-2 text-[11px] font-medium text-gray-600 disabled:cursor-wait disabled:opacity-50"
                    title={hasMask ? '用自动抠图重新制作并替换当前蒙版' : '在本机自动识别主体并创建蒙版'}
                  >
                    {autoRemoveBusy ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
                    {autoRemoveBusy ? '处理中' : '一键抠图'}
                  </button>
                ) : null}
                {onStartLasso ? (
                  <button
                    type="button"
                    disabled={cropBusy || autoRemoveBusy}
                    onClick={onStartLasso}
                    className="chrome-menu-item inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border-0 bg-transparent px-2 text-[11px] font-medium text-gray-600 disabled:opacity-40"
                    title={hasMask ? '用套索重新制作并替换当前蒙版' : '用套索圈选主体并创建蒙版'}
                  >
                    <LassoSelect size={13} />
                    套索裁剪
                  </button>
                ) : null}
                <div className="ml-auto flex h-8 items-center gap-2 pl-1">
                  <span className={`text-[11px] font-medium ${hasMask ? 'text-gray-500' : 'text-gray-300'}`}>
                    应用蒙版
                  </span>
                  <ChromeToggle
                    checked={hasMask && maskEnabled}
                    onCheckedChange={(next) => onMaskEnabledChange?.(next)}
                    themeColor={themeColor}
                    label="应用蒙版"
                    disabled={!hasMask || cropBusy || autoRemoveBusy}
                  />
                </div>
              </div>
            ) : null}

            {remoteAccessUrl ? (
              <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/20 p-4 backdrop-blur-[2px]">
                <div className="map-chrome-content-light w-full max-w-[22rem] rounded-2xl border border-white/70 bg-white/95 p-4 shadow-2xl">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <h4 className="text-sm font-semibold text-gray-800">需要可读取的图片副本</h4>
                      <p className="mt-1 text-xs leading-5 text-gray-500">
                        图片站点允许显示，但禁止网页读取像素。已尝试自动转存；你可以在原图页面复制图片，再直接从剪贴板继续，无需先下载文件。
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label="关闭图片引导"
                      onClick={onDismissRemoteAccess}
                      disabled={remoteAccessBusy}
                      className="chrome-menu-item inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-0 bg-transparent text-gray-500 disabled:opacity-40"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  {remoteAccessError ? (
                    <p className="mt-2 rounded-lg bg-red-50 px-2.5 py-2 text-[11px] leading-4 text-red-600">
                      {remoteAccessError}
                    </p>
                  ) : null}

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={remoteAccessBusy}
                      onClick={() => void onRecoverRemoteFromClipboard?.()}
                      className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl border-0 px-3 text-xs font-semibold text-theme-chrome-fg disabled:cursor-wait disabled:opacity-50"
                      style={{ backgroundColor: themeColor }}
                    >
                      {remoteAccessBusy ? <Loader2 size={14} className="animate-spin" /> : <ClipboardPaste size={14} />}
                      读取剪贴板
                    </button>
                    <button
                      type="button"
                      disabled={remoteAccessBusy}
                      onClick={() => localFileInputRef.current?.click()}
                      className="chrome-menu-item inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl border-0 bg-transparent px-3 text-xs font-medium text-gray-600 disabled:opacity-50"
                    >
                      <Upload size={14} />
                      选择本地图片
                    </button>
                    <a
                      href={remoteAccessUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="chrome-menu-item inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-medium text-gray-600 no-underline"
                    >
                      <ExternalLink size={14} />
                      打开原图
                    </a>
                  </div>
                  <input
                    ref={localFileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = '';
                      if (file) void onRecoverRemoteFromFile?.(file);
                    }}
                  />
                </div>
              </div>
            ) : null}

            {isLassoMode && displayedLassoSource && onConfirmLasso ? (
              <LassoStickerEditor
                imageSrc={displayedLassoSource}
                themeColor={themeColor}
                onConfirm={onConfirmLasso}
              />
            ) : (
              <>
                <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4">
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
                          const aspect = naturalWidth / naturalHeight;
                          mediaAspectCache.set(previewImage, aspect);
                          setMediaAspect(aspect);
                        }
                        setIsMediaAspectReady(true);
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
        const layer = (
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
        // 详情窗不可继承编辑器面板的 overflow/transform 上下文，否则超出卡片的部分会被裁掉。
        return typeof document === 'undefined' ? layer : createPortal(layer, document.body);
      }}
    </ChromePresence>
  );
};
