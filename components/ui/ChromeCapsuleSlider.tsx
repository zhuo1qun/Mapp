import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { Map as LeafletMap } from 'leaflet';
import { useChromeAppearance } from './chromeAppearanceContext';

export type ChromeCapsuleSliderWidth = number | 'stretch';

export type ChromeCapsuleSliderProps = {
  /** 胶囊内左侧的小标题；设置项用它避免在轨道外再占一行。 */
  label?: React.ReactNode;
  /** 标题右侧的辅助控件（通常为说明/警告图标）。 */
  labelExtra?: React.ReactNode;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  /** 拖动结束后触发一次；键盘调节每次按键也会触发 */
  onCommit?: (value: number) => void;
  /** 固定像素宽度，或 `stretch` 占满父级 */
  width?: ChromeCapsuleSliderWidth;
  formatValue?: (value: number) => string;
  /** 地图上拖动时暂时关掉 Leaflet dragging，避免和滑块抢手势 */
  mapInstance?: LeafletMap | null;
  size?: 'sm' | 'md';
  className?: string;
  'aria-label'?: string;
  id?: string;
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function snapSliderValue(min: number, max: number, step: number, raw: number): number {
  const stepped = Math.round(raw / step) * step;
  return clamp(stepped, min, max);
}

/**
 * 玻璃面板内的胶囊滑块：凹槽轨道 + 从左向右生长的凸起填充，类似 iPhone 控制中心。
 * 主题设置、地图设置、图谱设置与顶栏快捷滑块共用。
 */
export const ChromeCapsuleSlider: React.FC<ChromeCapsuleSliderProps> = ({
  label,
  labelExtra,
  value,
  min,
  max,
  step,
  onChange,
  onCommit,
  width = 'stretch',
  formatValue,
  mapInstance = null,
  size = 'md',
  className = '',
  'aria-label': ariaLabel,
  id
}) => {
  const appearance = useChromeAppearance();
  const fallbackId = useId();
  const sliderId = id ?? fallbackId;
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

  const span = max - min;
  const percentage = span <= 0 ? 0 : clamp(((value - min) / span) * 100, 0, 100);
  const stretch = width === 'stretch';
  const compact = size === 'sm';
  const valueText = formatValue?.(value);

  const applyFromClientX = (clientX: number) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    if (rect.width <= 0) return;
    const percent = clamp((clientX - rect.left) / rect.width, 0, 1);
    const next = snapSliderValue(min, max, step, min + percent * span);
    lastValueRef.current = next;
    onChange(next);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
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
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus({ preventScroll: true });
    applyFromClientX(e.clientX);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current || activePointerIdRef.current !== e.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    applyFromClientX(e.clientX);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current || activePointerIdRef.current !== e.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    finishPointerInteraction();
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== e.pointerId) return;
    finishPointerInteraction();
  };

  const commitValue = (next: number) => {
    lastValueRef.current = next;
    onChange(next);
    onCommit?.(next);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    let next: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = snapSliderValue(min, max, step, value + step);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = snapSliderValue(min, max, step, value - step);
    else if (e.key === 'Home') next = min;
    else if (e.key === 'End') next = max;
    else if (e.key === 'PageUp') next = snapSliderValue(min, max, step, value + step * 5);
    else if (e.key === 'PageDown') next = snapSliderValue(min, max, step, value - step * 5);
    if (next == null) return;
    e.preventDefault();
    commitValue(next);
  };

  return (
    <div
      className={`custom-horizontal-slider chrome-capsule-slider map-chrome-content-${appearance} flex min-w-0 items-center ${
        stretch ? 'w-full' : ''
      } ${className}`.trim()}
    >
      <div
        ref={trackRef}
        id={sliderId}
        role="slider"
        tabIndex={0}
        aria-label={ariaLabel}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={valueText}
        className={`chrome-capsule-track relative cursor-pointer select-none overflow-hidden rounded-full touch-none outline-none focus-visible:ring-2 focus-visible:ring-gray-400/70 ${
          compact ? 'h-7' : 'h-9'
        } ${stretch ? 'min-w-0 w-full' : ''}`}
        style={stretch ? undefined : { width: `${width}px` }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onLostPointerCapture={handlePointerCancel}
        onKeyDown={handleKeyDown}
      >
        <div
          className={`chrome-capsule-fill pointer-events-none absolute inset-y-0 left-0 ${
            isDragging ? '' : 'transition-[width] duration-75'
          }`}
          style={{ width: `${percentage}%` }}
        />
        {label || valueText ? (
          <span
            className={`pointer-events-none absolute inset-0 z-[1] flex items-center font-medium tabular-nums text-gray-700 ${
              compact ? 'px-2 text-[10px]' : 'px-2.5 text-xs'
            }`}
          >
            {label ? (
              <span className="flex min-w-0 items-center gap-1 truncate">
                <span className="pointer-events-none truncate">{label}</span>
                {labelExtra ? (
                  <span
                    className="pointer-events-auto inline-flex"
                    onPointerDown={(event) => event.stopPropagation()}
                  >
                    {labelExtra}
                  </span>
                ) : null}
              </span>
            ) : null}
            {valueText ? <span className="ml-auto shrink-0">{valueText}</span> : null}
          </span>
        ) : null}
      </div>
    </div>
  );
};
