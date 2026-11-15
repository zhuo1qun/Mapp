import type { Note } from '../../types';

export const EXPANDED_NOTE_WIDTH = 384;
export const EXPANDED_NOTE_MIN_HEIGHT = 288;
export const EXPANDED_NOTE_MAX_HEIGHT = 512;

const weightedLength = (value: string) =>
  Array.from(value.replace(/\s+/g, ' ').trim()).reduce(
    (total, char) => total + (/^[\x00-\xff]$/.test(char) ? 0.58 : 1),
    0
  );

function wrappedLineCount(value: string, capacity: number): number {
  if (!value.trim()) return 0;
  return value.split(/\r?\n/).reduce(
    (total, line) => total + Math.max(1, Math.ceil(weightedLength(line.replace(/^\s*[-*#>]+\s*/, '')) / capacity)),
    0
  );
}

/**
 * 展开便签采用确定性的内容估算，保证渲染、选区、碰撞和导入在 DOM 测量前就得到同一尺寸。
 * 正文增长到高度上限；标题不截断，因此极长标题可把卡片撑过该上限。
 * detailLineCount 是当前高度真正容得下的正文行数。
 */
export function getExpandedNoteLayout(note: Pick<Note, 'text' | 'emoji' | 'tags' | 'linkPreview'>) {
  const text = note.text || '';
  const newline = text.indexOf('\n');
  const title = (newline < 0 ? text : text.slice(0, newline)).replace(/^#+\s+/, '').trim();
  const detail = newline < 0 ? '' : text.slice(newline + 1);
  const titleLines = title || note.emoji
    ? Math.max(1, wrappedLineCount(`${note.emoji || ''}${title}`, 16))
    : 0;
  const naturalDetailLines = wrappedLineCount(detail, 34);
  const tagWidth = (note.tags || []).reduce((sum, tag) => sum + weightedLength(tag.label) * 8 + 30, 0);
  const tagRows = tagWidth > 0 ? Math.min(3, Math.ceil(tagWidth / 336)) : 0;

  const fixedHeight =
    48 + // 上下内边距
    (titleLines ? titleLines * 39 : 0) +
    (titleLines && naturalDetailLines ? 8 : 0) +
    (note.linkPreview ? 62 + 8 : 0) +
    (tagRows ? tagRows * 26 + 8 : 0);
  const detailLineHeight = 19;
  const naturalHeight = fixedHeight + naturalDetailLines * detailLineHeight;
  const minimumHeightForFullTitle = Math.ceil(fixedHeight / 16) * 16;
  const height = Math.max(
    minimumHeightForFullTitle,
    Math.min(
      EXPANDED_NOTE_MAX_HEIGHT,
      Math.max(EXPANDED_NOTE_MIN_HEIGHT, Math.ceil(naturalHeight / 16) * 16)
    )
  );
  const detailLineCount = Math.max(0, Math.floor((height - fixedHeight) / detailLineHeight));

  return {
    width: EXPANDED_NOTE_WIDTH,
    height,
    detailLineCount,
    isDetailTruncated: naturalDetailLines > detailLineCount
  };
}
