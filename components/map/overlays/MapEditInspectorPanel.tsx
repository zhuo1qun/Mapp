import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { Map as LeafletMap } from 'leaflet';
import { Reorder } from 'framer-motion';
import {
  ChevronDown,
  Crosshair,
  Eye,
  EyeOff,
  Layers,
  Link2,
  MapPin,
  Pencil,
  Plus,
  Tag as TagIcon,
  Users,
  X
} from 'lucide-react';
import { TAG_COLORS } from '../../../constants';
import type { Connection, Coordinates, Frame, Note, Tag } from '../../../types';
import { chromePanelGhostIconButtonClass } from '../../ui/chromePanelIconButton';
import { TagAddPanel } from '../../ui/TagAddPanel';
import {
  clampNoteWeight,
  connectionToGraphDirection,
  DEFAULT_NOTE_WEIGHT
} from '../../../utils/graph/graphData';
import { generateId, parseNoteContent } from '../../../utils';
import { SettingsCompactSlider } from '../../ui/SettingsCompactSlider';

export type EditInspectorCoordMode = 'map' | 'board' | 'graph';

/** 簇 / 多选 / 图谱簇预览 等成组选择 */
export type InspectorGroupContext = {
  kind: 'cluster' | 'multi' | 'framePeek';
  title: string;
  members: Note[];
  centroidMap?: { lat: number; lng: number };
  centroidBoard?: { x: number; y: number };
  /** 图谱 framePeek（历史）临时预览的簇 id */
  peekFrameIds?: string[];
};

/** 侧栏标题行灰字：对象类型（与对象名称分两行） */
function inspectorKindLabelForNote(note: Note): string {
  return note.variant === 'image' ? 'Image' : 'Note';
}

function inspectorKindLabelForGroup(ctx: InspectorGroupContext): string {
  if (ctx.kind === 'framePeek') return 'Group (Temporary)';
  return 'Group';
}

function noteTitle(n: Note | undefined): string {
  if (!n) return '（便签已删除）';
  return parseNoteContent(n.text || '').title || '无标题';
}

function edgeDirectionHint(c: Connection): string {
  const d = connectionToGraphDirection(c);
  if (d === 'forward') return '→';
  if (d === 'backward') return '←';
  if (d === 'both') return '↔';
  return '—';
}

function patchNoteFrameMembership(note: Note, frameIds: string[], frames: Frame[]): Note {
  // 单簇：只保留最后一个选中的 id（或空）
  const ordered = frameIds.filter((id) => frames.some((f) => f.id === id)).slice(-1);
  const names = ordered.map((id) => frames.find((f) => f.id === id)!.title);
  const first = ordered[0];
  return {
    ...note,
    groupIds: ordered.length ? ordered : undefined,
    groupNames: ordered.length ? names : undefined,
    groupId: first,
    groupName: first ? frames.find((f) => f.id === first)?.title : undefined
  };
}

const asideShellClass =
  'pointer-events-auto fixed right-0 top-0 z-[450] hidden h-full w-80 flex-col border-l border-gray-200/90 bg-white/95 shadow-[-4px_0_24px_rgba(0,0,0,0.06)] backdrop-blur-md lg:flex';

/** 侧栏内折叠块与卡片：轻微投影 + 细描边，与浅底区分层 */
const inspectorSectionSurfaceClass =
  'rounded-lg border border-gray-100/80 bg-white/90 shadow-[0_1px_3px_rgba(15,23,42,0.06),0_1px_2px_-1px_rgba(15,23,42,0.06)]';

/** 块内子卡片（端点、Frame 行等）：更轻的投影 */
const inspectorNestedCardClass =
  'rounded-lg border border-gray-100/90 bg-white/90 shadow-sm';

/** 侧栏标题栏右侧铅笔按钮（各视图便签 / Edge 关联编辑入口同款）：玻璃面板上小 icon → 无框 */
const inspectorHeaderPencilButtonClass = `${chromePanelGhostIconButtonClass} mt-0.5`;

function InspectorCollapsibleSection({
  title,
  icon,
  themeColor,
  defaultOpen = true,
  children
}: {
  title: string;
  icon?: React.ReactNode;
  themeColor: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={inspectorSectionSurfaceClass}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-xs font-semibold text-gray-700 hover:bg-gray-100/60"
        style={{ ['--tw-ring-color' as string]: themeColor }}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          {icon}
          <span className="truncate">{title}</span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-gray-500 transition-transform ${open ? 'rotate-0' : '-rotate-90'}`}
          aria-hidden
        />
      </button>
      {open ? <div className="border-t border-gray-100/80 px-2 pb-2.5 pt-1">{children}</div> : null}
    </div>
  );
}

export interface EditInspectorPanelProps {
  note: Note | null;
  /** 簇 / 多选 / 簇预览（与 note 互斥展示：有单选 note 时不传） */
  groupContext?: InspectorGroupContext | null;
  /** 看板：选中 Frame（与 note / group / connection 互斥由调用方保证） */
  inspectorFrame?: Frame | null;
  onUpdateFrame?: (frame: Frame) => void;
  /** 看板 / 图谱：选中连线 */
  inspectorConnection?: Connection | null;
  coordMode: EditInspectorCoordMode;
  themeColor: string;
  panelChromeStyle?: React.CSSProperties;
  frames: Frame[];
  connections: Connection[];
  notes: Note[];
  hasConnectionWrite: boolean;
  onUpdateNote: (note: Note) => void;
  onEditConnection: (c: Connection) => void;
  onNewConnection: () => void;
  mapInstance?: LeafletMap | null;
  noteCoordOverrides?: Record<string, Coordinates>;
  onClearCoordOverride?: (noteId: string) => void;
  onFocusPeerOnMap?: (noteId: string) => void;
  onFocusPeerInView?: (noteId: string) => void;
  /** 各视图：侧栏标题栏铅笔按钮，打开完整便签编辑器（NoteEditor） */
  onOpenFullNoteEditor?: (noteId: string) => void;
  /** Graph：侧栏创建 Frame */
  onUpdateFrames?: (frames: Frame[]) => void;
}

function EditInspectorEmpty({
  panelChromeStyle,
  coordMode
}: {
  panelChromeStyle?: React.CSSProperties;
  coordMode: EditInspectorCoordMode;
}) {
  const hint =
    coordMode === 'map'
      ? '点击便签、框选或展开簇标签'
      : coordMode === 'board'
        ? '在画布上点击或框选便签'
        : '在图谱中单击节点';
  return (
    <aside
      className={asideShellClass}
      style={panelChromeStyle}
      data-edit-inspector="empty"
      onPointerDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      <div className="flex shrink-0 items-center border-b border-gray-100 px-3 py-2.5">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">属性</div>
          <div className="text-sm font-semibold text-gray-500">未选中对象</div>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 pb-8 text-center">
        <p className="text-sm text-gray-400">暂无选中项</p>
        <p className="mt-2 text-xs text-gray-400">{hint}</p>
      </div>
    </aside>
  );
}

function EditInspectorFrameOnly({
  frame,
  themeColor,
  panelChromeStyle,
  notes,
  onUpdateFrame
}: Pick<EditInspectorPanelProps, 'themeColor' | 'panelChromeStyle' | 'notes' | 'onUpdateFrame'> & {
  frame: Frame;
}) {
  const [title, setTitle] = useState(frame.title);
  const [desc, setDesc] = useState(frame.description ?? '');
  const [xStr, setXStr] = useState(String(frame.x));
  const [yStr, setYStr] = useState(String(frame.y));
  const [wStr, setWStr] = useState(String(frame.width));
  const [hStr, setHStr] = useState(String(frame.height));
  const [color, setColor] = useState(frame.color);

  useEffect(() => {
    setTitle(frame.title);
    setDesc(frame.description ?? '');
    setXStr(String(frame.x));
    setYStr(String(frame.y));
    setWStr(String(frame.width));
    setHStr(String(frame.height));
    setColor(frame.color);
  }, [
    frame.id,
    frame.title,
    frame.description,
    frame.x,
    frame.y,
    frame.width,
    frame.height,
    frame.color
  ]);

  const memberCount = useMemo(
    () =>
      notes.filter(
        (n) =>
          (n.groupIds && n.groupIds.includes(frame.id)) || n.groupId === frame.id
      ).length,
    [notes, frame.id]
  );

  const applyMeta = useCallback(() => {
    onUpdateFrame?.({
      ...frame,
      title: title.trim() || 'Frame',
      description: desc.trim() || undefined,
      color
    });
  }, [frame, title, desc, color, onUpdateFrame]);

  const applyRect = useCallback(() => {
    const x = parseFloat(xStr.replace(/,/g, '.'));
    const y = parseFloat(yStr.replace(/,/g, '.'));
    const w = parseFloat(wStr.replace(/,/g, '.'));
    const h = parseFloat(hStr.replace(/,/g, '.'));
    if ([x, y, w, h].some((n) => Number.isNaN(n)) || w < 20 || h < 20) {
      window.alert('请输入有效的位置与尺寸（宽、高至少 20）。');
      return;
    }
    onUpdateFrame?.({ ...frame, x, y, width: w, height: h });
  }, [frame, xStr, yStr, wStr, hStr, onUpdateFrame]);

  return (
    <aside
      className={asideShellClass}
      style={panelChromeStyle}
      data-edit-inspector="frame"
      onPointerDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      <div className="flex shrink-0 items-center border-b border-gray-100 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Frame</div>
          <div className="truncate text-sm font-semibold text-gray-900">{frame.title || 'Frame'}</div>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-3 py-3 theme-surface-scrollbar">
        <InspectorCollapsibleSection title="标题与说明" icon={<Pencil size={14} className="text-gray-500" />} themeColor={themeColor}>
          <label className="block text-[10px] text-gray-500">
            标题
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-0.5 w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-offset-0"
              style={{ ['--tw-ring-color' as string]: themeColor }}
            />
          </label>
          <label className="mt-2 block text-[10px] text-gray-500">
            说明
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              rows={2}
              className="mt-0.5 w-full resize-none rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-offset-0"
              style={{ ['--tw-ring-color' as string]: themeColor }}
            />
          </label>
          <label className="mt-2 flex items-center gap-2 text-[10px] text-gray-500">
            颜色
            <input
              type="color"
              value={/^#[0-9A-Fa-f]{6}$/.test(color) ? color : '#94a3b8'}
              onChange={(e) => setColor(e.target.value)}
              className="h-7 w-10 cursor-pointer rounded border border-gray-200 bg-white p-0"
            />
            <span className="font-mono text-[11px] text-gray-600">{color}</span>
          </label>
          <button
            type="button"
            onClick={applyMeta}
            disabled={!onUpdateFrame}
            className="mt-2 rounded-lg px-3 py-1.5 text-xs font-medium text-white shadow-sm disabled:opacity-40"
            style={{ backgroundColor: themeColor }}
          >
            应用标题 / 说明 / 颜色
          </button>
        </InspectorCollapsibleSection>

        <InspectorCollapsibleSection title="位置与尺寸" icon={<MapPin size={14} className="text-gray-500" />} themeColor={themeColor}>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[10px] text-gray-500">
              x
              <input
                value={xStr}
                onChange={(e) => setXStr(e.target.value)}
                className="mt-0.5 w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 font-mono text-xs outline-none focus:ring-2 focus:ring-offset-0"
                style={{ ['--tw-ring-color' as string]: themeColor }}
              />
            </label>
            <label className="text-[10px] text-gray-500">
              y
              <input
                value={yStr}
                onChange={(e) => setYStr(e.target.value)}
                className="mt-0.5 w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 font-mono text-xs outline-none focus:ring-2 focus:ring-offset-0"
                style={{ ['--tw-ring-color' as string]: themeColor }}
              />
            </label>
            <label className="text-[10px] text-gray-500">
              width
              <input
                value={wStr}
                onChange={(e) => setWStr(e.target.value)}
                className="mt-0.5 w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 font-mono text-xs outline-none focus:ring-2 focus:ring-offset-0"
                style={{ ['--tw-ring-color' as string]: themeColor }}
              />
            </label>
            <label className="text-[10px] text-gray-500">
              height
              <input
                value={hStr}
                onChange={(e) => setHStr(e.target.value)}
                className="mt-0.5 w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 font-mono text-xs outline-none focus:ring-2 focus:ring-offset-0"
                style={{ ['--tw-ring-color' as string]: themeColor }}
              />
            </label>
          </div>
          <button
            type="button"
            onClick={applyRect}
            disabled={!onUpdateFrame}
            className="mt-2 rounded-lg px-3 py-1.5 text-xs font-medium text-white shadow-sm disabled:opacity-40"
            style={{ backgroundColor: themeColor }}
          >
            应用位置与尺寸
          </button>
        </InspectorCollapsibleSection>

        <InspectorCollapsibleSection title="成员" icon={<Users size={14} className="text-gray-500" />} themeColor={themeColor} defaultOpen={false}>
          <p className="text-xs text-gray-600">
            归属此 Frame 的便签（按 groupId / groupIds）：
            <span className="ml-1 font-semibold text-gray-900">{memberCount}</span> 个
          </p>
        </InspectorCollapsibleSection>

        <InspectorCollapsibleSection title="标识" icon={<Layers size={14} className="text-gray-500" />} themeColor={themeColor} defaultOpen={false}>
          <code className="block break-all rounded bg-gray-100 px-2 py-1 text-[10px] text-gray-800">{frame.id}</code>
        </InspectorCollapsibleSection>
      </div>
    </aside>
  );
}

function EditInspectorEdgeOnly({
  connection,
  themeColor,
  panelChromeStyle,
  notes,
  hasConnectionWrite,
  onEditConnection,
  onFocusPeerInView,
  coordMode
}: Pick<
  EditInspectorPanelProps,
  | 'themeColor'
  | 'panelChromeStyle'
  | 'notes'
  | 'hasConnectionWrite'
  | 'onEditConnection'
  | 'onFocusPeerInView'
> & {
  connection: Connection;
  coordMode: EditInspectorCoordMode;
}) {
  const noteById = useMemo(() => {
    const m = new Map<string, Note>();
    notes.forEach((n) => m.set(n.id, n));
    return m;
  }, [notes]);

  const fromN = noteById.get(connection.fromNoteId);
  const toN = noteById.get(connection.toNoteId);
  const subtitle =
    connection.label?.trim() ||
    `${noteTitle(fromN)} ↔ ${noteTitle(toN)}`;

  const peerLabel =
    coordMode === 'map' ? '地图' : coordMode === 'board' ? '看板' : '图中';

  return (
    <aside
      className={asideShellClass}
      style={panelChromeStyle}
      data-edit-inspector="edge"
      onPointerDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      <div className="flex shrink-0 items-start justify-between gap-2 border-b border-gray-100 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Edge</div>
          <div className="truncate text-sm font-semibold text-gray-900">{subtitle}</div>
        </div>
        <button
          type="button"
          disabled={!hasConnectionWrite}
          className={inspectorHeaderPencilButtonClass}
          title={hasConnectionWrite ? '在关联面板中编辑' : '当前项目无连线写入权限'}
          aria-label={hasConnectionWrite ? '在关联面板中编辑' : '无连线写入权限'}
          onClick={() => hasConnectionWrite && onEditConnection(connection)}
          onPointerDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          <Pencil size={16} className="shrink-0" strokeWidth={2} aria-hidden />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-3 py-3 theme-surface-scrollbar">
        {!hasConnectionWrite ? (
          <p className="text-xs text-gray-400">当前项目无连线写入权限。</p>
        ) : null}

        <InspectorCollapsibleSection title="端点" icon={<Link2 size={14} className="text-gray-500" />} themeColor={themeColor}>
          <div className="space-y-2 text-xs">
            <div className={`${inspectorNestedCardClass} px-2 py-1.5`}>
              <div className="text-[10px] font-medium text-gray-400">起点 · {connection.fromSide}</div>
              <div className="mt-0.5 flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1 truncate font-medium text-gray-800">{noteTitle(fromN)}</span>
                {onFocusPeerInView ? (
                  <button
                    type="button"
                    onClick={() => onFocusPeerInView(connection.fromNoteId)}
                    className="shrink-0 text-[10px] text-gray-400 hover:text-gray-600"
                  >
                    定位到{peerLabel}
                  </button>
                ) : null}
              </div>
            </div>
            <div className={`${inspectorNestedCardClass} px-2 py-1.5`}>
              <div className="text-[10px] font-medium text-gray-400">终点 · {connection.toSide}</div>
              <div className="mt-0.5 flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1 truncate font-medium text-gray-800">{noteTitle(toN)}</span>
                {onFocusPeerInView ? (
                  <button
                    type="button"
                    onClick={() => onFocusPeerInView(connection.toNoteId)}
                    className="shrink-0 text-[10px] text-gray-400 hover:text-gray-600"
                  >
                    定位到{peerLabel}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </InspectorCollapsibleSection>

        <InspectorCollapsibleSection title="标签与箭头" icon={<TagIcon size={14} className="text-gray-500" />} themeColor={themeColor} defaultOpen={false}>
          <dl className="space-y-1 text-[11px] text-gray-700">
            <div className="flex justify-between gap-2">
              <dt className="text-gray-400">标签</dt>
              <dd className="min-w-0 truncate text-right font-medium">{connection.label || '—'}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-gray-400">起点箭头</dt>
              <dd className="font-mono">{connection.fromArrow ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-gray-400">终点箭头</dt>
              <dd className="font-mono">{connection.toArrow ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-gray-400">方向</dt>
              <dd className="font-mono">{connection.arrow ?? '—'}</dd>
            </div>
          </dl>
        </InspectorCollapsibleSection>

        <InspectorCollapsibleSection title="标识" icon={<Layers size={14} className="text-gray-500" />} themeColor={themeColor} defaultOpen={false}>
          <code className="block break-all rounded bg-gray-100 px-2 py-1 text-[10px] text-gray-800">{connection.id}</code>
        </InspectorCollapsibleSection>
      </div>
    </aside>
  );
}

function EditInspectorGroupOnly({
  groupContext,
  coordMode,
  themeColor,
  panelChromeStyle,
  connections,
  notes,
  hasConnectionWrite,
  onEditConnection,
  mapInstance,
  onFocusPeerOnMap,
  onFocusPeerInView,
  frames
}: Pick<
  EditInspectorPanelProps,
  | 'themeColor'
  | 'panelChromeStyle'
  | 'connections'
  | 'notes'
  | 'hasConnectionWrite'
  | 'onEditConnection'
  | 'mapInstance'
  | 'onFocusPeerOnMap'
  | 'onFocusPeerInView'
> & {
  groupContext: InspectorGroupContext;
  coordMode: EditInspectorCoordMode;
  frames: Frame[];
}) {
  const { members, title, centroidMap, centroidBoard, peekFrameIds } = groupContext;
  const memberIds = useMemo(() => new Set(members.map((m) => m.id)), [members]);

  const intraGroupConnections = useMemo(
    () =>
      connections.filter((c) => memberIds.has(c.fromNoteId) && memberIds.has(c.toNoteId)),
    [connections, memberIds]
  );

  const noteById = useMemo(() => {
    const m = new Map<string, Note>();
    notes.forEach((n) => m.set(n.id, n));
    return m;
  }, [notes]);

  const focusPeer = useCallback(
    (noteId: string) => {
      if (coordMode === 'map' && onFocusPeerOnMap) onFocusPeerOnMap(noteId);
      else if (onFocusPeerInView) onFocusPeerInView(noteId);
    },
    [coordMode, onFocusPeerOnMap, onFocusPeerInView]
  );

  const peerLinkLabel =
    coordMode === 'map' ? '在地图上查看' : coordMode === 'board' ? '在看板中定位' : '在图中定位';

  const flyCentroidMap = useCallback(() => {
    if (!mapInstance || !centroidMap) return;
    mapInstance.flyTo([centroidMap.lat, centroidMap.lng], Math.max(mapInstance.getZoom(), 14), { duration: 0.75 });
  }, [mapInstance, centroidMap]);

  const framePeekLabels = useMemo(() => {
    if (!peekFrameIds?.length) return [];
    const fm = new Map(frames.map((f) => [f.id, f.title]));
    return peekFrameIds.map((id) => fm.get(id) ?? id);
  }, [peekFrameIds, frames]);

  return (
    <aside
      className={asideShellClass}
      style={panelChromeStyle}
      data-edit-inspector="group"
      onPointerDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      <div className="flex shrink-0 items-center border-b border-gray-100 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
            {inspectorKindLabelForGroup(groupContext)}
          </div>
          <div className="truncate text-sm font-semibold text-gray-900">{title}</div>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-3 py-3 theme-surface-scrollbar">
        {coordMode === 'map' && centroidMap ? (
          <InspectorCollapsibleSection title="位置（中心）" icon={<MapPin size={14} className="text-gray-500" />} themeColor={themeColor}>
            <div className="grid grid-cols-2 gap-2 font-mono text-[11px] text-gray-700">
              <div>
                <span className="text-gray-400">lat</span> {centroidMap.lat.toFixed(6)}
              </div>
              <div>
                <span className="text-gray-400">lng</span> {centroidMap.lng.toFixed(6)}
              </div>
            </div>
            <button
              type="button"
              onClick={flyCentroidMap}
              disabled={!mapInstance}
              className="mt-2 inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
            >
              <Crosshair size={12} aria-hidden />
              飞到中心
            </button>
            <p className="mt-1.5 text-[10px] leading-relaxed text-gray-400">
              由当前组内可绘制地理坐标的便签取平均中心；不含无坐标点。
            </p>
          </InspectorCollapsibleSection>
        ) : null}

        {coordMode === 'board' && centroidBoard ? (
          <InspectorCollapsibleSection title="位置（中心）" icon={<MapPin size={14} className="text-gray-500" />} themeColor={themeColor}>
            <div className="grid grid-cols-2 gap-2 font-mono text-[11px] text-gray-700">
              <div>
                <span className="text-gray-400">boardX</span> {centroidBoard.x.toFixed(1)}
              </div>
              <div>
                <span className="text-gray-400">boardY</span> {centroidBoard.y.toFixed(1)}
              </div>
            </div>
            <p className="mt-1.5 text-[10px] text-gray-400">为选中便签看板坐标的算术平均。</p>
          </InspectorCollapsibleSection>
        ) : null}

        {coordMode === 'graph' && peekFrameIds && peekFrameIds.length > 0 ? (
          <InspectorCollapsibleSection title="簇预览" icon={<Layers size={14} className="text-gray-500" />} themeColor={themeColor}>
            <ul className="space-y-1 text-xs text-gray-700">
              {framePeekLabels.map((label, i) => (
                <li key={`${peekFrameIds[i]}-${i}`} className="truncate">
                  · {label}
                </li>
              ))}
            </ul>
          </InspectorCollapsibleSection>
        ) : null}

        <InspectorCollapsibleSection title={`成员（${members.length}）`} icon={<Users size={14} className="text-gray-500" />} themeColor={themeColor}>
          <ul className="max-h-40 space-y-1 overflow-y-auto text-xs">
            {members.map((n) => (
              <li
                key={n.id}
                className="flex items-center justify-between gap-1 rounded-md border border-gray-100/80 bg-white px-1.5 py-1 shadow-sm"
              >
                <span className="min-w-0 flex-1 truncate font-medium text-gray-800">{noteTitle(n)}</span>
                <button
                  type="button"
                  onClick={() => focusPeer(n.id)}
                  className="shrink-0 text-[10px] text-gray-400 hover:text-gray-600"
                >
                  {peerLinkLabel}
                </button>
              </li>
            ))}
          </ul>
        </InspectorCollapsibleSection>

        <InspectorCollapsibleSection
          title={`组内关联（${intraGroupConnections.length}）`}
          icon={<Link2 size={14} className="text-gray-500" />}
          themeColor={themeColor}
          defaultOpen={false}
        >
          {intraGroupConnections.length === 0 ? (
            <p className="text-xs text-gray-400">组内两端点皆在选中集合中的边。</p>
          ) : (
            <ul className="space-y-1">
              {intraGroupConnections.map((c) => {
                const a = noteById.get(c.fromNoteId);
                const b = noteById.get(c.toNoteId);
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      disabled={!hasConnectionWrite}
                      onClick={() => hasConnectionWrite && onEditConnection(c)}
                      className="flex w-full flex-col gap-0.5 rounded-lg border border-gray-100 bg-gray-50/50 px-2 py-1.5 text-left text-[11px] shadow-sm hover:bg-gray-100 disabled:opacity-70"
                    >
                      <span className="truncate text-gray-800">
                        {edgeDirectionHint(c)} {noteTitle(a)} ↔ {noteTitle(b)}
                      </span>
                      {c.label ? <span className="truncate text-[10px] text-gray-500">{c.label}</span> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </InspectorCollapsibleSection>
      </div>
    </aside>
  );
}

function EditInspectorPanelInner({
  note,
  coordMode,
  themeColor,
  panelChromeStyle,
  frames,
  connections,
  notes,
  hasConnectionWrite,
  onUpdateNote,
  onEditConnection,
  onNewConnection,
  mapInstance,
  noteCoordOverrides = {},
  onClearCoordOverride,
  onFocusPeerOnMap,
  onFocusPeerInView,
  onOpenFullNoteEditor,
  onUpdateFrames
}: EditInspectorPanelProps & { note: Note }) {
  const effectiveMapCoords = noteCoordOverrides[note.id] ?? note.coords;
  const [latStr, setLatStr] = useState(String(effectiveMapCoords.lat));
  const [lngStr, setLngStr] = useState(String(effectiveMapCoords.lng));
  const [bxStr, setBxStr] = useState(String(note.boardX));
  const [byStr, setByStr] = useState(String(note.boardY));
  const [tagLabel, setTagLabel] = useState('');
  const [tagColor, setTagColor] = useState(TAG_COLORS[0] ?? '#94a3b8');
  const [tagColorPortal, setTagColorPortal] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    const c = noteCoordOverrides[note.id] ?? note.coords;
    setLatStr(String(c.lat));
    setLngStr(String(c.lng));
  }, [note.id, note.coords.lat, note.coords.lng, noteCoordOverrides]);

  useEffect(() => {
    setBxStr(String(note.boardX));
    setByStr(String(note.boardY));
  }, [note.id, note.boardX, note.boardY]);

  const noteById = useMemo(() => {
    const m = new Map<string, Note>();
    notes.forEach((n) => m.set(n.id, n));
    return m;
  }, [notes]);

  const relatedConnections = useMemo(
    () => connections.filter((c) => c.fromNoteId === note.id || c.toNoteId === note.id),
    [connections, note.id]
  );

  const groupIds = note.groupIds || (note.groupId ? [note.groupId] : []);

  const applyMapCoords = useCallback(() => {
    const lat = parseFloat(latStr.replace(/,/g, '.'));
    const lng = parseFloat(lngStr.replace(/,/g, '.'));
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      window.alert('请输入有效的纬度、经度数字。');
      return;
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      window.alert('纬度应在 -90～90，经度应在 -180～180。');
      return;
    }
    onClearCoordOverride?.(note.id);
    onUpdateNote({ ...note, coords: { lat, lng } });
  }, [latStr, lngStr, note, onClearCoordOverride, onUpdateNote]);

  const useMapCenter = useCallback(() => {
    if (!mapInstance) return;
    const c = mapInstance.getCenter();
    setLatStr(String(c.lat));
    setLngStr(String(c.lng));
  }, [mapInstance]);

  const applyBoardCoords = useCallback(() => {
    const bx = parseFloat(bxStr.replace(/,/g, '.'));
    const by = parseFloat(byStr.replace(/,/g, '.'));
    if (Number.isNaN(bx) || Number.isNaN(by)) {
      window.alert('请输入有效的看板坐标数字。');
      return;
    }
    onUpdateNote({ ...note, boardX: bx, boardY: by, isInitialPosition: false });
  }, [bxStr, byStr, note, onUpdateNote]);

  const toggleFrame = useCallback(
    (frameId: string) => {
      if (groupIds.includes(frameId)) {
        onUpdateNote(patchNoteFrameMembership(note, [], frames));
      } else {
        onUpdateNote(patchNoteFrameMembership(note, [frameId], frames));
      }
    },
    [frames, groupIds, note, onUpdateNote]
  );

  const createFrameAndAssign = useCallback(() => {
    if (!onUpdateFrames) return;
    const newFrame: Frame = {
      id: generateId(),
      title: `Frame ${(frames.length || 0) + 1}`,
      x: 0,
      y: 0,
      width: 480,
      height: 360,
      color: TAG_COLORS[(frames.length || 0) % TAG_COLORS.length] ?? 'rgba(255, 255, 255, 0.5)'
    };
    onUpdateFrames([...(frames ?? []), newFrame]);
    onUpdateNote(patchNoteFrameMembership(note, [newFrame.id], [...frames, newFrame]));
  }, [frames, note, onUpdateFrames, onUpdateNote]);

  const removeTag = useCallback(
    (tagId: string) => {
      onUpdateNote({ ...note, tags: note.tags.filter((t) => t.id !== tagId) });
    },
    [note, onUpdateNote]
  );

  const reorderTags = useCallback(
    (next: Tag[]) => {
      onUpdateNote({ ...note, tags: next });
    },
    [note, onUpdateNote]
  );

  const addTag = useCallback(() => {
    const label = tagLabel.trim();
    if (!label) return;
    const next: Note = {
      ...note,
      tags: [...note.tags, { id: generateId(), label, color: tagColor }]
    };
    onUpdateNote(next);
    setTagLabel('');
  }, [note, onUpdateNote, tagColor, tagLabel]);

  const openTagColorPortal = useCallback((anchor: HTMLElement) => {
    const r = anchor.getBoundingClientRect();
    const panelW = 260;
    const top = Math.min(r.bottom + 6, window.innerHeight - 12);
    const left = Math.min(Math.max(8, r.left), window.innerWidth - panelW - 8);
    setTagColorPortal({ top, left });
  }, []);

  const focusPeer = useCallback(
    (noteId: string) => {
      if (coordMode === 'map' && onFocusPeerOnMap) {
        onFocusPeerOnMap(noteId);
        return;
      }
      if (onFocusPeerInView) onFocusPeerInView(noteId);
    },
    [coordMode, onFocusPeerOnMap, onFocusPeerInView]
  );

  const peerLinkLabel =
    coordMode === 'map' ? '在地图上查看' : coordMode === 'board' ? '在看板中定位' : '在图中定位';

  return (
    <aside
      className={asideShellClass}
      style={panelChromeStyle}
      data-edit-inspector="body"
      data-workspace-link-target="inspector"
      onPointerDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      <div className="flex shrink-0 items-start justify-between gap-2 border-b border-gray-100 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
            {inspectorKindLabelForNote(note)}
          </div>
          {/* inline-flex + max-w-full：短标题时按钮贴紧文字；过长时整组不超过侧栏，标题省略 */}
          <div className="inline-flex max-w-full min-w-0 items-center gap-1.5">
            <span className="min-w-0 truncate text-sm font-semibold text-gray-900">
              {noteTitle(note)}
            </span>
            <button
              type="button"
              className={chromePanelGhostIconButtonClass}
              draggable={false}
              aria-label={!note.layerItemHidden ? '在图层中隐藏' : '在图层中显示'}
              title={!note.layerItemHidden ? '在图层中隐藏' : '在图层中显示'}
              onClick={() => onUpdateNote({ ...note, layerItemHidden: !note.layerItemHidden })}
              onPointerDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            >
              {!note.layerItemHidden ? (
                <Eye size={16} strokeWidth={2} aria-hidden />
              ) : (
                <EyeOff size={16} strokeWidth={2} aria-hidden />
              )}
            </button>
          </div>
        </div>
        {onOpenFullNoteEditor ? (
          <button
            type="button"
            className={inspectorHeaderPencilButtonClass}
            title="编辑便签"
            aria-label="编辑便签"
            onClick={() => onOpenFullNoteEditor(note.id)}
            onPointerDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            <Pencil size={16} className="shrink-0" strokeWidth={2} aria-hidden />
          </button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-3 py-3 theme-surface-scrollbar">
        {note.noteGroupId ? (
          <InspectorCollapsibleSection title="对象组" icon={<Users size={14} className="text-gray-500" />} themeColor={themeColor} defaultOpen={false}>
            <p className="text-[11px] leading-relaxed text-gray-500">
              与多选「成组」一致的轻量分组 ID（非 Frame）。
            </p>
            <code className="mt-1 block break-all rounded bg-gray-100 px-2 py-1 text-[10px] text-gray-800">{note.noteGroupId}</code>
          </InspectorCollapsibleSection>
        ) : null}

        {coordMode === 'map' ? (
          <InspectorCollapsibleSection title="地图坐标" icon={<MapPin size={14} className="text-gray-500" />} themeColor={themeColor}>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-[10px] text-gray-500">
                纬度
                <input
                  value={latStr}
                  onChange={(e) => setLatStr(e.target.value)}
                  className="mt-0.5 w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 font-mono text-xs outline-none focus:ring-2 focus:ring-offset-0"
                  style={{ ['--tw-ring-color' as string]: themeColor }}
                />
              </label>
              <label className="block text-[10px] text-gray-500">
                经度
                <input
                  value={lngStr}
                  onChange={(e) => setLngStr(e.target.value)}
                  className="mt-0.5 w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 font-mono text-xs outline-none focus:ring-2 focus:ring-offset-0"
                  style={{ ['--tw-ring-color' as string]: themeColor }}
                />
              </label>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={applyMapCoords}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-white shadow-sm"
                style={{ backgroundColor: themeColor }}
              >
                应用坐标
              </button>
              <button
                type="button"
                onClick={useMapCenter}
                disabled={!mapInstance}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                title="填入当前地图中心"
              >
                <Crosshair size={14} aria-hidden />
                使用地图中心
              </button>
            </div>
          </InspectorCollapsibleSection>
        ) : null}

        {coordMode === 'board' ? (
          <InspectorCollapsibleSection title="看板坐标" icon={<MapPin size={14} className="text-gray-500" />} themeColor={themeColor}>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-[10px] text-gray-500">
                boardX
                <input
                  value={bxStr}
                  onChange={(e) => setBxStr(e.target.value)}
                  className="mt-0.5 w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 font-mono text-xs outline-none focus:ring-2 focus:ring-offset-0"
                  style={{ ['--tw-ring-color' as string]: themeColor }}
                />
              </label>
              <label className="block text-[10px] text-gray-500">
                boardY
                <input
                  value={byStr}
                  onChange={(e) => setByStr(e.target.value)}
                  className="mt-0.5 w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 font-mono text-xs outline-none focus:ring-2 focus:ring-offset-0"
                  style={{ ['--tw-ring-color' as string]: themeColor }}
                />
              </label>
            </div>
            <button
              type="button"
              onClick={applyBoardCoords}
              className="mt-2 rounded-lg px-3 py-1.5 text-xs font-medium text-white shadow-sm"
              style={{ backgroundColor: themeColor }}
            >
              应用位置
            </button>
          </InspectorCollapsibleSection>
        ) : null}

        {coordMode === 'graph' ? (
          <>
            <InspectorCollapsibleSection title="Weight" themeColor={themeColor}>
              <SettingsCompactSlider
                label="节点权重"
                hint={<span className="text-[10px] text-gray-400">1 为默认</span>}
                themeColor={themeColor}
                value={clampNoteWeight(note.weight)}
                min={0.1}
                max={10}
                step={0.1}
                onChange={(weight) =>
                  onUpdateNote({ ...note, weight: clampNoteWeight(weight) })
                }
                formatValue={(weight) => weight.toFixed(1)}
                minCaption="轻"
                maxCaption="重"
              />
              {note.weight != null && clampNoteWeight(note.weight) !== DEFAULT_NOTE_WEIGHT ? (
                <button
                  type="button"
                  onClick={() => onUpdateNote({ ...note, weight: DEFAULT_NOTE_WEIGHT })}
                  className="mt-2 text-[10px] font-medium text-gray-500 hover:text-gray-800"
                >
                  重置为 1.0
                </button>
              ) : null}
              <p className="mt-1.5 text-[10px] leading-relaxed text-gray-400">
                调整节点自身的视觉大小；不影响连线权重。
              </p>
            </InspectorCollapsibleSection>
            <InspectorCollapsibleSection title="图谱位置" themeColor={themeColor} defaultOpen={false}>
              <p className="text-xs text-gray-400">节点位置由当前布局与拖拽决定。</p>
            </InspectorCollapsibleSection>
          </>
        ) : null}

        <InspectorCollapsibleSection title="Frame" icon={<Layers size={14} className="text-gray-500" />} themeColor={themeColor}>
          {frames.length === 0 ? (
            <p className="text-xs text-gray-400">
              {coordMode === 'graph'
                ? '项目中暂无 Frame；可在下方新建并归属当前便签。'
                : '项目中暂无簇；可在看板创建 Frame 后在此勾选归属。'}
            </p>
          ) : (
            <ul className="space-y-1">
              {frames.map((f) => (
                <li key={f.id}>
                  <label className="flex cursor-pointer items-center gap-2 px-0.5 py-1 text-xs hover:bg-gray-50/80 rounded-md">
                    <input
                      type="checkbox"
                      checked={groupIds.includes(f.id)}
                      onChange={() => toggleFrame(f.id)}
                      className="h-3.5 w-3.5 rounded border-gray-300"
                      style={{ accentColor: themeColor }}
                    />
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: f.color }} />
                    <span className="min-w-0 flex-1 truncate font-medium text-gray-800">{f.title}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {coordMode === 'graph' && onUpdateFrames ? (
            <button
              type="button"
              onClick={createFrameAndAssign}
              className="mt-2 inline-flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-gray-200 px-2 py-1.5 text-[11px] font-medium text-gray-600 hover:bg-gray-50"
            >
              <Plus size={12} aria-hidden />
              新建 Frame 并归属
            </button>
          ) : null}
        </InspectorCollapsibleSection>

        <InspectorCollapsibleSection title="标签" icon={<TagIcon size={14} className="text-gray-500" />} themeColor={themeColor}>
          {note.tags.length > 1 ? (
            <Reorder.Group
              axis="x"
              values={note.tags}
              onReorder={reorderTags}
              as="div"
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: '0.375rem'
              }}
            >
              {note.tags.map((t) => (
                <Reorder.Item
                  key={t.id}
                  value={t}
                  className="list-none"
                  whileDrag={{ scale: 1.04, zIndex: 20, cursor: 'grabbing' }}
                  style={{ cursor: 'grab' }}
                >
                  <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-gray-200/80 bg-white pl-2 pr-1 py-0.5 text-[11px]">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: t.color }} />
                    <span className="truncate text-gray-800">{t.label}</span>
                    <button
                      type="button"
                      onClick={() => removeTag(t.id)}
                      className="shrink-0 rounded-full p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                      aria-label={`移除标签 ${t.label}`}
                    >
                      <X size={12} />
                    </button>
                  </span>
                </Reorder.Item>
              ))}
            </Reorder.Group>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {note.tags.map((t) => (
                <span
                  key={t.id}
                  className="inline-flex max-w-full items-center gap-1 rounded-full border border-gray-200/80 bg-white pl-2 pr-1 py-0.5 text-[11px]"
                >
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: t.color }} />
                  <span className="truncate text-gray-800">{t.label}</span>
                  <button
                    type="button"
                    onClick={() => removeTag(t.id)}
                    className="shrink-0 rounded-full p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                    aria-label={`移除标签 ${t.label}`}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <p className="mt-1 text-[10px] text-gray-400">拖动标签可改顺序；首标签决定时间线分层与节点色</p>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <input
              value={tagLabel}
              onChange={(e) => setTagLabel(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
              placeholder="新标签…"
              className="min-w-[6rem] flex-1 rounded-lg border border-gray-200 px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-offset-0"
              style={{ ['--tw-ring-color' as string]: themeColor }}
            />
            <button
              type="button"
              title={`选色：${tagColor}`}
              aria-label="选择标签颜色"
              onClick={(e) => openTagColorPortal(e.currentTarget)}
              className="h-7 w-7 shrink-0 rounded-full border border-white/90 shadow-sm ring-1 ring-gray-200/80 transition-transform hover:scale-105"
              style={{ backgroundColor: tagColor }}
            />
            <button
              type="button"
              onClick={addTag}
              className="inline-flex items-center gap-0.5 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              <Plus size={14} aria-hidden />
              添加
            </button>
          </div>
          {tagColorPortal ? (
            <TagAddPanel
              themeColor={themeColor}
              panelChromeStyle={panelChromeStyle}
              title="选择标签颜色"
              label=""
              hideLabelInput
              selectedColor={tagColor}
              onLabelChange={() => {}}
              onColorChange={setTagColor}
              onApply={() => setTagColorPortal(null)}
              onDismissOutside={() => setTagColorPortal(null)}
              portalPlacement={tagColorPortal}
              applyLabel="完成"
              autoFocus={false}
              closeOnInteractOutside
            />
          ) : null}
        </InspectorCollapsibleSection>

        <InspectorCollapsibleSection
          title="关联（边）"
          icon={<Link2 size={14} className="text-gray-500" />}
          themeColor={themeColor}
          defaultOpen={false}
        >
          <div className="mb-2 flex justify-end">
            {hasConnectionWrite ? (
              <button
                type="button"
                onClick={onNewConnection}
                className="inline-flex items-center gap-0.5 rounded-md px-2 py-1 text-[11px] font-medium text-white"
                style={{ backgroundColor: themeColor }}
              >
                <Plus size={12} aria-hidden />
                新建
              </button>
            ) : null}
          </div>
          {relatedConnections.length === 0 ? (
            <p className="text-xs text-gray-400">
              {hasConnectionWrite ? '暂无与此点相连的边。' : '暂无关联；写入项目后可编辑连线。'}
            </p>
          ) : (
            <ul className="space-y-1">
              {relatedConnections.map((c) => {
                const otherId = c.fromNoteId === note.id ? c.toNoteId : c.fromNoteId;
                const other = noteById.get(otherId);
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      disabled={!hasConnectionWrite}
                      onClick={() => hasConnectionWrite && onEditConnection(c)}
                      className="flex w-full items-center gap-2 rounded-lg border border-gray-100 bg-gray-50/50 px-2 py-1.5 text-left text-xs shadow-sm hover:bg-gray-100 disabled:cursor-default disabled:opacity-70"
                    >
                      <span className="w-6 shrink-0 text-center font-mono text-gray-500" title="方向">
                        {edgeDirectionHint(c)}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium text-gray-800">{noteTitle(other)}</span>
                      {c.label ? (
                        <span className="max-w-[5rem] shrink-0 truncate text-[10px] text-gray-500" title={c.label}>
                          {c.label}
                        </span>
                      ) : null}
                      {hasConnectionWrite ? <Pencil size={12} className="shrink-0 text-gray-400" aria-hidden /> : null}
                    </button>
                    <button
                      type="button"
                      onClick={() => focusPeer(otherId)}
                      className="mt-0.5 w-full text-left text-[10px] text-gray-400 hover:text-gray-600"
                    >
                      {peerLinkLabel}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </InspectorCollapsibleSection>
      </div>
    </aside>
  );
}

export function EditInspectorPanel(props: EditInspectorPanelProps) {
  const { note, groupContext, coordMode, panelChromeStyle, inspectorFrame, inspectorConnection } = props;
  if (note) {
    return <EditInspectorPanelInner {...props} note={note} />;
  }
  if (inspectorFrame) {
    return (
      <EditInspectorFrameOnly
        frame={inspectorFrame}
        themeColor={props.themeColor}
        panelChromeStyle={panelChromeStyle}
        notes={props.notes}
        onUpdateFrame={props.onUpdateFrame}
      />
    );
  }
  if (inspectorConnection) {
    return (
      <EditInspectorEdgeOnly
        connection={inspectorConnection}
        coordMode={coordMode}
        themeColor={props.themeColor}
        panelChromeStyle={panelChromeStyle}
        notes={props.notes}
        hasConnectionWrite={props.hasConnectionWrite}
        onEditConnection={props.onEditConnection}
        onFocusPeerInView={props.onFocusPeerInView}
      />
    );
  }
  if (groupContext) {
    return (
      <EditInspectorGroupOnly
        groupContext={groupContext}
        coordMode={coordMode}
        themeColor={props.themeColor}
        panelChromeStyle={panelChromeStyle}
        connections={props.connections}
        notes={props.notes}
        hasConnectionWrite={props.hasConnectionWrite}
        onEditConnection={props.onEditConnection}
        mapInstance={props.mapInstance}
        onFocusPeerOnMap={props.onFocusPeerOnMap}
        onFocusPeerInView={props.onFocusPeerInView}
        frames={props.frames}
      />
    );
  }
  return <EditInspectorEmpty panelChromeStyle={panelChromeStyle} coordMode={coordMode} />;
}

/** @deprecated 使用 EditInspectorPanel */
export const MapEditInspectorPanel = EditInspectorPanel;
