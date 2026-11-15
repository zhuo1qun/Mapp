import ReactMarkdown from 'react-markdown';
import { parseNoteContent } from '../../utils';
import { getNoteCardTypography } from '../../utils/note/cardTypography';

type Props = {
  text: string;
  emoji?: string;
  fontSize?: number;
  isBold?: boolean;
  /** 卡片减去内边距后的文字可用宽度，单位 px。 */
  contentWidth: number;
  compact?: boolean;
  /** 待定位箱的展开态以实占尺寸缩小，文字同步缩小而不重新写一套规则。 */
  visualScale?: number;
  expanded?: boolean;
  detailLineCount?: number;
  className?: string;
  emptyClassName?: string;
};

/**
 * 纸质便签的共用文字区。图标作为标题前缀参与排版；容器负责背景和标签。
 */
export function NoteCardTextContent({
  text,
  emoji = '',
  fontSize,
  isBold = false,
  contentWidth,
  compact = false,
  visualScale = 1,
  expanded = false,
  detailLineCount,
  className = '',
  emptyClassName = 'text-base'
}: Props) {
  const { title, detail } = parseNoteContent(text);
  const baseTypography = getNoteCardTypography({
    fontSize,
    title,
    contentWidth,
    compact,
    expanded,
    detailLineCountOverride: detailLineCount
  });
  const typography = {
    ...baseTypography,
    titleFontSize: Math.max(
      compact ? 10 : 12,
      Math.round(baseTypography.titleFontSize * visualScale * 10) / 10
    ),
    detailFontSize: Math.max(
      compact ? 8 : 10,
      Math.round(baseTypography.detailFontSize * visualScale * 10) / 10
    )
  };
  const visibleDetail = expanded ? detail : '';
  const hasContent = Boolean(emoji || title || visibleDetail);

  return (
    <div className={`note-card-content ${className}`}>
      {hasContent ? (
        <>
          {title || emoji ? (
            <span
              title={title}
              className={`note-card-title ${expanded ? 'note-card-title--expanded' : ''} shrink-0 ${isBold ? 'font-bold' : 'font-medium'}`}
              style={{
                fontSize: `${typography.titleFontSize}px`,
                lineHeight: typography.titleLineHeight
              }}
            >
              {emoji ? <span className="note-card-title-emoji" aria-hidden>{emoji}</span> : null}
              {title}
            </span>
          ) : null}
          {visibleDetail ? (
            <div
              className="note-card-detail markdown-board-preview min-h-0 flex-1 opacity-90"
              style={{
                fontSize: `${typography.detailFontSize}px`,
                lineHeight: 1.35,
                '--note-detail-lines': typography.detailLineCount
              } as React.CSSProperties}
            >
              <ReactMarkdown>{visibleDetail}</ReactMarkdown>
            </div>
          ) : null}
        </>
      ) : (
        <span className={`${emptyClassName} font-normal italic text-gray-400`}>Empty...</span>
      )}
    </div>
  );
}
