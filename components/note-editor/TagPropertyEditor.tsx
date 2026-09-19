import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Reorder } from 'framer-motion';
import type { Tag } from '../../types';
import { THEME_COLOR } from '../../constants';
import { TagChip } from '../ui/TagChip';
import { TagAddPanel } from '../ui/TagAddPanel';
import {
  computeAnchoredPanelPlacement,
  type AnchoredPanelPlacement
} from '../ui/anchoredPanelPlacement';
import type { MapChromeAppearance } from '../../utils/map/mapChromeStyle';
import { useChromeAppearance } from '../ui/chromeAppearanceContext';

interface TagPropertyEditorProps {
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
  onDismissOverlays?: () => void;
  /** 与「属性」行 + Tag 按钮共用，用于添加面板锚定 */
  addTagAnchorRef?: React.RefObject<HTMLButtonElement | null>;
  themeColor?: string;
  panelChromeStyle?: React.CSSProperties;
  chromeAppearance?: MapChromeAppearance;
}

const TAG_PANEL_EST_W = 260;
const TAG_PANEL_EST_H = 220;

/** tags Property 的编辑 UI（Registry component: TagEditor） */
export const TagPropertyEditor: React.FC<TagPropertyEditorProps> = ({
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
  onDismissOverlays,
  addTagAnchorRef,
  themeColor = THEME_COLOR,
  panelChromeStyle,
  chromeAppearance: chromeAppearanceProp
}) => {
  const chromeAppearance = useChromeAppearance(chromeAppearanceProp);
  const dismiss = onDismissOverlays ?? (() => {});
  const tagsRowRef = useRef<HTMLDivElement>(null);
  const tagPanelPortalRef = useRef<HTMLDivElement>(null);
  const [tagPanelPos, setTagPanelPos] = useState<AnchoredPanelPlacement | null>(null);

  const tagPanelOpen = isAddingTag || !!editingTagId;

  const updateTagPanelPlacement = useCallback(() => {
    // 添加：锚到属性行 + Tag；编辑：锚到标签行
    const el = (isAddingTag ? addTagAnchorRef?.current : null) ?? tagsRowRef.current;
    if (!el) return;
    const panelRect = tagPanelPortalRef.current?.getBoundingClientRect();
    const next = computeAnchoredPanelPlacement(el.getBoundingClientRect(), {
      panelWidth: panelRect?.width || TAG_PANEL_EST_W,
      panelHeight: panelRect?.height || TAG_PANEL_EST_H,
      align: isAddingTag ? 'end' : 'start',
      vertical: 'below'
    });
    setTagPanelPos((current) =>
      current?.top === next.top && current.left === next.left && current.maxHeight === next.maxHeight
        ? current
        : next
    );
  }, [addTagAnchorRef, isAddingTag]);

  useLayoutEffect(() => {
    if (!tagPanelOpen) {
      setTagPanelPos(null);
      return;
    }
    updateTagPanelPlacement();
  }, [tagPanelOpen, tags.length, updateTagPanelPlacement]);

  useEffect(() => {
    if (!tagPanelOpen) return;
    const onReposition = () => updateTagPanelPlacement();
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [tagPanelOpen, updateTagPanelPlacement]);

  useLayoutEffect(() => {
    if (!tagPanelOpen || !tagPanelPos || !tagPanelPortalRef.current) return;
    const panel = tagPanelPortalRef.current;
    const anchor = (isAddingTag ? addTagAnchorRef?.current : null) ?? tagsRowRef.current;
    const observer = new ResizeObserver(updateTagPanelPlacement);
    observer.observe(panel);
    if (anchor) observer.observe(anchor);
    updateTagPanelPlacement();
    return () => observer.disconnect();
  }, [addTagAnchorRef, isAddingTag, tagPanelOpen, tagPanelPos, updateTagPanelPlacement]);

  const renderTagChip = (tag: Tag, opts?: { className?: string }) => (
    <TagChip
      label={tag.label}
      color={tag.color}
      className={opts?.className}
      onClick={() => {
        dismiss();
        onEditTag(tag);
      }}
      onRemove={() => {
        dismiss();
        onRemoveTag(tag.id);
      }}
    />
  );

  return (
    <div className="px-4 pt-0 pb-3 flex flex-col gap-2">
      {tags.length === 0 && !editingTagId ? (
        <div ref={tagsRowRef} className="pt-1 text-[11px] text-gray-300">
          暂无标签
        </div>
      ) : (
        <div
          ref={tagsRowRef}
          className="flex min-w-0 gap-2 overflow-x-auto scrollbar-hide items-center touch-pan-x"
        >
          {editingTagId ? (
            tags
              .filter((t) => t.id !== editingTagId)
              .map((tag) => (
                <div key={tag.id} className="shrink-0">
                  {renderTagChip(tag)}
                </div>
              ))
          ) : tags.length > 1 ? (
            <Reorder.Group
              axis="x"
              values={tags}
              onReorder={onReorderTags}
              as="div"
              style={{
                display: 'flex',
                flexDirection: 'row',
                flexWrap: 'nowrap',
                alignItems: 'center',
                gap: '0.5rem'
              }}
            >
              {tags.map((tag) => (
                <Reorder.Item
                  key={tag.id}
                  value={tag}
                  className="flex-shrink-0 list-none"
                  layout="position"
                  transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                  whileDrag={{
                    scale: 1.04,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
                    zIndex: 20,
                    cursor: 'grabbing'
                  }}
                  style={{ cursor: 'grab' }}
                >
                  {renderTagChip(tag, { className: 'cursor-grab active:cursor-grabbing' })}
                </Reorder.Item>
              ))}
            </Reorder.Group>
          ) : (
            tags.map((tag) => (
              <div key={tag.id} className="shrink-0">
                {renderTagChip(tag)}
              </div>
            ))
          )}
        </div>
      )}

      {tagPanelOpen && tagPanelPos != null && (
        <TagAddPanel
          themeColor={themeColor}
          panelChromeStyle={panelChromeStyle}
          chromeAppearance={chromeAppearance}
          title={editingTagId ? '编辑标签' : '添加标签'}
          label={newTagLabel}
          onLabelChange={setNewTagLabel}
          selectedColor={newTagColor}
          onColorChange={setNewTagColor}
          onApply={onSaveTag}
          onDismissOutside={onSaveTag}
          portalPlacement={tagPanelPos}
          portalBackdrop
          portalPanelRef={tagPanelPortalRef}
          autoFocus
          onInputKeyDown={(e) => {
            if (e.key === 'Enter') onSaveTag();
            if (e.key === 'Escape') onCancelTagEdit();
          }}
        />
      )}
    </div>
  );
};
