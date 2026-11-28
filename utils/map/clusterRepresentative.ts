import type { Note } from '../../types';
import { noteRendersAsMapMediaPin } from '../persistence/mediaDisplay';

/**
 * 聚合图形的代表对象：媒体开启时优先取最高层级的媒体成员；
 * 关闭时只按层级取代表，具体图形由 showMedia=false 强制渲染为普通图钉。
 */
export function selectClusterRepresentative(
  notes: Note[],
  noteStackRank: ReadonlyMap<string, number> | undefined,
  showMedia: boolean
): Note {
  const ranked = [...notes].sort(
    (a, b) => (noteStackRank?.get(b.id) ?? 0) - (noteStackRank?.get(a.id) ?? 0)
  );
  if (showMedia) {
    const mediaNote = ranked.find((note) => noteRendersAsMapMediaPin(note));
    if (mediaNote) return mediaNote;
  }
  return ranked[0]!;
}
