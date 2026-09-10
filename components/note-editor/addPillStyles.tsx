import React from 'react';

/** NoteEditor「+ Tag / + Emoji / 时间 / 媒体添加」统一胶囊按钮样式 */
export const NOTE_EDITOR_ADD_PILL_CLASS =
  'group flex-shrink-0 h-9 min-h-9 px-2.5 rounded-full text-xs font-semibold inline-flex items-center justify-center cursor-pointer active:scale-95 transition-[colors,transform] border-0';

export const NOTE_EDITOR_ADD_PILL_ACTIVE =
  'text-gray-700 bg-black/[0.08]';

export const NOTE_EDITOR_ADD_PILL_IDLE =
  'text-gray-700 hover:text-gray-900 hover:bg-black/5';

/** 默认折叠文案；hover / active / focus-visible / expanded 时展开 */
export function NoteEditorAddPillLabel({
  children,
  expanded = false
}: {
  children: React.ReactNode;
  /** 面板打开等按下态：强制显示文案 */
  expanded?: boolean;
}) {
  return (
    <span className={`note-editor-add-pill-label${expanded ? ' is-expanded' : ''}`}>
      <span className="note-editor-add-pill-label-clip">
        <span className="note-editor-add-pill-label-text">{children}</span>
      </span>
    </span>
  );
}
