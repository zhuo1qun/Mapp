import React from 'react';
import type { Editor } from '@tiptap/core';
import { EditorArea } from './EditorArea';

interface ContentSectionProps {
  isPreviewMode: boolean;
  text: string;
  onTextChange: (value: string) => void;
  onPaste: (e: React.ClipboardEvent) => void;
  onDropImages: (e: React.DragEvent) => void;
  isProcessingImages: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  updateCursorPosition: () => void;
  editor: Editor | null;
  themeColor: string;
  cornerOverlay?: React.ReactNode;
}

/** Content：正文 Markdown（标题由卡片左上角统一展示）。 */
export const ContentSection: React.FC<ContentSectionProps> = ({
  isPreviewMode,
  text,
  onTextChange,
  onPaste,
  onDropImages,
  isProcessingImages,
  textareaRef,
  updateCursorPosition,
  editor,
  themeColor,
  cornerOverlay
}) => (
  <section className="relative flex flex-col flex-1 min-h-0" aria-label="正文">
    <EditorArea
      isPreviewMode={isPreviewMode}
      text={text}
      onTextChange={onTextChange}
      onPaste={onPaste}
      onDropImages={onDropImages}
      isProcessingImages={isProcessingImages}
      textareaRef={textareaRef}
      updateCursorPosition={updateCursorPosition}
      editor={editor}
      themeColor={themeColor}
      reserveBottomCorner={!!cornerOverlay}
    />
    {cornerOverlay ? (
      <div className="absolute bottom-3 right-3 z-10 h-28 w-28 overflow-hidden rounded-xl shadow-lg">
        {cornerOverlay}
      </div>
    ) : null}
  </section>
);
