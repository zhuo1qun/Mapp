export type AnchoredPanelAlign = 'start' | 'end' | 'center';

/** flip：下方优先，不够则翻到上方。below/above：固定朝向，超出视口时压缩高度并钳制。 */
export type AnchoredPanelVertical = 'flip' | 'below' | 'above';

export type AnchoredPanelPlacement = {
  top: number;
  left: number;
  maxHeight: number;
};

export type AnchoredPanelPlacementOptions = {
  panelWidth: number;
  panelHeight: number;
  /** 锚点与面板间距，默认 8 */
  gap?: number;
  /** 视口内边距，默认 8 */
  padding?: number;
  /**
   * start：面板左缘对齐锚点左缘
   * end：面板右缘对齐锚点右缘
   * center：面板水平居中于锚点
   */
  align?: AnchoredPanelAlign;
  vertical?: AnchoredPanelVertical;
  /** 固定朝向时允许压缩到的最小高度，默认 160 */
  minHeight?: number;
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * NoteEditor 浮层统一规则：水平钳制在视口内。
 * 垂直默认下方优先、不够则翻转；也可锁定朝向，用压缩高度处理贴边。
 */
export function computeAnchoredPanelPlacement(
  rect: Pick<DOMRect, 'top' | 'bottom' | 'left' | 'right' | 'width' | 'height'>,
  options: AnchoredPanelPlacementOptions
): AnchoredPanelPlacement {
  const {
    panelWidth,
    panelHeight,
    gap = 8,
    padding = 8,
    align = 'start',
    vertical = 'flip',
    minHeight = 160
  } = options;

  const vw = typeof window !== 'undefined' ? window.innerWidth : panelWidth + padding * 2;
  const vh = typeof window !== 'undefined' ? window.innerHeight : panelHeight + padding * 2;
  const viewportMaxH = Math.max(0, vh - padding * 2);

  const effectiveWidth = Math.min(panelWidth, Math.max(0, vw - padding * 2));

  let top: number;
  let maxHeight: number;

  if (vertical === 'flip') {
    const effectiveHeight = Math.min(panelHeight, viewportMaxH);
    const spaceBelow = vh - rect.bottom;
    const spaceAbove = rect.top;
    const preferAbove = spaceBelow < effectiveHeight + gap && spaceAbove >= spaceBelow;
    top = preferAbove ? rect.top - effectiveHeight - gap : rect.bottom + gap;
    top = clamp(top, padding, vh - effectiveHeight - padding);
    maxHeight = effectiveHeight;
  } else {
    const preferBelow = vertical === 'below';
    const available = preferBelow
      ? vh - padding - (rect.bottom + gap)
      : rect.top - gap - padding;
    maxHeight = Math.min(panelHeight, viewportMaxH);
    if (available >= minHeight) {
      maxHeight = Math.min(maxHeight, available);
      top = preferBelow ? rect.bottom + gap : rect.top - maxHeight - gap;
    } else {
      maxHeight = Math.min(maxHeight, Math.max(minHeight, available > 0 ? available : viewportMaxH));
      top = preferBelow ? rect.bottom + gap : rect.top - maxHeight - gap;
    }
    top = clamp(top, padding, vh - maxHeight - padding);
  }

  let left =
    align === 'end'
      ? rect.right - effectiveWidth
      : align === 'center'
        ? rect.left + rect.width / 2 - effectiveWidth / 2
        : rect.left;
  left = clamp(left, padding, vw - effectiveWidth - padding);

  return { top, left, maxHeight };
}
