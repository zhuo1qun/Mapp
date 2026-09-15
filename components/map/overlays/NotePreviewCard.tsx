import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Navigation, Pencil } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import type { Note } from '../../../types';
import { parseNoteContent } from '../../../utils';
import { noteHasRenderableMapPosition } from '../../../utils/layer/unifiedNoteLayer';
import { hasNavigableGpsCoords } from '../../../utils/map/openExternalNavigation';
import { isDisplayableImageSrc, noteNeedsMediaResolve } from '../../../utils/persistence/mediaDisplay';
import { loadNoteImages } from '../../../utils/persistence/storage';
import { TagChip } from '../../ui/TagChip';
import { NoteIconButton } from '../../note-editor/NoteIconButton';
import { ExternalNavigationSheet } from './ExternalNavigationSheet';
import type { MapChromeAppearance } from '../../../utils/map/mapChromeStyle';
import { useChromeAppearance } from '../../ui/chromeAppearanceContext';

interface NotePreviewCardProps {
  note: Note;
  currentImageIndex: number;
  onImageIndexChange: (index: number) => void;
  chromeSurfaceStyle?: React.CSSProperties;
  chromeAppearance?: MapChromeAppearance;
  /** 为 true 时不拦截指针（悬停预览穿透到底层，仅选中展示时可交互） */
  passThrough?: boolean;
  /** 相对视口顶部的偏移（px）；用于避开左上角按钮/已展开面板 */
  offsetTopPx?: number;
  /**
   * 嵌入父级堆叠容器时：相对定位，由外层负责 fixed / top / maxHeight。
   * 图谱详情 + 高亮筛选上下排列时使用。
   */
  embedded?: boolean;
  /** 保留以兼容调用方；详情卡右上角编辑为无框 icon，不再使用主题色底 */
  themeColor?: string;
  /** 传入时显示右上角铅笔，打开全文编辑器 */
  onOpenEditor?: (noteId: string) => void;
  /** 由便签槽提供外壳时只渲染内容。 */
  hosted?: boolean;
}

export const NotePreviewCard: React.FC<NotePreviewCardProps> = ({
  note,
  currentImageIndex,
  onImageIndexChange,
  chromeSurfaceStyle,
  chromeAppearance: chromeAppearanceProp,
  passThrough = false,
  offsetTopPx,
  embedded = false,
  themeColor,
  onOpenEditor,
  hosted = false
}) => {
  const chromeAppearance = useChromeAppearance(chromeAppearanceProp);
  const [navSheetOpen, setNavSheetOpen] = useState(false);
  const [displayNote, setDisplayNote] = useState<Note>(note);
  const [mediaLoading, setMediaLoading] = useState(() => noteNeedsMediaResolve(note));
  const loadGenRef = useRef(0);

  const mediaSig = useMemo(
    () => {
      if (note.media?.length) {
        return [
          note.id,
          'M',
          note.media
            .map(
              (m) =>
                `${m.id}:${m.kind}:${m.assetId}>${m.variantId || ''}>${m.variantEnabled === false ? '0' : '1'}`
            )
            .join(';')
        ].join('|');
      }
      return [
        note.id,
        (note.images || []).join(','),
        (note.imageRefs || [])
          .map((r) => `${r.assetId}>${r.variantId || ''}>${r.variantEnabled === false ? '0' : '1'}`)
          .join(';'),
        note.sketch || ''
      ].join('|');
    },
    [note.id, note.media, note.images, note.imageRefs, note.sketch]
  );

  useEffect(() => {
    const gen = ++loadGenRef.current;
    if (!noteNeedsMediaResolve(note)) {
      setDisplayNote(note);
      setMediaLoading(false);
      return;
    }
    setMediaLoading(true);
    void (async () => {
      try {
        const loaded = await loadNoteImages(note);
        if (loadGenRef.current !== gen) return;
        setDisplayNote({
          ...note,
          images: loaded.images,
          sketch: loaded.sketch,
          imageRefs: loaded.imageRefs ?? note.imageRefs
        });
      } catch (err) {
        console.warn('NotePreviewCard media resolve failed', err);
        if (loadGenRef.current !== gen) return;
        setDisplayNote(note);
      } finally {
        if (loadGenRef.current === gen) setMediaLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 用 mediaSig 跟踪媒体字段
  }, [mediaSig]);

  const parsedContent = useMemo(() => parseNoteContent(note.text || ''), [note.text]);
  const previewTitle = parsedContent.title || undefined;
  const hasDetail = parsedContent.detail.trim().length > 0;

  const formatYearRange = (): string | null => {
    if (note.startYear == null) return null;
    if (note.endYear != null && note.endYear !== note.startYear) {
      return `${note.startYear}–${note.endYear}`;
    }
    return String(note.startYear);
  };

  const timeRangeText = formatYearRange();
  const allImages = [...(displayNote.images || [])].filter(isDisplayableImageSrc);
  if (displayNote.sketch && isDisplayableImageSrc(displayNote.sketch)) {
    allImages.push(displayNote.sketch);
  }
  const hasMediaSlots =
    (note.images && note.images.length > 0) ||
    !!(note.sketch && note.sketch !== '') ||
    (note.imageRefs && note.imageRefs.length > 0);
  const hasPreviewBody = hasDetail || hasMediaSlots || allImages.length > 0;
  const currentSrc = allImages[currentImageIndex];
  const currentOk = isDisplayableImageSrc(currentSrc);

  const topPx = offsetTopPx ?? 16;
  const showEdit = Boolean(onOpenEditor) && !passThrough;
  const showGo =
    noteHasRenderableMapPosition(note) &&
    hasNavigableGpsCoords(note.coords) &&
    !passThrough;
  const cardClass = hosted
    ? `mapping-preview-selectable flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden ${
        passThrough ? 'pointer-events-none' : 'pointer-events-auto'
      }`
    : `mapping-preview-selectable map-chrome-content-${chromeAppearance} ${
        embedded
          ? 'relative w-72 sm:w-80 shrink-0'
          : 'fixed ui-workspace-left z-[1000] w-72 sm:w-80'
      } rounded-2xl shadow-2xl border border-gray-100/80 overflow-hidden animate-in slide-in-from-left-8 duration-500 ease-out flex flex-col ${
        passThrough ? 'pointer-events-none' : 'pointer-events-auto'
      } ${chromeSurfaceStyle ? '' : 'bg-white'}`;
  const cardStyle = hosted
    ? undefined
    : {
        ...(embedded
          ? { maxHeight: 'min(52dvh, 28rem)' }
          : { top: topPx, maxHeight: `calc(100dvh - ${topPx}px - 1rem)` }),
        ...chromeSurfaceStyle
      };

  return (
    <>
    <div
      data-allow-context-menu
      className={cardClass}
      style={cardStyle}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* 预览卡保持比完整编辑器更轻一档的标题与操作密度。 */}
      <div className="relative flex shrink-0 items-start gap-2 px-3.5 py-3 pb-2 before:absolute before:bottom-0 before:left-3 before:right-3 before:border-b before:border-gray-400/50">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          {note.emoji && (
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center text-xl">{note.emoji}</span>
          )}
          <div className="flex min-h-8 min-w-0 flex-1 flex-col justify-center">
            {previewTitle ? (
              <h3
                className="truncate whitespace-nowrap text-sm font-medium text-gray-400"
                title={previewTitle}
              >
                {previewTitle}
              </h3>
            ) : null}
            {timeRangeText && (
              <div className="mt-0.5 text-[11px] text-gray-500 font-medium truncate">
                {timeRangeText}
              </div>
            )}
            {(note.tags?.length ?? 0) > 0 ? (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {note.tags!.map((t) => (
                  <TagChip
                    key={t.id || `${t.label}:${t.color}`}
                    label={t.label}
                    color={t.color || '#9ca3af'}
                    className="max-w-full"
                  />
                ))}
              </div>
            ) : null}
          </div>
        </div>
        {showGo || showEdit ? (
          <div className="relative z-10 flex shrink-0 items-center gap-1.5">
            {showGo ? (
              <NoteIconButton
                label="导航"
                title="Go · 外部导航"
                aria-label="Go 外部导航"
                onClick={(e) => {
                  e.stopPropagation();
                  setNavSheetOpen(true);
                }}
                onPointerDown={(e) => e.stopPropagation()}
                className="min-h-8 min-w-8 p-1.5 text-gray-500 hover:text-gray-700"
              >
                <Navigation size={18} strokeWidth={2} aria-hidden />
              </NoteIconButton>
            ) : null}
            {showEdit ? (
              <NoteIconButton
                label="编辑"
                title="编辑"
                aria-label="编辑"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenEditor?.(note.id);
                }}
                onPointerDown={(e) => e.stopPropagation()}
                className="min-h-8 min-w-8 p-1.5 text-gray-500 hover:text-gray-700"
              >
                <Pencil size={18} strokeWidth={2} aria-hidden />
              </NoteIconButton>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className={`flex-1 overflow-y-auto custom-scrollbar ${hasPreviewBody ? '' : 'min-h-3'}`}>
        {hasDetail ? (
            <div className="px-4 py-3 text-gray-800 text-sm leading-snug break-words border-b border-gray-50 mapping-preview-markdown">
              <ReactMarkdown
                components={{
                  a: ({ href, children, ...props }) => (
                    <a
                      {...props}
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {children}
                    </a>
                  )
                }}
              >
                {parsedContent.detail}
              </ReactMarkdown>
              <style>{`
                .mapping-preview-markdown p { margin-bottom: 0.6rem; line-height: 1.4; }
                .mapping-preview-markdown p:last-child { margin-bottom: 0; }
                .mapping-preview-markdown h1 { font-size: 1.25rem; font-weight: 800; margin: 0.8rem 0 0.4rem; }
                .mapping-preview-markdown h2 { font-size: 1.1rem; font-weight: 700; margin: 0.7rem 0 0.3rem; }
                .mapping-preview-markdown h3 { font-size: 1rem; font-weight: 600; margin: 0.6rem 0 0.2rem; }
                .mapping-preview-markdown ul, .mapping-preview-markdown ol { margin-bottom: 0.5rem; padding-left: 1.2rem; }
                .mapping-preview-markdown li { margin-bottom: 0.2rem; }
                .mapping-preview-markdown blockquote { border-left: 3px solid #e5e7eb; padding-left: 0.8rem; color: #6b7280; font-style: italic; margin: 0.5rem 0; }
                .mapping-preview-markdown code { background: #f3f4f6; padding: 0.1rem 0.3rem; border-radius: 3px; font-size: 0.85em; font-family: monospace; }
                .mapping-preview-markdown pre { background: #f9fafb; padding: 0.5rem; border-radius: 6px; overflow-x: auto; margin: 0.5rem 0; border: 1px solid #f3f4f6; }
                .mapping-preview-markdown a { color: #2563eb; text-decoration: underline; text-underline-offset: 2px; word-break: break-all; }
                .mapping-preview-markdown a:hover { color: #1d4ed8; }
              `}</style>
            </div>
        ) : null}

        {(hasMediaSlots || allImages.length > 0) && (
          <div className="relative group flex items-center justify-center shrink-0 px-4 py-3 bg-transparent">
            {currentOk ? (
              <img
                src={currentSrc}
                alt="Preview"
                className="w-full max-h-64 object-contain drop-shadow-[0_8px_18px_rgba(15,23,42,0.28)]"
                draggable={false}
              />
            ) : (
              <div className="text-xs text-gray-400 py-8">
                {mediaLoading ? '加载中' : '暂无图片'}
              </div>
            )}
            {allImages.length > 1 && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onImageIndexChange((currentImageIndex - 1 + allImages.length) % allImages.length);
                  }}
                  className="absolute left-2 p-1.5 bg-black/30 hover:bg-black/50 text-white rounded-full transition-colors backdrop-blur-sm"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onImageIndexChange((currentImageIndex + 1) % allImages.length);
                  }}
                  className="absolute right-2 p-1.5 bg-black/30 hover:bg-black/50 text-white rounded-full transition-colors backdrop-blur-sm"
                >
                  <ChevronRight size={18} />
                </button>
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1 px-2 py-1 bg-black/20 backdrop-blur-md rounded-full">
                  {allImages.map((_, idx) => (
                    <div
                      key={idx}
                      className={`w-1 h-1 rounded-full transition-all ${
                        idx === currentImageIndex ? 'bg-white w-2' : 'bg-white/40'
                      }`}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #E5E7EB; border-radius: 10px; }
      `}</style>
    </div>
    {showGo ? (
      <ExternalNavigationSheet
        open={navSheetOpen}
        lat={note.coords.lat}
        lng={note.coords.lng}
        label={previewTitle}
        onClose={() => setNavSheetOpen(false)}
        themeColor={themeColor}
        panelChromeStyle={chromeSurfaceStyle}
        chromeAppearance={chromeAppearance}
      />
    ) : null}
    </>
  );
};
