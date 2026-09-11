import React from 'react';
import { FileJson, Image as ImageIcon, Plus } from 'lucide-react';
import type { MapChromeAppearance } from '../../../utils/map/mapChromeStyle';

type Props = {
  open: boolean;
  chromeSurfaceStyle?: React.CSSProperties;
  chromeAppearance?: MapChromeAppearance;
  onClose: () => void;
  onImportPhotos: () => void;
  onImportData: () => void;
  onImportCamera: () => void;
  cameraAvailable: boolean;
};

export const MapImportMenuModal: React.FC<Props> = ({
  open,
  chromeSurfaceStyle,
  chromeAppearance = 'light',
  onClose,
  onImportPhotos,
  onImportData,
  onImportCamera,
  cameraAvailable
}) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[6000] flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={() => onClose()} />
      <div
        className={`map-chrome-content-${chromeAppearance} relative z-[6001] rounded-xl shadow-xl border border-gray-100/80 py-2 w-48 mx-4`}
        style={chromeSurfaceStyle}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            onImportPhotos();
            onClose();
          }}
          className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 flex items-center gap-2 text-gray-700"
        >
          <ImageIcon size={16} /> Import from Photos
        </button>
        <div className="h-px bg-gray-100 my-1" />
        <button
          onClick={(e) => {
            e.stopPropagation();
            onImportData();
            onClose();
          }}
          className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 flex items-center gap-2 text-gray-700"
        >
          <FileJson size={16} /> Import from Data (JSON/CSV)
        </button>
        {cameraAvailable ? (
          <>
            <div className="h-px bg-gray-100 my-1" />
            <button
              onClick={(e) => {
                e.stopPropagation();
                onImportCamera();
                onClose();
              }}
              className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 flex items-center gap-2 text-gray-700"
            >
              <Plus size={16} /> Import from Camera
            </button>
          </>
        ) : (
          <>
            <div className="h-px bg-gray-100 my-1" />
            <div className="px-4 py-2.5 text-xs text-gray-500 flex items-center gap-2">
              <Plus size={16} className="opacity-50" />
              <span>Camera requires HTTPS</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
