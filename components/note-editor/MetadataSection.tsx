import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react';

interface MetadataSectionProps {
  id?: string;
  createdAt?: number;
  defaultOpen?: boolean;
  showDelete?: boolean;
  onDeleteNote?: () => void;
  onDismissOverlays?: () => void;
}

/** 「更多」：identity / lifecycle + 删除等次要操作 */
export const MetadataSection: React.FC<MetadataSectionProps> = ({
  id,
  createdAt,
  defaultOpen = false,
  showDelete,
  onDeleteNote,
  onDismissOverlays
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const hasMeta = !!(id || createdAt != null);
  if (!hasMeta && !(showDelete && onDeleteNote)) return null;

  return (
    <section className="shrink-0 border-t border-gray-400/50" aria-label="更多">
      <div className="px-4 py-2 flex items-center gap-2">
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
        {showDelete && onDeleteNote ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDismissOverlays?.();
              onDeleteNote();
            }}
            className="shrink-0 rounded-full p-2 min-h-9 min-w-9 inline-flex items-center justify-center text-gray-700 hover:text-red-600 hover:bg-red-50 active:scale-95 transition-colors border-0 cursor-pointer"
            title="删除便签"
          >
            <Trash2 size={20} strokeWidth={2} />
          </button>
        ) : null}
      </div>
      {hasMeta && open ? (
        <div className="px-4 pb-3 space-y-1.5 text-xs text-gray-500 font-mono">
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
        </div>
      ) : null}
    </section>
  );
};
