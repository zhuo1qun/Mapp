import type { Note } from '../../types';
import { NoteCardTextContent } from './NoteCardTextContent';
import { ExternalLink } from 'lucide-react';
import { noteOrderedDisplayMediaSources } from '../../utils/persistence/mediaDisplay';
import type { BoardMediaMode } from '../../utils/board/boardMediaPresentation';

type Props = { note: Note; contentWidth: number; compact?: boolean; visualScale?: number; expanded?: boolean; detailLineCount?: number; showMedia?: boolean; mediaMode?: BoardMediaMode };

/** Board 与待定箱共用的纸质便签内容。 */
export function BoardPaperNoteContent({ note, contentWidth, compact = false, visualScale = 1, expanded = false, detailLineCount, showMedia = true, mediaMode = 'background' }: Props) {
  const media = showMedia ? noteOrderedDisplayMediaSources(note)[0] : null;
  const background = mediaMode === 'background' ? media : null;
  const dense = compact && visualScale < 1;
  const reserveStickerBottom = Boolean(media && mediaMode === 'sticker' && !compact);
  return <div className={`relative flex h-full w-full flex-col overflow-hidden text-gray-800 ${dense ? 'gap-1.5 p-3' : `gap-2 px-6 pt-6 ${reserveStickerBottom ? 'pb-10' : 'pb-6'}`}`}>
    {background ? <img src={background} alt="" draggable={false} className="pointer-events-none absolute inset-0 h-full w-full object-cover grayscale opacity-35" /> : null}
    <NoteCardTextContent className={`relative z-10 ${dense ? 'gap-1' : ''}`} text={note.text || ''} emoji={note.emoji} fontSize={note.fontSize} isBold={note.isBold} contentWidth={contentWidth} compact={compact} visualScale={visualScale} expanded={expanded} detailLineCount={detailLineCount} />
    {note.linkPreview ? (
      <a
        href={note.linkPreview.url}
        target="_blank"
        rel="noopener noreferrer"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        className="relative z-20 mt-auto flex items-center gap-2 rounded-lg border border-black/10 bg-white/65 px-2.5 py-2 text-left no-underline shadow-sm backdrop-blur-sm"
        title={note.linkPreview.url}
      >
        {note.linkPreview.imageUrl ? <img src={note.linkPreview.imageUrl} alt="" referrerPolicy="no-referrer" className="h-8 w-10 rounded object-cover" /> : null}
        {!note.linkPreview.imageUrl && note.linkPreview.faviconUrl ? <img src={note.linkPreview.faviconUrl} alt="" referrerPolicy="no-referrer" className="h-4 w-4 rounded-sm object-contain" /> : null}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[11px] font-semibold text-gray-700">{note.linkPreview.title || note.linkPreview.siteName || note.linkPreview.url}</span>
          <span className="block truncate text-[9px] text-gray-400">{note.linkPreview.siteName || note.linkPreview.url}</span>
        </span>
        <ExternalLink size={12} className="shrink-0 text-gray-400" />
      </a>
    ) : null}
    {expanded && note.tags.length ? <div className={`relative z-10 ${note.linkPreview ? '' : 'mt-auto'} flex flex-wrap gap-1 ${dense ? 'max-h-4 overflow-hidden' : ''}`}>
      {note.tags.map((tag) => <span key={tag.id} className={`${dense ? 'h-4 px-1.5 text-[8px] leading-4' : 'h-6 px-2.5 text-xs leading-6'} rounded-full font-bold text-white shadow-sm`} style={{ backgroundColor: tag.color }}>{tag.label}</span>)}
    </div> : null}
  </div>;
}
