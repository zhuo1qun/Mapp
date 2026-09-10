import { Extension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import { Markdown } from 'tiptap-markdown';

// Custom extension to handle Feishu-like backspace behavior
export const SmartBackspace = Extension.create({
  name: 'smartBackspace',
  priority: 1100, // 极高优先级
  addKeyboardShortcuts() {
    return {
      Backspace: ({ editor }) => {
        const { selection } = editor.state;
        const { $from, empty } = selection;

        // 只有在光标处且在当前块的最开始时处理
        if (!empty || $from.parentOffset !== 0) {
          return false;
        }

        // 优先级 1: 处理列表项（飞书最常用的操作）
        if (editor.isActive('listItem')) {
          // 强制提升列表项，这会破除列表格式变回普通文本
          return editor.commands.liftListItem('listItem');
        }

        // 优先级 2: 处理标题
        if (editor.isActive('heading')) {
          return editor.commands.setParagraph();
        }

        // 优先级 3: 处理引用
        if (editor.isActive('blockquote')) {
          return editor.commands.toggleBlockquote();
        }

        return false;
      }
    };
  }
});

export const EDITOR_EXTENSIONS = [
  SmartBackspace,
  StarterKit.configure({
    heading: {
      levels: [1, 2, 3]
    }
  }),
  Link.configure({
    autolink: true,
    linkOnPaste: true,
    openOnClick: false,
    HTMLAttributes: {
      class: 'text-blue-600 underline underline-offset-2'
    }
  }),
  Markdown.configure({
    html: false,
    tightLists: true
  })
];
