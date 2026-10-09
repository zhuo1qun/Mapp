import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CopyPlus, Loader2, MapPin } from 'lucide-react';
import type { Note, PlaygroundEntry, Project } from '../types';
import { generateId } from '../utils';
import { MapView } from './MapView';
import { ChromeActionButton } from './ui/ChromeActionButton';
import { ChromeIconButton } from './ui/ChromeIconButton';
import { useChromeAppearance } from './ui/chromeAppearanceContext';
import {
  MAP_CHROME_SURFACE_BORDER_CLASS,
  mapChromeContentStyle,
  mapChromeControlHoverBackground,
  mapChromeControlStyle
} from '../utils/map/mapChromeStyle';
import { loadImage } from '../utils/persistence/storage';
import {
  createPlaygroundEntry,
  deletePlaygroundEntry,
  isEntryOwnedByThisBrowser,
  listPlaygroundEntries,
  updatePlaygroundEntry
} from '../utils/playground/client';

const EXPIRY_HOURS = 48;

function entryToNote(entry: PlaygroundEntry): Note {
  return {
    id: entry.id,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    coords: entry.note.coords,
    emoji: entry.note.emoji || '📍',
    text: entry.note.text,
    fontSize: 2,
    images: entry.imageUrls,
    tags: entry.note.tags || [],
    color: entry.note.color,
    boardX: 0,
    boardY: 0,
    variant: 'standard',
    isInitialPosition: false
  };
}

async function localImageFile(imageRef: string, index: number): Promise<File | null> {
  const dataUrl = imageRef.startsWith('img-') ? await loadImage(imageRef) : imageRef;
  if (!dataUrl) return null;
  const response = await fetch(dataUrl);
  if (!response.ok) return null;
  const blob = await response.blob();
  const mime = blob.type || 'image/jpeg';
  const ext = mime.split('/')[1] === 'jpeg' ? 'jpg' : mime.split('/')[1] || 'jpg';
  return new File([blob], `playground-${index + 1}.${ext}`, { type: mime });
}

export function Playground({
  onBack,
  onSaveAsProject,
  themeColor,
  onThemeColorChange,
  uiDarkMode,
  onUiDarkModeChange,
  mapUiChromeOpacity,
  mapUiChromeOpacityBottom,
  mapUiChromeBlurPx,
  onMapUiChromeOpacityChange,
  onMapUiChromeOpacityBottomChange,
  onMapUiChromeBlurPxChange,
  initialMapStyle
}: {
  onBack: () => void;
  onSaveAsProject: (project: Project) => Promise<void>;
  themeColor: string;
  onThemeColorChange: (color: string) => void;
  uiDarkMode: boolean;
  onUiDarkModeChange: (dark: boolean) => void;
  mapUiChromeOpacity: number;
  mapUiChromeOpacityBottom: number;
  mapUiChromeBlurPx: number;
  onMapUiChromeOpacityChange: (value: number) => void;
  onMapUiChromeOpacityBottomChange: (value: number) => void;
  onMapUiChromeBlurPxChange: (value: number) => void;
  initialMapStyle: string;
}) {
  const chromeAppearance = useChromeAppearance();
  const chromeContent = useMemo(
    () => mapChromeContentStyle(mapUiChromeOpacity, mapUiChromeBlurPx, chromeAppearance),
    [chromeAppearance, mapUiChromeBlurPx, mapUiChromeOpacity]
  );
  const chromeControl = useMemo(
    () => mapChromeControlStyle(mapUiChromeOpacity, mapUiChromeBlurPx, chromeAppearance),
    [chromeAppearance, mapUiChromeBlurPx, mapUiChromeOpacity]
  );
  const chromeHover = useMemo(
    () => mapChromeControlHoverBackground(mapUiChromeOpacity, chromeAppearance),
    [chromeAppearance, mapUiChromeOpacity]
  );
  const [entries, setEntries] = useState<PlaygroundEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCopying, setIsCopying] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [mapStyle, setMapStyle] = useState(initialMapStyle);
  const [showSearch, setShowSearch] = useState(false);
  const [borderGeoJSON, setBorderGeoJSON] = useState<unknown | null>(null);

  const reload = useCallback(async () => {
    setIsLoading(true);
    try {
      setEntries(await listPlaygroundEntries());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法读取 Playground。');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const project = useMemo<Project>(() => ({
    id: 'playground-public-map',
    name: 'Mapping Playground',
    type: 'map',
    projectKind: 'mapping',
    createdAt: 0,
    notes: entries.filter((entry) => entry.expiresAt > Date.now()).map(entryToNote),
    frames: [],
    connections: [],
    storageVersion: 4
  }), [entries]);

  const canEditNote = useCallback((note: Note) => isEntryOwnedByThisBrowser(note.id), []);

  const publish = useCallback(async (note: Note) => {
    try {
      const images = (await Promise.all((note.images || []).map(localImageFile))).filter((file): file is File => !!file);
      const entry = await createPlaygroundEntry({
        coords: note.coords,
        text: note.text,
        emoji: note.emoji,
        tags: note.tags,
        color: note.color
      }, images);
      setEntries((current) => [entry, ...current]);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '发布失败。');
      throw cause;
    }
  }, []);

  const update = useCallback(async (note: Note) => {
    try {
      const images = (await Promise.all((note.images || []).map(localImageFile))).filter((file): file is File => !!file);
      const entry = await updatePlaygroundEntry(note.id, {
        coords: note.coords,
        text: note.text,
        emoji: note.emoji,
        tags: note.tags,
        color: note.color
      }, images);
      setEntries((current) => current.map((item) => item.id === entry.id ? entry : item));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存失败。');
      throw cause;
    }
  }, []);

  const remove = useCallback(async (id: string) => {
    try {
      await deletePlaygroundEntry(id);
      setEntries((current) => current.filter((entry) => entry.id !== id));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '删除失败。');
      throw cause;
    }
  }, []);

  const copyAsProject = useCallback(async () => {
    setIsCopying(true);
    try {
      const notes = await Promise.all(project.notes.map(async (note) => {
        const images = await Promise.all((note.images || []).map(async (url) => {
          const blob = await fetch(url).then((response) => {
            if (!response.ok) throw new Error('有图片无法复制到本地项目。');
            return response.blob();
          });
          return await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
          });
        }));
        return { ...note, id: `note_${generateId()}`, images };
      }));
      await onSaveAsProject({
        ...project,
        id: `project_${generateId()}`,
        name: `Playground 副本 ${new Date().toLocaleDateString('zh-CN')}`,
        createdAt: Date.now(),
        notes
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法另存为项目。');
    } finally {
      setIsCopying(false);
    }
  }, [onSaveAsProject, project]);

  return (
    <div className="relative h-dvh w-full overflow-hidden">
      <MapView
        project={project}
        projectId={project.id}
        workspaceEditMode={editMode}
        onWorkspaceEditModeChange={setEditMode}
        onAddNote={publish}
        onUpdateNote={update}
        onDeleteNote={remove}
        onToggleEditor={() => {}}
        themeColor={themeColor}
        onThemeColorChange={onThemeColorChange}
        uiDarkMode={uiDarkMode}
        onUiDarkModeChange={onUiDarkModeChange}
        mapStyleId={mapStyle}
        onMapStyleChange={setMapStyle}
        mapUiChromeOpacity={mapUiChromeOpacity}
        mapUiChromeOpacityBottom={mapUiChromeOpacityBottom}
        mapUiChromeBlurPx={mapUiChromeBlurPx}
        onMapUiChromeOpacityChange={onMapUiChromeOpacityChange}
        onMapUiChromeOpacityBottomChange={onMapUiChromeOpacityBottomChange}
        onMapUiChromeBlurPxChange={onMapUiChromeBlurPxChange}
        showBorderPanel={showSearch}
        setShowBorderPanel={setShowSearch}
        borderGeoJSON={borderGeoJSON}
        setBorderGeoJSON={setBorderGeoJSON}
        showLayerControl={false}
        canEditNote={canEditNote}
        onEditDenied={() => setError('这条记录只能由发布它的浏览器编辑或删除。')}
        directMapPlacement
        allowPhotoImport={false}
      />

      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[var(--z-map-toolbar)] flex justify-center px-3 sm:bottom-5">
        <div className={`pointer-events-auto flex max-w-full items-center gap-1 rounded-xl p-1 ${MAP_CHROME_SURFACE_BORDER_CLASS}`} style={chromeContent}>
          <ChromeIconButton type="button" onClick={onBack} themeColor={themeColor} chromeSurfaceStyle={chromeControl} chromeHoverBackground={chromeHover} className="!h-9 !w-9 !p-1.5" aria-label="返回项目"><ArrowLeft size={17} /></ChromeIconButton>
          <div className="hidden items-center gap-1.5 px-2 text-xs font-medium sm:flex"><MapPin size={14} style={{ color: themeColor }} />{EXPIRY_HOURS} 小时临时公共地图</div>
          <ChromeActionButton type="button" tone="primary" themeColor={themeColor} disabled={!project.notes.length || isCopying} onClick={() => void copyAsProject()}>
            {isCopying ? <Loader2 size={15} className="animate-spin" /> : <CopyPlus size={15} />}另存副本
          </ChromeActionButton>
        </div>
      </div>
      {isLoading ? <div className="pointer-events-none fixed inset-0 z-[2000] flex items-center justify-center bg-white/35"><Loader2 className="animate-spin" style={{ color: themeColor }} /></div> : null}
      {error ? <div className="fixed bottom-20 left-1/2 z-[2100] max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-xl bg-red-600 px-4 py-2 text-sm text-white shadow-lg">{error}</div> : null}
    </div>
  );
}
