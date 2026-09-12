import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { Map as LeafletMap } from 'leaflet';

export type CustomHorizontalSliderWidth = number | 'stretch';

interface CustomHorizontalSliderProps {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  /** 拖动/点击轨道结束后触发一次（抬起时）；不传则仅 onChange */
  onCommit?: (value: number) => void;
  themeColor: string;
  /** 固定像素宽度，或 `stretch` 占满父级（用于设置面板等自适应布局） */
  width: CustomHorizontalSliderWidth;
  formatValue: (value: number) => string;
  mapInstance: LeafletMap | null;
}

export const CustomHorizontalSlider: React.FC<CustomHorizontalSliderProps> = ({
  value,
  min,
  max,
  step,
  onChange,
  onCommit,
  themeColor,
  width,
  formatValue,
  mapInstance
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const lastValueRef = useRef(value);
  const draggingRef = useRef(false);
  const activePointerIdRef = useRef<number | null>(null);
  const restoreMapDraggingRef = useRef(false);

  useEffect(() => {
    lastValueRef.current = value;
  }, [value]);

  const finishPointerInteraction = useCallback(() => {
    const wasDragging = draggingRef.current;
    draggingRef.current = false;
    activePointerIdRef.current = null;
    if (restoreMapDraggingRef.current && mapInstance) {
      mapInstance.dragging.enable();
    }
    restoreMapDraggingRef.current = false;
    if (!wasDragging) return;
    setIsDragging(false);
    onCommit?.(lastValueRef.current);
  }, [mapInstance, onCommit]);

  useEffect(() => {
    if (!isDragging) return;
    const onUp = () => finishPointerInteraction();
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
    return () => {
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
    };
  }, [isDragging, finishPointerInteraction]);

  useEffect(
    () => () => {
      if (restoreMapDraggingRef.current && mapInstance) {
        mapInstance.dragging.enable();
      }
    },
    [mapInstance]
  );

  const percentage = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    draggingRef.current = true;
    activePointerIdRef.current = e.pointerId;
    setIsDragging(true);
    if (mapInstance?.dragging.enabled()) {
      restoreMapDraggingRef.current = true;
      mapInstance.dragging.disable();
    }
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    updateValueFromPointer(e.clientX);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current || activePointerIdRef.current !== e.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    updateValueFromPointer(e.clientX);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!draggingRef.current || activePointerIdRef.current !== e.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      (e.currentTarget as Element).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    finishPointerInteraction();
  };

  const handlePointerCancel = (e: React.PointerEvent) => {
    if (activePointerIdRef.current !== e.pointerId) return;
    finishPointerInteraction();
  };

  const updateValueFromPointer = (clientX: number) => {
    if (!trackRef.current) return;

    const rect = trackRef.current.getBoundingClientRect();
    const relativeX = clientX - rect.left;
    let percent = relativeX / rect.width;
    percent = Math.max(0, Math.min(1, percent));

    const rawValue = min + percent * (max - min);
    const steppedValue = Math.round(rawValue / step) * step;
    const v = Math.max(min, Math.min(max, steppedValue));
    lastValueRef.current = v;
    onChange(v);
  };

  const stretch = width === 'stretch';

  return (
    <div
      className={`flex min-w-0 items-center gap-2 custom-horizontal-slider ${stretch ? 'w-full' : ''}`}
    >
      <div
        ref={trackRef}
        className={`relative h-1 cursor-pointer select-none touch-none ${
          stretch ? 'min-w-0 flex-1' : 'flex'
        }`}
        style={stretch ? undefined : { width: `${width}px` }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onLostPointerCapture={handlePointerCancel}
      >
        {/* 视觉轨道保持纤细，触控命中区则扩至约 36px，避免手指轻微偏移就断开。 */}
        <div className="absolute -inset-y-4 left-0 right-0 z-10 touch-none" aria-hidden />
        <div className="absolute top-0 left-0 right-0 h-1 bg-gray-200 rounded-full pointer-events-none" />
        <div
          className="absolute top-0 left-0 h-1 rounded-full pointer-events-none transition-all duration-75"
          style={{
            backgroundColor: themeColor,
            width: `${percentage}%`
          }}
        />
        <div
          className="absolute top-1/2 w-4 h-4 bg-white border-2 rounded-full shadow-md pointer-events-none transition-all duration-75 -translate-y-1/2"
          style={{
            borderColor: themeColor,
            left: `calc(${percentage}% - 8px)`
          }}
        />
      </div>
      <span className="text-xs text-gray-500 whitespace-nowrap min-w-[2rem]">
        {formatValue(value)}
      </span>
    </div>
  );
};
