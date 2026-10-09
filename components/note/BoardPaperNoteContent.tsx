import type { Note } from '../../types';
import { NoteCardTextContent } from './NoteCardTextContent';

type Props = { note: Note; contentWidth: number; compact?: boolean; visualScale?: number };

/** Board 与待定箱共用的纸质便签内容。 */
export function BoardPaperNoteContent({ note, contentWidth, compact = false, visualScale = 1 }: Props) {
  const background = note.sketch || note.images?.[0];
  const dense = compact && visualScale < 1;
  return <div className={`relative flex h-full w-full flex-col overflow-hidden text-gray-800 ${dense ? 'gap-1.5 p-3' : 'gap-2 p-6'}`}>
    {background ? <img src={background} alt="" draggable={false} className="pointer-events-none absolute inset-0 h-full w-full object-cover grayscale opacity-35" /> : null}
    <div className={`relative z-10 drop-shadow-sm ${dense ? 'text-xl' : 'text-3xl'}`}>{note.emoji}</div>
    <NoteCardTextContent className={`relative z-10 ${dense ? 'gap-1' : ''}`} text={note.text || ''} fontSize={note.fontSize} isBold={note.isBold} contentWidth={contentWidth} compact={compact} visualScale={visualScale} emptyClassName={dense ? 'text-xs' : 'text-base'} />
    {note.tags.length ? <div className={`relative z-10 mt-auto flex flex-wrap gap-1 ${dense ? 'max-h-4 overflow-hidden' : ''}`}>
      {note.tags.map((tag) => <span key={tag.id} className={`${dense ? 'h-4 px-1.5 text-[8px] leading-4' : 'h-6 px-2.5 text-xs leading-6'} rounded-full font-bold text-white shadow-sm`} style={{ backgroundColor: tag.color }}>{tag.label}</span>)}
    </div> : null}
  </div>;
}
