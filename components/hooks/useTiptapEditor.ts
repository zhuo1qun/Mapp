import { useEffect, useRef } from 'react';
import { useEditor } from '@tiptap/react';
import type { Editor } from '@tiptap/core';
import { EDITOR_EXTENSIONS } from '../editor/extensions';

interface UseTiptapEditorArgs {
  noteId?: string;
  content: string;
  onMarkdownChange: (markdown: string) => void;
  /** 图片粘贴需在 ProseMirror 处理前接管；文字由调用方插回当前选区。 */
  onImagePaste?: (event: ClipboardEvent) => void;
}

export function useTiptapEditor({ noteId, content, onMarkdownChange, onImagePaste }: UseTiptapEditorArgs) {
  const onImagePasteRef = useRef(onImagePaste);
  onImagePasteRef.current = onImagePaste;

  const editor = useEditor({
    extensions: EDITOR_EXTENSIONS,
    content,
    onUpdate: ({ editor }) => {
      // @ts-ignore - tiptap-markdown storage typing
      const markdown = editor.storage.markdown.getMarkdown();
      onMarkdownChange(markdown);
    },
    editorProps: {
      handlePaste: (_view, event) => {
        const hasImage = Array.from(event.clipboardData?.items || []).some((item) =>
          item.type.startsWith('image/')
        );
        if (!hasImage) return false;
        onImagePasteRef.current?.(event);
        return true;
      },
      attributes: {
        class:
          'prose cursor-text focus:outline-none min-h-[300px] p-0 text-[1.05rem] text-gray-800 leading-relaxed max-w-none tiptap-editor'
      }
    }
  });

  // Sync external text changes to editor.
  // This is important because `EditorArea` uses a textarea in "source mode";
  // while the textarea is updating `content`, the hidden tiptap editor must
  // keep up so that switching to "preview mode" shows the latest text.
  useEffect(() => {
    if (!editor) return;
    const currentMarkdown = (editor.storage as { markdown?: { getMarkdown: () => string } }).markdown?.getMarkdown() ?? '';
    if (content !== currentMarkdown) {
      editor.commands.setContent(content || '');
    }
  }, [noteId, editor, content]);

  return { editor: editor as Editor | null };
}
