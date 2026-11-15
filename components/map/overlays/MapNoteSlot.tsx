import type { CSSProperties, MutableRefObject, RefObject } from 'react';
import type { Map as LeafletMap } from 'leaflet';
import type { Note } from '../../../types';
import type { NoteDraftOutcome } from '../../../utils/note/draftLifecycle';
import type { MapChromeAppearance } from '../../../utils/map/mapChromeStyle';
import { ChromeNoteSlot, chromeNoteEditorSlotLayout } from '../../ui/ChromeNoteSlot';
import { DeferredNoteEditor } from '../../note-editor/DeferredNoteEditor';
import { NotePreviewCard } from './NotePreviewCard';

type MapNoteSlotProps = {
  kind: 'preview' | 'editor' | null;
  onClose: () => void;
  appearance: MapChromeAppearance;
  motionAnchor: { x: number; y: number } | null;
  toolbarRef: RefObject<HTMLElement | null>;
  markerPaneRef: RefObject<HTMLElement | null>;
  compactViewport: boolean;
  contentSurfaceStyle: CSSProperties;
  menuTop: number | null;
  saveDraftRef: MutableRefObject<(() => Promise<NoteDraftOutcome>) | null>;
  onDiscard: () => void;
  onSaveClose: () => void;
  onSave: (note: Partial<Note>) => void | Promise<void>;
  onDelete: (noteId: string) => void | Promise<void>;
  editingNote: Partial<Note> | null;
  notes: Note[];
  autoOpenCamera: boolean;
  onSwitchToBoardView?: (coords?: { x: number; y: number }, mapInstance?: LeafletMap) => void;
  mapInstance: LeafletMap | null;
  themeColor?: string;
  mapUiChromeOpacity?: number;
  mapUiChromeBlurPx?: number;
  selectedNote: Note | null;
  currentImageIndex: number;
  onImageIndexChange: (index: number) => void;
  canModifyNote: (note: Note) => boolean;
  onOpenSelectedNote: (noteId: string) => void;
  isEditMode: boolean;
};

/** Map 的预览卡和 NoteEditor 共用窗口壳，页面仅提供当前状态与操作回调。 */
export function MapNoteSlot({
  kind,
  onClose,
  appearance,
  motionAnchor,
  toolbarRef,
  markerPaneRef,
  compactViewport,
  contentSurfaceStyle,
  menuTop,
  saveDraftRef,
  onDiscard,
  onSaveClose,
  onSave,
  onDelete,
  editingNote,
  notes,
  autoOpenCamera,
  onSwitchToBoardView,
  mapInstance,
  themeColor,
  mapUiChromeOpacity,
  mapUiChromeBlurPx,
  selectedNote,
  currentImageIndex,
  onImageIndexChange,
  canModifyNote,
  onOpenSelectedNote,
  isEditMode
}: MapNoteSlotProps) {
  return (
    <ChromeNoteSlot
      kind={kind}
      onClose={onClose}
      appearance={appearance}
      motionAnchor={motionAnchor}
      dismissIgnoreRefs={kind === 'preview' ? [toolbarRef, markerPaneRef] : [toolbarRef]}
      resolve={(slotKind) => {
        const pagePad = compactViewport ? '0.5rem' : '1rem';
        const previewLeft = `calc(var(--workspace-ui-left-inset, 0px) + ${pagePad})`;
        if (slotKind === 'editor') {
          return {
            backdropLabel: '关闭编辑器',
            'aria-label': '便签编辑器',
            ...chromeNoteEditorSlotLayout(compactViewport, contentSurfaceStyle),
            children: (
              <DeferredNoteEditor
                shell={false}
                isOpen
                saveDraftRef={saveDraftRef}
                onClose={onDiscard}
                onSaveClose={onSaveClose}
                onSave={onSave}
                onDelete={onDelete}
                initialNote={editingNote || {}}
                isNewNote={!!editingNote?.id && !notes.some((note) => note.id === editingNote.id)}
                autoOpenCamera={autoOpenCamera}
                onSwitchToBoardView={(coords) => onSwitchToBoardView?.(coords, mapInstance ?? undefined)}
                themeColor={themeColor}
                mapUiChromeOpacity={mapUiChromeOpacity}
                mapUiChromeBlurPx={mapUiChromeBlurPx}
                chromeAppearance={appearance}
              />
            )
          };
        }

        return {
          backdropLabel: '关闭预览',
          'aria-label': '便签预览',
          className: 'flex min-h-0 flex-col',
          style: {
            top: menuTop ?? 56,
            left: previewLeft,
            width: 'min(20rem, calc(100vw - 1rem))',
            // 详情卡最多延伸到视口底部，并保留与页面边缘一致的外边距。
            height: 'auto',
            maxHeight: `calc(100dvh - ${menuTop ?? 56}px - ${pagePad})`,
            ...contentSurfaceStyle
          },
          children: selectedNote ? (
            <NotePreviewCard
              hosted
              note={selectedNote}
              currentImageIndex={currentImageIndex}
              onImageIndexChange={onImageIndexChange}
              chromeAppearance={appearance}
              themeColor={themeColor}
              onOpenEditor={canModifyNote(selectedNote) ? onOpenSelectedNote : undefined}
              onDelete={isEditMode && canModifyNote(selectedNote) ? onDelete : undefined}
            />
          ) : null
        };
      }}
    />
  );
}
