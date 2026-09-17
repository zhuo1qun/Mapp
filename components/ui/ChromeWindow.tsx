import React, {
  useEffect,
  useRef,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
  type RefObject
} from 'react';
import { createPortal } from 'react-dom';
import type { MapChromeAppearance } from '../../utils/map/mapChromeStyle';
import { useChromeAppearance } from './chromeAppearanceContext';
import { useCompactViewport } from '../../utils/ui/useCompactViewport';
import { useStickyValue } from '../../utils/ui/useStickyValue';
import { AnchoredWorkspaceWindow } from './AnchoredWorkspaceWindow';
import { CompactWindowBackdrop } from './CompactWindowBackdrop';
import { ChromePresence, type ChromePresenceKind } from './ChromeSheetPresence';

export type ChromeWindowSurface = 'menu' | 'window' | 'layer';
export type ChromeWindowAlign = 'start' | 'end';
export type ChromeWindowPlacement = 'anchored' | 'center';

export type ChromeWindowProps = {
  open: boolean;
  onClose: () => void;
  backdropLabel: string;
  /** 宽屏锚定 top；窄屏由 `.ui-compact-bottom-sheet` 覆盖。 */
  top?: number | null;
  /** 画布锚点等：显式 left 时不再用 page-left/right。 */
  left?: number | null;
  /** 从下方锚定（如图谱预设）；与 top 同时有时优先 top。 */
  bottom?: number | null;
  align?: ChromeWindowAlign;
  placement?: ChromeWindowPlacement;
  appearance?: MapChromeAppearance;
  surface?: ChromeWindowSurface;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  /** 点在这些节点内不关（触发按钮、嵌套下拉）。 */
  dismissIgnoreRefs?: ReadonlyArray<RefObject<HTMLElement | null>>;
  panelRef?: RefObject<HTMLDivElement | null>;
  /** 窄屏形态：底部 sheet、全屏窗口，或保持宽屏几何。 */
  compactBehavior?: 'sheet' | 'fullscreen' | 'none';
  presenceKind?: ChromePresenceKind;
  exitDurationMs?: number;
  /** 为 false 时不贴页面左右缘，由 style 提供 left。 */
  pageEdge?: boolean;
  showBackdrop?: boolean;
  /** note-editor：开窗/关窗用图钉缩放；chrome：顶栏菜单/sheet。 */
  motion?: 'chrome' | 'note-editor';
  motionAnchor?: { x: number; y: number } | null;
  /** 外点关闭时是否截断事件（编辑器需挡住地图点选）。 */
  dismissStopEvent?: boolean;
} & Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'style' | 'className'>;

const NESTED_IGNORE_SELECTOR = [
  '[data-chrome-window-nested]',
  '[data-tag-add-panel]',
  '[data-note-time-range-panel]',
  '[data-note-emoji-picker]',
  '[data-workspace-link-keep]',
  '.km-theme-color-picker',
  '.note-editor-media-detail',
  '[role="dialog"][aria-modal="true"]'
].join(',');

function eventTargetElement(target: EventTarget | null): Element | null {
  if (target instanceof Element) return target;
  if (target instanceof Node) return target.parentElement;
  return null;
}

function cssLength(value: unknown, fallback: string): string {
  if (typeof value === 'number' && Number.isFinite(value)) return `${value}px`;
  if (typeof value === 'string' && value.trim()) return value;
  return fallback;
}

/**
 * 工作区唯一窗口外壳：portal、存在期、窄屏 sheet + 遮罩、外点/Escape 关闭。
 * 壳不随 children 类型卸载；定位↔新建只换菜单项。
 */
export const ChromeWindow: React.FC<ChromeWindowProps> = ({
  open,
  onClose,
  backdropLabel,
  top = null,
  left = null,
  bottom = null,
  align = 'start',
  placement = 'anchored',
  appearance: appearanceProp,
  surface = 'window',
  className = '',
  style,
  children,
  dismissIgnoreRefs,
  panelRef,
  compactBehavior = 'sheet',
  presenceKind,
  exitDurationMs,
  pageEdge = true,
  showBackdrop = true,
  motion = 'chrome',
  motionAnchor = null,
  dismissStopEvent = false,
  ...rootProps
}) => {
  const appearance = useChromeAppearance(appearanceProp);
  const compact = useCompactViewport();
  const ownPanelRef = useRef<HTMLDivElement>(null);
  const surfaceRef = panelRef ?? ownPanelRef;
  const centered = placement === 'center';
  const noteMotion = motion === 'note-editor';
  const stickyAnchor = useStickyValue(motionAnchor);
  const hasDesktopAnchor =
    top != null || left != null || bottom != null || centered || noteMotion;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      const el = eventTargetElement(target);
      if (el) {
        if (el.closest('[data-chrome-window-surface]') === surfaceRef.current) return;
        if (el.closest('[data-compact-window-backdrop]')) return;
        if (el.closest(NESTED_IGNORE_SELECTOR)) return;
      }
      if (dismissIgnoreRefs?.some((ref) => ref.current?.contains(target))) return;
      onClose();
      if (dismissStopEvent) {
        event.stopPropagation();
        event.stopImmediatePropagation();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // 嵌套对话框（如「设置 → 主题色」）不一定会把焦点移到自身。
      // 因此不能仅按 activeElement 判断；始终先让最后挂载的嵌套窗口处理 Escape。
      const nestedSurfaces = document.querySelectorAll<HTMLElement>(
        '[data-chrome-window-nested][data-chrome-window-surface]'
      );
      const topNestedSurface = nestedSurfaces.item(nestedSurfaces.length - 1);
      if (topNestedSurface && topNestedSurface !== surfaceRef.current) return;
      onClose();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [dismissIgnoreRefs, dismissStopEvent, onClose, open, surfaceRef]);

  if (typeof document === 'undefined') return null;
  if (!compact && !centered && !hasDesktopAnchor) return null;

  const edgeCls =
    !pageEdge || left != null || centered || noteMotion
      ? ''
      : align === 'end'
        ? 'ui-chrome-menu-page-right'
        : 'ui-chrome-menu-page-left';
  const positionedStyle: CSSProperties | undefined =
    compact && compactBehavior !== 'none' && !noteMotion
      ? style
      : {
          ...(top != null ? { top } : null),
          ...(left != null ? { left } : null),
          ...(top == null && bottom != null ? { bottom } : null),
          ...(centered ? { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' } : null),
          ...style,
          ...(noteMotion && stickyAnchor
            ? ({
                '--note-editor-anchor-x': `${stickyAnchor.x}px`,
                '--note-editor-anchor-y': `${stickyAnchor.y}px`,
                '--note-slot-top': cssLength(style?.top ?? top, '0px'),
                '--note-slot-left': cssLength(style?.left ?? left, '0px')
              } as CSSProperties)
            : null)
        };
  const resolvedPresence: ChromePresenceKind =
    presenceKind ?? (noteMotion ? 'dialog' : compact || centered ? 'sheet' : 'menu');
  const phaseClsPrefix = noteMotion ? 'chrome-note-slot' : 'chrome-responsive-anchored';
  const centerCls = centered && !noteMotion ? 'chrome-window-center' : '';
  const toneCls = `map-chrome-content-${appearance}`;
  const sheetCls =
    compactBehavior === 'none' || noteMotion
      ? 'fixed z-[var(--z-map-modal)]'
      : compactBehavior === 'fullscreen'
        ? 'ui-compact-fullscreen fixed z-[var(--z-map-modal)]'
        : 'ui-compact-bottom-sheet fixed z-[var(--z-map-anchored-panel)]';
  const morphCls = centered && !noteMotion ? '' : 'chrome-window-morph';
  const noteMotionCls = noteMotion ? 'chrome-note-slot' : '';
  const surfaceCls =
    surface === 'layer'
      ? 'map-layer-chrome-panel flex gap-2 items-start pointer-events-none'
      : surface === 'menu'
        ? 'rounded-xl border border-gray-100/80 py-1 shadow-xl'
        : 'overflow-hidden rounded-xl border border-gray-100/80 shadow-xl';

  return createPortal(
    <ChromePresence open={open} kind={resolvedPresence} exitDurationMs={exitDurationMs ?? (noteMotion ? 280 : undefined)}>
      {(phase) => {
        const phaseCls = `${phaseClsPrefix}-${phase}`;
        return (
          <>
            {showBackdrop && !noteMotion ? (
            <CompactWindowBackdrop
              phase={phase}
              onDismiss={onClose}
              ariaLabel={backdropLabel}
              always={centered}
            />
            ) : null}
            <AnchoredWorkspaceWindow
              {...rootProps}
              panelRef={surfaceRef}
              data-chrome-window-surface=""
              data-map-layer-chrome-panel={surface === 'layer' ? '' : undefined}
              className={`${toneCls} ${sheetCls} ${edgeCls} ${centerCls} ${surfaceCls} ${morphCls} ${noteMotionCls} ${phaseCls} ${className}`.trim()}
              style={positionedStyle}
            >
              {children}
            </AnchoredWorkspaceWindow>
          </>
        );
      }}
    </ChromePresence>,
    document.body
  );
};
