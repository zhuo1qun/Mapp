import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import type { Coordinates } from '../../types';
import { NoteIconButton } from './NoteIconButton';

interface MetadataSectionProps {
  id?: string;
  createdAt?: number;
  coords?: Coordinates;
  mediaCount?: number;
  defaultOpen?: boolean;
  showDelete?: boolean;
  onDeleteNote?: () => void;
  onDismissOverlays?: () => void;
}

/** 「更多」：identity / lifecycle + 删除等次要操作 */
export const MetadataSection: React.FC<MetadataSectionProps> = ({
  id,
  createdAt,
  coords,
  mediaCount = 0,
  defaultOpen = false,
  showDelete,
  onDeleteNote,
  onDismissOverlays
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const hasMapPosition =
    coords != null &&
    Number.isFinite(coords.lat) &&
    Number.isFinite(coords.lng) &&
    !(coords.lat === 0 && coords.lng === 0);
  const hasMeta = !!(id || createdAt != null || hasMapPosition || mediaCount > 0);
  if (!hasMeta && !(showDelete && onDeleteNote)) return null;

  return (
    <section className="shrink-0 border-t border-gray-400/50" aria-label="更多">
      <div className="px-4 pt-2 pb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (!hasMeta) return;
            setOpen((v) => !v);
          }}
          className={`flex-1 min-w-0 flex items-center gap-1.5 text-[11px] font-medium text-gray-400 uppercase tracking-wide border-0 bg-transparent ${
            hasMeta ? 'hover:text-gray-600 cursor-pointer' : 'cursor-default'
          }`}
          aria-expanded={hasMeta ? open : undefined}
          disabled={!hasMeta}
        >
          {hasMeta ? open ? <ChevronDown size={12} /> : <ChevronRight size={12} /> : null}
          更多
        </button>
      </div>
      {hasMeta && open ? (
        <div className="px-4 pb-4 flex items-end justify-between gap-3">
          <div className="min-w-0 space-y-1.5 text-xs text-gray-500 font-mono">
            {id ? (
              <div className="flex gap-2 min-w-0">
                <span className="text-gray-400 shrink-0 not-italic font-sans">ID</span>
                <span className="truncate" title={id}>
                  {id}
                </span>
              </div>
            ) : null}
            {createdAt != null ? (
              <div className="flex gap-2 min-w-0">
                <span className="text-gray-400 shrink-0 not-italic font-sans">Created</span>
                <span>{new Date(createdAt).toLocaleString()}</span>
              </div>
            ) : null}
            {hasMapPosition ? (
              <div className="flex gap-2 min-w-0">
                <span className="text-gray-400 shrink-0 not-italic font-sans">坐标</span>
                <span title={`${coords!.lat}, ${coords!.lng}`}>
                  {coords!.lat.toFixed(6)}, {coords!.lng.toFixed(6)}
                </span>
              </div>
            ) : null}
            {mediaCount > 0 ? (
              <div className="flex gap-2 min-w-0">
                <span className="text-gray-400 shrink-0 not-italic font-sans">媒体</span>
                <span>{mediaCount} 项</span>
              </div>
            ) : null}
          </div>
          {showDelete && onDeleteNote ? (
            <NoteIconButton
              variant="danger"
              label="删除"
              title="删除便签"
              onClick={(e) => {
                e.stopPropagation();
                onDismissOverlays?.();
                onDeleteNote();
              }}
            >
              <Trash2 size={18} strokeWidth={2} />
            </NoteIconButton>
          ) : null}
        </div>
      ) : null}
    </section>
  );
};
