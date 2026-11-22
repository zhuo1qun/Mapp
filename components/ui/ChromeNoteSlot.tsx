import React, {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject
} from 'react';
import type { MapChromeAppearance } from '../../utils/map/mapChromeStyle';
import { useStickyValue } from '../../utils/ui/useStickyValue';
import { useCompactViewport } from '../../utils/ui/useCompactViewport';
import { ChromeWindow } from './ChromeWindow';

export type ChromeNoteSlotSpec = {
  className?: string;
  style?: CSSProperties;
  backdropLabel: string;
  children: ReactNode;
  'aria-label'?: string;
};

/** Map、Board 共用的编辑器几何：桌面居中；窄屏与上拉展开后的设置窗口一致。 */
export function chromeNoteEditorSlotLayout(
  compact: boolean,
  surfaceStyle: CSSProperties
): Pick<ChromeNoteSlotSpec, 'className' | 'style'> {
  if (compact) {
    const expandedTop = 'max(3rem, calc(var(--app-safe-top, 0px) + 1rem))';
    return {
      className: 'chrome-note-slot--editor flex min-h-0 flex-col',
      style: {
        top: expandedTop,
        right: 0,
        bottom: 0,
        left: 0,
        translate: 'none',
        width: '100vw',
        height: `calc(100dvh - ${expandedTop})`,
        maxHeight: `calc(100dvh - ${expandedTop})`,
        paddingBottom: 0,
        borderRadius: '1rem 1rem 0 0',
        ...surfaceStyle
      }
    };
  }

  return {
    className: 'chrome-note-slot--editor-centered flex min-h-[300px] min-w-0 flex-col',
    style: {
      top: '50dvh',
      left: 'calc(var(--workspace-ui-left-inset, 0px) + (100vw - var(--workspace-ui-left-inset, 0px) - min(500px, calc(100vw - 2rem))) / 2)',
      width: 'min(500px, calc(100vw - 2rem))',
      // 预览卡的自然高度可平滑展开到稳定的编辑器工作区，避免内容挂载时外壳跳高。
      height: 'min(42rem, 90dvh)',
      maxHeight: '90dvh',
      ...surfaceStyle
    }
  };
}

type ChromeNoteSlotProps<K extends string> = {
  kind: K | null;
  onClose: () => void;
  appearance?: MapChromeAppearance;
  motionAnchor?: { x: number; y: number } | null;
  dismissIgnoreRefs?: ReadonlyArray<RefObject<HTMLElement | null>>;
  resolve: (kind: K) => ChromeNoteSlotSpec;
};

/**
 * 工作区预览卡 + NoteEditor 共用槽：壳不随 kind 卸载。
 * 开窗/关窗用 NoteEditor 的图钉缩放；kind 切换只换内容并过渡尺寸/位置。
 */
export function ChromeNoteSlot<K extends string>({
  kind,
  onClose,
  appearance,
  motionAnchor = null,
  dismissIgnoreRefs,
  resolve
}: ChromeNoteSlotProps<K>) {
  const compact = useCompactViewport();
  const sticky = useStickyValue(kind);
  const previousKindRef = useRef<K | null>(sticky);
  const previousSpecRef = useRef<ChromeNoteSlotSpec | null>(null);
  const switchTimerRef = useRef<number | null>(null);
  const [outgoingChildren, setOutgoingChildren] = useState<ReactNode | null>(null);
  const spec = sticky == null ? null : resolve(sticky);

  // 预览与编辑器共用外壳，但内容树差异很大。短暂保留旧内容，让窗口先开始变形，
  // 再交叉淡入新内容，避免“先空白/跳高、后出现编辑器”的断帧。
  useLayoutEffect(() => {
    if (kind == null || sticky == null || spec == null) return;
    const previousKind = previousKindRef.current;
    const previousSpec = previousSpecRef.current;
    if (previousKind != null && previousKind !== sticky && previousSpec) {
      if (switchTimerRef.current != null) window.clearTimeout(switchTimerRef.current);
      setOutgoingChildren(previousSpec.children);
      switchTimerRef.current = window.setTimeout(() => {
        setOutgoingChildren(null);
        switchTimerRef.current = null;
      }, 180);
    }
  }, [kind, sticky, spec]);

  // 每次渲染都记住当前内容；这样预览内容更新后再进入编辑器，淡出的仍是最新卡片。
  useLayoutEffect(() => {
    if (kind == null || sticky == null || spec == null) return;
    previousKindRef.current = sticky;
    previousSpecRef.current = spec;
  }, [kind, sticky, spec]);

  // 窗口经历过真正关闭后，下一次打开是全新的会话，不能把上一次的
  // preview 当作 preview → editor 的直接切换内容继续交叉淡入。
  useLayoutEffect(() => {
    if (kind != null) return;
    if (switchTimerRef.current != null) {
      window.clearTimeout(switchTimerRef.current);
      switchTimerRef.current = null;
    }
    setOutgoingChildren(null);
    previousKindRef.current = null;
    previousSpecRef.current = null;
  }, [kind]);

  useEffect(() => {
    return () => {
      if (switchTimerRef.current != null) {
        window.clearTimeout(switchTimerRef.current);
        switchTimerRef.current = null;
      }
    };
  }, []);

  if (sticky == null || spec == null) return null;
  const compactPreview = compact && sticky === 'preview';

  return (
    <ChromeWindow
      open={kind != null}
      onClose={onClose}
      appearance={appearance}
      motion={compactPreview ? 'chrome' : 'note-editor'}
      motionAnchor={motionAnchor}
      compactBehavior={compactPreview ? 'sheet' : 'none'}
      showCompactDrawerHandle={!compactPreview}
      pageEdge={false}
      showBackdrop={compactPreview}
      dismissStopEvent={sticky === 'editor'}
      surface="window"
      className={spec.className}
      style={spec.style}
      backdropLabel={spec.backdropLabel}
      dismissIgnoreRefs={dismissIgnoreRefs}
      role="dialog"
      aria-label={spec['aria-label']}
      data-workspace-link-keep=""
      data-workspace-link-target={sticky === 'editor' ? 'note-editor' : undefined}
    >
      <div className="pointer-events-auto relative flex min-h-0 min-w-0 flex-1 flex-col">
        {outgoingChildren ? (
          <div
            aria-hidden="true"
            className="chrome-note-slot-content chrome-note-slot-content--outgoing pointer-events-none absolute inset-0 flex min-h-0 min-w-0 flex-col"
          >
            {outgoingChildren}
          </div>
        ) : null}
        <div
          key={sticky}
          className={`chrome-note-slot-content flex min-h-0 min-w-0 flex-1 flex-col ${
            outgoingChildren ? 'chrome-note-slot-content--incoming' : ''
          }`}
        >
          {spec.children}
        </div>
      </div>
    </ChromeWindow>
  );
}
