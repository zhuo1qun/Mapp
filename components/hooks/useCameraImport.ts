import { useCallback } from 'react';
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

  const handleImportFromCamera = useCallback(async () => {
    try {
      if (
        location.protocol !== 'https:' &&
        location.hostname !== 'localhost' &&
        location.hostname !== '127.0.0.1'
      ) {
        throw new Error(
          'Camera access requires HTTPS. Please access this site over HTTPS or use localhost for development.'
        );
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(
          'Camera API is not supported in this browser. Please use a modern browser with camera support.'
        );
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });

      const video = document.createElement('video');
      video.srcObject = stream;
      video.play();

      await new Promise<void>((resolve) => {
        video.onloadedmetadata = () => resolve();
      });

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Failed to get canvas context');
      }

      ctx.drawImage(video, 0, 0);
      stream.getTracks().forEach((track) => track.stop());

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => {
            if (b) resolve(b);
            else reject(new Error('Failed to convert canvas to blob'));
          },
          'image/jpeg',
          0.8
        );
      });

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

  return { handleImportFromCamera, isCameraAvailable };
}
