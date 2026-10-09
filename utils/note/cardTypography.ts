type NoteCardTypographyOptions = {
  fontSize?: number;
  title: string;
  /** 可供标题使用的内容宽度，单位 px。 */
  contentWidth: number;
  /** 待定位箱等较小卡片使用更克制的字级。 */
  compact?: boolean;
};

export type NoteCardTypography = {
  titleFontSize: number;
  titleLineHeight: number;
  detailFontSize: number;
  detailLineCount: number;
};

const baseTitleSizes: Record<number, number> = {
  [-1]: 12.8,
  0: 16,
  1: 19.2,
  2: 25.6,
  3: 35.2,
  4: 38.4,
  5: 48
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

/**
 * Board 和待定位箱共享的便签字级规则。
 *
 * 标题优先尝试在两行内完整呈现：文字越长，字号会逐步回退；达到可读性下限后，
 * 再交由两行省略处理。这样不会因为单个超长标题挤掉正文与标签。
 */
export function getNoteCardTypography({
  fontSize,
  title,
  contentWidth,
  compact = false
}: NoteCardTypographyOptions): NoteCardTypography {
  const baseTitleSize = baseTitleSizes[fontSize ?? 3] ?? baseTitleSizes[3];
  const normalizedTitle = title.replace(/\s+/g, ' ').trim();
  const titleLength = Array.from(normalizedTitle).length;
  const usableWidth = Math.max(72, contentWidth);
  // 汉字与常规拉丁字混排的平均字宽约为字号的 0.64；预留两行空间。
  const twoLineCapacity = Math.max(8, Math.floor((usableWidth / (baseTitleSize * 0.64)) * 2));
  const minScale = compact ? 0.6 : 0.64;
  const scale =
    titleLength > twoLineCapacity
      ? clamp(twoLineCapacity / titleLength, minScale, 1)
      : 1;
  const titleFontSize = Math.round(baseTitleSize * scale * 10) / 10;
  const detailFontSize = Math.round(
    clamp(titleFontSize * 0.54, compact ? 10.5 : 12, compact ? 15 : 20) * 10
  ) / 10;

  return {
    titleFontSize,
    titleLineHeight: titleFontSize >= 30 ? 1.04 : 1.12,
    detailFontSize,
    detailLineCount: titleFontSize >= 30 ? 2 : titleFontSize >= 22 ? 3 : 4
  };
}
