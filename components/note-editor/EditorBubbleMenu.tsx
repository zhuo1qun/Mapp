import React, { useCallback } from 'react';
import type { Editor } from '@tiptap/core';
import { BubbleMenu } from '@tiptap/react/menus';
import { Bold, Heading1, Heading2, Italic, Link, List, ListOrdered } from 'lucide-react';

interface EditorBubbleMenuProps {
  editor: Editor;
}

type ControlProps = {
  active?: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
};

function Control({ active = false, label, onClick, children }: ControlProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
        active ? 'bg-gray-200 text-gray-900' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
      }`}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** 仅在存在文本选区时显示，避免干扰普通输入。 */
export function EditorBubbleMenu({ editor }: EditorBubbleMenuProps) {
  const setLink = useCallback(() => {
    const previousUrl = editor.getAttributes('link').href || '';
    const input = window.prompt('链接地址', previousUrl);
    if (input === null) return;

    const url = input.trim();
    if (!url) {
      editor.chain().focus().unsetLink().run();
      return;
    }

    const normalized = /^[a-z][a-z\d+.-]*:/i.test(url) ? url : `https://${url}`;
    editor.chain().focus().extendMarkRange('link').setLink({ href: normalized }).run();
  }, [editor]);

  return (
    <BubbleMenu
      editor={editor}
      pluginKey="note-editor-selection-menu"
      updateDelay={80}
      appendTo={() => document.body}
      options={{ strategy: 'fixed', placement: 'top', offset: 8 }}
      shouldShow={({ state, from, to }) => state.selection.empty === false && from !== to}
      className="note-editor-transient-layer flex items-center gap-0.5 rounded-lg border border-gray-200 bg-white p-1 shadow-lg"
    >
      <Control
        label="加粗"
        active={editor.isActive('bold')}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold size={15} strokeWidth={2.2} />
      </Control>
      <Control
        label="斜体"
        active={editor.isActive('italic')}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic size={15} strokeWidth={2.2} />
      </Control>
      <Control label="链接" active={editor.isActive('link')} onClick={setLink}>
        <Link size={15} strokeWidth={2.2} />
      </Control>
      <span className="mx-0.5 h-4 w-px bg-gray-200" aria-hidden />
      <Control
        label="一级标题"
        active={editor.isActive('heading', { level: 1 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
      >
        <Heading1 size={15} strokeWidth={2.2} />
      </Control>
      <Control
        label="二级标题"
        active={editor.isActive('heading', { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <Heading2 size={15} strokeWidth={2.2} />
      </Control>
      <Control
        label="无序列表"
        active={editor.isActive('bulletList')}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List size={15} strokeWidth={2.2} />
      </Control>
      <Control
        label="有序列表"
        active={editor.isActive('orderedList')}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered size={15} strokeWidth={2.2} />
      </Control>
    </BubbleMenu>
  );
}
