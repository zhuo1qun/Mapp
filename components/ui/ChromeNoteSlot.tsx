import React, { type CSSProperties, type ReactNode, type RefObject } from 'react';
import type { MapChromeAppearance } from '../../utils/map/mapChromeStyle';
import { useStickyValue } from '../../utils/ui/useStickyValue';
import { ChromeWindow } from './ChromeWindow';

export type ChromeNoteSlotSpec = {
  className?: string;
  style?: CSSProperties;
  backdropLabel: string;
  children: ReactNode;
  'aria-label'?: string;
};

/** Map、Board 共用的编辑器几何：桌面在工作区居中，窄屏占满安全视口。 */
export function chromeNoteEditorSlotLayout(
  compact: boolean,
  surfaceStyle: CSSProperties
): Pick<ChromeNoteSlotSpec, 'className' | 'style'> {
  if (compact) {
    return {
      className: 'chrome-note-slot--editor flex min-h-0 flex-col',
      style: {
        top: 0,
        left: 0,
        width: '100vw',
        height: '100dvh',
        maxHeight: '100dvh',
        borderRadius: 0,
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
  const sticky = useStickyValue(kind);
  if (sticky == null) return null;
  const spec = resolve(sticky);
  return (
    <ChromeWindow
      open={kind != null}
      onClose={onClose}
      appearance={appearance}
      motion="note-editor"
      motionAnchor={motionAnchor}
      compactBehavior="none"
      pageEdge={false}
      showBackdrop={false}
      dismissStopEvent={sticky === 'editor'}
      surface="window"
      className={spec.className}
      style={spec.style}
      backdropLabel={spec.backdropLabel}
      dismissIgnoreRefs={dismissIgnoreRefs}
      role="dialog"
      aria-label={spec['aria-label']}
    >
      <div key={sticky} className="pointer-events-auto flex min-h-0 min-w-0 flex-1 flex-col">
        {spec.children}
      </div>
    </ChromeWindow>
  );
}
