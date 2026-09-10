import React from 'react';
import type { Editor } from '@tiptap/core';
import { EditorContent } from '@tiptap/react';
import { EditorBubbleMenu } from './EditorBubbleMenu';
import { EditorSlashMenu } from './EditorSlashMenu';

interface EditorAreaProps {
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

export const EditorArea: React.FC<EditorAreaProps> = ({
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
}) => {
  return (
    <div
      className={`flex-1 min-h-0 relative group flex flex-col overflow-hidden ${
        isProcessingImages ? 'ring-2 ring-blue-400 ring-opacity-50 bg-blue-50 bg-opacity-30' : ''
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onDragEnter={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onDrop={onDropImages}
    >
      <div className="grid w-full min-w-0 h-full min-h-[300px]">
        {!isPreviewMode ? (
          <textarea
            ref={textareaRef}
            autoFocus={false}
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            onPaste={onPaste}
            onSelect={updateCursorPosition}
            onKeyUp={updateCursorPosition}
            onClick={updateCursorPosition}
            className="note-editor-textarea cursor-text w-full h-full bg-transparent border-none resize-none focus:ring-0 py-2 px-4 text-gray-800 leading-relaxed overflow-y-auto break-words whitespace-pre-wrap text-[1.05rem]"
            spellCheck={false}
            style={{
              border: 'none',
              outline: 'none',
              boxShadow: 'none',
              zIndex: 2,
              caretColor: themeColor
            }}
          />
        ) : (
          <div className="note-editor-tiptap-wrap cursor-text w-full h-full bg-transparent overflow-y-auto py-2 px-4 min-h-0">
            <EditorContent editor={editor as any} />
            {editor ? <EditorBubbleMenu editor={editor} /> : null}
            {editor ? <EditorSlashMenu editor={editor} /> : null}
            <style>{`
              .tiptap-editor {
                outline: none !important;
                caret-color: ${themeColor};
                cursor: text;
                margin-top: 0 !important;
                padding-top: 0 !important;
              }
              .note-editor-tiptap-wrap .tiptap-editor > :first-child {
                margin-top: 0 !important;
              }
              .note-editor-textarea::selection {
                background: ${themeColor}33;
                color: inherit;
              }
              .tiptap-editor *::selection {
                background: ${themeColor}33;
                color: inherit;
              }
              .tiptap-editor p {
                margin-top: 0 !important;
                margin-bottom: 0.5rem !important;
              }
              .tiptap-editor h1 { font-size: 1.8rem; font-weight: 800; margin: 1.5rem 0 1rem; border-bottom: 1px solid #eee; padding-bottom: 0.3rem; }
              .tiptap-editor h2 { font-size: 1.5rem; font-weight: 700; margin: 1.2rem 0 0.8rem; }
              .tiptap-editor h3 { font-size: 1.25rem; font-weight: 600; margin: 1rem 0 0.6rem; }
              .tiptap-editor ul, .tiptap-editor ol { margin: 0.5rem 0 1rem; padding-left: 1.5rem; }
              .tiptap-editor ul { list-style-type: disc; }
              .tiptap-editor ol { list-style-type: decimal; }
              .tiptap-editor li { margin-bottom: 0.25rem; }
              .tiptap-editor li p { margin: 0 !important; }
              .tiptap-editor blockquote { border-left: 4px solid #e5e7eb; padding-left: 1rem; color: #6b7280; font-style: italic; margin: 1rem 0; }
              .tiptap-editor code { background: #f3f4f6; padding: 0.2rem 0.4rem; border-radius: 4px; font-size: 0.9em; font-family: monospace; }
              .tiptap-editor pre { background: #f9fafb; padding: 1rem; border-radius: 8px; overflow-x: auto; margin: 1rem 0; border: 1px solid #f3f4f6; }
            `}</style>
          </div>
        )}
      </div>
    </div>
  );
};
