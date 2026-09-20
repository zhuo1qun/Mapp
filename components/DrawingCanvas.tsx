
import React, { useRef, useState, useEffect, type CSSProperties } from 'react';
import { Eraser, Pencil, Trash2, Check, X } from 'lucide-react';
import { THEME_COLOR, THEME_COLOR_DARK } from '../constants';
import type { MapChromeAppearance } from '../utils/map/mapChromeStyle';
import { ChromeFloatingToolbar } from './ui/ChromeFloatingToolbar';

interface DrawingCanvasProps {
  onSave: (dataUrl: string) => void;
  onCancel: () => void;
  initialData?: string;
  backgroundColor?: string;
  themeColor?: string;
  chromeAppearance?: MapChromeAppearance;
  chromeSurfaceStyle?: CSSProperties;
}

export const DrawingCanvas: React.FC<DrawingCanvasProps> = ({
  onSave,
  onCancel,
  initialData,
  backgroundColor = '#ffffff',
  themeColor = THEME_COLOR,
  chromeAppearance,
  chromeSurfaceStyle
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#000000');
  const [mode, setMode] = useState<'draw' | 'erase'>('draw');
  const [doneHover, setDoneHover] = useState(false);

  // Initialize and Resize Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resizeCanvas = () => {
      const { width, height } = container.getBoundingClientRect();
      
      if (width === 0 || height === 0) return;

      // Check if size actually changed to avoid unnecessary redraws
      if (canvas.width === width && canvas.height === height) return;

      // Save content
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvas.width;
      tempCanvas.height = canvas.height;
      const tempCtx = tempCanvas.getContext('2d');
      if (tempCtx && canvas.width > 0 && canvas.height > 0) {
          tempCtx.drawImage(canvas, 0, 0);
      }

      // Resize
      canvas.width = width;
      canvas.height = height;

      // Restore
      const ctx = canvas.getContext('2d');
      if (ctx) {
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          
          // Fill background
          ctx.fillStyle = backgroundColor;
          ctx.fillRect(0, 0, width, height);
          
          if (tempCtx && tempCanvas.width > 0) {
              ctx.drawImage(tempCanvas, 0, 0);
          }
      }
    };

    const observer = new ResizeObserver(resizeCanvas);
    observer.observe(container);
    
    // Initial resize
    resizeCanvas();

    return () => observer.disconnect();
  }, [backgroundColor]);

  // Load Initial Data
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas && initialData && initialData !== '') {
      const ctx = canvas.getContext('2d');
      const img = new Image();
      img.src = initialData;
      img.onload = () => {
        if (ctx) {
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        }
      };
    }
  }, [initialData]);

  const getPoint = (e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  };

  const startDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    setIsDrawing(true);
    canvas.setPointerCapture(e.pointerId);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Reset context properties to ensure they are correct
    ctx.strokeStyle = mode === 'erase' ? backgroundColor : color;
    ctx.lineWidth = mode === 'erase' ? 20 : 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const { x, y } = getPoint(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.stopPropagation();

    if (!isDrawing) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;

    const { x, y } = getPoint(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const endDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (isDrawing) {
        setIsDrawing(false);
        const canvas = canvasRef.current;
        if (canvas) {
            canvas.releasePointerCapture(e.pointerId);
            const ctx = canvas.getContext('2d');
            if (ctx) ctx.beginPath(); // Close path
        }
    }
  };

  // Check if canvas is empty (only background color)
  const isCanvasEmpty = (canvas: HTMLCanvasElement): boolean => {
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return true;
      
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      
      // Parse background color
      const bgColor = backgroundColor.toLowerCase();
      let bgR = 255, bgG = 255, bgB = 255;
      if (bgColor.startsWith('#')) {
          const hex = bgColor.slice(1);
          if (hex.length === 3) {
              bgR = parseInt(hex[0] + hex[0], 16);
              bgG = parseInt(hex[1] + hex[1], 16);
              bgB = parseInt(hex[2] + hex[2], 16);
          } else if (hex.length === 6) {
              bgR = parseInt(hex.slice(0, 2), 16);
              bgG = parseInt(hex.slice(2, 4), 16);
              bgB = parseInt(hex.slice(4, 6), 16);
          }
      } else if (bgColor.startsWith('rgb')) {
          const matches = bgColor.match(/\d+/g);
          if (matches && matches.length >= 3) {
              bgR = parseInt(matches[0]);
              bgG = parseInt(matches[1]);
              bgB = parseInt(matches[2]);
          }
      }
      
      // Check if all pixels match background color (with small tolerance for anti-aliasing)
      const tolerance = 5;
      for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];
          
          // Skip transparent pixels
          if (a < 128) continue;
          
          // Check if pixel differs from background
          if (Math.abs(r - bgR) > tolerance || 
              Math.abs(g - bgG) > tolerance || 
              Math.abs(b - bgB) > tolerance) {
              return false; // Found a non-background pixel
          }
      }
      
      return true; // All pixels match background
  };

  const handleDone = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (canvasRef.current) {
          // Check if canvas is empty before saving
          if (isCanvasEmpty(canvasRef.current)) {
              // Pass empty string to indicate empty canvas
              onSave('');
          } else {
          onSave(canvasRef.current.toDataURL());
          }
      }
  };

  const clearCanvas = (e: React.MouseEvent) => {
      e.stopPropagation();
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) {
          ctx.fillStyle = backgroundColor;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
  };

  return (
    <div ref={containerRef} className="w-full h-full relative" style={{ touchAction: 'none' }}>
      <canvas
        ref={canvasRef}
        className="block w-full h-full touch-none cursor-crosshair relative z-0"
        onPointerDown={startDrawing}
        onPointerMove={draw}
        onPointerUp={endDrawing}
        // Remove onPointerLeave to prevent accidental stops near edges, relying on setPointerCapture
      />

      {/* Floating Toolbar — ChromeWindow 材质 / 圆角 */}
      <ChromeFloatingToolbar appearance={chromeAppearance} style={chromeSurfaceStyle}>
         <button
           type="button"
           onClick={(e) => { e.stopPropagation(); onCancel(); }}
           className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
           aria-label="取消涂鸦"
         >
            <X size={20} />
         </button>

         <div className="h-6 w-px bg-gray-200/80" />

         <div className="flex rounded-lg bg-gray-100/90 p-0.5">
            <button
              type="button"
              onClick={() => setMode('draw')}
              className={`rounded-md p-1.5 transition-all ${mode === 'draw' ? 'bg-white shadow-sm' : 'text-gray-400'}`}
              style={mode === 'draw' ? { color: themeColor } : undefined}
              aria-label="画笔"
            >
              <Pencil size={18} />
            </button>
            <button
              type="button"
              onClick={() => setMode('erase')}
              className={`rounded-md p-1.5 transition-all ${mode === 'erase' ? 'bg-white shadow-sm' : 'text-gray-400'}`}
              style={mode === 'erase' ? { color: themeColor } : undefined}
              aria-label="橡皮"
            >
              <Eraser size={18} />
            </button>
         </div>

         <div className="flex gap-1.5 px-0.5">
            {['#000000', '#EF4444', '#F59E0B', '#10B981', '#3B82F6'].map(c => (
                <button
                    type="button"
                    key={c}
                    onClick={() => { setColor(c); setMode('draw'); }}
                    className={`h-5 w-5 rounded-md border border-black/10 transition-transform ${color === c && mode === 'draw' ? 'scale-110 ring-1 ring-gray-400' : ''}`}
                    style={{ backgroundColor: c }}
                    aria-label={`颜色 ${c}`}
                />
            ))}
         </div>

         <div className="h-6 w-px bg-gray-200/80" />

        <button
          type="button"
          onClick={handleDone}
          className="rounded-lg p-2 text-theme-chrome-fg shadow-sm transition-all active:scale-95"
          style={{
            backgroundColor:
              doneHover
                ? themeColor === THEME_COLOR
                  ? THEME_COLOR_DARK
                  : themeColor
                : themeColor
          }}
          onMouseEnter={() => setDoneHover(true)}
          onMouseLeave={() => setDoneHover(false)}
          aria-label="完成涂鸦"
        >
            <Check size={20} />
         </button>
      </ChromeFloatingToolbar>

      <button 
        type="button"
        onClick={clearCanvas}
        onPointerDown={(e) => e.stopPropagation()}
        className="absolute top-4 left-4 z-50 rounded-lg p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500 group"
        title="清空"
        aria-label="清空画布"
      >
        <div className="origin-bottom-right transition-transform duration-300 group-hover:rotate-12">
             <div className="rotate-45">
                <Trash2 size={24} />
             </div>
        </div>
      </button>
    </div>
  );
};
