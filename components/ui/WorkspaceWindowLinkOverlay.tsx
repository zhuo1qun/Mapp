import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useCompactViewport } from '../../utils/ui/useCompactViewport';

const PORT_RADIUS = 4.5;

function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value);
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function cubicHorizontal(x1: number, y1: number, x2: number, y2: number): string {
  const dx = Math.abs(x2 - x1) * 0.5;
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

type LinkGeom = {
  d: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

function isUsableRect(rect: DOMRectReadOnly): boolean {
  return rect.width >= 1 && rect.height >= 1;
}

/** 把视口坐标转成 overlay 本地坐标，并抵消父级 scale/translate 造成的偏差。 */
function viewportToLocal(host: HTMLElement, clientX: number, clientY: number): { x: number; y: number } {
  const rect = host.getBoundingClientRect();
  const w = host.offsetWidth;
  const h = host.offsetHeight;
  if (!w || !h || rect.width < 1 || rect.height < 1) {
    return { x: clientX - rect.left, y: clientY - rect.top };
  }
  return {
    x: (clientX - rect.left) * (w / rect.width),
    y: (clientY - rect.top) * (h / rect.height)
  };
}

function sourceWindowFor(src: HTMLElement): HTMLElement | null {
  return (
    src.closest<HTMLElement>('.map-layer-panel-body') ||
    src.closest<HTMLElement>('[data-chrome-window-surface]') ||
    src.closest<HTMLElement>('[data-table-canvas-window]')
  );
}

function measureLinks(host: HTMLElement, sourceNoteId: string): LinkGeom[] {
  const src = document.querySelector<HTMLElement>(
    `[data-workspace-link-source="${cssEscape(sourceNoteId)}"]`
  );
  const dest =
    document.querySelector<HTMLElement>('[data-workspace-link-target="note-editor"]') ??
    document.querySelector<HTMLElement>('[data-workspace-link-target="inspector"]');
  if (!src || !dest) return [];

  const srcRect = src.getBoundingClientRect();
  const destRect = dest.getBoundingClientRect();
  if (!isUsableRect(srcRect) || !isUsableRect(destRect)) return [];

  const sourceWindow = sourceWindowFor(src);
  const windowRect = sourceWindow?.getBoundingClientRect();
  if (windowRect) {
    if (srcRect.bottom < windowRect.top + 2 || srcRect.top > windowRect.bottom - 2) return [];
  }

  const fromY = srcRect.top + srcRect.height / 2;
  const destY = Math.min(Math.max(fromY, destRect.top + 18), destRect.bottom - 18);
  // 起点落在源窗口右缘，终点落在目标窗口左缘，避免记在行内边距上显得偏左。
  const fromX = windowRect ? windowRect.right : srcRect.right;
  const toX = destRect.left;
  const from = viewportToLocal(host, fromX, fromY);
  const to = viewportToLocal(host, toX, destY);
  return [
    {
      d: cubicHorizontal(from.x, from.y, to.x, to.y),
      x1: from.x,
      y1: from.y,
      x2: to.x,
      y2: to.y
    }
  ];
}

type WorkspaceWindowLinkOverlayProps = {
  sourceNoteId: string | null;
  themeColor: string;
  className?: string;
  /** 源/目标窗口 portal 到 body 时，连线也挂到 body。 */
  portal?: boolean;
};

/**
 * 节点编辑器式贝塞尔连线：从筛选表中的一条记录连到右侧窗口。
 * 叠在窗口之上（pointer-events: none），端口才能完整落在窗口边缘。
 */
export const WorkspaceWindowLinkOverlay: React.FC<WorkspaceWindowLinkOverlayProps> = ({
  sourceNoteId,
  themeColor,
  className,
  portal = false
}) => {
  const compact = useCompactViewport();
  const hostRef = useRef<HTMLDivElement>(null);
  const scrolledForRef = useRef<string | null>(null);
  const [links, setLinks] = useState<LinkGeom[]>([]);

  useLayoutEffect(() => {
    if (!sourceNoteId || compact) {
      setLinks([]);
      scrolledForRef.current = null;
      return;
    }

    let raf = 0;
    const tick = () => {
      const host = hostRef.current;
      if (host) {
        const next = measureLinks(host, sourceNoteId);
        setLinks((prev) => {
          if (
            prev.length === next.length &&
            prev.every(
              (item, i) =>
                item.d === next[i].d &&
                item.x1 === next[i].x1 &&
                item.y1 === next[i].y1 &&
                item.x2 === next[i].x2 &&
                item.y2 === next[i].y2
            )
          ) {
            return prev;
          }
          return next;
        });
        if (next.length > 0 && scrolledForRef.current !== sourceNoteId) {
          const src = document.querySelector<HTMLElement>(
            `[data-workspace-link-source="${cssEscape(sourceNoteId)}"]`
          );
          src?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
          scrolledForRef.current = sourceNoteId;
        }
      }
      raf = window.requestAnimationFrame(tick);
    };
    tick();
    return () => window.cancelAnimationFrame(raf);
  }, [compact, sourceNoteId]);

  if (!sourceNoteId || compact) return null;

  const node = (
    <div
      ref={hostRef}
      className={`workspace-window-link-overlay pointer-events-none ${className ?? ''}`.trim()}
      aria-hidden="true"
    >
      {links.length > 0 ? (
        <svg className="h-full w-full overflow-visible">
          {links.map((link, index) => (
            <g key={index}>
              <path
                d={link.d}
                fill="none"
                stroke={themeColor}
                strokeWidth={2.25}
                strokeLinecap="round"
                className="workspace-window-link-path"
              />
              <circle
                cx={link.x1}
                cy={link.y1}
                r={PORT_RADIUS}
                fill={themeColor}
                stroke="white"
                strokeWidth={1.5}
              />
              <circle
                cx={link.x2}
                cy={link.y2}
                r={PORT_RADIUS}
                fill={themeColor}
                stroke="white"
                strokeWidth={1.5}
              />
            </g>
          ))}
        </svg>
      ) : null}
    </div>
  );

  if (portal && typeof document !== 'undefined') {
    return createPortal(node, document.body);
  }
  return node;
};
