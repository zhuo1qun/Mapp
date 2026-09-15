import { useState, useCallback } from 'react';

interface UseFileDropProps {
  isEditorOpen: boolean;
  handleImageImport: (files: FileList | null) => void;
  handleDataImport: (file: File) => void;
  handleCsvImport: (file: File) => void;
  /** 为 true 时仅处理 JSON/CSV（不触发图片导入） */
  dataOnly?: boolean;
}

export function useFileDrop({
  isEditorOpen,
  handleImageImport,
  handleDataImport,
  handleCsvImport,
  dataOnly = false
}: UseFileDropProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) {
      e.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const handleDragLeave = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!isEditorOpen) {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const { clientX: x, clientY: y } = e;
        if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
          setIsDragging(false);
        }
      }
    },
    [isEditorOpen]
  );

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (isEditorOpen) {
        setIsDragging(false);
        return;
      }

      setIsDragging(false);

      const files = e.dataTransfer.files;
      if (!files || files.length === 0) return;

      const imageFiles = Array.from(files).filter(
        (file: File) =>
          file.type.startsWith('image/') ||
          file.name.toLowerCase().endsWith('.heic') ||
          file.name.toLowerCase().endsWith('.heif')
      );
      const jsonFiles = Array.from(files).filter(
        (file: File) =>
          file.type === 'application/json' || file.name.endsWith('.json')
      );
      const csvFiles = Array.from(files).filter(
        (file: File) =>
          file.type === 'text/csv' || file.name.toLowerCase().endsWith('.csv')
      );

      if (dataOnly) {
        if (jsonFiles.length > 0 && jsonFiles[0]) {
          handleDataImport(jsonFiles[0] as File);
        } else if (csvFiles.length > 0 && csvFiles[0]) {
          handleCsvImport(csvFiles[0] as File);
        }
        return;
      }

      if (imageFiles.length > 0) {
        const dataTransfer = new DataTransfer();
        imageFiles.forEach((file) => dataTransfer.items.add(file as File));
        handleImageImport(dataTransfer.files);
      } else if (jsonFiles.length > 0 && jsonFiles[0]) {
        handleDataImport(jsonFiles[0] as File);
      } else if (csvFiles.length > 0 && csvFiles[0]) {
        handleCsvImport(csvFiles[0] as File);
      }
    },
    [isEditorOpen, handleImageImport, handleDataImport, handleCsvImport, dataOnly]
  );

  const rootProps = {
    onDragEnter: handleDragEnter,
    onDragOver: handleDragOver,
    onDragLeave: handleDragLeave,
    onDrop: handleDrop,
    onDragEnd: handleDragEnd,
    className: '',
    style: undefined
  };

  return { isDragging, rootProps };
}
