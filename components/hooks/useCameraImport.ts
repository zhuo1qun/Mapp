import { useCallback, useState } from 'react';
import type { Map as LeafletMap } from 'leaflet';
import type { Note } from '../../types';
import { fileToBase64 } from '../../utils';

interface UseCameraImportProps {
  getCurrentBrowserLocation: () => Promise<{ lat: number; lng: number } | null>;
  mapInstance: LeafletMap | null;
  onAddNote: (note: Note) => void;
  /** 新记录写入后由界面聚焦并打开编辑器。 */
  onNoteCreated?: (note: Note) => void;
}

export function useCameraImport({
  getCurrentBrowserLocation,
  mapInstance,
  onAddNote,
  onNoteCreated
}: UseCameraImportProps) {
  const isCameraAvailable = useCallback(() => {
    return (
      (location.protocol === 'https:' ||
        location.hostname === 'localhost' ||
        location.hostname === '127.0.0.1') &&
      !!navigator.mediaDevices?.getUserMedia
    );
  }, []);

  const [isCameraCaptureOpen, setIsCameraCaptureOpen] = useState(false);

  /** 仅打开取景界面；用户按下快门后才会请求位置、创建记录和打开编辑器。 */
  const handleImportFromCamera = useCallback(() => {
    if (
      location.protocol !== 'https:' &&
      location.hostname !== 'localhost' &&
      location.hostname !== '127.0.0.1'
    ) {
      alert('拍照需要 HTTPS。请通过 HTTPS 访问此站点，或在本机 localhost 开发环境中使用。');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      alert('当前浏览器不支持摄像头。请使用支持摄像头的现代浏览器。');
      return;
    }
    setIsCameraCaptureOpen(true);
  }, []);

  const handleCameraPhoto = useCallback(async (blob: Blob) => {
    // 快门已确认，立刻关掉取景器和摄像头；后续位置 / 写入过程不再占用镜头。
    setIsCameraCaptureOpen(false);
    try {
      const userLocation = await getCurrentBrowserLocation();
      if (!userLocation) {
        throw new Error('Unable to get current location');
      }

      const imageFile = new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' });
      const base64 = await fileToBase64(imageFile);

      const newNote: Note = {
        id: `note-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        coords: { lat: userLocation.lat, lng: userLocation.lng },
        text: '',
        emoji: '📷',
        fontSize: 3,
        images: [base64],
        tags: [],
        variant: 'image',
        createdAt: Date.now(),
        boardX: 0,
        boardY: 0
      };

      onAddNote(newNote);
      onNoteCreated?.(newNote);

      if (mapInstance) {
        mapInstance.flyTo([userLocation.lat, userLocation.lng], 16);
      }
    } catch (error) {
      console.error('Failed to import from camera:', error);
      alert(`相机导入失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }, [getCurrentBrowserLocation, mapInstance, onAddNote, onNoteCreated]);

  return {
    handleImportFromCamera,
    isCameraAvailable,
    isCameraCaptureOpen,
    closeCameraCapture: () => setIsCameraCaptureOpen(false),
    handleCameraPhoto
  };
}
