import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Eye, EyeOff, GripVertical } from 'lucide-react';
import type { GraphLayerState, Note, TagVisibilityLogic } from '../../types';
import { GRAPH_UNTAGGED_TAG_GROUP } from '../../utils/graph/graphRuntimeCore';
import {
  noteBelongsToLayerGroupKey,
  normalizeTagVisibilityLogic,
  sortNotesForLayerPanelDesc,
  truncateRawTextLabel
} from '../../utils/layer/unifiedNoteLayer';
import {
  composeRenamedTagLabel,
  groupTagsByHierarchyPrefix,
  insertLayerOrderBlockRelative,
  insertLayerOrderRelative,
  tagHasHierarchySep,
  tagHierarchySuffix,
  tagRenameEditablePart
} from '../../utils/layer/tagHierarchy';
import { ChromeSegmentedControl } from '../ui/ChromeSegmentedControl';

type Props = {
  themeColor: string;
  merged: GraphLayerState;
  onStateChange: (next: GraphLayerState) => void;
  notes: Note[];
  onUpdateNote: (note: Note) => void;
  onActivateNote?: (note: Note) => void;
  /** 当前连出到右侧窗口的记录。 */
  linkedNoteId?: string | null;
  tagColorsByKey: Map<string, string[]>;
  onOpenTagColor: (tagKey: string, fromColor: string, anchor: HTMLElement) => void;
  /** 表格视图只用于浏览/编辑分组，不提供显隐筛选。 */
  showVisibilityControls?: boolean;
  /** 双击标签名批量重命名（传入完整旧键 → 完整新键） */
  onRenameTag?: (oldFullKey: string, nextFullKey: string) => void | Promise<void>;
};

/**
 * 标签图层三级：前缀（· 之前）→ 二级后缀（· 之后）→ 节点。
 * 无「 · 」的标签：一级展开后直接到节点。
 * 拖拽顺序写入 graphLayers.order（图例 / 时间线 Y 轴）。
 */
export const TagLayerHierarchyList: React.FC<Props> = ({
  themeColor,
  merged,
  onStateChange,
  notes,
  onUpdateNote,
  onActivateNote,
  linkedNoteId = null,
  tagColorsByKey,
  onOpenTagColor,
  onRenameTag,
  showVisibilityControls = true
}) => {
  const hiddenSet = useMemo(
    () => new Set((merged.hidden ?? []).map((h) => String(h).trim())),
    [merged.hidden]
  );

  const visibilityLogic = normalizeTagVisibilityLogic(merged.tagVisibilityLogic);

  const hierarchy = useMemo(
    () => groupTagsByHierarchyPrefix(merged.order ?? [], GRAPH_UNTAGGED_TAG_GROUP),
    [merged.order]
  );

  const [expandedPrefix, setExpandedPrefix] = useState<string | null>(null);
  const [expandedTag, setExpandedTag] = useState<string | null>(null);
  const [dragTagKey, setDragTagKey] = useState<string | null>(null);
  const [dragPrefixKeys, setDragPrefixKeys] = useState<string[] | null>(null);
  const [overTagKey, setOverTagKey] = useState<string | null>(null);
  const [dropPlace, setDropPlace] = useState<'before' | 'after'>('before');

  useEffect(() => {
    if (!linkedNoteId) return;
    const note = notes.find((n) => n.id === linkedNoteId);
    if (!note) return;
    for (const { prefix, tags } of hierarchy) {
      const hit = tags.find((t) => noteBelongsToLayerGroupKey(note, t, 'tag'));
      if (!hit) continue;
      setExpandedPrefix(`p:${prefix}`);
      setExpandedTag(hit);
      return;
    }
  }, [hierarchy, linkedNoteId, notes]);
  const [editingTagKey, setEditingTagKey] = useState<string | null>(null);
  const [editingTagDraft, setEditingTagDraft] = useState('');
  const cancelRenameRef = useRef(false);

  const cancelEditingTag = useCallback(() => {
    cancelRenameRef.current = true;
    setEditingTagKey(null);
    setEditingTagDraft('');
  }, []);

  const commitEditingTag = useCallback(
    async (oldKey: string, draft: string) => {
      cancelRenameRef.current = false;
      const nextFull = composeRenamedTagLabel(oldKey, draft);
      setEditingTagKey(null);
      setEditingTagDraft('');
      if (!onRenameTag) return;
      await onRenameTag(oldKey, nextFull);
    },
    [onRenameTag]
  );

  const beginEditingTag = useCallback((fullKey: string) => {
    if (!onRenameTag) return;
    if (fullKey === GRAPH_UNTAGGED_TAG_GROUP) return;
    cancelRenameRef.current = false;
    setEditingTagKey(fullKey);
    setEditingTagDraft(tagRenameEditablePart(fullKey));
  }, [onRenameTag]);

  const patch = useCallback(
    (fn: (p: GraphLayerState) => GraphLayerState) => {
      onStateChange(fn(merged));
    },
    [merged, onStateChange]
  );

  const setVisibilityLogic = (logic: TagVisibilityLogic) => {
    patch((p) => ({ ...p, tagVisibilityLogic: logic }));
  };

  const toggleHidden = (keys: string[], force?: boolean) => {
    patch((p) => {
      const h = new Set((p.hidden ?? []).map((x) => String(x).trim()));
      const allHidden = keys.every((k) => h.has(k));
      const hide = force ?? !allHidden;
      for (const k of keys) {
        if (hide) h.add(k);
        else h.delete(k);
      }
      return { ...p, hidden: [...h] };
    });
  };

  const clearDrop = () => {
    setOverTagKey(null);
  };

  const prefixColors = (tags: string[]) => {
    const colors: string[] = [];
    const seen = new Set<string>();
    for (const t of tags) {
      for (const c of tagColorsByKey.get(t) ?? []) {
        if (seen.has(c)) continue;
        seen.add(c);
        colors.push(c);
        if (colors.length >= 6) return colors;
      }
    }
    return colors;
  };

  const notesForTag = (tagKey: string) =>
    sortNotesForLayerPanelDesc(notes.filter((n) => noteBelongsToLayerGroupKey(n, tagKey, 'tag')));

  const notesForPrefix = (tags: string[]) => {
    const ids = new Set<string>();
    const out: Note[] = [];
    for (const t of tags) {
      for (const n of notesForTag(t)) {
        if (ids.has(n.id)) continue;
        ids.add(n.id);
        out.push(n);
      }
    }
    return sortNotesForLayerPanelDesc(out);
  };

  const renderNotes = (tagKey: string) => {
    const panelNotes = notesForTag(tagKey);
    return (
      <div className="chrome-content-shift-in space-y-px border-t border-gray-100/90 pb-1 pl-1 pr-1 pt-0.5">
        {panelNotes.length === 0 ? (
          <div className="px-2 py-1 text-[10px] text-gray-400">无便签</div>
        ) : (
          panelNotes.map((note) => {
            const nVisible = !note.layerItemHidden;
            return (
              <div
                key={note.id}
                data-workspace-link-source={note.id}
                className={`map-layer-note-row flex items-center gap-1 rounded-md border border-transparent px-1 py-0.5 ${
                  linkedNoteId === note.id ? 'map-layer-note-row--linked' : ''
                }`}
              >
                <div className="shrink-0 w-3.5" aria-hidden />
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left text-xs text-gray-500 hover:text-gray-700"
                  title={note.text || ''}
                  onClick={() => onActivateNote?.(note)}
                >
                  {truncateRawTextLabel(note.text || '')}
                </button>
                {showVisibilityControls ? (
                  <button
                    type="button"
                    className="shrink-0 rounded-md p-1 text-gray-500 hover:bg-gray-100"
                    aria-label={nVisible ? '隐藏节点' : '显示节点'}
                    onClick={() => onUpdateNote({ ...note, layerItemHidden: !note.layerItemHidden })}
                  >
                    {nVisible ? <Eye size={16} strokeWidth={2} /> : <EyeOff size={16} strokeWidth={2} />}
                  </button>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    );
  };

  const onTagDragOver = (e: React.DragEvent, k: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragTagKey == null && dragPrefixKeys == null) return;
    if (dragTagKey === k) return;
    if (dragPrefixKeys?.includes(k)) return;
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    setOverTagKey(k);
    setDropPlace(before ? 'before' : 'after');
  };

  const onTagDrop = (e: React.DragEvent, k: string) => {
    e.preventDefault();
    const place = dropPlace;
    const fromTag = dragTagKey;
    const fromBlock = dragPrefixKeys;
    setDragTagKey(null);
    setDragPrefixKeys(null);
    clearDrop();
    if (fromTag != null && fromTag !== k) {
      patch((p) => ({
        ...p,
        order: insertLayerOrderRelative(p.order, fromTag, k, place)
      }));
      return;
    }
    if (fromBlock != null && fromBlock.length > 0 && !fromBlock.includes(k)) {
      patch((p) => ({
        ...p,
        order: insertLayerOrderBlockRelative(p.order, fromBlock, k, place)
      }));
    }
  };

  const renderTagRow = (k: string, opts: { nested?: boolean }) => {
    const visible = !hiddenSet.has(k);
    const expanded = expandedTag === k;
    const groupNotes = notesForTag(k);
    const fullLabel = k === GRAPH_UNTAGGED_TAG_GROUP ? '无标签' : k;
    const displayLabel =
      opts.nested && k !== GRAPH_UNTAGGED_TAG_GROUP ? tagHierarchySuffix(k) : fullLabel;
    const isDragging = dragTagKey === k;
    const isOver = overTagKey === k && (dragTagKey != null || dragPrefixKeys != null) && dragTagKey !== k;
    const showLineBefore = isOver && dropPlace === 'before';
    const showLineAfter = isOver && dropPlace === 'after';

    return (
      <div key={k} className={opts.nested ? 'ml-3 border-l border-gray-100 pl-1' : undefined}>
        {showLineBefore ? (
          <div className="mx-2 h-0.5 rounded-full" style={{ backgroundColor: themeColor }} />
        ) : null}
        <div
          onDragOver={(e) => onTagDragOver(e, k)}
          onDragLeave={(e) => {
            const related = e.relatedTarget as Node | null;
            if (related && (e.currentTarget as HTMLElement).contains(related)) return;
            if (overTagKey === k) clearDrop();
          }}
          onDrop={(e) => onTagDrop(e, k)}
          className={`flex items-center gap-1 px-2 py-1 transition-[opacity,transform] ${
            isDragging ? 'opacity-45 scale-[0.98]' : ''
          } ${isOver ? 'bg-gray-50/90' : ''}`}
        >
          <button
            type="button"
            className="shrink-0 rounded-md p-0.5 text-gray-500 hover:bg-gray-100"
            aria-expanded={expanded}
            onClick={() => setExpandedTag((prev) => (prev === k ? null : k))}
          >
            {expanded ? <ChevronDown size={16} strokeWidth={2} /> : <ChevronRight size={16} strokeWidth={2} />}
          </button>
          <div
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', k);
              setDragTagKey(k);
              setDragPrefixKeys(null);
              try {
                e.dataTransfer.setDragImage(e.currentTarget, 12, 12);
              } catch {
                /* ignore */
              }
            }}
            onDragEnd={() => {
              setDragTagKey(null);
              setDragPrefixKeys(null);
              clearDrop();
            }}
            className="shrink-0 cursor-grab text-gray-400 active:cursor-grabbing"
            aria-hidden
          >
            <GripVertical size={16} strokeWidth={2} />
          </div>
          <div className="flex flex-shrink-0 items-center gap-1 pr-0.5">
            {(tagColorsByKey.get(k) ?? []).slice(0, 6).map((c) => (
              <button
                key={`${k}:${c}`}
                type="button"
                draggable={false}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenTagColor(k, c, e.currentTarget);
                }}
                className="h-3 w-3 rounded-full border border-white/90 shadow-sm transition-transform hover:scale-110"
                style={{ backgroundColor: c }}
                title={`点击切换颜色：${c}`}
              />
            ))}
          </div>
          {editingTagKey === k ? (
            <input
              autoFocus
              value={editingTagDraft}
              onChange={(e) => setEditingTagDraft(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Escape') {
                  e.preventDefault();
                  cancelEditingTag();
                  return;
                }
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void commitEditingTag(k, editingTagDraft);
                }
              }}
              onBlur={() => {
                if (cancelRenameRef.current) {
                  cancelRenameRef.current = false;
                  return;
                }
                void commitEditingTag(k, editingTagDraft);
              }}
              onClick={(e) => e.stopPropagation()}
              className="min-w-0 flex-1 truncate px-2 py-0.5 text-sm font-medium text-gray-800 border border-gray-200 rounded-md outline-none focus:ring-2"
              style={{ ['--tw-ring-color' as string]: themeColor }}
              title={editingTagDraft}
            />
          ) : (
            <span
              className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800 cursor-default"
              title={`${fullLabel}${onRenameTag && k !== GRAPH_UNTAGGED_TAG_GROUP ? '（双击重命名）' : ''}`}
              onDoubleClick={(e) => {
                e.stopPropagation();
                beginEditingTag(k);
              }}
            >
              {displayLabel}
            </span>
          )}
          <span className="shrink-0 text-[10px] text-gray-400">{groupNotes.length}</span>
          {showVisibilityControls ? (
            <button
              type="button"
              className="shrink-0 rounded-md p-1.5 text-gray-500 hover:bg-gray-100"
              aria-label={visible ? '隐藏标签' : '显示标签'}
              onClick={() => toggleHidden([k])}
            >
              {visible ? <Eye size={16} strokeWidth={2} /> : <EyeOff size={16} strokeWidth={2} />}
            </button>
          ) : null}
        </div>
        {showLineAfter ? (
          <div className="mx-2 h-0.5 rounded-full" style={{ backgroundColor: themeColor }} />
        ) : null}
        {expanded ? renderNotes(k) : null}
      </div>
    );
  };

  return (
    <>
      {showVisibilityControls ? (
        <div className="flex items-center justify-between gap-2 px-2 pb-1 pt-0.5">
          <span className="text-[10px] font-medium text-gray-400">多标签显隐</span>
          <ChromeSegmentedControl
            aria-label="标签显隐逻辑"
            size="sm"
            className="shrink-0"
            value={visibilityLogic}
            onChange={setVisibilityLogic}
            options={[
              { id: 'and', label: 'AND', title: '且：任一标签隐藏则隐藏节点' },
              { id: 'or', label: 'OR', title: '或：任一标签显示则显示节点' }
            ]}
          />
        </div>
      ) : null}

      {hierarchy.map(({ prefix, tags }) => {
        const leafOnly = tags.length === 1 && !tagHasHierarchySep(tags[0]);
        const prefixKey = `p:${prefix}`;
        const prefixOpen = expandedPrefix === prefixKey;
        const pNotes = notesForPrefix(tags);
        const allHidden = tags.every((t) => hiddenSet.has(t));
        const colors = leafOnly ? prefixColors(tags) : [];
        const prefixLabel = prefix === GRAPH_UNTAGGED_TAG_GROUP ? '无标签' : prefix;
        const dropAnchor = tags[0];
        const isPrefixDragging =
          dragPrefixKeys != null &&
          dragPrefixKeys.length === tags.length &&
          tags.every((t) => dragPrefixKeys.includes(t));
        const isOverPrefix =
          overTagKey === dropAnchor &&
          (dragTagKey != null || dragPrefixKeys != null) &&
          !isPrefixDragging &&
          dragTagKey !== dropAnchor;
        const showPrefixLineBefore = isOverPrefix && dropPlace === 'before';
        const showPrefixLineAfter = isOverPrefix && dropPlace === 'after';

        return (
          <div key={prefixKey} className="flex flex-col rounded-lg">
            {showPrefixLineBefore ? (
              <div className="mx-2 h-0.5 rounded-full" style={{ backgroundColor: themeColor }} />
            ) : null}
            <div
              onDragOver={(e) => onTagDragOver(e, dropAnchor)}
              onDragLeave={(e) => {
                const related = e.relatedTarget as Node | null;
                if (related && (e.currentTarget as HTMLElement).contains(related)) return;
                if (overTagKey === dropAnchor) clearDrop();
              }}
              onDrop={(e) => onTagDrop(e, dropAnchor)}
              className={`flex items-center gap-1 px-2 py-1 ${isPrefixDragging ? 'opacity-45' : ''} ${
                isOverPrefix ? 'bg-gray-50/90' : ''
              }`}
            >
              <button
                type="button"
                className="shrink-0 rounded-md p-0.5 text-gray-500 hover:bg-gray-100"
                aria-expanded={prefixOpen}
                onClick={() => {
                  setExpandedPrefix((prev) => (prev === prefixKey ? null : prefixKey));
                }}
              >
                {prefixOpen ? (
                  <ChevronDown size={18} strokeWidth={2} />
                ) : (
                  <ChevronRight size={18} strokeWidth={2} />
                )}
              </button>
              <div
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', prefix);
                  if (leafOnly) {
                    setDragTagKey(tags[0]);
                    setDragPrefixKeys(null);
                  } else {
                    setDragTagKey(null);
                    setDragPrefixKeys([...tags]);
                  }
                  try {
                    e.dataTransfer.setDragImage(e.currentTarget, 12, 12);
                  } catch {
                    /* ignore */
                  }
                }}
                onDragEnd={() => {
                  setDragTagKey(null);
                  setDragPrefixKeys(null);
                  clearDrop();
                }}
                className="shrink-0 cursor-grab text-gray-400 active:cursor-grabbing"
                aria-hidden
              >
                <GripVertical size={16} strokeWidth={2} />
              </div>
              {leafOnly ? (
                <div className="flex flex-shrink-0 items-center gap-1 pr-0.5">
                  {colors.map((c) => (
                    <span
                      key={`${prefix}:${c}`}
                      className="h-3 w-3 rounded-full border border-white/90 shadow-sm"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              ) : null}
              {leafOnly && editingTagKey === tags[0] ? (
                <input
                  autoFocus
                  value={editingTagDraft}
                  onChange={(e) => setEditingTagDraft(e.target.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      cancelEditingTag();
                      return;
                    }
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void commitEditingTag(tags[0], editingTagDraft);
                    }
                  }}
                  onBlur={() => {
                    if (cancelRenameRef.current) {
                      cancelRenameRef.current = false;
                      return;
                    }
                    void commitEditingTag(tags[0], editingTagDraft);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="min-w-0 flex-1 truncate px-2 py-0.5 text-sm font-semibold text-gray-800 border border-gray-200 rounded-md outline-none focus:ring-2"
                  style={{ ['--tw-ring-color' as string]: themeColor }}
                  title={editingTagDraft}
                />
              ) : (
                <span
                  className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-800 cursor-default"
                  title={
                    leafOnly && onRenameTag && tags[0] !== GRAPH_UNTAGGED_TAG_GROUP
                      ? `${prefixLabel}（双击重命名）`
                      : prefixLabel
                  }
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    if (!leafOnly) return;
                    beginEditingTag(tags[0]);
                  }}
                >
                  {prefixLabel}
                </span>
              )}
              <span className="shrink-0 text-[10px] text-gray-400">{pNotes.length}</span>
              {showVisibilityControls ? (
                <button
                  type="button"
                  className="shrink-0 rounded-md p-1.5 text-gray-500 hover:bg-gray-100"
                  aria-label={allHidden ? '显示该组标签' : '隐藏该组标签'}
                  onClick={() => toggleHidden(tags)}
                >
                  {allHidden ? <EyeOff size={18} strokeWidth={2} /> : <Eye size={18} strokeWidth={2} />}
                </button>
              ) : null}
            </div>
            {showPrefixLineAfter ? (
              <div className="mx-2 h-0.5 rounded-full" style={{ backgroundColor: themeColor }} />
            ) : null}

            {prefixOpen && leafOnly ? renderNotes(tags[0]) : null}

            {prefixOpen && !leafOnly ? (
              <div className="chrome-content-shift-in">
                {tags.map((t) => renderTagRow(t, { nested: true }))}
              </div>
            ) : null}
          </div>
        );
      })}
    </>
  );
};
