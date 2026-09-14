import React from 'react';
import { Star, ArrowUp, Locate, Check, Navigation, X, Map as MapIcon, LayoutGrid } from 'lucide-react';
import { NoteIconButton } from './NoteIconButton';
import { NoteEditorAddPillLabel } from './addPillStyles';

interface NoteHeaderProps {
  themeColor: string;
  /** 从 Markdown 派生的标题，固定放在原模式切换控件的位置。 */
  title?: string;
  isFavorite: boolean;
  onToggleFavorite: () => void;

  showUpgrade: boolean;
  onUpgrade?: () => void;

  showLocateBoard: boolean;
  onLocateBoard?: () => void;

  showLocateMap: boolean;
  onLocateMap?: () => void;

  /** 有 GPS 时：打开外部地图 App / 网页导航 */
  showNavigateGo?: boolean;
  onNavigateGo?: () => void;

  showLocateGraph?: boolean;
  onLocateGraph?: () => void;

  onSave: () => void;
  /** 新建空草稿可直接取消，不写入项目。 */
  discardDraft?: boolean;
  onDiscardDraft?: () => void;

}

export const NoteHeader: React.FC<NoteHeaderProps> = ({
  themeColor,
  title,
  isFavorite,
  onToggleFavorite,
  showUpgrade,
  onUpgrade,
  showLocateBoard,
  onLocateBoard,
  showLocateMap,
  onLocateMap,
  showNavigateGo = false,
  onNavigateGo,
  showLocateGraph = false,
  onLocateGraph,
  onSave,
  discardDraft = false,
  onDiscardDraft,
}) => {
  return (
    <div className="flex items-center gap-2 p-4 pb-2 flex-shrink-0 relative before:absolute before:bottom-0 before:left-3 before:right-3 before:border-b before:border-gray-400/50">
      <div className="flex-1 min-w-0 min-h-9 flex items-center" onClick={(e) => e.stopPropagation()}>
        {title ? (
          <div className="min-w-0 truncate text-sm font-medium text-gray-400" title={title}>
            {title}
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-1.5 shrink-0 relative z-10">
        <button
          type="button"
          onClick={onToggleFavorite}
          title={isFavorite ? '取消收藏' : '收藏'}
          className={`group gap-0 rounded-full p-2 min-h-9 min-w-9 box-border inline-flex items-center justify-center transition-colors active:scale-95 ${
            isFavorite
              ? 'bg-black/[0.06] hover:bg-black/[0.1]'
              : 'text-gray-700 hover:text-gray-900 hover:bg-black/5'
          }`}
          style={isFavorite ? { color: themeColor } : undefined}
        >
          <NoteEditorAddPillLabel>{isFavorite ? '取消收藏' : '收藏'}</NoteEditorAddPillLabel>
          <Star size={22} strokeWidth={2} fill={isFavorite ? 'currentColor' : 'none'} />
        </button>

        {showUpgrade && onUpgrade && (
          <NoteIconButton onClick={onUpgrade} variant="success" label="升级" title="升级为标准便签">
            <ArrowUp size={22} strokeWidth={2} />
          </NoteIconButton>
        )}

        {showLocateBoard && onLocateBoard && (
          <NoteIconButton onClick={onLocateBoard} variant="neutral" label="打开看板" title="打开看板">
            <LayoutGrid size={22} strokeWidth={2} className="text-gray-700 hover:text-gray-900" />
          </NoteIconButton>
        )}

        {showLocateMap && onLocateMap && (
          <NoteIconButton onClick={onLocateMap} variant="neutral" label="打开地图" title="打开地图">
            <MapIcon size={22} strokeWidth={2} className="text-gray-700 hover:text-gray-900" />
          </NoteIconButton>
        )}

        {showNavigateGo && onNavigateGo && (
          <NoteIconButton onClick={onNavigateGo} variant="neutral" label="导航" title="Go · 外部导航">
            <Navigation size={22} strokeWidth={2} className="text-gray-700 hover:text-gray-900" />
          </NoteIconButton>
        )}

        {showLocateGraph && onLocateGraph && (
          <NoteIconButton onClick={onLocateGraph} variant="neutral" label="图谱" title="定位到图谱">
            <Locate size={22} strokeWidth={2} className="text-gray-700 hover:text-gray-900" />
          </NoteIconButton>
        )}

        <NoteIconButton
          onClick={discardDraft ? (onDiscardDraft ?? onSave) : onSave}
          variant={discardDraft ? 'danger' : 'neutral'}
          label={discardDraft ? '取消' : '保存'}
          title={discardDraft ? '取消并删除便签' : '保存'}
        >
          {discardDraft ? <X size={22} strokeWidth={2.25} /> : <Check size={22} strokeWidth={2.5} />}
        </NoteIconButton>
      </div>
    </div>
  );
};
