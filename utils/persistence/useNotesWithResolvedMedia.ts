import { useEffect, useMemo, useRef, useState } from 'react';
import type { Note } from '../../types';
import { loadNoteImages } from './storage';
import { noteNeedsMediaResolve } from './mediaDisplay';

function mediaSig(notes: Note[]): string {
  return notes
    .map((n) => {
      if (n.media?.length) {
        return `${n.id}:M:${n.media
          .map(
            (m) =>
              `${m.id}:${m.kind}:${m.assetId}>${m.variantId || ''}>${m.variantEnabled === false ? '0' : '1'}`
          )
          .join(';')}`;
      }
      return `${n.id}:${(n.images || []).join(',')}:${(n.imageRefs || [])
        .map((r) => `${r.assetId}>${r.variantId || ''}>${r.variantEnabled === false ? '0' : '1'}`)
        .join(';')}:${n.sketch || ''}`;
    })
    .join('|');
}

type ResolvedMedia = Pick<Note, 'images' | 'sketch'>;
type ResolvedEntry = { mediaKey: string; media: ResolvedMedia };

// Map 与 Board 在短时间内切换时可能同时请求同一张图。只共享进行中的读取，
// 不把大 data URL 常驻在全局内存中；每个已挂载视图仍自行持有当前所需结果。
const inFlightMedia = new Map<string, Promise<ResolvedMedia | null>>();

function noteMediaKey(note: Note): string {
  return mediaSig([note]);
}

async function resolveMedia(note: Note, key: string): Promise<ResolvedMedia | null> {
  const existing = inFlightMedia.get(key);
  if (existing) return existing;
  const request = loadNoteImages(note)
    .then((loaded) => ({ images: loaded.images, sketch: loaded.sketch }))
    .catch(() => null)
    .finally(() => inFlightMedia.delete(key));
  inFlightMedia.set(key, request);
  return request;
}

async function resolveWithConcurrency<T>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<void>
): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      await task(item);
    }
  });
  await Promise.all(workers);
}

function mediaResolveConcurrency(): number {
  if (typeof window === 'undefined') return 4;
  return window.matchMedia?.('(any-pointer: coarse)').matches ? 3 : 5;
}

/**
 * 将 notes 中的资产 ID 解析为展示用 data URL（本地 state，不写回项目）。
 * 布局/文案等字段始终取自最新 notes，避免拖动 boardX/Y 后被旧 resolved 快照盖住。
 */
export function useNotesWithResolvedMedia(notes: Note[]): Note[] {
  const sig = useMemo(() => mediaSig(notes), [notes]);
  const cacheRef = useRef<Record<string, ResolvedEntry>>({});
  const [resolvedMediaById, setResolvedMediaById] = useState<Record<string, ResolvedEntry>>({});

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const currentIds = new Set(notes.map((note) => note.id));
      for (const id of Object.keys(cacheRef.current)) {
        if (!currentIds.has(id)) delete cacheRef.current[id];
      }
      for (const note of notes) {
        if (!noteNeedsMediaResolve(note)) delete cacheRef.current[note.id];
      }
      const pending = notes
        .filter(noteNeedsMediaResolve)
        .map((note) => ({ note, key: noteMediaKey(note) }))
        .filter(({ note, key }) => cacheRef.current[note.id]?.mediaKey !== key);

      await resolveWithConcurrency(pending, mediaResolveConcurrency(), async ({ note, key }) => {
        const media = await resolveMedia(note, key);
        if (media) cacheRef.current[note.id] = { mediaKey: key, media };
      });
      if (cancelled) return;
      setResolvedMediaById({ ...cacheRef.current });
    };
    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- notes 媒体内容由 sig 跟踪
  }, [sig]);

  return useMemo(
    () =>
      notes.map((note) => {
        const media = resolvedMediaById[note.id];
        if (!media || !noteNeedsMediaResolve(note) || media.mediaKey !== noteMediaKey(note)) return note;
        return {
          ...note,
          images: media.media.images ?? note.images,
          sketch: media.media.sketch ?? note.sketch
        };
      }),
    [notes, resolvedMediaById]
  );
}
