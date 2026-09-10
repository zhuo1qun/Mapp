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
  themeColor
}) => (
  <section className="flex flex-col flex-1 min-h-0" aria-label="正文">
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
    />
  </section>
);
