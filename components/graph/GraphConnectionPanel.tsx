import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Link2, Minus, MousePointer2, Plus, X } from 'lucide-react';
import type { Connection, Note } from '../../types';
import {
  clampConnectionWeight,
  DEFAULT_CONNECTION_WEIGHT
} from '../../utils/graph/graphData';
import { AnchoredWorkspaceWindow } from '../ui/AnchoredWorkspaceWindow';

export interface ConnectionDraft {
  fromNoteId: string;
  toNoteId: string;
  label: string;
  fromArrow: 'arrow' | 'none';
  toArrow: 'arrow' | 'none';
  /** 连线权重；旧数据缺省为 1 */
  weight: number;
}

/** 与 `connectionToGraphDirection` 一致：从存储的 Connection 还原面板上的起终点箭头选项 */
export function connectionToPanelDraft(c: Connection): ConnectionDraft {
  const fromArrow: 'arrow' | 'none' =
    c.fromArrow != null ? c.fromArrow : c.arrow === 'reverse' ? 'arrow' : 'none';
  const toArrow: 'arrow' | 'none' =
    c.toArrow != null ? c.toArrow : c.arrow === 'forward' ? 'arrow' : 'none';
  return {
    fromNoteId: c.fromNoteId,
    toNoteId: c.toNoteId,
    label: c.label || '',
    fromArrow,
    toArrow,
    weight: clampConnectionWeight(c.weight)
  };
}

function noteSearchText(note: Note): string {
  const t = (note.text || '').trim();
  const line = t.indexOf('\n') === -1 ? t : t.slice(0, t.indexOf('\n'));
  const head = line.replace(/^#+\s+/, '').trim().split(/[,，]/, 1)[0] || '';
  const raw = `${note.emoji || ''}${head}`.trim();
  return raw || '便签';
}

interface GraphConnectionPanelProps {
  isOpen: boolean;
  themeColor: string;
  panelChromeStyle?: React.CSSProperties;
  notes: Note[];
  draft: ConnectionDraft;
  onDraftChange: (patch: Partial<ConnectionDraft>) => void;
  panelEditingKey: string | 'new';
  pickTarget: 'from' | 'to' | null;
  onPickTargetChange: (t: 'from' | 'to' | null) => void;
  onCommit: () => void;
  onDelete: () => void;
  onNewConnection: () => void;
  onClose: () => void;
  /** 当前在编辑已有连线时，开始编辑起终点则切换为新建草稿（与「新建」一致） */
  onBeginEndpointEdit?: () => void;
  /** 图中点选节点后递增：清空检索词并失焦输入框，避免进入「检索输入」状态 */
  graphPickNonce?: number;
  /** 同时清除边选中、画布节点高亮与草稿起终点 */
  onClearGraphAndDraftSelection?: () => void;
  /** 仅清除起点（用于编辑时保留另一侧） */
  onClearFromSelection?: () => void;
  /** 仅清除终点（用于编辑时保留另一侧） */
  onClearToSelection?: () => void;
  /** 是否显示清除按钮（有边选中、点高亮或草稿起终点时） */
  showClearSelection?: boolean;
  /** 点击已选便签标题时在图中定位该节点 */
  onFocusNoteOnGraph?: (noteId: string) => void;
  /** GraphView：图中单击选中的节点；仅在「非点选状态」下点选按钮可一键填入 */
  graphFocusedNoteId?: string | null;
  /** 一键写入起点/终点（与图中点节点后的副作用一致） */
  onAddEndpointFromGraph?: (which: 'from' | 'to', noteId: string) => void;
  /** 禁用图中点选入口（例如 table 视图） */
  disableGraphPick?: boolean;
  /** 禁用点选时的提示文案 */
  graphPickDisabledHint?: string;
  /** 保存成功后递增，触发一次面板成功动效（GraphView 保存不关面板时传入） */
  saveSuccessNonce?: number;
  /** 保存成功后的动效/重置草稿期间，禁止再次提交 */
  commitDisabled?: boolean;
}

export const GraphConnectionPanel: React.FC<GraphConnectionPanelProps> = ({
  isOpen,
  themeColor,
  panelChromeStyle: ch,
  notes,
  draft,
  onDraftChange,
  panelEditingKey,
  pickTarget,
  onPickTargetChange,
  onCommit,
  onDelete,
  onNewConnection,
  onClose,
  onBeginEndpointEdit,
  graphPickNonce,
  onClearGraphAndDraftSelection,
  onClearFromSelection,
  onClearToSelection,
  showClearSelection,
  onFocusNoteOnGraph,
  graphFocusedNoteId = null,
  onAddEndpointFromGraph,
  disableGraphPick = false,
  graphPickDisabledHint = '请到 GraphView 选点',
  saveSuccessNonce,
  commitDisabled = false
}) => {
  const panelRootRef = useRef<HTMLDivElement>(null);
  const [qFrom, setQFrom] = useState('');
  const [qTo, setQTo] = useState('');
  const pickNoncePrev = useRef<number | undefined>(undefined);
  const saveNoncePrev = useRef<number | undefined>(undefined);
  const [saveFlashActive, setSaveFlashActive] = useState(false);

  useEffect(() => {
    if (graphPickNonce === undefined) return;
    if (pickNoncePrev.current === undefined) {
      pickNoncePrev.current = graphPickNonce;
      return;
    }
    if (pickNoncePrev.current === graphPickNonce) return;
    pickNoncePrev.current = graphPickNonce;
    setQFrom('');
    setQTo('');
    const root = panelRootRef.current;
    if (root) {
      root.querySelectorAll('input').forEach((inp) => {
        if (document.activeElement === inp) (inp as HTMLInputElement).blur();
      });
    }
  }, [graphPickNonce]);

  useEffect(() => {
    if (saveSuccessNonce === undefined) return;
    if (saveNoncePrev.current === undefined) {
      saveNoncePrev.current = saveSuccessNonce;
      return;
    }
    if (saveNoncePrev.current === saveSuccessNonce) return;
    saveNoncePrev.current = saveSuccessNonce;
    setSaveFlashActive(true);
    const t = window.setTimeout(() => setSaveFlashActive(false), 1200);
    return () => clearTimeout(t);
  }, [saveSuccessNonce]);

  const filteredFrom = useMemo(() => {
    const q = qFrom.trim().toLowerCase();
    if (!q) return [];
    return notes
      .filter((n) => noteSearchText(n).toLowerCase().includes(q) || n.id.toLowerCase().includes(q))
      .slice(0, 12);
  }, [notes, qFrom]);

  const filteredTo = useMemo(() => {
    const q = qTo.trim().toLowerCase();
    if (!q) return [];
    return notes
      .filter((n) => noteSearchText(n).toLowerCase().includes(q) || n.id.toLowerCase().includes(q))
      .slice(0, 12);
  }, [notes, qTo]);

  const fromNote = draft.fromNoteId ? notes.find((n) => n.id === draft.fromNoteId) : undefined;
  const toNote = draft.toNoteId ? notes.find((n) => n.id === draft.toNoteId) : undefined;

  const draftCommitReady =
    !!fromNote && !!toNote && draft.fromNoteId !== draft.toNoteId;

  const isNewConnection = panelEditingKey === 'new';

  /** 仅有图中/边选中且草稿尚未填起终点时：在标题栏提供一次性清除（与行末减号分工）。 */
  const showHeaderClearGraphSelection =
    isNewConnection &&
    !!onClearGraphAndDraftSelection &&
    !!showClearSelection &&
    !draft.fromNoteId &&
    !draft.toNoteId &&
    pickTarget == null;

  /**
   * 行末按钮：该端已在草稿中选便签 → 减号（清除该端 + 退出点选）；否则 → 加号（点选 / 一键填入）。
   * 与规则一致：新建与编辑共用；选点态下按减号由 clear* 回调同时清 pickTarget。
   */
  const fromSlotIsMinus = !!fromNote;
  const toSlotIsMinus = !!toNote;

  const beginEndpointEditIfNeeded = () => {
    if (panelEditingKey !== 'new') {
      onBeginEndpointEdit?.();
    }
  };

  /**
   * 该端空槽是否可用「一键填入」：图中有选中节点、非点选态，且该节点尚未被另一端占用。
   * （否则另一端只能选点，或先选中别的节点再一键填入。）
   */
  const canOneClickFill = (which: 'from' | 'to') =>
    pickTarget == null &&
    !disableGraphPick &&
    !!onAddEndpointFromGraph &&
    !!graphFocusedNoteId &&
    notes.some((n) => n.id === graphFocusedNoteId) &&
    (which === 'from' ? graphFocusedNoteId !== draft.toNoteId : graphFocusedNoteId !== draft.fromNoteId);

  /** 加号 = 一键填入；指针 = 选点或本侧点选进行中 */
  const pickOrFillIcon = (which: 'from' | 'to') => {
    if (pickTarget === which) {
      return <MousePointer2 size={16} strokeWidth={2} className="shrink-0" aria-hidden />;
    }
    if (canOneClickFill(which)) {
      return <Plus size={16} strokeWidth={2.25} className="shrink-0" aria-hidden />;
    }
    return <MousePointer2 size={16} strokeWidth={2} className="shrink-0" aria-hidden />;
  };

  const fillFromGraphOrPick = (which: 'from' | 'to') => {
    if (disableGraphPick) return;
    beginEndpointEditIfNeeded();
    if (pickTarget === which) {
      onPickTargetChange(null);
      return;
    }
    if (pickTarget == null) {
      const nid = graphFocusedNoteId;
      if (nid && notes.some((n) => n.id === nid) && onAddEndpointFromGraph && canOneClickFill(which)) {
        onAddEndpointFromGraph(which, nid);
        return;
      }
      onPickTargetChange(which);
      return;
    }
    onPickTargetChange(which);
  };

  /**
   * 图中点选节点后 pickTarget 会被清空，但 draft 仍带 fromNoteId —— 仅靠 pickTarget === 'from' 无法清空。
   * 聚焦/点按输入框：仅用于退出对侧点选，或在本侧处于「点选模式」时放弃点选并清空以便检索；
   * 已有已选节点时点击框体不再清空（避免误触取消）。
   */
  const onFromInputFocus = () => {
    if (pickTarget === 'from') {
      onPickTargetChange(null);
      onDraftChange({ fromNoteId: '' });
      setQFrom('');
    } else if (pickTarget === 'to') {
      onPickTargetChange(null);
    }
  };
  const onFromInputPointerDown = () => {
    if (panelEditingKey !== 'new') {
      onBeginEndpointEdit?.();
      return;
    }
    if (pickTarget === 'to') onPickTargetChange(null);
    if (pickTarget === 'from') {
      onPickTargetChange(null);
      onDraftChange({ fromNoteId: '' });
      setQFrom('');
    }
  };
  const onToInputFocus = () => {
    if (pickTarget === 'to') {
      onPickTargetChange(null);
      onDraftChange({ toNoteId: '' });
      setQTo('');
    } else if (pickTarget === 'from') {
      onPickTargetChange(null);
    }
  };
  const onToInputPointerDown = () => {
    if (panelEditingKey !== 'new') {
      onBeginEndpointEdit?.();
      return;
    }
    if (pickTarget === 'from') onPickTargetChange(null);
    if (pickTarget === 'to') {
      onPickTargetChange(null);
      onDraftChange({ toNoteId: '' });
      setQTo('');
    }
  };

  if (!isOpen) return null;

  return (
    <AnchoredWorkspaceWindow
      panelRef={panelRootRef}
      className={`fixed top-[calc(3rem+0.75rem)] sm:top-[calc(4rem+0.75rem)] ui-workspace-left z-[520] w-[min(100%-1rem,22rem)] max-h-[calc(100dvh-3.75rem-1rem-env(safe-area-inset-bottom,0px))] sm:max-h-[calc(100dvh-4.75rem-1rem-env(safe-area-inset-bottom,0px))] overflow-y-auto rounded-2xl border shadow-xl p-4 text-sm ${
        ch ? 'border-gray-100/80' : 'border-white/50 map-chrome-surface-fallback'
      }`}
      style={ch}
    >
      {saveFlashActive ? (
        <div
          className="pointer-events-none absolute inset-0 z-[15] flex items-center justify-center rounded-2xl bg-white/65 backdrop-blur-sm graph-save-overlay-in"
          aria-live="polite"
          aria-atomic
        >
          <div
            className="flex items-center justify-center px-4 py-3 graph-save-overlay-content-in"
            aria-label="已保存"
          >
            <CheckCircle2
              className="w-12 h-12"
              style={{ color: themeColor }}
              strokeWidth={1.85}
              aria-hidden
            />
          </div>
        </div>
      ) : null}
      <div
        className={`space-y-3 relative z-0 ${saveFlashActive ? 'opacity-40' : 'opacity-100'} transition-opacity duration-500 ease-out`}
      >
        <div className="flex justify-between items-center gap-2">
          <span className="font-bold text-gray-800 flex items-center gap-2 min-w-0">
            <Link2 size={18} className="shrink-0 opacity-80" />
            <span className="truncate">关联</span>
          </span>
          <div className="flex items-center gap-1 shrink-0">
            {showHeaderClearGraphSelection ? (
              <button
                type="button"
                onClick={onClearGraphAndDraftSelection}
                className="rounded-lg p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors leading-none"
                title="清除图中选中"
                aria-label="清除图中选中"
              >
                <Minus size={16} strokeWidth={2.25} />
              </button>
            ) : null}
            <button
              type="button"
              onClick={onNewConnection}
              className="text-[11px] px-2 py-1 rounded-lg text-gray-600 hover:bg-gray-100 font-medium"
            >
              新建
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors leading-none"
              aria-label="关闭面板"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-500 tracking-wide block">起点</label>
          <div className="flex gap-1.5 items-stretch">
            <div
              onPointerDown={!fromNote ? onFromInputPointerDown : undefined}
              className={`flex h-9 min-w-0 flex-1 items-center gap-2 rounded-xl bg-white px-3 transition-[box-shadow,border-color] ${
                fromNote ? 'border-2 shadow-sm' : 'border border-gray-200/80'
              }`}
              style={
                fromNote
                  ? { borderColor: themeColor, boxShadow: `0 0 0 1px ${themeColor}33` }
                  : undefined
              }
            >
              {fromNote ? (
                <button
                  type="button"
                  onClick={() => onFocusNoteOnGraph?.(fromNote.id)}
                  className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-gray-900 h-full min-h-0 py-0 rounded-lg hover:bg-gray-50/80 transition-colors -mx-1 px-1 flex items-center"
                  title="在图中定位"
                >
                  {noteSearchText(fromNote)}
                </button>
              ) : (
                <input
                  type="text"
                  value={qFrom}
                  onChange={(e) => setQFrom(e.target.value)}
                  onFocus={onFromInputFocus}
                  placeholder={pickTarget === 'from' ? '在图中点击节点作为起点' : '搜索'}
                  className="min-w-0 flex-1 h-full border-0 bg-transparent py-0 text-sm leading-normal outline-none focus:ring-2 focus:ring-inset focus:ring-offset-0 placeholder:text-gray-400"
                  style={{ ['--tw-ring-color' as string]: themeColor }}
                />
              )}
            </div>
            {fromSlotIsMinus && onClearGraphAndDraftSelection ? (
              <button
                type="button"
                onClick={onClearFromSelection ?? onClearGraphAndDraftSelection}
                className="shrink-0 self-center rounded-lg p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors leading-none w-9 h-9 flex items-center justify-center"
                title="清除边与点的选中"
                aria-label="清除边与点的选中"
              >
                <Minus size={16} strokeWidth={2.25} />
              </button>
            ) : (
              <button
                type="button"
                title={
                  disableGraphPick
                    ? graphPickDisabledHint
                    : pickTarget === 'from'
                      ? '取消图中点选'
                      : canOneClickFill('from')
                        ? '将图中当前选中节点设为起点'
                        : '在图中点选起点'
                }
                disabled={disableGraphPick}
                onClick={() => fillFromGraphOrPick('from')}
                className={`shrink-0 self-center rounded-lg p-1.5 border-0 shadow-none outline-none ring-0 transition-colors focus-visible:ring-0 w-9 h-9 flex items-center justify-center ${
                  disableGraphPick
                    ? 'text-gray-300 bg-gray-100 cursor-not-allowed'
                    : pickTarget === 'from'
                    ? 'text-gray-800 bg-gray-200/45'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100/60'
                }`}
              >
                {pickOrFillIcon('from')}
              </button>
            )}
          </div>
          {filteredFrom.length > 0 && (
            <ul className="max-h-28 overflow-y-auto rounded-lg border border-gray-100 divide-y divide-gray-50">
              {filteredFrom.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className={`w-full text-left px-2 py-1.5 text-xs hover:bg-gray-50 truncate ${
                      draft.fromNoteId === n.id ? 'bg-gray-100 font-medium' : ''
                    }`}
                    onClick={() => {
                      beginEndpointEditIfNeeded();
                      onDraftChange({ fromNoteId: n.id });
                      setQFrom('');
                      onFocusNoteOnGraph?.(n.id);
                    }}
                  >
                    {noteSearchText(n)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-500 tracking-wide block">终点</label>
          <div className="flex gap-1.5 items-stretch">
            <div
              onPointerDown={!toNote ? onToInputPointerDown : undefined}
              className={`flex h-9 min-w-0 flex-1 items-center gap-2 rounded-xl bg-white px-3 transition-[box-shadow,border-color] ${
                toNote ? 'border-2 shadow-sm' : 'border border-gray-200/80'
              }`}
              style={
                toNote
                  ? { borderColor: themeColor, boxShadow: `0 0 0 1px ${themeColor}33` }
                  : undefined
              }
            >
              {toNote ? (
                <button
                  type="button"
                  onClick={() => onFocusNoteOnGraph?.(toNote.id)}
                  className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-gray-900 h-full min-h-0 py-0 rounded-lg hover:bg-gray-50/80 transition-colors -mx-1 px-1 flex items-center"
                  title="在图中定位"
                >
                  {noteSearchText(toNote)}
                </button>
              ) : (
                <input
                  type="text"
                  value={qTo}
                  onChange={(e) => setQTo(e.target.value)}
                  onFocus={onToInputFocus}
                  placeholder={pickTarget === 'to' ? '在图中点击节点作为终点' : '搜索'}
                  className="min-w-0 flex-1 h-full border-0 bg-transparent py-0 text-sm leading-normal outline-none focus:ring-2 focus:ring-inset focus:ring-offset-0 placeholder:text-gray-400"
                  style={{ ['--tw-ring-color' as string]: themeColor }}
                />
              )}
            </div>
            {toSlotIsMinus && onClearGraphAndDraftSelection ? (
              <button
                type="button"
                onClick={onClearToSelection ?? onClearGraphAndDraftSelection}
                className="shrink-0 self-center rounded-lg p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors leading-none w-9 h-9 flex items-center justify-center"
                title="清除边与点的选中"
                aria-label="清除边与点的选中"
              >
                <Minus size={16} strokeWidth={2.25} />
              </button>
            ) : (
              <button
                type="button"
                title={
                  disableGraphPick
                    ? graphPickDisabledHint
                    : pickTarget === 'to'
                      ? '取消图中点选'
                      : canOneClickFill('to')
                        ? '将图中当前选中节点设为终点'
                        : '在图中点选终点'
                }
                disabled={disableGraphPick}
                onClick={() => fillFromGraphOrPick('to')}
                className={`shrink-0 self-center rounded-lg p-1.5 border-0 shadow-none outline-none ring-0 transition-colors focus-visible:ring-0 w-9 h-9 flex items-center justify-center ${
                  disableGraphPick
                    ? 'text-gray-300 bg-gray-100 cursor-not-allowed'
                    : pickTarget === 'to'
                    ? 'text-gray-800 bg-gray-200/45'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100/60'
                }`}
              >
                {pickOrFillIcon('to')}
              </button>
            )}
          </div>
          {filteredTo.length > 0 && (
            <ul className="max-h-28 overflow-y-auto rounded-lg border border-gray-100 divide-y divide-gray-50">
              {filteredTo.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className={`w-full text-left px-2 py-1.5 text-xs hover:bg-gray-50 truncate ${
                      draft.toNoteId === n.id ? 'bg-gray-100 font-medium' : ''
                    }`}
                    onClick={() => {
                      beginEndpointEditIfNeeded();
                      onDraftChange({ toNoteId: n.id });
                      setQTo('');
                      onFocusNoteOnGraph?.(n.id);
                    }}
                  >
                    {noteSearchText(n)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex gap-2">
          <div className="min-w-0 flex-[2] space-y-1">
            <label className="text-xs font-semibold text-gray-500 tracking-wide">关系</label>
            <input
              value={draft.label}
              onChange={(e) => onDraftChange({ label: e.target.value })}
              className="w-full h-9 px-3 py-0 rounded-xl border border-gray-200/80 bg-white text-sm leading-normal outline-none focus:ring-2 focus:ring-offset-0"
              style={{ ['--tw-ring-color' as string]: themeColor }}
            />
          </div>
          <div className="w-[5.5rem] shrink-0 space-y-1">
            <label className="text-xs font-semibold text-gray-500 tracking-wide">权重</label>
            <input
              type="number"
              min={0.1}
              max={10}
              step={0.1}
              value={Number.isFinite(draft.weight) ? draft.weight : DEFAULT_CONNECTION_WEIGHT}
              onChange={(e) => {
                const v = Number(e.target.value);
                onDraftChange({
                  weight: Number.isFinite(v) ? v : DEFAULT_CONNECTION_WEIGHT
                });
              }}
              onBlur={() =>
                onDraftChange({ weight: clampConnectionWeight(draft.weight) })
              }
              className="w-full h-9 px-2 py-0 rounded-xl border border-gray-200/80 bg-white text-sm leading-normal tabular-nums outline-none focus:ring-2 focus:ring-offset-0"
              style={{ ['--tw-ring-color' as string]: themeColor }}
              title="连线权重（旧数据默认 1）；越大力导弹簧越硬"
            />
          </div>
        </div>

        <div className="flex gap-2">
          <div className="flex-1 space-y-1">
            <label className="text-[10px] font-semibold text-gray-500">起点端</label>
            <select
              value={draft.fromArrow}
              onChange={(e) => onDraftChange({ fromArrow: e.target.value as 'arrow' | 'none' })}
              className="w-full text-xs px-2 py-1.5 rounded-lg border border-gray-200 bg-white"
            >
              <option value="none">无</option>
              <option value="arrow">←</option>
            </select>
          </div>
          <div className="flex-1 space-y-1">
            <label className="text-[10px] font-semibold text-gray-500">终点端</label>
            <select
              value={draft.toArrow}
              onChange={(e) => onDraftChange({ toArrow: e.target.value as 'arrow' | 'none' })}
              className="w-full text-xs px-2 py-1.5 rounded-lg border border-gray-200 bg-white"
            >
              <option value="none">无</option>
              <option value="arrow">→</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          {panelEditingKey === 'new' && (
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
            >
              取消
            </button>
          )}
          <button
            type="button"
            onClick={onCommit}
            disabled={commitDisabled || !draftCommitReady}
            className={`flex-1 min-w-[6rem] py-2.5 rounded-xl text-xs font-semibold text-theme-chrome-fg shadow-sm transition-opacity ${
              commitDisabled || !draftCommitReady
                ? 'opacity-50 cursor-not-allowed pointer-events-none'
                : 'hover:opacity-90'
            }`}
            style={{ backgroundColor: themeColor }}
          >
            保存
          </button>
          {panelEditingKey !== 'new' && (
            <button
              type="button"
              onClick={onDelete}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors"
            >
              删除
            </button>
          )}
        </div>
      </div>
    </AnchoredWorkspaceWindow>
  );
};
