import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Loader2, X } from 'lucide-react';
import type { MapChromeAppearance } from '../../../utils/map/mapChromeStyle';
import { ChromeWindow } from '../../ui/ChromeWindow';

type Props = {
  open: boolean;
  onClose: () => void;
  onCapture: (image: Blob) => Promise<void> | void;
  chromeSurfaceStyle?: React.CSSProperties;
  chromeAppearance?: MapChromeAppearance;
};

/**
 * 取景器始终等用户按下快门，绝不在刚取得摄像头权限时自动截取首帧。
 * 关闭窗口会停止所有 MediaStream 轨道，因此取消拍摄不会留下后台摄像头占用。
 */
export function CameraCaptureDialog({
  open,
  onClose,
  onCapture,
  chromeSurfaceStyle,
  chromeAppearance
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    if (!open) return;
    let disposed = false;
    setIsReady(false);
    setErrorMessage(null);

    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false
        });
        if (disposed) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        if (!disposed) setIsReady(true);
      } catch (error) {
        if (!disposed) {
          setErrorMessage(error instanceof Error ? error.message : '无法打开摄像头');
        }
      }
    };

    void startCamera();
    return () => {
      disposed = true;
      stopCamera();
    };
  }, [open, stopCamera]);

  const handleClose = useCallback(() => {
    stopCamera();
    onClose();
  }, [onClose, stopCamera]);

  const handleCapture = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight || isCapturing) return;
    setIsCapturing(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('无法处理拍摄的照片');
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const image = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('无法生成照片'))),
          'image/jpeg',
          0.88
        );
      });
      await onCapture(image);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '拍摄失败，请重试');
      setIsCapturing(false);
    }
  }, [isCapturing, onCapture]);

  return (
    <ChromeWindow
      open={open}
      onClose={handleClose}
      backdropLabel="关闭拍照"
      placement="center"
      surface="window"
      appearance={chromeAppearance}
      compactBehavior="fullscreen"
      className="w-[min(100vw-2rem,32rem)] overflow-hidden rounded-3xl"
      style={chromeSurfaceStyle}
    >
      <div className="flex min-h-[min(100dvh,34rem)] flex-col p-3 sm:min-h-0">
        <div className="flex items-center justify-between px-1 pb-3">
          <div className="text-sm font-bold">拍照添加点位</div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-full p-2 opacity-70 transition hover:bg-black/10 hover:opacity-100"
            aria-label="取消拍照"
          >
            <X size={20} />
          </button>
        </div>

        <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-2xl bg-black">
          <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
          {!isReady && !errorMessage ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 text-sm text-white">
              <Loader2 className="animate-spin" size={28} />
              正在打开摄像头…
            </div>
          ) : null}
          {errorMessage ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/75 px-6 text-center text-sm text-white">
              <span>{errorMessage}</span>
              <button type="button" onClick={handleClose} className="rounded-full bg-white/15 px-4 py-2 font-medium">
                关闭
              </button>
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-center gap-4 pt-4">
          <button type="button" onClick={handleClose} className="rounded-full px-4 py-2 text-sm font-medium opacity-75 transition hover:bg-black/10">
            取消
          </button>
          <button
            type="button"
            onClick={handleCapture}
            disabled={!isReady || isCapturing}
            className="flex h-14 w-14 items-center justify-center rounded-full border-4 border-white bg-white/20 text-white shadow-lg transition enabled:hover:scale-105 disabled:cursor-not-allowed disabled:opacity-45"
            aria-label="拍照"
          >
            {isCapturing ? <Loader2 className="animate-spin" size={24} /> : <Camera size={24} />}
          </button>
        </div>
      </div>
    </ChromeWindow>
  );
}
