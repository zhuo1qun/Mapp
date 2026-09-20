import React from 'react';
import { FileJson, Image as ImageIcon, Plus } from 'lucide-react';
import type { MapChromeAppearance } from '../../../utils/map/mapChromeStyle';
import { ChromeMenuItem } from '../../ui/ChromeMenuItem';
import { ChromeWindow } from '../../ui/ChromeWindow';
import { useChromeAppearance } from '../../ui/chromeAppearanceContext';

type Props = {
  open: boolean;
  chromeSurfaceStyle?: React.CSSProperties;
  chromeAppearance?: MapChromeAppearance;
  chromeHoverBackground?: string;
  onClose: () => void;
  onImportPhotos: () => void;
  onImportData: () => void;
  onImportCamera: () => void;
};

export const MapImportMenuModal: React.FC<Props> = ({
  open,
  chromeSurfaceStyle,
  chromeAppearance: chromeAppearanceProp,
  chromeHoverBackground,
  onClose,
  onImportPhotos,
  onImportData,
  onImportCamera
}) => {
  const chromeAppearance = useChromeAppearance(chromeAppearanceProp);
  return (
  <ChromeWindow
    open={open}
    onClose={onClose}
    backdropLabel="关闭导入菜单"
    placement="center"
    surface="menu"
    appearance={chromeAppearance}
    role="dialog"
    aria-modal="true"
    aria-label="导入内容"
    className="w-full max-w-md rounded-2xl py-1.5 sm:w-48 sm:rounded-xl sm:py-1"
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
  </ChromeWindow>
  );
};
