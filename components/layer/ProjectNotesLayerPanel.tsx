import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Frame as FrameIcon,
  GripVertical,
  Tag as TagIcon
} from 'lucide-react';
import { TAG_COLORS } from '../../constants';
import type { Frame, GraphLayerState, Note } from '../../types';
import {
  GRAPH_LAYER_WEIGHT_MAX,
  GRAPH_LAYER_WEIGHT_MIN,
  GRAPH_UNTAGGED_TAG_GROUP,
  type GraphLayerGroupStandard
} from '../../utils/graph/graphRuntimeCore';
import {
  groupDisplayLabel,
  noteBelongsToLayerGroupKey,
  sortNotesForLayerPanelDesc,
  truncateRawTextLabel
} from '../../utils/layer/unifiedNoteLayer';
import { SettingsCompactSlider } from '../ui/SettingsCompactSlider';
import { TagAddPanel } from '../ui/TagAddPanel';
import { NoteTimeRangeControl } from '../note-editor/NoteTimeRangeControl';
import { TagLayerHierarchyList } from './TagLayerHierarchyList';
import { ChromeSegmentedControl } from '../ui/ChromeSegmentedControl';
import {
  emojiFromLayerTagKey,
  emojiToLayerTagKey,
  insertLayerOrderRelative
} from '../../utils/layer/tagHierarchy';
import { useChromeMenuTop } from '../../utils/ui/chromeMenuPosition';
import type { MapChromeAppearance } from '../../utils/map/mapChromeStyle';

function insertRelative(order: string[], fromKey: string, toKey: string, place: 'before' | 'after'): string[] {
  return insertLayerOrderRelative(order, fromKey, toKey, place);
}

function normalizeTagLabel(v: string | undefined | null): string {
  return String(v ?? '').trim();
}

function accordionStorageKey(projectId: string, standard: GraphLayerGroupStandard): string {
  return `unifiedNotesLayerAccordion:v1:${projectId}:${standard}`;
}

export interface ProjectNotesLayerPanelProps {
  themeColor: string;
  panelChromeStyle?: React.CSSProperties;
  chromeAppearance?: MapChromeAppearance;
  variant?: 'graph' | 'dock';
  projectId: string;
  merged: GraphLayerState;
  layerGroupStandard: GraphLayerGroupStandard;
  onLayerGroupStandardChange: (standard: GraphLayerGroupStandard) => void;
  onStateChange: (next: GraphLayerState) => void;
  notes: Note[];
  onUpdateNote: (note: Note) => void;
  onBatchUpdateNotes?: (nextNotes: Note[]) => void | Promise<void>;
  frames: Frame[];
  onActivateNote?: (note: Note) => void;
  boardVariantToggles?: {
    primary: boolean;
    image: boolean;
    onChange: (next: { primary: boolean; image: boolean }) => void;
  };
  /** Table 等：嵌入滚动区，不用 absolute 下拉 */
  embed?: boolean;
  /**
   * 由父级负责定位（如顶栏 absolute left-0 / MapLayerControl 门户内），
   * 面板自身不再 absolute/fixed。
   */
  flow?: boolean;
  /** 非 flow 时：`start` 对齐页面左侧，`end` 对齐页面右侧（与顶栏按钮 margin 一致） */
  dockAlign?: 'start' | 'end';
  /** flow=false 时用于计算菜单 top 的锚点（通常为图层按钮容器） */
  menuAnchorRef?: React.RefObject<HTMLElement | null>;
  /** Table：点位记录不显示显隐，展示所有 tag + 时间；双击组名重命名在各视图均可用 */
  tableMode?: boolean;
  /** 重命名 frame（更新 project.frames.title）；缺省时可用 onUpdateFrame */
  onUpdateFrameTitle?: (frameId: string, nextTitle: string) => void;
  /** 更新整簇（如图谱面板改 Frame.color） */
  onUpdateFrame?: (frame: Frame) => void;
  /** 隐藏面板内 tag/frame 切换条（图谱顶栏已拆成两钮时） */
  hideStandardToggle?: boolean;
}

export const ProjectNotesLayerPanel: React.FC<ProjectNotesLayerPanelProps> = ({
  themeColor,
  panelChromeStyle,
  chromeAppearance = 'light',
  variant: _layerPanelVariant = 'dock',
  projectId,
  merged,
  layerGroupStandard,
  onLayerGroupStandardChange,
  onStateChange,
  notes,
  onUpdateNote,
  onBatchUpdateNotes,
  frames,
  onActivateNote,
  boardVariantToggles,
  embed = false,
  flow = false,
  dockAlign = 'start',
  menuAnchorRef,
  tableMode = false,
  onUpdateFrameTitle,
  onUpdateFrame,
  hideStandardToggle = false
}) => {
  const hiddenSet = new Set((merged.hidden ?? []).map((h) => String(h).trim()));
  const keysSet = useMemo(() => new Set((merged.order ?? []).map((k) => String(k).trim())), [merged.order]);
  const framesById = useMemo(() => new Map(frames.map((f) => [String(f.id).trim(), f])), [frames]);

  const tagColorsByKey = useMemo(() => {
    if (layerGroupStandard !== 'tag') return new Map<string, string[]>();
    const map = new Map<string, string[]>();
    const seenColorSetByKey = new Map<string, Set<string>>();

    for (const note of notes) {
      for (const t of note.tags ?? []) {
        const label = normalizeTagLabel(t.label);
        if (!keysSet.has(label)) continue;
        const c = t.color;
        if (!map.has(label)) {
          map.set(label, []);
          seenColorSetByKey.set(label, new Set());
        }
        const seen = seenColorSetByKey.get(label)!;
        if (!seen.has(c)) {
          seen.add(c);
          map.get(label)!.push(c);
        }
      }
    }

    return map;
  }, [notes, keysSet, layerGroupStandard]);

  const frameColorsByKey = useMemo(() => {
    if (layerGroupStandard !== 'frame') return new Map<string, string[]>();
    const map = new Map<string, string[]>();
    for (const f of frames) {
      const id = String(f.id).trim();
      if (!keysSet.has(id)) continue;
      map.set(id, [f.color]);
    }
    return map;
  }, [frames, keysSet, layerGroupStandard]);

  type TagColorBatchEditor = {
    tagLabelKey: string;
    fromColor: string;
    toColor: string;
    portalPlacement: { top: number; left: number };
  };
  const [tagColorBatchEditor, setTagColorBatchEditor] = useState<TagColorBatchEditor | null>(null);

  type FrameColorEditor = {
    frameId: string;
    fromColor: string;
    toColor: string;
    portalPlacement: { top: number; left: number };
  };
  const [frameColorEditor, setFrameColorEditor] = useState<FrameColorEditor | null>(null);

  const openFrameColorEditor = useCallback(
    (frameId: string, fromColor: string, anchorEl: HTMLElement) => {
      if (layerGroupStandard !== 'frame' || !onUpdateFrame) return;
      const rect = anchorEl.getBoundingClientRect();
      const TAG_PANEL_EST_W = 260;
      const TAG_PANEL_EST_H = 220;
      const gap = 8;
      let top = rect.bottom + gap;
      const spaceBelow = window.innerHeight - rect.bottom;
      if (spaceBelow < TAG_PANEL_EST_H && rect.top > TAG_PANEL_EST_H + gap) {
        top = rect.top - TAG_PANEL_EST_H - gap;
      }
      let left = rect.left;
      left = Math.max(8, Math.min(left, window.innerWidth - TAG_PANEL_EST_W - 8));
      const idx = TAG_COLORS.indexOf(fromColor);
      const defaultToColor = idx >= 0 ? TAG_COLORS[(idx + 1) % TAG_COLORS.length] : TAG_COLORS[0];
      setFrameColorEditor({
        frameId,
        fromColor,
        toColor: defaultToColor,
        portalPlacement: { top, left }
      });
    },
    [layerGroupStandard, onUpdateFrame]
  );

  const applyFrameColorChange = useCallback(
    (frameId: string, toColor: string) => {
      if (!onUpdateFrame) return;
      const frame = framesById.get(String(frameId).trim());
      if (!frame || frame.color === toColor) return;
      onUpdateFrame({ ...frame, color: toColor });
    },
    [framesById, onUpdateFrame]
  );

  const openTagColorBatchEditor = useCallback(
    (tagLabelKey: string, fromColor: string, anchorEl: HTMLElement) => {
      if (layerGroupStandard !== 'tag') return;
      const rect = anchorEl.getBoundingClientRect();
      const TAG_PANEL_EST_W = 260;
      const TAG_PANEL_EST_H = 220;
      const gap = 8;
      let top = rect.bottom + gap;
      const spaceBelow = window.innerHeight - rect.bottom;
      if (spaceBelow < TAG_PANEL_EST_H && rect.top > TAG_PANEL_EST_H + gap) {
        top = rect.top - TAG_PANEL_EST_H - gap;
      }
      let left = rect.left;
      left = Math.max(8, Math.min(left, window.innerWidth - TAG_PANEL_EST_W - 8));

      const idx = TAG_COLORS.indexOf(fromColor);
      const defaultToColor = idx >= 0 ? TAG_COLORS[(idx + 1) % TAG_COLORS.length] : TAG_COLORS[0];

      setTagColorBatchEditor({
        tagLabelKey,
        fromColor,
        toColor: defaultToColor,
        portalPlacement: { top, left }
      });
    },
    [layerGroupStandard]
  );

  const applyBatchTagColorChange = useCallback(
    async (tagLabelKey: string, fromColor: string, toColor: string) => {
      if (layerGroupStandard !== 'tag') return;
      if (toColor === fromColor) return;

      const nextNotes = notes.map((note) => {
        let changed = false;
        const nextTags = (note.tags ?? []).map((t) => {
          const label = normalizeTagLabel(t.label);
          if (label === tagLabelKey && t.color === fromColor) {
            changed = true;
            return { ...t, color: toColor };
          }
          return t;
        });
        return changed ? { ...note, tags: nextTags } : note;
      });

      if (onBatchUpdateNotes) {
        await onBatchUpdateNotes(nextNotes);
        return;
      }

      for (let i = 0; i < nextNotes.length; i++) {
        const nextNote = nextNotes[i];
        const origNote = notes[i];
        if (nextNote === origNote) continue;
        await Promise.resolve(onUpdateNote(nextNote));
      }
    },
    [layerGroupStandard, notes, onUpdateNote, onBatchUpdateNotes]
  );

  const [expandedGroupKey, setExpandedGroupKey] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) {
      setExpandedGroupKey(null);
      return;
    }
    try {
      const raw = localStorage.getItem(accordionStorageKey(projectId, layerGroupStandard));
      if (raw == null || raw === 'null') {
        setExpandedGroupKey(null);
        return;
      }
      const parsed = JSON.parse(raw) as string | null;
      setExpandedGroupKey(typeof parsed === 'string' ? parsed : null);
    } catch {
      setExpandedGroupKey(null);
    }
  }, [projectId, layerGroupStandard]);

  const persistExpanded = useCallback(
    (key: string | null) => {
      setExpandedGroupKey(key);
      if (!projectId) return;
      try {
        localStorage.setItem(accordionStorageKey(projectId, layerGroupStandard), JSON.stringify(key));
      } catch {
        /* ignore */
      }
    },
    [projectId, layerGroupStandard]
  );

  const toggleAccordion = useCallback(
    (rowKey: string) => {
      persistExpanded(expandedGroupKey === rowKey ? null : rowKey);
    },
    [expandedGroupKey, persistExpanded]
  );

  const [dragKey, setDragKey] = useState<string | null>(null);
  const [weightOpenKey, setWeightOpenKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const [dropPlace, setDropPlace] = useState<'before' | 'after'>('before');

  const [dragNoteId, setDragNoteId] = useState<string | null>(null);
  const [overNoteId, setOverNoteId] = useState<string | null>(null);
  const [noteDropPlace, setNoteDropPlace] = useState<'before' | 'after'>('before');

  // Table：双击组名内联重命名（不额外打开浮层）
  const [editingGroupKey, setEditingGroupKey] = useState<string | null>(null);
  const [editingGroupDraft, setEditingGroupDraft] = useState<string>('');
  const cancelRenameRef = useRef(false);

  type TableTagEditDraft = {
    noteId: string;
    tagIndex: number;
    draftLabel: string;
    draftColor: string;
    portalPlacement: { top: number; left: number };
  };
  const [tableTagEditDraft, setTableTagEditDraft] = useState<TableTagEditDraft | null>(null);

  const cancelEditingGroup = useCallback(() => {
    cancelRenameRef.current = true;
    setEditingGroupKey(null);
    setEditingGroupDraft('');
  }, []);

  const toTagGroupKey = useCallback(
    (label: string | undefined) => {
      const s = String(label ?? '').trim();
      return s === '' ? GRAPH_UNTAGGED_TAG_GROUP : s;
    },
    []
  );

  const openTableTagEditPanel = useCallback(
    (noteId: string, tagIndex: number, t: { label: string; color?: string }, anchorEl: HTMLElement) => {
      const rect = anchorEl.getBoundingClientRect();
      const TAG_PANEL_EST_W = 260;
      const TAG_PANEL_EST_H = 220;
      const gap = 8;

      let top = rect.bottom + gap;
      const spaceBelow = window.innerHeight - rect.bottom;
      if (spaceBelow < TAG_PANEL_EST_H && rect.top > TAG_PANEL_EST_H + gap) {
        top = rect.top - TAG_PANEL_EST_H - gap;
      }

      let left = rect.left;
      left = Math.max(8, Math.min(left, window.innerWidth - TAG_PANEL_EST_W - 8));

      const color = t.color != null && TAG_COLORS.includes(t.color) ? t.color : TAG_COLORS[0];

      setTableTagEditDraft({
        noteId,
        tagIndex,
        draftLabel: t.label ?? '',
        draftColor: color,
        portalPlacement: { top, left }
      });
    },
    []
  );

  const patch = useCallback(
    (fn: (prev: GraphLayerState) => GraphLayerState) => {
      onStateChange(fn(merged));
    },
    [merged, onStateChange]
  );

  const renameTagLayerKeyInState = useCallback(
    (oldKey: string, nextKey: string) => {
      if (oldKey === nextKey) return;
      patch((p) => {
        const dedupePreserveOrder = (arr: string[]) => {
          const seen = new Set<string>();
          const out: string[] = [];
          for (const x of arr) {
            const v = String(x).trim();
            if (seen.has(v)) continue;
            seen.add(v);
            out.push(v);
          }
          return out;
        };

        const nextOrder = dedupePreserveOrder(
          (p.order ?? []).map((k) => (String(k).trim() === oldKey ? nextKey : String(k).trim()))
        );
        const nextHidden = dedupePreserveOrder(
          (p.hidden ?? []).map((k) => (String(k).trim() === oldKey ? nextKey : String(k).trim()))
        );

        const nextWeights =
          p.weights == null
            ? p.weights
            : (() => {
                const w = { ...p.weights };
                if (w[oldKey] != null) {
                  if (w[nextKey] == null) w[nextKey] = w[oldKey];
                  delete w[oldKey];
                }
                return w;
              })();

        return { ...p, order: nextOrder, hidden: nextHidden, weights: nextWeights };
      });
    },
    [patch]
  );

  /** 批量重命名标签（所有便签上匹配的 tag.label）；旧键迁移 order/hidden/weights */
  const applyRenameTagGroup = useCallback(
    async (oldKey: string, nextKey: string) => {
      const oldK = String(oldKey).trim();
      const newK = String(nextKey).trim();
      if (!newK || oldK === newK) return;
      if (oldK === '' || oldK === GRAPH_UNTAGGED_TAG_GROUP) return;
      if (newK === '' || newK === GRAPH_UNTAGGED_TAG_GROUP) return;

      const updatedNotes: Note[] = [];
      for (const note of notes) {
        const tags = note.tags ?? [];
        let changed = false;
        const nextTags = tags.map((t) => {
          if (normalizeTagLabel(t.label) === oldK) {
            changed = true;
            return { ...t, label: newK };
          }
          return t;
        });
        // emoji 图层键：`【emoji】 · 🔥` ↔ note.emoji
        let nextEmoji = note.emoji;
        const currentEmojiKey = emojiToLayerTagKey(note.emoji ?? '');
        if (currentEmojiKey === oldK) {
          const nextFromKey = emojiFromLayerTagKey(newK);
          nextEmoji = nextFromKey ?? '';
          changed = true;
        }
        if (changed) updatedNotes.push({ ...note, tags: nextTags, emoji: nextEmoji });
      }

      if (updatedNotes.length > 0) {
        if (onBatchUpdateNotes) {
          const byId = new Map(updatedNotes.map((n) => [n.id, n]));
          await onBatchUpdateNotes(notes.map((n) => byId.get(n.id) ?? n));
        } else {
          updatedNotes.forEach((n) => void onUpdateNote(n));
        }
      }

      renameTagLayerKeyInState(oldK, newK);
    },
    [notes, onBatchUpdateNotes, onUpdateNote, renameTagLayerKeyInState]
  );

  const applyRenameFrameGroup = useCallback(
    async (oldFrameId: string, nextTitle: string) => {
      if (!onUpdateFrameTitle && !onUpdateFrame) return;
      const oldId = String(oldFrameId).trim();
      const newTitleTrim = String(nextTitle).trim();
      if (!oldId || !newTitleTrim) return;

      const oldTitle = framesById.get(oldId)?.title ?? oldId;

      if (onUpdateFrameTitle) {
        await onUpdateFrameTitle(oldId, newTitleTrim);
      } else if (onUpdateFrame) {
        const f = framesById.get(oldId);
        if (!f) return;
        onUpdateFrame({ ...f, title: newTitleTrim });
      }

      const affectedNotes = notes.filter((n) => noteBelongsToLayerGroupKey(n, oldId, 'frame'));
      if (affectedNotes.length > 0) {
        const updatedNotes = affectedNotes.map((note) => {
          const nextGroupNames =
            note.groupNames?.length != null
              ? note.groupNames?.map((name) => (name === oldTitle ? newTitleTrim : name))
              : note.groupNames;
          const nextGroupName = note.groupName === oldTitle ? newTitleTrim : note.groupName;
          return { ...note, groupNames: nextGroupNames, groupName: nextGroupName };
        });

        if (onBatchUpdateNotes) {
          await onBatchUpdateNotes(
            notes.map((n) => updatedNotes.find((u) => u.id === n.id) ?? n)
          );
        } else {
          updatedNotes.forEach((n) => void onUpdateNote(n));
        }
      }
    },
    [framesById, notes, onBatchUpdateNotes, onUpdateFrame, onUpdateFrameTitle, onUpdateNote]
  );

  const commitEditingGroup = useCallback(
    async (oldKey: string, draft: string) => {
      cancelRenameRef.current = false;
      const next = String(draft).trim();
      if (layerGroupStandard === 'tag') {
        await applyRenameTagGroup(oldKey, next);
      } else {
        await applyRenameFrameGroup(oldKey, next);
      }
      setEditingGroupKey(null);
      setEditingGroupDraft('');
      cancelRenameRef.current = false;
    },
    [applyRenameFrameGroup, applyRenameTagGroup, layerGroupStandard]
  );

  const clearDropIndicator = useCallback(() => {
    setOverKey(null);
  }, []);

  const clearNoteDrop = useCallback(() => {
    setOverNoteId(null);
  }, []);

  const applyReorderInGroup = useCallback(
    (groupKey: string, newOrderTopFirst: Note[]) => {
      const base = Date.now();
      const len = newOrderTopFirst.length;
      const updates: Note[] = newOrderTopFirst.map((n, i) => ({
        ...n,
        layerStackOrder: base + (len - i) * 10
      }));
      if (onBatchUpdateNotes) {
        void onBatchUpdateNotes(
          notes.map((n) => {
            const u = updates.find((x) => x.id === n.id);
            return u ?? n;
          })
        );
        return;
      }
      updates.forEach((u) => onUpdateNote(u));
    },
    [notes, onBatchUpdateNotes, onUpdateNote]
  );

  const weightSideOpen = weightOpenKey != null;
  const weightPanelKey = weightOpenKey;
  const pageMenuOpen = !embed && !flow;
  const fallbackAnchorRef = useRef<HTMLElement | null>(null);
  const menuTop = useChromeMenuTop(
    pageMenuOpen,
    (menuAnchorRef as React.RefObject<HTMLElement | null> | undefined) ?? fallbackAnchorRef,
    8
  );
  const pageEdgeCls = dockAlign === 'end' ? 'ui-chrome-menu-page-right' : 'ui-chrome-menu-page-left';

  const posCls = embed
    ? 'relative z-[40] my-2'
    : flow
      ? 'relative z-[2000]'
      : `fixed z-[2000] ${pageEdgeCls}`;

  const panelBody = (
    <div
      data-graph-top-left-panel
      className={`map-chrome-content-${chromeAppearance} ${posCls} ${embed ? 'mt-2' : ''} flex max-h-[min(24rem,70vh)] overflow-hidden rounded-xl border border-gray-100/80 shadow-xl ${
        embed ? 'w-full max-w-xl' : weightSideOpen ? 'w-[min(36rem,calc(100vw-1rem))]' : 'w-[min(20rem,calc(100vw-2rem))]'
      }`}
      style={{
        ...(panelChromeStyle ?? { backgroundColor: 'rgba(255,255,255,0.96)' }),
        ...(pageMenuOpen && menuTop != null ? { top: menuTop } : undefined)
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="max-h-[min(22rem,68vh)] min-h-0 flex-1 overflow-y-auto overscroll-contain px-1.5 py-0.5 theme-surface-scrollbar">
          {boardVariantToggles ? (
            <>
              <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-400">显示类型</div>
              <div className="mb-2 space-y-1 rounded-lg border border-gray-100 bg-gray-50/50 px-2 py-1.5">
                <label className="flex items-center justify-between gap-2 text-xs text-gray-700">
                  <span>便签</span>
                  <input
                    type="checkbox"
                    checked={boardVariantToggles.primary}
                    onChange={() =>
                      boardVariantToggles.onChange({
                        primary: !boardVariantToggles.primary,
                        image: boardVariantToggles.image
                      })
                    }
                    className="h-4 w-4 rounded border-2"
                    style={{ accentColor: themeColor }}
                  />
                </label>
                <label className="flex items-center justify-between gap-2 text-xs text-gray-700">
                  <span>图片</span>
                  <input
                    type="checkbox"
                    checked={boardVariantToggles.image}
                    onChange={() =>
                      boardVariantToggles.onChange({
                        primary: boardVariantToggles.primary,
                        image: !boardVariantToggles.image
                      })
                    }
                    className="h-4 w-4 rounded border-2"
                    style={{ accentColor: themeColor }}
                  />
                </label>
              </div>
            </>
          ) : null}

          {!hideStandardToggle ? (
          <ChromeSegmentedControl
            className="mx-1.5 my-1.5"
            aria-label="图层分组方式"
            value={layerGroupStandard}
            onChange={onLayerGroupStandardChange}
            options={[
              {
                id: 'tag',
                label: <TagIcon size={18} strokeWidth={2} aria-hidden />,
                title: '按标签分组',
                ariaLabel: '切换为按标签分组'
              },
              {
                id: 'frame',
                label: <FrameIcon size={18} strokeWidth={2} aria-hidden />,
                title: '按簇分组',
                ariaLabel: '切换为按簇分组'
              }
            ]}
          />
          ) : null}

          {layerGroupStandard === 'tag' ? (
            <TagLayerHierarchyList
              themeColor={themeColor}
              merged={merged}
              onStateChange={onStateChange}
              notes={notes}
              onUpdateNote={onUpdateNote}
              onActivateNote={onActivateNote}
              tagColorsByKey={tagColorsByKey}
              onOpenTagColor={openTagColorBatchEditor}
              weightOpenKey={weightOpenKey}
              setWeightOpenKey={setWeightOpenKey}
              onRenameTag={(oldKey, nextKey) => void applyRenameTagGroup(oldKey, nextKey)}
            />
          ) : (
          merged.order.map((key) => {
            const k = String(key).trim();
            const visible = !hiddenSet.has(k);
            const rowKey = k === '' && layerGroupStandard === 'frame' ? '__empty_frame__' : k;
            const weightOpen = weightOpenKey === k;
            const isDragging = dragKey === k;
            const isOver = overKey === k && dragKey != null && dragKey !== k;
            const showLineBefore = isOver && dropPlace === 'before';
            const showLineAfter = isOver && dropPlace === 'after';
            const expanded = expandedGroupKey === rowKey;
            const groupNotes = notes.filter((n) => noteBelongsToLayerGroupKey(n, k, layerGroupStandard));
            const panelNotes = sortNotesForLayerPanelDesc(groupNotes);

            return (
              <div key={rowKey}>
                {showLineBefore ? (
                  <div
                    className="mx-2 h-0.5 rounded-full transition-opacity duration-150"
                    style={{ backgroundColor: themeColor }}
                  />
                ) : null}
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (dragKey == null || dragKey === k) return;
                    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                    const before = e.clientY < rect.top + rect.height / 2;
                    setOverKey(k);
                    setDropPlace(before ? 'before' : 'after');
                  }}
                  onDragLeave={(e) => {
                    const related = e.relatedTarget as Node | null;
                    if (related && (e.currentTarget as HTMLElement).contains(related)) return;
                    if (overKey === k) clearDropIndicator();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const from = dragKey;
                    setDragKey(null);
                    clearDropIndicator();
                    if (from == null || from === k) return;
                    patch((p) => ({
                      ...p,
                      order: insertRelative(p.order, from, k, dropPlace)
                    }));
                  }}
                  className={`flex flex-col rounded-lg transition-colors duration-150 ${
                    isOver && !isDragging ? 'bg-gray-50/90' : ''
                  }`}
                >
                  <div
                    className={`flex items-center gap-1 px-2 py-1 transition-[opacity,transform] duration-150 ease-out ${
                      isDragging ? 'opacity-45 scale-[0.98]' : 'opacity-100 scale-100'
                    }`}
                  >
                    <button
                      type="button"
                      className="shrink-0 rounded-md p-0.5 text-gray-500 hover:bg-gray-100"
                      aria-expanded={expanded}
                      onClick={() => toggleAccordion(rowKey)}
                    >
                      {expanded ? (
                        <ChevronDown size={18} strokeWidth={2} />
                      ) : (
                        <ChevronRight size={18} strokeWidth={2} />
                      )}
                    </button>
                    <div
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', k);
                        setDragKey(k);
                        try {
                          e.dataTransfer.setDragImage(e.currentTarget, 12, 12);
                        } catch {
                          /* ignore */
                        }
                      }}
                      onDragEnd={() => {
                        setDragKey(null);
                        clearDropIndicator();
                      }}
                      className="shrink-0 cursor-grab text-gray-400 active:cursor-grabbing"
                      aria-hidden
                    >
                      <GripVertical size={16} strokeWidth={2} />
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-1 pr-0.5">
                      {(frameColorsByKey.get(k) ?? []).slice(0, 6).map((c) => (
                          <button
                            key={`${k}:${c}`}
                            type="button"
                            draggable={false}
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (k) openFrameColorEditor(k, c, e.currentTarget);
                            }}
                            className="h-3 w-3 rounded-full border border-white/90 shadow-sm transition-transform hover:scale-110"
                            style={{ backgroundColor: c }}
                            title={
                              onUpdateFrame
                                ? `点击切换簇颜色：${c}`
                                : `簇颜色：${c}`
                            }
                            aria-label={`分组「${groupDisplayLabel(k, layerGroupStandard, framesById)}」颜色`}
                          />
                        ))}
                      {(frameColorsByKey.get(k) ?? []).length > 6 ? (
                        <span className="pl-0.5 text-[10px] leading-none text-gray-400">
                          +{(frameColorsByKey.get(k) ?? []).length - 6}
                        </span>
                      ) : null}
                    </div>
                    {editingGroupKey === k ? (
                      <input
                        autoFocus
                        value={editingGroupDraft}
                        onChange={(e) => setEditingGroupDraft(e.target.value)}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === 'Escape') {
                            e.preventDefault();
                            cancelEditingGroup();
                            return;
                          }
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            void commitEditingGroup(k, editingGroupDraft);
                          }
                        }}
                        onBlur={() => {
                          if (cancelRenameRef.current) {
                            cancelRenameRef.current = false;
                            return;
                          }
                          void commitEditingGroup(k, editingGroupDraft);
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                        className="min-w-0 flex-1 truncate px-2 py-0.5 text-sm font-medium text-gray-800 border border-gray-200 rounded-md outline-none focus:ring-2"
                        style={{ ['--tw-ring-color' as string]: themeColor }}
                        title={editingGroupDraft}
                      />
                    ) : (
                      <span
                        className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800 cursor-default"
                        title={`${groupDisplayLabel(k, layerGroupStandard, framesById)}（双击重命名）`}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          const canRenameFrame =
                            k !== '' && (!!onUpdateFrameTitle || !!onUpdateFrame);
                          if (!canRenameFrame) return;

                          cancelRenameRef.current = false;
                          setEditingGroupKey(k);
                          setEditingGroupDraft(groupDisplayLabel(k, layerGroupStandard, framesById));
                        }}
                      >
                        {groupDisplayLabel(k, layerGroupStandard, framesById)}
                      </span>
                    )}
                    <span className="shrink-0 text-[10px] text-gray-400">{groupNotes.length}</span>
                    <button
                      type="button"
                      draggable={false}
                      className="shrink-0 rounded-md p-1.5 text-gray-500 hover:bg-gray-100"
                      aria-label={visible ? '隐藏分组' : '显示分组'}
                      onClick={() =>
                        patch((p) => {
                          const h = new Set((p.hidden ?? []).map((x) => String(x).trim()));
                          if (h.has(k)) h.delete(k);
                          else h.add(k);
                          return { ...p, hidden: [...h] };
                        })
                      }
                    >
                      {visible ? <Eye size={18} strokeWidth={2} /> : <EyeOff size={18} strokeWidth={2} />}
                    </button>
                    <button
                      type="button"
                      draggable={false}
                      className={`shrink-0 rounded-md p-1.5 hover:bg-gray-100 ${
                        weightOpen ? 'text-gray-900' : 'text-gray-500'
                      }`}
                      style={weightOpen ? { color: themeColor } : undefined}
                      aria-label={weightOpen ? '关闭权重面板' : '在右侧调节半径权重'}
                      title="簇分组半径权重"
                      onClick={() => setWeightOpenKey((prev) => (prev === k ? null : k))}
                    >
                      {weightOpen ? (
                        <ChevronLeft size={18} strokeWidth={2} />
                      ) : (
                        <ChevronRight size={18} strokeWidth={2} />
                      )}
                    </button>
                  </div>

                  {expanded ? (
                    <div className="border-t border-gray-100/90 pb-1 pl-1 pr-1 pt-0.5">
                      {panelNotes.map((note) => {
                        const nVisible = !note.layerItemHidden;
                        const isNDrag = dragNoteId === note.id;
                        const isNOver = overNoteId === note.id && dragNoteId != null && dragNoteId !== note.id;
                        const lineB = isNOver && noteDropPlace === 'before';
                        const lineA = isNOver && noteDropPlace === 'after';
                        return (
                          <div key={note.id}>
                            {lineB ? (
                              <div
                                className="mx-3 h-0.5 rounded-full"
                                style={{ backgroundColor: themeColor }}
                              />
                            ) : null}
                            <div
                              onDragOver={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                e.dataTransfer.dropEffect = 'move';
                                if (!dragNoteId || dragNoteId === note.id) return;
                                const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                                const before = e.clientY < rect.top + rect.height / 2;
                                setOverNoteId(note.id);
                                setNoteDropPlace(before ? 'before' : 'after');
                              }}
                              onDragLeave={(e) => {
                                const related = e.relatedTarget as Node | null;
                                if (related && (e.currentTarget as HTMLElement).contains(related)) return;
                                if (overNoteId === note.id) clearNoteDrop();
                              }}
                              onDrop={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const fromId = dragNoteId;
                                setDragNoteId(null);
                                clearNoteDrop();
                                if (!fromId || fromId === note.id) return;
                                const orderIds = panelNotes.map((n) => n.id);
                                const fromIdx = orderIds.indexOf(fromId);
                                const toIdx = orderIds.indexOf(note.id);
                                if (fromIdx < 0 || toIdx < 0) return;
                                const nextIds = [...orderIds];
                                nextIds.splice(fromIdx, 1);
                                let insertAt = toIdx;
                                if (fromIdx < toIdx) insertAt -= 1;
                                if (noteDropPlace === 'after') insertAt += 1;
                                insertAt = Math.max(0, Math.min(nextIds.length, insertAt));
                                nextIds.splice(insertAt, 0, fromId);
                                const reordered = nextIds
                                  .map((id) => panelNotes.find((x) => x.id === id))
                                  .filter(Boolean) as Note[];
                                applyReorderInGroup(k, reordered);
                              }}
                              className={`flex items-center gap-1 rounded-md border border-transparent px-1 py-0.5 ${
                                isNOver && !isNDrag ? 'bg-gray-120/90' : 'bg-gray-100/90'
                              }`}
                            >
                              <div
                                draggable
                                onDragStart={(e) => {
                                  e.stopPropagation();
                                  e.dataTransfer.effectAllowed = 'move';
                                  e.dataTransfer.setData('text/plain', note.id);
                                  setDragNoteId(note.id);
                                }}
                                onDragEnd={() => {
                                  setDragNoteId(null);
                                  clearNoteDrop();
                                }}
                                className="shrink-0 cursor-grab text-gray-400 active:cursor-grabbing"
                              >
                                <GripVertical size={14} strokeWidth={2} />
                              </div>
                              {tableMode ? (
                                <div
                                  className="flex-1 min-w-0 flex items-center gap-2 cursor-pointer"
                                  onClick={() => onActivateNote?.(note)}
                                >
                                  <div
                                    className="min-w-0 flex-1 truncate text-left text-xs text-gray-500"
                                    title={note.text || ''}
                                  >
                                    {truncateRawTextLabel(note.text || '')}
                                  </div>

                                  <div className="flex-1 min-w-0 flex flex-wrap items-center gap-1">
                                    {(note.tags ?? []).length > 0 ? (
                                      (note.tags ?? []).map((t, tagIndex) => {
                                        const tagKey = normalizeTagLabel(t.label);
                                        return (
                                          <button
                                            key={`${note.id}:${t.id}:${t.label}`}
                                            type="button"
                                            draggable={false}
                                            className="inline-flex items-center px-2 py-0.5 rounded-full border border-white/70 shadow-sm text-[10px] font-semibold transition-transform hover:scale-105"
                                            style={{
                                              backgroundColor: t.color ?? themeColor,
                                              color: 'white'
                                            }}
                                            title="点击编辑该便签的这一条标签"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              openTableTagEditPanel(note.id, tagIndex, t, e.currentTarget);
                                            }}
                                          >
                                            {tagKey || '无标签'}
                                          </button>
                                        );
                                      })
                                    ) : (
                                      <span className="text-[10px] text-gray-400">-</span>
                                    )}
                                  </div>

                                  <div className="shrink-0">
                                    <NoteTimeRangeControl
                                      startYear={note.startYear}
                                      endYear={note.endYear}
                                      themeColor={themeColor}
                                      panelChromeStyle={panelChromeStyle}
                                      onChange={(next) => {
                                        onUpdateNote({ ...note, startYear: next.startYear, endYear: next.endYear });
                                      }}
                                    />
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    draggable={false}
                                    className="min-w-0 flex-1 truncate text-left text-xs text-gray-500 hover:text-gray-700"
                                    title={note.text || ''}
                                    onClick={() => onActivateNote?.(note)}
                                  >
                                    {truncateRawTextLabel(note.text || '')}
                                  </button>
                                  <button
                                    type="button"
                                    draggable={false}
                                    className="shrink-0 rounded-md p-1 text-gray-500 hover:bg-gray-100"
                                    aria-label={nVisible ? '隐藏节点' : '显示节点'}
                                    onClick={() =>
                                      onUpdateNote({ ...note, layerItemHidden: !note.layerItemHidden })
                                    }
                                  >
                                    {nVisible ? <Eye size={16} strokeWidth={2} /> : <EyeOff size={16} strokeWidth={2} />}
                                  </button>
                                </>
                              )}
                            </div>
                            {lineA ? (
                              <div
                                className="mx-3 h-0.5 rounded-full"
                                style={{ backgroundColor: themeColor }}
                              />
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
                {showLineAfter ? (
                  <div
                    className="mx-2 h-0.5 rounded-full transition-opacity duration-150"
                    style={{ backgroundColor: themeColor }}
                  />
                ) : null}
              </div>
            );
          })
          )}
        </div>
      </div>

      {weightPanelKey != null ? (
        <div
          className="flex w-[min(16rem,45vw)] shrink-0 flex-col justify-center border-l border-gray-200/85 px-2 py-2"
          title={groupDisplayLabel(weightPanelKey, layerGroupStandard, framesById)}
        >
          <SettingsCompactSlider
            label="半径权重"
            themeColor={themeColor}
            value={merged.weights?.[weightPanelKey] ?? 0.5}
            min={GRAPH_LAYER_WEIGHT_MIN}
            max={GRAPH_LAYER_WEIGHT_MAX}
            step={0.05}
            onChange={(v) =>
              patch((p) => ({
                ...p,
                weights: { ...p.weights, [weightPanelKey]: v }
              }))
            }
            formatValue={(v) => v.toFixed(2)}
            // frame：时间线纵轴靠前更靠上（「按聚类分层」强度另见设置项）
            // tag：与 LayerRegistry 一致——权重大 → 靠圆心
            minCaption={layerGroupStandard === 'tag' ? '远心' : '靠上'}
            maxCaption={layerGroupStandard === 'tag' ? '近心' : '靠下'}
            trackWidth="stretch"
            className="min-w-0"
          />
        </div>
      ) : null}

      {tagColorBatchEditor && (
        <TagAddPanel
          themeColor={themeColor}
          panelChromeStyle={panelChromeStyle}
          title={`批量修改标签「${groupDisplayLabel(tagColorBatchEditor.tagLabelKey, 'tag', framesById)}」颜色`}
          label={tagColorBatchEditor.tagLabelKey}
          hideLabelInput
          selectedColor={tagColorBatchEditor.toColor}
          onColorChange={(c) => {
            setTagColorBatchEditor((prev) => (prev ? { ...prev, toColor: c } : prev));
          }}
          onApply={async () => {
            await applyBatchTagColorChange(
              tagColorBatchEditor.tagLabelKey,
              tagColorBatchEditor.fromColor,
              tagColorBatchEditor.toColor
            );
            setTagColorBatchEditor(null);
          }}
          onDismissOutside={() => setTagColorBatchEditor(null)}
          portalPlacement={tagColorBatchEditor.portalPlacement}
          closeOnInteractOutside
          dismissIgnoreClosestSelector={undefined}
          autoFocus={false}
          onLabelChange={() => {}}
        />
      )}

      {frameColorEditor && (
        <TagAddPanel
          themeColor={themeColor}
          panelChromeStyle={panelChromeStyle}
          title={`修改簇「${groupDisplayLabel(frameColorEditor.frameId, 'frame', framesById)}」颜色`}
          label={frameColorEditor.frameId}
          hideLabelInput
          selectedColor={frameColorEditor.toColor}
          onColorChange={(c) => {
            setFrameColorEditor((prev) => (prev ? { ...prev, toColor: c } : prev));
          }}
          onApply={() => {
            applyFrameColorChange(frameColorEditor.frameId, frameColorEditor.toColor);
            setFrameColorEditor(null);
          }}
          onDismissOutside={() => setFrameColorEditor(null)}
          portalPlacement={frameColorEditor.portalPlacement}
          closeOnInteractOutside
          dismissIgnoreClosestSelector={undefined}
          autoFocus={false}
          onLabelChange={() => {}}
        />
      )}

      {tableTagEditDraft && (
        <TagAddPanel
          themeColor={themeColor}
          panelChromeStyle={panelChromeStyle}
          title="编辑便签标签"
          label={tableTagEditDraft.draftLabel}
          onLabelChange={(v) =>
            setTableTagEditDraft((prev) => (prev ? { ...prev, draftLabel: v } : prev))
          }
          selectedColor={tableTagEditDraft.draftColor}
          onColorChange={(c) =>
            setTableTagEditDraft((prev) => (prev ? { ...prev, draftColor: c } : prev))
          }
          onApply={async () => {
            const note = notes.find((n) => n.id === tableTagEditDraft.noteId);
            if (!note) return;

            const oldFirstKey = toTagGroupKey(note.tags?.[0]?.label);
            const newFirstKey = toTagGroupKey(tableTagEditDraft.tagIndex === 0 ? tableTagEditDraft.draftLabel : note.tags?.[0]?.label);

            const nextTags = (note.tags ?? []).map((t, i) =>
              i !== tableTagEditDraft.tagIndex
                ? t
                : {
                    ...t,
                    label: tableTagEditDraft.draftLabel,
                    color: tableTagEditDraft.draftColor
                  }
            );

            onUpdateNote({ ...note, tags: nextTags });

            // 如果编辑的是第一个标签，迁移层状态 key（保证“重新分组”且保留显隐/权重）
            if (tableTagEditDraft.tagIndex === 0 && oldFirstKey !== newFirstKey) {
              renameTagLayerKeyInState(oldFirstKey, newFirstKey);
            }

            setTableTagEditDraft(null);
          }}
          onDismissOutside={() => setTableTagEditDraft(null)}
          portalPlacement={tableTagEditDraft.portalPlacement}
          closeOnInteractOutside
          dismissIgnoreClosestSelector={undefined}
          autoFocus={false}
        />
      )}
    </div>
  );

  if (embed || flow) return panelBody;
  if (menuTop == null) return null;
  return createPortal(panelBody, document.body);
};
