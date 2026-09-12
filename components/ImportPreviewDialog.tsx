import React from 'react';
import { X, Check } from 'lucide-react';
import { ImportPreview } from './hooks/useImageImport';
import { DEFAULT_MAP_UI_CHROME_BLUR_PX, DEFAULT_MAP_UI_CHROME_OPACITY, mapChromeSurfaceStyle } from '../utils/map/mapChromeStyle';
import { ChromeDialogSurface } from './ui/ChromeDialogSurface';

interface ImportPreviewDialogProps {
  isOpen: boolean;
  importPreview: ImportPreview[];
  themeColor: string;
  panelChromeStyle?: React.CSSProperties;
  onConfirm: () => void;
  onCancel: () => void;
  showCloseButton?: boolean;
  showCoordinates?: boolean;
}

export const ImportPreviewDialog: React.FC<ImportPreviewDialogProps> = ({
  isOpen,
  importPreview,
  themeColor,
  panelChromeStyle,
  onConfirm,
  onCancel,
  showCloseButton = false,
  showCoordinates = true
}) => {
  if (!isOpen) return null;

  const cardChrome =
    panelChromeStyle ??
    mapChromeSurfaceStyle(DEFAULT_MAP_UI_CHROME_OPACITY, DEFAULT_MAP_UI_CHROME_BLUR_PX);

  const importableCount = importPreview.filter(p => !p.error && !p.isDuplicate).length;
  const duplicateCount = importPreview.filter(p => !p.error && p.isDuplicate).length;
  const errorCount = importPreview.filter(p => p.error).length;

  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/50">
      <ChromeDialogSurface
        className="max-w-2xl mx-4 max-h-[80vh] overflow-hidden flex flex-col"
        style={cardChrome}
      >
        {/* Header */}
        <div className={`p-4 ${showCloseButton ? 'flex justify-between items-center border-b border-gray-200' : ''}`}>
          <div>
            <h3 className="text-lg font-bold text-gray-800">Import Photo Preview</h3>
            <div className="mt-1 text-sm text-gray-600">
              Importable: {importableCount} |
              Already imported: {duplicateCount} |
              Cannot import: {errorCount}
            </div>
          </div>
          {showCloseButton && (
            <button
              onClick={onCancel}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors flex-shrink-0"
              title="Close (ESC)"
            >
              <X size={20} className="text-gray-600" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-3 gap-2">
            {importPreview.map((preview, index) => (
              <div key={index} className="relative aspect-square">
                <img
                  src={preview.imageUrl}
                  alt={`Preview ${index + 1}`}
                  className="w-full h-full object-cover rounded-lg"
                />
                {preview.error ? (
                  <div className="absolute inset-0 bg-red-500/20 rounded-lg flex items-center justify-center">
                    <div className="text-center text-red-600 text-xs px-2">
                      <X size={16} className="mx-auto mb-1" />
                      <span className="font-bold">{preview.error}</span>
                    </div>
                  </div>
                ) : preview.isDuplicate ? (
                  <div
                    className="absolute inset-0 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: showCloseButton ? `${themeColor}20` : 'rgba(255, 193, 7, 0.2)' }}
                  >
                    <div
                      className="text-center text-xs px-2"
                      style={{ color: showCloseButton ? themeColor : '#d97706' }}
                    >
                      <Check size={16} className="mx-auto mb-1" />
                      <span className="font-bold">Already imported</span>
                    </div>
                  </div>
                ) : (
                  <div className="absolute top-2 right-2 bg-green-500 text-white rounded-full p-1.5">
                    <Check size={12} />
                  </div>
                )}
                {showCoordinates && !preview.error && preview.lat !== null && preview.lng !== null && (
                  <div className="mt-1 text-xs text-gray-600">
                    {preview.lat.toFixed(6)}, {preview.lng.toFixed(6)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-6 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={importableCount === 0}
            className="px-6 py-2 disabled:bg-gray-300 disabled:cursor-not-allowed disabled:text-gray-500 rounded-lg font-medium transition-colors text-theme-chrome-fg"
            style={{ backgroundColor: importableCount > 0 ? themeColor : undefined }}
            onMouseEnter={(e) => {
              if (!e.currentTarget.disabled && importableCount > 0) {
                const darkR = Math.max(0, Math.floor(parseInt(themeColor.slice(1, 3), 16) * 0.9));
                const darkG = Math.max(0, Math.floor(parseInt(themeColor.slice(3, 5), 16) * 0.9));
                const darkB = Math.max(0, Math.floor(parseInt(themeColor.slice(5, 7), 16) * 0.9));
                const darkHex = '#' + [darkR, darkG, darkB].map(x => {
                  const hex = x.toString(16);
                  return hex.length === 1 ? '0' + hex : hex;
                }).join('').toUpperCase();
                e.currentTarget.style.backgroundColor = darkHex;
              }
            }}
            onMouseLeave={(e) => {
              if (!e.currentTarget.disabled && importableCount > 0) {
                e.currentTarget.style.backgroundColor = themeColor;
              }
            }}
          >
            Confirm Import ({importableCount})
          </button>
        </div>
      </ChromeDialogSurface>
    </div>
  );
};
