import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Core } from 'cytoscape';
import { Check, Minus, Pencil, Search, X } from 'lucide-react';
import type { Note } from '../../types';
import { graphNoteSearchLabel } from '../../utils/graph/graphData';
import { ChromeDownloadMenu } from '../ui/ChromeDownloadMenu';
import { ChromeIconButton } from '../ui/ChromeIconButton';
import { PortalTooltip } from '../ui/PortalTooltip';
import { WORKSPACE_TRANSIENT_DISMISS_EVENT } from '../../utils/ui/workspaceTransientDismiss';

type DownloadItem = { id: string; label: string; onSelect: () => void };

function bboxIntersectsExtent(
  bb: { x1: number; y1: number; x2: number; y2: number },
  ext: { x1: number; y1: number; x2: number; y2: number }
): boolean {
  return !(bb.x2 < ext.x1 || bb.x1 > ext.x2 || bb.y2 < ext.y1 || bb.y1 > ext.y2);
}

function isGraphCyNoteNode(cy: Core, id: string): boolean {
  const n = cy.getElementById(id);
  if (n.empty() || !n.isNode()) return false;
  if (n.hasClass('frame-cluster-label') || n.hasClass('frame-cluster-halo')) return false;
  // 图层隐藏的节点仍可被搜索定位（仅排除簇装饰节点）
  return true;
}

type Props = {
  isUIVisible: boolean;
  themeColor: string;
  chromeSurfaceStyle?: React.CSSProperties;
  chromeHoverBackground?: string;
  graphDownloadItems: DownloadItem[];
  isGraphToolbarEditMode: boolean;
  setIsGraphToolbarEditMode: React.Dispatch<React.SetStateAction<boolean>>;
  notes: Note[];
  cyRef: React.RefObject<Core | null>;
  onLocateNote: (noteId: string) => void;
  /** cy 重建时用于重新挂载 viewport 监听 */
  graphCyKey: string;
  /** 与右侧属性面板错开 */
  reserveRightForInspector?: boolean;
};

export const GraphTopRightToolbar: React.FC<Props> = ({
  isUIVisible,
  themeColor,
  chromeSurfaceStyle: ch,
  chromeHoverBackground,
  graphDownloadItems,
  isGraphToolbarEditMode,
  setIsGraphToolbarEditMode,
  notes,
  cyRef,
  onLocateNote,
  graphCyKey,
  reserveRightForInspector = false
}) => {
  const [searchOpen, setSearchOpen] = useState(false);
  const [q, setQ] = useState('');
  const [viewportTick, setViewportTick] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (searchOpen) {
      inputRef.current?.focus();
      setQ('');
    }
  }, [searchOpen]);

  useEffect(() => {
    if (!searchOpen) return;
    const cy = cyRef.current;
    if (!cy) return;
    const onVp = () => setViewportTick((t) => t + 1);
    cy.on('viewport', onVp);
    return () => {
      cy.removeListener('viewport', onVp);
    };
  }, [searchOpen, graphCyKey, cyRef]);

  const pickResults = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) {
      return { shown: [] as Note[], shownInView: [] as Note[], shownOther: [] as Note[] };
    }
    const cy = cyRef.current;
    const base = cy ? notes.filter((n) => isGraphCyNoteNode(cy, n.id)) : notes;
    const matched = base.filter(
      (n) =>
        graphNoteSearchLabel(n).toLowerCase().includes(query) || n.id.toLowerCase().includes(query)
    );
    if (!cy || matched.length === 0) {
      const shown = matched.slice(0, 10);
      return { shown, shownInView: [], shownOther: shown };
    }
    const ext = cy.extent();
    const inView: Note[] = [];
    const outView: Note[] = [];
    for (const n of matched) {
      const el = cy.getElementById(n.id);
      if (el.empty()) continue;
      const bb = el.boundingBox({ includeLabels: true });
      if (bboxIntersectsExtent(bb, ext)) inView.push(n);
      else outView.push(n);
    }
    const combined = inView.length > 0 ? [...inView, ...outView] : [...outView];
    const shown = combined.slice(0, 10);
    const inSet = new Set(inView.map((x) => x.id));
    const shownInView = shown.filter((n) => inSet.has(n.id));
    const shownOther = shown.filter((n) => !inSet.has(n.id));
    return { shown, shownInView, shownOther };
  }, [notes, q, viewportTick, cyRef]);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setQ('');
  }, []);

  const clearQuery = useCallback(() => {
    setQ('');
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    window.addEventListener(WORKSPACE_TRANSIENT_DISMISS_EVENT, closeSearch);
    return () => window.removeEventListener(WORKSPACE_TRANSIENT_DISMISS_EVENT, closeSearch);
  }, [closeSearch]);

  useEffect(() => {
    if (!searchOpen) return;
    const onDoc = (e: MouseEvent) => {
      const el = wrapRef.current;
      if (!el || el.contains(e.target as Node)) return;
      closeSearch();
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [searchOpen, closeSearch]);

  const onPick = (id: string) => {
    onLocateNote(id);
    setQ('');
    inputRef.current?.focus();
  };

  const searchChromeBar = (
    <div
      ref={wrapRef}
      className="relative flex flex-col items-stretch"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        className="relative flex h-10 sm:h-12 items-stretch overflow-hidden rounded-xl border border-gray-100/80 shadow-lg"
        style={ch}
      >
        <Search size={16} className="pointer-events-none absolute left-2.5 top-1/2 z-[1] -translate-y-1/2 text-gray-400 sm:left-3" />
        <input
          ref={inputRef}
          type="text"
          autoComplete="off"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              closeSearch();
            }
            if (e.key === 'Enter' && pickResults.shown.length > 0) {
              e.preventDefault();
              onPick(pickResults.shown[0].id);
            }
          }}
          placeholder="定位节点…"
          className="min-w-[8rem] w-36 max-w-[14rem] flex-1 border-0 bg-transparent py-0 pl-9 pr-1 text-xs outline-none focus:ring-0 sm:w-48 sm:max-w-[18rem] sm:pl-10 sm:text-sm"
          style={{ ['--tw-ring-color' as string]: themeColor }}
          aria-autocomplete="list"
          aria-expanded={pickResults.shown.length > 0 && q.trim() !== ''}
        />
        <PortalTooltip content="清空" compact>
          <button
            type="button"
            onClick={clearQuery}
            disabled={q.length === 0}
            className="shrink-0 border-0 bg-transparent px-1.5 text-gray-400 hover:bg-black/[0.04] hover:text-gray-700 disabled:pointer-events-none disabled:opacity-30"
            aria-label="清空"
          >
            <Minus size={18} strokeWidth={2.25} />
          </button>
        </PortalTooltip>
        <PortalTooltip content="关闭" compact>
          <button
            type="button"
            onClick={closeSearch}
            className="shrink-0 border-0 bg-transparent px-2 text-gray-400 hover:bg-black/[0.04] hover:text-gray-700"
            aria-label="关闭"
          >
            <X size={18} strokeWidth={2.25} />
          </button>
        </PortalTooltip>
      </div>
      {pickResults.shown.length > 0 && q.trim() !== '' ? (
        <ul
          className="absolute left-0 right-0 top-[calc(100%+0.25rem)] z-[600] max-h-52 min-w-0 overflow-y-auto rounded-xl border border-gray-100/80 bg-white/95 py-1 text-left shadow-xl backdrop-blur-sm"
          role="listbox"
        >
          {pickResults.shownInView.length > 0 ? (
            <>
              <li className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                当前视口
              </li>
              {pickResults.shownInView.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    role="option"
                    className="w-full truncate px-3 py-2 text-left text-xs hover:bg-gray-50 sm:text-sm"
                    onClick={() => onPick(n.id)}
                  >
                    {graphNoteSearchLabel(n)}
                  </button>
                </li>
              ))}
            </>
          ) : null}
          {pickResults.shownOther.length > 0 && pickResults.shownInView.length > 0 ? (
            <li className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              其他
            </li>
          ) : null}
          {pickResults.shownOther.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                role="option"
                className="w-full truncate px-3 py-2 text-left text-xs hover:bg-gray-50 sm:text-sm"
                onClick={() => onPick(n.id)}
              >
                {graphNoteSearchLabel(n)}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );

  if (isUIVisible) {
    return (
      <div
        data-allow-context-menu
        className={`fixed top-2 sm:top-4 z-[500] flex flex-col gap-2 items-end pointer-events-none ${
          reserveRightForInspector
            ? 'right-2 sm:right-4 lg:right-[calc(20rem+0.75rem)]'
            : 'right-2 sm:right-4'
        }`}
      >
        <div
          className="flex h-10 sm:h-12 items-center gap-1.5 sm:gap-2 pointer-events-auto"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {!searchOpen ? (
            <ChromeIconButton
              chromeSurfaceStyle={ch}
              chromeHoverBackground={chromeHoverBackground}
              nonChromeIdleHover="imperative-gray100"
              onClick={() => setSearchOpen(true)}
              tooltip="检索"
              aria-label="检索"
            >
              <Search size={18} className="sm:w-5 sm:h-5" />
            </ChromeIconButton>
          ) : (
            searchChromeBar
          )}
          <ChromeDownloadMenu
            chromeSurfaceStyle={ch}
            chromeHoverBackground={chromeHoverBackground}
            title="导出"
            items={graphDownloadItems}
          />
          {!isGraphToolbarEditMode ? (
            <ChromeIconButton
              chromeSurfaceStyle={ch}
              chromeHoverBackground={chromeHoverBackground}
              nonChromeIdleHover="imperative-gray100"
              onClick={() => setIsGraphToolbarEditMode(true)}
              tooltip="编辑"
            >
              <Pencil size={18} className="sm:w-5 sm:h-5" />
            </ChromeIconButton>
          ) : (
            <PortalTooltip content="完成" compact>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsGraphToolbarEditMode(false);
                }}
                onPointerDown={(e) => e.stopPropagation()}
                className="flex h-10 sm:h-12 items-center gap-1 sm:gap-2 px-2 sm:px-3 text-sm text-theme-chrome-fg rounded-xl shadow-lg font-bold"
                style={{ backgroundColor: themeColor }}
                aria-label="完成"
              >
                <Check size={18} className="sm:w-5 sm:h-5" />
                <span className="hidden sm:inline">Done</span>
              </button>
            </PortalTooltip>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      data-allow-context-menu
      className={`fixed top-2 sm:top-4 z-[500] pointer-events-auto flex h-10 sm:h-12 items-center gap-1.5 ${
        reserveRightForInspector
            ? 'right-2 sm:right-4 lg:right-[calc(20rem+0.75rem)]'
            : 'right-2 sm:right-4'
      }`}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {!searchOpen ? (
        <ChromeIconButton
          chromeSurfaceStyle={ch}
          chromeHoverBackground={chromeHoverBackground}
          nonChromeIdleHover="imperative-gray100"
          onClick={() => setSearchOpen(true)}
          tooltip="检索"
          aria-label="检索"
        >
          <Search size={18} className="sm:w-5 sm:h-5" />
        </ChromeIconButton>
      ) : (
        searchChromeBar
      )}
      <ChromeDownloadMenu
        chromeSurfaceStyle={ch}
        chromeHoverBackground={chromeHoverBackground}
        title="导出"
        items={graphDownloadItems}
      />
    </div>
  );
};
