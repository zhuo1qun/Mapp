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

type ChromeNoteSlotProps<K extends string> = {
  kind: K | null;
  onClose: () => void;
  appearance?: MapChromeAppearance;
  motionAnchor?: { x: number; y: number } | null;
  dismissIgnoreRefs?: ReadonlyArray<RefObject<HTMLElement | null>>;
  resolve: (kind: K) => ChromeNoteSlotSpec;
};

/**
 * 地图预览卡 + NoteEditor 共用槽：壳不随 kind 卸载。
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
