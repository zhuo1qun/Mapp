import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Loader2, SwitchCamera, X } from 'lucide-react';
import { THEME_COLOR, THEME_COLOR_DARK } from '../../../constants';
import type { MapChromeAppearance } from '../../../utils/map/mapChromeStyle';
import { ChromeFloatingToolbar } from '../../ui/ChromeFloatingToolbar';
import { ChromeWindow } from '../../ui/ChromeWindow';
import { CHROME_DIALOG_SURFACE_SHELL_CLASS } from '../../ui/ChromeDialogSurface';

type Props = {
  open: boolean;
  onClose: () => void;
  onCapture: (image: Blob) => Promise<void> | void;
  /** window：独立对话框；overlay：盖在 NoteEditor 上（对标 DrawingCanvas） */
  variant?: 'window' | 'overlay';
  themeColor?: string;
  chromeSurfaceStyle?: React.CSSProperties;
  chromeAppearance?: MapChromeAppearance;
};

/** Each opening owns a camera stream; each shutter owns one captured Blob. */
export function CameraCaptureDialog({
  open,
  onClose,
  onCapture,
  variant = 'window',
  themeColor = THEME_COLOR,
  chromeSurfaceStyle,
  chromeAppearance
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);
  const setVideoRef = useCallback((node: HTMLVideoElement | null) => {
    videoRef.current = node;
    setVideoElement(node);
  }, []);
  const captureBusyRef = useRef(false);
  const capturedPhotoRef = useRef<Blob | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [isReady, setIsReady] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [shutterHover, setShutterHover] = useState(false);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    setIsCapturing(false);
    captureBusyRef.current = false;
    capturedPhotoRef.current = null;
    setErrorMessage(null);
    setFacingMode('environment');
  }, [open]);

  useEffect(() => {
    if (!open || !videoElement) return;
    let disposed = false;
    setIsReady(false);
    setErrorMessage(null);
    const startCamera = async () => {
      try {
        stopCamera();
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facingMode } },
          audio: false
        });
        if (disposed) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoElement;
        video.srcObject = stream;
        await video.play();
        if (!disposed) setIsReady(true);
      } catch (error) {
        if (!disposed) setErrorMessage(error instanceof Error ? error.message : '无法打开摄像头');
      }
    };
    void startCamera();
    return () => {
      disposed = true;
      stopCamera();
    };
  }, [open, stopCamera, videoElement, facingMode]);

  const handleClose = useCallback(() => {
    stopCamera();
    onClose();
  }, [onClose, stopCamera]);

  const handleFlipCamera = useCallback(() => {
    if (isCapturing) return;
    setIsReady(false);
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  }, [isCapturing]);

  const handleCapture = useCallback(async () => {
    const video = videoRef.current;
    if (captureBusyRef.current) return;
    if (!capturedPhotoRef.current && (!video || !video.videoWidth || !video.videoHeight)) return;
    captureBusyRef.current = true;
    setIsCapturing(true);
    setErrorMessage(null);
    try {
      if (!capturedPhotoRef.current && video) {
        const viewportWidth = video.clientWidth || video.videoWidth;
        const viewportHeight = video.clientHeight || video.videoHeight;
        const viewportRatio = viewportWidth / viewportHeight;
        const sourceRatio = video.videoWidth / video.videoHeight;
        let sourceX = 0;
        let sourceY = 0;
        let sourceWidth = video.videoWidth;
        let sourceHeight = video.videoHeight;
        if (sourceRatio > viewportRatio) {
          sourceWidth = video.videoHeight * viewportRatio;
          sourceX = (video.videoWidth - sourceWidth) / 2;
        } else if (sourceRatio < viewportRatio) {
          sourceHeight = video.videoWidth / viewportRatio;
          sourceY = (video.videoHeight - sourceHeight) / 2;
        }

        const maxEdge = 1920;
        const scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(sourceWidth * scale));
        canvas.height = Math.max(1, Math.round(sourceHeight * scale));
        const context = canvas.getContext('2d');
        if (!context) throw new Error('无法处理拍摄的照片');
        context.drawImage(
          video,
          sourceX,
          sourceY,
          sourceWidth,
          sourceHeight,
          0,
          0,
          canvas.width,
          canvas.height
        );
        const image = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('无法生成照片'))), 'image/jpeg', 0.84);
        });
        capturedPhotoRef.current = image;
      }
      await onCapture(capturedPhotoRef.current!);
      capturedPhotoRef.current = null;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '拍摄失败，请重试');
    } finally {
      captureBusyRef.current = false;
      setIsCapturing(false);
    }
  }, [onCapture]);

  const shutterBg = shutterHover
    ? themeColor === THEME_COLOR
      ? THEME_COLOR_DARK
      : themeColor
    : themeColor;

  const floatingToolbar = (
    <ChromeFloatingToolbar appearance={chromeAppearance} style={chromeSurfaceStyle}>
      <button
        type="button"
        onClick={() => handleClose()}
        className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
        aria-label="取消拍照"
      >
        <X size={20} />
      </button>

      <div className="h-6 w-px bg-gray-200/80" />

      <button
        type="button"
        onClick={() => handleFlipCamera()}
        disabled={!isReady || isCapturing || !!errorMessage}
        className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
        aria-label="切换摄像头"
        title="切换摄像头"
      >
        <SwitchCamera size={20} />
      </button>

      <div className="h-6 w-px bg-gray-200/80" />

      <button
        type="button"
        onClick={() => void handleCapture()}
        disabled={!isReady || isCapturing || (!!errorMessage && !capturedPhotoRef.current)}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-theme-chrome-fg shadow-sm transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-45"
        style={{ backgroundColor: shutterBg }}
        onMouseEnter={() => setShutterHover(true)}
        onMouseLeave={() => setShutterHover(false)}
        aria-label="拍照"
      >
        {isCapturing ? <Loader2 className="animate-spin" size={18} /> : <Camera size={18} />}
      </button>
    </ChromeFloatingToolbar>
  );

  const body = (
    <div
      className={
        variant === 'overlay'
          ? 'relative flex h-full min-h-0 flex-col bg-black'
          : 'relative flex min-h-[min(100dvh,34rem)] flex-col overflow-hidden bg-black sm:min-h-[28rem]'
      }
    >
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
        <video
          ref={setVideoRef}
          autoPlay
          playsInline
          muted
          className={`h-full w-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
        />
        {!isReady && !errorMessage ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/50 text-sm text-white">
            <Loader2 className="animate-spin" size={28} />
            正在打开摄像头…
          </div>
        ) : null}
        {errorMessage ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/55 px-6">
            <div
              className={`map-chrome-content-${chromeAppearance ?? 'light'} ${CHROME_DIALOG_SURFACE_SHELL_CLASS} w-full max-w-xs p-4 text-center`}
              style={chromeSurfaceStyle}
            >
              <p className="text-sm font-medium text-gray-800">{errorMessage}</p>
              <div className="mt-3 flex flex-col gap-2">
                {capturedPhotoRef.current ? (
                  <button
                    type="button"
                    onClick={() => void handleCapture()}
                    disabled={isCapturing}
                    className="rounded-lg px-4 py-2 text-sm font-semibold text-theme-chrome-fg shadow-sm transition active:scale-[0.98] disabled:opacity-50"
                    style={{ backgroundColor: themeColor }}
                  >
                    重试保存这张照片
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={handleClose}
                  className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-200"
                >
                  关闭
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {floatingToolbar}
    </div>
  );

  if (variant === 'overlay') {
    if (!open) return null;
    return (
      <div className="absolute inset-0 z-50 flex flex-col" onPointerDown={(e) => e.stopPropagation()}>
        {body}
      </div>
    );
  }

  return (
    <ChromeWindow
      open={open}
      onClose={handleClose}
      backdropLabel="关闭拍照"
      placement="center"
      surface="window"
      appearance={chromeAppearance}
      compactBehavior="fullscreen"
      className="w-[min(100vw-2rem,32rem)] overflow-hidden rounded-xl"
      style={chromeSurfaceStyle}
    >
      {body}
    </ChromeWindow>
  );
}
