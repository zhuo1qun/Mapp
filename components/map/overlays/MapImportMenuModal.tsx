import React from 'react';
import { FileJson, Image as ImageIcon, Plus } from 'lucide-react';
import type { MapChromeAppearance } from '../../../utils/map/mapChromeStyle';
import { ChromeMenuItem } from '../../ui/ChromeMenuItem';
import { ChromeMenuShell } from '../../ui/ChromeMenuShell';
import { ChromePresence } from '../../ui/ChromeSheetPresence';

type Props = {
  open: boolean;
  chromeSurfaceStyle?: React.CSSProperties;
  chromeAppearance?: MapChromeAppearance;
  chromeHoverBackground?: string;
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
  chromeHoverBackground,
  onClose,
  onImportPhotos,
  onImportData,
  onImportCamera,
  cameraAvailable
}) => {
  return (
    <ChromePresence open={open} kind="sheet">
      {(phase) => (
        <div className={`fixed inset-0 z-[var(--z-map-modal)] flex items-end justify-center p-2 sm:items-center sm:p-4 chrome-dialog-backdrop-${phase}`} role="dialog" aria-modal="true" aria-label="导入内容">
          <button type="button" className="fixed inset-0 bg-black/20 backdrop-blur-[2px]" aria-label="关闭导入菜单" onClick={onClose} />
          <ChromeMenuShell
            appearance={chromeAppearance}
            className={`relative z-10 w-full max-w-md rounded-2xl py-1.5 chrome-responsive-sheet-${phase} sm:w-48 sm:rounded-xl sm:py-1`}
            style={chromeSurfaceStyle}
          >
        <div className="px-3 pb-1 pt-2 text-xs font-bold text-gray-500 sm:hidden">导入</div>
        <ChromeMenuItem
          icon={<ImageIcon size={16} />}
          hoverBackground={chromeHoverBackground}
          onClick={(e) => {
            e.stopPropagation();
            onImportPhotos();
            onClose();
          }}
        >
          Import from Photos
        </ChromeMenuItem>
        <ChromeMenuItem
          icon={<FileJson size={16} />}
          hoverBackground={chromeHoverBackground}
          onClick={(e) => {
            e.stopPropagation();
            onImportData();
            onClose();
          }}
        >
          Import from Data (JSON/CSV)
        </ChromeMenuItem>
        {cameraAvailable ? (
          <ChromeMenuItem
            icon={<Plus size={16} />}
            hoverBackground={chromeHoverBackground}
            onClick={(e) => {
              e.stopPropagation();
              onImportCamera();
              onClose();
            }}
          >
            Import from Camera
          </ChromeMenuItem>
        ) : (
          <div className="flex items-center gap-2 px-3 py-2.5 text-xs text-gray-500">
            <Plus size={16} className="opacity-50" />
            <span>Camera requires HTTPS</span>
          </div>
        )}
          </ChromeMenuShell>
        </div>
      )}
    </ChromePresence>
  );
};
