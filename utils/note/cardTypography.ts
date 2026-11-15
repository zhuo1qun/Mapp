type NoteCardTypographyOptions = {
  fontSize?: number;
  title: string;
  /** 可供标题使用的内容宽度，单位 px。 */
  contentWidth: number;
  /** 待定位箱等较小卡片使用更克制的字级。 */
  compact?: boolean;
  expanded?: boolean;
  detailLineCountOverride?: number;
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
 * 常规便签不显示正文与标签，标题优先尝试在五行内完整呈现；展开便签的
 * 标题自然换行且不按长度缩小。常规标题达到可读性下限后再省略。
 */
export function getNoteCardTypography({
  fontSize,
  title,
  contentWidth,
  compact = false,
  expanded = false,
  detailLineCountOverride
}: NoteCardTypographyOptions): NoteCardTypography {
  const baseTitleSize = baseTitleSizes[fontSize ?? 3] ?? baseTitleSizes[3];
  const normalizedTitle = title.replace(/\s+/g, ' ').trim();
  const titleLength = Array.from(normalizedTitle).length;
  const usableWidth = Math.max(72, contentWidth);
  // 汉字与常规拉丁字混排的平均字宽约为字号的 0.64。
  const titleLineLimit = 5;
  const titleCapacity = Math.max(
    titleLineLimit * 4,
    Math.floor((usableWidth / (baseTitleSize * 0.64)) * titleLineLimit)
  );
  const minScale = compact ? 0.6 : 0.64;
  const scale =
    !expanded && titleLength > titleCapacity
      ? clamp(titleCapacity / titleLength, minScale, 1)
      : 1;
  const titleFontSize = Math.round(baseTitleSize * scale * 10) / 10;
  const detailFontSize = Math.round(
    clamp(titleFontSize * 0.54, compact ? 10.5 : 12, compact ? 15 : 20) * 10
  ) / 10;

  return {
    titleFontSize,
    titleLineHeight: titleFontSize >= 30 ? 1.04 : 1.12,
    detailFontSize,
    detailLineCount: detailLineCountOverride ?? (expanded ? 14 : titleFontSize >= 30 ? 2 : titleFontSize >= 22 ? 3 : 4)
  };
}
