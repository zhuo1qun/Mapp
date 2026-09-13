import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { get, set } from 'idb-keyval';
import { getThemeChromeForegroundHex } from '../utils/theme/themeChrome';
import {
  DEFAULT_MAP_UI_CHROME_BLUR_PX,
  DEFAULT_MAP_UI_CHROME_OPACITY,
  mapChromeModalBackdropFromSurfaceStyle,
  mapChromeSurfaceStyle
} from '../utils/map/mapChromeStyle';
import { ChromePresence } from './ui/ChromeSheetPresence';

interface ThemeColorPickerProps {
  isOpen: boolean;
  onClose: () => void;
  currentColor: string;
  onColorChange: (color: string) => void;
  /** 与设置面板卡片一致的玻璃底 */
  panelChromeStyle?: React.CSSProperties;
  /** 默认 modal；inline 用于嵌入设置面板内部 */
  variant?: 'modal' | 'inline';
}

export const ThemeColorPicker: React.FC<ThemeColorPickerProps> = ({ 
  isOpen, 
  onClose, 
  currentColor, 
  onColorChange,
  panelChromeStyle,
  variant = 'modal'
}) => {
  const [hsv, setHsv] = useState({ h: 50, s: 100, v: 100 });
  const [hex, setHex] = useState('#FFDD00');
  const svRef = React.useRef<HTMLDivElement>(null);
  const draggingRef = React.useRef(false);

  // Convert Hex to HSV
  function hexToHsv(hex: string): { h: number; s: number; v: number } | null {
    const rgb = hexToRgb(hex);
    if (!rgb) return null;
    return rgbToHsv(rgb.r, rgb.g, rgb.b);
  }

  // Convert RGB to HSV
  function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const d = max - min;

    let h = 0;
    if (d !== 0) {
      switch (max) {
        case rn:
          h = (gn - bn) / d + (gn < bn ? 6 : 0);
          break;
        case gn:
          h = (bn - rn) / d + 2;
          break;
        case bn:
          h = (rn - gn) / d + 4;
          break;
      }
      h *= 60;
    }

    const s = max === 0 ? 0 : d / max;
    const v = max;

    return {
      h: Math.round(h),
      s: Math.round(s * 100),
      v: Math.round(v * 100)
    };
  }

  // Convert HSV to RGB
  function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
    const sn = clamp(s, 0, 100) / 100;
    const vn = clamp(v, 0, 100) / 100;
    const hn = ((h % 360) + 360) % 360;

    const c = vn * sn;
    const x = c * (1 - Math.abs(((hn / 60) % 2) - 1));
    const m = vn - c;

    let rp = 0, gp = 0, bp = 0;
    if (hn < 60) {
      rp = c; gp = x; bp = 0;
    } else if (hn < 120) {
      rp = x; gp = c; bp = 0;
    } else if (hn < 180) {
      rp = 0; gp = c; bp = x;
    } else if (hn < 240) {
      rp = 0; gp = x; bp = c;
    } else if (hn < 300) {
      rp = x; gp = 0; bp = c;
    } else {
      rp = c; gp = 0; bp = x;
    }

    return {
      r: Math.round((rp + m) * 255),
      g: Math.round((gp + m) * 255),
      b: Math.round((bp + m) * 255)
    };
  }

  function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  }

  function rgbToHex(r: number, g: number, b: number): string {
    return '#' + [r, g, b].map(x => {
      const hex = Math.max(0, Math.min(255, x)).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    }).join('').toUpperCase();
  }

  // Initialize from current color
  useEffect(() => {
    if (currentColor) {
      setHex(currentColor);
      const hsvValue = hexToHsv(currentColor);
      if (hsvValue) {
        setHsv(hsvValue);
      }
    }
  }, [currentColor]);

  // Update hex when HSV changes
  useEffect(() => {
    const rgb = hsvToRgb(hsv.h, hsv.s, hsv.v);
    const newHex = rgbToHex(rgb.r, rgb.g, rgb.b);
    setHex(newHex);
  }, [hsv]);

  // Load saved theme color on mount
  useEffect(() => {
    const loadThemeColor = async () => {
      const saved = await get<string>('mapp-theme-color');
      if (saved) {
        setHex(saved);
        const hsvValue = hexToHsv(saved);
        if (hsvValue) {
          setHsv(hsvValue);
        }
      }
    };
    loadThemeColor();
  }, []);

  function handleHsvChange(channel: 'h' | 's' | 'v', value: number) {
    setHsv(prev => ({ ...prev, [channel]: value }));
  }

  function clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
  }

  function updateFromSvClientPoint(clientX: number, clientY: number) {
    const el = svRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = clamp(clientX - rect.left, 0, rect.width);
    const y = clamp(clientY - rect.top, 0, rect.height);
    const s = rect.width > 0 ? Math.round((x / rect.width) * 100) : 0;
    const v = rect.height > 0 ? Math.round(100 - (y / rect.height) * 100) : 0;
    setHsv((prev) => ({ ...prev, s, v }));
  }

  function handleHexChange(raw: string) {
    let v = raw.trim().toUpperCase();
    if (!v.startsWith('#')) {
      v = '#' + v.replace(/^#+/, '');
    }
    const cleanValue = v.replace('#', '');
    if (!/^[0-9A-Fa-f]{0,6}$/.test(cleanValue)) return;
    const newHex = '#' + cleanValue.toUpperCase();
    setHex(newHex);
    if (cleanValue.length === 6) {
      const hsvValue = hexToHsv(newHex);
      if (hsvValue) {
        setHsv(hsvValue);
      }
    }
  }

  /** 预览块背景：完整 6 位 hex 用其本身，否则用当前 HSV 以免非法 CSS 颜色 */
  const previewBackground = useMemo(() => {
    if (/^#[0-9A-Fa-f]{6}$/i.test(hex)) {
      return hex;
    }
    const { r, g, b } = hsvToRgb(hsv.h, hsv.s, hsv.v);
    return rgbToHex(r, g, b);
  }, [hex, hsv.h, hsv.s, hsv.v]);

  const previewChromeFg = useMemo(
    () => getThemeChromeForegroundHex(previewBackground),
    [previewBackground]
  );

  const applyBaseBg = useMemo(
    () => (/^#[0-9A-Fa-f]{6}$/i.test(hex) ? hex : previewBackground),
    [hex, previewBackground]
  );

  const applyButtonFg = useMemo(() => getThemeChromeForegroundHex(applyBaseBg), [applyBaseBg]);

  function handleApply() {
    // Just notify parent - let parent handle all updates
    onColorChange(hex);
    onClose();
  }

  function handleReset() {
    const defaultColor = '#FFDD00';
    const defaultHsv = hexToHsv(defaultColor);
    if (defaultHsv) {
      setHsv(defaultHsv);
      setHex(defaultColor);
    }
  }

  const isInline = variant === 'inline';

  const hueTrackBg = `linear-gradient(to right,
    hsl(0, 100%, 50%),
    hsl(60, 100%, 50%),
    hsl(120, 100%, 50%),
    hsl(180, 100%, 50%),
    hsl(240, 100%, 50%),
    hsl(300, 100%, 50%),
    hsl(360, 100%, 50%))`;

  const svCursor = {
    leftPct: clamp(hsv.s, 0, 100),
    topPct: clamp(100 - hsv.v, 0, 100)
  };

  const cardChrome =
    panelChromeStyle ??
    mapChromeSurfaceStyle(DEFAULT_MAP_UI_CHROME_OPACITY, DEFAULT_MAP_UI_CHROME_BLUR_PX);
  const modalBackdropStyle = mapChromeModalBackdropFromSurfaceStyle(cardChrome);

  const content = (
    <ChromePresence open={isOpen} kind="dialog">
      {(phase) => (
    <div
      className={`km-theme-color-picker ${
        isInline
          ? 'w-full'
          : `fixed inset-0 z-[9000] min-h-[100dvh] min-h-screen w-full flex items-center justify-center p-4 chrome-dialog-backdrop-${phase}`
      }`}
      style={isInline ? undefined : modalBackdropStyle}
    >
      <style>{`
        .km-theme-color-picker input[type="range"] {
          -webkit-appearance: none;
          appearance: none;
          background: transparent;
          cursor: pointer;
        }

        /* Hue 滑块：圆形手柄（对齐你截图的样式） */
        .km-theme-color-picker .km-hue-range::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 14px;
          height: 14px;
          border-radius: 9999px;
          background: rgba(255,255,255,0.98);
          border: 2px solid rgba(0,0,0,0.65);
          box-shadow: 0 1px 6px rgba(0,0,0,0.25);
          cursor: pointer;
        }
        .km-theme-color-picker .km-hue-range::-moz-range-thumb {
          width: 14px;
          height: 14px;
          border-radius: 9999px;
          background: rgba(255,255,255,0.98);
          border: 2px solid rgba(0,0,0,0.65);
          box-shadow: 0 1px 6px rgba(0,0,0,0.25);
          cursor: pointer;
        }

        /* SV 面板：两层渐变（白->透明、黑->透明） */
        .km-theme-color-picker .km-sv {
          position: relative;
          width: 100%;
          height: 160px;
          border-radius: 12px;
          overflow: hidden;
          cursor: crosshair;
          touch-action: none;
        }
        .km-theme-color-picker .km-sv::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(to right, #fff, rgba(255,255,255,0));
        }
        .km-theme-color-picker .km-sv::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(to top, #000, rgba(0,0,0,0));
        }
      `}</style>
      <div
        className={`rounded-xl shadow-2xl w-full ${
          isInline ? 'max-w-none' : `max-w-md chrome-dialog-${phase}`
        } p-4 border border-gray-100/80`}
        style={cardChrome}
      >
        <div className="relative mb-2">
          <button
            onClick={onClose}
            className="absolute -top-1 -right-1 p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="关闭"
          >
            <X size={18} className="text-gray-600" />
          </button>
        </div>

        {/* 预览 + 内联 Hex 编辑 */}
        <div className="mb-4">
          <div
            className="flex h-16 w-full items-center justify-center rounded-lg px-3 shadow-inner"
            style={{ backgroundColor: previewBackground }}
          >
            <input
              type="text"
              value={hex}
              onChange={(e) => handleHexChange(e.target.value)}
              className={`max-w-[10.5rem] w-full border-0 bg-transparent text-center font-mono text-base font-bold outline-none focus:ring-2 focus:ring-offset-0 rounded-md px-1 py-0.5 ${
                previewChromeFg === '#ffffff'
                  ? 'drop-shadow-[0_1px_3px_rgba(0,0,0,0.85)] focus:ring-white/45'
                  : 'focus:ring-black/20'
              }`}
              style={{ color: previewChromeFg }}
              spellCheck={false}
              autoComplete="off"
              aria-label="十六进制颜色"
            />
          </div>
        </div>

        {/* 取色方块 + Hue 条（无文字） */}
        <div className="mb-4">
          <div
            ref={svRef}
            className="km-sv mb-3 border border-black/10 shadow-inner"
            style={{ backgroundColor: `hsl(${hsv.h}, 100%, 50%)` }}
            role="slider"
            aria-label="Saturation & Value"
            tabIndex={0}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              draggingRef.current = true;
              updateFromSvClientPoint(e.clientX, e.clientY);
            }}
            onPointerMove={(e) => {
              if (!draggingRef.current) return;
              updateFromSvClientPoint(e.clientX, e.clientY);
            }}
            onPointerUp={() => {
              draggingRef.current = false;
            }}
            onPointerCancel={() => {
              draggingRef.current = false;
            }}
            onKeyDown={(e) => {
              const step = e.shiftKey ? 5 : 1;
              if (e.key === 'ArrowLeft') setHsv((p) => ({ ...p, s: clamp(p.s - step, 0, 100) }));
              else if (e.key === 'ArrowRight') setHsv((p) => ({ ...p, s: clamp(p.s + step, 0, 100) }));
              else if (e.key === 'ArrowUp') setHsv((p) => ({ ...p, v: clamp(p.v + step, 0, 100) }));
              else if (e.key === 'ArrowDown') setHsv((p) => ({ ...p, v: clamp(p.v - step, 0, 100) }));
            }}
          >
            <div
              className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-black/70 bg-white/95 shadow-[0_1px_6px_rgba(0,0,0,0.25)] pointer-events-none"
              style={{ left: `${svCursor.leftPct}%`, top: `${svCursor.topPct}%` }}
              aria-hidden
            />
          </div>

          <input
            type="range"
            min="0"
            max="360"
            value={hsv.h}
            onChange={(e) => handleHsvChange('h', parseInt(e.target.value))}
            className="km-hue-range w-full h-3 rounded-full appearance-none cursor-pointer"
            style={{ background: hueTrackBg }}
            aria-label="Hue"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={handleReset}
            className="flex-1 py-2 text-sm text-gray-600 font-medium hover:bg-gray-100 rounded-lg transition-colors"
          >
            Reset
          </button>
          <button
            onClick={handleApply}
            className="flex-1 py-2 text-sm font-bold rounded-lg shadow-lg transition-colors"
            style={{ backgroundColor: applyBaseBg, color: applyButtonFg }}
            onMouseEnter={(e) => {
              const darkV = Math.max(0, hsv.v - 10);
              const darkRgb = hsvToRgb(hsv.h, hsv.s, darkV);
              const darkHex = rgbToHex(darkRgb.r, darkRgb.g, darkRgb.b);
              e.currentTarget.style.backgroundColor = darkHex;
              e.currentTarget.style.color = getThemeChromeForegroundHex(darkHex);
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = applyBaseBg;
              e.currentTarget.style.color = applyButtonFg;
            }}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
      )}
    </ChromePresence>
  );

  // modal 模式强制挂到 body，避免父级 transform/stacking context 影响 z-index
  if (!isInline && typeof document !== 'undefined') {
    return createPortal(content, document.body);
  }

  return content;
};
