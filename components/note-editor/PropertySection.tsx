import React, { useRef } from 'react';
import { Tag as TagIcon } from 'lucide-react';
import type { Tag } from '../../types';
import { NoteTimeRangeControl } from './NoteTimeRangeControl';
import { TagPropertyEditor } from './TagPropertyEditor';
import {
  NOTE_EDITOR_ADD_PILL_ACTIVE,
  NOTE_EDITOR_ADD_PILL_CLASS,
  NOTE_EDITOR_ADD_PILL_IDLE,
  NoteEditorAddPillLabel
} from './addPillStyles';
import type { MapChromeAppearance } from '../../utils/map/mapChromeStyle';
import { useChromeAppearance } from '../ui/chromeAppearanceContext';

interface PropertySectionProps {
  standalone?: boolean;
  startYear?: number;
  endYear?: number;
  onTimeChange: (next: { startYear?: number; endYear?: number }) => void;
  themeColor: string;
  panelChromeStyle?: React.CSSProperties;
  chromeAppearance?: MapChromeAppearance;
  active: boolean;
  onProvideTimeDismiss?: (dismiss: () => void) => void;

  tags: Tag[];
  editingTagId: string | null;
  isAddingTag: boolean;
  newTagLabel: string;
  newTagColor: string;
  setNewTagLabel: (v: string) => void;
  setNewTagColor: (v: string) => void;
  onEditTag: (tag: Tag) => void;
  onRemoveTag: (id: string) => void;
  onReorderTags: (next: Tag[]) => void;
  onSaveTag: () => void;
  onCancelTagEdit: () => void;
  onStartAddTag: () => void;
  onDismissOverlays?: () => void;
  /** 打开时间面板前关闭其它浮层 */
  onBeforeOpenTime?: () => void;

  /** emoji 等附加操作（与 Tag / 时间同一行） */
  trailingSlot?: React.ReactNode;
}

/** Properties：emoji / tags / time（经 Registry 语义；组件复用现有控件） */
export const PropertySection: React.FC<PropertySectionProps> = ({
  standalone = false,
  startYear,
  endYear,
  onTimeChange,
  themeColor,
  panelChromeStyle,
  chromeAppearance: chromeAppearanceProp,
  active,
  onProvideTimeDismiss,
  tags,
  editingTagId,
  isAddingTag,
  newTagLabel,
  newTagColor,
  setNewTagLabel,
  setNewTagColor,
  onEditTag,
  onRemoveTag,
  onReorderTags,
  onSaveTag,
  onCancelTagEdit,
  onStartAddTag,
  onDismissOverlays,
  onBeforeOpenTime,
  trailingSlot
}) => {
  const chromeAppearance = useChromeAppearance(chromeAppearanceProp);
  const addTagBtnRef = useRef<HTMLButtonElement>(null);
  const dismiss = onDismissOverlays ?? (() => {});

  return (
    <section
      className={`relative flex shrink-0 flex-col ${
        standalone ? '' : 'before:absolute before:top-0 before:left-3 before:right-3 before:border-t before:border-gray-400/50'
      }`}
      aria-label="属性"
    >
      <div className="px-4 pt-2 pb-1 flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wide shrink-0">
          属性
        </span>
        <div className="flex items-center gap-1 shrink-0 min-w-0">
          {editingTagId ? null : (
            <button
              ref={addTagBtnRef}
              type="button"
              onClick={() => {
                if (isAddingTag) {
                  onCancelTagEdit();
                  return;
                }
                dismiss();
                onStartAddTag();
              }}
              className={`${NOTE_EDITOR_ADD_PILL_CLASS} ${
                isAddingTag ? NOTE_EDITOR_ADD_PILL_ACTIVE : NOTE_EDITOR_ADD_PILL_IDLE
              }`}
              title="添加标签"
              aria-expanded={isAddingTag}
            >
              <NoteEditorAddPillLabel expanded={isAddingTag}>+ Tag</NoteEditorAddPillLabel>
              <TagIcon size={14} strokeWidth={2} className="shrink-0" aria-hidden />
            </button>
          )}
          {trailingSlot}
          <NoteTimeRangeControl
            startYear={startYear}
            endYear={endYear}
            onChange={onTimeChange}
            themeColor={themeColor}
            panelChromeStyle={panelChromeStyle}
            chromeAppearance={chromeAppearance}
            active={active}
            onProvideDismiss={onProvideTimeDismiss}
            onBeforeOpen={onBeforeOpenTime}
          />
        </div>
      </div>
      <TagPropertyEditor
        tags={tags}
        editingTagId={editingTagId}
        isAddingTag={isAddingTag}
        newTagLabel={newTagLabel}
        newTagColor={newTagColor}
        setNewTagLabel={setNewTagLabel}
        setNewTagColor={setNewTagColor}
        onEditTag={onEditTag}
        onRemoveTag={onRemoveTag}
        onReorderTags={onReorderTags}
        onSaveTag={onSaveTag}
        onCancelTagEdit={onCancelTagEdit}
        onDismissOverlays={onDismissOverlays}
        addTagAnchorRef={addTagBtnRef}
        themeColor={themeColor}
        panelChromeStyle={panelChromeStyle}
        chromeAppearance={chromeAppearance}
      />
    </section>
  );
};
