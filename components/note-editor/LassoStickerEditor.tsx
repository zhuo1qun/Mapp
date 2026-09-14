import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, RotateCcw } from 'lucide-react';
import type { NormPoint } from '../../types';
import { prepareLassoPath } from '../../utils/media/pathSimplify';
import { normPointsToSvgPathD } from '../../utils/media/imageMaskRender';

type Props = {
  imageSrc: string;
  themeColor: string;
  onConfirm: (points: NormPoint[]) => void | Promise<void>;
};

type ContentBox = { left: number; top: number; w: number; h: number };

/** 媒体详情窗口内部的套索工作区；窗口外壳与关闭逻辑由父组件统一负责。 */
export const LassoStickerEditor: React.FC<Props> = ({ imageSrc, themeColor, onConfirm }) => {
  const imgRef = useRef<HTMLImageElement>(null);
  const [rawPoints, setRawPoints] = useState<NormPoint[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [contentBox, setContentBox] = useState<ContentBox | null>(null);

  const measure = useCallback(() => {
    const img = imgRef.current;
    if (!img) return;
    const rect = img.getBoundingClientRect();
    const naturalWidth = img.naturalWidth || rect.width;
    const naturalHeight = img.naturalHeight || rect.height;
    if (naturalWidth <= 0 || naturalHeight <= 0 || rect.width <= 0 || rect.height <= 0) return;
    const scale = Math.min(rect.width / naturalWidth, rect.height / naturalHeight);
    const width = naturalWidth * scale;
    const height = naturalHeight * scale;
    setContentBox({
      left: (rect.width - width) / 2,
      top: (rect.height - height) / 2,
      w: width,
      h: height
    });
  }, []);

  useEffect(() => {
    setRawPoints([]);
    setDrawing(false);
    setContentBox(null);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure, imageSrc]);

  const clientToNorm = useCallback((clientX: number, clientY: number): NormPoint | null => {
    const img = imgRef.current;
    if (!img) return null;
    const rect = img.getBoundingClientRect();
    const naturalWidth = img.naturalWidth || rect.width;
    const naturalHeight = img.naturalHeight || rect.height;
    if (naturalWidth <= 0 || naturalHeight <= 0) return null;
    const scale = Math.min(rect.width / naturalWidth, rect.height / naturalHeight);
    const contentWidth = naturalWidth * scale;
    const contentHeight = naturalHeight * scale;
    const offsetX = (rect.width - contentWidth) / 2;
    const offsetY = (rect.height - contentHeight) / 2;
    const x = (clientX - rect.left - offsetX) / contentWidth;
    const y = (clientY - rect.top - offsetY) / contentHeight;
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    return [Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y))];
  }, []);

  const appendPoint = useCallback(
    (clientX: number, clientY: number) => {
      const point = clientToNorm(clientX, clientY);
      if (!point) return;
      setRawPoints((previous) => {
        const last = previous[previous.length - 1];
        if (last && Math.hypot(last[0] - point[0], last[1] - point[1]) < 0.002) {
          return previous;
        }
        return [...previous, point];
      });
    },
    [clientToNorm]
  );

  const handlePointerDown = (event: React.PointerEvent) => {
    if (busy) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDrawing(true);
    setRawPoints([]);
    appendPoint(event.clientX, event.clientY);
  };

  const handlePointerMove = (event: React.PointerEvent) => {
    if (!drawing || busy) return;
    event.preventDefault();
    appendPoint(event.clientX, event.clientY);
  };

  const handlePointerUp = (event: React.PointerEvent) => {
    if (!drawing) return;
    event.preventDefault();
    setDrawing(false);
    appendPoint(event.clientX, event.clientY);
  };

  const previewPath = rawPoints.length >= 2 ? prepareLassoPath(rawPoints) : rawPoints;
  const svgD =
    contentBox && previewPath.length >= 2
      ? normPointsToSvgPathD(previewPath, contentBox.w, contentBox.h)
      : '';

  const handleConfirm = async () => {
    if (rawPoints.length < 8) return;
    setBusy(true);
    try {
      await onConfirm(rawPoints);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="chrome-inset relative m-4 mt-3 flex min-h-0 flex-1 touch-none items-center justify-center overflow-hidden rounded-xl p-4">
        <div className="relative inline-block max-h-full max-w-full">
          <img
            ref={imgRef}
            src={imageSrc}
            alt="套索原图"
            className="pointer-events-none max-h-[calc(100dvh-18rem)] max-w-full select-none object-contain"
            draggable={false}
            onLoad={measure}
          />
          <div
            className="absolute inset-0 cursor-crosshair"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            {contentBox && svgD ? (
              <svg
                className="pointer-events-none absolute"
                style={{
                  left: contentBox.left,
                  top: contentBox.top,
                  width: contentBox.w,
                  height: contentBox.h
                }}
                viewBox={`0 0 ${contentBox.w} ${contentBox.h}`}
              >
                <path
                  d={svgD}
                  fill={`${themeColor}33`}
                  stroke={themeColor}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </svg>
            ) : null}
          </div>
        </div>
      </div>

      <footer className="flex shrink-0 items-center justify-center gap-2 border-t border-gray-100/80 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-3">
        <button
          type="button"
          className="chrome-menu-item inline-flex cursor-pointer items-center gap-1.5 rounded-xl border-0 bg-transparent px-3 py-2 text-sm text-gray-600 disabled:opacity-40"
          disabled={busy || rawPoints.length === 0}
          onClick={() => setRawPoints([])}
        >
          <RotateCcw size={16} />
          重画
        </button>
        <button
          type="button"
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border-0 px-4 py-2 text-sm font-semibold text-theme-chrome-fg disabled:opacity-40"
          style={{ backgroundColor: themeColor }}
          disabled={busy || rawPoints.length < 8}
          onClick={() => void handleConfirm()}
        >
          <Check size={16} />
          {busy ? '处理中…' : '完成'}
        </button>
      </footer>
    </>
  );
};
