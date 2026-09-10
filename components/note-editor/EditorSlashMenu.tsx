import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { Code2, Heading1, Heading2, List, ListOrdered, MessageSquareQuote } from 'lucide-react';

interface EditorSlashMenuProps {
  editor: Editor;
}

type SlashMenuState = {
  from: number;
  to: number;
  query: string;
  x: number;
  y: number;
};

type CommandId = 'heading1' | 'heading2' | 'bulletList' | 'orderedList' | 'blockquote' | 'codeBlock';

const COMMANDS: Array<{
  id: CommandId;
  label: string;
  keywords: string[];
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
}> = [
  { id: 'heading1', label: '一级标题', keywords: ['h1', 'heading', 'title', '标题'], icon: Heading1 },
  { id: 'heading2', label: '二级标题', keywords: ['h2', 'heading', 'subtitle', '标题'], icon: Heading2 },
  { id: 'bulletList', label: '无序列表', keywords: ['list', 'bullet', '列表'], icon: List },
  { id: 'orderedList', label: '有序列表', keywords: ['list', 'ordered', '数字', '列表'], icon: ListOrdered },
  { id: 'blockquote', label: '引用', keywords: ['quote', 'blockquote', '引用'], icon: MessageSquareQuote },
  { id: 'codeBlock', label: '代码块', keywords: ['code', 'codeblock', '代码'], icon: Code2 }
];

function getSlashMenuState(editor: Editor): SlashMenuState | null {
  const { from, empty } = editor.state.selection;
  if (!editor.isFocused || !empty || editor.isActive('codeBlock')) return null;

  const $from = editor.state.doc.resolve(from);
  const beforeCursor = $from.parent.textBetween(0, $from.parentOffset, '\0', '\0');
  const match = beforeCursor.match(/(?:^|\s)\/([^\s/]*)$/);
  if (!match) return null;

  const query = match[1];
  const coords = editor.view.coordsAtPos(from);
  return {
    from: from - query.length - 1,
    to: from,
    query,
    x: coords.left,
    y: coords.bottom + 8
  };
}

/** 轻量 `/` 块菜单；保留 Markdown 输入规则，二者可以混用。 */
export function EditorSlashMenu({ editor }: EditorSlashMenuProps) {
  const [menu, setMenu] = useState<SlashMenuState | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const visibleCommands = useMemo(() => {
    if (!menu) return [];
    const query = menu.query.toLocaleLowerCase();
    if (!query) return COMMANDS;
    return COMMANDS.filter((command) =>
      [command.label, ...command.keywords].some((value) => value.toLocaleLowerCase().includes(query))
    );
  }, [menu]);

  const syncMenu = useCallback(() => {
    setMenu(getSlashMenuState(editor));
  }, [editor]);

  useEffect(() => {
    editor.on('update', syncMenu);
    editor.on('selectionUpdate', syncMenu);
    editor.on('focus', syncMenu);
    editor.on('blur', syncMenu);
    return () => {
      editor.off('update', syncMenu);
      editor.off('selectionUpdate', syncMenu);
      editor.off('focus', syncMenu);
      editor.off('blur', syncMenu);
    };
  }, [editor, syncMenu]);

  useEffect(() => {
    setActiveIndex(0);
  }, [menu?.query]);

  const runCommand = useCallback(
    (id: CommandId) => {
      if (!menu) return;
      editor.chain().focus().deleteRange({ from: menu.from, to: menu.to }).run();
      const chain = editor.chain().focus();
      if (id === 'heading1') chain.toggleHeading({ level: 1 }).run();
      if (id === 'heading2') chain.toggleHeading({ level: 2 }).run();
      if (id === 'bulletList') chain.toggleBulletList().run();
      if (id === 'orderedList') chain.toggleOrderedList().run();
      if (id === 'blockquote') chain.toggleBlockquote().run();
      if (id === 'codeBlock') chain.toggleCodeBlock().run();
      setMenu(null);
    },
    [editor, menu]
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!menu || visibleCommands.length === 0) return;
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex((index) => (index + 1) % visibleCommands.length);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((index) => (index - 1 + visibleCommands.length) % visibleCommands.length);
      } else if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        runCommand(visibleCommands[activeIndex]?.id || visibleCommands[0].id);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        setMenu(null);
      }
    };
    editor.view.dom.addEventListener('keydown', onKeyDown);
    return () => editor.view.dom.removeEventListener('keydown', onKeyDown);
  }, [activeIndex, editor, menu, runCommand, visibleCommands]);

  if (!menu || visibleCommands.length === 0) return null;

  return (
    <div
      className="fixed z-[1100] w-52 overflow-hidden rounded-lg border border-gray-200 bg-white p-1 shadow-xl"
      style={{ left: Math.min(menu.x, window.innerWidth - 224), top: menu.y }}
      role="listbox"
      aria-label="插入内容"
    >
      {visibleCommands.map((command, index) => {
        const Icon = command.icon;
        return (
          <button
            key={command.id}
            type="button"
            role="option"
            aria-selected={index === activeIndex}
            className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors ${
              index === activeIndex ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-50'
            }`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => runCommand(command.id)}
          >
            <Icon size={16} strokeWidth={2} />
            {command.label}
          </button>
        );
      })}
    </div>
  );
}
