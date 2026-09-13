import React, { CSSProperties } from 'react';
import { Check, X } from 'lucide-react';
import { mapChromeSurfaceStyle } from '../../utils/map/mapChromeStyle';
import { ChromeDialogSurface } from '../ui/ChromeDialogSurface';
import { ChromePresence } from '../ui/ChromeSheetPresence';

export type BoardImportPreviewItem = {
  file: File;
  imageUrl: string;
  lat: number;
  lng: number;
  error?: string;
  isDuplicate?: boolean;
  imageFingerprint?: string;
};

export type BoardImportPreviewDialogProps = {
  open: boolean;
  importPreview: BoardImportPreviewItem[];
  themeColor: string;
  panelChromeStyle?: CSSProperties;
  mapUiChromeOpacity: number;
  mapUiChromeBlurPx: number;
  onCancel: (e?: React.MouseEvent | React.KeyboardEvent) => void;
  onConfirm: () => void;
};

function darkenHex(hex: string, factor = 0.9): string {
  const r = Math.max(0, Math.floor(parseInt(hex.slice(1, 3), 16) * factor));
  const g = Math.max(0, Math.floor(parseInt(hex.slice(3, 5), 16) * factor));
  const b = Math.max(0, Math.floor(parseInt(hex.slice(5, 7), 16) * factor));
  return (
    '#' +
    [r, g, b]
      .map((x) => {
        const h = x.toString(16);
        return h.length === 1 ? '0' + h : h;
      })
      .join('')
      .toUpperCase()
  );
}

export const BoardImportPreviewDialog: React.FC<BoardImportPreviewDialogProps> = ({
  open,
  importPreview,
  themeColor,
  panelChromeStyle,
  mapUiChromeOpacity,
  mapUiChromeBlurPx,
  onCancel,
  onConfirm
}) => {
  const importable = importPreview.filter((p) => !p.error && !p.isDuplicate).length;
  const duplicate = importPreview.filter((p) => !p.error && p.isDuplicate).length;
  const failed = importPreview.filter((p) => p.error).length;

  return (
    <ChromePresence open={open} kind="dialog">
      {(phase) => (
        <div
      className={`fixed inset-0 z-[3000] flex items-center justify-center bg-black/50 chrome-dialog-backdrop-${phase}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onCancel(e);
      }}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
    >
      <ChromeDialogSurface
        className={`mx-4 flex max-h-[80vh] max-w-2xl flex-col overflow-hidden chrome-dialog-${phase}`}
        style={panelChromeStyle ?? mapChromeSurfaceStyle(mapUiChromeOpacity, mapUiChromeBlurPx)}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 p-4">
          <div>
            <h3 className="text-lg font-bold text-gray-800">Import Photo Preview</h3>
            <div className="mt-1 text-sm text-gray-600">
              Importable: {importable} | Already imported: {duplicate} | Cannot import: {failed}
            </div>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onCancel(e);
            }}
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            className="flex-shrink-0 rounded-full p-2 transition-colors hover:bg-gray-100"
            title="Close (ESC)"
          >
            <X size={20} className="text-gray-600" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-3 gap-2">
            {importPreview.map((preview, index) => (
              <div key={index} className="relative aspect-square">
                <img
                  src={preview.imageUrl}
                  alt={`Preview ${index + 1}`}
                  className="h-full w-full rounded-lg object-cover"
                />
                {preview.error ? (
                  <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-red-500/20">
                    <div className="px-2 text-center text-xs font-bold text-red-600">
                      <X size={16} className="mx-auto mb-1" />
                      <span>{preview.error}</span>
                    </div>
                  </div>
                ) : preview.isDuplicate ? (
                  <div
                    className="absolute inset-0 flex items-center justify-center rounded-lg"
                    style={{ backgroundColor: `${themeColor}20` }}
                  >
                    <div className="px-2 text-center text-xs font-bold" style={{ color: themeColor }}>
                      <Check size={16} className="mx-auto mb-1" />
                      <span>Already imported</span>
                    </div>
                  </div>
                ) : (
                  <div className="absolute right-2 top-2 rounded-full bg-green-500 p-1.5 text-white">
                    <Check size={12} />
                  </div>
                )}
                {!preview.error && (
                  <div className="mt-1 text-xs text-gray-600">
                    {preview.lat.toFixed(6)}, {preview.lng.toFixed(6)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 p-4">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onCancel(e);
            }}
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            className="rounded-lg bg-gray-100 px-6 py-2 font-medium text-gray-700 transition-colors hover:bg-gray-200"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={importable === 0}
            className="rounded-lg px-6 py-2 font-medium text-gray-900 transition-colors disabled:cursor-not-allowed disabled:bg-gray-300"
            style={{ backgroundColor: themeColor }}
            onMouseEnter={(e) => {
              if (!e.currentTarget.disabled) {
                e.currentTarget.style.backgroundColor = darkenHex(themeColor);
              }
            }}
            onMouseLeave={(e) => {
              if (!e.currentTarget.disabled) {
                e.currentTarget.style.backgroundColor = themeColor;
              }
            }}
          >
            Confirm Import ({importable})
          </button>
        </div>
      </ChromeDialogSurface>
        </div>
      )}
    </ChromePresence>
  );
};
